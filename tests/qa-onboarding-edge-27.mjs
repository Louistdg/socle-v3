import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

let failBatchAt=-1;
const sent=[];
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const out=[];
      for(let i=0;i<statements.length;i++){
        if(i===failBatchAt)throw Error('QA injected batch failure');
        const statement=statements[i],result=db.prepare(statement._sql).run(...statement._values);
        out.push({meta:{changes:Number(result.changes)}});
      }
      db.exec('COMMIT');return out;
    }catch(error){db.exec('ROLLBACK');throw error}
  }
},sendInvitationEmail:async message=>{sent.push(message)}};

const stamp='2026-09-28T21:30:00.000Z';
assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys),1,'les FK SQLite doivent être actives');
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('owner','Marc','Delcourt','owner@batinova.test',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-batinova','BatiNova','BatiNova','BE','EUR',stamp,stamp);
const baselineOrganizationCount=Number(db.prepare('SELECT COUNT(*) n FROM organizations').get().n);
for(const [id,code,name] of [['role-owner','OWNER','Propriétaire'],['role-worker','WORKER','Ouvrier']])db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,'org-batinova',code,name,stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org-batinova','owner','role-owner','active',stamp,stamp,stamp);
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','workspace.view');

async function call(uid,email,method,path,payload,org=''){
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers:{'origin':'https://socle.test',...(uid?{'oai-authenticated-user-id':uid}:{}),...(email?{'oai-authenticated-user-email':email}:{}),...(org?{'x-socle-organization-id':org}:{}),...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
async function invite(email,personId,roleId='role-worker'){
  if(personId)db.prepare("INSERT OR IGNORE INTO hr_people(organization_id,id,display_name,active,source,created_at,updated_at) VALUES('org-batinova',?,?,1,'test',?,?)").run(String(personId),String(personId),stamp,stamp);
  const result=await call('owner','owner@batinova.test','POST','/api/invitations',{email,personId,roleId,expiresInDays:7},'org-batinova');
  assert.equal(result.status,201);assert.equal('token' in result.body,false);return {...result.body,token:sent.findLast(message=>message.to===email).token};
}
function fixtureInvite(email,personId,roleId='role-worker'){
  const token=randomUUID()+randomUUID(),tokenHash=createHash('sha256').update(token).digest('hex'),id='fixture-invitation-'+randomUUID(),expires=new Date(Date.now()+7*86400000).toISOString();
  db.prepare("INSERT INTO organization_invitations(id,organization_id,email,person_id,role_id,token_hash,status,expires_at,invited_by,created_at) VALUES(?,?,?,?,?,?,'pending',?,?,?)").run(id,'org-batinova',email,personId,roleId,tokenHash,expires,'owner',stamp);
  return{id,token};
}
function noParasite(uid,{expectedMemberships=0}={}){
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM organization_members WHERE user_id=?').get(uid).n),expectedMemberships,'nombre exact de memberships pour '+uid);
  assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.user_id=? AND r.code='OWNER'").get(uid).n),0,'aucun OWNER parasite pour '+uid);
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM organizations').get().n),baselineOrganizationCount,'aucune organisation supplémentaire créée');
}

// Invitation expirée : 410, statut expired, aucune création de profil/membership/organisation.
const expired=await invite('expired@example.test','person-expired');
db.prepare("UPDATE organization_invitations SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(expired.id);
let result=await call('expired-user','expired@example.test','POST','/api/invitations/accept',{token:expired.token});
assert.equal(result.status,410);
assert.equal(db.prepare('SELECT status FROM organization_invitations WHERE id=?').get(expired.id).status,'expired');
assert.equal(db.prepare("SELECT COUNT(*) n FROM profiles WHERE id='expired-user'").get().n,0);
assert.equal(db.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='expired-user'").get().n,0);
noParasite('expired-user');

// Token consommé : première acceptation OK, seconde 404, un seul membership, aucun OWNER.
const consumed=await invite('consumed@example.test','person-consumed');
result=await call('consumed-user','consumed@example.test','POST','/api/invitations/accept',{token:consumed.token});
assert.equal(result.status,200);
const second=await call('consumed-user','consumed@example.test','POST','/api/invitations/accept',{token:consumed.token});
assert.equal(second.status,404);
assert.equal(db.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='consumed-user' AND organization_id='org-batinova'").get().n,1);
assert.equal(db.prepare('SELECT status FROM organization_invitations WHERE id=?').get(consumed.id).status,'accepted');
noParasite('consumed-user',{expectedMemberships:1});

// Membre déjà actif : 409, rôle inchangé, invitation non consommée.
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('active-worker','Active','Worker','active@example.test',stamp,stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-active','org-batinova','active-worker','role-worker','active',stamp,stamp,stamp,'person-active');
const activeInvite=fixtureInvite('active@example.test','person-new','role-worker');
result=await call('active-worker','active@example.test','POST','/api/invitations/accept',{token:activeInvite.token});
assert.equal(result.status,409);
assert.equal(db.prepare("SELECT role_id FROM organization_members WHERE id='member-active'").get().role_id,'role-worker');
assert.equal(db.prepare('SELECT status FROM organization_invitations WHERE id=?').get(activeInvite.id).status,'pending');

// OWNER ne doit jamais être rétrogradé par invitation WORKER.
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('second-owner','Olivia','Owner','second-owner@example.test',stamp,stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-second-owner','org-batinova','second-owner','role-owner','active',stamp,stamp,stamp);
const downgrade=fixtureInvite('second-owner@example.test','person-owner','role-worker');
result=await call('second-owner','second-owner@example.test','POST','/api/invitations/accept',{token:downgrade.token});
assert.equal(result.status,409);
assert.equal(db.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.id='member-second-owner'").get().code,'OWNER');
assert.equal(db.prepare('SELECT status FROM organization_invitations WHERE id=?').get(downgrade.id).status,'pending');

// Rollback atomique : panne après profile+membership préparés, rien ne doit persister.
const rollback=await invite('rollback@example.test','person-rollback');
const beforeProfiles=Number(db.prepare("SELECT COUNT(*) n FROM profiles WHERE id='rollback-user'").get().n);
const beforeMembers=Number(db.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='rollback-user'").get().n);
const beforeInvitation=db.prepare('SELECT status,accepted_by,accepted_at FROM organization_invitations WHERE id=?').get(rollback.id);
const beforeAudit=Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-batinova'").get().n);
// acceptInvitationRoute batch = profile[0], membership[1], invitation accepted[2], audit[3].
// L'injection à 2 prouve que profile+membership ont réellement été exécutés dans la transaction avant le rollback.
failBatchAt=2;
result=await call('rollback-user','rollback@example.test','POST','/api/invitations/accept',{token:rollback.token});
failBatchAt=-1;
assert.equal(result.status,500);
assert.equal(db.prepare("SELECT COUNT(*) n FROM profiles WHERE id='rollback-user'").get().n,beforeProfiles,'profil rollback');
assert.equal(db.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='rollback-user'").get().n,beforeMembers,'membership rollback');
const afterInvitation=db.prepare('SELECT status,accepted_by,accepted_at FROM organization_invitations WHERE id=?').get(rollback.id);
assert.deepEqual(afterInvitation,beforeInvitation,'invitation intégralement rollback');
assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-batinova'").get().n),beforeAudit,'aucun audit ajouté après rollback');
assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE entity_id=? AND action='member.invitation_accepted'").get(rollback.id).n),0,'aucun audit acceptation');
noParasite('rollback-user');

// Contrôle global indépendant de la forme des IDs générés par bootstrap().
assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM organizations').get().n),baselineOrganizationCount);
assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.user_id IN ('expired-user','consumed-user','rollback-user') AND r.code='OWNER'").get().n),0);

console.log('qa-onboarding-edge-27: assertions terminées');
