import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const env={DB:{prepare(sql){let values=[];return{bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}}}};
const stamp='2026-09-25T12:00:00.000Z';
const state={version:3,company:{name:'BatiNova'},people:[{id:1,name:'Marc'},{id:2,name:'Julien'},{id:3,name:'Anthony'},{id:4,name:'Alex'},{id:5,name:'David'}],teams:[{id:10,name:'Toiture',members:[3,5]},{id:20,name:'Logistique',members:[4]}],jobs:[{id:1,name:'Résidence Meuse',reference:'CH-26017'},{id:2,name:'Immeuble Sambre',reference:'CH-26018'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
const users=[['owner','Marc','Delcourt','1','OWNER'],['manager','Julien','Lambert','2','MANAGER_TEST'],['worker','Anthony','Simon','3','WORKER_TEST'],['outsider','Alex','Marchal','4','OUTSIDER_TEST'],['teammate','David','Renard','5','TEAMMATE_TEST']];
for(const [user,first,last,person,code] of users){database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(user,first,last,stamp,stamp);database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+user,'org',code,code,stamp);database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,'org',user,'role-'+user,'active',stamp,stamp,stamp);database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('identity-'+user,'org',user,person,user+'@example.test',first+' '+last,'active',stamp,stamp)}
for(const user of ['manager','worker','outsider','teammate'])for(const code of ['workspace.view','projects.view.assigned','messages.view','messages.send'])database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+user,code);
for(const [user,project] of [['manager','1'],['manager','2'],['worker','1'],['outsider','2'],['teammate','1']])database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org',user,project,'owner',stamp);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,stamp);
const request=async(uid,method,path,payload)=>{const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers:{'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test',...(payload!==undefined?{'content-type':'application/json'}:{})},...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);return{status:response.status,body:await response.json()}};
let assertions=0;const eq=(a,b,m)=>{assert.equal(a,b,m);assertions++},ok=(a,m)=>{assert.ok(a,m);assertions++};

let result=await request('owner','POST','/api/conversations',{title:'Toute BatiNova',kind:'company'});eq(result.status,201);const companyId=result.body.id;
result=await request('worker','GET','/api/conversations');eq(result.status,200);ok(result.body.conversations.some(c=>c.id===companyId));
result=await request('outsider','GET','/api/conversations');eq(result.status,200);ok(result.body.conversations.some(c=>c.id===companyId));

result=await request('owner','POST','/api/conversations',{title:'Résidence Meuse',kind:'project',projectId:'1'});eq(result.status,201);const projectId=result.body.id;
result=await request('worker','GET','/api/conversations');ok(result.body.conversations.some(c=>c.id===projectId));
result=await request('outsider','GET','/api/conversations');ok(!result.body.conversations.some(c=>c.id===projectId));
result=await request('worker','POST','/api/messages?conversation_id='+encodeURIComponent(projectId),{body:'Je suis bien sur le chantier.'});eq(result.status,201);
result=await request('outsider','GET','/api/messages?conversation_id='+encodeURIComponent(projectId));eq(result.status,404);
result=await request('outsider','POST','/api/messages?conversation_id='+encodeURIComponent(projectId),{body:'Tentative'});eq(result.status,404);
result=await request('manager','GET','/api/messages?conversation_id='+encodeURIComponent(projectId));eq(result.status,200);eq(result.body.messages.length,1);

result=await request('owner','POST','/api/conversations',{title:'Équipe toiture',kind:'team',teamId:'10',participantIds:['manager']});eq(result.status,201);const teamId=result.body.id;
result=await request('worker','GET','/api/conversations');ok(result.body.conversations.some(c=>c.id===teamId));
result=await request('teammate','GET','/api/conversations');ok(result.body.conversations.some(c=>c.id===teamId));
result=await request('manager','GET','/api/conversations');ok(result.body.conversations.some(c=>c.id===teamId));
result=await request('outsider','GET','/api/conversations');ok(!result.body.conversations.some(c=>c.id===teamId));

result=await request('owner','POST','/api/conversations',{title:'Équipe chantier Meuse',kind:'team',teamId:'10',projectId:'1',participantIds:['outsider']});eq(result.status,400);
result=await request('owner','POST','/api/conversations',{title:'Équipe inconnue',kind:'team',teamId:'999'});eq(result.status,400);
result=await request('owner','POST','/api/conversations',{title:'Chantier inconnu',kind:'project',projectId:'999'});eq(result.status,400);

result=await request('owner','POST','/api/conversations',{title:'Privé Anthony',kind:'direct',participantPersonIds:['3']});eq(result.status,201);const directId=result.body.id;
result=await request('worker','GET','/api/conversations');ok(result.body.conversations.some(c=>c.id===directId));
result=await request('manager','GET','/api/conversations');ok(!result.body.conversations.some(c=>c.id===directId));
result=await request('manager','GET','/api/messages?conversation_id='+encodeURIComponent(directId));eq(result.status,404);
result=await request('worker','POST','/api/messages?conversation_id='+encodeURIComponent(directId),{body:'Message privé'});eq(result.status,201);
result=await request('worker','GET','/api/messages?conversation_id='+encodeURIComponent(directId));eq(result.status,200);eq(result.body.messages.length,1);

result=await request('owner','POST','/api/conversations',{title:'Privé vide',kind:'direct'});eq(result.status,400);
result=await request('worker','POST','/api/conversations',{title:'Création interdite',kind:'company'});eq(result.status,403);
const audits=database.prepare("SELECT action FROM audit_logs WHERE organization_id='org'").all().map(row=>row.action);ok(audits.includes('conversation.created'));ok(audits.includes('message.created'));
const row=database.prepare('SELECT project_id,scope_project_id FROM conversations WHERE id=?').get(projectId);eq(row.project_id,null);eq(row.scope_project_id,'1');

console.log(`conversation-scope-15: ${assertions} assertions réussies`);
