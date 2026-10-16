import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

assert.ok(migrations.includes('0043_quote_preproject_lifecycle.sql'));
const projectColumn=db.prepare("PRAGMA table_info(quotes_server)").all().find(row=>row.name==='project_id');
assert.equal(projectColumn?.notnull,0,'0043 rend project_id nullable');

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements){const r=db.prepare(s._sql).run(...s._values);out.push({meta:{changes:Number(r.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

const stamp='2026-10-06T21:30:00.000Z';
for(const [id,name] of [['org-a','Entreprise A'],['org-b','Entreprise B']]){
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
}
for(const [uid,org,code] of [
  ['owner-a','org-a','OWNER'],
  ['team-a','org-a','TEAM_LEAD'],
  ['worker-a','org-a','WORKER'],
  ['accounting-a','org-a','ACCOUNTING'],
  ['owner-b','org-b','OWNER']
]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(uid,uid,'Test',uid+'@example.test',stamp,stamp);
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,org,code,code,stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+uid,org,uid,'role-'+uid,'active',stamp,stamp,stamp);
}
for(const permission of ['quotes.view','customers.view']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-team-a',permission);
}
for(const permission of ['documents.secure.view']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-team-a',permission);
}
for(const permission of ['documents.secure.view']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker-a',permission);
}
for(const permission of ['quotes.view','quotes.prices.view','customers.view']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-accounting-a',permission);
}

db.prepare("INSERT INTO customers(id,organization_id,type,company_name,street,postal_code,city,country,notes,payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .run('cust-a','org-a','company','Client Canonique A','Rue du Client 1','5000','Namur','BE','',30,stamp,stamp);
db.prepare("INSERT INTO customers(id,organization_id,type,company_name,street,postal_code,city,country,notes,payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .run('cust-b','org-b','company','Client Canonique B','Rue B 2','6000','Charleroi','BE','',30,stamp,stamp);
db.prepare("INSERT INTO projects(id,organization_id,customer_id,name,reference,status,country,quoted_amount_cents,created_at,updated_at) VALUES(?,?,?,?,?,'draft','BE',0,?,?)")
  .run('proj-old','org-a','cust-a','Chantier historique','HIST-001',stamp,stamp);

async function request(uid,method,path,payload,org='org-a'){
  const headers={'origin':'https://socle.test','x-socle-organization-id':org};
  if(uid)headers['oai-authenticated-user-id']=uid;
  let body=payload;
  if(payload!==undefined&&!(payload instanceof FormData)){headers['content-type']='application/json';body=JSON.stringify(payload)}
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(body===undefined?{}:{body})}),env);
  const type=response.headers.get('content-type')||'';
  return {status:response.status,body:type.includes('json')?await response.json():new Uint8Array(await response.arrayBuffer())};
}
function quotePayload(overrides={}){
  return {
    customerId:'cust-a',
    projectId:null,
    reference:'DEV-PRE-001',
    status:'draft',
    title:'Rénovation pré-chantier',
    client:'Libellé forgé ignoré',
    clientAddress:'Rue du futur chantier 8, Namur',
    date:'2026-10-06',
    validUntil:'2026-11-06',
    deposit:30,
    paymentTerms:'30 jours',
    notes:'Préparation commerciale',
    exclusions:'',
    lines:[{label:'Toiture',description:'Réfection',qty:10,unit:'m²',price:100,vat:21}],
    ...overrides
  };
}
function documentForm(quoteId){
  const form=new FormData();
  form.set('operationKey','e2e02-document-0001');
  form.set('title','Devis signé pré-chantier');
  form.set('category','Devis');
  form.set('documentType','quote');
  form.set('documentDate','2026-10-06');
  form.set('origin','manual_upload');
  form.set('ownerType','quote');
  form.set('ownerId',quoteId);
  form.set('relations',JSON.stringify([{type:'quote',targetId:quoteId},{type:'customer',targetId:'cust-a'}]));
  form.set('file',new Blob([new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0x45,0x4f,0x46])],{type:'application/pdf'}),'devis-prechantier.pdf');
  return form;
}
function visitFileForm(entries,key='visit-files-00001'){
  const form=new FormData();form.set('operationKey',key);
  for(const [kind,name,mime,bytes] of entries)form.append(kind,new Blob([new Uint8Array(bytes)],{type:mime}),name);
  return form;
}
let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};

const initial={
  projects:Number(db.prepare("SELECT COUNT(*) n FROM projects WHERE organization_id='org-a'").get().n),
  baselines:Number(db.prepare("SELECT COUNT(*) n FROM project_financial_baselines WHERE organization_id='org-a'").get().n),
  stock:Number(db.prepare("SELECT COUNT(*) n FROM field_stock_movements WHERE organization_id='org-a'").get().n),
  deliveries:Number(db.prepare("SELECT COUNT(*) n FROM field_delivery_notes WHERE organization_id='org-a'").get().n)
};

let r=await request('owner-a','POST','/api/quotes',quotePayload());
eq(r.status,201,'OWNER crée un devis pré-chantier');
const preQuoteId=r.body.quote.id;
eq(r.body.quote.projectId,null,'projectId reste null');
eq(r.body.quote.customerId,'cust-a','customerId canonique conservé');
eq(r.body.quote.client,'Client Canonique A','client_name est une projection du client canonique');
eq(r.body.quote.status,'draft','statut initial cohérent');
eq(Number(db.prepare("SELECT COUNT(*) n FROM projects WHERE organization_id='org-a'").get().n),initial.projects,'aucun chantier créé');
eq(Number(db.prepare("SELECT COUNT(*) n FROM project_financial_baselines WHERE organization_id='org-a'").get().n),initial.baselines,'aucune baseline créée');

r=await request('owner-a','POST','/api/quotes',quotePayload({customerId:null,reference:'DEV-NO-CUSTOMER'}));
eq(r.status,400,'customerId obligatoire sans chantier');

r=await request('owner-a','POST','/api/quotes',quotePayload({customerId:'cust-b',reference:'DEV-CROSS-CUSTOMER'}));
eq(r.status,404,'customerId autre tenant refusé');

r=await request('owner-a','PUT','/api/quotes/'+preQuoteId,quotePayload({reference:'DEV-PRE-001',status:'sent',title:'Rénovation pré-chantier envoyée'}));
eq(r.status,200,'édition pré-chantier');
eq(r.body.quote.status,'sent','statut sent pré-chantier');

r=await request('owner-a','PUT','/api/quotes/'+preQuoteId,quotePayload({reference:'DEV-PRE-001',status:'accepted',title:'Rénovation pré-chantier envoyée'}));
eq(r.status,200,'acceptation pré-chantier');
eq(r.body.quote.status,'accepted','devis pré-chantier accepté');
eq(r.body.quote.projectId,null,'acceptation ne crée pas de lien projet');
eq(Number(db.prepare("SELECT COUNT(*) n FROM projects WHERE organization_id='org-a'").get().n),initial.projects,'acceptation ne crée aucun chantier');
eq(Number(db.prepare("SELECT COUNT(*) n FROM project_financial_baselines WHERE organization_id='org-a'").get().n),initial.baselines,'acceptation ne bootstrap aucune baseline');
eq(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-a' AND action='quote.accepted' AND entity_id=?").get(preQuoteId).n),1,'acceptation auditée une fois');

r=await request('owner-a','PUT','/api/quotes/'+preQuoteId,quotePayload({reference:'DEV-PRE-001',status:'accepted',title:'Rénovation pré-chantier envoyée'}));
eq(r.status,200,'rejeu acceptation autorisé');
eq(r.body.replayed,true,'transition identique idempotente');
eq(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-a' AND action='quote.accepted' AND entity_id=?").get(preQuoteId).n),1,'rejeu sans second audit acceptation');

r=await request('owner-a','POST','/api/quote-visits',{customerId:'cust-a',place:'Rue du chantier 12, Namur',contact:'Mme Dupont',notes:'MESURES PAR ZONE\n1. Façade · 8 m · télémètre laser · vérifiée sur place',operationKey:'visit-create-00001'});
eq(r.status,201,'OWNER crée un relevé de visite serveur');
const visitId=r.body.visit.id;
eq(r.body.visit.customerId,'cust-a','relevé relié au client canonique de la même entreprise');
r=await request('owner-a','POST','/api/quote-visits',{customerId:'cust-b',place:'Adresse étrangère',contact:'',notes:'',operationKey:'visit-create-cross-01'});
eq(r.status,404,'client d’une autre entreprise refusé pour le relevé');
r=await request('worker-a','POST','/api/quote-visits',{place:'Rue interdite',contact:'',notes:'',operationKey:'visit-worker-0001'});
eq(r.status,403,'ouvrier sans droit devis ne crée pas de relevé');
r=await request('worker-a','GET','/api/quote-visits');
eq(r.status,403,'ouvrier sans droit devis ne lit pas le relevé');
r=await request('owner-a','POST',`/api/quote-visits/${visitId}/attachments`,visitFileForm([
  ['photos','chantier.png','image/png',[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]],
  ['sketches','croquis.png','image/png',[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,2]],
  ['voice','note-vocale.webm','audio/webm',[0x1a,0x45,0xdf,0xa3,1,2,3,4]]
]));
eq(r.status,200,'photos, croquis et mémo vocal sont stockés sur le serveur');
eq(r.body.visit.documents.length,3,'trois pièces privées sont reliées au relevé');
eq(Number(db.prepare("SELECT COUNT(*) n FROM secure_document_blobs WHERE organization_id='org-a'").get().n),3,'les pièces du relevé sont des blobs privés persistants');
r=await request('team-a','GET','/api/quote-visits');
eq(r.status,200,'membre autorisé reprend le relevé depuis une autre session');
ok(r.body.visits.some(item=>item.id===visitId),'le relevé est visible sur un autre appareil');
r=await request('owner-a','POST',`/api/quote-visits/${visitId}/quote`,{quoteId:preQuoteId});
eq(r.status,200,'visite liée au devis existant');
r=await request('owner-a','POST',`/api/quote-visits/${visitId}/quote`,{quoteId:preQuoteId});
eq(r.body.replayed,true,'liaison du relevé au devis idempotente');
eq(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-a' AND action='quote_visit.document_linked' AND json_extract(new_values,'$.quote_id')=?").get(preQuoteId).n),3,'les pièces de visite liées au devis sont auditables');
r=await request('owner-b','GET',`/api/quote-visits/${visitId}`,undefined,'org-b');
eq(r.status,404,'visite inaccessible à une autre entreprise');
const visitDocumentId=db.prepare("SELECT document_id FROM quote_site_visit_documents WHERE organization_id='org-a' AND visit_id=? LIMIT 1").get(visitId).document_id;
r=await request('owner-b','GET','/api/documents/'+visitDocumentId+'/preview',undefined,'org-b');
eq(r.status,404,'pièces de visite invisibles à une autre entreprise');

r=await request('owner-a','POST','/api/quotes/'+preQuoteId+'/amendments',{reference:'AV-PRE-001',title:'Avenant impossible',reason:'Pré-chantier',amountCents:1000,vatAmountCents:210,status:'draft',effectiveDate:'2026-10-06',notes:''});
eq(r.status,409,'avenant pré-chantier retourne une erreur métier explicite');

r=await request('owner-a','POST','/api/documents',documentForm(preQuoteId));
eq(r.status,201,'document lié au devis pré-chantier');
const documentId=r.body.document.id;
const relations=db.prepare("SELECT relation_type,relation_id FROM document_relations WHERE organization_id='org-a' AND document_id=? ORDER BY relation_type").all(documentId);
ok(relations.some(row=>row.relation_type==='quote'&&row.relation_id===preQuoteId),'relation quote canonique');
ok(relations.some(row=>row.relation_type==='customer'&&row.relation_id==='cust-a'),'relation customer canonique');
ok(!relations.some(row=>row.relation_type==='project'),'aucune relation project fictive');
r=await request('owner-a','GET','/api/documents?relation_type=quote&relation_id='+encodeURIComponent(preQuoteId));
eq(r.status,200,'registre documentaire filtre le devis pré-chantier');
ok(r.body.documents.some(document=>document.id===documentId),'document pré-chantier relu');

r=await request('owner-b','GET','/api/quotes/'+preQuoteId,undefined,'org-b');
eq(r.status,404,'quoteId tenant A invisible tenant B');
r=await request('owner-b','PUT','/api/quotes/'+preQuoteId,quotePayload({customerId:'cust-b',reference:'DEV-PRE-001'}),'org-b');
eq(r.status,404,'quoteId forgé en écriture refusé');
r=await request('owner-b','GET','/api/quotes',undefined,'org-b');
eq(r.status,200,'tenant B peut lister ses propres devis');
ok(!r.body.quotes.some(quote=>quote.id===preQuoteId),'liste tenant B sans fuite tenant A');

r=await request('team-a','POST','/api/quotes',quotePayload({reference:'DEV-TEAM-DENIED'}));
eq(r.status,403,'TEAM_LEAD sans quotes.create refusé');
db.prepare("INSERT INTO role_permissions(role_id,permission_code) VALUES('role-team-a','quotes.create')").run();
db.prepare("INSERT INTO role_permissions(role_id,permission_code) VALUES('role-team-a','quotes.edit')").run();
r=await request('team-a','POST','/api/quotes',quotePayload({reference:'DEV-TEAM-OK',title:'Devis équipe autorisée'}));
eq(r.status,201,'TEAM_LEAD avec permissions réelles autorisé');
eq(r.body.quote.projectId,null,'TEAM_LEAD crée sans projet');

r=await request('worker-a','GET','/api/quotes');
eq(r.status,403,'WORKER sans droit commercial refusé en lecture');
r=await request('worker-a','POST','/api/quotes',quotePayload({reference:'DEV-WORKER'}));
eq(r.status,403,'WORKER sans droit commercial refusé en écriture');

r=await request('accounting-a','GET','/api/quotes');
eq(r.status,200,'ACCOUNTING avec quotes.view lit les devis');
r=await request('accounting-a','POST','/api/quotes',quotePayload({reference:'DEV-ACCOUNTING'}));
eq(r.status,403,'ACCOUNTING sans quotes.create ne gagne aucun droit implicite');

r=await request('owner-a','POST','/api/quotes',{
  projectId:'proj-old',customerId:null,reference:'DEV-HIST-001',status:'draft',
  title:'Devis historique lié',client:'Client historique',clientAddress:'Adresse historique',
  date:'2026-10-06',validUntil:'2026-11-06',deposit:0,paymentTerms:'',notes:'',exclusions:'',
  lines:[{label:'Historique',qty:1,unit:'forfait',price:100,vat:21}]
});
eq(r.status,201,'devis lié à un chantier reste compatible');
const historicQuoteId=r.body.quote.id;
eq(r.body.quote.projectId,'proj-old','projectId historique conservé');
eq(r.body.quote.customerId,null,'client historique sans customerId reste accepté');

r=await request('owner-a','PUT','/api/quotes/'+historicQuoteId,{
  projectId:'proj-old',customerId:null,reference:'DEV-HIST-001',status:'accepted',
  title:'Devis historique lié',client:'Client historique',clientAddress:'Adresse historique',
  date:'2026-10-06',validUntil:'2026-11-06',deposit:0,paymentTerms:'',notes:'',exclusions:'',
  lines:[{label:'Historique',qty:1,unit:'forfait',price:100,vat:21}]
});
eq(r.status,200,'acceptation historique reste fonctionnelle');
eq(Number(db.prepare("SELECT quoted_amount_cents FROM projects WHERE organization_id='org-a' AND id='proj-old'").get().quoted_amount_cents),12100,'acceptation historique met toujours à jour le chantier');

eq(Number(db.prepare("SELECT COUNT(*) n FROM field_stock_movements WHERE organization_id='org-a'").get().n),initial.stock,'aucun mouvement Stock E2E-02');
eq(Number(db.prepare("SELECT COUNT(*) n FROM field_delivery_notes WHERE organization_id='org-a'").get().n),initial.deliveries,'aucun BL E2E-02');
eq(Number(db.prepare("SELECT COUNT(*) n FROM project_financial_baselines WHERE organization_id='org-a'").get().n),initial.baselines,'aucune baseline E2E-02');

assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[],'aucune violation FK après le scénario E2E-02');
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','intégrité SQLite après E2E-02');

console.log('e2e-02-quote-preproject-lifecycle: '+assertions+' assertions passed');
