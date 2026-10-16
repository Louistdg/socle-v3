import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {cpSync,mkdirSync,mkdtempSync,readdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openProductionDatabase} from '../scripts/production-db.mjs';

const temporaryRoot=realpathSync(tmpdir());
const directory=mkdtempSync(join(temporaryRoot,'socle-production-db-test-'));
const migrationsDirectory=join(directory,'migrations');
const databasePath=join(directory,'runtime','socle.sqlite');
const stamp='2026-10-01T10:00:00.000Z';
let runtime;

function migrationFixture(name,sql){
  const path=join(directory,name);
  mkdirSync(path);
  writeFileSync(join(path,'0000_requires_foreign_keys.sql'),sql);
  return path;
}

function messages(error){
  return [error?.message,error?.cause?messages(error.cause):''].filter(Boolean).join(' ');
}

try{
  cpSync(fileURLToPath(new URL('../drizzle/',import.meta.url)),migrationsDirectory,{recursive:true});
  const migrations=readdirSync(migrationsDirectory).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
  assert.ok(migrations.includes('0033_production_auth.sql'),'Le nouveau schéma auth doit rejoindre les migrations cumulatives.');
  runtime=openProductionDatabase({databasePath,migrationsDirectory});
  let {database,DB}=runtime;
  assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
  assert.equal(database.prepare('PRAGMA journal_mode').get().journal_mode,'wal');
  assert.equal(database.prepare('PRAGMA synchronous').get().synchronous,2);
  assert.equal(database.prepare('PRAGMA busy_timeout').get().timeout,5000);
  assert.deepEqual(database.prepare('SELECT name FROM local_migrations ORDER BY name').all().map(row=>row.name),migrations);
  assert.equal(database.prepare('SELECT COUNT(*) count FROM production_credentials').get().count,0,'Les migrations ne créent aucun compte privilégié.');
  assert.equal(database.prepare('SELECT COUNT(*) count FROM profiles').get().count,0,'Aucune identité de simulation ne doit être créée.');

  for(const suffix of ['a','b']){
    const owner='owner-'+suffix,organization='org-'+suffix;
    await DB.prepare('INSERT INTO profiles(id,email,created_at,updated_at) VALUES(?,?,?,?)').bind(owner,owner+'@example.invalid',stamp,stamp).run();
    await DB.prepare('INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)').bind(organization,'Entreprise '+suffix,stamp,stamp).run();
    await DB.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,1,?,?,?)').bind(organization,JSON.stringify({company:{name:'Entreprise '+suffix}}),owner,stamp,stamp).run();
    await DB.prepare("INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,'warehouse','active',?,?,?,?)").bind('warehouse-'+suffix,organization,'Dépôt '+suffix,owner,stamp,owner,stamp).run();
    await DB.prepare("INSERT INTO field_stock_items(id,organization_id,name,quantity,unit,created_by,created_at,updated_by,updated_at) VALUES('shared-item',?,?,0,'unité',?,?,?,?)").bind(organization,'Article '+suffix,owner,stamp,owner,stamp).run();
    await DB.prepare("INSERT INTO document_folders(id,organization_id,name,context_type,created_by,created_at,updated_at) VALUES(?,?,?,'company',?,?,?)").bind('folder-'+suffix,organization,'Documents '+suffix,owner,stamp,stamp).run();
  }

  const movement=DB.prepare('INSERT INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,reason,created_by,created_at,source_location_id,destination_location_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const incoming=(id,quantity)=>movement.bind(id,'org-a','shared-item','2026-10-01','entrée',quantity,'Réception test','owner-a',stamp,null,'warehouse-a');
  const outgoing=(id,quantity,location='warehouse-a')=>movement.bind(id,'org-a','shared-item','2026-10-01','perte',quantity,'Perte test','owner-a',stamp,location,null);
  const received=await incoming('receipt-initial',5).run();
  assert.equal(received.meta.changes,1,'Un mouvement compte une ligne directe, sans compter les projections de ses triggers.');
  assert.equal(await DB.prepare("SELECT quantity FROM stock_balances WHERE organization_id='org-a' AND stock_item_id='shared-item'").first('quantity'),5);
  assert.equal(await DB.prepare("SELECT quantity FROM field_stock_items WHERE organization_id='org-b' AND id='shared-item'").first('quantity'),0,'Le même ID article dans un autre tenant reste indépendant.');
  await assert.rejects(outgoing('foreign-location',1,'warehouse-b').run(),/stock_source_invalid/,'Un emplacement réel mais étranger doit être refusé.');

  const beforeRollback=database.prepare("SELECT * FROM stock_balances WHERE organization_id='org-a'").all();
  await assert.rejects(DB.batch([incoming('receipt-rolled-back',2),outgoing('loss-too-large',100)]),/stock_insufficient/);
  assert.equal(await DB.prepare("SELECT COUNT(*) count FROM field_stock_movements WHERE id IN ('receipt-rolled-back','loss-too-large','foreign-location')").first('count'),0);
  assert.deepEqual(database.prepare("SELECT * FROM stock_balances WHERE organization_id='org-a'").all(),beforeRollback,'Le rollback annule aussi les soldes modifiés par les triggers du premier mouvement.');
  assert.equal(await DB.prepare("SELECT quantity FROM field_stock_items WHERE organization_id='org-a' AND id='shared-item'").first('quantity'),5);

  const accepted=await DB.batch([
    incoming('receipt-committed',2),
    outgoing('loss-committed',1),
    DB.prepare("SELECT quantity FROM stock_balances WHERE organization_id='org-a' AND stock_item_id='shared-item'")
  ]);
  assert.deepEqual(accepted.map(result=>result.meta.changes),[1,1,0],'Les SELECT du batch doivent conserver changes=0 après une écriture.');
  assert.equal(accepted[2].results[0].quantity,6,'Une lecture dans le batch voit les mouvements précédents.');

  const document=DB.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,sensitivity,status,uploaded_by,created_at,updated_at) VALUES(?,?,?,?,'contrat.pdf','application/pdf',3,'confidential','available',?,?,?)");
  await document.bind('doc-a-1','org-a','folder-a','private/org-a/doc-a-1','owner-a',stamp,stamp).run();
  await document.bind('doc-a-2','org-a','folder-a','private/org-a/doc-a-2','owner-a',stamp,stamp).run();
  await assert.rejects(document.bind('doc-cross-tenant','org-a','folder-b','private/org-a/forbidden','owner-a',stamp,stamp).run(),/secure_document_folder_cross_tenant/);
  assert.equal(await DB.prepare("SELECT COUNT(*) count FROM secure_documents WHERE id='doc-cross-tenant'").first('count'),0);

  const upload=DB.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?) RETURNING document_id');
  const bytes=new Uint8Array([1,2,3]);
  const firstUpload=upload.bind('doc-a-1','org-a',bytes,stamp);
  const secondUpload=upload.bind('doc-a-2','org-a',new Uint8Array([4,5,6]).buffer,stamp);
  bytes.fill(9);
  const uploaded=await DB.batch([firstUpload,secondUpload]);
  assert.deepEqual(uploaded.map(result=>result.meta.changes),[1,1]);
  assert.deepEqual(uploaded.map(result=>result.results[0].document_id),['doc-a-1','doc-a-2'],'RETURNING doit conserver les résultats ordonnés sans réexécuter les INSERT.');
  assert.deepEqual((await DB.prepare('SELECT document_id,content FROM secure_document_blobs ORDER BY document_id').all()).results.map(row=>[row.document_id,[...row.content]]),[
    ['doc-a-1',[1,2,3]],['doc-a-2',[4,5,6]]
  ],'Chaque bind conserve ses paramètres et sa copie des octets, indépendamment des modifications ultérieures.');
  assert.equal(await DB.prepare("SELECT id FROM profiles WHERE id='absent'").first(),null);
  await assert.rejects(DB.prepare('SELECT 1 value').first('absent'),/Colonne SQL introuvable/);

  const updateWorkspace=DB.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,updated_at=? WHERE organization_id=? AND revision=?');
  const updatedPayload=JSON.stringify({company:{name:'Entreprise a mise à jour'}});
  assert.equal((await updateWorkspace.bind(updatedPayload,stamp,'org-a',1).run()).meta.changes,1);
  assert.equal((await updateWorkspace.bind('{}',stamp,'org-a',1).run()).meta.changes,0,'Un écran ayant une révision périmée ne peut écraser le workspace.');
  assert.equal(await DB.prepare("SELECT revision FROM organization_workspace_state WHERE organization_id='org-a'").first('revision'),2);
  assert.equal(await DB.prepare("SELECT revision FROM organization_workspace_state WHERE organization_id='org-b'").first('revision'),1);

  const preservedDocuments=database.prepare('SELECT * FROM secure_documents ORDER BY id').all();
  const preservedBlobs=database.prepare('SELECT * FROM secure_document_blobs ORDER BY document_id').all();
  runtime.close();
  runtime.close();
  runtime=null;

  // Une future migration non idempotente doit être appliquée une fois, puis
  // être retrouvée dans le registre lors des redémarrages suivants.
  const upgrade='0999_runtime_persistence_test.sql';
  writeFileSync(join(migrationsDirectory,upgrade),"CREATE TABLE runtime_upgrade_witness(id INTEGER PRIMARY KEY,value TEXT NOT NULL); INSERT INTO runtime_upgrade_witness VALUES(1,'applied once');");
  for(let restart=0;restart<2;restart++){
    runtime=openProductionDatabase({databasePath,migrationsDirectory});
    ({database,DB}=runtime);
    assert.deepEqual(database.prepare('SELECT name FROM local_migrations ORDER BY name').all().map(row=>row.name),[...migrations,upgrade].sort());
    assert.equal(await DB.prepare('SELECT value FROM runtime_upgrade_witness WHERE id=1').first('value'),'applied once');
    assert.deepEqual(database.prepare('SELECT * FROM secure_documents ORDER BY id').all(),preservedDocuments);
    assert.deepEqual(database.prepare('SELECT * FROM secure_document_blobs ORDER BY document_id').all(),preservedBlobs);
    assert.equal(await DB.prepare("SELECT payload FROM organization_workspace_state WHERE organization_id='org-a'").first('payload'),updatedPayload);
    assert.equal(await DB.prepare("SELECT quantity FROM stock_balances WHERE organization_id='org-a'").first('quantity'),6);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    runtime.close();
    runtime=null;
  }

  // Cette première migration ne contient aucun PRAGMA : une référence invalide
  // prouve que les FK sont déjà actives avant tout fichier de migration.
  const invalidDirectory=migrationFixture('invalid-first-migration',`CREATE TABLE parents(id INTEGER PRIMARY KEY);
    CREATE TABLE children(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES parents(id));
    INSERT INTO children VALUES(1,999);`);
  const invalidPath=join(directory,'invalid-first.sqlite');
  assert.throws(()=>openProductionDatabase({databasePath:invalidPath,migrationsDirectory:invalidDirectory}),error=>/FOREIGN KEY constraint failed/.test(messages(error)));
  const failedDatabase=new DatabaseSync(invalidPath,{readOnly:true});
  try{
    assert.equal(failedDatabase.prepare('SELECT COUNT(*) count FROM local_migrations').get().count,0);
    assert.equal(failedDatabase.prepare("SELECT COUNT(*) count FROM sqlite_master WHERE name='children'").get().count,0,'Une migration échouée ne laisse ni tables partielles ni entrée de registre.');
  }finally{failedDatabase.close();}

  const corruptPath=join(directory,'foreign-key-violation.sqlite');
  const corrupt=new DatabaseSync(corruptPath);
  try{
    corrupt.exec('PRAGMA foreign_keys=OFF; CREATE TABLE parents(id INTEGER PRIMARY KEY); CREATE TABLE children(parent_id INTEGER REFERENCES parents(id)); INSERT INTO children VALUES(99);');
  }finally{corrupt.close();}
  assert.throws(()=>openProductionDatabase({databasePath:corruptPath,migrationsDirectory}),/violation de clé étrangère/,'Une base déjà incohérente doit être refusée avant migration ou service.');
  const damagedPath=join(directory,'invalid-file.sqlite');
  writeFileSync(damagedPath,'not a SQLite database');
  assert.throws(()=>openProductionDatabase({databasePath:damagedPath,migrationsDirectory}),/not a database/);

  console.log('production-db-77: PASS migrations cumulatives + persistance + FK initiales + WAL + batches atomiques + tenant + BLOB/RETURNING + CAS');
}finally{
  runtime?.close();
  const actualDirectory=realpathSync(directory);
  assert.equal(dirname(actualDirectory),temporaryRoot,'Nettoyage limité au répertoire temporaire créé.');
  assert.match(basename(actualDirectory),/^socle-production-db-test-[^\\/]+$/);
  rmSync(actualDirectory,{recursive:true,force:true});
}
