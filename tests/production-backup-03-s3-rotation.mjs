import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backupConfig,createProductionBackup,parseS3ListPage,selectStaleBackupKeys} from '../scripts/production-backup.mjs';

const day='2026-10-17T00:00:';
const objects=Array.from({length:31},(_,i)=>({key:`daily/backup-${String(i).padStart(2,'0')}.sqlite`,lastModified:Date.parse(`${day}${String(i).padStart(2,'0')}.000Z`)}));
const newest=objects.at(-1).key;
const stale=selectStaleBackupKeys(objects,newest);
assert.deepEqual(stale,[objects[0].key]);
console.log(`ROTATION_31_KEYS=${stale.length} oldest=${stale[0]}`);

assert.deepEqual(selectStaleBackupKeys(objects.slice(1),newest),[]);
console.log('ROTATION_30_KEYS=0');
assert.deepEqual(selectStaleBackupKeys([],newest),[]);
console.log('ROTATION_0_KEYS=0 no_throw=true');

for(let count=1;count<=31;count++){
 const input=objects.slice(0,count);
 const protectedKeys=new Set([input.at(-1)?.key,newest].filter(Boolean));
 for(const order of [input,[...input].reverse()])assert.ok(selectStaleBackupKeys(order,input.at(-1)?.key).every(key=>!protectedKeys.has(key)),`newest key protected for ${count} entries`);
}
console.log('ROTATION_NEWEST_PROTECTED=true cases=31');

const xml=`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><EncodingType>url</EncodingType><IsTruncated>true</IsTruncated><NextContinuationToken>next&amp;page</NextContinuationToken><Contents><Key>daily%2Fbackup%20%26%20one.sqlite</Key><LastModified>2026-10-17T00:00:00.000Z</LastModified></Contents></ListBucketResult>`;
assert.deepEqual(parseS3ListPage(xml),{objects:[{key:'daily/backup & one.sqlite',lastModified:Date.parse('2026-10-17T00:00:00.000Z')}],nextToken:'next&page'});
assert.deepEqual(parseS3ListPage('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>'),{objects:[],nextToken:null});
assert.throws(()=>parseS3ListPage('<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>'),/NextContinuationToken/);
console.log('ROTATION_XML=PASS encoded key, escaped token, empty page, truncated-page validation');

const root=await mkdtemp(join(tmpdir(),'backup-s3-rotation-'));
const databasePath=join(root,'source.sqlite');
const database=new DatabaseSync(databasePath);
database.exec("CREATE TABLE organizations(id TEXT PRIMARY KEY); INSERT INTO organizations VALUES('org-1');");
const config=backupConfig({SOCLE_BACKUP_S3_ENDPOINT:'https://s3.example.test',SOCLE_BACKUP_S3_REGION:'us-east-1',SOCLE_BACKUP_S3_BUCKET:'test-bucket',SOCLE_BACKUP_S3_ACCESS_KEY_ID:'test-key',SOCLE_BACKUP_S3_SECRET_ACCESS_KEY:'test-secret',SOCLE_BACKUP_S3_URL_STYLE:'virtual-host'});
const nativeFetch=globalThis.fetch;

async function runScenario(cleanupFailure){
 const calls=[];const logs=[];let uploaded;let listPage=0;let currentKey;
 globalThis.fetch=async(input,init={})=>{
  const url=new URL(input);const method=init.method||'GET';calls.push(`${method}${url.searchParams.has('list-type')?':LIST':url.pathname}`);
  if(method==='PUT'){currentKey=url.pathname.slice(1);uploaded=Buffer.from(init.body);return new Response('',{status:200});}
  if(method==='GET'&&!url.searchParams.has('list-type'))return new Response(uploaded,{status:200});
  if(method==='GET'&&url.searchParams.has('list-type')){
   if(cleanupFailure==='list')return new Response('',{status:503});
   const all=[...objects.slice(0,30),{key:currentKey,lastModified:Date.parse('2026-10-18T00:00:00.000Z')}];
   const page=listPage++===0?all.slice(0,20):all.slice(20);
   const truncated=listPage===1;
   const token=truncated?'<NextContinuationToken>continue&amp;here</NextContinuationToken>':'';
   const entries=page.map(item=>`<Contents><Key>${encodeURIComponent(item.key)}</Key><LastModified>${new Date(item.lastModified).toISOString()}</LastModified></Contents>`).join('');
   return new Response(`<ListBucketResult><EncodingType>url</EncodingType><IsTruncated>${truncated}</IsTruncated>${token}${entries}</ListBucketResult>`,{status:200});
  }
  if(method==='DELETE')return new Response('',{status:cleanupFailure==='delete'?403:204});
  throw Error(`Unexpected mocked S3 request: ${method} ${url}`);
 };
 try{
  const result=await createProductionBackup({database,databasePath,config,logger:{log:line=>logs.push(line),error:(...parts)=>logs.push(parts.join(' '))},now:()=>new Date('2026-10-18T00:00:00.000Z')});
  assert.equal(result.integrity,'ok');assert.equal(result.count,1);
  const uploadIndex=calls.findIndex(call=>call.startsWith('PUT'));
  const rereadIndex=calls.findIndex((call,index)=>index>uploadIndex&&call.startsWith('GET'));
  const listIndex=calls.findIndex(call=>call==='GET:LIST');
  assert.ok(uploadIndex<rereadIndex&&rereadIndex<listIndex,'rotation must list only after upload and read-back');
  assert.ok(calls.some(call=>call==='GET:LIST'),'rotation must query the object list');
  if(cleanupFailure){
   assert.ok(logs.some(line=>line.includes('ÉCHEC NETTOYAGE SAUVEGARDE SQLite')),`${cleanupFailure} cleanup failure logged`);
   assert.ok(logs.some(line=>line.includes('Sauvegarde SQLite vérifiée et déposée')),`${cleanupFailure} verified backup still succeeds`);
   if(cleanupFailure==='list')assert.equal(listPage,0,'failed list response has no pages');
   else assert.equal(listPage,2,'successful paginated list follows continuation token');
   if(cleanupFailure==='delete')assert.ok(calls.some(call=>call==='DELETE/daily/backup-00.sqlite'));
  }else{
   assert.equal(listPage,2,'rotation must follow continuation tokens');
   const deletes=calls.filter(call=>call.startsWith('DELETE'));
   assert.deepEqual(deletes,['DELETE/daily/backup-00.sqlite']);
   assert.ok(!deletes.includes(`DELETE/${currentKey}`),'the new object must never be deleted');
  }
  return {calls,logs};
 }finally{globalThis.fetch=nativeFetch;}
}

try{
 const success=await runScenario(null);
 console.log(`ROTATION_IO_ORDER=${success.calls.filter(call=>call.startsWith('PUT')||call.startsWith('GET')||call.startsWith('DELETE')).map(call=>call==='GET:LIST'?'LIST':call.split('/')[0]).join(',')}`);
 console.log('ROTATION_STALE_DELETE=daily/backup-00.sqlite');
 await runScenario('list');console.log('ROTATION_LIST_FAILURE=logged; verified backup resolved');
 await runScenario('delete');console.log('ROTATION_DELETE_FAILURE=logged; verified backup resolved');
 console.log('production-backup-03-s3-rotation: PASS');
}finally{database.close();await rm(root,{recursive:true,force:true});globalThis.fetch=nativeFetch;}
