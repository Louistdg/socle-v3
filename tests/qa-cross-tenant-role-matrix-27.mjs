import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const env={DB:{prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements){const r=db.prepare(s._sql).run(...s._values);out.push({meta:{changes:Number(r.changes)}})}db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}}};

const stamp='2026-09-28T21:45:00.000Z';
assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys),1,'les FK SQLite doivent être actives');
const stateA={version:3,company:{name:'Entreprise A'},people:[],teams:[],jobs:[{id:'a1',reference:'A-1',name:'Chantier A1',finance:{margin:999}},{id:'a2',reference:'A-2',name:'Chantier A2',finance:{margin:888}}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],accountingData:{secret:'A-finance'}};
const stateB={version:3,company:{name:'Entreprise B'},people:[],teams:[],jobs:[{id:'b1',reference:'B-SECRET',name:'Chantier B secret',finance:{margin:777}}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],accountingData:{secret:'B-finance'}};

for(const [id,name] of [['org-a','Entreprise A'],['org-b','Entreprise B']])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
for(const [id,email] of [['patron','patron@a.test'],['chef','chef@a.test'],['ouvrier','ouvrier@a.test'],['comptable','comptable@a.test'],['owner-b','owner@b.test']])db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,'QA',email,stamp,stamp);
for(const [id,org,code,name] of [
 ['role-a-owner','org-a','OWNER','Patron'],['role-a-chef','org-a','TEAM_LEAD','Chef équipe'],['role-a-worker','org-a','WORKER','Ouvrier'],['role-a-accountant','org-a','ACCOUNTING','Comptable'],['role-b-owner','org-b','OWNER','Patron B']
])db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,name,stamp);
for(const [id,org,user,role,person] of [
 ['m-patron','org-a','patron','role-a-owner','p-patron'],['m-chef','org-a','chef','role-a-chef','p-chef'],['m-ouvrier','org-a','ouvrier','role-a-worker','p-ouvrier'],['m-comptable','org-a','comptable','role-a-accountant','p-comptable'],['m-owner-b','org-b','owner-b','role-b-owner','p-owner-b']
])db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run(id,org,user,role,'active',stamp,stamp,stamp,person);

const chefPermissions=['workspace.view','projects.view.assigned','tasks.view.assigned','time_entries.view.team'];
const workerPermissions=['workspace.view','projects.view.assigned','tasks.view.assigned','time_entries.view.own'];
const accountantPermissions=['invoices.view','financial.dashboard.view','expenses.view','projects.view.assigned'];
for(const permission of [...new Set([...chefPermissions,...workerPermissions,...accountantPermissions])])assert.ok(db.prepare('SELECT 1 ok FROM permissions WHERE code=?').get(permission),'permission SOCLE réelle: '+permission);
for(const p of chefPermissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-a-chef',p);
for(const p of workerPermissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-a-worker',p);
for(const p of accountantPermissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-a-accountant',p);
for(const [user,project] of [['chef','a1'],['ouvrier','a1'],['comptable','a1'],['comptable','proj-a']])db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org-a',user,project,'patron',stamp);

db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-a',JSON.stringify(stateA),1,'patron',stamp,stamp);
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-b',JSON.stringify(stateB),1,'owner-b',stamp,stamp);

for(const [id,org,name] of [['cust-a','org-a','Client A'],['cust-b','org-b','Client B']])db.prepare("INSERT INTO customers(id,organization_id,type,company_name,country,notes,payment_terms_days,created_at,updated_at) VALUES(?,?, 'company',?,'BE','',30,?,?)").run(id,org,name,stamp,stamp);
for(const [id,org,cust,name,ref] of [['proj-a','org-a','cust-a','Projet relationnel A','PA'],['proj-b','org-b','cust-b','Projet relationnel B','PB']])db.prepare("INSERT INTO projects(id,organization_id,customer_id,name,reference,status,country,created_at,updated_at) VALUES(?,?,?,?,?,'active','BE',?,?)").run(id,org,cust,name,ref,stamp,stamp);
for(const [id,org,cust,project,num,creator] of [['inv-a','org-a','cust-a','proj-a','A-INV','patron'],['inv-b','org-b','cust-b','proj-b','B-SECRET-INV','owner-b']])db.prepare("INSERT INTO invoices(id,organization_id,customer_id,project_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at,legacy_paid_cents) VALUES(?,?,?,?,?,'invoice','unpaid','2026-09-01','2026-10-01','EUR',10000,2100,12100,0,'',?,?,?,0)").run(id,org,cust,project,num,creator,stamp,stamp);

for(const [folder,doc,org,user,title] of [['folder-a','doc-a','org-a','patron','Document A'],['folder-b','doc-b','org-b','owner-b','B SECRET DOCUMENT']]){
 db.prepare("INSERT INTO document_folders(id,organization_id,parent_id,name,context_type,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'QA','company','standard',?,?,?)").run(folder,org,user,stamp,stamp);
 db.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,title,description,category,reference) VALUES(?,?,?,?,?,'application/pdf',0,NULL,'standard','available',?,?,?,?,?,'other','')").run(doc,org,folder,'key-'+doc,doc+'.pdf',user,stamp,stamp,title,'');
}
const inviteB='invite-b';
db.prepare("INSERT INTO organization_invitations(id,organization_id,email,person_id,role_id,token_hash,status,expires_at,invited_by,created_at) VALUES(?,?,?,?,?,?,'pending','2099-01-01T00:00:00.000Z',?,?)").run(inviteB,'org-b','target@b.test','p-target','role-b-owner','hash-b','owner-b',stamp);

async function call(uid,email,path,org='org-a',method='GET',payload){
 const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers:{'origin':'https://socle.test','oai-authenticated-user-id':uid,'oai-authenticated-user-email':email,'x-socle-organization-id':org,...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);
 let body={};try{body=await response.json()}catch{}return{status:response.status,body};
}
function tenantBSnapshot(){
 return {
  workspace:db.prepare("SELECT payload,revision FROM organization_workspace_state WHERE organization_id='org-b'").get(),
  projects:Number(db.prepare("SELECT COUNT(*) n FROM projects WHERE organization_id='org-b'").get().n),
  invoices:db.prepare("SELECT COUNT(*) n,COALESCE(SUM(total_cents),0) total,COALESCE(SUM(amount_paid_cents),0) paid FROM invoices WHERE organization_id='org-b'").get(),
  documents:Number(db.prepare("SELECT COUNT(*) n FROM secure_documents WHERE organization_id='org-b'").get().n),
  invitations:db.prepare("SELECT COUNT(*) n,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending FROM organization_invitations WHERE organization_id='org-b'").get(),
  projectAccess:Number(db.prepare("SELECT COUNT(*) n FROM project_access WHERE organization_id='org-b'").get().n),
  audit:Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-b'").get().n)
 };
}
async function crossTenantAttack(action){
 const before=tenantBSnapshot(),result=await action(),after=tenantBSnapshot();
 assert.deepEqual(after,before,'attaque cross-tenant sans aucune écriture/compteur/audit dans B');
 return result;
}

// Matrice API Patron.
let r=await call('patron','patron@a.test','/api/state');assert.equal(r.status,200);assert.equal(r.body.state.accountingData.secret,'A-finance');
r=await call('patron','patron@a.test','/api/projects/a1');assert.equal(r.status,200);assert.equal(r.body.project.finance.margin,999);
r=await call('patron','patron@a.test','/api/invoices/inv-a');assert.equal(r.status,200);
r=await call('patron','patron@a.test','/api/access-control');assert.equal(r.status,200);

// Chef : chantier affecté oui, autre chantier/finance/admin non.
r=await call('chef','chef@a.test','/api/state');assert.equal(r.status,200);assert.deepEqual(r.body.state.jobs.map(x=>x.id),['a1']);assert.equal(r.body.state.accountingData,undefined);
r=await call('chef','chef@a.test','/api/projects/a1');assert.equal(r.status,200);assert.equal(r.body.project.finance,undefined);
r=await call('chef','chef@a.test','/api/projects/a2');assert.equal(r.status,403);
r=await call('chef','chef@a.test','/api/invoices/inv-a');assert.equal(r.status,403);
r=await call('chef','chef@a.test','/api/access-control');assert.equal(r.status,403);

// Ouvrier : même cloisonnement minimal.
r=await call('ouvrier','ouvrier@a.test','/api/state');assert.equal(r.status,200);assert.deepEqual(r.body.state.jobs.map(x=>x.id),['a1']);assert.equal(r.body.state.accountingData,undefined);
r=await call('ouvrier','ouvrier@a.test','/api/projects/a1');assert.equal(r.status,200);assert.equal(r.body.project.finance,undefined);
r=await call('ouvrier','ouvrier@a.test','/api/projects/a2');assert.equal(r.status,403);
r=await call('ouvrier','ouvrier@a.test','/api/invoices/inv-a');assert.equal(r.status,403);
r=await call('ouvrier','ouvrier@a.test','/api/access-control');assert.equal(r.status,403);

// Comptable : finance autorisée, mais aucun accès projet/admin implicite.
r=await call('comptable','comptable@a.test','/api/invoices/inv-a');assert.equal(r.status,200);
r=await call('comptable','comptable@a.test','/api/projects/a2');assert.equal(r.status,403);
r=await call('comptable','comptable@a.test','/api/access-control');assert.equal(r.status,403);
r=await call('comptable','comptable@a.test','/api/state');assert.equal(r.status,403);

// Prouve que toutes les cibles B existent réellement avant les attaques.
assert.ok(JSON.parse(db.prepare("SELECT payload FROM organization_workspace_state WHERE organization_id='org-b'").get().payload).jobs.some(job=>job.id==='b1'&&job.reference==='B-SECRET'));
assert.equal(db.prepare("SELECT invoice_number FROM invoices WHERE organization_id='org-b' AND id='inv-b'").get().invoice_number,'B-SECRET-INV');
assert.equal(db.prepare("SELECT title FROM secure_documents WHERE organization_id='org-b' AND id='doc-b'").get().title,'B SECRET DOCUMENT');
assert.equal(db.prepare("SELECT status FROM organization_invitations WHERE organization_id='org-b' AND id=?").get(inviteB).status,'pending');

// Cross-tenant : chaque tentative passe par worker.fetch, exige le code exact et laisse B bit-à-bit/logiquement inchangé.
r=await crossTenantAttack(()=>call('ouvrier','ouvrier@a.test','/api/state','org-b'));assert.equal(r.status,403);assert.doesNotMatch(JSON.stringify(r.body),/B-finance|B-SECRET/);
r=await crossTenantAttack(()=>call('patron','patron@a.test','/api/projects/b1'));assert.equal(r.status,404);assert.doesNotMatch(JSON.stringify(r.body),/B-SECRET|777/);
r=await crossTenantAttack(()=>call('patron','patron@a.test','/api/invoices/inv-b'));assert.equal(r.status,404);assert.doesNotMatch(JSON.stringify(r.body),/B-SECRET-INV/);
r=await crossTenantAttack(()=>call('patron','patron@a.test','/api/documents/doc-b'));assert.equal(r.status,404);assert.doesNotMatch(JSON.stringify(r.body),/B SECRET DOCUMENT/);
r=await crossTenantAttack(()=>call('patron','patron@a.test','/api/invitations/'+inviteB,'org-a','DELETE'));assert.equal(r.status,404);assert.equal(db.prepare('SELECT status FROM organization_invitations WHERE id=?').get(inviteB).status,'pending');

// project_access forgé vers un ID B existe bien dans A, mais ne doit jamais rendre la ressource B visible.
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org-a','ouvrier','b1','patron',stamp);
assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM project_access WHERE organization_id='org-a' AND user_id='ouvrier' AND project_id='b1'").get().n),1);
r=await crossTenantAttack(()=>call('ouvrier','ouvrier@a.test','/api/projects/b1'));assert.equal(r.status,404);assert.doesNotMatch(JSON.stringify(r.body),/B-SECRET|777/);

// Contrôle inverse : les secrets B restent présents uniquement dans B, pour éviter un faux positif de fixture vide.
r=await call('owner-b','owner@b.test','/api/projects/b1','org-b');assert.equal(r.status,200);assert.equal(r.body.project.reference,'B-SECRET');

console.log('qa-cross-tenant-role-matrix-27: assertions terminées');
