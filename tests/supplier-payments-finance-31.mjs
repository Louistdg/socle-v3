import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

let assertions=0;
const eq=(a,b,m)=>{assert.equal(a,b,m);assertions++};
const ok=(a,m)=>{assert.ok(a,m);assertions++};
const throws=(fn,matcher,m)=>{assert.throws(fn,matcher,m);assertions++};

const stamp='2026-09-29T12:00:00.000Z';
for(const [org,name] of [['org','BatiNova'],['org2','Autre Société']]){
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,name,name,'BE','EUR',stamp,stamp);
}
for(const [user,org] of [['owner','org'],['other','org2']]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(user,user,'Test',stamp,stamp);
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+user,org,'OWNER','Owner',stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,org,user,'role-'+user,'active',stamp,stamp,stamp);
}
db.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('supA','org','Fournisseur A','BE',30,stamp,stamp);
db.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('supB','org2','Fournisseur B','BE',30,stamp,stamp);

const state={version:3,company:{name:'BatiNova'},people:[],teams:[],jobs:[{id:1,name:'Résidence Meuse',reference:'BAT-001'}],assignments:[],quotes:[{id:'q1',job:1,ref:'DEV-1',status:'Accepté',lines:[{label:'Lot',qty:1,price:1000}]}],assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org2',JSON.stringify({...state,company:{name:'Autre Société'},jobs:[{id:9,name:'Autre chantier'}],quotes:[]}),1,'other',stamp,stamp);

db.prepare('INSERT INTO expenses(id,organization_id,supplier_id,legacy_project_id,category,description,expense_date,due_date,currency,subtotal_cents,vat_amount_cents,vat_rate_bps,total_cents,payment_status,created_by,created_at,updated_at,supplier_reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('exp-main','org','supA','1','materials','Facture chantier','2026-09-01','2026-09-15','EUR',10000,2100,2100,12100,'unpaid','owner',stamp,stamp,'FF-001','seed-exp-main');
db.prepare('INSERT INTO supplier_allocations(id,organization_id,expense_id,destination_type,destination_id,amount_cents,label,note,reference,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('alloc-main','org','exp-main','project','1',10000,'Matériaux','','FF-001','alloc-main-key','active','owner',stamp);
db.prepare('INSERT INTO expenses(id,organization_id,supplier_id,category,description,expense_date,currency,subtotal_cents,vat_amount_cents,total_cents,payment_status,created_by,created_at,updated_at,supplier_reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('exp-other','org2','supB','materials','Facture autre société','2026-09-01','EUR',10000,2100,12100,'unpaid','other',stamp,stamp,'OTHER-001','seed-exp-other');

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
async function req(uid,method,path,payload,org='org'){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':org,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let r=await req('owner','GET','/api/projects/1/financial-forecast');
eq(r.status,200,'forecast accessible au patron');
const costBefore=r.body.realized.costHtCents;
eq(r.body.realized.supplierInvoicedHtCents,10000,'facture fournisseur rattachée au chantier');
eq(r.body.realized.supplierPaidHtEquivalentCents,0,'aucun paiement fournisseur au départ');
eq(r.body.realized.supplierOutstandingHtEquivalentCents,10000,'facture fournisseur entièrement ouverte');

r=await req('owner','POST','/api/expenses/exp-main/payments',{amountCents:6000,paymentDate:'2026-09-20',paymentMethod:'bank_transfer',reference:'VIR-1',note:'Acompte',operationKey:'supplier-payment-partial-001'});
eq(r.status,201,'paiement fournisseur partiel créé');
eq(r.body.summary.baseStatus,'partial');
eq(r.body.summary.paidCents,6000);
eq(r.body.summary.outstandingCents,6100);
eq(r.body.summary.overdue,true,'facture partiellement payée et échue');

r=await req('owner','GET','/api/accounting/summary');
eq(r.status,200);
eq(r.body.toPay,6100,'toPay utilise le solde restant et non le TTC complet');
eq(r.body.supplierOverdue,6100,'dette fournisseur échue calculée sur le solde');
eq(r.body.supplierOverdueCount,1);

r=await req('owner','GET','/api/projects/1/financial-forecast');
eq(r.status,200);
eq(r.body.realized.costHtCents,costBefore,'un paiement ne modifie pas le coût réel');
ok(r.body.realized.supplierPaidHtEquivalentCents>0,'paiement partiel reflété dans le réalisé fournisseur');
ok(r.body.realized.supplierOutstandingHtEquivalentCents<10000,'reste fournisseur réduit après paiement');

r=await req('owner','POST','/api/expenses/exp-main/payments',{amountCents:6101,paymentDate:'2026-09-21',paymentMethod:'bank_transfer',reference:'VIR-TROP',note:'Trop',operationKey:'supplier-payment-overpay-001'});
eq(r.status,409,'surpaiement fournisseur refusé');

r=await req('owner','POST','/api/expenses/exp-main/payments',{amountCents:6100,paymentDate:'2026-09-21',paymentMethod:'bank_transfer',reference:'VIR-2',note:'Solde',operationKey:'supplier-payment-final-001'});
eq(r.status,201,'paiement fournisseur final créé');
const finalPaymentId=r.body.payment.id;
eq(r.body.summary.baseStatus,'paid');
eq(r.body.summary.outstandingCents,0);

r=await req('owner','GET','/api/accounting/summary');
eq(r.body.toPay,0,'plus aucune dette fournisseur après paiement complet');
eq(r.body.supplierOverdue,0);

const voids=await Promise.all([
  req('owner','POST','/api/expenses/exp-main/payments/'+encodeURIComponent(finalPaymentId)+'/void',{reason:'Erreur bancaire'}),
  req('owner','POST','/api/expenses/exp-main/payments/'+encodeURIComponent(finalPaymentId)+'/void',{reason:'Erreur bancaire'})
]);
eq(voids.filter(x=>x.status===200).length,2,'annulation concurrente/rejouée reste idempotente');
eq(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action='supplier_payment.voided' AND entity_id=?").get(finalPaymentId).c,1,'un seul audit pour une annulation effective');

r=await req('owner','GET','/api/accounting/summary');
eq(r.body.toPay,6100,'annulation du paiement remet le solde à payer');

r=await req('other','GET','/api/expenses/exp-main/payments',undefined,'org2');
eq(r.status,404,'une autre entreprise ne lit pas les paiements');
r=await req('other','POST','/api/expenses/exp-main/payments',{amountCents:100,paymentDate:'2026-09-21',paymentMethod:'bank_transfer',reference:'X',note:'X',operationKey:'cross-tenant-payment-001'},'org2');
eq(r.status,404,'une autre entreprise ne paie pas une facture étrangère');

throws(()=>db.prepare("INSERT INTO supplier_payments(id,organization_id,expense_id,amount_cents,payment_date,payment_method,reference,note,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,'active',?,?)").run('cross-sql','org2','exp-main',100,'2026-09-21','bank','','','cross-sql-key','other',stamp),/supplier_payment_expense_invalid/,'trigger SQL bloque le cross-tenant');

r=await req('owner','POST','/api/expenses',{supplierId:'supA',supplierReference:'VAT-6',projectId:'1',category:'materials',description:'Matériel TVA 6',expenseDate:'2026-09-22',dueDate:'2026-10-22',total:106,vatAmount:6,vatRate:6,paymentStatus:'unpaid',operationKey:'expense-vat6-0001'});
eq(r.status,201,'facture fournisseur TVA 6 créée sans commande préalable');
r=await req('owner','POST','/api/expenses',{supplierId:'supA',supplierReference:'VAT-21',projectId:'1',category:'materials',description:'Matériel TVA 21',expenseDate:'2026-09-22',dueDate:'2026-10-22',total:121,vatAmount:21,vatRate:21,paymentStatus:'unpaid',operationKey:'expense-vat21-0001'});
eq(r.status,201,'facture fournisseur TVA 21 créée');
r=await req('owner','GET','/api/expenses');
const vat6=r.body.expenses.find(x=>x.supplier_reference==='VAT-6'),vat21=r.body.expenses.find(x=>x.supplier_reference==='VAT-21');
eq(vat6.subtotal_cents,10000);eq(vat6.vat_amount_cents,600);eq(vat6.total_cents,10600);eq(vat6.vatRate,6);
eq(vat21.subtotal_cents,10000);eq(vat21.vat_amount_cents,2100);eq(vat21.total_cents,12100);eq(vat21.vatRate,21);

r=await req('owner','POST','/api/expenses',{supplierId:'supA',supplierReference:'VAT-6',projectId:'1',category:'materials',description:'Doublon',expenseDate:'2026-09-23',dueDate:'2026-10-23',total:106,vatAmount:6,vatRate:6,paymentStatus:'unpaid',operationKey:'expense-vat6-duplicate'});
eq(r.status,409,'doublon de référence fournisseur refusé');

assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
assertions++;
console.log(`supplier-payments-finance-31: ${assertions} assertions réussies`);
