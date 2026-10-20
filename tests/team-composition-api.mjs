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


const path='/api/hr/composition/move';
const move=(personId,expectedTeamIds,teamIds,operationKey)=>({personId,expectedTeamIds,teamIds,operationKey});
await call('owner-a','org-a','GET','/api/hr/teams');
const created=await call('owner-a','org-a','POST','/api/hr/teams',{name:'Équipe Finitions'});
assert.equal(created.status,201);const target=created.body.team.id;
const payload=move('1',['server-team-toiture'],[target],'composition-test-0001');
assert.equal((await call('worker-a','org-a','POST',path,payload)).status,403,'worker cannot compose');
assert.equal((await call('owner-b','org-b','POST',path,payload)).status,400,'cross-tenant target rejected');
assert.equal((await call('owner-a','org-a','POST',path,payload)).status,200,'move saves');
assert.equal((await call('owner-a','org-a','POST',path,payload)).body.replayed,true,'retry is idempotent');
const getTeams=async()=> (await call('owner-a','org-a','GET','/api/hr/teams')).body.teams;
let teams=await getTeams();assert.ok(teams.find(t=>t.id===target).memberIds.includes('1'));assert.ok(!teams.find(t=>t.id==='server-team-toiture').memberIds.includes('1'));
assert.equal((await call('owner-a','org-a','POST',path,move('1',['server-team-toiture'],[],'composition-test-stale'))).status,409,'stale undo cannot erase another move');
assert.equal((await call('owner-a','org-a','POST',path,move('1',[target],['server-team-toiture'],'composition-test-undo'))).status,200);
teams=await getTeams();assert.ok(teams.find(t=>t.id==='server-team-toiture').memberIds.includes('1'));assert.ok(!teams.find(t=>t.id===target).memberIds.includes('1'));
assert.equal((await call('owner-a','org-a','POST',path,move('1',['server-team-toiture'],['missing'],'composition-test-invalid'))).status,400);
assert.ok((await getTeams()).find(t=>t.id==='server-team-toiture').memberIds.includes('1'),'invalid destination rolls back');
assert.equal((await call('owner-a','org-a','POST',path,move('1',['server-team-toiture'],[],'composition-test-unassign'))).status,200);
assert.ok(!(await getTeams()).some(t=>t.memberIds.includes('1')),'unassign is persisted');
assert.equal(db.prepare("SELECT count(*) n FROM audit_logs WHERE action='hr.composition.moved'").get().n,3,'only successful changes audited');
console.log('team-composition-api: PASS — permissions, tenant, move, retry, stale guard, rollback, undo, unassign');
