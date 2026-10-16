import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys),1);

const env={DB:{
  prepare(sql){let values=[];return{
    _sql:sql,
    get _values(){return values},
    bind(...args){values=args;return this},
    async first(){return db.prepare(sql).get(...values)??null},
    async all(){return{results:db.prepare(sql).all(...values)}},
    async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}
  }},
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const out=[];
      for(const s of statements){
        const r=db.prepare(s._sql).run(...s._values);
        out.push({meta:{changes:Number(r.changes)}});
      }
      db.exec('COMMIT');
      return out;
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
}};

const stamp='2026-09-29T16:55:00.000Z';
const run=(sql,...args)=>db.prepare(sql).run(...args);
const one=(sql,...args)=>db.prepare(sql).get(...args);

for(const [id,first,email] of [
  ['owner-a','Owner','owner-a@test.local'],
  ['lead-a','Lead','lead-a@test.local'],
  ['worker-a','Worker','worker-a@test.local'],
  ['owner-b','OwnerB','owner-b@test.local']
]){
  run('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,first,'QA',email,stamp,stamp);
}
for(const [id,name] of [['org-a','Org A'],['org-b','Org B']]){
  run('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,name,name,'BE','EUR',stamp,stamp);
}
for(const [id,org,code,name] of [
  ['role-owner-a','org-a','OWNER','Owner A'],
  ['role-lead-a','org-a','TEAM_LEAD','Lead A'],
  ['role-worker-a','org-a','WORKER','Worker A'],
  ['role-owner-b','org-b','OWNER','Owner B']
]){
  run('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)',id,org,code,name,stamp);
}
for(const [id,org,user,role] of [
  ['member-owner-a','org-a','owner-a','role-owner-a'],
  ['member-lead-a','org-a','lead-a','role-lead-a'],
  ['member-worker-a','org-a','worker-a','role-worker-a'],
  ['member-owner-b','org-b','owner-b','role-owner-b']
]){
  run('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,org,user,role,'active',stamp,stamp,stamp);
}

for(const roleId of ['role-lead-a','role-worker-a']){
  for(const permission of ['documents.secure.view','projects.view.assigned']){
    assert.ok(one('SELECT 1 ok FROM permissions WHERE code=?',permission),'permission manquante: '+permission);
    run('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)',roleId,permission);
  }
}
for(const user of ['lead-a','worker-a']){
  run('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)','org-a',user,'project-a1','owner-a',stamp);
}

for(const [id,org,name] of [
  ['project-a1','org-a','Projet A autorisé'],
  ['project-a2','org-a','Projet A hors périmètre'],
  ['project-b1','org-b','Projet B']
]){
  run("INSERT INTO projects(id,organization_id,customer_id,name,reference,status,country,created_at,updated_at) VALUES(?,?,NULL,?,?,'active','BE',?,?)",id,org,name,id,stamp,stamp);
}
for(const [id,org,name] of [
  ['supplier-a','org-a','Supplier A'],
  ['supplier-b','org-b','Supplier B']
]){
  run('INSERT INTO suppliers(id,organization_id,name,country,created_at,updated_at) VALUES(?,?,?,?,?,?)',id,org,name,'BE',stamp,stamp);
}

const state=(name,jobs,people)=>JSON.stringify({
  version:3,company:{name},people,teams:[],jobs,assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]
});
run('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)','org-a',state('Org A',[{id:'project-a1'},{id:'project-a2'}],[{id:'person-a',name:'Person A'}]),1,'owner-a',stamp,stamp);
run('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)','org-b',state('Org B',[{id:'project-b1'}],[{id:'person-b',name:'Person B'}]),1,'owner-b',stamp,stamp);

for(const [id,org,user] of [['folder-a','org-a','owner-a'],['folder-b','org-b','owner-b']]){
  run("INSERT INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'Documents','company',NULL,'standard',?,?,?)",id,org,user,stamp,stamp);
}

function insertDoc({id,org,folder,user,title,ownerType='organization',ownerId,blobText,projectId=null}){
  const bytes=new TextEncoder().encode(blobText);
  run("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key,document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,'application/pdf',?,?,'standard','available',?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    id,org,folder,'private/'+org+'/'+id,id+'.pdf',bytes.byteLength,'hash-'+id,user,stamp,stamp,title,'','qa','REF-'+id,null,'report','2026-09-29','manual_upload',ownerType,ownerId||org,'manual','not_requested','');
  run('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)',id,org,bytes,stamp);
  if(projectId){
    run('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)','rel-'+id+'-project',org,id,'project',projectId,user,stamp);
  }
}

insertDoc({id:'doc-a',org:'org-a',folder:'folder-a',user:'owner-a',title:'Document A accessible',ownerType:'project',ownerId:'project-a1',blobText:'AUTHORIZED-A-CONTENT',projectId:'project-a1'});
insertDoc({id:'doc-a-hidden',org:'org-a',folder:'folder-a',user:'owner-a',title:'Document A hidden project',blobText:'HIDDEN-A2-CONTENT',projectId:'project-a2'});
insertDoc({id:'doc-b',org:'org-b',folder:'folder-b',user:'owner-b',title:'Document B secret',blobText:'SECRET-B-TENANT-CONTENT',projectId:'project-b1'});

run('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?,?,?)','audit-a','org-a','owner-a','document.seeded','secure_document','doc-a',null,JSON.stringify({marker:'AUDIT-A'}),stamp);
run('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?,?,?)','audit-b','org-b','owner-b','document.seeded','secure_document','doc-b',null,JSON.stringify({marker:'AUDIT-B-SECRET'}),stamp);

async function call(uid,email,method,path,payload,org){
  const headers={origin:'https://socle.test','oai-authenticated-user-id':uid,'oai-authenticated-user-email':email};
  if(org)headers['x-socle-organization-id']=org;
  let body;
  if(payload!==undefined){
    headers['content-type']='application/json';
    body=JSON.stringify(payload);
  }
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(body!==undefined?{body}:{})}),env);
  const bytes=new Uint8Array(await response.arrayBuffer());
  const text=new TextDecoder().decode(bytes);
  let json=null;
  try{json=JSON.parse(text)}catch{}
  return{status:response.status,headers:response.headers,text,json};
}

const passed=[];
function check(label,fn){fn();passed.push(label);console.log('PASS '+label)}
const ids=r=>(r.json?.documents||[]).map(d=>d.id).sort();

let r=await call('owner-a','owner-a@test.local','GET','/api/documents',undefined,'org-a');
check('liste OWNER org A sans fuite org B',()=>assert.deepEqual(ids(r),['doc-a','doc-a-hidden']));

r=await call('lead-a','lead-a@test.local','GET','/api/documents',undefined,'org-a');
check('liste TEAM_LEAD limitée au chantier A1',()=>assert.deepEqual(ids(r),['doc-a']));

r=await call('worker-a','worker-a@test.local','GET','/api/documents',undefined,'org-a');
check('liste WORKER limitée au chantier A1',()=>assert.deepEqual(ids(r),['doc-a']));

r=await call('owner-a','owner-a@test.local','GET','/api/documents',undefined,'org-b');
check('header tenant forgé refusé',()=>{assert.equal(r.status,403);assert.doesNotMatch(r.text,/doc-b|SECRET-B-TENANT-CONTENT/)});

r=await call('lead-a','lead-a@test.local','GET','/api/documents/doc-a',undefined,'org-a');
check('détail TEAM_LEAD autorisé',()=>{assert.equal(r.status,200);assert.equal(r.json?.document?.id,'doc-a')});

r=await call('worker-a','worker-a@test.local','GET','/api/documents/doc-a-hidden',undefined,'org-a');
check('détail même tenant hors périmètre WORKER refusé',()=>assert.equal(r.status,404));

r=await call('owner-a','owner-a@test.local','GET','/api/documents/doc-b',undefined,'org-a');
check('détail cross-tenant refusé',()=>{assert.equal(r.status,404);assert.doesNotMatch(r.text,/Document B secret|SECRET-B/)});

r=await call('worker-a','worker-a@test.local','GET','/api/documents/doc-a/preview',undefined,'org-a');
check('preview autorisée',()=>{assert.equal(r.status,200);assert.equal(r.text,'AUTHORIZED-A-CONTENT')});

r=await call('lead-a','lead-a@test.local','GET','/api/documents/doc-a/download',undefined,'org-a');
check('download autorisé',()=>{assert.equal(r.status,200);assert.equal(r.text,'AUTHORIZED-A-CONTENT');assert.match(r.headers.get('content-disposition')||'',/^attachment;/)});

r=await call('owner-a','owner-a@test.local','GET','/api/documents/doc-b/preview',undefined,'org-a');
check('preview blob cross-tenant refusée sans fuite',()=>{assert.equal(r.status,404);assert.doesNotMatch(r.text,/SECRET-B-TENANT-CONTENT|Document B secret/)});

r=await call('owner-a','owner-a@test.local','PATCH','/api/documents/doc-a',{title:'Document A modifié'},'org-a');
check('metadata autorisée modifiable',()=>{assert.equal(r.status,200);assert.equal(r.json?.document?.title,'Document A modifié')});

r=await call('owner-a','owner-a@test.local','PATCH','/api/documents/doc-b',{title:'attaque'},'org-a');
check('metadata cross-tenant refusée',()=>assert.equal(r.status,404));

r=await call('owner-a','owner-a@test.local','PATCH','/api/documents/doc-a',{ownerType:'supplier',ownerId:'supplier-b'},'org-a');
check('changement propriétaire métier cross-tenant refusé',()=>{
  assert.equal(r.status,404);
  const row=one('SELECT business_owner_type,business_owner_id FROM secure_documents WHERE id=?','doc-a');
  assert.equal(row.business_owner_type,'project');
  assert.equal(row.business_owner_id,'project-a1');
});

r=await call('owner-a','owner-a@test.local','POST','/api/documents/doc-a/relations',{type:'supplier',targetId:'supplier-a'},'org-a');
check('relation supplier A autorisée',()=>{assert.equal(r.status,201);assert.equal(r.json?.relation?.targetId,'supplier-a')});

for(const [type,targetId,label] of [
  ['project','project-b1','projet B'],
  ['supplier','supplier-b','fournisseur B'],
  ['person','person-b','personne B']
]){
  r=await call('owner-a','owner-a@test.local','POST','/api/documents/doc-a/relations',{type,targetId},'org-a');
  check('relation cross-tenant '+label+' refusée',()=>assert.equal(r.status,404));
}

r=await call('owner-a','owner-a@test.local','DELETE','/api/documents/doc-a/relations/rel-doc-a-project',undefined,'org-a');
check('suppression relation propriétaire protégée',()=>assert.equal(r.status,409));

r=await call('lead-a','lead-a@test.local','GET','/api/documents/doc-a/history',undefined,'org-a');
check('historique document autorisé visible',()=>{assert.equal(r.status,200);assert.ok((r.json?.history||[]).some(e=>e.id==='audit-a'))});

r=await call('worker-a','worker-a@test.local','GET','/api/documents/doc-a-hidden/history',undefined,'org-a');
check('historique document hors chantier refusé',()=>assert.equal(r.status,404));

r=await call('owner-a','owner-a@test.local','GET','/api/documents/doc-b/history',undefined,'org-a');
check('historique cross-tenant refusé sans fuite',()=>{assert.equal(r.status,404);assert.doesNotMatch(r.text,/AUDIT-B-SECRET|audit-b/)});

r=await call('owner-a','owner-a@test.local','POST','/api/documents/doc-b/archive',{reason:'attaque'},'org-a');
check('archivage cross-tenant refusé',()=>assert.equal(r.status,404));

r=await call('owner-a','owner-a@test.local','POST','/api/documents/doc-a/archive',{reason:'QA sécurité'},'org-a');
check('archivage document autorisé',()=>{
  assert.equal(r.status,200);
  assert.ok(one('SELECT archived_at FROM secure_documents WHERE id=?','doc-a').archived_at);
});

console.log('ia3-ia5-document-access-proof-29: '+passed.length+' scénarios PASS');
