import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const database=new DatabaseSync(':memory:');
const drizzleUrl=new URL('../drizzle/',import.meta.url);
for(const name of readdirSync(drizzleUrl).filter(name=>/^\d+.*\.sql$/.test(name)&&!name.startsWith('0019_')).sort()){
  database.exec(readFileSync(new URL(name,drizzleUrl),'utf8'));
}

const stampA='2026-09-20T08:00:00.000Z',stampB='2026-09-21T08:00:00.000Z';
const stateA={version:3,company:{name:'BatiNova A'},people:[],teams:[],jobs:[{id:1,name:'Chantier A'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
const stateB={version:3,company:{name:'BatiNova B divergente'},people:[],teams:[],jobs:[{id:2,name:'Chantier B'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};

for(const [id,first] of [['owner-a','Alice'],['owner-b','Bruno']]){
  database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,'Owner',id+'@example.test',stampA,stampA);
}
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stampA,stampA);
database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Propriétaire',stampA);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('m-a','org','owner-a','role-owner','active',stampA,stampA,stampA);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('m-b','org','owner-b','role-owner','active',stampB,stampB,stampB);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner-a',JSON.stringify(stateA),3,stampA);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner-b',JSON.stringify(stateB),7,stampB);

database.exec(readFileSync(new URL('../drizzle/0019_organization_workspace_state.sql',import.meta.url),'utf8'));

let canonical=database.prepare('SELECT organization_id,payload,revision,source_user_id FROM organization_workspace_state WHERE organization_id=?').get('org');
assert.ok(canonical,'La migration crée un snapshot canonique par entreprise');
assert.equal(canonical.source_user_id,'owner-a','Le plus ancien OWNER fournit le snapshot de migration');
assert.equal(canonical.revision,3,'La révision historique sélectionnée est préservée');
assert.equal(JSON.parse(canonical.payload).company.name,'BatiNova A','Le snapshot canonique est déterministe');

const env={DB:{
  prepare(sql){let values=[];return{
    bind(...args){values=args;return this},
    async first(){return database.prepare(sql).get(...values)??null},
    async all(){return{results:database.prepare(sql).all(...values)}},
    async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
  }},
  async batch(statements){
    database.exec('BEGIN IMMEDIATE');
    try{
      const results=[];
      for(const statement of statements)results.push(await statement.run());
      database.exec('COMMIT');
      return results;
    }catch(error){
      database.exec('ROLLBACK');
      throw error;
    }
  }
}};
const {default:worker}=await import('../worker/index.js');

async function call(uid,method='GET',payload){
  const response=await worker.fetch(new Request('https://socle.test/api/state',{
    method,
    headers:{
      'oai-authenticated-user-id':uid,
      'x-socle-organization-id':'org',
      'origin':'https://socle.test',
      ...(payload?{'content-type':'application/json'}:{})
    },
    ...(payload?{body:JSON.stringify(payload)}:{})
  }),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let a=await call('owner-a'),b=await call('owner-b');
assert.equal(a.status,200);assert.equal(b.status,200);
assert.equal(a.body.organizationId,'org');assert.equal(b.body.organizationId,'org');
assert.equal(a.body.revision,3);assert.equal(b.body.revision,3);
assert.equal(a.body.state.company.name,'BatiNova A','Le premier OWNER voit le snapshot entreprise');
assert.equal(b.body.state.company.name,'BatiNova A','Le second OWNER voit exactement le même snapshot entreprise');

const updated=structuredClone(stateA);
updated.company.name='BatiNova partagé';
updated.jobs.push({id:3,name:'Chantier partagé'});
let write=await call('owner-b','PUT',{revision:3,state:updated});
assert.equal(write.status,200,'Le second OWNER peut mettre à jour le snapshot commun');
assert.equal(write.body.revision,4);

a=await call('owner-a');
assert.equal(a.body.revision,4,'Le premier OWNER voit immédiatement la nouvelle révision');
assert.equal(a.body.state.company.name,'BatiNova partagé');
assert.deepEqual(a.body.state.jobs.map(job=>job.id),[1,3]);

canonical=database.prepare('SELECT payload,revision,source_user_id FROM organization_workspace_state WHERE organization_id=?').get('org');
assert.equal(canonical.revision,4);
assert.equal(canonical.source_user_id,'owner-b','La source du dernier changement reste traçable');
assert.equal(JSON.parse(canonical.payload).company.name,'BatiNova partagé');

const legacyA=database.prepare('SELECT payload,revision FROM workspace_state WHERE user_id=?').get('owner-a');
const legacyB=database.prepare('SELECT payload,revision FROM workspace_state WHERE user_id=?').get('owner-b');
assert.equal(JSON.parse(legacyA.payload).company.name,'BatiNova A','La copie historique A reste intacte');
assert.equal(JSON.parse(legacyB.payload).company.name,'BatiNova B divergente','La copie historique B reste intacte');
assert.equal(legacyA.revision,3);assert.equal(legacyB.revision,7);

console.log('workspace-organization-state-23: 24 assertions réussies');
