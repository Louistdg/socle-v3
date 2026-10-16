import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const DB={
  prepare(sql){
    let values=[];
    return{
      _sql:sql,
      get _values(){return values},
      bind(...args){values=args;return this},
      async first(){return db.prepare(sql).get(...values)??null},
      async all(){return{results:db.prepare(sql).all(...values)}},
      async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
    };
  },
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const results=[];
      for(const statement of statements){
        const result=db.prepare(statement._sql).run(...statement._values);
        results.push({meta:{changes:Number(result.changes)}});
      }
      db.exec('COMMIT');
      return results;
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
};
const env={DB};
const stamp='2026-09-30T10:00:00.000Z';

for(const [org,name] of [['org-a','Entreprise A'],['org-b','Entreprise B']]){
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,name,name,'BE','EUR',stamp,stamp);
}
for(const [id,first,last,email] of [
  ['owner-a','Marc','Owner','owner-a@example.test'],
  ['lead-a','Lina','Lead','lead-a@example.test'],
  ['worker-a','Wim','Worker','worker-a@example.test'],
  ['accounting-a','Anna','Accounting','accounting-a@example.test'],
  ['owner-b','Bruno','Owner','owner-b@example.test']
]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,last,email,stamp,stamp);
}
for(const [id,org,code,name] of [
  ['role-owner-a','org-a','OWNER','Propriétaire'],
  ['role-lead-a','org-a','TEAM_LEAD','Chef d’équipe'],
  ['role-worker-a','org-a','WORKER','Ouvrier'],
  ['role-accounting-a','org-a','ACCOUNTING','Comptable'],
  ['role-owner-b','org-b','OWNER','Propriétaire']
]){
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,name,stamp);
}
for(const [user,org,role,person] of [
  ['owner-a','org-a','role-owner-a','person-owner-a'],
  ['lead-a','org-a','role-lead-a','person-lead-a'],
  ['worker-a','org-a','role-worker-a','person-worker-a'],
  ['accounting-a','org-a','role-accounting-a','person-accounting-a'],
  ['owner-b','org-b','role-owner-b','person-owner-b']
]){
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)')
    .run('member-'+user,org,user,role,'active',stamp,stamp,stamp,person);
}

const grants={
  'role-lead-a':['workspace.view','projects.view.assigned','planning.assignments.manage','quotes.view','tasks.view.assigned','tasks.manage.project','documents.secure.view'],
  'role-worker-a':['workspace.view','projects.view.assigned','quotes.view','tasks.view.assigned','tasks.update.assigned','documents.secure.view'],
  'role-accounting-a':['accounting.view','financial.dashboard.view','margins.view','invoices.view','expenses.view','purchase_orders.view','documents.secure.view','quotes.view','quotes.prices.view']
};
for(const [role,permissions] of Object.entries(grants))for(const permission of permissions){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(role,permission);
}
db.prepare('INSERT INTO member_access_settings(organization_id,user_id,profile_name,scope,updated_by,updated_at) VALUES(?,?,?,?,?,?)').run('org-a','accounting-a','Comptable','Toute l’entreprise','owner-a',stamp);
for(const user of ['lead-a','worker-a']){
  db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org-a',user,'p1','owner-a',stamp);
}

const stateA={
  version:3,
  company:{name:'Entreprise A',bank:'BANK-A-SECRET'},
  people:[
    {id:'person-owner-a',name:'Marc Owner'},
    {id:'person-lead-a',name:'Lina Lead'},
    {id:'person-worker-a',name:'Wim Worker'},
    {id:'person-accounting-a',name:'Anna Accounting'}
  ],
  teams:[{id:'team-a',name:'Équipe A',members:['person-lead-a','person-worker-a']}],
  jobs:[
    {id:'p1',name:'Chantier autorisé',reference:'A-001',finance:{margin:10}},
    {id:'p2',name:'Chantier non attribué',reference:'A-002',finance:{margin:20}}
  ],
  assignments:[{id:'asg-1',job:'p1',team:'team-a'},{id:'asg-2',job:'p2',team:'team-a'}],
  quotes:[],
  assets:[],
  tasks:[],
  dossiers:[],
  reminders:[],
  contacts:[],
  stockItems:[],
  deliveryNotes:[],
  purchaseOrders:[
    {id:'po-a1',number:'BC-A1',supplierId:'sup-a',job:'p1',requester:'Marc Owner',status:'commandée',lines:[{id:'pol-a1',label:'Article A',quantity:1,unit:'pcs',unitPrice:10,vatRate:21}]},
    {id:'po-a2',number:'BC-A2',supplierId:'sup-a',job:'p2',requester:'Marc Owner',status:'commandée',lines:[{id:'pol-a2',label:'Article B',quantity:1,unit:'pcs',unitPrice:20,vatRate:21}]}
  ],
  accountingData:{customerInvoices:[{id:'legacy-a',ref:'LEG-A',amount:121}]}
};
const stateB={...structuredClone(stateA),company:{name:'Entreprise B',bank:'BANK-B-SECRET'},jobs:[{id:'b1',name:'Chantier B',reference:'B-001'}],assignments:[],purchaseOrders:[],accountingData:{customerInvoices:[{id:'legacy-b',ref:'LEG-B',amount:999}]}};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-a',JSON.stringify(stateA),1,'owner-a',stamp,stamp);
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-b',JSON.stringify(stateB),1,'owner-b',stamp,stamp);

for(const [org,id,name] of [['org-a','person-a','Personne A'],['org-b','person-b','Personne B']]){
  db.prepare("INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,1,'server',?,?)")
    .run(org,id,name,'Ouvrier','Ouvrier',stamp,stamp);
  db.prepare('INSERT INTO employment_records(organization_id,id,person_id,starts_on,contract_type,weekly_hours,gross_hourly_cents,trade_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(org,'employment-'+id,id,'2026-01-01','CDI',40,2500,'Couvreur',stamp,stamp);
}

function invoice(id,org,project,total,creator){
  db.prepare("INSERT INTO invoices(id,organization_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at,legacy_project_id,legacy_paid_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,org,'FAC-'+id,'customer','unpaid','2026-09-01','2026-10-01','EUR',total,0,total,0,'',creator,stamp,stamp,project,0);
}
invoice('inv-a1','org-a','p1',10000,'owner-a');
invoice('inv-a2','org-a','p2',20000,'owner-a');
invoice('inv-b1','org-b','b1',999999,'owner-b');
db.prepare('INSERT INTO bank_accounts(id,organization_id,name,currency,current_balance_cents,provider,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('bank-a','org-a','Compte A','EUR',10000,'manual',stamp,stamp);
db.prepare('INSERT INTO bank_accounts(id,organization_id,name,currency,current_balance_cents,provider,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('bank-b','org-b','Compte B','EUR',999999,'manual',stamp,stamp);

for(const [id,org] of [['folder-a','org-a'],['folder-b','org-b']]){
  db.prepare("INSERT INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'Documents','company',NULL,'standard',?,?,?)").run(id,org,org==='org-a'?'owner-a':'owner-b',stamp,stamp);
}
function document(id,org,folder,project,owner){
  db.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,sensitivity,status,uploaded_by,created_at,updated_at,title,description,category,reference,document_type,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,?,?,'standard','available',?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,org,folder,`private/${org}/${id}`,id+'.pdf','application/pdf',4,owner,stamp,stamp,id,'','other',id,'other','manual_upload','organization',org,'manual','not_requested','');
  db.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('rel-'+id,org,id,'project',project,owner,stamp);
}
document('doc-a1','org-a','folder-a','p1','owner-a');
document('doc-a2','org-a','folder-a','p2','owner-a');
document('doc-a3','org-a','folder-a','p2','owner-a');
document('doc-b1','org-b','folder-b','b1','owner-b');
db.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
  .run('rel-doc-a2-finance','org-a','doc-a2','invoice','inv-a2','owner-a',stamp);

async function call(uid,method,path,payload,organizationId='org-a'){
  const headers={'origin':'https://socle.test'};
  if(uid)headers['oai-authenticated-user-id']=uid;
  if(organizationId)headers['x-socle-organization-id']=organizationId;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

const matrix=[];
let assertions=0;
async function probe(role,scope,method,path,expected,payload,uid,organizationId='org-a'){
  const result=await call(uid,method,path,payload,organizationId);
  matrix.push({endpoint:path,method,role,scope,expected,actual:result.status,pass:result.status===expected});
  assert.equal(result.status,expected,`${role} ${method} ${path}: attendu ${expected}, obtenu ${result.status}`);
  assertions++;
  return result;
}
function check(value,message){assert.ok(value,message);assertions++}
function equal(actual,expected,message){assert.equal(actual,expected,message);assertions++}

await probe('ANON','none','GET','/api/state',401,undefined,null);
await probe('OWNER','forged tenant','GET','/api/bootstrap',403,undefined,'owner-a','org-b');

let result=await probe('OWNER','all','GET','/api/state',200,undefined,'owner-a');
equal(result.body.state.jobs.length,2,'OWNER voit les deux chantiers de son tenant');
equal(result.body.state.company.bank,'BANK-A-SECRET','OWNER voit l’état complet de son tenant');

result=await probe('TEAM_LEAD','assigned p1','GET','/api/state',200,undefined,'lead-a');
assert.deepEqual(result.body.state.jobs.map(job=>String(job.id)),['p1']);assertions++;
equal(result.body.state.accountingData,undefined,'TEAM_LEAD ne voit pas la comptabilité legacy');

result=await probe('WORKER','assigned p1','GET','/api/state',200,undefined,'worker-a');
assert.deepEqual(result.body.state.jobs.map(job=>String(job.id)),['p1']);assertions++;
equal(result.body.state.accountingData,undefined,'WORKER ne voit pas la comptabilité legacy');

result=await probe('ACCOUNTING','finance tenant, no project scope','GET','/api/state',200,undefined,'accounting-a');
assert.deepEqual(result.body.state.jobs.map(job=>String(job.id)),[]);assertions++;
check(result.body.state.accountingData!==undefined,'ACCOUNTING voit le bloc comptable autorisé sans recevoir de chantier');
equal(Number(db.prepare("SELECT COUNT(*) c FROM project_access WHERE organization_id='org-a' AND user_id='accounting-a'").get().c),0,'ACCOUNTING ne possède aucun project_access');

await probe('WORKER','global write denied','PUT','/api/state',403,{revision:1,state:stateA},'worker-a');
await probe('TEAM_LEAD','legacy migration denied','POST','/api/legacy-upgrade',403,{domains:[]},'lead-a');
await probe('WORKER','legacy migration denied','POST','/api/legacy-upgrade',403,{domains:[]},'worker-a');
await probe('ACCOUNTING','legacy migration denied','POST','/api/legacy-upgrade',403,{domains:[]},'accounting-a');
await probe('OWNER','legacy migration allowed','POST','/api/legacy-upgrade',200,{domains:[]},'owner-a');

result=await probe('OWNER','memberships only','GET','/api/organizations',200,undefined,'owner-a');
assert.deepEqual(result.body.organizations.map(org=>org.id),['org-a']);assertions++;

await probe('OWNER','access administration','GET','/api/access-control',200,undefined,'owner-a');
await probe('TEAM_LEAD','no permissions.view','GET','/api/access-control',403,undefined,'lead-a');
await probe('WORKER','no permissions.view','GET','/api/access-control',403,undefined,'worker-a');
await probe('ACCOUNTING','no permissions.view','GET','/api/access-control',403,undefined,'accounting-a');
await probe('OWNER','cross-tenant member id','PATCH','/api/members/owner-b',404,{},'owner-a');

result=await probe('OWNER','HR full','GET','/api/hr/people',200,undefined,'owner-a');
check(result.body.people.some(person=>person.id==='person-a'),'OWNER voit les personnes RH de son tenant');
check(!result.body.people.some(person=>person.id==='person-b'),'OWNER ne voit pas les personnes RH de l’autre tenant');
await probe('TEAM_LEAD','directory via planning','GET','/api/hr/people',200,undefined,'lead-a');
await probe('WORKER','HR directory denied','GET','/api/hr/people',403,undefined,'worker-a');
await probe('ACCOUNTING','HR directory denied','GET','/api/hr/people',403,undefined,'accounting-a');
await probe('OWNER','cross-tenant HR id','GET','/api/hr/people/person-b',404,undefined,'owner-a');
await probe('OWNER','employment sensitive','GET','/api/hr/people/person-a/employment-records',200,undefined,'owner-a');
await probe('TEAM_LEAD','employment sensitive denied','GET','/api/hr/people/person-a/employment-records',403,undefined,'lead-a');
await probe('WORKER','employment sensitive denied','GET','/api/hr/people/person-a/employment-records',403,undefined,'worker-a');
await probe('ACCOUNTING','employment sensitive denied','GET','/api/hr/people/person-a/employment-records',403,undefined,'accounting-a');

result=await probe('ACCOUNTING','financial dashboard','GET','/api/accounting/summary',200,undefined,'accounting-a');
equal(result.body.bankBalance,10000,'Le solde du tenant B ne fuite pas dans le résumé financier A');
await probe('TEAM_LEAD','financial dashboard denied','GET','/api/accounting/summary',403,undefined,'lead-a');
await probe('WORKER','financial dashboard denied','GET','/api/accounting/summary',403,undefined,'worker-a');
await probe('ANON','project margin requires a session','GET','/api/projects/p1/financial-forecast',401);
await probe('OWNER','project margin','GET','/api/projects/p1/financial-forecast',200,undefined,'owner-a');
await probe('ACCOUNTING','explicit tenant margin permission without project_access','GET','/api/projects/p1/financial-forecast',200,undefined,'accounting-a');
await probe('TEAM_LEAD','assigned project but no margin permission','GET','/api/projects/p1/financial-forecast',403,undefined,'lead-a');
await probe('WORKER','assigned project but no financial permission','GET','/api/projects/p1/financial-forecast',403,undefined,'worker-a');
await probe('ACCOUNTING','accounting cost control','GET','/api/projects/p1/cost-control',200,undefined,'accounting-a');
await probe('TEAM_LEAD','cost control denied','GET','/api/projects/p1/cost-control',403,undefined,'lead-a');

result=await probe('OWNER','all tenant invoices','GET','/api/invoices',200,undefined,'owner-a');
equal(result.body.invoices.length,2,'OWNER voit uniquement les factures de son tenant');
result=await probe('ACCOUNTING','tenant finance invoices without project scope','GET','/api/invoices',200,undefined,'accounting-a');
assert.deepEqual(result.body.invoices.map(invoice=>invoice.id).sort(),['inv-a1','inv-a2']);assertions++;
await probe('ACCOUNTING','tenant invoice detail without project scope','GET','/api/invoices/inv-a2',200,undefined,'accounting-a');
await probe('WORKER','invoice permission denied','GET','/api/invoices',403,undefined,'worker-a');
await probe('ACCOUNTING','cross-tenant invoice id','GET','/api/invoices/inv-b1',404,undefined,'accounting-a');

result=await probe('OWNER','all purchase orders','GET','/api/purchase-orders',200,undefined,'owner-a');
equal(result.body.orders.length,2,'OWNER voit les deux commandes de son tenant');
result=await probe('ACCOUNTING','tenant purchase orders without project scope','GET','/api/purchase-orders',200,undefined,'accounting-a');
assert.deepEqual(result.body.orders.map(order=>order.id).sort(),['po-a1','po-a2']);assertions++;
await probe('WORKER','purchase order permission denied','GET','/api/purchase-orders',403,undefined,'worker-a');

await probe('OWNER','stock read','GET','/api/stock-locations',200,undefined,'owner-a');
await probe('TEAM_LEAD','stock denied','GET','/api/stock-locations',403,undefined,'lead-a');
await probe('WORKER','stock denied','GET','/api/stock-locations',403,undefined,'worker-a');
await probe('ACCOUNTING','stock denied','GET','/api/stock-locations',403,undefined,'accounting-a');

await probe('WORKER','assigned document','GET','/api/documents/doc-a1',200,undefined,'worker-a');
await probe('WORKER','same-tenant finance-linked unassigned document','GET','/api/documents/doc-a2',404,undefined,'worker-a');
await probe('WORKER','cross-tenant document id','GET','/api/documents/doc-b1',404,undefined,'worker-a');
await probe('ACCOUNTING','finance-linked document without project scope','GET','/api/documents/doc-a2',200,undefined,'accounting-a');
await probe('ACCOUNTING','pure project document remains hidden','GET','/api/documents/doc-a3',404,undefined,'accounting-a');
await probe('ACCOUNTING','project page remains denied','GET','/api/projects/p1/field-portal',403,undefined,'accounting-a');
await probe('TEAM_LEAD','same-tenant unassigned project','GET','/api/projects/p2/field-portal',403,undefined,'lead-a');
await probe('WORKER','same-tenant unassigned project','GET','/api/projects/p2/field-portal',403,undefined,'worker-a');
await probe('WORKER','cross-tenant project header','GET','/api/projects/b1/field-portal',403,undefined,'worker-a','org-b');

equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'Aucune FK cassée par le scénario sécurité');
const failed=matrix.filter(row=>!row.pass);
assert.equal(failed.length,0,'Toute la matrice sécurité doit correspondre aux statuts attendus');assertions++;

console.log('security-multitenant-rbac-72: '+assertions+' assertions passed');
console.log('SECURITY_RBAC_MATRIX_72='+JSON.stringify(matrix));
