import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys),1);

const env={SOCLE_ALLOW_BOOTSTRAP:'true',DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements){const r=db.prepare(s._sql).run(...s._values);out.push({meta:{changes:Number(r.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

async function call(uid,email,method,path,payload,org){
  const headers={origin:'https://socle.test','oai-authenticated-user-id':uid,'oai-authenticated-user-email':email};
  if(org)headers['x-socle-organization-id']=org;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return {status:response.status,body};
}

let response=await call('legacy-owner','owner@legacy.test','GET','/api/bootstrap');
assert.equal(response.status,200);
const org=response.body.organization.id;

response=await call('legacy-owner','owner@legacy.test','GET','/api/roles',undefined,org);
assert.equal(response.status,200);
const workerRole=response.body.roles.find(role=>role.code==='WORKER');
assert.ok(workerRole?.id);

const stamp=new Date().toISOString();
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run('legacy-target','Legacy','Target','target@legacy.test',stamp,stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run('member-legacy-target',org,'legacy-target',workerRole.id,'active',stamp,stamp,stamp);

for(const code of ['PROJECT_MANAGER','LOGISTICS']){
  const roleId='legacy-'+code.toLowerCase().replaceAll('_','-');
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)')
    .run(roleId,org,code,code,stamp);

  response=await call('legacy-owner','owner@legacy.test','PATCH','/api/members/legacy-target',{roleId},org);
  assert.equal(response.status,400,'attribution directe '+code+' doit être refusée');

  const current=db.prepare('SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.user_id=?')
    .get(org,'legacy-target');
  assert.equal(current.code,'WORKER','le rôle courant doit rester WORKER après refus '+code);

  const email='invite-'+code.toLowerCase().replaceAll('_','-')+'@legacy.test';
  response=await call('legacy-owner','owner@legacy.test','POST','/api/invitations',{email,roleId,expiresInDays:7},org);
  assert.equal(response.status,400,'invitation '+code+' doit être refusée');

  const inviteCount=Number(db.prepare('SELECT COUNT(*) n FROM organization_invitations WHERE organization_id=? AND email=?').get(org,email).n);
  assert.equal(inviteCount,0,'aucune invitation legacy ne doit être créée pour '+code);

  const afterInvite=db.prepare('SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.user_id=?')
    .get(org,'legacy-target');
  assert.equal(afterInvite.code,'WORKER','le rôle courant doit rester WORKER après invitation refusée '+code);
}

console.log('ia3-legacy-role-id-guard-29: PROJECT_MANAGER et LOGISTICS refusés en attribution et invitation');
