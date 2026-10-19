import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp, readdir, rm, mkdir, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backupConfig, createProductionBackup} from '../scripts/production-backup.mjs';

const root=await mkdtemp(join(tmpdir(),'socle-restore-'));
const volume=join(root,'volume');
const destination=join(root,'offsite');
await mkdir(volume);
const databasePath=join(volume,'socle-v3.sqlite');
const database=new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode=WAL; CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT); INSERT INTO organizations VALUES('org','Example');");
try{
  const config=backupConfig({SOCLE_BACKUP_DIRECTORY:destination});
  const result=await createProductionBackup({database,databasePath,config,logger:{log(){},error(){}}});
  assert.equal(result.integrity,'ok');
  assert.equal(result.count,1);
  database.close();
  const files=(await readdir(destination)).filter(name=>name.endsWith('.sqlite'));
  assert.equal(files.length,1,'une sauvegarde locale est disponible');
  const restoredPath=join(root,'restored.sqlite');
  await copyFile(join(destination,files[0]),restoredPath);
  const restored=new DatabaseSync(restoredPath,{readOnly:true});
  try{
    assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    assert.equal(restored.prepare('SELECT name FROM organizations WHERE id=?').get('org').name,'Example');
  }finally{restored.close();}
  console.log('production-backup-04: PASS copie locale, integrity_check=ok, une entreprise restaurée.');
}finally{
  try{database.close();}catch{}
  await rm(root,{recursive:true,force:true});
}
