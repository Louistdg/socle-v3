import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

const stamp='2026-10-04T00:30:00.000Z',org='org-worker-project-finance';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,'Finance Privacy','Finance Privacy','BE','EUR',stamp,stamp);
for(const [id,first,last] of [['owner','Marc','Owner'],['worker','Anthony','Worker']]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,last,id+'@example.test',stamp,stamp);
}
for(const [id,code,name] of [['role-owner','OWNER','Propriétaire'],['role-worker','WORKER','Ouvrier']]){
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,name,stamp);
}
for(const [user,role,person] of [['owner','role-owner','person-owner'],['worker','role-worker','person-worker']]){
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,person_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+user,org,user,person,role,'active',stamp,stamp,stamp);
}
for(const permission of ['workspace.view','projects.view.assigned','margins.view']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker',permission);
}
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,'worker','p1','owner',stamp);
const state={
  version:3,
  company:{name:'Finance Privacy'},
  people:[{id:'person-owner',name:'Marc Owner'},{id:'person-worker',name:'Anthony Worker'}],
  teams:[],
  jobs:[{id:'p1',reference:'CH-1',name:'Chantier 1',finance:{hourlyCost:48,materialsBudget:12000},contractAmount:50000,currentContractAmount:52000,contractAmendments:[{amount:2000}]}],
  assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,'owner',stamp,stamp);

async function call(uid,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':org,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let result=await call('worker','GET','/api/projects/p1/cost-control');
assert.equal(result.status,403,'WORKER ne lit jamais le pilotage financier même si margins.view a été injecté');

result=await call('worker','GET','/api/projects/p1/financial-forecast');
assert.equal(result.status,403,'WORKER ne lit jamais le forecast financier');

result=await call('worker','GET','/api/projects/p1/financial-baseline');
assert.equal(result.status,403,'WORKER ne lit jamais la baseline financière');

result=await call('worker','GET','/api/state');
assert.equal(result.status,200);
assert.equal(result.body.state.jobs[0].finance,undefined,'WORKER ne reçoit pas la finance legacy du chantier');
assert.equal(result.body.state.jobs[0].contractAmount,undefined,'WORKER ne reçoit pas le montant contractuel');
assert.equal(result.body.state.jobs[0].currentContractAmount,undefined,'WORKER ne reçoit pas le montant contractuel courant');
assert.equal(result.body.state.jobs[0].contractAmendments,undefined,'WORKER ne reçoit pas les avenants financiers');

const modules={};for(const key of ['planning','personal','jobs','messages','people','quotes','gallery','fleet','accounting','actions','documents','company','permissions'])modules[key]={view:false,add:false,edit:false};
modules.personal.view=true;modules.jobs.view=true;
result=await call('owner','PUT','/api/access-control/worker',{
  profileName:'Ouvrier',
  scope:'Ses chantiers uniquement',
  modules,
  sensitive:{quotePrices:false,jobMargins:true,payroll:false,privateDocuments:false,manageAccess:false,paySlips:false},
  fieldActions:{viewProfitability:true},
  projectIds:['p1']
});
assert.equal(result.status,200);
const personalized=result.body.members.find(member=>member.userId==='worker');
assert.ok(personalized.roleCode.startsWith('USER_'),'Le WORKER personnalisé utilise un rôle isolé');

result=await call('worker','GET','/api/projects/p1/cost-control');
assert.equal(result.status,403,'Un USER_* de scope ouvrier reste sans pilotage financier');

result=await call('worker','GET','/api/state');
assert.equal(result.status,200);
assert.equal(result.body.state.jobs[0].finance,undefined,'Le USER_* de scope ouvrier reste sans finance legacy');

const workflow=readFileSync(new URL('../web/workflow-improvements.js',import.meta.url),'utf8');
const supplier=readFileSync(new URL('../web/supplier-allocations.js',import.meta.url),'utf8');
const blank=readFileSync(new URL('../web/blank-workspace.js',import.meta.url),'utf8');
assert.match(workflow,/workerLike=.*serverRoleCode==='WORKER'.*assignment\.profile==='Ouvrier'/s,'Le preview reconnaît explicitement le profil ouvrier');
assert.match(supplier,/showJob=function\(id\)[\s\S]*canFieldAction\('viewProfitability'\)[\s\S]*projectCostControlPanel/,'Le panneau Pilotage n’est injecté que si la rentabilité est autorisée');
assert.match(blank,/showJob=function\(id\)[\s\S]*canFieldAction\('viewProfitability'\)[\s\S]*connected-job-finance/,'Les achats/factures du chantier respectent la même permission');

console.log('worker-project-finance-privacy-128: PASS');
