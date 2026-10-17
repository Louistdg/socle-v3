import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {backupConfig} from '../scripts/production-backup.mjs';
import {startProduction} from '../scripts/production.mjs';

const directory=await mkdtemp(join(tmpdir(),'backup-start-safe-'));
const volume=join(directory,'volume');await mkdir(volume);
const logger={lines:[],log(line){this.lines.push(line)},error(...parts){this.lines.push(parts.join(' '))}};
async function port(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const n=s.address().port;await new Promise(r=>s.close(r));return n;}
const baseEnv={SOCLE_PUBLIC_URL:'https://backup.test',SOCLE_SESSION_SECRET:randomBytes(32).toString('base64url'),SOCLE_DATA_DIR:volume};
const s3={SOCLE_BACKUP_S3_ENDPOINT:'https://127.0.0.1:1',SOCLE_BACKUP_S3_REGION:'us-east-1',SOCLE_BACKUP_S3_BUCKET:'test-bucket',SOCLE_BACKUP_S3_ACCESS_KEY_ID:'test-key',SOCLE_BACKUP_S3_SECRET_ACCESS_KEY:'test-secret',SOCLE_BACKUP_S3_URL_STYLE:'virtual-host'};
const mode=process.argv[2]||'both';
let runtime;
try{
 assert.equal(backupConfig(s3).style,'virtual');
 if(mode==='invalid'||mode==='both'){
  runtime=await startProduction({env:{...baseEnv,PORT:String(await port()),...s3,SOCLE_BACKUP_S3_URL_STYLE:'nawak'},logger});
  const health=(await fetch(`http://127.0.0.1:${runtime.server.address().port}/health`)).status;assert.equal(health,200);
  const failure=logger.lines.find(x=>x.includes('ÉCHEC SAUVEGARDE SQLite')&&x.includes('configuration refusée'));assert.ok(failure);
  console.log('INVALID_CONFIG_LOG='+failure);console.log('INVALID_CONFIG_HEALTH='+health);
  await runtime.close();runtime=null;logger.lines.length=0;
 }
 if(mode==='unreachable'||mode==='both'){
  runtime=await startProduction({env:{...baseEnv,PORT:String(await port()),...s3},logger});
  const healthBefore=(await fetch(`http://127.0.0.1:${runtime.server.address().port}/health`)).status;assert.equal(healthBefore,200);
  const until=Date.now()+5000;while(Date.now()<until&&!logger.lines.some(x=>x.includes('ÉCHEC SAUVEGARDE SQLite — copie non garantie')))await new Promise(r=>setTimeout(r,25));
  const failure=logger.lines.find(x=>x.includes('ÉCHEC SAUVEGARDE SQLite — copie non garantie'));assert.ok(failure,'S3 unreachable is reported');
  const healthAfter=(await fetch(`http://127.0.0.1:${runtime.server.address().port}/health`)).status;assert.equal(healthAfter,200);
  console.log('UNREACHABLE_LOG='+failure);console.log(`UNREACHABLE_HEALTH_BEFORE=${healthBefore} AFTER=${healthAfter}`);
 }
 console.log(`production-backup-02-startup-safe-style (${mode}): PASS; virtual-host accepted.`);
}finally{if(runtime)await runtime.close();await rm(directory,{recursive:true,force:true});}
