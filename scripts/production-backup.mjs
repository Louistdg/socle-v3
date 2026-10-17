import {backup,DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {mkdir,readdir,rename,rm,readFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';

const KEYS=['SOCLE_BACKUP_S3_ENDPOINT','SOCLE_BACKUP_S3_REGION','SOCLE_BACKUP_S3_BUCKET','SOCLE_BACKUP_S3_ACCESS_KEY_ID','SOCLE_BACKUP_S3_SECRET_ACCESS_KEY','SOCLE_BACKUP_S3_URL_STYLE'];
const BACKUP_RETENTION=30;
// Les trois écritures réellement en usage; `virtual` et `virtual-host` désignent le même adressage.
const STYLES={path:'path',virtual:'virtual','virtual-host':'virtual'};
export function backupConfig(env=process.env){
  const local=env.SOCLE_BACKUP_DIRECTORY;
  if(local)return {kind:'local',directory:resolve(local),retention:BACKUP_RETENTION};
  const provided=KEYS.filter(k=>env[k]);
  if(!provided.length)return null;
  if(provided.length!==KEYS.length)throw Error('Sauvegarde: configuration S3 incomplète; vérifier les variables SOCLE_BACKUP_S3_* (valeurs masquées).');
  const endpoint=new URL(env.SOCLE_BACKUP_S3_ENDPOINT);
  const style=STYLES[String(env.SOCLE_BACKUP_S3_URL_STYLE||'').trim().toLowerCase()];
  if(endpoint.protocol!=='https:'||!style)throw Error('Sauvegarde: endpoint HTTPS ou URL_STYLE invalide (attendu: path, virtual, virtual-host).');
  return {kind:'s3',endpoint,region:env.SOCLE_BACKUP_S3_REGION,bucket:env.SOCLE_BACKUP_S3_BUCKET,access:env.SOCLE_BACKUP_S3_ACCESS_KEY_ID,secret:env.SOCLE_BACKUP_S3_SECRET_ACCESS_KEY,style,retention:BACKUP_RETENTION};
}
const h=(key,data,encoding)=>createHmac('sha256',key).update(data).digest(encoding);
function s3Url(c,key='',query={}){const u=new URL(c.endpoint);if(c.style==='path')u.pathname=`/${c.bucket}${key?'/'+key:''}`;else{u.hostname=`${c.bucket}.${u.hostname}`;u.pathname=key?`/${key}`:'/';}for(const [k,v] of Object.entries(query))u.searchParams.set(k,v);return u;}
async function s3Request(c,method,key='',body=Buffer.alloc(0),query={}){
 const u=s3Url(c,key,query);
 const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,'');
 const day=date.slice(0,8);
 const payload=createHash('sha256').update(body).digest('hex');
 const headers={host:u.host,'x-amz-content-sha256':payload,'x-amz-date':date};
 const signed=Object.keys(headers).sort().join(';');
 const queryParts=[...u.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b));
 const canonicalQuery=queryParts.map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
 const canonicalHeaders=Object.keys(headers).sort().map(k=>`${k}:${headers[k]}\n`).join('');
 const canonical=[method,u.pathname,canonicalQuery,canonicalHeaders,signed,payload].join('\n');
 const scope=`${day}/${c.region}/s3/aws4_request`;
 const digest=createHash('sha256').update(canonical).digest('hex');
 const toSign=`AWS4-HMAC-SHA256\n${date}\n${scope}\n${digest}`;
 const signingKey=h(h(h(h('AWS4'+c.secret,day),c.region),'s3'),'aws4_request');
 const signature=h(signingKey,toSign,'hex');
 headers.authorization=`AWS4-HMAC-SHA256 Credential=${c.access}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
 const sendsBody=method!=='GET'&&method!=='DELETE';
 const res=await fetch(u,{method,headers,body:sendsBody?body:undefined,signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw Error(`Sauvegarde: requête objet refusée (HTTP ${res.status}).`);
 return res;
}
async function putS3(c,key,bytes){
 await s3Request(c,'PUT',key,bytes);const downloaded=Buffer.from(await (await s3Request(c,'GET',key)).arrayBuffer());if(!downloaded.equals(bytes))throw Error('Sauvegarde: relecture du bucket différente de la copie vérifiée.');
}
function decodeXmlText(value){
 if(/&(?!(?:#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);)/i.test(value)){
  throw Error('Sauvegarde: entité XML invalide dans la liste S3.');
 }
 return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity)=>{
  const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
  if(named[entity])return named[entity];
  const code=entity[1]?.toLowerCase()==='x'?Number.parseInt(entity.slice(2),16):Number.parseInt(entity.slice(1),10);
  if(!Number.isInteger(code)||code<0||code>0x10ffff||(code>=0xd800&&code<=0xdfff)){
   throw Error('Sauvegarde: caractère XML invalide dans la liste S3.');
  }
  return String.fromCodePoint(code);
 });
}
function xmlTag(xml,name,required=false){
 const match=xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
 if(!match){
  if(required)throw Error(`Sauvegarde: champ XML ${name} absent de la liste S3.`);
  return null;
 }
 return decodeXmlText(match[1]);
}
export function parseS3ListPage(xml){
 if(!/<ListBucketResult(?:\s[^>]*)?>[\s\S]*<\/ListBucketResult>/.test(xml)){
  throw Error('Sauvegarde: réponse XML de liste S3 invalide.');
 }
 const encoding=xmlTag(xml,'EncodingType');
 const objects=[...xml.matchAll(/<Contents(?:\s[^>]*)?>([\s\S]*?)<\/Contents>/g)].map(([,contents])=>{
  const encodedKey=xmlTag(contents,'Key',true);
  const key=encoding==='url'?decodeURIComponent(encodedKey):encodedKey;
  const lastModified=Date.parse(xmlTag(contents,'LastModified',true));
  if(!key.startsWith('daily/')||!Number.isFinite(lastModified)){
   throw Error('Sauvegarde: entrée invalide dans la liste S3.');
  }
  return {key,lastModified};
 });
 const truncated=xmlTag(xml,'IsTruncated',true);
 if(truncated!=='true'&&truncated!=='false'){
  throw Error('Sauvegarde: indicateur de pagination S3 invalide.');
 }
 const nextToken=truncated==='true'?xmlTag(xml,'NextContinuationToken',true):null;
 if(truncated==='true'&&!nextToken){
  throw Error('Sauvegarde: continuation token absent de la liste S3.');
 }
 return {objects,nextToken};
}
export function selectStaleBackupKeys(objects,newestKey,retention=BACKUP_RETENTION){
 if(!Number.isInteger(retention)||retention<1){
  throw new RangeError('La rétention doit garder au moins une génération.');
 }
 const ordered=objects.filter(object=>object.key.startsWith('daily/')).sort((a,b)=>b.lastModified-a.lastModified||b.key.localeCompare(a.key));
 const keep=new Set([ordered[0]?.key,newestKey].filter(Boolean));
 for(const object of ordered){if(keep.size>=retention)break;keep.add(object.key);}
 return ordered.filter(object=>!keep.has(object.key)).map(object=>object.key);
}
async function listS3Objects(c){
 const objects=[];let continuationToken=null;
 do{
  const query={'list-type':'2',prefix:'daily/','encoding-type':'url'};
  if(continuationToken)query['continuation-token']=continuationToken;
  const response=await s3Request(c,'GET','',Buffer.alloc(0),query);
  const page=parseS3ListPage(await response.text());
  objects.push(...page.objects);
  continuationToken=page.nextToken;
 }while(continuationToken);
 return objects;
}
async function rotateS3(c,newestKey,logger){
 try{
  const objects=await listS3Objects(c);
  if(!objects.some(object=>object.key===newestKey)){
   throw Error('nouvelle copie absente de la liste; suppressions ignorées.');
  }
  for(const key of selectStaleBackupKeys(objects,newestKey,c.retention)){
   try{
    await s3Request(c,'DELETE',key);
    logger.log(`Ancienne sauvegarde supprimée du bucket: ${key}.`);
   }catch(error){
    logger.error('ÉCHEC NETTOYAGE SAUVEGARDE SQLite — suppression ignorée:',key,error.message);
   }
  }
 }catch(error){
  logger.error('ÉCHEC NETTOYAGE SAUVEGARDE SQLite — copies conservées:',error.message);
 }
}
async function verify(path){const db=new DatabaseSync(path,{readOnly:true});try{const integrity=db.prepare('PRAGMA integrity_check').get()?.integrity_check;if(integrity!=='ok')throw Error('Sauvegarde: integrity_check échoué.');const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'").get();if(!tables)throw Error('Sauvegarde: lecture de la table organizations impossible.');const count=db.prepare('SELECT COUNT(*) AS n FROM organizations').get().n;return {integrity,count};}finally{db.close();}}
export async function createProductionBackup({database,databasePath,config,logger=console,now=()=>new Date()}){
 const stamp=now().toISOString().replace(/[:.]/g,'-'),name=`socle-${stamp}-${randomUUID()}.sqlite`,key=`daily/${name}`;
 let temp;
 try{
  if(config.kind==='local')await mkdir(config.directory,{recursive:true});
  temp=join(config.kind==='local'?config.directory:join(dirname(databasePath),'.backups'),`.${name}.partial`);
  await mkdir(dirname(temp),{recursive:true});
  await backup(database,temp);const before=await verify(temp);const bytes=await readFile(temp);for(const suffix of ['-wal','-shm','-journal'])await rm(temp+suffix,{force:true});
  if(config.kind==='local'){const dest=join(config.directory,name);await rename(temp,dest);temp=null;const after=await verify(dest);if(after.integrity!=='ok'||after.count!==before.count)throw Error('Sauvegarde: relecture après dépôt différente.');
   const files=(await readdir(config.directory)).filter(x=>/^socle-.*\.sqlite$/.test(x)).sort().reverse();for(const old of files.slice(config.retention))await rm(join(config.directory,old),{force:true});
   logger.log(`Sauvegarde SQLite vérifiée: ${name}, ${bytes.length} octets, organizations=${after.count}, rétention=${config.retention} générations.`);return {name,size:bytes.length,...after};
  }
  await putS3(config,key,bytes);await rotateS3(config,key,logger);logger.log(`Sauvegarde SQLite vérifiée et déposée dans le bucket, objet=${key}, ${bytes.length} octets, organizations=${before.count}.`);return {name,size:bytes.length,...before};
 }catch(error){logger.error('ÉCHEC SAUVEGARDE SQLite — copie non garantie:',error.message);throw error;}finally{if(temp)await rm(temp,{force:true}).catch(()=>{});}
}
