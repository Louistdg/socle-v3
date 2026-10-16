import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){database.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements){const result=database.prepare(statement._sql).run(...statement._values);results.push({meta:{changes:Number(result.changes)}})}database.exec('COMMIT');return results}catch(error){database.exec('ROLLBACK');throw error}}
}};
const stamp='2026-10-01T06:00:00.000Z';
const state={version:3,company:{name:'Atelier Horizon',morningBreakMinutes:0,lunchBreakMinutes:30},people:[{id:'p-owner',name:'Patron'},{id:'p-manager',name:'Gestionnaire'},{id:'p-lead',name:'Chef équipe'},{id:'p-worker',name:'Alex Ouvrier'},{id:'p-other',name:'Sam Autre'}],teams:[{id:'team-a',name:'Équipe A',members:['p-lead','p-worker']},{id:'team-b',name:'Équipe B',members:['p-other']}],jobs:[{id:'job-a',name:'Chantier Alpha',reference:'CH-100',timeEntries:[]},{id:'job-b',name:'Chantier Beta',reference:'CH-200',timeEntries:[]}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};

database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','Atelier Horizon','Atelier Horizon','BE','EUR',stamp,stamp);
const users=[['owner','Patron','Test','p-owner','OWNER'],['manager','Gestionnaire','Test','p-manager','PROJECT_MANAGER'],['lead','Chef','Test','p-lead','TEAM_LEAD'],['worker','Alex','Ouvrier','p-worker','WORKER'],['other','Sam','Autre','p-other','WORKER_OTHER']];
for(const [user,first,last,person,code] of users){database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(user,first,last,stamp,stamp);database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+user,'org',code,code,stamp);database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,'org',user,'role-'+user,'active',stamp,stamp,stamp);database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('identity-'+user,'org',user,person,user+'@example.test',first+' '+last,'active',stamp,stamp);}
const permissions={manager:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.view.all','time_entries.correction.request','time_entries.correction.review'],lead:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.view.team','time_entries.create.team','time_entries.correction.request','time_entries.correction.review'],worker:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.correction.request'],other:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.correction.request']};
for(const [user,codes] of Object.entries(permissions))for(const code of codes)database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+user,code);
for(const user of ['manager','lead','worker','other'])for(const project of ['job-a','job-b'])database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org',user,project,'owner',stamp);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,stamp);
for(const [id,name] of [['p-worker','Alex Ouvrier'],['p-other','Sam Autre']])database.prepare('INSERT INTO hr_people(id,organization_id,display_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,'org',name,stamp,stamp);
for(const [id,date,team,project,people] of [['assignment-1','2026-10-01','team-a','job-a',['p-worker']],['assignment-2','2026-10-02','team-a','job-a',['p-worker']],['assignment-3','2026-10-03','team-b','job-b',['p-other']]])database.prepare('INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'org',date,team,project,JSON.stringify(people),'owner',stamp,'owner',stamp);
database.prepare('INSERT INTO planning_absences(organization_id,id,person_id,absence_type,starts_at,ends_at,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('org','absence-1','p-worker','leave','2026-10-02T07:00','2026-10-02T16:00','approved','Congé','owner',stamp,'owner',stamp);
const insertEntry=({id,project='job-a',team='team-a',people,date,arrival,departure=null,breakMinutes=0,note=''})=>database.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'org',project,team,JSON.stringify(people),date,arrival,departure,breakMinutes,note,'owner',stamp,'owner',stamp);
insertEntry({id:'entry-worker-1',people:['p-worker'],date:'2026-10-01',arrival:'07:00',departure:'15:30',breakMinutes:30});
insertEntry({id:'entry-sav',people:['p-worker'],date:'2026-10-01',arrival:'16:00',departure:'17:00',note:'SAV fuite client'});
insertEntry({id:'entry-open',people:['p-worker'],date:'2026-10-04',arrival:'07:00'});

const request=async(uid,method,path,payload)=>{const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers:{'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test',...(payload!==undefined?{'content-type':'application/json'}:{})},...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);return{status:response.status,body:await response.json()}};
const getMonth=(uid)=>request(uid,'GET','/api/time-entries/monthly?month=2026-10');

let result=await getMonth('owner');
assert.equal(result.status,200,'le patron doit pouvoir ouvrir le bilan du mois');
assert.equal(result.body.month,'2026-10');
assert.equal(result.body.summary.totalHours,9,'les heures par personne soustraient la pause et incluent le SAV');
assert.equal(result.body.summary.openEntries,1,'un départ manquant reste à traiter avant l’archivage');
assert.equal(result.body.summary.plannedWithoutPunch,1,'une journée planifiée sans pointage est à vérifier, pas classée absente');
assert.equal(result.body.summary.declaredAbsences,1,'seule l’absence approuvée est comptée comme absence');
assert.equal(result.body.people.find(person=>person.personId==='p-worker').hours,9);
assert.equal(result.body.projects.find(project=>project.projectId==='job-a').hours,9);
assert.ok(result.body.entries.some(entry=>entry.note==='SAV fuite client'),'une intervention non planifiée reste dans le relevé');

result=await getMonth('worker');
assert.equal(result.status,200);
assert.deepEqual(result.body.people.map(person=>person.personId),['p-worker'],'un ouvrier ne voit que son propre bilan');
assert.ok(result.body.entries.every(entry=>entry.people.includes('p-worker')),'aucun pointage d’un collègue ne fuit dans l’historique personnel');
result=await getMonth('lead');
assert.equal(result.status,200,'un chef d’équipe peut consulter son équipe');
assert.deepEqual(result.body.people.map(person=>person.personId),['p-worker'],'le chef d’équipe ne voit que les membres de son équipe');
assert.ok(result.body.entries.every(entry=>entry.people.includes('p-worker')),'le détail des pointages reste limité à son équipe');
assert.equal(result.body.canClose,false,'le chef d’équipe ne peut pas archiver les heures de toute l’entreprise');
result=await getMonth('manager');
assert.equal(result.status,200,'le gestionnaire peut consulter les chantiers qui lui sont affectés');
assert.deepEqual(result.body.projects.map(project=>project.projectId),['job-a'],'le récapitulatif ne compte que les chantiers avec des heures terminées');
assert.ok(result.body.missingPunches.some(item=>item.projectNames.includes('Chantier Beta')),'le chantier accessible sans pointage reste visible dans les éléments à vérifier');
assert.equal(result.body.canEdit,true,'le gestionnaire conserve le droit de traiter les corrections autorisées');

result=await request('worker','POST','/api/time-entries/monthly/close',{month:'2026-10'});
assert.equal(result.status,403,'un ouvrier ne peut pas clôturer le mois');
result=await request('lead','POST','/api/time-entries/monthly/close',{month:'2026-10'});
assert.equal(result.status,403,'un chef d’équipe ne peut pas clôturer toute l’entreprise');
result=await request('owner','POST','/api/time-entries/monthly/close',{month:'2026-10'});
assert.equal(result.status,409,'le mois ne peut pas être archivé tant qu’un départ reste ouvert');
assert.equal(database.prepare("SELECT COUNT(*) count FROM time_entries WHERE organization_id='org' AND archived_at IS NOT NULL").get().count,0,'un refus de clôture ne doit archiver aucune ligne');

database.prepare("UPDATE time_entries SET departure='15:00' WHERE id='entry-open'").run();
result=await request('owner','POST','/api/time-entries/monthly/close',{month:'2026-10'});
assert.equal(result.status,409,'le patron doit examiner et confirmer les journées sans pointage');
assert.equal(result.body.plannedWithoutPunch,1);
result=await request('owner','POST','/api/time-entries/monthly/close',{month:'2026-10',confirmMissingPunches:true});
assert.equal(result.status,200);
assert.equal(result.body.archivedEntries,3);
assert.equal(database.prepare("SELECT COUNT(*) count FROM time_entries WHERE organization_id='org' AND archived_at IS NOT NULL").get().count,3);
result=await request('worker','GET','/api/time-entries?from=2026-10-01&to=2026-10-31&include_archived=1');
assert.equal(result.status,200);
assert.equal(result.body.entries.length,3,'l’ouvrier garde accès à son historique après archivage');
assert.ok(result.body.entries.every(entry=>entry.archivedAt),'l’historique indique que les pointages sont archivés');

result=await request('worker','POST','/api/time-entries/entry-worker-1/corrections',{personId:'p-worker',arrival:'07:15',departure:'15:30',reason:'Correction après clôture'});
assert.equal(result.status,201,'un ouvrier peut encore demander une correction historique');
result=await request('manager','POST','/api/time-entry-corrections/'+encodeURIComponent(result.body.id)+'/review',{approved:true});
assert.equal(result.status,200,'un responsable autorisé peut corriger un mois archivé');
assert.equal(database.prepare("SELECT arrival FROM time_entries WHERE id='entry-worker-1'").get().arrival,'07:15');
assert.ok(database.prepare("SELECT archived_at FROM time_entries WHERE id='entry-worker-1'").get().archived_at,'la correction ne retire pas le pointage de l’archive');
result=await getMonth('owner');
assert.equal(result.body.summary.totalHours,16.75,'le bilan mensuel est recalculé après correction');
assert.equal(result.body.closedAt!==null,true,'la correction ne rouvre pas le mois archivé');

insertEntry({id:'entry-team-split',people:['p-worker','p-other'],date:'2026-09-15',arrival:'07:00',departure:'10:00'});
result=await request('owner','POST','/api/time-entries/monthly/close',{month:'2026-09'});
assert.equal(result.status,200,'un autre mois terminé peut être archivé indépendamment');
result=await request('worker','POST','/api/time-entries/entry-team-split/corrections',{personId:'p-worker',arrival:'07:15',departure:'10:00',reason:'Correction ciblée après archivage'});
assert.equal(result.status,201);
result=await request('manager','POST','/api/time-entry-corrections/'+encodeURIComponent(result.body.id)+'/review',{approved:true});
assert.equal(result.status,200);
const splitArchived=database.prepare('SELECT people_json,archived_at FROM time_entries WHERE id=?').get(result.body.resultEntryId);
assert.deepEqual(JSON.parse(splitArchived.people_json),['p-worker'],'la correction partagée crée une ligne distincte pour la personne concernée');
assert.ok(splitArchived.archived_at,'une correction partagée reste dans l’archive du mois');

console.log('time-entry-monthly-20261012: accès, calcul, absence, clôture et correction historique validés.');
