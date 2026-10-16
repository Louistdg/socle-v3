import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const required of ['0028_project_financial_baseline.sql','0031_supplier_payments.sql'])assert.ok(migrations.includes(required),required+' présente');

const migration31Index=migrations.indexOf('0031_supplier_payments.sql');
assert.ok(migration31Index>0,'0031 placée après les migrations existantes');
const upgradeDb=new DatabaseSync(':memory:');
upgradeDb.exec('PRAGMA foreign_keys=ON');
for(const name of migrations.slice(0,migration31Index))upgradeDb.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const upgradeStamp='2026-09-01T08:00:00.000Z';
upgradeDb.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('upgrade-org','UpgradeCo','UpgradeCo','BE','EUR',upgradeStamp,upgradeStamp);
upgradeDb.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('upgrade-owner','Upgrade','Owner',upgradeStamp,upgradeStamp);
upgradeDb.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('upgrade-role','upgrade-org','OWNER','Owner',upgradeStamp);
upgradeDb.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('upgrade-member','upgrade-org','upgrade-owner','upgrade-role','active',upgradeStamp,upgradeStamp,upgradeStamp);
upgradeDb.prepare("INSERT INTO expenses(id,organization_id,category,description,expense_date,currency,subtotal_cents,vat_amount_cents,total_cents,payment_status,payment_date,created_by,created_at,updated_at,supplier_reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('legacy-paid','upgrade-org','materials','Ancienne facture payée','2026-08-01','EUR',10000,2100,12100,'paid','2026-08-20','upgrade-owner',upgradeStamp,upgradeStamp,'OLD-PAID','upgrade-expense-old');
upgradeDb.exec(readFileSync(new URL('../drizzle/0031_supplier_payments.sql',import.meta.url),'utf8'));
assert.equal(upgradeDb.prepare("SELECT due_date FROM expenses WHERE id='legacy-paid'").get().due_date,null,'upgrade ajoute échéance nullable');
assert.equal(upgradeDb.prepare("SELECT amount_cents FROM supplier_payments WHERE expense_id='legacy-paid' AND status='active'").get().amount_cents,12100,'ancienne facture payée convertie en paiement structuré');
assert.equal(upgradeDb.prepare('PRAGMA foreign_key_check').all().length,0,'upgrade 0031 sans violation FK');
upgradeDb.close();

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const deep=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};

const stamp='2026-09-29T09:00:00.000Z';
for(const org of ['org-a','org-b'])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,org==='org-a'?'BatiNova':'AutreCo',org,'BE','EUR',stamp,stamp);
for(const [uid,org] of [['owner-a','org-a'],['owner-b','org-b']]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(uid,uid,'Test',stamp,stamp);
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,org,'OWNER','Owner',stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+uid,org,uid,'role-'+uid,'active',stamp,stamp,stamp);
}
db.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('supplier-a','org-a','Fournisseur A','BE',30,stamp,stamp);
db.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('supplier-b','org-b','Fournisseur B','BE',30,stamp,stamp);

const stateA={
  version:3,company:{name:'BatiNova'},people:[],teams:[],
  jobs:[{id:1,name:'Chantier A',reference:'BAT-A',progress:25,finance:{plannedHours:0,hourlyCost:50,materialsBudget:5000,subcontractingBudget:1000,otherBudget:1000}},{id:2,name:'Chantier B',reference:'BAT-B',progress:10,finance:{plannedHours:0,hourlyCost:50,materialsBudget:2000,subcontractingBudget:500,otherBudget:500}}],
  assignments:[],
  quotes:[{id:'quote-a',job:1,status:'Accepté',lines:[{label:'Marché',qty:1,price:10000}]},{id:'quote-b',job:2,status:'Accepté',lines:[{label:'Marché',qty:1,price:5000}]}],
  contacts:[{id:'ws-supplier-a',name:'Fournisseur A',company:'Fournisseur A',roles:['Fournisseur']}],
  assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[]
};
const stateB={version:3,company:{name:'AutreCo'},people:[],teams:[],jobs:[{id:2,name:'Chantier B',reference:'B-1'}],assignments:[],quotes:[],contacts:[{id:'ws-supplier-b',name:'Fournisseur B',roles:['Fournisseur']}],assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[]};
for(const [org,state,uid] of [['org-a',stateA,'owner-a'],['org-b',stateB,'owner-b']])db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,uid,stamp,stamp);

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
async function call(uid,org,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':org,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
const A=(method,path,payload)=>call('owner-a','org-a',method,path,payload);
const B=(method,path,payload)=>call('owner-b','org-b',method,path,payload);

let r=await A('PUT','/api/projects/1/financial-baseline',{plannedMinutes:0,hourlyCostCents:5000,progressBasisPoints:2500,budgets:{LABOUR:0,MATERIALS:500000,SUBCONTRACTING:100000,EQUIPMENT:100000,OTHER:100000}});
eq(r.status,200,'baseline finance créée');
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.status,200,'forecast initial');
eq(r.body.totals.costToDateCents,0,'aucun coût initial');
eq(r.body.totals.remainingCommitmentCents,0,'aucun engagement initial');

const location=(await A('POST','/api/stock-locations',{name:'Dépôt test',type:'warehouse'})).body.id;
ok(location,'emplacement stock créé');

// Commande chantier 21 %, puis livraison partielle et complète.
r=await A('POST','/api/purchase-orders',{number:'BC-A-001',supplierId:'ws-supplier-a',date:'2026-09-01',expectedDate:'2026-09-03',projectId:'1',requester:'Owner A',status:'commandée',operationKey:'finance-po-direct-0001',lines:[{reference:'MAT-DIRECT',label:'Matériau direct',quantity:10,unit:'u',unitPrice:100,vatRate:21}]});
eq(r.status,201,'commande liée chantier créée');
const poDirect=r.body.order;
eq(poDirect.netCents,100000,'commande HT en cents');
eq(poDirect.vatCents,21000,'TVA 21 % arrondie en cents');
eq(poDirect.totalCents,121000,'commande TTC canonique');
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.totals.remainingCommitmentCents,100000,'commande nouvelle = engagement HT');

r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poDirect.id)+'/deliveries',{number:'BL-A-001-P',date:'2026-09-03',comment:'partiel',fileName:'BL-A-001-P.pdf',operationKey:'finance-delivery-direct-p',lines:[{orderLineId:poDirect.lines[0].id,received:4,condition:'Reliquat',stock:false}]});
eq(r.status,201,'livraison partielle acceptée');
const deliveryPart=r.body.id;
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.totals.costToDateCents,40000,'réception partielle valorisée en coût à date');
eq(r.body.totals.remainingCommitmentCents,60000,'reliquat reste engagé');
eq(r.body.procurement.receivedCents,40000,'réception partielle détaillée au prix de commande');
eq(r.body.procurement.receivedNotInvoicedCents,40000,'la livraison sans facture reste à contrôler');
eq(r.body.procurement.pendingDeliveryOrders,1,'le reliquat physique est visible comme livraison attendue');

r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poDirect.id)+'/deliveries',{number:'BL-A-001-F',date:'2026-09-05',comment:'solde',fileName:'BL-A-001-F.pdf',operationKey:'finance-delivery-direct-f',lines:[{orderLineId:poDirect.lines[0].id,received:6,condition:'Conforme',stock:false}]});
eq(r.status,201,'livraison complète en second temps');
const deliveryFull=r.body.id;
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.totals.costToDateCents,100000,'réception complète valorisée');
eq(r.body.totals.remainingCommitmentCents,0,'plus de reliquat');
eq(r.body.procurement.pendingDeliveryOrders,0,'commande entièrement livrée retirée des réceptions attendues');

// Facture exactement égale à la commande et rapprochement des deux livraisons.
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-A-001',projectId:'1',purchaseOrderId:String(poDirect.id),deliveryNoteId:deliveryFull,category:'materials',description:'Facture exacte commande directe',expenseDate:'2026-09-06',dueDate:'2099-10-06',total:1210,vatAmount:210,vatRate:21,paymentStatus:'unpaid',documentName:'FF-A-001.pdf',operationKey:'finance-expense-direct-0001'});
eq(r.status,201,'facture fournisseur exacte créée');
const expenseDirect=r.body.id;
r=await A('POST','/api/expenses/'+expenseDirect+'/allocations',{destinationType:'project',destinationId:'1',amountCents:100000,label:'Matériau direct',note:'',reference:'BC-A-001',operationKey:'finance-allocation-direct-0001'});
eq(r.status,201,'facture exacte ventilée chantier');
const allocationDirect=r.body.allocation.id;
const partLine=db.prepare('SELECT id FROM field_delivery_lines WHERE organization_id=? AND delivery_note_id=?').get('org-a',deliveryPart).id;
const fullLine=db.prepare('SELECT id FROM field_delivery_lines WHERE organization_id=? AND delivery_note_id=?').get('org-a',deliveryFull).id;
for(const [line,amount,qty,key] of [[partLine,40000,4000,'finance-match-direct-p'],[fullLine,60000,6000,'finance-match-direct-f']]){
  r=await A('POST','/api/supplier-invoices/'+expenseDirect+'/matches',{allocationId:allocationDirect,projectId:'1',orderId:String(poDirect.id),orderLineId:String(poDirect.lines[0].id),deliveryNoteId:line===partLine?deliveryPart:deliveryFull,deliveryLineId:line,matchedCents:amount,matchedQuantityMilli:qty,operationKey:key});
  eq(r.status,201,'rapprochement facture/livraison créé');
}
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.totals.costToDateCents,100000,'facturation rapprochée ne double pas le coût réception');

// Paiement partiel puis complet; le coût ne change pas.
r=await A('POST','/api/expenses/'+expenseDirect+'/payments',{amountCents:60000,paymentDate:'2026-09-10',paymentMethod:'bank_transfer',reference:'PAY-A-1',note:'acompte',operationKey:'finance-supplier-payment-1'});
eq(r.status,201,'paiement fournisseur partiel');
eq(r.body.summary.paymentStatus,'partial','statut partiel');
eq(r.body.summary.outstandingCents,61000,'solde fournisseur après acompte');
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.totals.costToDateCents,100000,'paiement partiel ne modifie pas coût');
ok(r.body.realized.supplierPaidHtEquivalentCents>0&&r.body.realized.supplierPaidHtEquivalentCents<100000,'cash fournisseur partiel reflété');

r=await A('POST','/api/expenses/'+expenseDirect+'/payments',{amountCents:70000,paymentDate:'2026-09-11',paymentMethod:'bank_transfer',reference:'TOO-MUCH',note:'',operationKey:'finance-supplier-payment-over'});
eq(r.status,409,'surpaiement fournisseur refusé');
r=await A('POST','/api/expenses/'+expenseDirect+'/payments',{amountCents:61000,paymentDate:'2026-09-11',paymentMethod:'bank_transfer',reference:'PAY-A-2',note:'solde',operationKey:'finance-supplier-payment-2'});
eq(r.status,201,'solde fournisseur payé');
eq(r.body.summary.paymentStatus,'paid','facture fournisseur payée');
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.realized.supplierPaidHtEquivalentCents,100000,'paiement complet HT équivalent');
eq(r.body.totals.costToDateCents,100000,'paiement complet ne modifie pas coût');

// Réassort stock sans chantier, facture affectée au stock, puis consommation chantier.
r=await A('POST','/api/purchase-orders',{number:'BC-STOCK-001',supplierId:'ws-supplier-a',date:'2026-09-02',expectedDate:'2026-09-04',requester:'Owner A',status:'commandée',operationKey:'finance-po-stock-0001',lines:[{reference:'MEM-STOCK',label:'Membrane stock',quantity:100,unit:'rouleau',unitPrice:30,vatRate:21}]});
eq(r.status,201,'commande sans chantier créée');
const poStock=r.body.order;
eq(String(poStock.job),'0','commande sans chantier conservée sans projet');
r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poStock.id)+'/deliveries',{number:'BL-STOCK-001',date:'2026-09-04',comment:'réassort dépôt',fileName:'BL-STOCK.pdf',locationId:location,operationKey:'finance-delivery-stock-0001',lines:[{orderLineId:poStock.lines[0].id,received:100,condition:'Conforme',stock:true}]});
eq(r.status,201,'réassort stock réceptionné');
const stockDelivery=r.body.id;
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-STOCK-001',purchaseOrderId:String(poStock.id),deliveryNoteId:stockDelivery,category:'materials',description:'Réassort stock',expenseDate:'2026-09-05',dueDate:'2099-12-05',total:3630,vatAmount:630,vatRate:21,paymentStatus:'unpaid',documentName:'FF-STOCK.pdf',operationKey:'finance-expense-stock-0001'});
eq(r.status,201,'facture stock créée sans chantier');
const expenseStock=r.body.id;
r=await A('POST','/api/expenses/'+expenseStock+'/allocations',{destinationType:'stock',destinationId:null,amountCents:300000,label:'Réassort stock',note:'',reference:'BC-STOCK-001',operationKey:'finance-allocation-stock-0001'});
eq(r.status,201,'coût affecté au stock et non au chantier');
let field=(await A('GET','/api/field-data')).body;
const stockItem=field.stockItems.find(item=>item.reference==='MEM-STOCK');
ok(stockItem,'article stock créé depuis livraison');
eq(stockItem.quantity,100,'quantité stock initiale exploitable');
eq(stockItem.unit,'rouleau','unité stock conservée');
eq(Math.round(stockItem.unitCost*100),3000,'prix achat unitaire stock');
eq(Math.round(stockItem.quantity*stockItem.unitCost*100),300000,'valeur stock après réception');

r=await A('POST','/api/stock-items/'+encodeURIComponent(stockItem.id)+'/movements',{type:'sortie chantier',quantity:20,date:'2026-09-12',projectId:'1',reason:'Consommation chantier',reference:'BAT-A',sourceLocationId:location,destinationLocationId:null,operationKey:'finance-stock-out-0001'});
eq(r.status,201,'sortie stock chantier');
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.realized.stockConsumedCents,60000,'sortie stock valorisée au coût réel chantier');
eq(r.body.categories.MATERIALS.costToDateCents,160000,'coût matériaux = achat direct 100k + stock consommé 60k');
r=await A('POST','/api/stock-items/'+encodeURIComponent(stockItem.id)+'/movements',{type:'ajustement positif',quantity:5,date:'2026-09-13',reason:'Inventaire +5',reference:'INV-1',sourceLocationId:null,destinationLocationId:location,operationKey:'finance-stock-adjust-plus'});
eq(r.status,201,'correction stock positive');
r=await A('POST','/api/stock-items/'+encodeURIComponent(stockItem.id)+'/movements',{type:'ajustement négatif',quantity:2,date:'2026-09-13',reason:'Inventaire -2',reference:'INV-2',sourceLocationId:location,destinationLocationId:null,operationKey:'finance-stock-adjust-minus'});
eq(r.status,201,'correction stock négative');
r=await A('GET','/api/stock-items/'+encodeURIComponent(stockItem.id)+'/movements');
eq(r.status,200,'historique stock lisible');
ok(r.body.movements.some(m=>m.movement_type==='sortie chantier'),'historique contient sortie chantier');
ok(r.body.movements.some(m=>m.movement_type==='ajustement positif'),'historique contient correction inventaire');

// Facture liée à commande avec écart de montant.
r=await A('POST','/api/purchase-orders',{number:'BC-VAR-001',supplierId:'ws-supplier-a',date:'2026-09-06',expectedDate:'2026-09-07',projectId:'1',requester:'Owner A',status:'commandée',operationKey:'finance-po-var-0001',lines:[{reference:'FIX',label:'Fixations',quantity:5,unit:'boîte',unitPrice:100,vatRate:21}]});
eq(r.status,201,'commande pour écart facture');
const poVar=r.body.order;
r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poVar.id)+'/deliveries',{number:'BL-VAR-001',date:'2026-09-07',comment:'complet',fileName:'BL-VAR.pdf',operationKey:'finance-delivery-var-0001',lines:[{orderLineId:poVar.lines[0].id,received:5,condition:'Conforme',stock:false}]});
eq(r.status,201,'livraison commande écart');
const deliveryVar=r.body.id;
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-VAR-001',projectId:'1',purchaseOrderId:String(poVar.id),deliveryNoteId:deliveryVar,category:'materials',description:'Facture +20 EUR HT vs BC',expenseDate:'2026-09-08',dueDate:'2099-10-08',total:629.20,vatAmount:109.20,vatRate:21,paymentStatus:'unpaid',documentName:'FF-VAR.pdf',operationKey:'finance-expense-var-0001'});
eq(r.status,201,'facture avec différence de montant acceptée');
const expenseVar=r.body.id;
r=await A('POST','/api/expenses/'+expenseVar+'/allocations',{destinationType:'project',destinationId:'1',amountCents:52000,label:'Fixations',note:'écart prix',reference:'BC-VAR-001',operationKey:'finance-allocation-var-0001'});
eq(r.status,201,'écart facture ventilé');
const allocVar=r.body.allocation.id;
const varLine=db.prepare('SELECT id FROM field_delivery_lines WHERE organization_id=? AND delivery_note_id=?').get('org-a',deliveryVar).id;
r=await A('POST','/api/supplier-invoices/'+expenseVar+'/matches',{allocationId:allocVar,projectId:'1',orderId:String(poVar.id),orderLineId:String(poVar.lines[0].id),deliveryNoteId:deliveryVar,deliveryLineId:varLine,matchedCents:50000,matchedQuantityMilli:5000,operationKey:'finance-match-var-0001'});
eq(r.status,201,'partie commandée de la facture rapprochée');
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.categories.MATERIALS.costToDateCents,212000,'écart de facture +20 EUR intégré sans doubler la réception');
eq(r.body.procurement.supplierInvoiceMatchingPendingCents,2000,'les 20 EUR non rapprochés avec les lignes du bon restent visibles');
ok(r.body.quality.reasons.includes('SUPPLIER_INVOICE_MATCHING_INCOMPLETE'),'un écart non rapproché rend la prévision moins certaine');

// Une facture inférieure au bon ne doit pas inventer un coût reçu non facturé.
r=await A('POST','/api/purchase-orders',{number:'BC-DISCOUNT-001',supplierId:'ws-supplier-a',date:'2026-09-08',expectedDate:'2026-09-09',projectId:'1',requester:'Owner A',status:'commandée',operationKey:'finance-po-discount-0001',lines:[{reference:'DISC',label:'Matériau avec remise',quantity:5,unit:'u',unitPrice:100,vatRate:21}]});
eq(r.status,201,'commande avec écart favorable créée');
const poDiscount=r.body.order;
r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poDiscount.id)+'/deliveries',{number:'BL-DISCOUNT-001',date:'2026-09-09',comment:'complet',fileName:'',operationKey:'finance-delivery-discount-0001',lines:[{orderLineId:poDiscount.lines[0].id,received:5,condition:'Conforme',stock:false}]});
eq(r.status,201,'livraison complète de la commande remisée');
const deliveryDiscount=r.body.id;
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-DISCOUNT-001',projectId:'1',purchaseOrderId:String(poDiscount.id),deliveryNoteId:deliveryDiscount,category:'materials',description:'Facture avec remise de 20 EUR HT',expenseDate:'2026-09-10',dueDate:'2099-10-10',total:580.80,vatAmount:100.80,vatRate:21,paymentStatus:'unpaid',operationKey:'finance-expense-discount-0001'});
eq(r.status,201,'facture inférieure au bon créée');
const expenseDiscount=r.body.id;
r=await A('POST','/api/expenses/'+expenseDiscount+'/allocations',{destinationType:'project',destinationId:'1',amountCents:48000,label:'Matériau remisé',note:'remise fournisseur',reference:'BC-DISCOUNT-001',operationKey:'finance-allocation-discount-0001'});
eq(r.status,201,'facture remisée ventilée au chantier');
const allocDiscount=r.body.allocation.id;
const discountLine=db.prepare('SELECT id FROM field_delivery_lines WHERE organization_id=? AND delivery_note_id=?').get('org-a',deliveryDiscount).id;
r=await A('POST','/api/supplier-invoices/'+expenseDiscount+'/matches',{allocationId:allocDiscount,projectId:'1',orderId:String(poDiscount.id),orderLineId:String(poDiscount.lines[0].id),deliveryNoteId:deliveryDiscount,deliveryLineId:discountLine,matchedCents:48000,matchedQuantityMilli:5000,operationKey:'finance-match-discount-0001'});
eq(r.status,201,'quantité entièrement rapprochée malgré la remise');
const beforeDiscountForecast=(await A('GET','/api/projects/1/financial-forecast')).body;
eq(beforeDiscountForecast.categories.MATERIALS.costToDateCents,260000,'le coût chantier reprend les 480 EUR réellement facturés');
eq(beforeDiscountForecast.categories.UNCLASSIFIED.costToDateCents,0,'la remise ne crée pas 20 EUR de coût non classé fictif');
eq(beforeDiscountForecast.procurement.supplierPriceVarianceCents,2000,'la différence de 20 EUR avec le bon reste séparément visible');
ok(beforeDiscountForecast.quality.reasons.includes('SUPPLIER_PRICE_VARIANCE'),'la remise qui diffère du bon est signalée pour contrôle');
r=await A('GET','/api/projects/1/cost-control');
eq(r.body.procurement.supplierPriceVarianceCents,beforeDiscountForecast.procurement.supplierPriceVarianceCents,'le suivi chantier expose le même écart que le forecast canonique');
eq(r.body.procurement.supplierInvoiceMatchingPendingCents,beforeDiscountForecast.procurement.supplierInvoiceMatchingPendingCents,'le suivi expose le même reliquat de rapprochement que le forecast');

// Facture sans commande à 6 %, impayée et échue.
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-NO-PO-001',projectId:'1',category:'other',description:'Achat ponctuel sans commande',expenseDate:'2020-01-01',dueDate:'2020-01-31',total:106,vatAmount:6,vatRate:6,paymentStatus:'unpaid',documentName:'FF-NO-PO.pdf',operationKey:'finance-expense-no-po-0001'});
eq(r.status,201,'facture sans commande à TVA 6 %');
const expenseNoPo=r.body.id;
r=await A('POST','/api/expenses/'+expenseNoPo+'/allocations',{destinationType:'project',destinationId:'1',amountCents:10000,label:'Achat direct',note:'',reference:'FF-NO-PO-001',operationKey:'finance-allocation-no-po-0001'});
eq(r.status,201,'facture sans commande ventilée chantier');
r=await A('GET','/api/expenses');
const noPo=r.body.expenses.find(item=>item.id===expenseNoPo);
eq(noPo.payment_status,'overdue','facture échue signalée');
eq(noPo.outstandingCents,10600,'impayé TTC conservé');
eq(noPo.vatRate,6,'taux TVA 6 % conservé');

r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-NO-PO-001',projectId:'1',category:'other',description:'Doublon référence fournisseur',expenseDate:'2020-01-02',total:106,vatAmount:6,vatRate:6,paymentStatus:'unpaid',operationKey:'finance-expense-duplicate-ref'});
eq(r.status,409,'doublon facture fournisseur refusé');

// Sous-traitance et location/équipement dans le coût réel.
for(const spec of [
  {ref:'FF-SUB-001',category:'subcontracting',description:'Sous-traitant',total:121,vat:21,net:10000,key:'sub'},
  {ref:'FF-EQUIP-001',category:'equipment',description:'Location nacelle',total:60.5,vat:10.5,net:5000,key:'equip'}
]){
  r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:spec.ref,projectId:'1',category:spec.category,description:spec.description,expenseDate:'2026-09-09',dueDate:'2099-10-09',total:spec.total,vatAmount:spec.vat,vatRate:21,paymentStatus:'unpaid',operationKey:'finance-expense-'+spec.key});
  eq(r.status,201,spec.description+' créée');
  const eid=r.body.id;
  r=await A('POST','/api/expenses/'+eid+'/allocations',{destinationType:'project',destinationId:'1',amountCents:spec.net,label:spec.description,note:'',reference:spec.ref,operationKey:'finance-allocation-'+spec.key});
  eq(r.status,201,spec.description+' ventilée');
}

// Paiement stock partiel puis annulation tracée.
r=await A('POST','/api/expenses/'+expenseStock+'/payments',{amountCents:100000,paymentDate:'2026-09-15',paymentMethod:'bank_transfer',reference:'PAY-STOCK-1',note:'acompte',operationKey:'finance-stock-payment-1'});
eq(r.status,201,'paiement partiel facture stock');
const stockPaymentId=r.body.payment.id;
eq(r.body.summary.paymentStatus,'partial','facture stock partiellement payée');
r=await A('POST','/api/expenses/'+expenseStock+'/payments/'+stockPaymentId+'/void',{reason:'Erreur de rapprochement bancaire'});
eq(r.status,200,'paiement fournisseur annulé');
eq(r.body.summary.paymentStatus,'unpaid','annulation restaure le solde');

// Commande annulée avant réception.
r=await A('POST','/api/purchase-orders',{number:'BC-CANCEL-001',supplierId:'ws-supplier-a',date:'2026-09-10',expectedDate:'2026-09-15',requester:'Owner A',status:'commandée',operationKey:'finance-po-cancel-0001',lines:[{reference:'CANCEL',label:'Commande annulable',quantity:1,unit:'u',unitPrice:100,vatRate:21}]});
eq(r.status,201,'commande annulable créée');
const poCancel=r.body.order;
r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poCancel.id)+'/cancel',{reason:'Besoin supprimé'});
eq(r.status,200,'commande annulée');
eq(r.body.order.status,'annulée','statut annulation');
r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poCancel.id)+'/deliveries',{number:'BL-CANCEL',date:'2026-09-15',comment:'',fileName:'',operationKey:'finance-delivery-cancelled',lines:[{orderLineId:poCancel.lines[0].id,received:1,condition:'Conforme',stock:false}]});
eq(r.status,409,'livraison d’une commande annulée refusée');

// Facturation client à 6 %, encaissement partiel et rentabilité réalisée.
r=await A('GET','/api/projects/1/financial-forecast');
const beforeClient=r.body;
eq(beforeClient.realized.invoicedHtCents,0,'aucune facture client avant émission');
r=await A('POST','/api/invoices',{customerId:null,projectId:'1',invoiceNumber:'FAC-A-001',issueDate:'2026-09-20',dueDate:'2099-10-20',subtotalCents:500000,vatAmountCents:30000,notes:'Situation 50 % TVA 6 %'});
eq(r.status,201,'facture client TVA 6 % créée');
const clientInvoice=r.body.invoice.id;
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.realized.invoicedHtCents,500000,'facturé HT mis à jour');
eq(r.body.realized.collectedTtcCents,0,'aucun encaissement avant paiement');
r=await A('POST','/api/invoices/'+clientInvoice+'/payments',{amountCents:200000,paymentDate:'2026-09-22',paymentMethod:'bank_transfer',reference:'CLIENT-PAY-1',note:'acompte',operationKey:'finance-client-payment-1'});
eq(r.status,201,'paiement client partiel');
r=await A('GET','/api/projects/1/financial-forecast');
eq(r.body.realized.collectedTtcCents,200000,'encaissement client reflété');
eq(r.body.realized.clientOutstandingTtcCents,330000,'reste client TTC');
eq(r.body.realized.remainingToInvoiceHtCents,500000,'reste à facturer HT');
eq(r.body.categories.MATERIALS.costToDateCents,260000,'matériaux réalisés, dont la facture remisée au montant réellement facturé');
eq(r.body.categories.SUBCONTRACTING.costToDateCents,10000,'sous-traitance réalisée');
eq(r.body.categories.EQUIPMENT.costToDateCents,5000,'location/équipement réalisée');
eq(r.body.categories.OTHER.costToDateCents,10000,'autres dépenses réalisées');
eq(r.body.realized.costHtCents,285000,'coût réel total sans double comptage');
eq(r.body.realized.grossMarginHtCents,715000,'marge brute réalisée en euros cents');
eq(r.body.realized.grossMarginBasisPoints,7150,'marge brute 71,50 %');
eq(r.body.realized.supplierInvoicedHtCents,225000,'factures fournisseur imputées au chantier');
eq(r.body.realized.supplierPaidHtEquivalentCents,100000,'fournisseur payé HT équivalent');
eq(r.body.realized.supplierOutstandingHtEquivalentCents,125000,'impayés fournisseur HT équivalent');
eq(r.body.realized.stockConsumedCents,60000,'stock consommé séparé des achats directs');

const canonicalForecast=r.body;
r=await A('GET','/api/projects/1/cost-control');
eq(r.status,200,'cost-control compatible');
eq(r.body.source,'financial-forecast-v1','forecast = source canonique');
eq(r.body.costControl.totalCostToDateCents,canonicalForecast.totals.costToDateCents,'coût cost-control identique forecast');
eq(r.body.costControl.projectedMarginCents,canonicalForecast.totals.projectedMarginCents,'marge projetée identique forecast');
eq(r.body.labour.hours,canonicalForecast.realized.labourMinutes/60,'heures pointées identiques au forecast canonique');

// Facture reçue avant le bon de livraison: le montant facturé couvre la commande sans être compté deux fois.
r=await A('POST','/api/purchase-orders',{number:'BC-BEFORE-BL-001',supplierId:'ws-supplier-a',date:'2026-09-12',expectedDate:'2026-09-14',projectId:'1',requester:'Owner A',status:'commandée',operationKey:'finance-po-before-delivery-0001',lines:[{reference:'MAT-BEFORE-BL',label:'Matériau facturé avant livraison',quantity:10,unit:'u',unitPrice:100,vatRate:21}]});
eq(r.status,201,'commande avant livraison créée');
const poBeforeDelivery=r.body.order;
const beforePreDeliveryInvoice=(await A('GET','/api/projects/1/financial-forecast')).body;
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-BEFORE-BL-001',purchaseOrderId:String(poBeforeDelivery.id),category:'materials',description:'Facture reçue avant livraison',expenseDate:'2026-09-13',dueDate:'2099-10-13',total:1210,vatAmount:210,vatRate:21,paymentStatus:'unpaid',operationKey:'finance-expense-before-delivery-0001'});
eq(r.status,201,'facture liée à la commande acceptée avant livraison');
const preDeliveryExpense=r.body.id;
r=await A('POST','/api/expenses/'+preDeliveryExpense+'/allocations',{destinationType:'project',destinationId:'1',amountCents:100000,label:'Facture avant livraison',note:'',reference:'BC-BEFORE-BL-001',operationKey:'finance-allocation-before-delivery-0001'});
eq(r.status,201,'facture avant livraison ventilée au chantier');
let afterPreDeliveryInvoice=(await A('GET','/api/projects/1/financial-forecast')).body;
eq(afterPreDeliveryInvoice.totals.costToDateCents-beforePreDeliveryInvoice.totals.costToDateCents,100000,'la facture entre dans le coût à date');
eq(beforePreDeliveryInvoice.totals.remainingCommitmentCents-afterPreDeliveryInvoice.totals.remainingCommitmentCents,100000,'la facture supprime le double engagement de la même commande');
eq(afterPreDeliveryInvoice.procurement.pendingDeliveryOrders,1,'une facture reçue avant livraison ne masque pas le reliquat physique');
eq(afterPreDeliveryInvoice.procurement.supplierInvoiceMatchingPendingCents-beforePreDeliveryInvoice.procurement.supplierInvoiceMatchingPendingCents,100000,'une facture sans lignes rapprochées reste visible comme à contrôler');
ok(afterPreDeliveryInvoice.quality.reasons.includes('SUPPLIER_DELIVERIES_PENDING'),'la marge reste marquée incomplète avant réception physique');
r=await A('POST','/api/purchase-orders/'+encodeURIComponent(poBeforeDelivery.id)+'/deliveries',{number:'BL-BEFORE-BL-P',date:'2026-09-14',comment:'Livraison après facture',fileName:'',operationKey:'finance-delivery-after-invoice-0001',lines:[{orderLineId:poBeforeDelivery.lines[0].id,received:4,condition:'Reliquat',stock:false}]});
eq(r.status,201,'livraison partielle après facture acceptée');
const afterPreDeliveryReceipt=(await A('GET','/api/projects/1/financial-forecast')).body;
eq(afterPreDeliveryReceipt.totals.costToDateCents,afterPreDeliveryInvoice.totals.costToDateCents,'la livraison déjà facturée ne crée pas un second coût');
eq(afterPreDeliveryReceipt.totals.remainingCommitmentCents,afterPreDeliveryInvoice.totals.remainingCommitmentCents,'une facture couvrant la commande ne réapparaît pas en reliquat financier');
eq(afterPreDeliveryReceipt.procurement.pendingDeliveryOrders,1,'une livraison partielle laisse une commande à recevoir');

// Une facture partagée est ventilée sans perdre ni doubler les coûts entre deux chantiers et les frais généraux.
r=await A('PUT','/api/projects/2/financial-baseline',{plannedMinutes:0,hourlyCostCents:5000,progressBasisPoints:1000,budgets:{LABOUR:0,MATERIALS:200000,SUBCONTRACTING:50000,EQUIPMENT:50000,OTHER:50000}});
eq(r.status,200,'baseline du second chantier créée pour le test de partage');
const beforeSharedA=(await A('GET','/api/projects/1/financial-forecast')).body;
const beforeSharedB=(await A('GET','/api/projects/2/financial-forecast')).body;
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-SHARED-001',category:'materials',description:'Facture partagée entre deux chantiers et frais généraux',expenseDate:'2026-09-12',dueDate:'2099-10-12',total:1210,vatAmount:210,vatRate:21,paymentStatus:'unpaid',operationKey:'finance-expense-shared-0001'});
eq(r.status,201,'facture commune créée une seule fois');
const sharedExpense=r.body.id;
for(const [projectId,amount,key] of [['1',30000,'a'],['2',50000,'b']]){
  r=await A('POST','/api/expenses/'+sharedExpense+'/allocations',{destinationType:'project',destinationId:projectId,amountCents:amount,label:'Part chantier '+projectId,note:'',reference:'FF-SHARED-001',operationKey:'finance-allocation-shared-'+key});
  eq(r.status,201,'part de facture affectée au chantier '+projectId);
}
r=await A('GET','/api/expenses/'+sharedExpense+'/allocations');
eq(r.body.expense.allocatedCents,80000,'une facture partiellement ventilée expose exactement les parts déjà affectées');
eq(r.body.expense.remainingCents,20000,'le reliquat HTVA reste visible avant ventilation complète');
const partiallySharedA=(await A('GET','/api/projects/1/financial-forecast')).body;
const partiallySharedB=(await A('GET','/api/projects/2/financial-forecast')).body;
eq(partiallySharedA.categories.MATERIALS.costToDateCents-beforeSharedA.categories.MATERIALS.costToDateCents,30000,'pendant la ventilation partielle, le chantier A ne prend que sa part');
eq(partiallySharedB.categories.MATERIALS.costToDateCents-beforeSharedB.categories.MATERIALS.costToDateCents,50000,'pendant la ventilation partielle, le chantier B ne prend que sa part');
r=await A('POST','/api/expenses/'+sharedExpense+'/allocations',{destinationType:'overhead',destinationId:null,amountCents:20000,label:'Frais généraux',note:'',reference:'FF-SHARED-001',operationKey:'finance-allocation-shared-overhead'});
eq(r.status,201,'part restante affectée aux frais généraux');
r=await A('GET','/api/expenses/'+sharedExpense+'/allocations');
eq(r.body.expense.allocatedCents,100000,'les trois parts soldent exactement le HTVA');
eq(r.body.expense.remainingCents,0,'aucune part ne reste non ventilée');
const afterSharedA=(await A('GET','/api/projects/1/financial-forecast')).body;
const afterSharedB=(await A('GET','/api/projects/2/financial-forecast')).body;
eq(afterSharedA.categories.MATERIALS.costToDateCents-beforeSharedA.categories.MATERIALS.costToDateCents,30000,'chantier A prend uniquement sa part HTVA');
eq(afterSharedB.categories.MATERIALS.costToDateCents-beforeSharedB.categories.MATERIALS.costToDateCents,50000,'chantier B prend uniquement sa part HTVA');
eq(afterSharedA.realized.supplierInvoicedHtCents-beforeSharedA.realized.supplierInvoicedHtCents,30000,'réalisé fournisseur A suit sa ventilation');
eq(afterSharedB.realized.supplierInvoicedHtCents-beforeSharedB.realized.supplierInvoicedHtCents,50000,'réalisé fournisseur B suit sa ventilation');
eq((afterSharedA.categories.MATERIALS.costToDateCents-beforeSharedA.categories.MATERIALS.costToDateCents)+(afterSharedB.categories.MATERIALS.costToDateCents-beforeSharedB.categories.MATERIALS.costToDateCents),80000,'la somme des chantiers exclut la part frais généraux sans la perdre');

// Une commande du chantier A dont la facture est ensuite ventilée entre A, B et les frais généraux.
// La ventilation de la facture doit remplacer le coût de réception estimé, sans le recompter en non-classé.
r=await A('POST','/api/purchase-orders',{number:'BC-SHARED-PO-001',supplierId:'ws-supplier-a',date:'2026-09-11',expectedDate:'2026-09-12',projectId:'1',requester:'Owner A',status:'commandée',operationKey:'finance-po-shared-0001',lines:[{reference:'SHARED-MAT',label:'Matériaux communs',quantity:10,unit:'u',unitPrice:100,vatRate:21}]});
eq(r.status,201,'commande de matériaux communs créée sur le chantier A');
const sharedOrder=r.body.order;
r=await A('POST','/api/purchase-orders/'+encodeURIComponent(sharedOrder.id)+'/deliveries',{number:'BL-SHARED-PO-001',date:'2026-09-12',comment:'Livraison complète',fileName:'',operationKey:'finance-delivery-shared-0001',lines:[{orderLineId:sharedOrder.lines[0].id,received:10,condition:'Conforme',stock:false}]});
eq(r.status,201,'commande commune réceptionnée entièrement');
const sharedDelivery=r.body.id;
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-SHARED-PO-001',purchaseOrderId:String(sharedOrder.id),deliveryNoteId:sharedDelivery,category:'materials',description:'Facture commande répartie entre deux chantiers',expenseDate:'2026-09-13',dueDate:'2099-10-13',total:1210,vatAmount:210,vatRate:21,paymentStatus:'unpaid',operationKey:'finance-expense-shared-po-0001'});
eq(r.status,201,'facture de la commande créée');
const sharedOrderExpense=r.body.id;
for(const [destinationType,destinationId,amount,key] of [['project','1',70000,'a'],['project','2',20000,'b'],['overhead',null,10000,'overhead']]){
  r=await A('POST','/api/expenses/'+sharedOrderExpense+'/allocations',{destinationType,destinationId,amountCents:amount,label:'Part commande '+key,note:'',reference:'FF-SHARED-PO-001',operationKey:'finance-allocation-shared-po-'+key});
  eq(r.status,201,'part de la facture de commande ventilée: '+key);
}
const sharedOrderAllocations=(await A('GET','/api/expenses/'+sharedOrderExpense+'/allocations')).body;
eq(sharedOrderAllocations.expense.allocatedCents,100000,'facture de commande soldée en HTVA sur tous ses destinataires');
const sharedOrderForecastA=(await A('GET','/api/projects/1/financial-forecast')).body;
const sharedOrderForecastB=(await A('GET','/api/projects/2/financial-forecast')).body;
eq(sharedOrderForecastA.categories.MATERIALS.costToDateCents,afterSharedA.categories.MATERIALS.costToDateCents+70000,'chantier A garde uniquement sa part réelle de la commande');
eq(sharedOrderForecastA.categories.UNCLASSIFIED.costToDateCents,afterSharedA.categories.UNCLASSIFIED.costToDateCents,'une facture entièrement ventilée ne recrée pas un coût non classé au chantier A');
eq(sharedOrderForecastA.categories.UNCLASSIFIED.remainingCommitmentCents,afterSharedA.categories.UNCLASSIFIED.remainingCommitmentCents,'aucun reliquat fictif après facture et livraison complètes');
eq(sharedOrderForecastB.categories.MATERIALS.costToDateCents,afterSharedB.categories.MATERIALS.costToDateCents+20000,'chantier B reçoit uniquement sa part de facture');

// Isolation multi-entreprise.
r=await B('GET','/api/purchase-orders');
eq(r.status,200,'entreprise B peut lire ses commandes');
eq(r.body.orders.length,0,'B ne voit aucune commande A');
r=await B('GET','/api/expenses');
eq(r.status,200,'entreprise B peut lire ses dépenses');
eq(r.body.expenses.length,0,'B ne voit aucune facture fournisseur A');
r=await B('GET','/api/invoices');
eq(r.status,200,'entreprise B peut lire ses factures client');
eq(r.body.invoices.length,0,'B ne voit aucune facture client A');
r=await B('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'CROSS-1',category:'other',description:'Cross tenant',expenseDate:'2026-09-01',total:121,vatAmount:21,vatRate:21,paymentStatus:'unpaid',operationKey:'finance-cross-expense'});
eq(r.status,404,'B ne peut pas utiliser le fournisseur A');
r=await B('POST','/api/expenses/'+expenseDirect+'/payments',{amountCents:1,paymentDate:'2026-09-20',paymentMethod:'bank_transfer',reference:'X',note:'',operationKey:'finance-cross-payment'});
eq(r.status,404,'B ne peut pas payer la facture A');
r=await B('GET','/api/projects/1/financial-forecast');
eq(r.status,404,'B ne peut pas déduire la rentabilité du chantier A');
r=await B('GET','/api/suppliers');
eq(r.status,200,'B peut lire son annuaire fournisseur');
ok(!r.body.suppliers.some(s=>s.id==='supplier-a'),'B ne voit pas le fournisseur A');

// L'idempotence d'une facture reste valide après changement de statut de paiement.
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-A-001',projectId:'1',purchaseOrderId:String(poDirect.id),deliveryNoteId:deliveryFull,category:'materials',description:'Facture exacte commande directe',expenseDate:'2026-09-06',dueDate:'2099-10-06',total:1210,vatAmount:210,vatRate:21,paymentStatus:'unpaid',documentName:'FF-A-001.pdf',operationKey:'finance-expense-direct-0001'});
eq(r.status,200,'replay facture après paiements reste idempotent');
eq(r.body.replayed,true,'replay explicitement signalé');
r=await A('POST','/api/expenses',{supplierId:'supplier-a',supplierReference:'FF-A-001',projectId:'1',purchaseOrderId:String(poDirect.id),deliveryNoteId:deliveryFull,category:'materials',description:'Tentative de doublon après paiement',expenseDate:'2026-09-06',dueDate:'2099-10-06',total:1210,vatAmount:210,vatRate:21,paymentStatus:'unpaid',operationKey:'finance-expense-direct-duplicate-after-paid'});
eq(r.status,409,'une facture déjà payée ne peut pas être recréée sous une autre clé');
const finalExpenses=(await A('GET','/api/expenses')).body.expenses;
eq(finalExpenses.filter(item=>item.supplier_id==='supplier-a'&&item.supplier_reference==='FF-A-001').length,1,'un seul enregistrement subsiste pour la référence payée');

// Les heures d’équipe ne changent le coût et la marge qu’après approbation de la correction.
db.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('time-finance-001','org-a','1','team-finance-a',JSON.stringify(['worker-finance-a']),'2026-09-23','07:00','15:30',30,'Équipe toiture','owner-a',stamp,'owner-a',stamp);
const beforeTimeCorrection=(await A('GET','/api/projects/1/financial-forecast')).body;
eq(beforeTimeCorrection.realized.labourMinutes,480,'le pointage équipe représente huit heures-personnes');
eq(beforeTimeCorrection.categories.LABOUR.costToDateCents,40000,'les heures validées coûtent 400 EUR HT au taux enregistré');
r=await A('POST','/api/time-entries/time-finance-001/corrections',{personId:'worker-finance-a',arrival:'07:15',departure:'15:30',reason:'Arrivée réellement à 07 h 15'});
eq(r.status,201,'la correction d’heure est enregistrée en attente');
const pendingTimeCorrectionId=r.body.id;
let pendingTimeForecast=(await A('GET','/api/projects/1/financial-forecast')).body;
eq(pendingTimeForecast.realized.labourMinutes,480,'une demande en attente ne remplace pas le temps validé');
eq(pendingTimeForecast.categories.LABOUR.costToDateCents,40000,'une correction en attente ne modifie pas le coût de main-d’œuvre');
eq(pendingTimeForecast.totals.projectedMarginCents,beforeTimeCorrection.totals.projectedMarginCents,'la marge ne bouge pas avant décision du patron');
ok(pendingTimeForecast.quality.reasons.includes('TIME_CORRECTIONS_PENDING'),'la marge signale la correction non traitée');
r=await A('POST','/api/time-entry-corrections/'+encodeURIComponent(pendingTimeCorrectionId)+'/review',{approved:true});
eq(r.status,200,'le patron approuve la correction demandée');
const approvedTimeForecast=(await A('GET','/api/projects/1/financial-forecast')).body;
eq(approvedTimeForecast.realized.labourMinutes,465,'le forecast suit les 7 h 45 validées');
eq(approvedTimeForecast.categories.LABOUR.costToDateCents,38750,'le coût baisse de 12,50 EUR après correction approuvée');
eq(approvedTimeForecast.totals.projectedMarginCents-beforeTimeCorrection.totals.projectedMarginCents,1250,'la marge projetée suit exactement la correction en cents');
eq(db.prepare('SELECT status,reviewed_by FROM time_entry_corrections WHERE id=?').get(pendingTimeCorrectionId).status,'approved','la décision approuvée reste dans l’historique');
const approvedHistory=db.prepare('SELECT status,reviewed_by FROM time_entry_corrections WHERE id=?').get(pendingTimeCorrectionId);
eq(approvedHistory.reviewed_by,'owner-a','l’auteur de la validation est conservé');
r=await A('POST','/api/time-entries/time-finance-001/corrections',{personId:'worker-finance-a',arrival:'07:30',departure:'15:30',reason:'Essai d’une correction erronée'});
eq(r.status,201,'une seconde correction peut être instruite');
const rejectedTimeCorrectionId=r.body.id;
r=await A('POST','/api/time-entry-corrections/'+encodeURIComponent(rejectedTimeCorrectionId)+'/review',{approved:false});
eq(r.status,200,'le patron refuse la seconde correction');
const afterRejectedTimeForecast=(await A('GET','/api/projects/1/financial-forecast')).body;
eq(afterRejectedTimeForecast.realized.labourMinutes,465,'le refus conserve les heures précédemment validées');
eq(afterRejectedTimeForecast.categories.LABOUR.costToDateCents,38750,'le refus ne change pas le coût validé');
eq(afterRejectedTimeForecast.totals.projectedMarginCents,approvedTimeForecast.totals.projectedMarginCents,'le refus ne change pas la marge validée');
eq(db.prepare('SELECT status,reviewed_by FROM time_entry_corrections WHERE id=?').get(rejectedTimeCorrectionId).status,'rejected','le refus reste inscrit dans l’historique');
eq(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE organization_id='org-a' AND action='time_entry.correction_approved' AND entity_id=?").get(pendingTimeCorrectionId).c,1,'une décision approuvée produit une trace unique');
eq(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE organization_id='org-a' AND action='time_entry.correction_rejected' AND entity_id=?").get(rejectedTimeCorrectionId).c,1,'une décision refusée produit une trace unique');
eq(db.prepare('PRAGMA foreign_key_check').all().length,0,'aucune violation FK');
eq(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','intégrité SQLite');

console.log('batinova-finance-chain-31: '+assertions+' assertions réussies');
