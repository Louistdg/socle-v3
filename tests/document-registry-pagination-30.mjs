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

const stamp='2026-09-29T18:30:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','Louis','Owner',stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('worker','Willy','Worker',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','SOCLE Test','SOCLE Test','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Patron',stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-worker','org','WORKER','Ouvrier',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org','owner','role-owner','active',stamp,stamp,stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-worker','org','worker','role-worker','active',stamp,stamp,stamp);
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','documents.secure.view');
db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','projects.view.assigned');
db.prepare('INSERT INTO projects(id,organization_id,name,status,country,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('project-visible','org','Visible','active','BE',stamp,stamp);
db.prepare('INSERT INTO projects(id,organization_id,name,status,country,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('project-hidden','org','Hidden','active','BE',stamp,stamp);
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','worker','project-visible','owner',stamp);
db.prepare("INSERT INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'Documents','company',NULL,'standard',?,?,?)").run('folder','org','owner',stamp,stamp);

function insertDocument(id,projectId,documentDate,createdAt){
  db.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key,document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,?,?,?,?,'available',?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,'org','folder','private/org/'+id,id+'.pdf','application/pdf',4,'hash-'+id,'standard','owner',createdAt,createdAt,id,'','administratif','', 'key-'+id,'report',documentDate,'manual_upload','project',projectId,'manual','not_requested','');
  db.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').run(id,'org',new Uint8Array([1,2,3,4]),createdAt);
  db.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run('rel-'+id,'org',id,'project',projectId,'owner',createdAt);
}

for(let i=0;i<250;i++){
  insertDocument('hidden-'+String(i).padStart(3,'0'),'project-hidden','2026-09-30',`2026-09-29T18:${String(Math.floor(i/60)).padStart(2,'0')}:${String(i%60).padStart(2,'0')}.000Z`);
}
insertDocument('visible-after-cap','project-visible','2026-09-01','2026-09-01T00:00:00.000Z');

async function req(path){
  const response=await worker.fetch(new Request('https://socle.test'+path,{headers:{
    'oai-authenticated-user-id':'worker',
    'x-socle-organization-id':'org',
    'origin':'https://socle.test'
  }}),env);
  return {status:response.status,body:await response.json()};
}

const first=await req('/api/documents?limit=20');
assert.equal(first.status,200,'liste documentaire accessible');
assert.equal(first.body.limit,20,'le serveur confirme la taille de page');
assert.ok(first.body.documents.some(document=>document.id==='visible-after-cap'),'un document autorisé après plus de 250 candidats non autorisés reste retrouvable');
assert.equal(first.body.nextCursor,null,'aucune page visible supplémentaire après le seul document autorisé');

const invalid=await req('/api/documents?cursor=not-a-valid-document-cursor');
assert.equal(invalid.status,400,'curseur documentaire invalide refusé');

console.log('document-registry-pagination-30: 5 assertions passed');
