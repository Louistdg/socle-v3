import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const required of ['0027_legacy_expense_project.sql','0028_project_financial_baseline.sql'])assert.ok(migrations.includes(required),required+' présente');

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-09-29T12:00:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','Owner','SOCLE',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Owner',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org','owner','role-owner','active',stamp,stamp,stamp);

const state={version:3,company:{name:'BatiNova'},people:[],teams:[],jobs:[{
  id:'legacy-1',name:'Résidence Test',reference:'BAT-01',progress:20,
  finance:{hourlyCost:50,plannedHours:100,materialsBudget:1200,subcontractingBudget:0,otherBudget:0}
},{id:'closed-1',name:'Chantier terminé',reference:'BAT-02',status:'Terminé',progress:100},{id:'team-1',name:'Équipe de trois',reference:'BAT-03',status:'En cours',progress:50},{id:'no-rate-1',name:'Coût horaire absent',reference:'BAT-04',status:'En cours',progress:20}],assignments:[],quotes:[{
  id:'quote-legacy',job:'legacy-1',status:'Accepté',lines:[{label:'Marché',qty:1,price:10000}]
},{id:'quote-closed',job:'closed-1',status:'Accepté',lines:[{label:'Marché',qty:1,price:10000}]},{id:'quote-team',job:'team-1',status:'Accepté',lines:[{label:'Marché',qty:1,price:5000}]},{id:'quote-no-rate',job:'no-rate-1',status:'Accepté',lines:[{label:'Marché',qty:1,price:5000}]}],assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[{
  id:'po-1',number:'BC-1',job:'legacy-1',status:'commandée',
  lines:[{id:'line-1',label:'Matériaux',quantity:10,unit:'u',unitPrice:100,vatRate:21}]
},{
  id:'po-closed',number:'BC-CLOSED-1',job:'closed-1',status:'commandée',
  lines:[{id:'line-closed-1',label:'Matériaux encore attendus',quantity:2,unit:'u',unitPrice:150,vatRate:21}]
}]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);

db.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('time-1','org','legacy-1','team-1','["p1"]','2026-09-29','08:00','16:00',0,'','owner',stamp,'owner',stamp);
db.prepare('INSERT INTO field_delivery_notes(id,organization_id,order_id,supplier_id,project_id,number,delivery_date,receiver_name,comment,file_name,status,created_by,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('delivery-1','org','po-1',null,'legacy-1','BL-1','2026-09-29','Owner','',null,'Reçue','owner',stamp,'delivery-test-0001');
db.prepare('INSERT INTO field_delivery_lines(id,organization_id,delivery_note_id,order_line_id,reference,label,ordered,received,condition,difference,stock_item_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('delivery-line-1','org','delivery-1','line-1','','Matériaux',10,4,'Conforme',6,null);
db.prepare('INSERT INTO expenses(id,organization_id,supplier_id,project_id,legacy_project_id,category,description,expense_date,currency,subtotal_cents,vat_amount_cents,total_cents,payment_status,created_by,created_at,updated_at,supplier_reference,idempotency_key,purchase_order_id,delivery_note_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('expense-1','org',null,null,'legacy-1','materials','Matériaux','2026-09-29','EUR',40000,8400,48400,'unpaid','owner',stamp,stamp,'FF-1','expense-test-0001','po-1','delivery-1');
db.prepare('INSERT INTO supplier_allocations(id,organization_id,expense_id,destination_type,destination_id,amount_cents,label,note,reference,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('alloc-1','org','expense-1','project','legacy-1',40000,'Matériaux','','BC-1','alloc-test-0001','active','owner',stamp);
db.prepare("INSERT INTO supplier_invoice_matches(id,organization_id,expense_id,allocation_id,project_id,order_id,order_line_id,delivery_note_id,delivery_line_id,matched_cents,matched_quantity_milli,operation_key,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'active',?,?,?,?)").run('match-1','org','expense-1','alloc-1','legacy-1','po-1','line-1','delivery-1','delivery-line-1',40000,4000,'match-test-0001','owner',stamp,'owner',stamp);

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

async function request(method,path,payload){
  const headers={'oai-authenticated-user-id':'owner','x-socle-organization-id':'org','origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let r=await request('POST','/api/projects/legacy-1/financial-baseline/bootstrap');
assert.equal(r.status,201,'bootstrap baseline');
assert.equal(r.body.baseline.hourlyCostCents,5000);
assert.equal(r.body.baseline.plannedMinutes,6000);
assert.equal(r.body.baseline.budgets.LABOUR,500000);
assert.equal(r.body.baseline.budgets.MATERIALS,120000);
assert.equal(r.body.baseline.budgets.EQUIPMENT,null,'budget absent reste null');

r=await request('GET','/api/projects/legacy-1/financial-forecast');
assert.equal(r.status,200,'forecast disponible avec baseline partielle');
assert.equal(r.body.totals.catCents,null,'baseline partielle conserve CAT inconnu');
assert.equal(r.body.quality.confidence,'LOW');

r=await request('PUT','/api/projects/legacy-1/financial-baseline',{
  plannedMinutes:6000,hourlyCostCents:5000,progressBasisPoints:2000,
  budgets:{LABOUR:500000,MATERIALS:120000,SUBCONTRACTING:0,EQUIPMENT:0,OTHER:0}
});
assert.equal(r.status,200,'baseline complète versionnée');
assert.equal(r.body.baseline.version,2);

r=await request('GET','/api/projects/legacy-1/financial-forecast');
assert.equal(r.status,200);
assert.equal(r.body.schemaVersion,1);
assert.equal(r.body.revenue.acceptedQuotesCents,1000000,'revenu = devis accepté HT');
assert.equal(r.body.revenue.approvedChangesCents,0,'aucun registre avenant: zéro explicite');
assert.equal(r.body.categories.LABOUR.costToDateCents,40000,'8 h x 50 EUR');
assert.equal(r.body.realized.labourMinutes,480,'les heures réellement pointées sont exposées par le calcul canonique');
assert.equal(r.body.categories.LABOUR.radCents,460000,'RAD main-d oeuvre basé heures planifiées');
assert.equal(r.body.categories.LABOUR.labourRadStatus,'PLANNED_HOURS');
assert.equal(r.body.categories.MATERIALS.costToDateCents,40000,'allocation fournisseur active');
assert.equal(r.body.categories.MATERIALS.radCents,80000,'RAD matériaux sans double comptage');
assert.equal(r.body.categories.UNCLASSIFIED.costToDateCents,0,'livraison rapprochée non recomptée');
assert.equal(r.body.categories.UNCLASSIFIED.remainingCommitmentCents,60000,'solde commande non couvert');
assert.equal(r.body.procurement.orderedCents,100000,'commande HT exposée dans les données procurement');
assert.equal(r.body.procurement.receivedCents,40000,'réception partielle valorisée au prix du bon');
assert.equal(r.body.procurement.pendingDeliveryOrders,1,'commande encore à livrer signalée');
assert.equal(r.body.totals.costToDateCents,80000);
assert.equal(r.body.totals.remainingCommitmentCents,60000);
assert.equal(r.body.totals.radCents,540000);
assert.equal(r.body.totals.catCents,680000);
assert.equal(r.body.totals.projectedMarginCents,320000);
assert.equal(r.body.quality.unclassifiedCents,60000);
assert.equal(r.body.quality.confidence,'MEDIUM','coût non classé réduit la confiance sans annuler la marge');
assert.ok(r.body.quality.reasons.includes('UNCLASSIFIED_COSTS'));
assert.ok(r.body.quality.reasons.includes('SUPPLIER_DELIVERIES_PENDING'));

r=await request('GET','/api/projects/legacy-1/cost-control');
assert.equal(r.status,200,'pilotage chantier disponible');
assert.equal(r.body.labour.hours,8,'le pilotage restitue les heures pointées du serveur');
assert.equal(r.body.labour.actualCostCents,40000,'le coût de main-d’œuvre garde sa valeur canonique');
assert.equal(r.body.procurement.orderedCents,100000,'le suivi reprend la valeur de commande du forecast');
assert.equal(r.body.procurement.receivedCents,40000,'le suivi reprend la valeur reçue du forecast');
assert.equal(r.body.procurement.receivedNotInvoicedCents,0,'les unités reçues et rapprochées ne sont pas signalées comme non facturées');
assert.equal(r.body.procurement.pendingDeliveryOrders,1,'le suivi restitue la commande encore à recevoir');
db.prepare('INSERT INTO time_entry_corrections(id,organization_id,time_entry_id,person_id,original_arrival,original_departure,proposed_arrival,proposed_departure,reason,status,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('correction-pending','org','time-1','p1','08:00','16:00','08:15','16:00','Correction demandée','pending','owner',stamp);
r=await request('GET','/api/projects/legacy-1/cost-control');
assert.equal(r.body.alerts.pendingTimeCorrections,1,'une correction d’heures en attente est signalée au pilotage');
r=await request('GET','/api/projects/legacy-1/financial-forecast');
assert.equal(r.body.realized.labourMinutes,480,'une correction en attente ne modifie pas encore le temps comptabilisé');
assert.ok(r.body.quality.reasons.includes('TIME_CORRECTIONS_PENDING'),'la prévision avertit aussi en cas de correction d’heure non validée');
db.prepare("UPDATE time_entry_corrections SET status='rejected' WHERE id='correction-pending'").run();
r=await request('GET','/api/projects/legacy-1/cost-control');
assert.equal(r.body.alerts.pendingTimeCorrections,0,'une correction rejetée ne reste pas une alerte en attente');

const active=db.prepare("SELECT COUNT(*) count FROM project_financial_baselines WHERE organization_id='org' AND project_id='legacy-1' AND status='active'").get().count;
assert.equal(active,1,'une seule baseline active');
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'intégrité FK');

r=await request('PUT','/api/projects/closed-1/financial-baseline',{plannedMinutes:6000,hourlyCostCents:5000,progressBasisPoints:10000,budgets:{LABOUR:500000,MATERIALS:0,SUBCONTRACTING:0,EQUIPMENT:0,OTHER:0}});
assert.equal(r.status,200,'base complète du chantier terminé créée');
r=await request('GET','/api/projects/closed-1/financial-forecast');
assert.equal(r.body.realized.labourMinutes,0,'aucune heure n’est inventée pour le chantier terminé');
assert.equal(r.body.quality.confidence,'MEDIUM','chantier terminé sans heures ne donne pas une marge certaine');
assert.ok(r.body.quality.reasons.includes('LABOUR_TIME_ENTRIES_MISSING'),'pointages manquants signalés sur le chantier terminé');
assert.equal(r.body.procurement.pendingDeliveryOrders,1,'la commande ouverte reste visible sur le chantier clôturé');
assert.equal(r.body.procurement.remainingOrderCents,30000,'le reliquat de commande du chantier clôturé est chiffré');
assert.ok(r.body.quality.reasons.includes('SUPPLIER_DELIVERIES_PENDING'),'la prévision clôturée reste incomplète avec une commande ouverte');
assert.equal(r.body.quality.confidence,'MEDIUM','le chantier clôturé avec pointages manquants et commande ouverte ne présente pas une marge certaine');

r=await request('PUT','/api/projects/team-1/financial-baseline',{plannedMinutes:1440,hourlyCostCents:5000,progressBasisPoints:5000,budgets:{LABOUR:120000,MATERIALS:0,SUBCONTRACTING:0,EQUIPMENT:0,OTHER:0}});
assert.equal(r.status,200,'base de coûts d’équipe créée');
db.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('time-team','org','team-1','team-3','["p1","p2","p3"]','2026-09-30','07:00','16:00',60,'Équipe complète','owner',stamp,'owner',stamp);
r=await request('GET','/api/projects/team-1/financial-forecast');
assert.equal(r.body.realized.labourMinutes,1440,'8 h terrain x 3 personnes = 24 h-personnes');
assert.equal(r.body.categories.LABOUR.costToDateCents,120000,'le coût de main-d’œuvre multiplie les heures par les trois personnes');

r=await request('PUT','/api/projects/no-rate-1/financial-baseline',{plannedMinutes:6000,hourlyCostCents:null,progressBasisPoints:2000,budgets:{LABOUR:500000,MATERIALS:0,SUBCONTRACTING:0,EQUIPMENT:0,OTHER:0}});
assert.equal(r.status,200,'base sans coût horaire acceptée comme donnée incomplète');
r=await request('GET','/api/projects/no-rate-1/financial-forecast');
assert.equal(r.body.categories.LABOUR.costToDateCents,null,'aucun coût horaire n’est inventé');
assert.equal(r.body.quality.confidence,'LOW','sans taux horaire la marge n’est pas calculée comme fiable');
assert.ok(r.body.quality.reasons.includes('LABOUR_HOURLY_COST_MISSING'),'coût horaire manquant nommé dans la qualité');

console.log('project-financial-forecast-28: 35 assertions réussies');
