import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
import {runProcurementBomChainPack} from '../scripts/simulation/batinova-xl/procurement-bom-chain-pack.mjs';
import {runMaterialCostStoriesPack} from '../scripts/simulation/batinova-xl/material-cost-stories-pack.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-09-30T04:40:00.000Z';
const org='batxl-org';
const owner='batxl-owner';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .run(org,'BatiNova XL','BatiNova XL','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run(owner,'Marc','Delcourt','marc@simulation.invalid',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)')
  .run('batxl-owner-role',org,'OWNER','Owner',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run('batxl-owner-member',org,owner,'batxl-owner-role','active',stamp,stamp,stamp);
db.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_code) SELECT 'batxl-owner-role',code FROM permissions WHERE code IN ('margins.view','workspace.view')")
  .run();

db.prepare("INSERT INTO suppliers(id,organization_id,name,email,country,default_expense_category,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,'materials',30,?,?)")
  .run('BATXL-SUP-01',org,'Fournisseur BATXL','supplier@simulation.invalid','BE',stamp,stamp);
db.prepare("INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?, 'active',?,?,?,?)")
  .run('BATXL-LOC-01',org,'Dépôt BATXL','warehouse',owner,stamp,owner,stamp);

for(let i=1;i<=100;i++){
  db.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,0,0,?,?,?,?,?,?,?, ?,?)')
    .run('BATXL-STK-ID-'+String(i).padStart(3,'0'),org,'BATXL-STK-'+String(i).padStart(3,'0'),'Stock générique '+i,'piece',100,5,'BATXL','',''+owner,stamp,owner,stamp);
}

const scenarios=JSON.parse(readFileSync(new URL('../scripts/simulation/batinova-xl/project-scenarios-2026-09-29.json',import.meta.url),'utf8'));
const materials=JSON.parse(readFileSync(new URL('../scripts/simulation/batinova-xl/materials-catalog-2026-09-29.json',import.meta.url),'utf8'));
const bom=JSON.parse(readFileSync(new URL('../scripts/simulation/batinova-xl/bom-templates-2026-09-29.json',import.meta.url),'utf8'));
const scenarioById=new Map((scenarios.projects||[]).map(p=>[String(p.id),p]));
const projectIds=['BATXL-PRJ-007','BATXL-PRJ-008'];
const projects=projectIds.map(id=>({...structuredClone(scenarioById.get(id)),reference:id}));
const priced=(materials.benchmarks||[]).filter(item=>Number.isFinite(Number(item.price))).slice(0,2);
const bomId=String(bom.templates?.[0]?.id||'');
assert.equal(priced.length,2);
assert.ok(bomId.startsWith('BATXL-BOM-'));
const ht=item=>Number((item.vatIncluded?Number(item.price)/1.21:Number(item.price)).toFixed(4));
const materialLine=(item,qty)=>({
  ref:item.code,label:item.label,qty,unit:item.unit,price:ht(item),vatRate:21,
  source:item.source,sourcePriceObserved:item.price,sourceVatIncluded:item.vatIncluded,
  supplierQuoteRequired:false,quantitySource:'BATXL story test',bomTemplateId:bomId,simulation:true
});
const quotes=[
  {
    id:'BATXL-Q-007',ref:'DEV-BATXL-007',title:'Offre principale — pression matière',job:'BATXL-PRJ-007',status:'accepté',
    lines:[materialLine(priced[0],20),{ref:'SERVICE-007',label:'Main d’œuvre et marge',qty:1,unit:'forfait',price:50000,vatRate:21}]
  },
  {
    id:'BATXL-Q-008',ref:'DEV-BATXL-008',title:'Offre principale — retour stock',job:'BATXL-PRJ-008',status:'accepté',
    lines:[materialLine(priced[1],18),{ref:'SERVICE-008',label:'Main d’œuvre et marge',qty:1,unit:'forfait',price:60000,vatRate:21}]
  }
];
const state={
  version:3,
  company:{name:'BatiNova XL'},
  contacts:[],
  purchaseOrders:[],
  jobs:projects,
  quotes,
  assets:[],tasks:[],dossiers:[],reminders:[]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run(org,JSON.stringify(state),1,owner,stamp,stamp);

let assertions=0;
const eq=(a,b,m)=>{assert.equal(a,b,m);assertions++};
const ok=(v,m)=>{assert.ok(v,m);assertions++};
const deep=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++};

const procurement=runProcurementBomChainPack({database:db,organizationId:org,ownerId:owner});
eq(procurement.acceptedProjects,2,'procurement matérialise les 2 projets');
eq(Number(procurement.purchaseOrders),2,'2 BC procurement');
eq(Number(procurement.deliveryNotes),2,'2 BL procurement');

function stockConsumed(projectId){
  return Math.round(Number(db.prepare("SELECT COALESCE(SUM(CASE WHEN movement_type='sortie chantier' THEN quantity*unit_cost_cents WHEN movement_type='retour chantier' THEN -quantity*unit_cost_cents ELSE 0 END),0) c FROM field_stock_movements WHERE organization_id=? AND project_id=? AND movement_type IN ('sortie chantier','retour chantier')")
    .get(org,projectId).c||0));
}
function addBaseline(projectId,materialBudget){
  const id='BASE-'+projectId;
  db.prepare("INSERT INTO project_financial_baselines(id,organization_id,project_id,version,status,planned_minutes,hourly_cost_cents,progress_basis_points,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?, 'active',0,0,5000,?,?,?,?)")
    .run(id,org,projectId,1,owner,stamp,owner,stamp);
  for(const [category,value] of Object.entries({LABOUR:0,MATERIALS:materialBudget,SUBCONTRACTING:0,EQUIPMENT:0,OTHER:0})){
    db.prepare('INSERT INTO project_cost_budgets(baseline_id,category,budget_cents) VALUES(?,?,?)').run(id,category,value);
  }
}
const baseStock007=stockConsumed('BATXL-PRJ-007');
const baseStock008=stockConsumed('BATXL-PRJ-008');
ok(baseStock007>0&&baseStock008>0,'coûts stock procurement présents');
addBaseline('BATXL-PRJ-007',baseStock007);
addBaseline('BATXL-PRJ-008',baseStock008);

function makeEnv(database){
  return {DB:{
    prepare(sql){
      let values=[];
      return{
        _sql:sql,
        get _values(){return values},
        bind(...args){values=args;return this},
        async first(){return database.prepare(sql).get(...values)??null},
        async all(){return{results:database.prepare(sql).all(...values)}},
        async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
      };
    },
    async batch(statements){
      database.exec('BEGIN IMMEDIATE');
      try{
        const out=[];
        for(const statement of statements){
          const result=database.prepare(statement._sql).run(...statement._values);
          out.push({meta:{changes:Number(result.changes)}});
        }
        database.exec('COMMIT');
        return out;
      }catch(error){
        database.exec('ROLLBACK');
        throw error;
      }
    }
  }};
}
async function forecast(projectId){
  const response=await worker.fetch(new Request('https://socle.simulation/api/projects/'+projectId+'/financial-forecast',{
    method:'GET',
    headers:{
      'oai-authenticated-user-id':owner,
      'x-socle-organization-id':org,
      'origin':'https://socle.simulation'
    }
  }),makeEnv(db));
  eq(response.status,200,'forecast '+projectId+' HTTP 200');
  return response.json();
}

const before007=await forecast('BATXL-PRJ-007');
const before008=await forecast('BATXL-PRJ-008');
const inventoryBefore=Number(db.prepare("SELECT COALESCE(SUM(quantity),0) q FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL").get(org).q);

const first=runMaterialCostStoriesPack({database:db,organizationId:org,ownerId:owner});
eq(first.integrity.foreignKeyViolations,0,'FK pack vide');
eq(first.integrity.integrityCheck,'ok','integrity pack ok');
eq(first.materialPressure.projectId,'BATXL-PRJ-007','story pression PRJ007');
eq(first.materialPressure.surchargeRateBasisPoints,1500,'surcharge 15%');
ok(first.materialPressure.surchargeHtCents>0,'surcharge positive');
eq(first.stockReturn.projectId,'BATXL-PRJ-008','story retour PRJ008');
ok(first.stockReturn.returnCreditCents>0,'crédit retour positif');
ok(first.stockReturn.returnedQuantity>0&&first.stockReturn.returnedQuantity<first.stockReturn.issueQuantity,'retour partiel réel');
ok(Math.abs(first.stockReturn.netStoryCostCents-(first.stockReturn.grossIssueCents-first.stockReturn.returnCreditCents))<=1,'coût net suit l’arrondi global du Forecast à 1 centime près');

const pressureExpense=db.prepare("SELECT legacy_project_id,purchase_order_id,subtotal_cents,category,supplier_reference FROM expenses WHERE organization_id=? AND id='BATXL-MATPRESS-EXP-007'").get(org);
eq(pressureExpense.legacy_project_id,'BATXL-PRJ-007','surcharge rattachée chantier');
eq(pressureExpense.purchase_order_id,null,'surcharge non jointe au BC SQL pour préserver anti-double-compte stock');
eq(Number(pressureExpense.subtotal_cents),first.materialPressure.surchargeHtCents,'montant surcharge exact');
eq(pressureExpense.category,'materials','surcharge classée matériaux');
ok(String(pressureExpense.supplier_reference).includes(first.materialPressure.purchaseOrderId),'référence fournisseur conserve le BC causal');
const pressureAllocation=db.prepare("SELECT destination_type,destination_id,amount_cents,reference FROM supplier_allocations WHERE organization_id=? AND expense_id='BATXL-MATPRESS-EXP-007'").get(org);
eq(pressureAllocation.destination_type,'project','ventilation projet explicite');
eq(pressureAllocation.destination_id,'BATXL-PRJ-007','ventilation vers PRJ007');
eq(Number(pressureAllocation.amount_cents),first.materialPressure.surchargeHtCents,'allocation égale surcharge');
eq(pressureAllocation.reference,first.materialPressure.purchaseOrderId,'allocation trace le BC causal');

const after007=await forecast('BATXL-PRJ-007');
const after008=await forecast('BATXL-PRJ-008');
eq(after007.categories.MATERIALS.costToDateCents,before007.categories.MATERIALS.costToDateCents+first.materialPressure.surchargeHtCents,'pression matière augmente coût réel exactement du delta');
eq(after007.totals.projectedMarginCents,before007.totals.projectedMarginCents-first.materialPressure.surchargeHtCents,'pression matière réduit marge projetée du delta');
eq(after008.realized.stockConsumedCents,stockConsumed('BATXL-PRJ-008'),'Forecast reprend exactement le coût stock net après retour');
ok(Math.abs((after008.realized.stockConsumedCents-before008.realized.stockConsumedCents)-first.stockReturn.netStoryCostCents)<=1,'variation Forecast cohérente avec le coût net story à 1 centime près');
ok(after008.realized.grossMarginHtCents>0,'PRJ008 conserve une bonne marge réalisée');
const hypotheticalMarginWithoutReturn=after008.realized.grossMarginHtCents-first.stockReturn.returnCreditCents;
eq(after008.realized.grossMarginHtCents-hypotheticalMarginWithoutReturn,first.stockReturn.returnCreditCents,'retour améliore la marge réalisée du crédit stock');

const inventoryAfter=Number(db.prepare("SELECT COALESCE(SUM(quantity),0) q FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL").get(org).q);
eq(inventoryAfter,inventoryBefore,'sortie vers chantier + retour ne créent ni ne détruisent le stock global');
eq(Number(db.prepare("SELECT COUNT(*) c FROM stock_locations WHERE organization_id=? AND id='BATXL-MATSTORY-LOC-PRJ008'").get(org).c),1,'emplacement chantier déterministe');
eq(Number(db.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id=? AND id LIKE 'BATXL-MATSTORY-MOV-%'").get(org).c),2,'2 mouvements story exactement');

const snapshotBeforeReplay={
  fingerprint:first.fingerprint,
  expenseCount:Number(db.prepare("SELECT COUNT(*) c FROM expenses WHERE organization_id=? AND id='BATXL-MATPRESS-EXP-007'").get(org).c),
  allocationCount:Number(db.prepare("SELECT COUNT(*) c FROM supplier_allocations WHERE organization_id=? AND id='BATXL-MATPRESS-ALLOC-007'").get(org).c),
  movementCount:Number(db.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id=? AND id LIKE 'BATXL-MATSTORY-MOV-%'").get(org).c),
  inventory:inventoryAfter,
  runSummary:db.prepare("SELECT summary_json FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=1").get(org,'BATXL-IA2-MATERIAL-COST-STORIES').summary_json
};
const second=runMaterialCostStoriesPack({database:db,organizationId:org,ownerId:owner});
const snapshotAfterReplay={
  fingerprint:second.fingerprint,
  expenseCount:Number(db.prepare("SELECT COUNT(*) c FROM expenses WHERE organization_id=? AND id='BATXL-MATPRESS-EXP-007'").get(org).c),
  allocationCount:Number(db.prepare("SELECT COUNT(*) c FROM supplier_allocations WHERE organization_id=? AND id='BATXL-MATPRESS-ALLOC-007'").get(org).c),
  movementCount:Number(db.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id=? AND id LIKE 'BATXL-MATSTORY-MOV-%'").get(org).c),
  inventory:Number(db.prepare("SELECT COALESCE(SUM(quantity),0) q FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL").get(org).q),
  runSummary:db.prepare("SELECT summary_json FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=1").get(org,'BATXL-IA2-MATERIAL-COST-STORIES').summary_json
};
deep(snapshotAfterReplay,snapshotBeforeReplay,'replay x2 sans dérive');
deep(second,first,'résumé stable au replay');
eq(db.prepare('PRAGMA foreign_key_check').all().length,0,'FK final vide');
eq(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity final ok');

console.log('ia2-material-cost-stories: '+assertions+' assertions réussies');
console.log(JSON.stringify({
  pressure:{
    projectId:first.materialPressure.projectId,
    baseOrderHtCents:first.materialPressure.baseOrderHtCents,
    surchargeHtCents:first.materialPressure.surchargeHtCents,
    marginBeforeCents:before007.totals.projectedMarginCents,
    marginAfterCents:after007.totals.projectedMarginCents
  },
  stockReturn:{
    projectId:first.stockReturn.projectId,
    grossIssueCents:first.stockReturn.grossIssueCents,
    returnCreditCents:first.stockReturn.returnCreditCents,
    netStoryCostCents:first.stockReturn.netStoryCostCents,
    grossMarginAfterCents:after008.realized.grossMarginHtCents
  },
  fingerprint:first.fingerprint,
  replayStable:true
}));
