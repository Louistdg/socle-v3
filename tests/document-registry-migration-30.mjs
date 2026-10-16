import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for(const name of ['0001_server_core.sql','0003_secure_documents.sql','0014_documents_private_relations.sql']){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const stamp='2026-09-29T15:00:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','Louis','Owner',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','SOCLE','SOCLE','BE','EUR',stamp,stamp);
db.prepare("INSERT INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'Documents','company',NULL,'standard',?,?,?)").run('folder','org','owner',stamp,stamp);
db.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,'available',?,?,?,NULL,?,?,?,?,?)").run('doc','org','folder','private/org/doc','ancien.pdf','application/pdf',4,'abcd','standard','owner',stamp,stamp,'Ancien','','administratif','REF','legacy-key');
db.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').run('doc','org',new Uint8Array([1,2,3,4]),stamp);

db.exec(readFileSync(new URL('../drizzle/0030_document_registry_transversal.sql',import.meta.url),'utf8'));

let n=0;const ok=(v,m)=>{assert.ok(v,m);n++},eq=(a,b,m)=>{assert.equal(a,b,m);n++};
const columns=new Set(db.prepare('PRAGMA table_info(secure_documents)').all().map(r=>r.name));
for(const column of ['document_type','document_date','origin','business_owner_type','business_owner_id','classification_source','ocr_status','archived_reason'])ok(columns.has(column),'colonne '+column);
const row=db.prepare('SELECT document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason FROM secure_documents WHERE id=?').get('doc');
eq(row.document_type,'other','type legacy');
eq(row.document_date,null,'date legacy');
eq(row.origin,'legacy','origine legacy');
eq(row.business_owner_type,'organization','owner type backfill');
eq(row.business_owner_id,'org','owner id backfill');
eq(row.classification_source,'manual','classification future-ready');
eq(row.ocr_status,'not_requested','OCR non obligatoire');
eq(row.archived_reason,'','raison archive vide par défaut');
eq(db.prepare('SELECT length(content) n FROM secure_document_blobs WHERE document_id=?').get('doc').n,4,'blob privé préservé');
const indexes=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map(r=>r.name));
ok(indexes.has('secure_documents_registry_idx'),'index registre');
ok(indexes.has('secure_documents_owner_idx'),'index propriétaire');
ok(indexes.has('audit_logs_document_history_idx'),'index historique');
eq(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,'foreign_keys actif');
console.log(`document-registry-migration-30: ${n} assertions passed`);
