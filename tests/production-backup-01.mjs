import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, readdir, rm, mkdir, chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {backupConfig,createProductionBackup} from '../scripts/production-backup.mjs';
const root=await mkdtemp(join(tmpdir(),'socle-backup-')),volume=join(root,'volume'),dest=join(root,'offsite');await mkdir(volume);const dbPath=join(volume,'socle-v3.sqlite');
const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT); INSERT INTO organizations VALUES('org','Example');`);
try{
 const cfg=backupConfig({SOCLE_BACKUP_DIRECTORY:dest});assert.equal(cfg.kind,'local');const logs=[];const logger={log:x=>logs.push(x),error:(...x)=>logs.push(x.join(' '))};
 cfg.retention=2;const a=await createProductionBackup({database:db,databasePath:dbPath,config:cfg,logger});const b=await createProductionBackup({database:db,databasePath:dbPath,config:cfg,logger});assert.equal(a.integrity,'ok');assert.equal(b.integrity,'ok');assert.equal(a.count,1);assert.equal((await readdir(dest)).filter(x=>x.endsWith('.sqlite')).length,2);await createProductionBackup({database:db,databasePath:dbPath,config:cfg,logger});assert.equal((await readdir(dest)).filter(x=>x.endsWith('.sqlite')).length,2);
 const failDir=join(root,'not-directory');await import('node:fs/promises').then(fs=>fs.writeFile(failDir,'x'));await assert.rejects(createProductionBackup({database:db,databasePath:dbPath,config:{kind:'local',directory:join(failDir,'child')},logger}));
 assert.throws(()=>backupConfig({SOCLE_BACKUP_S3_ENDPOINT:'https://s3.example'}),/configuration S3 incomplète/);
 const ro=join(root,'readonly');await mkdir(ro);await chmod(ro,0o444);if(process.platform!=='win32')await assert.rejects(createProductionBackup({database:db,databasePath:dbPath,config:{kind:'local',directory:ro},logger}));await chmod(ro,0o755);
 assert.ok(logs.some(x=>x.includes('ÉCHEC SAUVEGARDE SQLite')));console.log('production-backup-01: PASS 2 générations, integrity_check=ok, organizations=1; erreurs destination/permissions/config signalées.');
}finally{db.close();await rm(root,{recursive:true,force:true});}


