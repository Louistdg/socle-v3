import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
const stamp='2026-10-03T18:00:00.000Z';
const org='org-access-104',otherOrg='org-access-104-b';
for(const [id,name] of [[org,'ACCESS A'],[otherOrg,'ACCESS B']])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);

const roles=[
 ['role-owner','OWNER','Propriétaire'],
 ['role-lead','TEAM_LEAD','Chef d’équipe'],
 ['role-worker','WORKER','Ouvrier'],
 ['role-accounting','ACCOUNTING','Comptable'],
 ['role-user-accounting','USER_accounting','Comptable personnalisé'],
 ['role-user-finance-project','USER_finance_project','Finance chantier'],
 ['role-user-fake','USER_fake_accounting','Comptable visuel'],
 ['role-owner-b','OWNER','Propriétaire B']
];
for(const [id,code,name] of roles)db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,id==='role-owner-b'?otherOrg:org,code,name,stamp);

const users=[
 ['owner','Marc','Owner','person-owner','role-owner',org],
 ['lead','Lina','Lead','person-lead','role-lead',org],
 ['worker','Wim','Worker','person-worker','role-worker',org],
 ['accounting','Anna','Accounting','person-accounting','role-accounting',org],
 ['user-accounting','Ursula','Accounting','person-user-accounting','role-user-accounting',org],
 ['user-finance-project','Paul','Finance','person-user-finance-project','role-user-finance-project',org],
 ['user-fake','Fanny','Fake','person-user-fake','role-user-fake',org],
 ['custom-own','Olivier','Own','person-custom-own','role-worker',org],
 ['custom-team','Tania','Team','person-custom-team','role-worker',org],
 ['owner-b','Other','Owner','person-owner-b','role-owner-b',otherOrg]
];
for(const [user,first,last,person,role,organizationId] of users){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(user,first,last,user+'@example.test',stamp,stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,person_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+user,organizationId,user,person,role,'active',stamp,stamp,stamp);
}

const grants={
 'role-lead':['workspace.view','projects.view.assigned','planning.assignments.manage','time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.correction.request'],
 'role-worker':['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.correction.request'],
 'role-accounting':['accounting.view','financial.dashboard.view','invoices.view','expenses.view','purchase_orders.view','documents.secure.view','quotes.view','quotes.prices.view'],
 'role-user-accounting':['workspace.view','accounting.view','financial.dashboard.view','invoices.view','expenses.view','purchase_orders.view','documents.secure.view','quotes.view','quotes.prices.view','ui.module.accounting.view','ui.module.personal.view'],
 'role-user-finance-project':['workspace.view','projects.view.assigned','accounting.view','financial.dashboard.view','invoices.view','ui.module.accounting.view','ui.module.personal.view'],
 'role-user-fake':['workspace.view','ui.module.personal.view']
};
for(const [role,permissions] of Object.entries(grants))for(const permission of permissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(role,permission);

db.prepare('INSERT INTO member_access_settings(organization_id,user_id,profile_name,scope,updated_by,updated_at) VALUES(?,?,?,?,?,?)').run(org,'user-accounting','Comptable','Comptabilité et pièces administratives','owner',stamp);
db.prepare('INSERT INTO member_access_settings(organization_id,user_id,profile_name,scope,updated_by,updated_at) VALUES(?,?,?,?,?,?)').run(org,'user-finance-project','Finance projet','Ses chantiers uniquement','owner',stamp);
db.prepare('INSERT INTO member_access_settings(organization_id,user_id,profile_name,scope,updated_by,updated_at) VALUES(?,?,?,?,?,?)').run(org,'user-fake','Comptable','Comptabilité et pièces administratives','owner',stamp);

const state={version:3,company:{name:'ACCESS A',morningBreakMinutes:15,lunchBreakMinutes:30},people:[
 {id:'person-owner',name:'Marc Owner'},{id:'person-lead',name:'Lina Lead'},{id:'person-worker',name:'Wim Worker'},{id:'person-accounting',name:'Anna Accounting'},
 {id:'person-user-accounting',name:'Ursula Accounting'},{id:'person-user-finance-project',name:'Paul Finance'},{id:'person-user-fake',name:'Fanny Fake'},{id:'person-custom-own',name:'Olivier Own'},{id:'person-custom-team',name:'Tania Team'},
 {id:'person-helper-own-escalation',name:'Helper Own'},{id:'person-helper-custom-team',name:'Helper Team'},{id:'person-helper-lead',name:'Helper Lead'}
],teams:[{id:'team-1',name:'Toiture',members:['person-lead','person-worker','person-custom-own','person-custom-team','person-helper-own-escalation','person-helper-custom-team','person-helper-lead']}],jobs:[
 {id:'p1',reference:'A-001',name:'Chantier autorisé'},{id:'p2',reference:'A-002',name:'Chantier hors scope'}
],assignments:[
 {id:'asg-1',date:'2026-10-03',job:'p1',team:'team-1',people:['person-lead','person-worker','person-custom-own','person-custom-team','person-helper-own-escalation','person-helper-custom-team','person-helper-lead']}
],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,'owner',stamp,stamp);
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(otherOrg,JSON.stringify({...state,company:{name:'ACCESS B'},jobs:[{id:'b1',reference:'B-001',name:'Autre tenant'}],assignments:[]}),1,'owner-b',stamp,stamp);

for(const [user,project] of [['lead','p1'],['worker','p1'],['custom-own','p1'],['custom-team','p1'],['user-finance-project','p1']])db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,user,project,'owner',stamp);

function invoice(id,organizationId,project,total,creator){
  db.prepare("INSERT INTO invoices(id,organization_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at,legacy_project_id,legacy_paid_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,organizationId,'FAC-'+id,'customer','unpaid','2026-10-01','2026-10-31','EUR',total,0,total,0,'',creator,stamp,stamp,project,0);
}
invoice('inv-a1',org,'p1',10000,'owner');invoice('inv-a2',org,'p2',20000,'owner');invoice('inv-b1',otherOrg,'b1',999999,'owner-b');

db.prepare("INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,1,'server',?,?)").run(org,'hr-secret','Employé Secret','Ouvrier','Ouvrier',stamp,stamp);
db.prepare('INSERT INTO employment_records(organization_id,id,person_id,starts_on,contract_type,weekly_hours,gross_hourly_cents,trade_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(org,'employment-secret','hr-secret','2026-01-01','CDI',40,2500,'Couvreur',stamp,stamp);

async function call(uid,method,path,payload,organizationId=org){
  const headers={'origin':'https://socle.test'};
  if(uid)headers['oai-authenticated-user-id']=uid;
  if(organizationId)headers['x-socle-organization-id']=organizationId;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

const failures=[];let checks=0;
function expect(condition,label,details=''){checks++;if(!condition)failures.push(label+(details?' :: '+details:''))}
async function expectStatus(uid,method,path,status,payload,organizationId=org){
  const result=await call(uid,method,path,payload,organizationId);
  expect(result.status===status,uid+' '+method+' '+path+' => '+status,'obtenu '+result.status+' '+JSON.stringify(result.body));
  return result;
}

await expectStatus('owner','GET','/api/planning?from=2026-10-03&to=2026-10-03',200);
await expectStatus('accounting','GET','/api/planning?from=2026-10-03&to=2026-10-03',403);
let result=await expectStatus('accounting','GET','/api/invoices',200);
expect(result.body.invoices?.length===2,'ACCOUNTING canonique garde Finance tenant','invoices='+JSON.stringify(result.body.invoices?.map(x=>x.id)));

result=await expectStatus('user-accounting','GET','/api/invoices',200);
expect(result.body.invoices?.length===2,'USER_* dérivé comptable garde le même scope Finance tenant','invoices='+JSON.stringify(result.body.invoices?.map(x=>x.id)));
await expectStatus('user-accounting','GET','/api/invoices/inv-b1',404);
await expectStatus('user-accounting','GET','/api/invoices',403,undefined,otherOrg);
await expectStatus('user-accounting','GET','/api/planning?from=2026-10-03&to=2026-10-03',403);
result=await expectStatus('user-finance-project','GET','/api/invoices',200);
expect(JSON.stringify(result.body.invoices?.map(x=>x.id).sort())===JSON.stringify(['inv-a1']),'USER_* Finance à scope chantier reste limité à son project_access','invoices='+JSON.stringify(result.body.invoices?.map(x=>x.id)));
await expectStatus('user-finance-project','GET','/api/invoices/inv-a2',403);

await expectStatus('user-fake','GET','/api/accounting/summary',403);
await expectStatus('user-fake','GET','/api/invoices',403);
await expectStatus('user-fake','GET','/api/hr/people/hr-secret/employment-records',403);

const emptyModules={};for(const key of ['planning','personal','jobs','messages','people','quotes','gallery','fleet','accounting','actions','documents','company','permissions'])emptyModules[key]={view:false,add:false,edit:false};
const emptySensitive={quotePrices:false,jobMargins:false,payroll:false,privateDocuments:false,manageAccess:false,paySlips:false};
const emptyField={logHours:false,requestTimeCorrection:false,approveTimeCorrection:false,scheduleTeams:false,manageTeams:false,logFuel:false,reportAssetIssue:false,manageAssets:false,manageAlerts:false,manageSharedCalendar:false,managePeople:false,removePeople:false,paymentReminders:false,markPayments:false,uploadPaySlips:false,viewProfitability:false};
const ownAssignment={profileName:'Chef d’équipe',scope:'Ses propres informations et chantiers',modules:structuredClone(emptyModules),sensitive:structuredClone(emptySensitive),fieldActions:{...emptyField,logHours:true,requestTimeCorrection:true},projectIds:['p1']};
ownAssignment.modules.planning.view=true;ownAssignment.modules.personal.view=true;ownAssignment.modules.jobs.view=true;
result=await expectStatus('owner','PUT','/api/access-control/custom-own',200,ownAssignment);
let customOwn=result.body.members?.find(member=>member.userId==='custom-own');
expect(customOwn?.roleCode?.startsWith('USER_'),'custom-own devient USER_*');
expect(customOwn?.permissions?.includes('time_entries.create.own'),'scope propre conserve pointage propre');
expect(!customOwn?.permissions?.includes('time_entries.create.team'),'le libellé Chef d’équipe ne doit pas créer un droit équipe');
await expectStatus('custom-own','POST','/api/time-entries/arrival',403,{projectId:'p1',teamId:'team-1',date:'2026-10-04',people:[{personId:'person-helper-own-escalation',arrival:'07:00'}]});
await expectStatus('custom-own','POST','/api/time-entries/arrival',201,{projectId:'p1',teamId:'team-1',date:'2026-10-04',people:[{personId:'person-custom-own',arrival:'07:05'}]});
await expectStatus('custom-own','GET','/api/time-entries?project_id=p2',403);

const teamAssignment={profileName:'Profil terrain personnalisé',scope:'Son équipe et ses chantiers',modules:structuredClone(emptyModules),sensitive:structuredClone(emptySensitive),fieldActions:{...emptyField,logHours:true,requestTimeCorrection:true},projectIds:['p1']};
teamAssignment.modules.planning.view=true;teamAssignment.modules.personal.view=true;teamAssignment.modules.jobs.view=true;
result=await expectStatus('owner','PUT','/api/access-control/custom-team',200,teamAssignment);
let customTeam=result.body.members?.find(member=>member.userId==='custom-team');
expect(customTeam?.permissions?.includes('time_entries.create.team'),'scope équipe accorde le pointage équipe sans dépendre du nom de profil');
await expectStatus('custom-team','POST','/api/time-entries/arrival',201,{projectId:'p1',teamId:'team-1',date:'2026-10-05',people:[{personId:'person-helper-custom-team',arrival:'07:10'}]});

await expectStatus('worker','POST','/api/time-entries/arrival',403,{projectId:'p1',teamId:'team-1',date:'2026-10-06',people:[{personId:'person-lead',arrival:'07:00'}]});
await expectStatus('worker','POST','/api/time-entries/arrival',201,{projectId:'p1',teamId:'team-1',date:'2026-10-06',people:[{personId:'person-worker',arrival:'07:05'}]});
await expectStatus('lead','POST','/api/time-entries/arrival',201,{projectId:'p1',teamId:'team-1',date:'2026-10-07',people:[{personId:'person-helper-lead',arrival:'07:00'}]});

result=await expectStatus('custom-own','GET','/api/projects/p1/field-portal',200);
const assignmentPeople=result.body.team?.assignments?.flatMap(item=>item.people||[])||[];
expect(assignmentPeople.every(personId=>String(personId)==='person-custom-own'),'USER_* scope propre ne reçoit pas les autres personnes dans le portail terrain','people='+JSON.stringify(assignmentPeople));

await expectStatus('owner','GET','/api/hr/people/hr-secret/employment-records',200);
await expectStatus('worker','GET','/api/hr/people/hr-secret/employment-records',403);

if(failures.length){
  console.error('ACCESS-01 reproductions non conformes:\n- '+failures.join('\n- '));
  assert.deepEqual(failures,[]);
}
console.log('access-contract-104: '+checks+' contrôles API/serveur réussis');
