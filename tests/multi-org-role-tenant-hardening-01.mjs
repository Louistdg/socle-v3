import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
let foreignRolePermissionReads=0;
const DB={
  prepare(sql){
    let values=[];
    return{
      _sql:sql,
      bind(...args){values=args;return this},
      async first(){return db.prepare(sql).get(...values)??null},
      async all(){if(/FROM\s+role_permissions\s+WHERE\s+role_id/i.test(sql)&&values[0]==='role-worker-b')foreignRolePermissionReads++;return{results:db.prepare(sql).all(...values)}},
      async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
    };
  },
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{const result=[];for(const statement of statements)result.push(await statement.run());db.exec('COMMIT');return result}
    catch(error){db.exec('ROLLBACK');throw error}
  }
};
const env={DB},stamp='2026-10-05T10:00:00.000Z';
for(const [id,name] of [['org-a','Entreprise A'],['org-b','Entreprise B']]){
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
}
for(const [id,first,last] of [
  ['owner-a','Owner','A'],['worker-a','Worker','A'],['owner-b','Owner','B'],['worker-b','Worker','B'],
  ['corrupt-a','Corrupt','A'],['corrupt-b','Corrupt','B']
]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,last,`${id}@example.test`,stamp,stamp);
}
for(const [id,organizationId,code] of [
  ['role-owner-a','org-a','OWNER'],['role-worker-a','org-a','WORKER'],
  ['role-owner-b','org-b','OWNER'],['role-worker-b','org-b','WORKER']
]){
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,organizationId,code,code,stamp);
}
db.prepare('INSERT INTO permissions(code,description) VALUES(?,?)').run('qa.tenant-b.marker','Tenant B marker');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker-b','qa.tenant-b.marker');
for(const [id,organizationId,userId,roleId] of [
  ['member-owner-a','org-a','owner-a','role-owner-a'],
  ['member-worker-a','org-a','worker-a','role-worker-a'],
  ['member-owner-b','org-b','owner-b','role-owner-b'],
  ['member-worker-b','org-b','worker-b','role-worker-b'],
  // Deliberate corruption: A membership points at a role owned by B.
  ['member-corrupt-a','org-a','corrupt-a','role-worker-b'],
  // Inverse corruption: B membership points at a role owned by A.
  ['member-corrupt-b','org-b','corrupt-b','role-worker-a']
]){
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,organizationId,userId,roleId,'active',stamp,stamp,stamp);
}
db.prepare("INSERT INTO customers(id,organization_id,type,company_name,country,created_at,updated_at) VALUES('customer-a','org-a','company','Client A','BE',?,?)").run(stamp,stamp);
db.prepare("INSERT INTO projects(id,organization_id,customer_id,name,status,created_at,updated_at) VALUES('project-a','org-a','customer-a','Chantier A','active',?,?)").run(stamp,stamp);
db.prepare("INSERT INTO organization_invitations(id,organization_id,email,role_id,token_hash,status,expires_at,invited_by,created_at) VALUES('invite-corrupt-a','org-a','foreign-role@example.test','role-worker-b','hash-corrupt-a','pending','2026-10-06T10:00:00.000Z','owner-a',?)").run(stamp);

async function call(uid,organizationId){
  const headers={'origin':'https://socle.test','oai-authenticated-user-id':uid};
  if(organizationId!==undefined)headers['x-socle-organization-id']=organizationId;
  const response=await worker.fetch(new Request('https://socle.test/api/bootstrap',{headers}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
async function callPath(uid,organizationId,path,method='GET',payload){
  const headers={'origin':'https://socle.test','oai-authenticated-user-id':uid};
  if(organizationId!==undefined)headers['x-socle-organization-id']=organizationId;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request(`https://socle.test${path}`,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

const ownerA=await call('owner-a','org-a');
assert.equal(ownerA.status,200,'membership normal A fonctionne');
assert.equal(ownerA.body.organization.id,'org-a');
assert.equal(ownerA.body.role,'OWNER');
const ownerB=await call('owner-b','org-b');
assert.equal(ownerB.status,200,'membership normal B fonctionne');
assert.equal(ownerB.body.organization.id,'org-b');
assert.equal(ownerB.body.role,'OWNER');
const workerA=await call('worker-a','org-a');
assert.equal(workerA.status,200,'membership WORKER normal A fonctionne');
assert.equal(workerA.body.role,'WORKER');
const workerB=await call('worker-b','org-b');
assert.equal(workerB.status,200,'membership WORKER normal B fonctionne');
assert.equal(workerB.body.role,'WORKER');

const readsBefore=foreignRolePermissionReads;
const corruptA=await call('corrupt-a','org-a');
assert.equal(corruptA.status,403,'membership A avec rôle de B refusé');
assert.equal(Object.hasOwn(corruptA.body,'role'),false,'roleCode du tenant B non renvoyé');
assert.equal(foreignRolePermissionReads,readsBefore,'aucune lecture de permissions après rejet du rôle étranger');

const corruptB=await call('corrupt-b','org-b');
assert.equal(corruptB.status,403,'membership B avec rôle de A refusé');
assert.equal(Object.hasOwn(corruptB.body,'role'),false,'roleCode du tenant A non renvoyé');
assert.equal(foreignRolePermissionReads,readsBefore,'aucune permission du tenant étranger lue');

assert.equal((await call('corrupt-a')).status,403,'sans header, le contexte corrompu reste refusé');
assert.equal((await call('corrupt-a','org-b')).status,403,'header forgé ne donne pas un autre tenant');
assert.equal((await call('corrupt-b','org-a')).status,403,'header forgé inverse ne donne pas un autre tenant');
assert.equal(foreignRolePermissionReads,readsBefore,'aucune permission étrangère chargée par les tentatives avec headers');

const listedA=await callPath('owner-a','org-a','/api/organizations');
assert.equal(listedA.status,200,'liste des organisations accessible à un OWNER valide');
assert.deepEqual(listedA.body.organizations.map(item=>item.id),['org-a'],'l’adhésion corrompue ne révèle pas une autre entreprise');
assert.equal(listedA.body.organizations[0].role_code,'OWNER','le rôle affiché vient du tenant A');
const corruptAccess=await callPath('owner-a','org-a','/api/access-control/corrupt-a');
assert.equal(corruptAccess.status,405,'aucune lecture directe de membre ACL n’est exposée');
const corruptAccessList=await callPath('owner-a','org-a','/api/access-control');
assert.equal(corruptAccessList.status,200);
assert.equal(corruptAccessList.body.members.some(member=>member.user_id==='corrupt-a'),false,'les listes ACL excluent les rôles d’un autre tenant');
const corruptMemberEdit=await callPath('owner-a','org-a','/api/members/corrupt-a','PATCH',{roleId:'role-worker-a'});
assert.equal(corruptMemberEdit.status,404,'les opérations membre refusent une adhésion à rôle étranger');
const corruptAssignee=await callPath('owner-a','org-a','/api/projects/project-a/tasks','POST',{title:'Test contrôle participant',assignedTo:'corrupt-a'});
assert.equal(corruptAssignee.status,400,'un rôle OWNER étranger ne donne pas accès à l’affectation d’une tâche');
const invitations=await callPath('owner-a','org-a','/api/invitations');
assert.equal(invitations.status,200);
assert.equal(invitations.body.invitations.some(invitation=>invitation.id==='invite-corrupt-a'),false,'la liste des invitations exclut les rôles d’un autre tenant');
assert.equal(foreignRolePermissionReads,readsBefore,'les chemins annexes ne lisent pas les permissions étrangères');

console.log('multi-org-role-tenant-hardening-01: cross-tenant role reads rejected');
