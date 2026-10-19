import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backupConfig, createProductionBackup} from '../scripts/production-backup.mjs';

const root=await mkdtemp(join(tmpdir(),'socle-s3-restore-'));
const databasePath=join(root,'source.sqlite');
const database=new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode=WAL; CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT); INSERT INTO organizations VALUES('org','Example');");
const config=backupConfig({SOCLE_BACKUP_S3_ENDPOINT:'https://s3.example.test',SOCLE_BACKUP_S3_REGION:'us-east-1',SOCLE_BACKUP_S3_BUCKET:'test-bucket',SOCLE_BACKUP_S3_ACCESS_KEY_ID:'test-key',SOCLE_BACKUP_S3_SECRET_ACCESS_KEY:'test-secret',SOCLE_BACKUP_S3_URL_STYLE:'virtual-host'});
const nativeFetch=globalThis.fetch;
let uploaded=null;
globalThis.fetch=async(input,init={})=>{
  const url=new URL(input),method=init.method||'GET';
  if(method==='PUT'){uploaded=Buffer.from(init.body);return new Response('',{status:200});}
  if(method==='GET'&&!url.searchParams.has('list-type'))return new Response(uploaded,{status:200});
  if(method==='GET'&&url.searchParams.has('list-type'))return new Response('<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>',{status:200});
  if(method==='DELETE')return new Response('',{status:204});
  throw Error('Unexpected mocked S3 request: '+method+' '+url);
};
try{
  const result=await createProductionBackup({database,databasePath,config,logger:{log(){},error(){}}});
  assert.equal(result.integrity,'ok');
  assert.equal(result.count,1);
  assert.ok(uploaded&&uploaded.length>0,'un objet S3 a été déposé');
  database.close();
  const restoredPath=join(root,'restored-from-s3.sqlite');
  await writeFile(restoredPath,uploaded);
  const restored=new DatabaseSync(restoredPath,{readOnly:true});
  try{
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(restored.prepare('SELECT name FROM organizations WHERE id=?').get('org').name,'Example');
  }finally{restored.close();}
  console.log('production-backup-05: PASS objet S3 relu, integrity_check=ok, entreprise restaurée.');
}finally{
  try{database.close();}catch{}
  globalThis.fetch=nativeFetch;
  await rm(root,{recursive:true,force:true});
}
