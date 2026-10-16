import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const env={DB:{prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},async batch(statements){database.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=database.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}database.exec('COMMIT');return out}catch(error){database.exec('ROLLBACK');throw error}}}};
const stamp='2026-09-24T21:30:00.000Z',state={version:3,company:{name:'BatiNova'},people:[],teams:[],jobs:[{id:1,reference:'CH-26017'},{id:2,reference:'CH-26018'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
for(const [user,first,last] of [['owner','Marc','Delcourt'],['julien','Julien','Lambert'],['anthony','Anthony','Simon'],['alex','Alex','Marchal']])database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(user,first,last,stamp,stamp);
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [id,code,name,user] of [['role-owner','OWNER','Propriétaire','owner'],['role-julien','PROJECT_MANAGER','Conducteur','julien'],['role-anthony','WORKER','Ouvrier','anthony'],['role-alex','LOGISTICS','Logistique','alex']]){database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,'org',code,name,stamp);database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,'org',user,id,'active',stamp,stamp,stamp)}
for(const [role,permission] of [['role-julien','projects.view.assigned'],['role-julien','tasks.view.assigned'],['role-julien','tasks.manage.project'],['role-julien','tasks.comment.create'],['role-anthony','projects.view.assigned'],['role-anthony','tasks.view.assigned'],['role-anthony','tasks.update.assigned'],['role-anthony','tasks.comment.create'],['role-alex','projects.view.assigned']])database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(role,permission);
for(const [user,project] of [['julien','1'],['julien','4'],['anthony','1'],['alex','1']])database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org',user,project,'owner',stamp);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,stamp);
const request=async(uid,method,path,payload)=>{const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers:{'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test',...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);return{status:response.status,body:await response.json()}};

let result=await request('owner','POST','/api/projects/1/tasks',{title:'Vérifier la zone de travail',description:'Test temporaire',priority:'high',assignedTo:'anthony'});assert.equal(result.status,201);const anthonyTask=result.body.task;assert.equal(anthonyTask.status,'todo');
result=await request('julien','GET','/api/projects/1/tasks');assert.equal(result.status,200);assert.equal(result.body.tasks.length,1);
result=await request('julien','POST','/api/projects/1/tasks',{title:'Préparer le matériel',assignedTo:'julien'});assert.equal(result.status,201);const julienTask=result.body.task;
result=await request('julien','POST','/api/projects/2/tasks',{title:'Accès interdit'});assert.equal(result.status,403);assert.equal(result.body.task,undefined);
result=await request('owner','POST','/api/projects/2/tasks',{title:'Affectation hors périmètre',assignedTo:'anthony'});assert.equal(result.status,400);assert.equal(result.body.task,undefined);
result=await request('alex','GET','/api/projects/1/tasks');assert.equal(result.status,403);
result=await request('anthony','GET','/api/projects/2/tasks');assert.equal(result.status,403);assert.equal(result.body.tasks,undefined);
result=await request('anthony','GET','/api/projects/1/tasks');assert.equal(result.status,200);assert.deepEqual(result.body.tasks.map(task=>task.id),[anthonyTask.id]);
result=await request('anthony','PATCH','/api/tasks/'+anthonyTask.id,{status:'in_progress'});assert.equal(result.status,200);assert.equal(result.body.task.status,'in_progress');
result=await request('anthony','PATCH','/api/tasks/'+anthonyTask.id,{title:'Tentative interdite'});assert.equal(result.status,403);
result=await request('anthony','POST','/api/tasks/'+anthonyTask.id+'/comments',{body:'Je commence la vérification.'});assert.equal(result.status,201);
result=await request('anthony','GET','/api/tasks/'+anthonyTask.id+'/comments');assert.equal(result.status,200);assert.equal(result.body.comments[0].author,'Anthony Simon');
result=await request('anthony','PATCH','/api/tasks/'+julienTask.id,{status:'in_progress'});assert.equal(result.status,403);
const taskCount=database.prepare('SELECT COUNT(*) count FROM project_tasks').get().count,auditRows=database.prepare("SELECT action,old_values,new_values FROM audit_logs WHERE entity_type='project_task' ORDER BY created_at").all();assert.equal(taskCount,2);assert.ok(auditRows.some(row=>row.action==='task.updated'&&JSON.parse(row.old_values).status==='todo'&&JSON.parse(row.new_values).status==='in_progress'));
console.log('task-routes-15: 21 assertions réussies');
