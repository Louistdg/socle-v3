import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const env={DB:{
  prepare(sql){let values=[];return{
    _sql:sql,get _values(){return values},
    bind(...args){values=args;return this},
    async first(){return db.prepare(sql).get(...values)??null},
    async all(){return{results:db.prepare(sql).all(...values)}},
    async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
  }},
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const results=[];
      for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);results.push({meta:{changes:Number(result.changes)}})}
      db.exec('COMMIT');return results;
    }catch(error){db.exec('ROLLBACK');throw error}
  }
}};

const stamp='2026-09-28T22:30:00.000Z';
function org(id){db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'BE','EUR',stamp,stamp)}
org('org-a');org('org-b');org('org-c');org('org-d');
const users=[
  ['owner-a','OWNER','org-a'],
  ['hr-a','HR','org-a'],
  ['manager-a','HR_MANAGER','org-a'],
  ['planner-a','PROJECT_MANAGER','org-a'],
  ['worker-a','WORKER','org-a'],
  ['owner-b','OWNER','org-b'],
  ['owner-c','OWNER','org-c'],
  ['planner-c','PROJECT_MANAGER','org-c'],
  ['owner-d','OWNER','org-d'],
  ['planner-d','PROJECT_MANAGER','org-d']
];
for(const [uid,code,organizationId] of users){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(uid,uid,'Test',uid+'@example.test',stamp,stamp);
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,organizationId,code,code,stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+uid,organizationId,uid,'role-'+uid,'active',stamp,stamp,stamp);
}
for(const permission of ['hr.records.view','hr.records.manage'])db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-hr-a',permission);
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-manager-a','hr.records.manage');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-planner-a','planning.assignments.manage');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker-a','workspace.view');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-planner-c','planning.assignments.manage');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-planner-d','planning.assignments.manage');

const stateA={
  version:3,company:{name:'BatiNova'},
  people:[
    {id:'1',name:'Alice Martin',role:'Ouvrière',category:'Ouvrier',trade:'Couvreuse',start:'2024-01-15',contract:'CDI',weeklyHours:38,grossHourlyCents:2500},
    {id:'2',name:'Bob Simon',role:'Chef d’équipe',category:'Ouvrier',trade:'Charpentier',start:'2023-03-01',contract:'CDI'}
  ],
  teams:[{id:'team-1',name:'Équipe Toiture',members:['1','2']}],
  jobs:[],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]
};
const stateB={
  version:3,company:{name:'Autre SRL'},
  people:[{id:'1',name:'Alice Autre',role:'Employée',category:'Employé'},{id:'b-only',name:'Bruno Autre',role:'Ouvrier',category:'Ouvrier'}],
  teams:[{id:'team-1',name:'Équipe Autre',members:['1','b-only']}],
  jobs:[],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]
};
const stateC={
  version:3,company:{name:'Planning SRL'},
  people:[{id:'c-1',name:'Claire Terrain',role:'Cheffe d’équipe',category:'Ouvrier',trade:'Toiture',start:'2025-02-01',contract:'CDI',weeklyHours:38,grossHourlyCents:4100}],
  teams:[{id:'team-c',name:'Équipe Terrain',members:['c-1']}],
  jobs:[],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]
};
const stateD={
  version:3,company:{name:'Membership SRL'},
  people:[{id:'person-d',name:'Dana Import',role:'Ouvrière',category:'Ouvrier'}],
  teams:[{id:'team-d',name:'Équipe Persistante',members:['person-d']}],
  jobs:[],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]
};
for(const [organizationId,ownerId,state] of [['org-a','owner-a',stateA],['org-b','owner-b',stateB],['org-c','owner-c',stateC],['org-d','owner-d',stateD]]){
  db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(organizationId,JSON.stringify(state),1,ownerId,stamp,stamp);
}

db.prepare("INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run('org-a','server-team-toiture','Équipe Toiture',1,'server',stamp,stamp);
db.prepare("INSERT INTO hr_people(organization_id,id,display_name,created_at,updated_at) VALUES(?,?,?,?,?)").run('org-d','person-d','Dana Import',stamp,stamp);
db.prepare("INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").run('org-d','team-d','Équipe Persistante',1,'server',stamp,stamp);
db.prepare("INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,NULL,?,?)").run('org-d','membership-d-existing','team-d','person-d','2026-01-01',stamp,stamp);

async function call(uid,orgId,method,path,payload){
  const response=await worker.fetch(new Request('https://socle.test'+path,{
    method,
    headers:{
      'oai-authenticated-user-id':uid,
      'x-socle-organization-id':orgId,
      'origin':'https://socle.test',
      ...(payload!==undefined?{'content-type':'application/json'}:{})
    },
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{})
  }),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let n=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);n++};
const ok=(value,message)=>{assert.ok(value,message);n++};

let r=await call('planner-c','org-c','GET','/api/hr/people');
eq(r.status,200,'un responsable planning peut initialiser uniquement l’annuaire opérationnel');
eq(r.body.people.length,1);
eq(db.prepare("SELECT COUNT(*) count FROM employment_records WHERE organization_id='org-c'").get().count,0,'l’accès planning n’importe aucun contrat ni salaire');
eq(db.prepare("SELECT COUNT(*) count FROM legacy_domain_imports WHERE organization_id='org-c' AND domain='hr_directory'").get().count,1);
eq(db.prepare("SELECT COUNT(*) count FROM legacy_domain_imports WHERE organization_id='org-c' AND domain='hr'").get().count,0);
r=await call('planner-d','org-d','GET','/api/hr/teams');
eq(r.status,200,'l’import annuaire fonctionne avec une appartenance serveur déjà active');
eq(r.body.teams[0].memberIds[0],'person-d');
eq(db.prepare("SELECT COUNT(*) count FROM hr_team_members WHERE organization_id='org-d' AND team_id='team-d' AND person_id='person-d' AND ends_on IS NULL").get().count,1,'un import legacy starts_on NULL ne duplique pas une appartenance active même si sa date diffère');
eq(db.prepare("SELECT starts_on FROM hr_team_members WHERE organization_id='org-d' AND id='membership-d-existing'").get().starts_on,'2026-01-01','l’import préserve la date de début de l’appartenance serveur');
r=await call('owner-c','org-c','GET','/api/hr/people/c-1/employment-records');
eq(r.status,200,'un accès RH autorisé complète ensuite l’import sensible');
eq(r.body.employmentRecords.length,1);
eq(r.body.employmentRecords[0].grossHourlyCents,4100);
eq(db.prepare("SELECT COUNT(*) count FROM legacy_domain_imports WHERE organization_id='org-c' AND domain='hr'").get().count,1);

r=await call('owner-a','org-a','GET','/api/hr/people');
eq(r.status,200,'OWNER peut lire le référentiel RH');
eq(r.body.people.length,2,'les personnes legacy sont importées');
eq(r.body.people.find(person=>person.id==='1').displayName,'Alice Martin');
eq(r.body.people.find(person=>person.id==='1').source,'workspace_state');

r=await call('manager-a','org-a','GET','/api/hr/people');
eq(r.status,200,'hr.records.manage implique la lecture du référentiel RH');
eq(r.body.people.length,2);

r=await call('owner-a','org-a','GET','/api/hr/people/1/employment-records');
eq(r.status,200);
eq(r.body.employmentRecords.length,1,'le contrat legacy est importé une seule fois');
eq(r.body.employmentRecords[0].startsOn,'2024-01-15');
eq(r.body.employmentRecords[0].contractType,'CDI');
eq(r.body.employmentRecords[0].weeklyHours,38);
eq(r.body.employmentRecords[0].grossHourlyCents,2500);
eq(r.body.employmentRecords[0].tradeName,'Couvreuse');

r=await call('planner-a','org-a','GET','/api/hr/teams');
eq(r.status,200,'le responsable planning peut lire les équipes sans ouvrir les dossiers RH');
eq(r.body.teams.length,1);
eq(r.body.teams[0].id,'server-team-toiture','l’import réutilise une équipe serveur existante portant exactement le même nom');
eq(db.prepare("SELECT COUNT(*) count FROM hr_teams WHERE organization_id='org-a' AND id='team-1'").get().count,0,'aucune équipe legacy dupliquée n’est créée');
assert.deepEqual(new Set(r.body.teams[0].memberIds),new Set(['1','2']));n++;
r=await call('planner-a','org-a','GET','/api/hr/people');
eq(r.status,200,'planning.assignments.manage donne accès à l’annuaire opérationnel');
eq(r.body.people.length,2);
eq(Object.hasOwn(r.body.people[0],'grossHourlyCents'),false,'l’annuaire opérationnel ne contient aucune donnée salariale');
r=await call('planner-a','org-a','GET','/api/hr/people/1/employment-records');
eq(r.status,403,'le responsable planning ne peut pas ouvrir les contrats ou salaires');
r=await call('worker-a','org-a','GET','/api/hr/teams');
eq(r.status,403,'un ouvrier ne reçoit pas automatiquement les données RH/équipes administratives');
r=await call('worker-a','org-a','GET','/api/hr/people/1/employment-records');
eq(r.status,403,'un ouvrier ne voit jamais les données contractuelles/salariales');

r=await call('hr-a','org-a','POST','/api/hr/people',{displayName:'Charlie Dupont',roleTitle:'Employé administratif',category:'Employé',active:true});
eq(r.status,201,'un gestionnaire RH autorisé peut créer une personne');
const charlie=r.body.person.id;
eq(r.body.person.source,'server');
eq(db.prepare('SELECT COUNT(*) count FROM hr_people WHERE organization_id=? AND id=?').get('org-a',charlie).count,1);
eq(db.prepare('SELECT COUNT(*) count FROM hr_people WHERE organization_id=? AND id=?').get('org-b',charlie).count,0,'la création reste tenant-scoped');

r=await call('hr-a','org-a','POST',`/api/hr/people/${charlie}/employment-records`,{startsOn:'2026-09-01',contractType:'CDI',weeklyHours:38,grossHourlyCents:3200,tradeName:'Administration'});
eq(r.status,201);
const employmentId=r.body.employment.id;
eq(r.body.employment.grossHourlyCents,3200);
r=await call('hr-a','org-a','PATCH',`/api/hr/people/${charlie}/employment-records/${employmentId}`,{weeklyHours:40,grossHourlyCents:3300});
eq(r.status,200);
eq(r.body.employment.weeklyHours,40);
eq(r.body.employment.grossHourlyCents,3300);
r=await call('hr-a','org-a','POST',`/api/hr/people/${charlie}/employment-records`,{weeklyHours:200});
eq(r.status,400,'plus de 168 h/semaine est refusé');
r=await call('hr-a','org-a','POST',`/api/hr/people/${charlie}/employment-records`,{grossHourlyCents:-1});
eq(r.status,400,'un taux brut négatif est refusé');
r=await call('hr-a','org-a','POST',`/api/hr/people/${charlie}/employment-records`,{startsOn:'2026-10-01',endsOn:'2026-09-01'});
eq(r.status,400,'une fin avant le début est refusée');

r=await call('hr-a','org-a','PATCH','/api/hr/people/1',{displayName:'Alice Martin Corrigée'});
eq(r.status,200);
eq(r.body.person.displayName,'Alice Martin Corrigée');
r=await call('owner-a','org-a','POST','/api/legacy-upgrade',{domains:['hr']});
eq(r.status,200);
eq(r.body.domains[0].replayed,true,'le second import legacy est idempotent');
r=await call('hr-a','org-a','GET','/api/hr/people/1');
eq(r.body.person.displayName,'Alice Martin Corrigée','un réimport ne réécrit pas une correction serveur');

r=await call('planner-a','org-a','POST','/api/hr/teams',{name:'Équipe Façade',active:true});
eq(r.status,201,'le responsable planning peut créer une équipe opérationnelle');
const teamId=r.body.team.id;
r=await call('planner-a','org-a','PUT',`/api/hr/teams/${teamId}/members`,{memberIds:['1',charlie]});
eq(r.status,200);
assert.deepEqual(new Set(r.body.memberIds),new Set(['1',charlie]));n++;
r=await call('planner-a','org-a','GET',`/api/hr/teams/${teamId}`);
eq(r.status,200);
assert.deepEqual(new Set(r.body.team.memberIds),new Set(['1',charlie]));n++;
r=await call('planner-a','org-a','PUT',`/api/hr/teams/${teamId}/members`,{memberIds:['1']});
eq(r.status,200);
r=await call('planner-a','org-a','GET',`/api/hr/teams/${teamId}`);
assert.deepEqual(r.body.team.memberIds,['1']);n++;
ok(db.prepare('SELECT ends_on FROM hr_team_members WHERE organization_id=? AND team_id=? AND person_id=? AND ends_on IS NOT NULL ORDER BY updated_at DESC LIMIT 1').get('org-a',teamId,charlie),'le retrait clôture l’appartenance au lieu de la supprimer');
r=await call('planner-a','org-a','PUT',`/api/hr/teams/${teamId}/members`,{memberIds:['1','b-only']});
eq(r.status,400,'une personne d’un autre tenant ne peut pas être ajoutée à l’équipe');

r=await call('owner-b','org-b','GET','/api/hr/people');
eq(r.status,200);
eq(r.body.people.length,2);
eq(r.body.people.find(person=>person.id==='1').displayName,'Alice Autre','le même id local reste isolé entre entreprises');
eq(db.prepare("SELECT COUNT(*) count FROM hr_people WHERE id='1'").get().count,2,'les deux tenants peuvent partager le même id local');
r=await call('hr-a','org-a','GET','/api/hr/people/b-only');
eq(r.status,404,'un identifiant de personne RH d’un autre tenant reste introuvable');
r=await call('planner-a','org-a','GET','/api/hr/teams/team-1');
eq(r.status,404,'un identifiant d’équipe RH d’un autre tenant reste introuvable');

r=await call('hr-a','org-b','GET','/api/hr/people');
eq(r.status,403,'un header d’organisation forgé est refusé avant les routes RH');

const importAudit=db.prepare("SELECT new_values FROM audit_logs WHERE organization_id='org-a' AND action='hr.legacy_imported' ORDER BY created_at LIMIT 1").get();
ok(importAudit,'l’import legacy RH est audité');
const importDetails=JSON.parse(importAudit.new_values);
eq(importDetails.people,2);
eq(importDetails.teams,0,'aucune nouvelle équipe n’est comptée quand le nom existe déjà côté serveur');
eq(importDetails.members,2);

console.log(`hr-relational-api-27: ${n} assertions réussies`);
