import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const migrationDir=join(root,'drizzle');
const migrations=readdirSync(migrationDir).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const sql=name=>readFileSync(join(migrationDir,name),'utf8');
const legacyCutoff='0017_pre_point10_lock.sql';
const foundation='0018_hr_foundation.sql';
const workspace='0019_organization_workspace_state.sql';
const integrity='0020_hr_tenant_integrity.sql';
const activation='0021_hr_relational_activation.sql';

let assertions=0;
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};

function applyMigrations(db,names){
  for(const name of names){
    db.exec('BEGIN');
    try{
      db.exec(sql(name));
      db.exec('COMMIT');
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function prefixThrough(name){
  const index=migrations.indexOf(name);
  assert.notEqual(index,-1,`migration absente : ${name}`);
  return migrations.slice(0,index+1);
}

function seedOwnerAndLegacyState(db){
  db.exec(`
    INSERT INTO organizations(id,name,created_at,updated_at)
    VALUES('org-upgrade','Organisation de test','2026-01-01','2026-01-01');
    INSERT INTO profiles(id,first_name,last_name,created_at,updated_at)
    VALUES('owner-upgrade','Test','Owner','2026-01-01','2026-01-01');
    INSERT INTO roles(id,organization_id,code,name,created_at)
    VALUES('role-owner-upgrade','org-upgrade','OWNER','Propriétaire','2026-01-01');
    INSERT INTO organization_members(
      id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at
    ) VALUES(
      'member-upgrade','org-upgrade','owner-upgrade','role-owner-upgrade',
      'active','2026-01-01','2026-01-01','2026-01-01'
    );
    INSERT INTO workspace_state(user_id,payload,revision,updated_at)
    VALUES('owner-upgrade','{"preserved":"legacy-snapshot"}',17,'2026-02-01');
  `);
}

function checkDatabase(db,label){
  equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,`${label}: FK actives`);
  equal(db.prepare('PRAGMA foreign_key_check').all().length,0,`${label}: aucune violation FK`);
  equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok',`${label}: intégrité SQLite`);
}

const chain21=prefixThrough(activation);
equal(chain21.length,22,'la chaîne attendue contient les 22 migrations 0000 à 0021');
equal(chain21[0],'0000_known_spot.sql','la migration initiale historique est préservée');
equal(chain21.at(-1),activation,'la migration finale du périmètre testé est 0021');

const temporaryDirectory=mkdtempSync(join(tmpdir(),'socle-migrations-'));
try{
  const databasePath=join(temporaryDirectory,'clean.sqlite');
  let db=new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE local_migrations(name TEXT PRIMARY KEY NOT NULL)');
  applyMigrations(db,chain21);
  for(const name of chain21){
    db.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
  }
  equal(db.prepare('SELECT COUNT(*) AS n FROM local_migrations').get().n,22,'installation neuve enregistre chaque migration une fois');
  equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='organization_workspace_state'").get().n,1,'installation neuve crée l’état organisationnel');
  checkDatabase(db,'installation neuve');
  db.close();

  db=new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys=ON');
  const pending=chain21.filter(name=>!db.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name));
  applyMigrations(db,pending);
  for(const name of pending)db.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
  equal(pending.length,0,'un second démarrage ne rejoue aucune migration');
  equal(db.prepare('SELECT COUNT(*) AS n FROM local_migrations').get().n,22,'le journal reste stable après redémarrage');
  checkDatabase(db,'redémarrage sans migration');
  db.close();

  for(const start of [legacyCutoff,foundation]){
    db=new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=ON');
    applyMigrations(db,prefixThrough(start));
    seedOwnerAndLegacyState(db);
    const appliedThrough=chain21.indexOf(start)+1;
    applyMigrations(db,chain21.slice(appliedThrough));
    equal(
      db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get('org-upgrade').payload,
      '{"preserved":"legacy-snapshot"}',
      `upgrade depuis ${start} conserve le workspace historique`
    );
    equal(
      db.prepare('SELECT payload FROM workspace_state WHERE user_id=?').get('owner-upgrade').payload,
      '{"preserved":"legacy-snapshot"}',
      `upgrade depuis ${start} conserve aussi la table historique`
    );
    checkDatabase(db,`upgrade depuis ${start}`);
    db.close();
  }

  db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  applyMigrations(db,prefixThrough(workspace));
  seedOwnerAndLegacyState(db);
  db.exec(`
    INSERT INTO organization_workspace_state(
      organization_id,payload,revision,source_user_id,created_at,updated_at
    ) VALUES(
      'org-upgrade','{"preserved":"organization-snapshot"}',23,
      'owner-upgrade','2026-03-01','2026-03-01'
    );
    INSERT INTO hr_people(organization_id,id,display_name,created_at,updated_at)
    VALUES('org-upgrade','person-upgrade','Personne conservée','2026-01-01','2026-01-01');
  `);
  applyMigrations(db,chain21.slice(chain21.indexOf(workspace)+1));
  equal(
    db.prepare('SELECT display_name FROM hr_people WHERE organization_id=? AND id=?').get('org-upgrade','person-upgrade').display_name,
    'Personne conservée',
    'upgrade depuis 0019 conserve la personne RH'
  );
  equal(
    db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get('org-upgrade').payload,
    '{"preserved":"organization-snapshot"}',
    'upgrade depuis 0019 conserve le workspace organisationnel'
  );
  checkDatabase(db,'upgrade depuis 0019');
  db.close();
}finally{
  rmSync(temporaryDirectory,{recursive:true,force:true});
}

console.log(`migrations-clean-upgrade-21: ${assertions} assertions réussies.`);
