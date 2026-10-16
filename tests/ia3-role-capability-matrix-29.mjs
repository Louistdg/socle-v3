import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys),1);

const sent=[];
const env={SOCLE_ALLOW_BOOTSTRAP:'true',DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements){const r=db.prepare(s._sql).run(...s._values);out.push({meta:{changes:Number(r.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
},sendInvitationEmail:async message=>{sent.push(message)}};

async function call(uid,email,method,path,payload,org){
  const headers={origin:'https://socle.test','oai-authenticated-user-id':uid,'oai-authenticated-user-email':email};
  if(org)headers['x-socle-organization-id']=org;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return {status:response.status,body};
}

let r=await call('matrix-owner','owner@matrix.test','GET','/api/bootstrap');
assert.equal(r.status,200);
assert.equal(r.body.role,'OWNER');
const org=r.body.organization.id;

r=await call('matrix-owner','owner@matrix.test','GET','/api/roles',undefined,org);
assert.equal(r.status,200);
const roles=new Map(r.body.roles.map(role=>[role.code,new Set(role.permissions)]));

for(const code of ['OWNER','TEAM_LEAD','WORKER','ACCOUNTING']) assert.ok(roles.has(code),code+' absent');

const expect={
  TEAM_LEAD:{
    allow:['workspace.view','projects.view.assigned','tasks.view.assigned','tasks.manage.project','tasks.update.assigned','time_entries.view.team','time_entries.create.team','time_entries.correction.review','project_execution.edit','planning.assignments.manage','quotes.view','documents.view.assigned'],
    deny:['permissions.manage','financial.dashboard.view','quotes.prices.view','hr.sensitive.view']
  },
  WORKER:{
    allow:['workspace.view','projects.view.assigned','tasks.view.assigned','tasks.update.assigned','time_entries.view.own','time_entries.create.own','time_entries.correction.request','quotes.view','documents.view.assigned'],
    deny:['permissions.manage','time_entries.correction.review','financial.dashboard.view','quotes.prices.view','project_execution.edit','planning.assignments.manage']
  },
  ACCOUNTING:{
    allow:['financial.dashboard.view','accounting.view','expenses.view','expenses.create','invoices.view','payments.create','credit_notes.create','purchase_orders.view','documents.secure.view','quotes.view','quotes.prices.view'],
    deny:['permissions.manage','time_entries.correction.review','project_execution.edit','planning.assignments.manage']
  }
};
for(const [roleCode,rules] of Object.entries(expect)){
  const set=roles.get(roleCode);
  for(const permission of rules.allow) assert.equal(set.has(permission),true,roleCode+' doit posséder '+permission);
  for(const permission of rules.deny) assert.equal(set.has(permission),false,roleCode+' ne doit pas posséder '+permission);
}

// Capacités serveur à haut risque : seul OWNER peut administrer membres/rôles.
const roleIds=new Map(r.body.roles.map(role=>[role.code,role.id]));
for(const [uid,email,roleCode] of [
  ['lead-matrix','lead@matrix.test','TEAM_LEAD'],
  ['worker-matrix','worker@matrix.test','WORKER'],
  ['accounting-matrix','accounting@matrix.test','ACCOUNTING']
]){
  const invitation=await call('matrix-owner','owner@matrix.test','POST','/api/invitations',{email,roleId:roleIds.get(roleCode),expiresInDays:7},org);
  assert.equal(invitation.status,201,'invitation '+roleCode);
  const accepted=await call(uid,email,'POST','/api/invitations/accept',{token:sent.findLast(message=>message.to===email)?.token});
  assert.equal(accepted.status,200,'acceptation '+roleCode);
  const boot=await call(uid,email,'GET','/api/bootstrap',undefined,org);
  assert.equal(boot.status,200);
  assert.equal(boot.body.role,roleCode);
}

for(const [uid,email] of [['lead-matrix','lead@matrix.test'],['worker-matrix','worker@matrix.test'],['accounting-matrix','accounting@matrix.test']]){
  const list=await call(uid,email,'GET','/api/access-control',undefined,org);
  assert.equal(list.status,403,'lecture droits refusée à '+uid);
  const mutate=await call(uid,email,'PATCH','/api/members/worker-matrix',{roleId:roleIds.get('TEAM_LEAD')},org);
  assert.equal(mutate.status,403,'mutation membre refusée à '+uid);
}

const promote=await call('worker-matrix','worker@matrix.test','PATCH','/api/members/worker-matrix',{roleId:roleIds.get('OWNER')},org);
assert.equal(promote.status,403);
const roleAfter=db.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.user_id='worker-matrix'").get(org);
assert.equal(roleAfter.code,'WORKER');

// Validation : TEAM_LEAD a le droit de review des corrections, WORKER et ACCOUNTING non.
assert.equal(roles.get('TEAM_LEAD').has('time_entries.correction.review'),true);
assert.equal(roles.get('WORKER').has('time_entries.correction.review'),false);
assert.equal(roles.get('ACCOUNTING').has('time_entries.correction.review'),false);

console.log('ia3-role-capability-matrix-29: matrice canonique et gardes serveur vérifiées');
