import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';

const db=new DatabaseSync(':memory:');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
const newMigration='0044_canonical_role_permission_defaults.sql';
assert.equal(migrations[44],newMigration,'la migration des permissions canoniques reste 0044');
for(const name of migrations.filter(item=>item<newMigration))db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const stamp='2026-10-09T08:00:00.000Z';
for(const [org,name] of [['org-a','A'],['org-b','B'],['org-c','C']])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,name,name,'BE','EUR',stamp,stamp);
const roles=[
  ['worker-a','org-a','WORKER'],['lead-a','org-a','TEAM_LEAD'],['accounting-a','org-a','ACCOUNTING'],['owner-a','org-a','OWNER'],
  ['custom-worker-b','org-b','WORKER'],['worker-c','org-c','WORKER'],['custom-user-a','org-a','USER_WORKER']
];
for(const [id,org,code] of roles)db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,code,stamp);
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('custom-worker-b','projects.view.assigned');
const migration=readFileSync(new URL('../drizzle/'+newMigration,import.meta.url),'utf8');
db.exec(migration);
const permissions=role=>db.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').all(role).map(row=>row.permission_code);
const worker=permissions('worker-a'),lead=permissions('lead-a'),accounting=permissions('accounting-a');
for(const code of ['workspace.view','projects.view.assigned','tasks.view.assigned','time_entries.view.own','time_entries.create.own','project_notes.create','quotes.view'])assert.ok(worker.includes(code),'WORKER reçoit le droit utile '+code);
for(const code of ['time_entries.view.team','time_entries.create.team','time_entries.correction.review','planning.assignments.manage'])assert.equal(lead.includes(code),true,'TEAM_LEAD reçoit '+code);
for(const code of ['financial.dashboard.view','accounting.view','invoices.view','quotes.prices.view','bank.reconcile'])assert.ok(accounting.includes(code),'ACCOUNTING reçoit '+code);
for(const forbidden of ['quotes.prices.view','accounting.view','financial.dashboard.view','planning.assignments.manage','time_entries.create.team','permissions.manage','members.invite'])assert.equal(worker.includes(forbidden),false,'WORKER ne reçoit pas '+forbidden);
assert.deepEqual(permissions('owner-a'),[],'OWNER conserve son autorité implicite sans permissions déclarées');
assert.deepEqual(permissions('custom-worker-b'),['projects.view.assigned'],'un rôle déjà configuré est conservé sans ajout de droits');
assert.deepEqual(permissions('custom-user-a'),[],'un rôle utilisateur personnalisé ne reçoit pas un profil canonique');
const workerC=permissions('worker-c');assert.deepEqual(workerC,worker,'les mêmes droits sont initialisés par tenant sans les mélanger');
const before=db.prepare('SELECT role_id,permission_code FROM role_permissions ORDER BY role_id,permission_code').all();db.exec(migration);assert.deepEqual(db.prepare('SELECT role_id,permission_code FROM role_permissions ORDER BY role_id,permission_code').all(),before,'migration rejouée sans changement');
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[],'aucune relation de permission orpheline');
console.log(`role-permission-defaults-44: ${worker.length+lead.length+accounting.length} droits canoniques; profils personnalisés, isolation tenant et idempotence réussis`);
