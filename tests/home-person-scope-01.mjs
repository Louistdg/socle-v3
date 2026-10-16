import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-10-05T08:00:00.000Z',org='org-home';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,'BatiNova Scope','BatiNova Scope','BE','EUR',stamp,stamp);

const roles=[['role-owner','OWNER'],['role-lead','TEAM_LEAD'],['role-worker','WORKER']];
for(const [roleId,code] of roles)db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(roleId,org,code,code,stamp);
const people=[
  ['owner','Marc','Delcourt','p-owner','role-owner'],
  ['lead-a','Luc','Chef','p-lead','role-lead'],
  ['david','David','Leclercq','p-david','role-worker'],
  ['olivier','Olivier','Mathieu','p-olivier','role-worker'],
  ['other','Nora','Autre','p-other','role-worker'],
  ['david-twin','David','Leclercq','p-david-twin','role-worker'],
  ['unlinked','Una','SansRoster',null,'role-worker']
];
for(const [uid,first,last,personId,roleId] of people){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(uid,first,last,uid+'@example.test',stamp,stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+uid,org,uid,roleId,'active',stamp,stamp,stamp,personId);
}
for(const permission of ['workspace.view','projects.view.assigned','tasks.view.assigned','tasks.manage.project','messages.view','messages.manage','ui.module.home.view','ui.module.jobs.view','ui.module.actions.view','ui.module.planning.view','ui.module.documents.view','ui.module.fleet.view'])if(db.prepare('SELECT 1 ok FROM permissions WHERE code=?').get(permission))db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-lead',permission);
for(const permission of ['workspace.view','projects.view.assigned','tasks.view.assigned','messages.view','ui.module.home.view','ui.module.jobs.view','ui.module.actions.view','ui.module.planning.view','ui.module.documents.view'])if(db.prepare('SELECT 1 ok FROM permissions WHERE code=?').get(permission))db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker',permission);
db.prepare('INSERT INTO member_access_settings(organization_id,user_id,profile_name,scope,updated_by,updated_at) VALUES(?,?,?,?,?,?)').run(org,'david','Chef d’équipe','Son équipe et ses chantiers','owner',stamp);

const state={
  version:3,
  company:{name:'BatiNova Scope',morningBreakMinutes:15,lunchBreakMinutes:30},
  people:[
    {id:'p-owner',name:'Marc Delcourt',training:[],hr:{permits:[]}},
    {id:'p-lead',name:'Luc Chef',training:['Chef sécurité'],hr:{permits:[]}},
    {id:'p-david',name:'David Leclercq',training:['Échafaudage David'],hr:{permits:[{name:'VCA David',expires:'2026-10-08'}]}},
    {id:'p-olivier',name:'Olivier Mathieu',training:['Nacelle Olivier'],hr:{permits:[{name:'Permis Olivier',expires:'2026-10-07'}]}},
    {id:'p-other',name:'Nora Autre',training:['Secours Nora'],hr:{permits:[]}},
    {id:'p-david-twin',name:'David Leclercq',training:['Homonyme uniquement'],hr:{permits:[]}}
  ],
  teams:[
    {id:'team-a',name:'Équipe A',members:['p-lead','p-david','p-olivier','p-david-twin']},
    {id:'team-b',name:'Équipe B',members:['p-other']}
  ],
  jobs:[
    {id:'p-a',name:'Chantier A',reference:'CHA-A',town:'Namur',phase:'En cours'},
    {id:'p-c',name:'Chantier David',reference:'CHA-D',town:'Dinant',phase:'En cours'},
    {id:'p-b',name:'Chantier autre équipe',reference:'CHA-B',town:'Liège',phase:'En cours'}
  ],
  assignments:[
    {id:'asg-david-a',date:'2026-10-05',team:'team-a',job:'p-a',people:['p-david'],startTime:'07:00',endTime:'16:00'},
    {id:'asg-olivier-a',date:'2026-10-06',team:'team-a',job:'p-a',people:['p-olivier'],startTime:'07:00',endTime:'16:00'},
    {id:'asg-david-c',date:'2026-10-07',team:'team-a',job:'p-c',people:['p-david'],startTime:'07:00',endTime:'16:00'},
    {id:'asg-twin-a',date:'2026-10-08',team:'team-a',job:'p-a',people:['p-david-twin'],startTime:'07:00',endTime:'16:00'},
    {id:'asg-other-b',date:'2026-10-05',team:'team-b',job:'p-b',people:['p-other'],startTime:'07:00',endTime:'16:00'}
  ],
  quotes:[],assets:[],tasks:[],dossiers:[],
  reminders:[
    {id:'rem-david',title:'Formation sécurité David',date:'2026-10-08',kind:'Formation',state:'todo',linkType:'person',linkId:'p-david',recipientIds:['p-david']},
    {id:'rem-olivier',title:'Formation sécurité Olivier',date:'2026-10-07',kind:'Formation',state:'todo',linkType:'person',linkId:'p-olivier',recipientIds:['p-olivier']},
    {id:'rem-twin',title:'Obligation homonyme',date:'2026-10-08',kind:'Formation',state:'todo',linkType:'person',linkId:'p-david-twin',recipientIds:['p-david-twin']},
    {id:'rem-owner',title:'Réunion direction confidentielle',date:'2026-10-09',kind:'Direction',state:'todo',linkType:'company',linkId:0}
  ]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,'owner',stamp,stamp);

for(const [uid,project] of [
  ['lead-a','p-a'],['lead-a','p-c'],
  ['david','p-a'],['david','p-c'],
  ['olivier','p-a'],
  ['david-twin','p-a'],
  ['other','p-b']
])db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,uid,project,'owner',stamp);

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

async function call(uid,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':org,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
async function createTask({project,title,assignedTo,people,operationKey}){
  const r=await call('owner','POST','/api/projects/'+project+'/tasks',{title,description:title,assignedTo,people,priority:title.includes('URGENT')?'urgent':'normal',dueAt:'2026-10-08',checklist:[],materials:[],operationKey});
  assert.ok([200,201].includes(r.status),title+' créée');
  return r.body.task.id;
}

await createTask({project:'p-a',title:'Tâche David',assignedTo:'david',people:['david'],operationKey:'home-david'});
await createTask({project:'p-a',title:'Tâche Olivier URGENT',assignedTo:'olivier',people:['olivier'],operationKey:'home-olivier'});
await createTask({project:'p-a',title:'Tâche équipe A',assignedTo:null,people:['lead-a','david','olivier','david-twin'],operationKey:'home-team-a'});
await createTask({project:'p-b',title:'Tâche autre équipe URGENT',assignedTo:'other',people:['other'],operationKey:'home-other'});
await createTask({project:'p-c',title:'Tâche chantier David',assignedTo:'david',people:['david'],operationKey:'home-david-project'});
await createTask({project:'p-a',title:'Tâche chantier sans David',assignedTo:'lead-a',people:['lead-a'],operationKey:'home-no-david'});
await createTask({project:'p-a',title:'Tâche homonyme David',assignedTo:'david-twin',people:['david-twin'],operationKey:'home-david-homonym'});

let r=await call('owner','POST','/api/conversations',{title:'Direct David',kind:'direct',participantPersonIds:['p-david']});
assert.equal(r.status,201);
r=await call('owner','POST','/api/conversations',{title:'Direct Olivier',kind:'direct',participantPersonIds:['p-olivier']});
assert.equal(r.status,201);
r=await call('owner','POST','/api/conversations',{title:'Équipe A partagée',kind:'team',teamId:'team-a',participantPersonIds:[]});
assert.equal(r.status,201);

const path='/api/home-overview?from=2026-10-05&to=2026-10-09';
const titles=body=>body.tasks.map(item=>item.title).sort();
const obligationTitles=body=>body.obligations.map(item=>item.title).sort();
const assignmentIds=body=>body.assignments.map(item=>item.id).sort();
const messageTitles=body=>body.messages.map(item=>item.title).sort();

const david=await call('david','GET',path);
assert.equal(david.status,200);
assert.equal(david.body.access.userId,'david');
assert.equal(david.body.access.personId,'p-david');
assert.equal(david.body.access.roleCode,'WORKER','le rôle serveur WORKER reste autoritaire malgré le profile_name « Chef d’équipe »');
assert.equal(david.body.widgetScopes.tasks,'person');
assert.deepEqual(titles(david.body),['Tâche David','Tâche chantier David','Tâche équipe A']);
assert.deepEqual(assignmentIds(david.body),['asg-david-a','asg-david-c']);
assert.ok(obligationTitles(david.body).includes('Formation sécurité David'));
assert.ok(obligationTitles(david.body).includes('Formation · Échafaudage David'));
assert.ok(obligationTitles(david.body).includes('VCA David'));
assert.ok(!obligationTitles(david.body).some(value=>value.includes('Olivier')));
assert.ok(!obligationTitles(david.body).includes('Réunion direction confidentielle'));
assert.ok(messageTitles(david.body).includes('Direct David'));
assert.ok(messageTitles(david.body).includes('Équipe A partagée'));
assert.ok(!messageTitles(david.body).includes('Direct Olivier'));
assert.ok(!titles(david.body).includes('Tâche homonyme David'),'un homonyme ne doit jamais être assimilé au David ciblé');
assert.ok(!obligationTitles(david.body).includes('Obligation homonyme'),'les obligations sont isolées par personId, pas par nom');

const olivier=await call('olivier','GET',path);
assert.equal(olivier.status,200);
assert.deepEqual(titles(olivier.body),['Tâche Olivier URGENT','Tâche équipe A']);
assert.deepEqual(assignmentIds(olivier.body),['asg-olivier-a']);
assert.ok(obligationTitles(olivier.body).some(value=>value.includes('Olivier')));
assert.ok(!obligationTitles(olivier.body).some(value=>value.includes('David')));

const twin=await call('david-twin','GET',path);
assert.equal(twin.status,200);
assert.equal(twin.body.access.name,'David Leclercq');
assert.equal(twin.body.access.personId,'p-david-twin');
assert.equal(twin.body.access.roleCode,'WORKER');
assert.deepEqual(titles(twin.body),['Tâche homonyme David','Tâche équipe A']);
assert.deepEqual(assignmentIds(twin.body),['asg-twin-a']);
assert.ok(obligationTitles(twin.body).includes('Obligation homonyme'));
assert.ok(!titles(twin.body).includes('Tâche David'),'le nom identique ne donne aucun accès à la tâche de l’autre David');

const other=await call('other','GET',path);
assert.equal(other.status,200);
assert.deepEqual(titles(other.body),['Tâche autre équipe URGENT']);
assert.deepEqual(assignmentIds(other.body),['asg-other-b']);
assert.ok(!titles(other.body).some(value=>value.includes('David')||value.includes('Olivier')||value.includes('équipe A')));

const lead=await call('lead-a','GET',path);
assert.equal(lead.status,200);
assert.deepEqual(titles(lead.body),['Tâche chantier sans David','Tâche équipe A']);
assert.ok(!titles(lead.body).includes('Tâche David'),'le TEAM_LEAD ne reçoit pas automatiquement les tâches individuelles de son équipe sur son accueil');
assert.ok(!titles(lead.body).includes('Tâche Olivier URGENT'),'urgence != visibilité personnelle');
assert.deepEqual(assignmentIds(lead.body),[],'aucune affectation personnelle explicite pour le chef dans cette semaine de test');

const owner=await call('owner','GET',path);
assert.equal(owner.status,200);
assert.equal(owner.body.widgetScopes.tasks,'organization');
assert.equal(owner.body.tasks.length,7);
assert.ok(obligationTitles(owner.body).includes('Réunion direction confidentielle'));
assert.equal(owner.body.assignments.length,5);

const preview=await call('owner','GET',path+'&view_as_user_id=david');
assert.equal(preview.status,200);
assert.equal(preview.body.preview,true);
assert.equal(preview.body.previewedBy,'owner');
assert.equal(preview.body.access.userId,'david');
assert.equal(preview.body.access.roleCode,'WORKER','le view-as conserve le rôle serveur réel de David');
assert.deepEqual(titles(preview.body),titles(david.body),'la prévisualisation OWNER reproduit les tâches réellement visibles par David');
assert.deepEqual(assignmentIds(preview.body),assignmentIds(david.body),'la prévisualisation OWNER reproduit le planning de David');
assert.deepEqual(obligationTitles(preview.body),obligationTitles(david.body),'la prévisualisation OWNER reproduit les obligations de David');
assert.deepEqual(messageTitles(preview.body),messageTitles(david.body),'la prévisualisation OWNER reproduit les messages accessibles à David');

const previewTwin=await call('owner','GET',path+'&view_as_user_id=david-twin');
assert.equal(previewTwin.status,200);
assert.equal(previewTwin.body.access.personId,'p-david-twin');
assert.deepEqual(titles(previewTwin.body),titles(twin.body),'deux homonymes produisent deux scopes distincts');
assert.deepEqual(assignmentIds(previewTwin.body),assignmentIds(twin.body),'le planning de l’homonyme reste attaché à son personId');

const previewOlivier=await call('owner','GET',path+'&view_as_user_id=olivier');
assert.equal(previewOlivier.status,200);
assert.equal(previewOlivier.body.preview,true);
assert.equal(previewOlivier.body.access.userId,'olivier');
assert.deepEqual(titles(previewOlivier.body),titles(olivier.body),'le OWNER voit exactement le scope réel d’Olivier en view-as');
assert.deepEqual(assignmentIds(previewOlivier.body),assignmentIds(olivier.body),'le planning view-as Olivier correspond à Olivier');
assert.notDeepEqual(titles(previewOlivier.body),titles(preview.body),'changer de personne change réellement le scope des tâches');
assert.notDeepEqual(assignmentIds(previewOlivier.body),assignmentIds(preview.body),'changer de personne change réellement le scope du planning');

const unlinked=await call('unlinked','GET',path);
assert.equal(unlinked.status,403,'un compte WORKER sans personId roster ne reçoit aucun accueil personnel');
assert.equal(Object.hasOwn(unlinked.body,'tasks'),false,'aucune donnée globale ne fuit vers un profil sans roster');
const previewUnlinked=await call('owner','GET',path+'&view_as_user_id=unlinked');
assert.equal(previewUnlinked.status,403,'le OWNER ne peut pas obtenir un faux accueil global en prévisualisant un profil sans roster');
assert.equal(Object.hasOwn(previewUnlinked.body,'tasks'),false,'aucune tâche OWNER n’est renvoyée au profil sans roster');

const forged=await call('david','GET',path+'&view_as_user_id=olivier');
assert.equal(forged.status,403,'un WORKER ne peut pas se faire passer pour un autre utilisateur');

console.log('home-person-scope-01: PASS — rôle serveur, roster, homonymes, scopes personnels, changement de personne et absence de fallback OWNER vérifiés');
