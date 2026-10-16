import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const migrationName='0026_supplier_invoice_matches.sql';
const migrationIndex=migrations.indexOf(migrationName);
assert.ok(migrationIndex>=0,'0026 supplier invoice matching présente');

function apply(db,names){
  db.exec('PRAGMA foreign_keys=ON');
  for(const name of names)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}

let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};

// Fresh database accepts the complete chain.
const freshCheck=new DatabaseSync(':memory:');
apply(freshCheck,migrations);
eq(freshCheck.prepare('PRAGMA foreign_key_check').all().length,0,'base neuve: aucune violation FK');
eq(freshCheck.prepare('PRAGMA integrity_check').get().integrity_check,'ok','base neuve: intégrité SQLite');
ok(freshCheck.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='supplier_invoice_matches'").get()?.ok,'base neuve: table matching créée');
ok(freshCheck.prepare("SELECT 1 ok FROM permissions WHERE code='supplier_invoice_matches.manage'").get()?.ok,'permission matching créée');
freshCheck.close();

// Existing database through 0025 accepts 0026 without silently granting a role.
const upgradeCheck=new DatabaseSync(':memory:');
apply(upgradeCheck,migrations.slice(0,migrationIndex));
const stamp='2026-09-29T02:00:00.000Z';
upgradeCheck.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('upgrade-org','Upgrade','Upgrade','BE','EUR',stamp,stamp);
upgradeCheck.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('upgrade-user','Upgrade','User',stamp,stamp);
upgradeCheck.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('upgrade-role','upgrade-org','ACCOUNTING','Accounting',stamp);
upgradeCheck.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('upgrade-member','upgrade-org','upgrade-user','upgrade-role','active',stamp,stamp,stamp);
upgradeCheck.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('upgrade-role','accounting.view');
upgradeCheck.exec(readFileSync(new URL('../drizzle/'+migrationName,import.meta.url),'utf8'));
eq(upgradeCheck.prepare('PRAGMA foreign_key_check').all().length,0,'base existante: aucune violation FK après 0026');
eq(upgradeCheck.prepare("SELECT COUNT(*) count FROM role_permissions WHERE role_id='upgrade-role' AND permission_code='supplier_invoice_matches.manage'").get().count,0,'0026 ne crée aucun role_permissions automatique');
upgradeCheck.close();

const database=new DatabaseSync(':memory:');
apply(database,migrations);
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){
    database.exec('BEGIN IMMEDIATE');
    try{
      const out=[];
      for(const statement of statements){const result=database.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}
      database.exec('COMMIT');return out;
    }catch(error){database.exec('ROLLBACK');throw error}
  }
}};

const state={version:3,company:{name:'BatiNova'},people:[],teams:[],jobs:[{id:1,name:'Chantier A',reference:'CH-A'},{id:2,name:'Chantier B',reference:'CH-B'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[{id:'po-1',number:'BC-1',job:1,status:'commandée',lines:[{id:'line-1',reference:'MAT-1',label:'Matériau accepté',quantity:12.345,unit:'u',unitPrice:10,vatRate:21},{id:'line-2',reference:'MAT-2',label:'Matériau refusé',quantity:2,unit:'u',unitPrice:10,vatRate:21}]}]};
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [uid,code] of [['owner','OWNER'],['matcher','MATCHER'],['noperm','NO_PERMISSION'],['outsider','OUTSIDER']]){
  database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(uid,uid,'Test',stamp,stamp);
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,'org',code,code,stamp);
  database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+uid,'org',uid,'role-'+uid,'active',stamp,stamp,stamp);
}
for(const uid of ['matcher','outsider'])for(const permission of ['supplier_invoice_matches.manage','projects.view.assigned'])database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+uid,permission);
database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-noperm','projects.view.assigned');
for(const [uid,projectId] of [['matcher','1'],['noperm','1'],['outsider','2']])database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org',uid,projectId,'owner',stamp);
database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);

database.prepare("INSERT INTO field_delivery_notes(id,organization_id,order_id,supplier_id,project_id,number,delivery_date,receiver_name,comment,file_name,status,created_by,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('delivery-1','org','po-1',null,'1','BL-1','2026-09-29','Owner','',null,'Avec réserve','owner',stamp,'delivery-op-0001');
database.prepare("INSERT INTO field_delivery_lines(id,organization_id,delivery_note_id,order_line_id,reference,label,ordered,received,condition,difference,stock_item_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('delivery-line-1','org','delivery-1','line-1','MAT-1','Matériau accepté',12.345,12.345,'Conforme',0,null);
database.prepare("INSERT INTO field_delivery_lines(id,organization_id,delivery_note_id,order_line_id,reference,label,ordered,received,condition,difference,stock_item_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run('delivery-line-refused','org','delivery-1','line-2','MAT-2','Matériau refusé',2,2,'Refusé',0,null);
database.prepare("INSERT INTO expenses(id,organization_id,category,description,expense_date,currency,subtotal_cents,vat_amount_cents,total_cents,payment_status,created_by,created_at,updated_at,supplier_reference,idempotency_key,purchase_order_id,delivery_note_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('exp-1','org','materials','Facture fournisseur','2026-09-29','EUR',20000,4200,24200,'unpaid','owner',stamp,stamp,'FF-1','expense-op-0001','po-1','delivery-1');
database.prepare("INSERT INTO supplier_allocations(id,organization_id,expense_id,destination_type,destination_id,amount_cents,label,note,reference,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run('alloc-1','org','exp-1','project','1',10000,'Matériaux','','BC-1','allocation-op-0001','active','owner',stamp);

async function request(uid,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
const baseMatch={allocationId:'alloc-1',projectId:'1',orderId:'po-1',orderLineId:'line-1',deliveryNoteId:'delivery-1',deliveryLineId:'delivery-line-1',matchedCents:6000,matchedQuantityMilli:6000,operationKey:'match-op-0001'};

let r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',{...baseMatch,matchedCents:10001,operationKey:'match-too-much-money'});
eq(r.status,409,'dépassement matched_cents refusé');
r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',{...baseMatch,matchedCents:1000,matchedQuantityMilli:12346,operationKey:'match-too-much-quantity'});
eq(r.status,409,'quantité supérieure au reçu accepté refusée');
r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',{...baseMatch,orderLineId:'line-2',deliveryLineId:'delivery-line-refused',matchedCents:1000,matchedQuantityMilli:1,operationKey:'match-refused-line'});
eq(r.status,409,'ligne Refusé refusée');

r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',baseMatch);
eq(r.status,201,'match actif créé');
const firstMatchId=r.body.match.id;
eq(r.body.status,'active');
eq(database.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action='supplier_invoice_match.created' AND entity_id=?").get(firstMatchId).count,1,'création auditée une fois');

r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',baseMatch);
eq(r.status,200,'même operationKey et mêmes données rejouées');
eq(r.body.replayed,true);
eq(r.body.match.id,firstMatchId);
eq(database.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action='supplier_invoice_match.created' AND entity_id=?").get(firstMatchId).count,1,'replay sans second audit');

r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',{...baseMatch,matchedCents:5999});
eq(r.status,409,'même operationKey avec données différentes refusée');

r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches/'+encodeURIComponent(firstMatchId)+'/void');
eq(r.status,200,'void match actif');
eq(r.body.status,'voided');
eq(database.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action='supplier_invoice_match.voided' AND entity_id=?").get(firstMatchId).count,1,'void audité une fois');

r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches/'+encodeURIComponent(firstMatchId)+'/void');
eq(r.status,200,'deuxième void rejoué');
eq(r.body.replayed,true);
eq(database.prepare("SELECT COUNT(*) count FROM audit_logs WHERE action='supplier_invoice_match.voided' AND entity_id=?").get(firstMatchId).count,1,'deuxième void sans second audit');

r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',baseMatch);
eq(r.status,200,'replay de la clé d’un match voided');
eq(r.body.replayed,true);
eq(r.body.status,'voided','replay expose status voided');

const secondMatch={...baseMatch,operationKey:'match-op-0002'};
r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches',secondMatch);
eq(r.status,201,'nouveau match avec nouvelle clé après void');
const secondMatchId=r.body.match.id;
ok(secondMatchId!==firstMatchId,'nouvelle clé crée un nouvel ID');

r=await request('noperm','POST','/api/supplier-invoices/exp-1/matches',{...baseMatch,operationKey:'match-no-permission'});
eq(r.status,403,'utilisateur sans permission refusé');
r=await request('outsider','POST','/api/supplier-invoices/exp-1/matches',{...baseMatch,operationKey:'match-out-of-scope'});
eq(r.status,403,'utilisateur hors périmètre chantier refusé');

r=await request('owner','POST','/api/expenses/exp-1/allocations/alloc-1/cancel',{reason:'Tentative avec match actif'});
eq(r.status,409,'annulation allocation avec match actif refusée');
eq(database.prepare("SELECT status FROM supplier_allocations WHERE id='alloc-1'").get().status,'active');

r=await request('matcher','POST','/api/supplier-invoices/exp-1/matches/'+encodeURIComponent(secondMatchId)+'/void');
eq(r.status,200,'second match voided avant annulation allocation');
r=await request('owner','POST','/api/expenses/exp-1/allocations/alloc-1/cancel',{reason:'Tous les rapprochements sont annulés'});
eq(r.status,200,'void match puis annulation allocation autorisée');
eq(r.body.allocation.status,'cancelled');

// Concurrency guard: two different operations cannot both consume the same
// remaining amount/quantity.
database.prepare("INSERT INTO supplier_allocations(id,organization_id,expense_id,destination_type,destination_id,amount_cents,label,note,reference,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)").run('alloc-2','org','exp-1','project','1',10000,'Concurrence','','BC-1','allocation-op-0002','active','owner',stamp);
const concurrentBase={allocationId:'alloc-2',projectId:'1',orderId:'po-1',orderLineId:'line-1',deliveryNoteId:'delivery-1',deliveryLineId:'delivery-line-1',matchedCents:6000,matchedQuantityMilli:7000};
const concurrent=await Promise.all([
  request('matcher','POST','/api/supplier-invoices/exp-1/matches',{...concurrentBase,operationKey:'match-concurrent-a'}),
  request('matcher','POST','/api/supplier-invoices/exp-1/matches',{...concurrentBase,operationKey:'match-concurrent-b'})
]);
eq(concurrent.filter(item=>item.status===201).length,1,'un seul POST concurrent est accepté');
eq(concurrent.filter(item=>item.status===409).length,1,'le second POST concurrent dépasse le plafond et est refusé');
eq(database.prepare("SELECT COALESCE(SUM(matched_cents),0) total FROM supplier_invoice_matches WHERE allocation_id='alloc-2' AND status='active'").get().total,6000,'plafond financier conservé sous concurrence');
eq(database.prepare("SELECT COALESCE(SUM(matched_quantity_milli),0) total FROM supplier_invoice_matches WHERE allocation_id='alloc-2' AND status='active'").get().total,7000,'plafond quantité conservé sous concurrence');

console.log(`supplier-invoice-matches-26: ${assertions} assertions réussies`);
