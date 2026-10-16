import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const stamp='2026-10-02T09:00:00.000Z',sent=[];let failDelivery=false;
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('other-org','Other','Other','BE','EUR',stamp,stamp);
for(const [id,email] of [['owner','owner@example.test'],['manager','manager@example.test']])database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,'Test',email,stamp,stamp);
for(const [id,org,code] of [['role-owner','org','OWNER'],['role-manager','org','TEAM_LEAD'],['role-worker','org','WORKER'],['role-accounting','org','ACCOUNTING'],['role-custom','org','CUSTOM'],['role-other-owner','other-org','OWNER']])database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,code,stamp);
for(const [id,user,role] of [['member-owner','owner','role-owner'],['member-manager','manager','role-manager']])database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,'org',user,role,'active',stamp,stamp,stamp);
for(const permission of ['members.invite','workspace.view'])database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-manager',permission);
database.prepare("INSERT INTO hr_people(organization_id,id,display_name,role_title,active,source,created_at,updated_at) VALUES('org','person-1','David Leclercq','Chef d’équipe',1,'test',?,?)").run(stamp,stamp);
database.prepare("INSERT INTO hr_people(organization_id,id,display_name,active,source,created_at,updated_at) VALUES('other-org','foreign-person','Foreign Person',1,'test',?,?)").run(stamp,stamp);

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){database.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=database.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}database.exec('COMMIT');return out}catch(error){database.exec('ROLLBACK');throw error}}
},async sendInvitationEmail(message){if(failDelivery)throw Error('provider unavailable');sent.push(message)}};

async function call(uid,email,method,path,payload,organization='org'){
  const headers={'origin':'https://socle.test','oai-authenticated-user-id':uid,'oai-authenticated-user-email':email,'x-socle-organization-id':organization};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let result=await call('manager','manager@example.test','POST','/api/invitations',{email:'blocked@example.test',roleId:'role-worker'});
assert.equal(result.status,403,'members.invite ne permet pas à un non-OWNER de créer des comptes');
result=await call('owner','owner@example.test','POST','/api/invitations',{email:'owner-escalation@example.test',roleId:'role-owner'});
assert.equal(result.status,400,'une invitation ne peut pas attribuer OWNER');
result=await call('owner','owner@example.test','POST','/api/invitations',{email:'foreign@example.test',personId:'foreign-person',roleId:'role-worker'});
assert.equal(result.status,400,'association roster cross-tenant refusée');
result=await call('owner','owner@example.test','POST','/api/invitations',{email:'wrong-role-tenant@example.test',roleId:'role-other-owner'});
assert.equal(result.status,404,'rôle d’un autre tenant non résolu');

result=await call('owner','owner@example.test','POST','/api/invitations',{email:'david@example.test',personId:'person-1',roleId:'role-custom'});
assert.equal(result.status,400,'un rôle hors liste de création est refusé');
result=await call('owner','owner@example.test','POST','/api/invitations',{email:'david@example.test',personId:'person-1',roleId:'role-worker',expiresInDays:7});
assert.equal(result.status,201,'OWNER peut inviter au rôle WORKER: '+JSON.stringify(result.body));
assert.equal('token' in result.body,false,'le jeton n’est jamais renvoyé par l’API');
const invitationId=result.body.id,token=sent.at(-1).token;
assert.ok(token.length>=40,'le service d’e-mail reçoit le jeton secret');
assert.notEqual(database.prepare('SELECT token_hash FROM organization_invitations WHERE id=?').get(invitationId).token_hash,token,'seul le hash est stocké');
assert.equal(database.prepare("SELECT status FROM organization_invitations WHERE id=?").get(invitationId).status,'pending');

result=await call('owner','owner@example.test','POST','/api/invitations',{email:'david@example.test',personId:'person-1',roleId:'role-worker'});
assert.equal(result.status,409,'une invitation existante pour le même roster est refusée');
result=await call('manager','manager@example.test','DELETE','/api/invitations/'+invitationId);
assert.equal(result.status,403,'seul OWNER peut révoquer une invitation');
result=await call('owner','owner@example.test','GET','/api/invitations');
assert.equal(result.status,200,'OWNER peut consulter les invitations');
result=await call('manager','manager@example.test','GET','/api/invitations');
assert.equal(result.status,403,'les invitations restent confidentielles pour les délégataires');

failDelivery=true;
result=await call('owner','owner@example.test','POST','/api/invitations',{email:'delivery-failure@example.test',roleId:'role-accounting'});
failDelivery=false;
assert.equal(result.status,503,'une panne e-mail bloque l’invitation');
assert.equal(database.prepare("SELECT status FROM organization_invitations WHERE email='delivery-failure@example.test'").get().status,'revoked','aucune invitation active ne subsiste après échec d’envoi');
assert.equal(database.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='member.invitation_delivery_failed'").get().n,1,'l’échec de livraison est audité');

const noMailerEnv={...env,sendInvitationEmail:undefined};
const response=await worker.fetch(new Request('https://socle.test/api/invitations',{method:'POST',headers:{'origin':'https://socle.test','oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test','x-socle-organization-id':'org','content-type':'application/json'},body:JSON.stringify({email:'no-mailer@example.test',roleId:'role-accounting'})}),noMailerEnv);
assert.equal(response.status,503,'sans config e-mail, aucun secret d’activation n’est créé');
assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_invitations WHERE email='no-mailer@example.test'").get().n,0);

console.log('invitation-security-21: rôles, tenant, roster, jetons privés, refus et audit vérifiés');
