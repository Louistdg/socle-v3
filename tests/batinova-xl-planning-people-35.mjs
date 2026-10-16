import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runPlanningPeoplePack} from '../scripts/simulation/batinova-xl/planning-people-pack.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(`
CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT NOT NULL,legal_name TEXT,country TEXT,currency TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE profiles(id TEXT PRIMARY KEY,first_name TEXT,last_name TEXT,email TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE roles(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),code TEXT NOT NULL,name TEXT,created_at TEXT,UNIQUE(organization_id,code));
CREATE TABLE organization_members(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),user_id TEXT NOT NULL REFERENCES profiles(id),role_id TEXT NOT NULL REFERENCES roles(id),status TEXT NOT NULL,joined_at TEXT,created_at TEXT,updated_at TEXT,person_id TEXT,UNIQUE(organization_id,user_id));
CREATE TABLE permissions(code TEXT PRIMARY KEY,description TEXT);
CREATE TABLE role_permissions(role_id TEXT NOT NULL REFERENCES roles(id),permission_code TEXT NOT NULL REFERENCES permissions(code),PRIMARY KEY(role_id,permission_code));
CREATE TABLE organization_workspace_state(organization_id TEXT PRIMARY KEY REFERENCES organizations(id),payload TEXT NOT NULL,revision INTEGER NOT NULL,source_user_id TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE project_access(organization_id TEXT NOT NULL REFERENCES organizations(id),user_id TEXT NOT NULL REFERENCES profiles(id),project_id TEXT NOT NULL,granted_by TEXT,created_at TEXT,PRIMARY KEY(organization_id,user_id,project_id));
CREATE TABLE field_assignments(id TEXT NOT NULL,organization_id TEXT NOT NULL REFERENCES organizations(id),assignment_date TEXT NOT NULL,team_id TEXT NOT NULL,project_id TEXT NOT NULL,people_json TEXT NOT NULL,vehicle_id TEXT,pack_id TEXT,subcontractor TEXT,created_by TEXT NOT NULL REFERENCES profiles(id),created_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES profiles(id),updated_at TEXT NOT NULL,PRIMARY KEY(organization_id,id));
CREATE TABLE time_entries(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),project_id TEXT NOT NULL,team_id TEXT,people_json TEXT NOT NULL,work_date TEXT NOT NULL,arrival TEXT NOT NULL,departure TEXT,break_minutes INTEGER NOT NULL,note TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES profiles(id),created_at TEXT NOT NULL,updated_by TEXT NOT NULL REFERENCES profiles(id),updated_at TEXT NOT NULL,archived_at TEXT);
CREATE TABLE time_entry_corrections(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),time_entry_id TEXT NOT NULL REFERENCES time_entries(id),person_id TEXT,original_arrival TEXT NOT NULL,original_departure TEXT,proposed_arrival TEXT NOT NULL,proposed_departure TEXT,reason TEXT NOT NULL,status TEXT NOT NULL,requested_by TEXT NOT NULL REFERENCES profiles(id),requested_at TEXT NOT NULL,reviewed_by TEXT REFERENCES profiles(id),reviewed_at TEXT,result_entry_id TEXT REFERENCES time_entries(id));
CREATE TABLE project_tasks(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),project_id TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,status TEXT NOT NULL,priority TEXT NOT NULL,assigned_to TEXT REFERENCES profiles(id),created_by TEXT NOT NULL REFERENCES profiles(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,completed_at TEXT,archived_at TEXT,due_at TEXT,checklist_json TEXT NOT NULL,materials_json TEXT NOT NULL,people_json TEXT NOT NULL,operation_key TEXT,task_kind TEXT NOT NULL,problem_category TEXT,photo_document_ids_json TEXT NOT NULL,validated_by TEXT REFERENCES profiles(id),validated_at TEXT);
CREATE UNIQUE INDEX project_tasks_operation_key_idx ON project_tasks(organization_id,created_by,operation_key) WHERE operation_key IS NOT NULL;
CREATE TABLE simulation_runs(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),script_code TEXT NOT NULL,version INTEGER NOT NULL,applied_at TEXT NOT NULL,applied_by TEXT NOT NULL REFERENCES profiles(id),summary_json TEXT NOT NULL,UNIQUE(organization_id,script_code,version));
`);

const permissionCodes=[
  'workspace.view','projects.view.assigned','contacts.view.assigned','tasks.view.assigned','tasks.manage.project','tasks.update.assigned','tasks.comment.create',
  'time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.correction.request','time_entries.correction.review',
  'project_materials.create','project_execution.edit','project_notes.create','planning.assignments.manage','assets.view','fuel.create','asset_issues.create',
  'documents.view.assigned','documents.secure.view','quotes.view','messages.view','messages.send','financial.dashboard.view','accounting.view','expenses.view',
  'expenses.create','invoices.view','payments.create','credit_notes.create','supplier_allocations.view','supplier_allocations.create','supplier_allocations.cancel',
  'purchase_orders.view','quotes.prices.view'
];
for(const code of permissionCodes)db.prepare('INSERT INTO permissions(code,description) VALUES(?,?)').run(code,code);

const stamp='2026-01-02T08:00:00.000Z';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-local-owner','BatiNova XL','BatiNova XL SRL','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('local-owner','Marc','Delcourt','owner@simulation.invalid',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner-local-owner','org-local-owner','OWNER','Patron',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-owner','org-local-owner','local-owner','role-owner-local-owner','active',stamp,stamp,stamp,'P01');

const people=[
  ['P01','Marc Delcourt','Gérant','Direction'],['P02','Julien Lambert','Conducteur de chantier principal','Conduite de chantier'],['P03','Nicolas Gérard','Conducteur de chantier','Conduite de chantier'],
  ['P04','Thomas Renard','Deviseur / acheteur','Études et achats'],['P05','Sophie Martin','Administration / pré-comptabilité','Administration'],
  ['P06','David Leclercq','Chef d’équipe gros œuvre','Maçonnerie'],['P07','Anthony Simon','Maçon qualifié','Maçonnerie'],['P08','Kevin Laurent','Maçon qualifié','Maçonnerie'],['P09','Samuel Bernard','Coffreur / ferrailleur','Coffrage / ferraillage'],['P10','Hugo Denis','Manœuvre','Gros œuvre'],
  ['P11','Olivier Mathieu','Chef d’équipe couverture','Couverture'],['P12','Maxime Evrard','Couvreur-zingueur','Couverture / zinguerie'],['P13','Lucas Fontaine','Couvreur','Couverture'],['P14','Romain Dubois','Charpentier','Charpente'],['P15','Mathis Leroy','Aide couvreur','Couverture'],
  ['P16','Philippe André','Chef d’équipe finitions','Finitions'],['P17','Damien François','Plafonneur','Plafonnage'],['P18','Benjamin Michel','Carreleur','Carrelage'],['P19','Jonathan Robert','Peintre','Peinture'],
  ['P20','Alex Marchal','Magasinier / chauffeur / logistique chantier','Logistique / magasin'],
  ['P21','Christophe Henry','Chef d’équipe rénovation','Rénovation'],['P22','Adrien Georges','Ouvrier polyvalent','Rénovation'],['P23','Quentin Noël','Ouvrier polyvalent','Rénovation'],['P24','Sébastien Collard','Menuisier/charpentier','Menuiserie / charpente'],['P25','Florian Masset','Conducteur mini-pelle / ouvrier polyvalent','Terrassement léger']
].map(([id,name,role,trade])=>({id,name,role,trade,category:role.includes('Conducteur')||role.includes('Administration')||role.includes('Deviseur')||role==='Gérant'?'Employé':'Ouvrier'}));

const teams=[
  {id:'TEAM-1',name:'Gros œuvre',members:['P06','P07','P08','P09','P10']},
  {id:'TEAM-2',name:'Toiture / charpente',members:['P11','P12','P13','P14','P15']},
  {id:'TEAM-3',name:'Finitions',members:['P16','P17','P18','P19']},
  {id:'TEAM-4',name:'Rénovation / polyvalents',members:['P21','P22','P23','P24','P25']}
];
const jobs=Array.from({length:15},(_,i)=>({id:'BATXL-PRJ-'+String(2000+i).padStart(5,'0'),sourceScenarioId:'BATXL-PRJ-'+String(i+1).padStart(3,'0'),name:'Chantier '+String(i+1).padStart(2,'0'),reference:'CH-'+String(i+1).padStart(3,'0'),status:'En cours'}));
const state={version:3,company:{name:'BatiNova XL',accountant:'Comptable TEST',accountantEmail:'comptable@batinova.test',morningBreakMinutes:15,lunchBreakMinutes:30},people,teams,jobs,assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-local-owner',JSON.stringify(state),1,'local-owner',stamp,stamp);

db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('test-anthony','Anthony','Simon','anthony@simulation.invalid',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-worker-local-owner','org-local-owner','WORKER','Ouvrier',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-test-anthony','org-local-owner','test-anthony','role-worker-local-owner','active',stamp,stamp,stamp,'P07');

const worker={async fetch(request){
  const url=new URL(request.url),uid=request.headers.get('oai-authenticated-user-id'),org=request.headers.get('x-socle-organization-id');
  const project=url.pathname.match(/^\/api\/projects\/([^/]+)$/)?.[1];
  if(!project)return new Response(JSON.stringify({error:'route'}),{status:404,headers:{'content-type':'application/json'}});
  const member=db.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.user_id=? AND om.status='active'").get(org,uid);
  if(!member)return new Response(JSON.stringify({error:'access'}),{status:403,headers:{'content-type':'application/json'}});
  const allowed=member.code==='OWNER'||Boolean(db.prepare('SELECT 1 ok FROM project_access WHERE organization_id=? AND user_id=? AND project_id=?').get(org,uid,decodeURIComponent(project)));
  return new Response(JSON.stringify(allowed?{projectId:decodeURIComponent(project)}:{error:'forbidden'}),{status:allowed?200:403,headers:{'content-type':'application/json'}});
}};

const first=await runPlanningPeoplePack({database:db,organizationId:'org-local-owner',worker});
const snapshot=()=>({
  assignments:Number(db.prepare("SELECT COUNT(*) c FROM field_assignments WHERE id LIKE 'BATXL-%'").get().c),
  pointages:Number(db.prepare("SELECT COUNT(*) c FROM time_entries WHERE id LIKE 'BATXL-%'").get().c),
  corrections:Number(db.prepare("SELECT COUNT(*) c FROM time_entry_corrections WHERE id LIKE 'BATXL-%'").get().c),
  tasks:Number(db.prepare("SELECT COUNT(*) c FROM project_tasks WHERE id LIKE 'BATXL-%'").get().c),
  grants:Number(db.prepare("SELECT COUNT(*) c FROM project_access").get().c)
});
const beforeReplay=snapshot();
const second=await runPlanningPeoplePack({database:db,organizationId:'org-local-owner',worker});
const afterReplay=snapshot();

assert.equal(first.people.source,25);
assert.equal(first.people.fieldPermanent,19);
assert.equal(first.people.floater,0);
assert.equal(first.people.temporaryReinforcement,1);
assert.equal(first.people.accountingPersonId,null);
assert.equal(first.people.accountingUserId,'BATXL-USER-ACC-01');
assert.equal(first.period.from,'2026-09-01');
assert.equal(first.period.to,'2026-09-30');
assert.equal(first.period.workingDays,22);
assert.deepEqual(first.teams.map(team=>team.permanentPeople),[5,5,4,5]);
assert.equal(first.assignments,87);
assert.equal(first.pointages,412);
assert.deepEqual(first.corrections,{total:9,approved:4,rejected:3,pending:2});
assert.equal(first.tasks.total,80);
assert.equal(first.events.replacement,1);
assert.equal(first.events.absence,1);
assert.equal(first.events.weather,1);
assert.equal(first.events.teamChange,1);
assert.equal(first.breakMinutes,45);
assert.equal(first.legacyRolesAssigned,0);
assert.equal(first.projectAccess.workerProbe.allowedStatus,200);
assert.equal(first.projectAccess.workerProbe.blockedStatus,403);
assert.equal(first.projectAccess.teamLeadProbe.allowedStatus,200);
assert.equal(first.projectAccess.teamLeadProbe.blockedStatus,403);
assert.equal(first.projectAccess.teamChangeProbe.allowedStatus,200);
assert.equal(first.projectAccess.teamChangeProbe.blockedStatus,403);
assert.deepEqual(afterReplay,beforeReplay);
assert.deepEqual(second,first);

const savedState=JSON.parse(db.prepare("SELECT payload FROM organization_workspace_state WHERE organization_id='org-local-owner'").get().payload);
assert.deepEqual(savedState.teams[0].members,['P06','P07','P08','P09','P10']);
assert.deepEqual(savedState.teams[1].members,['P11','P12','P13','P14','P15']);
assert.deepEqual(savedState.teams[2].members,['P16','P17','P18','P19']);
assert.deepEqual(savedState.teams[3].members,['P21','P22','P23','P24','P25']);

const accounting=db.prepare("SELECT om.user_id,om.person_id,r.code,p.first_name,p.last_name,p.email FROM organization_members om JOIN roles r ON r.id=om.role_id JOIN profiles p ON p.id=om.user_id WHERE om.organization_id='org-local-owner' AND r.code='ACCOUNTING'").get();
assert.equal(accounting.user_id,'BATXL-USER-ACC-01');
assert.equal(accounting.person_id,null,'ACCOUNTING doit rester une identité de connexion séparée du roster terrain/admin');
assert.equal(accounting.first_name+' '+accounting.last_name,'Comptable TEST');
assert.equal(accounting.email,'comptable@batinova.test');
assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM project_access WHERE organization_id='org-local-owner' AND user_id=?").get(accounting.user_id).c),0);
assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-local-owner' AND r.code='ACCOUNTING' AND om.person_id IS NOT NULL").get().c),0,'ACCOUNTING ne doit être lié à aucun Pxx');
assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM organization_members WHERE organization_id='org-local-owner' AND person_id='P25' AND role_id IN (SELECT id FROM roles WHERE code='ACCOUNTING')").get().c),0);
assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM organization_members WHERE organization_id='org-local-owner' AND person_id='P07'").get().c),1,'Anthony conserve une seule identité métier/connexion');

for(const [personId,expectedName] of [['P06','David Leclercq'],['P11','Olivier Mathieu'],['P16','Philippe André'],['P21','Christophe Henry']]){
  const row=db.prepare("SELECT p.first_name||' '||p.last_name name,r.code FROM organization_members om JOIN profiles p ON p.id=om.user_id JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-local-owner' AND om.person_id=?").get(personId);
  assert.equal(row.name,expectedName);assert.equal(row.code,'TEAM_LEAD');
}

const sep7Roof=db.prepare("SELECT people_json FROM field_assignments WHERE organization_id='org-local-owner' AND assignment_date='2026-09-07' AND team_id='TEAM-2'").get();
assert.ok(sep7Roof);assert.ok(JSON.parse(sep7Roof.people_json).includes('P24'));assert.ok(!JSON.parse(sep7Roof.people_json).includes('P12'));
const sep7Renov=db.prepare("SELECT people_json FROM field_assignments WHERE organization_id='org-local-owner' AND assignment_date='2026-09-07' AND team_id='TEAM-4'").get();
assert.ok(sep7Renov);assert.ok(!JSON.parse(sep7Renov.people_json).includes('P24'));
assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM field_assignments WHERE organization_id='org-local-owner' AND assignment_date='2026-09-09' AND team_id='TEAM-1'").get().c),0);
assert.equal(Number(db.prepare("SELECT COUNT(*) c FROM time_entries WHERE organization_id='org-local-owner' AND work_date='2026-09-09' AND team_id='TEAM-1'").get().c),0,'09/09 météo: aucun faux pointage E1');

for(const [date,teamId,expected] of [
  ['2026-09-03','TEAM-3','BATXL-PRJ-02006'],
  ['2026-09-15','TEAM-3','BATXL-PRJ-02013'],
  ['2026-09-18','TEAM-2','BATXL-PRJ-02001'],
  ['2026-09-22','TEAM-1','BATXL-PRJ-02007'],
  ['2026-09-24','TEAM-3','BATXL-PRJ-02009']
]){
  assert.equal(db.prepare("SELECT project_id FROM field_assignments WHERE organization_id='org-local-owner' AND assignment_date=? AND team_id=?").get(date,teamId).project_id,expected);
}

for(const table of ['field_assignments','time_entries','project_access']){
  const rows=db.prepare('SELECT project_id FROM '+table+" WHERE organization_id='org-local-owner'").all();
  for(const row of rows)assert.match(String(row.project_id),/^BATXL-PRJ-020(?:0[0-9]|1[0-4])$/,'FK chantier non canonique dans '+table+': '+row.project_id);
}

const planningColumns=new Set(db.prepare("PRAGMA table_info(field_assignments)").all().map(row=>String(row.name))),hasIntervals=planningColumns.has('start_time')&&planningColumns.has('end_time'),hasStatus=planningColumns.has('status');
const assignmentRows=db.prepare("SELECT id,assignment_date,people_json"+(hasIntervals?",start_time,end_time":"")+" FROM field_assignments WHERE id LIKE 'BATXL-ASG-%'"+(hasStatus?" AND status<>'cancelled'":"")+" ORDER BY assignment_date,id").all();
const byPersonDay=new Map(),clock=value=>{const [h,m]=String(value).split(':').map(Number);return h*60+m};
for(const row of assignmentRows){row.start_time=row.start_time||'07:00';row.end_time=row.end_time||'16:00';for(const person of JSON.parse(row.people_json)){
  const key=row.assignment_date+'|'+person;if(!byPersonDay.has(key))byPersonDay.set(key,[]);byPersonDay.get(key).push(row);
}}
for(const [key,rows] of byPersonDay)for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  assert.equal(clock(rows[i].start_time)<clock(rows[j].end_time)&&clock(rows[j].start_time)<clock(rows[i].end_time),false,'double affectation simultanée '+key+' '+rows[i].id+' / '+rows[j].id);
}

const roleRows=db.prepare("SELECT DISTINCT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-local-owner' AND (om.user_id LIKE 'BATXL-USER-%' OR om.user_id='test-anthony') ORDER BY r.code").all().map(r=>r.code);
assert.deepEqual(roleRows,['ACCOUNTING','TEAM_LEAD','WORKER']);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');

console.log('BATXL_IA3_PLANNING_TEST=PASS');
console.log('SUMMARY='+JSON.stringify(first));
console.log('REPLAY='+JSON.stringify({beforeReplay,afterReplay}));
