import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-09-29T12:00:00.000Z';
for(const [org,name] of [['org','BatiNova'],['org2','Autre société']])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,name,name,'BE','EUR',stamp,stamp);
for(const [id,first,last] of [['owner','Marc','Delcourt'],['lead','David','Renard'],['worker','Anthony','Simon'],['outsider','Luc','Martin']])db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,first,last,stamp,stamp);
for(const [id,org,code] of [['role-owner','org','OWNER'],['role-lead','org','TEAM_LEAD'],['role-worker','org','WORKER'],['role-outsider','org2','WORKER']])db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,code,stamp);
for(const [user,org,role,person] of [['owner','org','role-owner','1'],['lead','org','role-lead','2'],['worker','org','role-worker','3'],['outsider','org2','role-outsider','4']]){
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+user,org,user,role,'active',stamp,stamp,stamp,person);
}
for(const permission of ['workspace.view','projects.view.assigned','quotes.view','tasks.view.assigned','tasks.manage.project','tasks.comment.create','tasks.update.assigned','project_notes.create','time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','planning.assignments.manage']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-lead',permission);
}
for(const permission of ['workspace.view','projects.view.assigned','quotes.view','tasks.view.assigned','tasks.update.assigned','tasks.comment.create','project_notes.create','time_entries.view.own','time_entries.create.own']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker',permission);
}
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','lead','p1','owner',stamp);
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','worker','p1','owner',stamp);

const state={version:3,company:{name:'BatiNova',morningBreakMinutes:15,lunchBreakMinutes:30},people:[{id:1,name:'Marc Delcourt'},{id:2,name:'David Renard'},{id:3,name:'Anthony Simon'}],teams:[{id:10,name:'Équipe toiture',members:[2,3]}],jobs:[{id:'p1',name:'Chantier autorisé',reference:'CH-001',status:'En cours',address:'Rue du Test 1',town:'Namur'},{id:'p2',name:'Chantier hors périmètre',reference:'CH-002',status:'En cours'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);

const env={DB:{prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}}};

async function call(uid,method,path,payload,organizationId='org'){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':organizationId,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
const count=(sql,...args)=>Number(db.prepare(sql).get(...args).count||0);

async function createQuote(projectId,reference,price){
  const result=await call('owner','POST','/api/quotes',{projectId,reference,status:'accepted',title:'Lot toiture',client:'Client test',clientAddress:'Adresse test',date:'2026-09-29',validUntil:'2026-10-29',deposit:30,paymentTerms:'30 jours',notes:'Instructions techniques',exclusions:'',lines:[{label:'Pose ardoises',description:'Pose suivant plans',qty:10,unit:'m²',price,vat:6}]});
  assert.equal(result.status,201,'OWNER crée le devis de test');
}
await createQuote('p1','DEV-001',125);
await createQuote('p2','DEV-002',250);

let result=await call('owner','GET','/api/quotes');
assert.equal(result.status,200);assert.equal(result.body.quotes.length,2);assert.equal(result.body.quotes.find(q=>q.reference==='DEV-001').lines[0].price,125);
result=await call('worker','GET','/api/quotes');
assert.equal(result.status,200);assert.deepEqual(result.body.quotes.map(q=>q.reference),['DEV-001']);
const technical=result.body.quotes[0];
assert.equal(technical.lines[0].label,'Pose ardoises');assert.equal(technical.lines[0].qty,10);assert.equal(technical.lines[0].unit,'m²');assert.equal(Object.hasOwn(technical.lines[0],'price'),false);assert.equal(technical.lines[0].vat,6,'le taux TVA technique reste visible sans exposer de montant');assert.equal(JSON.stringify(technical).includes('"price"'),false);

result=await call('worker','GET','/api/projects/p2/field-portal');
assert.equal(result.status,403,'WORKER ne lit pas un autre chantier');
result=await call('outsider','GET','/api/projects/p1/field-portal',undefined,'org');
assert.equal(result.status,403,'cross-tenant refusé');
result=await call('lead','GET','/api/projects/p1/field-portal');
assert.equal(result.status,200);assert.equal(result.body.currentUser.role,'TEAM_LEAD');assert.equal(result.body.capabilities.manageTasks,true);
result=await call('worker','GET','/api/projects/p1/field-portal');
assert.equal(result.status,200);assert.equal(result.body.currentUser.role,'WORKER');assert.equal(result.body.capabilities.manageTasks,false);assert.equal(result.body.capabilities.viewQuotePrices,false);assert.equal(JSON.stringify(result.body.quotes).includes('"price"'),false);

const taskPayload={title:'Préparer le faîtage',description:'Préparer les pièces avant pose',assignedTo:'worker',people:['worker'],priority:'high',dueAt:'2026-09-30',checklist:[{id:'c1',label:'Matériel prêt',done:false}],materials:[{name:'Faîtières',quantity:8,unit:'pcs'}],operationKey:'task-key-0001'};
result=await call('lead','POST','/api/projects/p1/tasks',taskPayload);
assert.equal(result.status,201);const taskId=result.body.task.id;
const taskCount=count("SELECT COUNT(*) count FROM project_tasks WHERE organization_id='org' AND operation_key='task-key-0001'");
const taskAuditCount=count("SELECT COUNT(*) count FROM audit_logs WHERE organization_id='org' AND action='task.created' AND entity_id=?",taskId);
result=await call('lead','POST','/api/projects/p1/tasks',taskPayload);
assert.equal(result.status,200);assert.equal(result.body.replayed,true);assert.equal(count("SELECT COUNT(*) count FROM project_tasks WHERE organization_id='org' AND operation_key='task-key-0001'"),taskCount);assert.equal(count("SELECT COUNT(*) count FROM audit_logs WHERE organization_id='org' AND action='task.created' AND entity_id=?",taskId),taskAuditCount);
result=await call('lead','POST','/api/projects/p1/tasks',{...taskPayload,description:'Contenu différent'});
assert.equal(result.status,409,'même clé + tâche différente = 409');assert.equal(count("SELECT COUNT(*) count FROM project_tasks WHERE organization_id='org' AND operation_key='task-key-0001'"),1);

result=await call('worker','GET','/api/tasks');
assert.equal(result.status,200);assert.ok(result.body.tasks.some(task=>task.id===taskId),'la tâche attribuée apparaît dans Tâches');
result=await call('worker','PATCH','/api/tasks/'+taskId,{status:'in_progress'});
assert.equal(result.status,200);
result=await call('worker','PATCH','/api/tasks/'+taskId,{status:'done'});
assert.equal(result.status,200);
result=await call('lead','POST','/api/tasks/'+taskId+'/validate',{});
assert.equal(result.status,409,'validation interdite si checklist incomplète');
result=await call('worker','PATCH','/api/tasks/'+taskId,{checklist:[{id:'c1',label:'Matériel prêt',done:true}]});
assert.equal(result.status,200);
result=await call('lead','POST','/api/tasks/'+taskId+'/validate',{});
assert.equal(result.status,200);assert.ok(result.body.task.validatedAt);
result=await call('worker','GET','/api/tasks/'+taskId+'/history');
assert.equal(result.status,200);assert.ok(result.body.events.some(event=>event.type==='task.validated'));

const problemPayload={category:'safety',comment:'Protection de rive manquante',operationKey:'problem-key-0001'};
result=await call('worker','POST','/api/projects/p1/problems',problemPayload);
assert.equal(result.status,201);const problemId=result.body.problem.id;
result=await call('worker','POST','/api/projects/p1/problems',problemPayload);
assert.equal(result.status,200);assert.equal(result.body.replayed,true);
result=await call('worker','POST','/api/projects/p1/problems',{...problemPayload,comment:'Autre problème de sécurité'});
assert.equal(result.status,409,'même clé + signalement différent = 409');
assert.equal(count("SELECT COUNT(*) count FROM project_tasks WHERE organization_id='org' AND task_kind='problem' AND operation_key='problem-key-0001'"),1);
assert.equal(count("SELECT COUNT(*) count FROM audit_logs WHERE organization_id='org' AND action='project_problem.reported' AND entity_id=?",problemId),1);

const notePayload={text:'Ardoises livrées côté cour',visibility:'Équipe et patron',photoDocumentIds:[],operationKey:'note-key-0001'};
result=await call('owner','POST','/api/projects/p1/notes',notePayload);
assert.equal(result.status,201);const noteId=result.body.id;
result=await call('owner','POST','/api/projects/p1/notes',notePayload);
assert.equal(result.status,200);assert.equal(result.body.replayed,true);
result=await call('owner','POST','/api/projects/p1/notes',{...notePayload,visibility:'Patron uniquement'});
assert.equal(result.status,409,'même clé + visibilité différente = 409');
assert.equal(count("SELECT COUNT(*) count FROM field_project_notes WHERE organization_id='org' AND operation_key='note-key-0001'"),1);
assert.equal(count("SELECT COUNT(*) count FROM audit_logs WHERE organization_id='org' AND action='project_note.created' AND entity_id=?",noteId),1);

result=await call('worker','POST','/api/projects/p1/notes',{text:'Remarque terrain sans photo',visibility:'Équipe et patron',operationKey:'note-worker-0001'});
assert.equal(result.status,201);const workerNoteId=result.body.id;
result=await call('worker','PATCH','/api/projects/p1/notes/'+workerNoteId,{text:'Remarque terrain corrigée'});
assert.equal(result.status,200);
result=await call('worker','DELETE','/api/projects/p1/notes/'+workerNoteId);
assert.equal(result.status,200);
assert.ok(db.prepare('SELECT archived_at FROM field_project_notes WHERE id=?').get(workerNoteId).archived_at);

assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'aucune FK cassée');
console.log('field-portal-security-34: portail terrain, RBAC, replay, tâches, remarques, problèmes et devis sans prix couverts');
