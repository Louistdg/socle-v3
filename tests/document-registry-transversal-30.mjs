import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>{const r=db.prepare(s._sql).run(...s._values);return{meta:{changes:Number(r.changes)}}});db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
const stamp='2026-09-29T14:30:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','Louis','Owner',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','SOCLE Test','SOCLE Test','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Patron',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org','owner','role-owner','active',stamp,stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('worker','Willy','Worker',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-worker','org','WORKER','Ouvrier',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-worker','org','worker','role-worker','active',stamp,stamp,stamp);
db.prepare('INSERT INTO projects(id,organization_id,name,status,country,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('project-1','org','Chantier test','active','BE',stamp,stamp);
db.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('supplier-1','org','Fournisseur test','BE',30,stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-other','Autre société','Autre société','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('supplier-other','org-other','Fournisseur externe','BE',30,stamp,stamp);

async function req(method,path,payload,user='owner',organizationId='org'){
  const headers={'oai-authenticated-user-id':user,'x-socle-organization-id':organizationId,'origin':'https://socle.test'};
  let body=payload;
  if(payload!==undefined && !(payload instanceof FormData)){headers['content-type']='application/json';body=JSON.stringify(payload)}
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(body!==undefined?{body}:{})}),env);
  const type=response.headers.get('content-type')||'';
  return {status:response.status,body:type.includes('json')?await response.json():new Uint8Array(await response.arrayBuffer())};
}
function form({key,title,documentType,documentDate,origin,ownerType,ownerId,relations=[]}){
  const f=new FormData();
  f.set('operationKey',key);
  f.set('title',title);
  f.set('category','Administratif');
  f.set('documentType',documentType);
  f.set('documentDate',documentDate);
  f.set('origin',origin);
  f.set('ownerType',ownerType);
  f.set('ownerId',ownerId);
  f.set('relations',JSON.stringify(relations));
  f.set('file',new Blob([new Uint8Array([0x25,0x50,0x44,0x46,0x2d,0x31,0x2e,0x34,0x0a,0x25,0x45,0x4f,0x46])],{type:'application/pdf'}),title+'.pdf');
  return f;
}
let n=0;const eq=(a,b,m)=>{assert.equal(a,b,m);n++},ok=(v,m)=>{assert.ok(v,m);n++};

let r=await req('POST','/api/documents',form({
  key:'registry-1',title:'PV réception',documentType:'report',documentDate:'2026-09-20',origin:'mobile_upload',
  ownerType:'project',ownerId:'project-1',relations:[{type:'project',targetId:'project-1'},{type:'supplier',targetId:'supplier-1'}]
}));
eq(r.status,201,'upload registre');
const id=r.body.document.id;
eq(r.body.document.documentType,'report','type documentaire canonique');
eq(r.body.document.documentDate,'2026-09-20','date métier');
eq(r.body.document.origin,'mobile_upload','origine');
eq(r.body.document.ownerType,'project','type propriétaire métier');
eq(r.body.document.ownerId,'project-1','id propriétaire métier');
eq(r.body.document.uploadedBy,'owner','auteur dérivé de la session');


r=await req('GET','/api/documents',undefined,'worker');
eq(r.status,403,'WORKER sans permission documentaire refusé côté serveur');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','documents.secure.view');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','projects.view.assigned');
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','worker','project-1','owner',stamp);
r=await req('GET','/api/documents',undefined,'worker');
eq(r.status,200,'WORKER avec view peut lister côté serveur');
eq(r.body.documents.some(document=>document.id===id),true,'WORKER ne voit que le document dans son périmètre autorisé');
r=await req('POST','/api/documents',form({
  key:'worker-upload-1',title:'Tentative ouvrier',documentType:'report',documentDate:'2026-09-20',origin:'mobile_upload',
  ownerType:'project',ownerId:'project-1',relations:[{type:'project',targetId:'project-1'}]
}),'worker');
eq(r.status,403,'documents.secure.view seul ne permet pas un upload');
r=await req('GET','/api/documents',undefined,'owner','org-other');
eq(r.status,403,'header organisation forgé ne donne aucun accès documentaire cross-tenant');


r=await req('POST','/api/documents',form({
  key:'registry-1',title:'PV réception',documentType:'report',documentDate:'2026-09-20',origin:'mobile_upload',
  ownerType:'project',ownerId:'project-1',relations:[{type:'project',targetId:'project-1'},{type:'supplier',targetId:'supplier-1'}]
}));
eq(r.status,200,'rejeu identique accepté');
eq(r.body.replayed,true,'rejeu identique signalé');

const idempotencyBefore={
  documents:Number(db.prepare('SELECT COUNT(*) n FROM secure_documents WHERE organization_id=?').get('org').n),
  relations:Number(db.prepare('SELECT COUNT(*) n FROM document_relations WHERE organization_id=? AND document_id=?').get('org',id).n),
  uploads:Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id=? AND entity_type='secure_document' AND entity_id=? AND action='document.uploaded'").get('org',id).n)
};
r=await req('POST','/api/documents',form({
  key:'registry-1',title:'PV réception',documentType:'report',documentDate:'2026-09-21',origin:'mobile_upload',
  ownerType:'project',ownerId:'project-1',relations:[{type:'project',targetId:'project-1'},{type:'supplier',targetId:'supplier-1'}]
}));
eq(r.status,409,'même clé et même fichier avec métadonnées différentes refusés');
eq(Number(db.prepare('SELECT COUNT(*) n FROM secure_documents WHERE organization_id=?').get('org').n),idempotencyBefore.documents,'aucun document supplémentaire après conflit idempotence');
eq(Number(db.prepare('SELECT COUNT(*) n FROM document_relations WHERE organization_id=? AND document_id=?').get('org',id).n),idempotencyBefore.relations,'aucune relation supplémentaire après conflit idempotence');
eq(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id=? AND entity_type='secure_document' AND entity_id=? AND action='document.uploaded'").get('org',id).n),idempotencyBefore.uploads,'aucun audit upload supplémentaire après conflit idempotence');

r=await req('POST','/api/documents',form({
  key:'registry-1',title:'PV réception',documentType:'report',documentDate:'2026-09-20',origin:'mobile_upload',
  ownerType:'project',ownerId:'project-1',relations:[{type:'project',targetId:'project-1'}]
}));
eq(r.status,409,'même clé et même fichier avec relations différentes refusés');
eq(Number(db.prepare('SELECT COUNT(*) n FROM secure_documents WHERE organization_id=?').get('org').n),idempotencyBefore.documents,'aucun document supplémentaire après conflit de relations');
eq(Number(db.prepare('SELECT COUNT(*) n FROM document_relations WHERE organization_id=? AND document_id=?').get('org',id).n),idempotencyBefore.relations,'aucune relation modifiée après conflit de relations');
eq(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id=? AND entity_type='secure_document' AND entity_id=? AND action='document.uploaded'").get('org',id).n),idempotencyBefore.uploads,'aucun audit upload supplémentaire après conflit de relations');

r=await req('POST','/api/documents',form({
  key:'registry-2',title:'Facture achat',documentType:'supplier_invoice',documentDate:'2026-09-21',origin:'manual_upload',
  ownerType:'supplier',ownerId:'supplier-1',relations:[{type:'supplier',targetId:'supplier-1'}]
}));
eq(r.status,201,'second upload registre');

r=await req('GET','/api/documents?document_type=report');
eq(r.status,200,'filtre type accepté');
eq(r.body.documents.length,1,'filtre type serveur');
eq(r.body.documents[0].id,id,'bon document filtré');

r=await req('GET','/api/documents?origin=mobile_upload&date_from=2026-09-19&date_to=2026-09-20');
eq(r.status,200,'filtres origine/date acceptés');
eq(r.body.documents.length,1,'origine/date appliquées');
eq(r.body.documents[0].id,id,'document attendu après filtre');

r=await req('PATCH','/api/documents/'+id,{title:'PV réception signé',documentType:'signed_report',documentDate:'2026-09-22',ownerType:'project',ownerId:'project-1'});
eq(r.status,200,'métadonnées registre modifiables');
eq(r.body.document.documentType,'signed_report','type mis à jour');
eq(r.body.document.documentDate,'2026-09-22','date mise à jour');
eq(r.body.document.origin,'mobile_upload','origine de création préservée');

r=await req('POST','/api/documents',form({
  key:'registry-cross-owner',title:'Cross tenant owner',documentType:'report',documentDate:'2026-09-20',origin:'manual_upload',
  ownerType:'supplier',ownerId:'supplier-other',relations:[]
}));
eq(r.status,404,'propriétaire métier cross-tenant refusé');

r=await req('POST','/api/documents',form({
  key:'registry-invalid-date',title:'Bad date',documentType:'report',documentDate:'2026-02-31',origin:'manual_upload',
  ownerType:'organization',ownerId:'org',relations:[]
}));
eq(r.status,400,'date documentaire invalide refusée');

r=await req('POST','/api/documents',form({
  key:'registry-invalid-origin',title:'Bad origin',documentType:'report',documentDate:'2026-09-20',origin:'public_url',
  ownerType:'organization',ownerId:'org',relations:[]
}));
eq(r.status,400,'origine non canonique refusée');

r=await req('POST','/api/documents',form({
  key:'registry-forged-migration',title:'Forged migration',documentType:'report',documentDate:'2026-09-20',origin:'migration',
  ownerType:'organization',ownerId:'org',relations:[]
}));
eq(r.status,400,'origine interne migration réservée au serveur');

r=await req('PATCH','/api/documents/'+id,{origin:'migration'});
eq(r.status,400,'origine immuable après création');

const ownerRelation=(await req('GET','/api/documents/'+id)).body.document.relations.find(x=>x.type==='project'&&x.targetId==='project-1');
ok(ownerRelation,'relation propriétaire présente');
r=await req('DELETE','/api/documents/'+id+'/relations/'+ownerRelation.id);
eq(r.status,409,'relation propriétaire protégée');

r=await req('GET','/api/documents/'+id+'/history');
eq(r.status,200,'historique consultable');
ok(Array.isArray(r.body.history),'historique sous forme de liste');
ok(r.body.history.some(e=>e.action==='document.uploaded'),'historique upload');
ok(r.body.history.some(e=>e.action==='document.metadata.updated'),'historique métadonnées');

r=await req('POST','/api/documents/'+id+'/archive',{reason:'doublon'});
eq(r.status,200,'suppression contrôlée par archivage');
eq(r.body.reason,'doublon','raison de suppression conservée');

r=await req('GET','/api/documents/'+id+'/history');
eq(r.status,200,'historique disponible après archivage');
ok(r.body.history.some(e=>e.action==='document.archived' && e.newValues?.reason==='doublon'),'trace archivage + raison');

console.log(`document-registry-transversal-30: ${n} assertions passed`);
