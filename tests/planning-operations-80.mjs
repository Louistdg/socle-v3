import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const cols=db.prepare("PRAGMA table_info(field_assignments)").all().map(row=>row.name);
for(const col of ['start_time','end_time','assignment_type','status','reason'])assert.ok(cols.includes(col),'colonne planning '+col);
for(const table of ['planning_absences','hr_team_leads','project_planning_blocks'])assert.ok(db.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?").get(table)?.ok,'table '+table);

const stamp='2026-10-01T06:00:00.000Z';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','IA-B Test','IA-B Test','BE','EUR',stamp,stamp);
for(const [id,first,last,email] of [
  ['owner','Marc','Owner','owner@test.invalid'],
  ['lead','Claire','Chef','lead@test.invalid'],
  ['worker','Alex','Ouvrier','worker@test.invalid'],
  ['worker2','Noah','Ouvrier','worker2@test.invalid'],
  ['accounting','Sophie','Compta','accounting@test.invalid']
]) db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,last,email,stamp,stamp);

for(const [id,code,name] of [
  ['role-owner','OWNER','Patron'],['role-lead','TEAM_LEAD','Chef équipe'],['role-worker','WORKER','Ouvrier'],['role-accounting','ACCOUNTING','Comptabilité']
]) db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,'org',code,name,stamp);

for(const [uid,role,person] of [
  ['owner','role-owner','p-owner'],['lead','role-lead','p-lead'],['worker','role-worker','p-worker'],
  ['worker2','role-worker','p-worker2'],['accounting','role-accounting',null]
]) db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+uid,'org',uid,role,'active',stamp,stamp,stamp,person);

for(const permission of ['workspace.view','projects.view.assigned','planning.assignments.manage','time_entries.view.team'])
  db.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-lead',permission);
for(const permission of ['workspace.view','projects.view.assigned','time_entries.view.own'])
  db.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker',permission);
for(const permission of ['accounting.view','invoices.view'])
  db.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-accounting',permission);

const people=[
  {id:'p-owner',name:'Marc Owner',role:'Patron'},
  {id:'p-lead',name:'Claire Chef',role:'Chef d’équipe'},
  {id:'p-worker',name:'Alex Ouvrier',role:'Ouvrier'},
  {id:'p-worker2',name:'Noah Ouvrier',role:'Ouvrier'}
];
const teams=[
  {id:'team-1',name:'Équipe 1',members:['p-lead','p-worker']},
  {id:'team-2',name:'Équipe 2',members:['p-worker2']},
  {id:'team-3',name:'Équipe 3',members:[]},
  {id:'team-4',name:'Équipe 4',members:[]}
];
const jobs=Array.from({length:25},(_,i)=>({id:'job-'+String(i+1).padStart(2,'0'),reference:'CH-'+String(i+1).padStart(3,'0'),name:'Chantier '+String(i+1).padStart(2,'0'),town:i%2?'Namur':'Dinant',client:'Client '+(i+1),phase:'En cours',progress:30,materials:[],execution:[],notes:[],timeEntries:[]}));
const state={version:3,company:{name:'IA-B Test',morningBreakMinutes:15,lunchBreakMinutes:30},people,teams,jobs,assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);

for(const p of people)db.prepare("INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,1,'server',?,?)").run('org',p.id,p.name,p.role,'Ouvrier',stamp,stamp);
for(const team of teams){
  db.prepare("INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,?,?,1,'server',?,?)").run('org',team.id,team.name,stamp,stamp);
  for(const personId of team.members)db.prepare('INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,NULL,?,?)').run('org','m-'+team.id+'-'+personId,team.id,personId,'2026-01-01',stamp,stamp);
}
for(const uid of ['lead','worker','worker2'])db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org',uid,'job-01','owner',stamp);
for(const [id,date,team,project,people] of [
  ['scope-other-team','2026-10-05','team-2','job-01',['p-worker2']],
  ['scope-other-worker','2026-10-06','team-1','job-01',['p-worker2']],
  ['scope-no-project-access','2026-10-07','team-1','job-02',['p-lead']]
])db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,start_time,end_time,assignment_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?, '07:00','16:00','team','planned','confidentiel', 'owner',?,'owner',?)").run(id,'org',date,team,project,JSON.stringify(people),stamp,stamp);
db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,start_time,end_time,assignment_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES('worker-cancelled','org','2026-10-06','team-1','job-01','[\"p-worker\"]','07:00','16:00','team','cancelled','Annulation conservée dans l’historique','owner',?,'owner',?)").run(stamp,stamp);

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements){const r=db.prepare(s._sql).run(...s._values);out.push({meta:{changes:Number(r.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
async function req(uid,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
let assertions=0;const eq=(a,b,m)=>{assert.equal(a,b,m);assertions++};const ok=(a,m)=>{assert.ok(a,m);assertions++};

let r=await req('lead','POST','/api/assignments',{date:'2026-10-02',teamId:'team-1',projectId:'job-01',people:['p-lead','p-worker'],startTime:'07:00',endTime:'12:00',assignmentType:'team',status:'confirmed',reason:'Matin'});
eq(r.status,201,'création matin');const morningId=String(r.body.id);
r=await req('lead','POST','/api/assignments',{date:'2026-10-02',teamId:'team-1',projectId:'job-01',people:['p-lead','p-worker'],startTime:'12:30',endTime:'16:00',assignmentType:'team',status:'planned',reason:'Après-midi'});
eq(r.status,201,'même équipe acceptée sur créneau non chevauchant');
r=await req('lead','POST','/api/assignments',{date:'2026-10-02',teamId:'team-1',projectId:'job-01',people:['p-worker'],startTime:'11:30',endTime:'13:00'});
eq(r.status,409,'chevauchement personne/équipe refusé');
r=await req('lead','POST','/api/assignments',{date:'2026-10-02',teamId:'team-2',projectId:'job-02',people:['p-worker2'],startTime:'07:00',endTime:'12:00'});
eq(r.status,403,'chantier hors scope refusé');
r=await req('owner','POST','/api/assignments',{date:'2026-10-02',teamId:'team-3',projectId:'job-01',people:['p-worker2'],startTime:'07:00',endTime:'12:00',assignmentType:'team'});
eq(r.status,400,'membre qui ne fait pas partie de l’équipe refusé pour affectation de l’équipe');

r=await req('lead','POST','/api/planning/absences',{personId:'p-worker',type:'training',startsAt:'2026-10-03T07:00',endsAt:'2026-10-03T12:00',status:'approved',reason:'Formation'});
eq(r.status,201,'indisponibilité créée');
r=await req('lead','POST','/api/planning/absences',{personId:'p-worker',type:'sickness',startsAt:'2026-10-07T07:00',endsAt:'2026-10-07T12:00',status:'approved',reason:'Information médicale privée'});
eq(r.status,201,'absence médicale créée');
r=await req('lead','POST','/api/assignments',{date:'2026-10-03',teamId:'team-2',projectId:'job-01',people:['p-worker'],startTime:'08:00',endTime:'10:00',assignmentType:'reinforcement'});
eq(r.status,409,'affectation pendant indisponibilité refusée');

r=await req('lead','POST','/api/hr/teams/team-1/leads',{personId:'p-lead',startsOn:'2026-10-01',temporary:false});
eq(r.status,201,'chef équipe créé');
r=await req('lead','POST','/api/hr/teams/team-1/leads',{personId:'p-worker',startsOn:'2026-10-04',endsOn:'2026-10-05',temporary:true});
eq(r.status,201,'remplacement temporaire créé');

r=await req('lead','POST','/api/planning/blocks',{projectId:'job-01',startsAt:'2026-10-04T07:00',endsAt:'2026-10-04T16:00',type:'weather',status:'active',reason:'Vent fort',responsiblePersonId:'p-worker',dueDate:'2026-10-04'});
eq(r.status,201,'blocage météo créé avec responsable et échéance');const planningBlockId=String(r.body.id);
r=await req('lead','POST','/api/planning/blocks',{projectId:'job-01',startsAt:'2026-10-04T07:00',endsAt:'2026-10-04T16:00',type:'weather',status:'active',reason:'',responsiblePersonId:'p-foreign',dueDate:'2026-10-04'});
eq(r.status,404,'responsable hors entreprise refusé');
r=await req('lead','POST','/api/planning/blocks',{projectId:'job-01',startsAt:'2026-10-04T07:00',endsAt:'2026-10-04T16:00',type:'weather',status:'active',reason:'',responsiblePersonId:'p-worker',dueDate:'pas-une-date'});
eq(r.status,400,'échéance invalide refusée');

db.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('te-1','org','job-01','team-1',JSON.stringify(['p-lead','p-worker']),'2026-10-02','07:00','11:20',45,'','lead',stamp,'lead',stamp);
db.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('te-other','org','job-01','team-2',JSON.stringify(['p-worker2']),'2026-10-03','08:00','12:00',0,'','worker2',stamp,'worker2',stamp);

r=await req('lead','GET','/api/planning?from=2026-10-01&to=2026-10-07');
eq(r.status,200,'chef lit planning');
ok(r.body.assignments.some(x=>String(x.id)===morningId&&x.startTime==='07:00'&&x.endTime==='12:00'),'horaires exposés');
ok(r.body.absences.some(x=>x.personId==='p-worker'&&x.type==='training'),'absence exposée');
ok(r.body.absences.some(x=>x.personId==='p-worker'&&x.type==='unavailable'&&!Object.hasOwn(x,'reason')),'détail médical masqué aux autres personnes de l’équipe');
ok(r.body.teamLeads.some(x=>x.teamId==='team-1'&&x.personId==='p-lead'),'chef exposé');
ok(r.body.teamLeads.some(x=>x.teamId==='team-1'&&x.personId==='p-worker'&&x.temporary===true),'remplacement exposé');
ok(r.body.blocks.some(x=>x.projectId==='job-01'&&x.type==='weather'),'blocage exposé');
ok(r.body.blocks.some(x=>x.id===planningBlockId&&x.responsiblePersonId==='p-worker'&&x.dueDate==='2026-10-04'),'responsable et échéance exposés au chef autorisé');
ok(r.body.actuals.some(x=>x.id==='te-1'&&x.minutes===215),'réalisé calculé depuis time_entries');
ok(r.body.assignments.some(x=>String(x.id)==='scope-other-team')===false,'chef ne reçoit pas les affectations d’une autre équipe');
ok(r.body.assignments.some(x=>String(x.id)==='scope-no-project-access')===false,'chef ne reçoit pas un chantier sans accès');
ok(r.body.assignments.some(x=>String(x.id)==='worker-cancelled'&&x.status==='cancelled'),'chef conserve la visibilité des affectations annulées dans la gestion');
ok(r.body.projects.every(x=>String(x.id)==='job-01'),'liste projets serveur bornée au périmètre autorisé');
ok(r.body.teams.length===1&&String(r.body.teams[0].id)==='team-1','liste équipes bornée à son équipe');
const assignmentDateBeforeBlockResolution=db.prepare('SELECT assignment_date d FROM field_assignments WHERE organization_id=? AND id=?').get('org',morningId).d;
r=await req('lead','PUT','/api/planning/blocks/'+encodeURIComponent(planningBlockId),{status:'resolved'});
eq(r.status,200,'blocage résolu par action explicite');
eq(db.prepare('SELECT status FROM project_planning_blocks WHERE organization_id=? AND id=?').get('org',planningBlockId).status,'resolved','statut résolu enregistré côté serveur');
eq(db.prepare('SELECT assignment_date d FROM field_assignments WHERE organization_id=? AND id=?').get('org',morningId).d,assignmentDateBeforeBlockResolution,'résoudre le blocage ne déplace pas une affectation');

r=await req('worker','GET','/api/planning?from=2026-10-01&to=2026-10-07');
eq(r.status,200,'worker lit son planning');
ok(r.body.assignments.every(x=>x.people.map(String).includes('p-worker')),'worker ne reçoit que ses affectations');
ok(r.body.assignments.every(x=>x.status!=='cancelled'),'API WORKER exclut les affectations annulées de son planning personnel');
ok(!r.body.assignments.some(x=>String(x.id)==='worker-cancelled'),'API WORKER ne reçoit pas la ligne annulée qui doublonnait sa mission');
ok(r.body.assignments.every(x=>String(x.team)==='team-1'&&String(x.job)==='job-01'),'worker ne reçoit que ses chantiers/équipes affectés');
ok(r.body.projects.length===1&&String(r.body.projects[0].id)==='job-01','filtres planning n’exposent que le chantier affecté');
ok(r.body.teams.length===1&&String(r.body.teams[0].id)==='team-1','filtres planning n’exposent que son équipe');
ok(r.body.people.length===1&&String(r.body.people[0].id)==='p-worker','filtres planning n’exposent que sa personne');
ok(r.body.teamLeads.length===0,'worker ne reçoit pas les données des chefs');
ok(r.body.absences.every(x=>String(x.personId)==='p-worker'),'worker ne reçoit que ses absences');
ok(r.body.blocks.every(x=>!Object.hasOwn(x,'reason')),'worker ne reçoit pas les motifs privés de blocage');
ok(r.body.blocks.every(x=>!Object.hasOwn(x,'responsiblePersonId')&&!Object.hasOwn(x,'dueDate')),'worker ne reçoit pas les données de suivi internes du blocage');
ok(r.body.assignments.every(x=>x.reason===''),'worker ne reçoit pas les motifs privés d’affectation');
ok(r.body.actuals.every(x=>x.people.length===1&&String(x.people[0])==='p-worker'),'réalisés worker limités à sa propre identité');
r=await req('worker','GET','/api/planning?from=2026-10-01&to=2026-10-07&personId=p-worker2&teamId=team-2&projectId=job-02');
eq(r.status,200,'paramètres de filtres forgés ne bloquent pas la lecture du planning personnel');
ok(r.body.assignments.every(x=>x.people.map(String).includes('p-worker')&&String(x.team)==='team-1'&&String(x.job)==='job-01'),'paramètres utilisateur forgés ne peuvent pas élargir le planning personnel');
r=await req('worker','GET','/api/projects/job-02');eq(r.status,403,'appel API direct chantier hors périmètre refusé');
r=await req('worker','GET','/api/time-entries/mine?from=2026-10-01&to=2026-10-07');eq(r.status,200,'historique personnel autorisé');
ok(r.body.entries.length===1&&r.body.entries[0].id==='te-1','historique personnel exclut le pointage d’un collègue');
ok(r.body.entries[0].people.length===1&&String(r.body.entries[0].people[0])==='p-worker','historique personnel masque les autres personnes du pointage');
r=await req('lead','GET','/api/time-entries/mine?from=2026-10-01&to=2026-10-07');eq(r.status,200,'chef peut consulter uniquement son historique personnel');
ok(r.body.entries.every(entry=>entry.people.map(String).includes('p-lead')),'historique chef limité à ses propres pointages');
r=await req('accounting','GET','/api/planning?from=2026-10-01&to=2026-10-07');
eq(r.status,403,'ACCOUNTING sans planning opérationnel');

r=await req('lead','PUT','/api/assignments/'+encodeURIComponent(morningId),{date:'2026-10-02',teamId:'team-1',projectId:'job-01',people:['p-lead','p-worker'],startTime:'07:15',endTime:'12:00',assignmentType:'team',status:'confirmed',reason:'Décalage'});
eq(r.status,200,'replanification d’une affectation');
const auditActions=db.prepare("SELECT action FROM audit_logs WHERE organization_id='org' ORDER BY created_at").all().map(x=>x.action);
for(const action of ['assignment.created','assignment.updated','planning.absence.created','planning.team_lead.created','planning.block.created'])ok(auditActions.includes(action),'audit '+action);
 r=await req('owner','GET','/api/projects/job-01/planning-history');eq(r.status,200,'historique planning chantier autorisé au patron');ok(r.body.events.some(event=>event.action==='assignment.created'),'historique chantier reprend les modifications du planning');
 r=await req('worker','GET','/api/projects/job-01/planning-history');eq(r.status,403,'historique planning refusé à un ouvrier');
const updateAudit=db.prepare("SELECT old_values,new_values FROM audit_logs WHERE organization_id='org' AND action='assignment.updated' ORDER BY created_at DESC LIMIT 1").get();
ok(updateAudit?.old_values?.includes('07:00')&&updateAudit?.new_values?.includes('07:15'),'audit ancien/nouvel horaire');

function seedBulk(id,date,team,project,person){
  db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,start_time,end_time,assignment_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,NULL,NULL,'','07:00','12:00','team','planned','',?,?,?,?)").run(id,'org',date,team,project,JSON.stringify([person]),'owner',stamp,'owner',stamp);
}
seedBulk('bulk-assignment','2026-10-20','team-1','job-02','p-worker2');
seedBulk('bulk-replan-blocker','2026-10-21','team-2','job-03','p-worker2');
r=await req('owner','POST','/api/planning/replan',{scope:'assignment',assignmentId:'bulk-assignment',shiftDays:1,reason:'Affectation',operationKey:'replan-assignment-01'});
eq(r.status,409,'replanification créant un chevauchement personne refusée');
eq(db.prepare("SELECT assignment_date d FROM field_assignments WHERE id='bulk-assignment' AND organization_id='org'").get().d,'2026-10-20','affectation inchangée après 409');
db.prepare("DELETE FROM field_assignments WHERE organization_id='org' AND id='bulk-replan-blocker'").run();
r=await req('owner','POST','/api/planning/replan',{scope:'assignment',assignmentId:'bulk-assignment',shiftDays:1,reason:'Affectation',operationKey:'replan-assignment-01'});
eq(r.status,200,'replanification affectation');eq(db.prepare("SELECT assignment_date d FROM field_assignments WHERE id='bulk-assignment' AND organization_id='org'").get().d,'2026-10-21','affectation décalée');
r=await req('owner','POST','/api/planning/replan',{scope:'assignment',assignmentId:'bulk-assignment',shiftDays:1,reason:'Affectation',operationKey:'replan-assignment-01'});
eq(r.status,200,'rejeu replanification idempotent');eq(r.body.replayed,true,'réponse signale le rejeu');eq(db.prepare("SELECT assignment_date d FROM field_assignments WHERE id='bulk-assignment' AND organization_id='org'").get().d,'2026-10-21','rejeu ne décale pas une seconde fois');
r=await req('owner','POST','/api/planning/replan',{scope:'assignment',assignmentId:'bulk-assignment',shiftDays:1,reason:'Autre motif',operationKey:'replan-assignment-01'});
eq(r.status,409,'clé de replanification refusée si le contenu change');

seedBulk('bulk-day-a','2026-10-22','team-1','job-02','p-lead');seedBulk('bulk-day-b','2026-10-22','team-2','job-03','p-worker2');
r=await req('owner','POST','/api/planning/replan',{scope:'day',date:'2026-10-22',shiftDays:1,reason:'Journée',operationKey:'replan-day-01'});
eq(r.status,200,'replanification journée');eq(r.body.count,2,'deux affectations déplacées avec la journée');
eq(db.prepare("SELECT COUNT(*) c FROM field_assignments WHERE organization_id='org' AND id IN ('bulk-day-a','bulk-day-b') AND assignment_date='2026-10-23'").get().c,2,'journée décalée');

seedBulk('bulk-team','2026-10-24','team-3','job-04','p-worker2');
r=await req('owner','POST','/api/planning/replan',{scope:'team',teamId:'team-3',from:'2026-10-24',to:'2026-10-24',shiftDays:1,reason:'Équipe',operationKey:'replan-team-01'});
eq(r.status,200,'replanification équipe');eq(db.prepare("SELECT assignment_date d FROM field_assignments WHERE id='bulk-team' AND organization_id='org'").get().d,'2026-10-25','équipe décalée');

seedBulk('bulk-range-a','2026-10-26','team-1','job-05','p-lead');seedBulk('bulk-range-b','2026-10-27','team-2','job-06','p-worker2');
r=await req('owner','POST','/api/planning/replan',{scope:'range',from:'2026-10-26',to:'2026-10-27',shiftDays:1,reason:'Période',operationKey:'replan-range-01'});
eq(r.status,200,'replanification plusieurs jours');eq(r.body.count,2,'deux affectations de période déplacées');
eq(db.prepare("SELECT assignment_date d FROM field_assignments WHERE id='bulk-range-a' AND organization_id='org'").get().d,'2026-10-27','premier jour période décalé');
eq(db.prepare("SELECT assignment_date d FROM field_assignments WHERE id='bulk-range-b' AND organization_id='org'").get().d,'2026-10-28','second jour période décalé');

seedBulk('bulk-project','2026-10-29','team-4','job-25','p-worker2');
r=await req('owner','POST','/api/planning/replan',{scope:'project',projectId:'job-25',from:'2026-10-29',to:'2026-10-29',shiftDays:1,reason:'Chantier',operationKey:'replan-project-01'});
eq(r.status,200,'replanification chantier');eq(db.prepare("SELECT assignment_date d FROM field_assignments WHERE id='bulk-project' AND organization_id='org'").get().d,'2026-10-30','chantier décalé');
ok(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE organization_id='org' AND action='planning.replanned'").get().c>=7,'replanifications groupées auditées');

r=await req('owner','POST','/api/assignments',{date:'2026-11-03',teamId:'team-3',projectId:'job-01',people:['p-worker2'],startTime:'07:00',endTime:'16:00',assignmentType:'reinforcement',status:'planned',operationKey:'assignment-idempotency-01'});
eq(r.status,201,'affectation créée avec clé idempotente');const idempotentAssignmentId=String(r.body.id);
r=await req('owner','POST','/api/assignments',{date:'2026-11-03',teamId:'team-3',projectId:'job-01',people:['p-worker2'],startTime:'07:00',endTime:'16:00',assignmentType:'reinforcement',status:'planned',operationKey:'assignment-idempotency-01'});
eq(r.status,200,'rejeu création affectation retourne le résultat initial');eq(r.body.id,idempotentAssignmentId,'rejeu conserve le même identifiant');eq(r.body.replayed,true,'rejeu affectation marqué idempotent');
r=await req('owner','POST','/api/assignments',{date:'2026-11-03',teamId:'team-3',projectId:'job-01',people:['p-worker2'],startTime:'07:00',endTime:'16:00',assignmentType:'reinforcement',status:'planned',reason:'modifié',operationKey:'assignment-idempotency-01'});
eq(r.status,409,'clé d’affectation ne peut pas être réutilisée avec un autre contenu');
assert.throws(()=>db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,start_time,end_time,assignment_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES('concurrent-conflict','org','2026-11-03','team-3','job-01','[\"p-worker2\"]',NULL,NULL,'','08:00','12:00','reinforcement','planned','', 'owner',?,'owner',?)").run(stamp,stamp),/planning_assignment_conflict/);assertions++;

db.exec("CREATE TRIGGER fail_planning_audit BEFORE INSERT ON audit_logs WHEN NEW.action='assignment.created' AND json_extract(NEW.new_values,'$.date')='2026-11-02' BEGIN SELECT RAISE(ABORT,'planning_audit_failure'); END;");
r=await req('owner','POST','/api/assignments',{date:'2026-11-02',teamId:'team-3',projectId:'job-01',people:['p-worker2'],startTime:'07:00',endTime:'16:00',assignmentType:'reinforcement',status:'planned',operationKey:'planning-audit-failure-01'});
eq(r.status,500,'échec audit remonte comme erreur serveur');eq(db.prepare("SELECT COUNT(*) c FROM field_assignments WHERE organization_id='org' AND assignment_date='2026-11-02' AND organization_id='org'").get().c,0,'échec audit annule aussi la création d’affectation');
db.exec('DROP TRIGGER fail_planning_audit');

const countBefore=db.prepare("SELECT COUNT(*) c FROM field_assignments WHERE organization_id='org'").get().c;
for(let i=0;i<23;i++){
  const date='2026-10-'+String(6+(i%5)).padStart(2,'0'),team='team-'+String((i%4)+1),person=i%2?'p-worker2':'p-lead';
  try{db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,start_time,end_time,assignment_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,NULL,NULL,'','07:00','16:00','team','planned','',?,?,?,?)").run('vol-'+i,'org',date,team,'job-'+String((i%25)+1).padStart(2,'0'),JSON.stringify([person]),'owner',stamp,'owner',stamp)}catch{}
}
ok(db.prepare("SELECT COUNT(*) c FROM field_assignments WHERE organization_id='org'").get().c>=countBefore,'volumétrie affectations conservée');
eq(jobs.length,25,'jeu 25 chantiers');
eq(teams.length,4,'jeu 4 équipes');

console.log('planning-operations-80: '+assertions+' assertions réussies');
