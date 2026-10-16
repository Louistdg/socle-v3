import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.js';
import { applyMigrations, BATINOVA_ORG_ID, OWNER_ID, PROJECT_ID, seedBatiNova, STAMP, WORKER_ID } from './fixtures/multi-org-isolation-01.mjs';

const database = new DatabaseSync(':memory:');
applyMigrations(database);
const batiState = seedBatiNova(database);
const env = { SOCLE_ALLOW_BOOTSTRAP: 'true', DB: {
  prepare(sql) { let values=[]; return { _sql:sql, get _values(){return values}, bind(...args){values=args;return this}, async first(){return database.prepare(sql).get(...values)??null}, async all(){return{results:database.prepare(sql).all(...values)}}, async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}} }; },
  async batch(statements) { database.exec('BEGIN IMMEDIATE'); try { const results=statements.map(statement=>{const result=database.prepare(statement._sql).run(...statement._values);return{meta:{changes:Number(result.changes)}}}); database.exec('COMMIT'); return results; } catch(error) { database.exec('ROLLBACK'); throw error; } },
} };

async function request(userId, method, path, payload, organizationId) {
  const headers = { origin:'https://socle.test', 'oai-authenticated-user-id':userId };
  if (organizationId) headers['x-socle-organization-id'] = organizationId;
  if (payload !== undefined) headers['content-type'] = 'application/json';
  const response = await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env);
  return { status:response.status, body:await response.json() };
}

const beforeBatiNova = JSON.stringify(batiState);
let result = await request(OWNER_ID,'GET','/api/organizations',undefined,BATINOVA_ORG_ID);
assert.equal(result.status,200);
assert.deepEqual(result.body.organizations.map(org=>org.id),[BATINOVA_ORG_ID]);

result = await request(OWNER_ID,'POST','/api/organizations',{name:'Menuiserie Fayt'},BATINOVA_ORG_ID);
assert.equal(result.status,201,'Le OWNER crée Fayt par l’API réelle');
const faytId = result.body.organization.id;
assert.ok(faytId && faytId !== BATINOVA_ORG_ID,'L’ID Fayt est généré côté serveur et distinct');

result = await request(OWNER_ID,'GET','/api/organizations',undefined,BATINOVA_ORG_ID);
assert.equal(result.status,200);
assert.deepEqual(result.body.organizations.map(org=>org.id).sort(),[BATINOVA_ORG_ID,faytId].sort(),'Le même OWNER voit exactement BatiNova et Fayt');
assert.equal(result.body.activeOrganizationId,BATINOVA_ORG_ID,'La création ne bascule pas silencieusement le tenant actif');

const allowedSetupTables = new Set(['organizations','roles','organization_members','audit_logs']);
const tableNames = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
for (const table of tableNames) {
  const columns=database.prepare(`PRAGMA table_info("${table}")`).all().map(column=>column.name);
  if (columns.includes('organization_id') && !allowedSetupTables.has(table)) {
    assert.equal(database.prepare(`SELECT COUNT(*) count FROM "${table}" WHERE organization_id=?`).get(faytId).count,0,`Fayt créée vide dans ${table}`);
  }
}
assert.equal(database.prepare('SELECT COUNT(*) count FROM organization_members WHERE organization_id=?').get(faytId).count,1,'Fayt a uniquement le OWNER créateur');
assert.equal(database.prepare('SELECT COUNT(*) count FROM roles WHERE organization_id=?').get(faytId).count,4,'Fayt a uniquement ses quatre rôles système');

const bati = await request(OWNER_ID,'GET','/api/state',undefined,BATINOVA_ORG_ID);
assert.equal(bati.status,200);
assert.equal(bati.body.organizationId,BATINOVA_ORG_ID);
assert.equal(bati.body.state.company.name,'BATINOVA-STATE-ONLY');
assert.equal(bati.body.state.jobs[0].id,PROJECT_ID);

const fayt = await request(OWNER_ID,'GET','/api/state',undefined,faytId);
assert.equal(fayt.status,200);
assert.equal(fayt.body.organizationId,faytId);
assert.equal(fayt.body.state,null,'Un tenant neuf n’hérite pas du snapshot BatiNova');
assert.equal(fayt.body.organizationId,faytId,'L’état vide est associé au tenant Fayt');
assert.equal(fayt.body.access?.userId,OWNER_ID,'Un tenant vide conserve le profil serveur du OWNER membre');
assert.equal(fayt.body.access?.roleCode,'OWNER','Un tenant vide conserve le rôle serveur OWNER');
const faytPeople = await request(OWNER_ID,'GET','/api/hr/people',undefined,faytId);
assert.equal(faytPeople.status,200);
assert.deepEqual(faytPeople.body.people,[],'Fayt ne reçoit aucun roster BatiNova');
const crossTenantProject = await request(OWNER_ID,'GET',`/api/projects/${PROJECT_ID}`,undefined,faytId);
assert.ok([403,404].includes(crossTenantProject.status),'Un projet BatiNova demandé dans Fayt est refusé ou introuvable');
assert.notEqual(crossTenantProject.status,200);

const forged = await request(OWNER_ID,'GET','/api/state',undefined,'org-not-authorized');
assert.equal(forged.status,403,'Un organization ID forgé est refusé');
const workerCrossTenant = await request(WORKER_ID,'GET','/api/state',undefined,faytId);
assert.equal(workerCrossTenant.status,403,'Le WORKER BatiNova sans membership Fayt reçoit 403');

// Reuse the same business key in a temporary, isolated Fayt snapshot, then remove it.
const collisionState = structuredClone(batiState);
collisionState.company.name='FAYT-COLLISION-ONLY';
collisionState.jobs[0].name='FAYT-SAME-ID-DIFFERENT-DATA';
database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run(faytId,JSON.stringify(collisionState),1,OWNER_ID,STAMP,STAMP);
const faytCollision=await request(OWNER_ID,'GET','/api/state',undefined,faytId);
assert.equal(faytCollision.body.state.jobs[0].id,PROJECT_ID,'Les deux tenants peuvent utiliser une même clé métier dans leur snapshot');
assert.equal(faytCollision.body.state.company.name,'FAYT-COLLISION-ONLY','Fayt retourne uniquement sa valeur pour l’ID commun');
const batiAfterCollision=await request(OWNER_ID,'GET','/api/state',undefined,BATINOVA_ORG_ID);
assert.equal(batiAfterCollision.body.state.company.name,'BATINOVA-STATE-ONLY','La même clé ne mélange pas les snapshots tenant');
assert.equal(JSON.stringify(batiAfterCollision.body.state),beforeBatiNova,'Le retour Fayt → BatiNova restitue le snapshot initial exact');
database.prepare('DELETE FROM organization_workspace_state WHERE organization_id=?').run(faytId);
assert.equal((await request(OWNER_ID,'GET','/api/state',undefined,faytId)).body.state,null,'Le test de collision laisse Fayt vide');

assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0,'foreign_key_check = 0');
assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity_check = ok');
console.log('multi-org-isolation-01: PASS API OWNER/WORKER, création Fayt vide, bascule A→B→A, 403, collisions d’IDs, FK/intégrité');
