import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const migration=name=>readFileSync(join(root,'drizzle',name),'utf8');
const m0018=migration('0018_hr_foundation.sql');
const m0020=migration('0020_hr_tenant_integrity.sql');
const m0021=migration('0021_hr_relational_activation.sql');

let assertions=0;
const ok=(value,message)=>{assert.ok(value,message);assertions++};
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const sqlThrows=(db,sql,pattern,message)=>{
  assert.throws(()=>db.exec(sql),pattern,message);
  assertions++;
};

function schemaBefore0018(){
  const db=new DatabaseSync(':memory:');
  equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,'node:sqlite doit ouvrir la DB avec les FK actives');
  db.exec(`
    CREATE TABLE organizations(id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE permissions(code TEXT PRIMARY KEY NOT NULL,description TEXT);
  `);
  db.exec(m0018);
  return db;
}

function seedOrganizations(db){
  db.exec("INSERT INTO organizations(id) VALUES ('org-a'),('org-b')");
}

{
  const db=schemaBefore0018();
  seedOrganizations(db);
  db.exec(m0020);

  db.exec(`
    INSERT INTO hr_people(organization_id,id,display_name,created_at,updated_at)
    VALUES
      ('org-a','same-id','Alice A','2026-01-01','2026-01-01'),
      ('org-b','same-id','Bob B','2026-01-01','2026-01-01'),
      ('org-a','person-a','Person A','2026-01-01','2026-01-01'),
      ('org-b','person-b','Person B','2026-01-01','2026-01-01');
  `);
  equal(
    db.prepare("SELECT COUNT(*) AS n FROM hr_people WHERE id='same-id'").get().n,
    2,
    '0020 doit permettre le même id local dans deux organisations'
  );

  sqlThrows(
    db,
    "INSERT INTO employment_records(organization_id,id,person_id,created_at,updated_at) VALUES('org-a','cross-tenant','person-b','2026-01-01','2026-01-01')",
    /FOREIGN KEY/i,
    'une référence RH cross-tenant doit être refusée'
  );

  sqlThrows(
    db,
    "INSERT INTO employment_records(organization_id,id,person_id,weekly_hours,created_at,updated_at) VALUES('org-a','weekly-neg','person-a',-1,'2026-01-01','2026-01-01')",
    /CHECK/i,
    'weekly_hours négatif doit être refusé'
  );
  sqlThrows(
    db,
    "INSERT INTO employment_records(organization_id,id,person_id,weekly_hours,created_at,updated_at) VALUES('org-a','weekly-over','person-a',169,'2026-01-01','2026-01-01')",
    /CHECK/i,
    'weekly_hours > 168 doit être refusé'
  );
  db.exec("INSERT INTO employment_records(organization_id,id,person_id,weekly_hours,created_at,updated_at) VALUES('org-a','weekly-min','person-a',0,'2026-01-01','2026-01-01')");
  db.exec("INSERT INTO employment_records(organization_id,id,person_id,weekly_hours,created_at,updated_at) VALUES('org-a','weekly-max','person-a',168,'2026-01-01','2026-01-01')");
  equal(
    db.prepare("SELECT COUNT(*) AS n FROM employment_records WHERE id IN ('weekly-min','weekly-max')").get().n,
    2,
    'les bornes 0 et 168 heures doivent être acceptées'
  );

  sqlThrows(
    db,
    "INSERT INTO employment_records(organization_id,id,person_id,gross_hourly_cents,created_at,updated_at) VALUES('org-a','gross-neg','person-a',-1,'2026-01-01','2026-01-01')",
    /CHECK/i,
    'gross_hourly_cents négatif doit être refusé'
  );

  db.exec("INSERT INTO hr_teams(organization_id,id,name,created_at,updated_at) VALUES('org-a','team-a','Équipe A','2026-01-01','2026-01-01')");
  db.exec("INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,created_at,updated_at) VALUES('org-a','membership-1','team-a','person-a',NULL,'2026-01-01','2026-01-01')");
  sqlThrows(
    db,
    "INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,created_at,updated_at) VALUES('org-a','membership-2','team-a','person-a',NULL,'2026-01-01','2026-01-01')",
    /UNIQUE/i,
    'deux appartenances ouvertes avec starts_on NULL doivent être refusées'
  );
  sqlThrows(
    db,
    "INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,created_at,updated_at) VALUES('org-a','membership-3','team-a','person-a','','2026-01-01','2026-01-01')",
    /UNIQUE/i,
    'COALESCE doit empêcher le contournement NULL / chaîne vide'
  );

  equal(
    db.prepare("SELECT COUNT(*) AS n FROM permissions WHERE code IN ('hr.records.view','hr.records.manage')").get().n,
    2,
    '0020 doit créer les deux permissions RH relationnelles'
  );

  db.exec(`
    CREATE TABLE roles(id TEXT PRIMARY KEY NOT NULL,code TEXT NOT NULL);
    CREATE TABLE role_permissions(
      role_id TEXT NOT NULL,
      permission_code TEXT NOT NULL,
      PRIMARY KEY(role_id,permission_code),
      FOREIGN KEY(role_id) REFERENCES roles(id),
      FOREIGN KEY(permission_code) REFERENCES permissions(code)
    );
    INSERT OR IGNORE INTO permissions(code,description) VALUES('hr.sensitive.view','Legacy RH sensible');
    INSERT INTO roles(id,code) VALUES('role-owner','OWNER'),('role-worker','WORKER'),('role-accountant','ACCOUNTING');
    INSERT INTO role_permissions(role_id,permission_code) VALUES('role-accountant','hr.sensitive.view');
  `);
  db.exec(m0021);

  equal(
    db.prepare("SELECT COUNT(*) AS n FROM role_permissions WHERE role_id='role-accountant' AND permission_code='hr.records.view'").get().n,
    1,
    '0021 doit propager hr.records.view au rôle ayant déjà hr.sensitive.view'
  );
  equal(
    db.prepare("SELECT COUNT(*) AS n FROM role_permissions WHERE role_id='role-worker' AND permission_code='hr.records.view'").get().n,
    0,
    '0021 ne doit pas donner hr.records.view à un ouvrier non autorisé'
  );
  equal(
    db.prepare("SELECT COUNT(*) AS n FROM role_permissions WHERE role_id='role-owner' AND permission_code='hr.records.view'").get().n,
    0,
    '0021 ne doit pas ajouter artificiellement hr.records.view à OWNER'
  );
  equal(
    db.prepare("SELECT COUNT(*) AS n FROM role_permissions WHERE permission_code='hr.records.manage'").get().n,
    0,
    '0021 ne doit accorder hr.records.manage à aucun rôle automatiquement'
  );

  equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'foreign_key_check doit être vide après migration saine');
  equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity_check doit être ok');
  db.close();
}

{
  const db=schemaBefore0018();
  seedOrganizations(db);

  db.exec('PRAGMA foreign_keys = OFF');
  equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,0,'le scénario de corruption doit désactiver explicitement les FK');
  db.exec(`
    INSERT INTO hr_people(id,organization_id,display_name,created_at,updated_at)
    VALUES('person-b','org-b','Person B','2026-01-01','2026-01-01');
    INSERT INTO employment_records(id,organization_id,person_id,created_at,updated_at)
    VALUES('legacy-cross-tenant','org-a','person-b','2026-01-01','2026-01-01');
  `);
  db.exec('PRAGMA foreign_keys = ON');
  equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,'les FK doivent être réactivées avant 0020');

  let failed=false;
  db.exec('BEGIN');
  try{
    db.exec(m0020);
    db.exec('COMMIT');
  }catch(error){
    failed=true;
    db.exec('ROLLBACK');
    ok(/FOREIGN KEY/i.test(String(error?.message||error)),'0020 doit échouer sur une corruption cross-tenant historique');
  }
  ok(failed,'0020 ne doit pas réussir silencieusement sur une base cross-tenant corrompue');

  equal(
    db.prepare("SELECT COUNT(*) AS n FROM employment_records WHERE id='legacy-cross-tenant'").get().n,
    1,
    'le rollback doit conserver la donnée historique problématique pour diagnostic'
  );
  equal(
    db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='employment_records_next'").get().n,
    0,
    'le rollback ne doit pas laisser de table _next partielle'
  );
  db.close();
}

console.log(`migrations-integrity-0020-0021: ${assertions} assertions réussies.`);
