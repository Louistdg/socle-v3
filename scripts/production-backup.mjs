import {backup,DatabaseSync} from 'node:sqlite';
import {createHash,createHmac,randomUUID} from 'node:crypto';
import {mkdir,readdir,rename,rm,stat,readFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';

const KEYS=['SOCLE_BACKUP_S3_ENDPOINT','SOCLE_BACKUP_S3_REGION','SOCLE_BACKUP_S3_BUCKET','SOCLE_BACKUP_S3_ACCESS_KEY_ID','SOCLE_BACKUP_S3_SECRET_ACCESS_KEY','SOCLE_BACKUP_S3_URL_STYLE'];
export function backupConfig(env=process.env){
  const local=env.SOCLE_BACKUP_DIRECTORY;
  if(local)return {kind:'local',directory:resolve(local),retention:30};
  const provided=KEYS.filter(k=>env[k]);
  if(!provided.length)return null;
  if(provided.length!==KEYS.length)throw Error('Sauvegarde: configuration S3 incomplète; vérifier les variables SOCLE_BACKUP_S3_* (valeurs masquées).');
  const endpoint=new URL(env.SOCLE_BACKUP_S3_ENDPOINT);
  if(endpoint.protocol!=='https:'||!['path','virtual'].includes(env.SOCLE_BACKUP_S3_URL_STYLE))throw Error('Sauvegarde: endpoint HTTPS ou URL_STYLE invalide.');
  return {kind:'s3',endpoint,region:env.SOCLE_BACKUP_S3_REGION,bucket:env.SOCLE_BACKUP_S3_BUCKET,access:env.SOCLE_BACKUP_S3_ACCESS_KEY_ID,secret:env.SOCLE_BACKUP_S3_SECRET_ACCESS_KEY,style:env.SOCLE_BACKUP_S3_URL_STYLE,retention:30};
}
const h=(key,data,encoding)=>createHmac('sha256',key).update(data).digest(encoding);
function s3Url(c,key='',query={}){const u=new URL(c.endpoint);if(c.style==='path')u.pathname=`/${c.bucket}${key?'/'+key:''}`;else{u.hostname=`${c.bucket}.${u.hostname}`;u.pathname=key?`/${key}`:'/';}for(const [k,v] of Object.entries(query))u.searchParams.set(k,v);return u;}
async function s3Request(c,method,key='',body=Buffer.alloc(0),query={}){
 const u=s3Url(c,key,query),date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),payload=createHash('sha256').update(body).digest('hex');
 const headers={'host':u.host,'x-amz-content-sha256':payload,'x-amz-date':date};const signed=Object.keys(headers).sort().join(';'),canonicalQuery=[...u.searchParams.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');const canonical=`${method}\n${u.pathname}\n${canonicalQuery}\n${Object.keys(headers).sort().map(k=>`${k}:${headers[k]}\n`).join('')}\n${signed}\n${payload}`;
 const scope=`${day}/${c.region}/s3/aws4_request`,toSign=`AWS4-HMAC-SHA256\n${date}\n${scope}\n${createHash('sha256').update(canonical).digest('hex')}`,k=h(h(h(h('AWS4'+c.secret,day),c.region),'s3'),'aws4_request');headers.authorization=`AWS4-HMAC-SHA256 Credential=${c.access}/${scope}, SignedHeaders=${signed}, Signature=${h(k,toSign,'hex')}`;
 const res=await fetch(u,{method,headers,body:method==='GET'||method==='DELETE'?undefined:body,signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error(`Sauvegarde: requête objet refusée (HTTP ${res.status}).`);return res;
}
async function putS3(c,key,bytes){
 await s3Request(c,'PUT',key,bytes);const downloaded=Buffer.from(await (await s3Request(c,'GET',key)).arrayBuffer());if(!downloaded.equals(bytes))throw Error('Sauvegarde: relecture du bucket différente de la copie vérifiée.');
 const list=await (await s3Request(c,'GET','',Buffer.alloc(0),{'list-type':'2',prefix:'daily/'})).text();const keys=[...list.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m=>m[1]).sort().reverse();for(const old of keys.slice(c.retention))await s3Request(c,'DELETE',old);
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
  await putS3(config,key,bytes);logger.log(`Sauvegarde SQLite vérifiée et déposée dans le bucket, objet=${key}, ${bytes.length} octets, organizations=${before.count}.`);return {name,size:bytes.length,...before};
 }catch(error){logger.error('ÉCHEC SAUVEGARDE SQLite — copie non garantie:',error.message);throw error;}finally{if(temp)await rm(temp,{force:true}).catch(()=>{});}
}

