import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let failBatchAfter=0;
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){
    database.exec('BEGIN IMMEDIATE');
    try{
      const results=[];
      for(let index=0;index<statements.length;index++){
        if(failBatchAfter&&index===failBatchAfter)throw Error('batch failure injected');
        const statement=statements[index],result=database.prepare(statement._sql).run(...statement._values);
        results.push({meta:{changes:Number(result.changes)}});
      }
      database.exec('COMMIT');
      return results;
    }catch(error){
      database.exec('ROLLBACK');
      throw error;
    }
  }
}};
const stamp='2026-09-25T06:00:00.000Z';
const state={version:3,company:{name:'BatiNova',morningBreakMinutes:15,lunchBreakMinutes:30},people:[
 {id:1,name:'Marc Delcourt'},{id:2,name:'Julien Lambert'},{id:3,name:'David Renard'},{id:4,name:'Anthony Simon'},{id:5,name:'Alex Marchal'}
],teams:[{id:10,name:'Toiture',members:[3,4]},{id:20,name:'Logistique',members:[5]}],jobs:[{id:1,name:'Résidence Meuse',reference:'CH-26017',timeEntries:[]},{id:2,name:'Immeuble Sambre',reference:'CH-26018',timeEntries:[{id:77,team:20,people:[5],date:'2026-09-24',arrival:'08:00',departure:'16:00',note:'Historique legacy'}]}],assignments:[{id:1,date:'2026-09-25',job:1,team:10,people:[3,4]}],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};

database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
const users=[['owner','Marc','Delcourt','1','OWNER'],['manager','Julien','Lambert','2','PROJECT_MANAGER'],['chef','David','Renard','3','TEAM_LEAD'],['worker','Anthony','Simon','4','WORKER'],['outsider','Alex','Marchal','5','WORKER_OUT']];
for(const [user,first,last,person,code] of users){
  database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(user,first,last,stamp,stamp);
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+user,'org',code,code,stamp);
  database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,'org',user,'role-'+user,'active',stamp,stamp,stamp);
  database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('identity-'+user,'org',user,person,user+'@example.test',first+' '+last,'active',stamp,stamp);
}
const permissions={
 manager:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.view.all','time_entries.correction.request','time_entries.correction.review'],
 chef:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.correction.request'],
 worker:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.correction.request'],
 outsider:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.correction.request']
};
for(const [user,codes] of Object.entries(permissions))for(const code of codes)database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+user,code);
for(const [user,project] of [['manager','1'],['manager','2'],['chef','1'],['worker','1'],['outsider','2']])database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org',user,project,'owner',stamp);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,stamp);

const request=async(uid,method,path,payload)=>{const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers:{'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test',...(payload!==undefined?{'content-type':'application/json'}:{})},...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);return{status:response.status,body:await response.json()}};

let assertions=0;const eq=(a,b,m)=>{assert.equal(a,b,m);assertions++},deep=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++},ok=(a,m)=>{assert.ok(a,m);assertions++};

let result=await request('worker','POST','/api/time-entries/arrival',{projectId:'1',teamId:'10',date:'2026-09-25',people:[{personId:'4',arrival:'07:30'}],note:'Début de journée'});
eq(result.status,201);eq(result.body.ids.length,1);const workerEntry=result.body.ids[0];
eq(database.prepare("SELECT COUNT(*) count FROM time_entries WHERE id='legacy-2-77'").get().count,1);eq(database.prepare("SELECT imported_count FROM time_entry_imports WHERE organization_id='org'").get().imported_count,1);
result=await request('worker','POST','/api/time-entries/arrival',{projectId:'1',teamId:'10',date:'2026-09-25',people:[{personId:'3',arrival:'07:30'}]});eq(result.status,403);
result=await request('worker','POST','/api/time-entries/arrival',{projectId:'2',teamId:'20',date:'2026-09-25',people:[{personId:'5',arrival:'07:30'}]});eq(result.status,403);
result=await request('worker','POST','/api/time-entries/arrival',{projectId:'1',teamId:'10',date:'2026-09-25',people:[{personId:'4',arrival:'08:00'}]});eq(result.status,409);
result=await request('worker','GET','/api/time-entries');eq(result.status,200);eq(result.body.entries.length,1);deep(result.body.entries[0].people,[4]);eq(result.body.entries[0].breakMinutes,45);
result=await request('worker','POST','/api/time-entries/'+encodeURIComponent(workerEntry)+'/departure',{departure:'16:00',personIds:['4']});eq(result.status,200);eq(result.body.split,false);
result=await request('worker','POST','/api/time-entries/'+encodeURIComponent(workerEntry)+'/corrections',{personId:'4',arrival:'07:35',departure:'16:00',reason:'Arrivée encodée cinq minutes trop tôt'});eq(result.status,201);const correctionId=result.body.id;
result=await request('outsider','GET','/api/time-entries?project_id=1');eq(result.status,403);
result=await request('manager','GET','/api/time-entries?project_id=2');eq(result.status,200);ok(result.body.entries.some(entry=>entry.id==='legacy-2-77'));
result=await request('manager','POST','/api/time-entry-corrections/'+encodeURIComponent(correctionId)+'/review',{approved:true});eq(result.status,200);eq(result.body.status,'approved');
const corrected=database.prepare('SELECT arrival,departure FROM time_entries WHERE id=?').get(workerEntry);eq(corrected.arrival,'07:35');eq(corrected.departure,'16:00');

const teamState={...state,people:[...state.people,{id:6,name:'Sam Test'}],teams:[{id:10,name:'Toiture',members:[3,4,6]}],assignments:[{id:1,date:'2026-09-26',job:1,team:10,people:[3,4,6]}]};
database.prepare('UPDATE workspace_state SET payload=? WHERE user_id=?').run(JSON.stringify(teamState),'owner');
database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('worker-third','Sam','Test',stamp,stamp);
database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-worker-third','org','WORKER_THIRD','Ouvrier test',stamp);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-worker-third','org','worker-third','role-worker-third','active',stamp,stamp,stamp);
database.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-chef','time_entries.create.team');
database.prepare('UPDATE field_assignments SET assignment_date=?,people_json=? WHERE organization_id=?').run('2026-09-26',JSON.stringify(['3','4','6']),'org');
result=await request('chef','POST','/api/time-entries/arrival',{projectId:'1',teamId:'10',date:'2026-09-26',people:[{personId:'3',arrival:'07:15'},{personId:'4',arrival:'07:15'},{personId:'6',arrival:'07:15'}]});eq(result.status,201);eq(result.body.ids.length,1);const sharedEntry=result.body.ids[0];
result=await request('chef','POST','/api/time-entries/'+encodeURIComponent(sharedEntry)+'/departure',{departure:'15:30',personIds:['3']});eq(result.status,200);eq(result.body.split,true);const closedChef=result.body.id;ok(closedChef!==sharedEntry);
let originalRow=database.prepare('SELECT people_json,departure FROM time_entries WHERE id=?').get(sharedEntry);deep(JSON.parse(originalRow.people_json),['4','6']);eq(originalRow.departure,null);
let splitRow=database.prepare('SELECT people_json,departure FROM time_entries WHERE id=?').get(closedChef);deep(JSON.parse(splitRow.people_json),['3']);eq(splitRow.departure,'15:30');
result=await request('worker','GET','/api/time-entries');eq(result.status,200);ok(result.body.entries.every(entry=>entry.people.every(person=>person===4)));ok(result.body.entries.some(entry=>entry.id===sharedEntry));ok(!result.body.entries.some(entry=>entry.id===closedChef));
result=await request('worker','POST','/api/time-entries/'+encodeURIComponent(sharedEntry)+'/departure',{departure:'16:10',personIds:['4']});eq(result.status,200);
result=await request('chef','POST','/api/time-entries/'+encodeURIComponent(workerEntry)+'/corrections',{personId:'4',arrival:'07:40',departure:'16:00',reason:'Correction demandée par chef'});eq(result.status,201);
result=await request('worker','POST','/api/time-entries/'+encodeURIComponent(workerEntry)+'/corrections',{personId:'3',arrival:'07:45',departure:'16:00',reason:'Tentative autre personne'});eq(result.status,400);

const beforeFailedArrival=database.prepare("SELECT COUNT(*) count FROM time_entries WHERE organization_id='org'").get().count;
const beforeFailedAudit=database.prepare("SELECT COUNT(*) count FROM audit_logs WHERE organization_id='org' AND action='time_entry.arrival'").get().count;
failBatchAfter=1;
result=await request('chef','POST','/api/time-entries/arrival',{projectId:'1',teamId:'10',date:'2026-09-27',people:[{personId:'3',arrival:'07:00'}],note:'Panne transactionnelle injectée'});
failBatchAfter=0;
eq(result.status,500);eq(database.prepare("SELECT COUNT(*) count FROM time_entries WHERE organization_id='org'").get().count,beforeFailedArrival);eq(database.prepare("SELECT COUNT(*) count FROM audit_logs WHERE organization_id='org' AND action='time_entry.arrival'").get().count,beforeFailedAudit);

for(let index=0;index<260;index++)database.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('page-'+String(index).padStart(3,'0'),'org','1','10',JSON.stringify(['4']),'2026-09-20','07:00','15:30',45,'Pagination','worker',stamp,'worker',stamp);
result=await request('worker','GET','/api/time-entries?limit=250');eq(result.status,200);eq(result.body.limit,250);ok(result.body.entries.length<=250);ok(result.body.nextCursor);
const firstPageIds=new Set(result.body.entries.map(entry=>entry.id));
result=await request('worker','GET','/api/time-entries?limit=250&cursor='+encodeURIComponent(result.body.nextCursor));eq(result.status,200);ok(result.body.entries.every(entry=>!firstPageIds.has(entry.id)),'La page suivante ne contient aucun doublon');

result=await request('worker','GET','/api/state');eq(result.status,200);ok(result.body.state.jobs.every(job=>!Object.prototype.hasOwnProperty.call(job,'timeEntries')));
result=await request('worker','PUT','/api/state',{revision:1,state});eq(result.status,403);
const audits=database.prepare("SELECT action FROM audit_logs WHERE organization_id='org'").all().map(row=>row.action);ok(audits.includes('time_entry.arrival'));ok(audits.includes('time_entry.departure'));ok(audits.includes('time_entry.correction_requested'));ok(audits.includes('time_entry.correction_approved'));

console.log(`time-entry-routes-15: ${assertions} assertions réussies`);
