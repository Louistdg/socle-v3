import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let failBatchAt=null;
const DB={
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){
    database.exec('BEGIN IMMEDIATE');
    try{const results=[];for(let index=0;index<statements.length;index++){if(failBatchAt===index)throw Error('injected transaction failure');const statement=statements[index],result=database.prepare(statement._sql).run(...statement._values);results.push({meta:{changes:Number(result.changes)}})}database.exec('COMMIT');return results}
    catch(error){database.exec('ROLLBACK');throw error}
  }
};
const env={DB,SOCLE_ALLOW_BOOTSTRAP:'true'};
const stamp='2026-10-05T12:00:00.000Z';
const equal=(actual,expected,message)=>assert.equal(actual,expected,message);
const ok=(actual,message)=>assert.ok(actual,message);

function organization(id,name){database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp)}
function role(organizationId,userId,code){const roleId=`role-${organizationId}-${code.toLowerCase()}`;database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(roleId,organizationId,code,code,stamp);database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(`member-${organizationId}-${userId}`,organizationId,userId,roleId,'active',stamp,stamp,stamp);return roleId}
for(const [id,email] of [['owner','owner@example.test'],['worker','worker@example.test'],['accountant','accountant@example.test']])database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,'Test',email,stamp,stamp);
organization('org-simu','Socle.Simu.V2');organization('org-batinova','BatiNova');
for(const org of ['org-simu','org-batinova'])role(org,'owner','OWNER');
role('org-simu','worker','WORKER');role('org-simu','accountant','ACCOUNTING');
database.prepare("INSERT INTO customers(id,organization_id,type,company_name,country,notes,payment_terms_days,created_at,updated_at) VALUES('batinova-customer','org-batinova','company','Client historique','BE','Préserver',30,?,?)").run(stamp,stamp);
database.prepare("INSERT INTO projects(id,organization_id,customer_id,name,status,created_at,updated_at) VALUES('batinova-project','org-batinova','batinova-customer','Chantier conservé','active',?,?)").run(stamp,stamp);

async function request(uid,method,path,payload,{organizationId='org-simu'}={}){
  const headers={origin:'https://socle.test','oai-authenticated-user-id':uid};
  if(organizationId)headers['x-socle-organization-id']=organizationId;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  return{status:response.status,body:await response.json()};
}
function tenantSnapshot(organizationId){
  const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name),snapshot={};
  for(const table of tables){
    const columns=database.prepare(`PRAGMA table_info("${table}")`).all().map(column=>column.name);
    if(columns.includes('organization_id'))snapshot[table]=database.prepare(`SELECT * FROM "${table}" WHERE organization_id=? ORDER BY rowid`).all(organizationId);
  }
  snapshot.organization=database.prepare('SELECT * FROM organizations WHERE id=?').all(organizationId);
  snapshot.roles=database.prepare('SELECT * FROM roles WHERE organization_id=? ORDER BY code').all(organizationId);
  snapshot.rolePermissions=database.prepare('SELECT rp.* FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.organization_id=? ORDER BY r.code,rp.permission_code').all(organizationId);
  return JSON.stringify(snapshot);
}
const batinovaBefore=tenantSnapshot('org-batinova');

// Only the authenticated OWNER can create an additional organization.
let response=await request('worker','POST','/api/organizations',{name:'Ne doit pas être créé'});equal(response.status,403,'WORKER refusé');
response=await request('accountant','POST','/api/organizations',{name:'Ne doit pas être créé'});equal(response.status,403,'ACCOUNTING refusé');
response=await request('owner','POST','/api/organizations',{name:'   '});equal(response.status,400,'nom vide refusé');
response=await request('owner','POST','/api/organizations',{name:'Menuiserie Fayt',organizationId:'org-batinova'});equal(response.status,400,'organizationId arbitraire refusé');
equal(database.prepare("SELECT COUNT(*) count FROM organizations WHERE name='Menuiserie Fayt'").get().count,0,'aucune écriture invalide');

// A failure after several inserts must roll back the entire unit of work.
failBatchAt=4;const previousConsoleError=console.error;console.error=()=>{};
try{response=await request('owner','POST','/api/organizations',{name:'Menuiserie Fayt'})}finally{console.error=previousConsoleError;failBatchAt=null}
equal(response.status,500,'erreur transactionnelle remontée');
equal(database.prepare("SELECT COUNT(*) count FROM organizations WHERE name='Menuiserie Fayt'").get().count,0,'organisation absente après rollback');
equal(database.prepare("SELECT COUNT(*) count FROM roles r JOIN organizations o ON o.id=r.organization_id WHERE o.name='Menuiserie Fayt'").get().count,0,'aucun rôle partiel après rollback');
equal(database.prepare("SELECT COUNT(*) count FROM organization_members om JOIN organizations o ON o.id=om.organization_id WHERE o.name='Menuiserie Fayt'").get().count,0,'aucune adhésion partielle après rollback');

response=await request('owner','POST','/api/organizations',{name:'  Menuiserie Fayt  '});equal(response.status,201,'OWNER crée Fayt');
const created=response.body.organization;ok(created?.id?.startsWith('org-'),'identifiant tenant généré côté serveur');equal(created.name,'Menuiserie Fayt');equal(created.country,'BE','défaut pays du schéma');equal(created.currency,'EUR','défaut devise du schéma');
equal(database.prepare("SELECT COUNT(*) count FROM organizations WHERE id='org-batinova'").get().count,1,'aucun remplacement BatiNova');
const createdRoles=database.prepare('SELECT id,code,name FROM roles WHERE organization_id=? ORDER BY code').all(created.id);equal(createdRoles.length,4,'quatre rôles canoniques créés');
equal(createdRoles.map(row=>row.code).sort().join(','),'ACCOUNTING,OWNER,TEAM_LEAD,WORKER','codes de rôles canoniques');
const ownerRoleId=createdRoles.find(row=>row.code==='OWNER').id,ownerMembership=database.prepare('SELECT user_id,status,role_id FROM organization_members WHERE organization_id=?').get(created.id);
equal(ownerMembership.user_id,'owner','OWNER courant rattaché');equal(ownerMembership.status,'active','adhésion active');equal(ownerMembership.role_id,ownerRoleId,'adhésion sur le rôle OWNER');
equal(database.prepare('SELECT COUNT(*) count FROM role_permissions WHERE role_id=?').get(ownerRoleId).count,0,'OWNER conserve le modèle de permissions implicites');
for(const code of ['TEAM_LEAD','WORKER','ACCOUNTING'])ok(database.prepare('SELECT COUNT(*) count FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.organization_id=? AND r.code=?').get(created.id,code).count>0,`${code} possède les permissions canoniques`);
const ownerRoleMap=new Map(createdRoles.map(item=>[item.code,item.id]));
for(const code of ['TEAM_LEAD','WORKER','ACCOUNTING']){
  const seed=database.prepare('SELECT rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.organization_id=? AND r.code=? ORDER BY rp.permission_code').all(created.id,code).map(row=>row.permission_code).join('|');
  ok(seed.length>0,`${code} permissions disponibles`);
  ok(ownerRoleMap.get(code),`${code} rôle retrouvé`);
}
equal(database.prepare("SELECT COUNT(*) count FROM audit_logs WHERE organization_id=? AND action='organization.created' AND entity_id=? AND user_id='owner'").get(created.id,created.id).count,1,'création auditée dans le tenant créé');

// The new organization is empty apart from its tenant setup and creation audit.
const allowedTenantTables=new Set(['organizations','roles','organization_members','audit_logs']);
const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
for(const table of tables){
  const columns=database.prepare(`PRAGMA table_info("${table}")`).all().map(column=>column.name);
  if(columns.includes('organization_id')&&!allowedTenantTables.has(table))equal(database.prepare(`SELECT COUNT(*) count FROM "${table}" WHERE organization_id=?`).get(created.id).count,0,`aucune donnée métier dans ${table}`);
}
equal(database.prepare('SELECT COUNT(*) count FROM organization_members WHERE organization_id=?').get(created.id).count,1,'seul le compte OWNER est membre');
equal(database.prepare('SELECT COUNT(*) count FROM audit_logs WHERE organization_id=?').get(created.id).count,1,'seule trace système, sans donnée métier');

// GET returns the new company; the active tenant remains the caller's original tenant.
response=await request('owner','GET','/api/organizations');equal(response.status,200);equal(response.body.activeOrganizationId,'org-simu','tenant actif conservé');
ok(response.body.organizations.some(item=>item.id===created.id&&item.name==='Menuiserie Fayt'&&item.role_code==='OWNER'),'Fayt apparaît dans les organisations du compte');
equal(tenantSnapshot('org-batinova'),batinovaBefore,'BatiNova strictement inchangée');

// Role permissions match the existing one-time canonical bootstrap definitions.
response=await request('bootstrap-reference','GET','/api/bootstrap',undefined,{organizationId:null});equal(response.status,200,'bootstrap de référence existant accessible');
for(const code of ['OWNER','TEAM_LEAD','WORKER','ACCOUNTING']){
  const expected=database.prepare('SELECT rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.organization_id=? AND r.code=? ORDER BY rp.permission_code').all('org-bootstrap-reference',code).map(row=>row.permission_code).join('|');
  const actual=database.prepare('SELECT rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.organization_id=? AND r.code=? ORDER BY rp.permission_code').all(created.id,code).map(row=>row.permission_code).join('|');
  equal(actual,expected,`${code} identique aux permissions du bootstrap canonique`);
}
equal(database.prepare('PRAGMA foreign_key_check').all().length,0,'foreign_key_check = 0');
equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity_check = ok');
console.log('multi-org-create-01: création OWNER-only, atomicité, rôles canoniques, tenant vide et préservation BatiNova PASS');
