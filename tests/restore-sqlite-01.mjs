import assert from 'node:assert/strict';
import {backup,DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,mkdtempSync,rmSync,truncateSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const directory=mkdtempSync(join(tmpdir(),'socle-restore-sqlite-'));
const originalPath=join(directory,'original.sqlite');
const backupPath=join(directory,'backup.sqlite');
const restoredPath=join(directory,'restored.sqlite');
const truncatedPath=join(directory,'truncated.sqlite');
const truncatedOutputPath=join(directory,'truncated-restored.sqlite');
const emptyPath=join(directory,'empty.sqlite');
const emptyOutputPath=join(directory,'empty-restored.sqlite');
const restoreScript=fileURLToPath(new URL('../scripts/restore-sqlite.mjs',import.meta.url));

function snapshot(path){
  const database=new DatabaseSync(path,{readOnly:true});
  try{
    const integrity=database.prepare('PRAGMA integrity_check').all().map(row=>row.integrity_check);
    const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    const counts=Object.fromEntries(tables.map(name=>{
      const statement=database.prepare('SELECT COUNT(*) AS count FROM "'+name.replaceAll('"','""')+'"');
      statement.setReadBigInts(true);
      return [name,String(statement.get().count)];
    }));
    const organization=database.prepare('SELECT id,name FROM organizations ORDER BY id LIMIT 1').get();
    return {integrity,tables,counts,organization};
  }finally{database.close()}
}

try{
  const original=new DatabaseSync(originalPath);
  try{
    original.exec(`
      CREATE TABLE local_migrations(name TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE organizations(id TEXT PRIMARY KEY NOT NULL,name TEXT NOT NULL);
      CREATE TABLE organization_workspace_state(organization_id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL);
      CREATE TABLE invoices(id TEXT PRIMARY KEY NOT NULL,organization_id TEXT NOT NULL,amount_cents INTEGER NOT NULL);
      INSERT INTO local_migrations VALUES('0001_core'),('0002_invoices');
      INSERT INTO organizations VALUES('org-1','Entreprise Exemple');
      INSERT INTO organization_workspace_state VALUES('org-1','{"company":{"name":"Entreprise Exemple"}}');
      INSERT INTO invoices VALUES('invoice-1','org-1',12800),('invoice-2','org-1',9900);
    `);
    await backup(original,backupPath);
  }finally{original.close()}

  const result=spawnSync(process.execPath,['--experimental-sqlite',restoreScript,backupPath,restoredPath],{encoding:'utf8',windowsHide:true});
  assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
  assert.match(result.stdout,/RESTORE_SQLITE=PASS/);
  assert.match(result.stdout,/SOURCE_TABLES=4 RESTORED_TABLES=4/);
  assert.match(result.stdout,/TABLE_ROW_COUNTS=/);
  assert.match(result.stdout,/SOURCE_ROWS=6 RESTORED_ROWS=6/);
  assert.match(result.stdout,/INTEGRITY_SOURCE=ok INTEGRITY_RESTORED=ok/);

  const originalSnapshot=snapshot(originalPath),backupSnapshot=snapshot(backupPath),restoredSnapshot=snapshot(restoredPath);
  assert.deepEqual(backupSnapshot,originalSnapshot,'La copie de test reflète la base originale.');
  assert.deepEqual(restoredSnapshot,originalSnapshot,'La base restaurée conserve tables, lignes, intégrité et lecture métier.');

  copyFileSync(backupPath,truncatedPath);
  truncateSync(truncatedPath,128);
  const truncated=spawnSync(process.execPath,['--experimental-sqlite',restoreScript,truncatedPath,truncatedOutputPath],{encoding:'utf8',windowsHide:true});
  assert.notEqual(truncated.status,0,'Une copie tronquée ne doit jamais être acceptée.');
  assert.match(truncated.stderr,/RESTORE_SQLITE=FAIL/);
  assert.ok(!existsSync(truncatedOutputPath),'Aucune sortie restaurée ne reste après le rejet du fichier tronqué.');
  console.log('TRUNCATED_COPY_RAW_STDERR_START');
  console.log(truncated.stderr.trimEnd());
  console.log('TRUNCATED_COPY_RAW_STDERR_END');

  const empty=new DatabaseSync(emptyPath);
  empty.close();
  const emptyResult=spawnSync(process.execPath,['--experimental-sqlite',restoreScript,emptyPath,emptyOutputPath],{encoding:'utf8',windowsHide:true});
  assert.notEqual(emptyResult.status,0,'Une base SQLite vide et valide ne doit pas être prise pour une restauration réussie.');
  assert.match(emptyResult.stderr,/tables métier manquantes/);
  assert.ok(!existsSync(emptyOutputPath),'Aucune sortie vide ne reste après le rejet.');

  console.log('restore-sqlite-01: PASS — tables=4 lignes=6 integrity_check=ok lecture organizations identique ; fichier tronqué et base vide rejetés.');
}finally{
  rmSync(directory,{recursive:true,force:true});
}
