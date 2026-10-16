import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const s of statements){const r=db.prepare(s._sql).run(...s._values);out.push({meta:{changes:Number(r.changes)}})}db.exec('COMMIT');return out}catch(e){db.exec('ROLLBACK');throw e}}
}};
const stamp='2026-10-01T18:00:00.000Z';
for(const [id,name] of [['org-a','BatiNova A'],['org-b','BatiNova B']])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
for(const [uid,org,code] of [['owner-a','org-a','OWNER'],['accountant-a','org-a','ACCOUNTING'],['owner-b','org-b','OWNER']]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(uid,uid,'Test',stamp,stamp);
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,org,code,code,stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+uid,org,uid,'role-'+uid,'active',stamp,stamp,stamp);
}
for(const p of ['customers.view','customers.create','customers.edit','expenses.view','expenses.create','suppliers.edit','bank.view','bank.manage','bank.reconcile','financial.dashboard.view','quotes.view','quotes.prices.view','quotes.create','quotes.edit','quote_amendments.view','quote_amendments.create','invoices.view','invoices.create']){
  db.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-accountant-a',p);
}
function request(uid,method,path,payload,org='org-a'){
  const headers={'origin':'https://socle.test','x-socle-organization-id':org};
  if(uid)headers['oai-authenticated-user-id']=uid;
  if(payload!==undefined)headers['content-type']='application/json';
  return worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env).then(async response=>({status:response.status,body:await response.json()}));
}
let n=0;const eq=(a,b,m)=>{assert.equal(a,b,m);n++};const ok=(v,m)=>{assert.ok(v,m);n++};

let r=await request('owner-a','POST','/api/customers',{type:'company',companyName:'Client Alpha',vatNumber:'BE0123456789',email:'alpha@example.test',city:'Namur',paymentTermsDays:30});eq(r.status,201,'client créé serveur');const customerId=r.body.customer.id;
r=await request('owner-a','GET','/api/customers');eq(r.status,200);ok(r.body.customers.some(x=>x.id===customerId),'client listé serveur');
r=await request('accountant-a','PUT','/api/customers/'+customerId,{type:'company',companyName:'Client Alpha SA',vatNumber:'BE0123456789',email:'finance@example.test',city:'Namur',paymentTermsDays:45});eq(r.status,200);eq(r.body.customer.companyName,'Client Alpha SA');
r=await request('owner-a','POST','/api/suppliers',{name:'Fournisseur Alpha',vatNumber:'BE0999999999',email:'supplier@example.test',defaultPaymentTermsDays:30});eq(r.status,201,'fournisseur créé serveur');const supplierId=r.body.supplier.id;
r=await request('accountant-a','GET','/api/suppliers');eq(r.status,200);ok(r.body.suppliers.some(x=>x.id===supplierId),'fournisseur listé serveur');
r=await request('accountant-a','PUT','/api/suppliers/'+supplierId,{name:'Fournisseur Alpha SA',vatNumber:'BE0999999999',email:'supplier2@example.test'});eq(r.status,200);eq(r.body.supplier.name,'Fournisseur Alpha SA');

db.prepare("INSERT INTO projects(id,organization_id,customer_id,name,reference,status,country,quoted_amount_cents,created_at,updated_at) VALUES(?,?,?,?,?,'draft','BE',0,?,?)").run('proj-a','org-a',customerId,'Projet Alpha','PA-001',stamp,stamp);
r=await request('owner-a','POST','/api/quotes',{projectId:'proj-a',customerId,title:'Toiture Alpha',client:'Client Alpha SA',date:'2026-10-01',validUntil:'2026-11-01',lines:[{label:'Toiture',qty:100,unit:'m²',price:100,vat:21}]});eq(r.status,201,'devis serveur avec client');const quoteId=r.body.quote.id;eq(r.body.quote.customerId,customerId);
r=await request('owner-a','PUT','/api/quotes/'+quoteId,{projectId:'proj-a',customerId,title:'Toiture Alpha',client:'Client Alpha SA',date:'2026-10-01',validUntil:'2026-11-01',status:'accepted',lines:[{label:'Toiture',qty:100,unit:'m²',price:100,vat:21}]});eq(r.status,200,'acceptation devis serveur');eq(db.prepare("SELECT quoted_amount_cents FROM projects WHERE id='proj-a'").get().quoted_amount_cents,1210000,'devis accepté synchronise le montant chantier');

r=await request('owner-a','POST','/api/quotes/'+quoteId+'/amendments',{reference:'AV-001',title:'Isolation supplémentaire',reason:'Demande client',amountCents:200000,vatAmountCents:42000,status:'accepted',effectiveDate:'2026-10-01',notes:'Avenant accepté'});eq(r.status,201,'avenant créé');eq(db.prepare("SELECT quoted_amount_cents FROM projects WHERE id='proj-a'").get().quoted_amount_cents,1452000,'avenant accepté met à jour le montant chantier');
r=await request('owner-a','GET','/api/quotes/'+quoteId+'/amendments');eq(r.status,200);eq(r.body.amendments.length,1,'avenant listé');

r=await request('owner-a','POST','/api/bank/accounts',{name:'Compte principal',iban:'BE00000000000000',currency:'EUR',openingBalanceCents:500000});eq(r.status,201,'compte bancaire créé');const accountId=r.body.account.id;eq(r.body.account.currentBalanceCents,500000);
r=await request('accountant-a','POST','/api/bank/transactions',{bankAccountId:accountId,transactionDate:'2026-10-01',amountCents:121000,currency:'EUR',description:'Paiement Client Alpha',reference:'VIR-ALPHA',counterpartyName:'Client Alpha SA',operationKey:'bank-tx-alpha-0001'});eq(r.status,201,'transaction bancaire créée');const txId=r.body.transaction.id;eq(db.prepare("SELECT current_balance_cents FROM bank_accounts WHERE id=?").get(accountId).current_balance_cents,621000,'solde bancaire mis à jour');
r=await request('accountant-a','POST','/api/bank/transactions/'+txId+'/reconcile',{matchType:'invoice',matchId:'missing'});eq(r.status,404,'rapprochement cible inexistante refusé');
db.prepare("INSERT INTO invoices(id,organization_id,customer_id,project_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at) VALUES('inv-alpha','org-a',?,'proj-a','FAC-ALPHA','customer','unpaid','2026-10-01','2026-11-01','EUR',100000,21000,121000,0,'','owner-a',?,?)").run(customerId,stamp,stamp);
r=await request('accountant-a','POST','/api/bank/transactions/'+txId+'/reconcile',{matchType:'invoice',matchId:'inv-alpha'});eq(r.status,200,'rapprochement facture');eq(r.body.transaction.status,'reconciled');
r=await request('accountant-a','POST','/api/bank/transactions/'+txId+'/unreconcile',{});eq(r.status,200,'dérapprochement');eq(r.body.transaction.status,'unreconciled');
r=await request('accountant-a','POST','/api/bank/transactions',{bankAccountId:accountId,transactionDate:'2026-10-01',amountCents:50000,currency:'EUR',description:'Replay',reference:'R',counterpartyName:'X',operationKey:'bank-tx-alpha-0001'});eq(r.status,409,'idempotence bancaire protège une clé réutilisée avec autres données');

for(let i=0;i<30;i++){
  db.prepare('INSERT INTO customers(id,organization_id,type,company_name,country,notes,payment_terms_days,created_at,updated_at) VALUES(?,?,\'company\',?,\'BE\',\'\',30,?,?)').run('bulk-c-'+i,'org-a','Bulk Client '+String(i).padStart(2,'0'),stamp,stamp);
  db.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,\'BE\',30,?,?)').run('bulk-s-'+i,'org-a','Bulk Supplier '+String(i).padStart(2,'0'),stamp,stamp);
}
r=await request('owner-a','GET','/api/customers?limit=250');eq(r.status,200);ok(r.body.customers.length>=31,'volumétrie clients 31+');
r=await request('accountant-a','GET','/api/suppliers?limit=250');eq(r.status,200);ok(r.body.suppliers.length>=31,'volumétrie fournisseurs 31+');
for(let i=0;i<30;i++){
  await request('accountant-a','POST','/api/bank/transactions',{bankAccountId:accountId,transactionDate:'2026-10-01',amountCents:100+i,currency:'EUR',description:'Bulk '+i,reference:'B-'+i,counterpartyName:'Bulk',operationKey:'bulk-bank-'+String(i).padStart(2,'0')});
}
r=await request('accountant-a','GET','/api/bank/transactions?limit=250');eq(r.status,200);ok(r.body.transactions.length>=31,'volumétrie transactions 31+');

r=await request('accountant-a','GET','/api/accounting/summary');eq(r.status,200);ok(Number.isInteger(r.body.bankTransactions),'summary comptable expose les transactions bancaires');ok('bankUnreconciled' in r.body,'summary comptable expose le rapprochement');

r=await request('owner-b','GET','/api/customers',undefined,'org-b');eq(r.status,200);ok(!r.body.customers.some(x=>x.id===customerId),'cloisonnement client inter-tenant');
r=await request('owner-b','GET','/api/bank/accounts',undefined,'org-b');eq(r.status,200);ok(!r.body.accounts.some(x=>x.id===accountId),'cloisonnement bancaire inter-tenant');

console.log('ia-c-commercial-finance-02: '+n+' assertions passed');
