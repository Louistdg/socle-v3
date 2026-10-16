import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
for(const name of ['0001_server_core.sql','0003_secure_documents.sql','0014_documents_private_relations.sql']){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const stamp='2026-09-29T16:00:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','Louis','Owner',stamp,stamp);
for(const [id,name] of [['org-a','Entreprise A'],['org-b','Entreprise B']]){
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
}
for(const [id,org] of [['folder-a','org-a'],['folder-b','org-b']]){
  db.prepare("INSERT INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'Documents','company',NULL,'standard',?,?,?)").run(id,org,'owner',stamp,stamp);
}
db.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,'available',?,?,?,NULL,?,?,?,?,?)")
  .run('doc-a','org-a','folder-a','private/org-a/doc-a','a.pdf','application/pdf',4,'aaaa','standard','owner',stamp,stamp,'A','','administratif','A','key-a');
db.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').run('doc-a','org-a',new Uint8Array([1,2,3,4]),stamp);
db.prepare("INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)").run('rel-a','org-a','doc-a','asset','asset-a','owner',stamp);
db.prepare("INSERT INTO document_access_grants(id,document_id,folder_id,grantee_type,grantee_id,permission,granted_by,created_at,expires_at) VALUES(?,?,NULL,'user','owner','view','owner',?,NULL)").run('grant-a','doc-a',stamp);

const guards=new URL('../drizzle/0030_document_registry_transversal.sql',import.meta.url);
if(existsSync(guards))db.exec(readFileSync(guards,'utf8'));

let n=0;
function rejected(label,sql,args=[]){
  assert.throws(()=>db.prepare(sql).run(...args),undefined,label);
  n++;
}

rejected('parent de dossier cross-tenant refusé',"INSERT INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,?,'Sous-dossier','company',NULL,'standard',?,?,?)",['bad-folder','org-b','folder-a','owner',stamp,stamp]);
rejected('déplacement de dossier vers parent cross-tenant refusé','UPDATE document_folders SET parent_id=? WHERE id=?',['folder-b','folder-a']);
rejected('changement de tenant du dossier refusé','UPDATE document_folders SET organization_id=? WHERE id=?',['org-b','folder-a']);
rejected('document dans dossier cross-tenant refusé',"INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,sensitivity,status,uploaded_by,created_at,updated_at,title,description,category,reference,document_type,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,?,?,'standard','available',?,?,?,?,?,?,?,?,?,?,?,?,?,?)",['bad-doc','org-b','folder-a','private/org-b/bad','bad.pdf','application/pdf',1,'owner',stamp,stamp,'Bad','','other','','other','manual_upload','organization','org-b','manual','not_requested','']);
rejected('changement de dossier cross-tenant refusé','UPDATE secure_documents SET folder_id=? WHERE id=?',['folder-b','doc-a']);
rejected('changement de tenant du document refusé','UPDATE secure_documents SET organization_id=?,folder_id=? WHERE id=?',['org-b','folder-b','doc-a']);
rejected('blob cross-tenant par update refusé','UPDATE secure_document_blobs SET organization_id=? WHERE document_id=?',['org-b','doc-a']);
rejected('relation cross-tenant par update refusée','UPDATE document_relations SET organization_id=? WHERE id=?',['org-b','rel-a']);
rejected('journal accès cross-tenant refusé',"INSERT INTO document_access_logs(id,organization_id,document_id,user_id,action,created_at) VALUES(?,?,?,?, 'viewed',?)",['log-bad','org-b','doc-a','owner',stamp]);

const grantColumns=new Set(db.prepare('PRAGMA table_info(document_access_grants)').all().map(row=>row.name));
assert.ok(grantColumns.has('organization_id'),'les grants doivent être explicitement tenant-scoped');n++;
assert.equal(db.prepare('SELECT organization_id FROM document_access_grants WHERE id=?').get('grant-a').organization_id,'org-a','backfill tenant du grant');n++;
rejected('grant cross-tenant refusé','UPDATE document_access_grants SET organization_id=? WHERE id=?',['org-b','grant-a']);

assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,'foreign_keys reste actif');n++;
console.log('document-registry-tenant-guards-30: '+n+' assertions passed');
