import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-09-29T10:00:00.000Z';
for(const [id,first,last] of [['owner','Marc','Delcourt'],['worker','Anthony','Simon'],['limited','Léa','Accès limité']]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,first,last,stamp,stamp);
}
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [id,code,name] of [['role-owner','OWNER','Propriétaire'],['role-worker','WORKER','Ouvrier'],['role-limited','LIMITED','Commercial sans finance']]){
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,'org',code,name,stamp);
}
for(const [user,role] of [['owner','role-owner'],['worker','role-worker'],['limited','role-limited']]){
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,'org',user,role,'active',stamp,stamp,stamp);
}
db.prepare("UPDATE organization_members SET person_id='person-worker' WHERE organization_id='org' AND user_id='worker'").run();
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','projects.view.assigned');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','workspace.view');
for(const permission of ['projects.view.assigned','quotes.view','invoices.view'])db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-limited',permission);
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','worker','project-1','owner',stamp);
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','limited','project-1','owner',stamp);

const state={
  version:3,
  company:{name:'BatiNova'},
  people:[],teams:[],
  jobs:[
    {id:'project-1',name:'Résidence Meuse',reference:'BAT-001',status:'En cours',progress:35,client:'Client A',address:'Rue Test 1',town:'Namur'},
    {id:'project-2',name:'Immeuble Sambre',reference:'BAT-002',status:'En cours',progress:10,client:'Client B'}
  ],
  assignments:[],
  quotes:[{id:'quote-legacy',job:'project-1',ref:'DEV-001',status:'Accepté',lines:[{label:'Lot toiture',qty:1,price:10000}]}],
  accountingData:{customerInvoices:[{id:'invoice-legacy',job:'project-1',ref:'FAC-001',status:'À recevoir',amount:12000,date:'2026-09-20'}]},
  assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);
db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,start_time,end_time,assignment_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES('worker-assignment','org','2026-09-29','team-1','project-1','[\"person-worker\",\"person-peer\"]','07:00','16:00','individual','planned','', 'owner',?,'owner',?)").run(stamp,stamp);

for(const [id,at] of [['po-1','2026-09-29T13:00:00.000Z'],['po-2','2026-09-29T12:00:00.000Z'],['po-3','2026-09-29T11:00:00.000Z']]){
  db.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('audit-'+id,'org','owner','purchase_order.created','purchase_order',id,null,JSON.stringify({project_id:'project-1',number:id.toUpperCase()}),at);
}

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

async function call(uid,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let r=await call('owner','GET','/api/projects/project-1/hub?limit=1');
assert.equal(r.status,200,'OWNER ouvre le hub');
assert.equal(r.body.schemaVersion,1);
assert.equal(r.body.projectId,'project-1');
assert.equal(r.body.identity.name,'Résidence Meuse');
assert.equal(r.body.identity.reference,'BAT-001');
assert.equal(r.body.capabilities.viewFinancial,true);
assert.equal(Object.hasOwn(r.body,'financial'),false,'aucune section Forecast/financial dans le contrat Hub v1');
assert.ok(!Object.hasOwn(r.body,'kpis'),'aucune clé kpis hors contrat');
assert.ok(!Object.hasOwn(r.body,'progress'),'aucune clé progress hors contrat');
assert.ok(!Object.hasOwn(r.body,'recentActivity'),'aucune clé recentActivity hors contrat');

r=await call('owner','POST','/api/projects/project-1/hub',{});
assert.equal(r.status,405,'hub strictement lecture seule');
r=await call('owner','POST','/api/projects/project-1/timeline',{});
assert.equal(r.status,405,'timeline strictement lecture seule');

r=await call('worker','GET','/api/projects/project-1/hub');
assert.equal(r.status,200,'ouvrier assigné peut ouvrir le chantier');
assert.equal(r.body.schemaVersion,1);
assert.equal(r.body.capabilities.viewCommercial,false);
assert.equal(r.body.capabilities.viewProcurement,false);
assert.equal(r.body.capabilities.viewFinancial,false);
assert.equal(r.body.commercial,null);
assert.equal(r.body.procurement,null);
assert.equal(Object.hasOwn(r.body,'financial'),false);
assert.equal(r.body.summary.quotesCount,null);
assert.equal(r.body.summary.purchaseOrdersCount,null);
r=await call('worker','GET','/api/projects/project-1/field-portal?date=2026-09-29');
assert.equal(r.status,200,'le portail terrain du chantier autorisé reste accessible');
assert.equal(r.body.team.assignments.length,1);
assert.deepEqual(r.body.team.assignments[0].people,['person-worker'],'le portail terrain ne transmet pas les collègues au WORKER');
assert.equal(r.body.team.members.length,1,'le portail terrain ne retourne que le membre lui-même');

r=await call('limited','GET','/api/projects/project-1/hub');
assert.equal(r.status,200,'accès commercial limité au chantier autorisé');
assert.equal(r.body.capabilities.viewCommercial,true,'les permissions de lecture existantes sont conservées');
const legacyInvoice=r.body.commercial.clientInvoices.items.find(item=>item.number==='FAC-001');
assert.ok(legacyInvoice,'la facture reste consultable selon invoices.view');
assert.equal(Object.hasOwn(legacyInvoice,'amountTtcCents'),false,'montant facture absent sans permission financière');
assert.equal(Object.hasOwn(legacyInvoice,'amountHtCents'),false,'montant HT absent sans permission financière');
assert.equal(Object.hasOwn(legacyInvoice,'paymentStatus'),false,'statut de paiement sensible absent sans permission financière');

r=await call('worker','GET','/api/projects/project-2/hub');
assert.equal(r.status,403,'périmètre chantier appliqué côté serveur');
r=await call('worker','GET','/api/projects/project-2/hub?limit=0');
assert.equal(r.status,403,'RBAC chantier avant validation pagination Hub');
r=await call('worker','GET','/api/projects/project-2/timeline?cursor=%%%');
assert.equal(r.status,403,'RBAC chantier avant validation curseur Timeline');

r=await call('owner','GET','/api/projects/project-1/timeline');
assert.equal(r.status,200);
assert.equal(r.body.pageInfo.limit,50,'limite Timeline par défaut = 50');
r=await call('owner','GET','/api/projects/project-1/timeline?limit=999');
assert.equal(r.status,200);
assert.equal(r.body.pageInfo.limit,100,'limite Timeline plafonnée à 100');
r=await call('owner','GET','/api/projects/project-1/timeline?limit=2');
assert.equal(r.status,200);
assert.equal(r.body.schemaVersion,1);
assert.equal(r.body.events.length,2);
assert.deepEqual(r.body.events.map(event=>event.id),['purchase_order:po-1:created','purchase_order:po-2:created']);
assert.equal(r.body.pageInfo.hasMore,true);
assert.ok(r.body.pageInfo.nextCursor,'curseur présent');
assert.ok(!r.body.pageInfo.nextCursor.includes('='),'curseur Base64URL sans padding');

const firstCursor=r.body.pageInfo.nextCursor;
r=await call('owner','GET','/api/projects/project-1/timeline?limit=2&cursor='+encodeURIComponent(firstCursor));
assert.equal(r.status,200);
assert.deepEqual(r.body.events.map(event=>event.id),['purchase_order:po-3:created']);
assert.equal(r.body.pageInfo.hasMore,false);
assert.equal(r.body.pageInfo.nextCursor,null);

r=await call('worker','GET','/api/projects/project-1/timeline?limit=1');
assert.equal(r.status,200);
assert.equal(r.body.events.length,0,'événements achats filtrés avant pagination sans purchase_orders.view');
assert.equal(r.body.pageInfo.hasMore,false);

db.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('audit-po-b','org','owner','purchase_order.created','purchase_order','po-b',null,JSON.stringify({project_id:'project-1',number:'PO-B'}),'2026-09-29T14:00:00.000Z');
db.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('audit-po-a','org','owner','purchase_order.created','purchase_order','po-a',null,JSON.stringify({project_id:'project-1',number:'PO-A'}),'2026-09-29T14:00:00.000Z');
r=await call('owner','GET','/api/projects/project-1/timeline?limit=2');
assert.equal(r.status,200);
assert.deepEqual(r.body.events.map(event=>event.id),['purchase_order:po-a:created','purchase_order:po-b:created'],'tri stable occurredAt DESC puis id ASC');
r=await call('owner','GET','/api/projects/project-1/timeline?limit=0');
assert.equal(r.status,400,'limite Timeline invalide refusée');
r=await call('owner','GET','/api/projects/project-1/timeline?cursor=%%%');
assert.equal(r.status,400,'curseur invalide refusé');

assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'intégrité FK');
console.log('project-hub-timeline-33: assertions réussies');
