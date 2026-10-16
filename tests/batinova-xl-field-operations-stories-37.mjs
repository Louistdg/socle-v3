import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync,readdirSync } from 'node:fs';
import { runFieldOperationsStoriesPack } from '../scripts/simulation/batinova-xl/field-operations-stories-pack.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const org='org-local-owner',stamp='2026-08-17T05:30:00.000Z';
db.prepare('INSERT OR IGNORE INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,'BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [id,first,last] of [['owner','Marc','Delcourt'],['lead','David','Renard'],['worker','Anthony','Simon']]){
  db.prepare('INSERT OR IGNORE INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,first,last,stamp,stamp);
}
for(const [id,code] of [['role-owner','OWNER'],['role-lead','TEAM_LEAD'],['role-worker','WORKER']]){
  db.prepare('INSERT OR IGNORE INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,code,stamp);
}
for(const [id,user,role] of [['member-owner','owner','role-owner'],['member-lead','lead','role-lead'],['member-worker','worker','role-worker']]){
  db.prepare("INSERT OR IGNORE INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?, 'active',?,?,?)").run(id,org,user,role,stamp,stamp,stamp);
}
const jobs=Array.from({length:15},(_,index)=>({id:'BATXL-PRJ-'+String(2000+index).padStart(5,'0'),sourceScenarioId:'BATXL-PRJ-'+String(index+1).padStart(3,'0'),name:'Chantier '+String(index+1).padStart(2,'0'),status:index===11?'blocked':index===10||index===14?'completed':'active'}));
const state={version:3,company:{name:'BatiNova'},jobs,people:[],teams:[],quotes:[],assets:[],tasks:[]};
db.prepare("INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET payload=excluded.payload,revision=excluded.revision,source_user_id=excluded.source_user_id,updated_at=excluded.updated_at")
  .run(org,JSON.stringify(state),1,'owner',stamp,stamp);
for(const job of jobs){
  db.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,'lead',job.id,'owner',stamp);
  db.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,'worker',job.id,'owner',stamp);
}

const first=runFieldOperationsStoriesPack({database:db,organizationId:org});
assert.equal(first.problems,6,'6 problèmes terrain de septembre');
assert.equal(first.notes,9,'9 remarques terrain de septembre');
assert.equal(first.blockedProblems,1,'1 problème bloqué en septembre');
assert.equal(first.doneProblems,1,'1 problème résolu en septembre');
assert.ok(first.projectsCovered>=10,'au moins 10 chantiers couverts');
assert.equal(first.comments,2,'commentaires causaux septembre présents');
assert.equal(first.categories.reduce((sum,row)=>sum+Number(row.count||0),0),6,'tous les problèmes septembre catégorisés');
assert.equal(db.prepare("SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND created_by='worker' AND id LIKE 'BATXL-FLD-PROB-%'").get(org).count,6,'problèmes créés par un profil terrain');
assert.equal(db.prepare("SELECT COUNT(*) count FROM field_project_notes WHERE organization_id=? AND created_by='worker' AND id LIKE 'BATXL-FLD-NOTE-%'").get(org).count,9,'remarques créées par un profil terrain');
assert.ok(Number(db.prepare("SELECT COUNT(*) count FROM audit_logs WHERE organization_id=? AND entity_id LIKE 'BATXL-FLD-%'").get(org).count)>=15,'audits terrain présents');

const taskCountBefore=Number(db.prepare("SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%'").get(org).count);
const noteCountBefore=Number(db.prepare("SELECT COUNT(*) count FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%'").get(org).count);
const auditCountBefore=Number(db.prepare("SELECT COUNT(*) count FROM audit_logs WHERE organization_id=? AND id LIKE 'BATXL-FLD-AUD-%'").get(org).count);
const second=runFieldOperationsStoriesPack({database:db,organizationId:org});
assert.deepEqual(first.period,{from:'2026-09-01',to:'2026-09-30'});
assert.equal(first.rawProjectReferences,0,'aucune FK métier vers les IDs source');
assert.equal(first.sourceToCanonical['BATXL-PRJ-007'],'BATXL-PRJ-02006');
assert.equal(first.sourceToCanonical['BATXL-PRJ-014'],'BATXL-PRJ-02013');
assert.equal(first.sourceToCanonical['BATXL-PRJ-002'],'BATXL-PRJ-02001');
assert.equal(first.sourceToCanonical['BATXL-PRJ-008'],'BATXL-PRJ-02007');
assert.equal(first.sourceToCanonical['BATXL-PRJ-010'],'BATXL-PRJ-02009');
assert.equal(first.sourceToCanonical['BATXL-PRJ-012'],'BATXL-PRJ-02011');
assert.equal(Number(db.prepare("SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' AND (created_at<'2026-09-01' OR created_at>='2026-10-01')").get(org).count),0,'aucun problème hors septembre');
assert.equal(Number(db.prepare("SELECT COUNT(*) count FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%' AND (note_date<'2026-09-01' OR note_date>'2026-09-30')").get(org).count),0,'aucune remarque hors septembre');
const nacelle=db.prepare("SELECT title,description,project_id FROM project_tasks WHERE organization_id=? AND id='BATXL-FLD-PROB-005'").get(org);
assert.match(nacelle.title,/location/i,'nacelle explicitement externe/location');
assert.match(nacelle.description,/louée|loueur/i,'aucune maintenance d’asset interne inventée');
assert.equal(nacelle.project_id,'BATXL-PRJ-02013');
assert.equal(second.fingerprint,first.fingerprint,'fingerprint stable au replay');
assert.equal(Number(db.prepare("SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%'").get(org).count),taskCountBefore,'replay sans doublon tâche');
assert.equal(Number(db.prepare("SELECT COUNT(*) count FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%'").get(org).count),noteCountBefore,'replay sans doublon remarque');
assert.equal(Number(db.prepare("SELECT COUNT(*) count FROM audit_logs WHERE organization_id=? AND id LIKE 'BATXL-FLD-AUD-%'").get(org).count),auditCountBefore,'replay sans doublon audit');
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'FK intactes');
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','SQLite integrity ok');
assert.equal(Number(db.prepare("SELECT COUNT(*) count FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=?").get(org,'BATXL-IA1-FIELD-OPERATIONS-STORIES',2).count),1,'simulation run unique');

console.log('batinova-xl-field-operations-stories-37: PASS — 6 problèmes + 9 remarques septembre, IDs canoniques, replay stable, FK/integrity OK');
db.close();
