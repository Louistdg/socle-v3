import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migrationDir=new URL('../drizzle/',import.meta.url),migrations=readdirSync(migrationDir).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const preferenceMigration='0038_user_preferences.sql',cutoff='0037_batinova_first_owner_bootstrap.sql';
assert.ok(migrations.includes(preferenceMigration),'la migration PREFS-01 est enregistrée');
const db=new DatabaseSync(':memory:');
try{
  db.exec('PRAGMA foreign_keys=ON');
  for(const name of migrations.filter(name=>name<=cutoff))db.exec(readFileSync(new URL(name,migrationDir),'utf8'));
  const stamp='2026-10-03T08:00:00.000Z';
  for(const [org,user] of [['prefs-upgrade-a','prefs-user'],['prefs-upgrade-b','prefs-other']]){
    db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,\'BE\',\'EUR\',?,?)').run(org,org,org,stamp,stamp);
    db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(user,user,'Prefs',stamp,stamp);
    const role='role-'+org;db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(role,org,'OWNER','Owner',stamp);
    db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,'active',?,?,?)").run('member-'+org,org,user,role,stamp,stamp,stamp);
    db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify({company:{name:org},unchanged:true}),5,user,stamp,stamp);
  }
  const before={organizations:db.prepare('SELECT * FROM organizations ORDER BY id').all(),profiles:db.prepare('SELECT * FROM profiles ORDER BY id').all(),members:db.prepare('SELECT * FROM organization_members ORDER BY organization_id,user_id').all(),workspace:db.prepare('SELECT * FROM organization_workspace_state ORDER BY organization_id').all()};
  const sql=readFileSync(new URL(preferenceMigration,migrationDir),'utf8');
  db.exec(sql);db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='user_preferences'").get().n,1,'la migration rejouée ne duplique pas le stockage');
  assert.deepEqual(db.prepare('SELECT * FROM organizations ORDER BY id').all(),before.organizations,'organisations conservées');
  assert.deepEqual(db.prepare('SELECT * FROM profiles ORDER BY id').all(),before.profiles,'profils conservés');
  assert.deepEqual(db.prepare('SELECT * FROM organization_members ORDER BY organization_id,user_id').all(),before.members,'adhésions conservées');
  assert.deepEqual(db.prepare('SELECT * FROM organization_workspace_state ORDER BY organization_id').all(),before.workspace,'données de tenant conservées');
  db.prepare('INSERT INTO user_preferences(organization_id,user_id,namespace,preference_key,schema_version,value_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('prefs-upgrade-a','prefs-user','dashboard','density',1,'{"density":"compact"}',stamp,stamp);
  assert.throws(()=>db.prepare('INSERT INTO user_preferences(organization_id,user_id,namespace,preference_key,schema_version,value_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('prefs-upgrade-a','prefs-other','dashboard','density',1,'{}',stamp,stamp),/FOREIGN KEY constraint failed/,'le FK composite refuse un utilisateur sans adhésion dans le tenant');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[],'aucune FK cassée');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','intégrité SQLite OK');
  console.log('PREFS-01 migration: PASS (upgrade depuis 0037, replay SQL idempotent, données existantes préservées, FK composite)');
}finally{db.close();}
