import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}

const sent=[];
const env={DB:{
  prepare(sql){let values=[];return{
    _sql:sql,
    get _values(){return values},
    bind(...args){values=args;return this},
    async first(){return db.prepare(sql).get(...values)??null},
    async all(){return{results:db.prepare(sql).all(...values)}},
    async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
  }},
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const out=[];
      for(const statement of statements){
        const result=db.prepare(statement._sql).run(...statement._values);
        out.push({meta:{changes:Number(result.changes)}});
      }
      db.exec('COMMIT');
      return out;
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
},sendInvitationEmail:async message=>{sent.push(message)}};

const stamp='2026-09-28T22:00:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('owner','Marc','Delcourt','owner@batinova.test',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-batinova','BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [id,code,name] of [['role-owner','OWNER','Propriétaire'],['role-worker','WORKER','Ouvrier']]){
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,'org-batinova',code,name,stamp);
}
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org-batinova','owner','role-owner','active',stamp,stamp,stamp);
for(const permission of ['workspace.view','projects.view.assigned'])db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker',permission);

async function call(uid,email,method,path,payload,organizationId=''){
  const headers={
    'origin':'https://socle.test',
    ...(uid?{'oai-authenticated-user-id':uid}:{}),
    ...(email?{'oai-authenticated-user-email':email}:{}),
    ...(organizationId?{'x-socle-organization-id':organizationId}:{}),
    ...(payload?{'content-type':'application/json'}:{})
  };
  const response=await worker.fetch(new Request('https://socle.test'+path,{
    method,
    headers,
    ...(payload?{body:JSON.stringify(payload)}:{})
  }),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

async function invite(email,personId){
  if(personId)db.prepare("INSERT OR IGNORE INTO hr_people(organization_id,id,display_name,active,source,created_at,updated_at) VALUES('org-batinova',?,?,1,'test',?,?)").run(String(personId),String(personId),stamp,stamp);
  const result=await call('owner','owner@batinova.test','POST','/api/invitations',{
    email,
    personId,
    roleId:'role-worker',
    expiresInDays:7
  },'org-batinova');
  assert.equal(result.status,201,'Le Patron peut créer l’invitation de test');
  assert.equal('token' in result.body,false,'le jeton reste dans l’e-mail et n’est pas exposé à l’API');
  return sent.findLast(message=>message.to===email).token;
}

// 1) Premier compte : aucune profile, aucun membership, aucune organisation personnelle.
const firstEmail='nouveau@batinova.test';
const firstToken=await invite(firstEmail,'person-new');
let result=await call('new-user',firstEmail,'POST','/api/invitations/accept',{token:firstToken});
assert.equal(result.status,200,'Un utilisateur sans membership peut accepter sa première invitation');
assert.equal(result.body.organizationId,'org-batinova');
assert.equal(result.body.activeOrganizationId,'org-batinova','L’organisation rejointe est explicitement renvoyée comme contexte actif');
assert.equal(result.body.roleId,'role-worker');
assert.equal(result.body.personId,'person-new');

const firstProfile=db.prepare('SELECT id,email FROM profiles WHERE id=?').get('new-user');
assert.equal(firstProfile.email,firstEmail,'Le profil minimal est créé avec l’email authentifié');
assert.equal(db.prepare("SELECT COUNT(*) count FROM organizations WHERE id='org-new-user'").get().count,0,'Aucune entreprise parasite Mon entreprise n’est créée');
assert.equal(db.prepare("SELECT COUNT(*) count FROM organization_members WHERE user_id='new-user' AND status='active'").get().count,1,'Le nouvel utilisateur n’a qu’un membership actif');
const firstMembership=db.prepare("SELECT organization_id,role_id,person_id FROM organization_members WHERE user_id='new-user'").get();
assert.equal(firstMembership.organization_id,'org-batinova');
assert.equal(firstMembership.role_id,'role-worker');
assert.equal(firstMembership.person_id,'person-new');

result=await call('new-user',firstEmail,'GET','/api/organizations');
assert.equal(result.status,200);
assert.equal(result.body.activeOrganizationId,'org-batinova','Après la première invitation, BatiNova devient naturellement l’entreprise par défaut');
assert.equal(result.body.organizations.length,1);

// 2) Utilisateur déjà membre d’une vraie autre entreprise : conserver les deux.
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('multi-user','Julie','Martin','julie@example.test',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-autre','Autre SRL','Autre SRL','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-autre-owner','org-autre','OWNER','Propriétaire',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-multi-old','org-autre','multi-user','role-autre-owner','active','2026-09-01T08:00:00.000Z',stamp,stamp);

const multiToken=await invite('julie@example.test','person-julie');
result=await call('multi-user','julie@example.test','POST','/api/invitations/accept',{token:multiToken});
assert.equal(result.status,200,'Un utilisateur multi-entreprise peut rejoindre BatiNova');
assert.equal(result.body.activeOrganizationId,'org-batinova','La réponse permet au client de sélectionner explicitement l’entreprise nouvellement rejointe');
assert.equal(db.prepare("SELECT COUNT(*) count FROM organization_members WHERE user_id='multi-user' AND status='active'").get().count,2,'Les deux vraies entreprises sont conservées');
assert.equal(db.prepare("SELECT COUNT(*) count FROM organizations WHERE id='org-multi-user'").get().count,0,'Aucune entreprise automatique supplémentaire n’est créée');

result=await call('multi-user','julie@example.test','GET','/api/organizations',undefined,'org-batinova');
assert.equal(result.status,200);
assert.equal(result.body.activeOrganizationId,'org-batinova','Le client peut ouvrir immédiatement l’entreprise rejointe avec le contexte explicite');
assert.deepEqual(new Set(result.body.organizations.map(item=>item.id)),new Set(['org-autre','org-batinova']));

// 3) Mauvais email : refus sans bootstrap parasite.
const wrongToken=await invite('bonne-adresse@example.test','person-wrong');
result=await call('wrong-user','mauvaise-adresse@example.test','POST','/api/invitations/accept',{token:wrongToken});
assert.equal(result.status,403,'Une invitation reste liée à son email');
assert.equal(db.prepare("SELECT COUNT(*) count FROM organizations WHERE id='org-wrong-user'").get().count,0,'Un refus d’invitation ne crée pas non plus d’entreprise parasite');
assert.equal(db.prepare("SELECT COUNT(*) count FROM organization_members WHERE user_id='wrong-user'").get().count,0);
assert.equal(db.prepare("SELECT COUNT(*) count FROM profiles WHERE id='wrong-user'").get().count,0,'Une invitation refusée ne crée aucun profil fantôme');

console.log('invitation-first-onboarding-26: 26 assertions réussies');
