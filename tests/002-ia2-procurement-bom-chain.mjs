import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {collectCausalNeeds,runProcurementBomChainPack} from '../scripts/simulation/batinova-xl/procurement-bom-chain-pack.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-09-29T20:30:00.000Z';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .run('batxl-org','BatiNova XL','BatiNova XL','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run('batxl-owner','Marc','Delcourt','marc@simulation.invalid',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)')
  .run('batxl-owner-role','batxl-org','OWNER','Owner',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run('batxl-owner-member','batxl-org','batxl-owner','batxl-owner-role','active',stamp,stamp,stamp);
db.prepare("INSERT INTO suppliers(id,organization_id,name,email,country,default_expense_category,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,'materials',30,?,?)")
  .run('BATXL-SUP-01','batxl-org','Fournisseur BATXL','supplier@simulation.invalid','BE',stamp,stamp);
db.prepare("INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?, 'active',?,?,?,?)")
  .run('BATXL-LOC-01','batxl-org','Dépôt BATXL','warehouse','batxl-owner',stamp,'batxl-owner',stamp);

for(let i=1;i<=100;i++){
  db.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,0,0,?,?,?,?,?,?,?, ?,?)')
    .run('BATXL-STK-ID-'+String(i).padStart(3,'0'),'batxl-org','BATXL-STK-'+String(i).padStart(3,'0'),'Stock générique '+i,'piece',100,5,'BATXL','','batxl-owner',stamp,'batxl-owner',stamp);
}

const materials=JSON.parse(readFileSync(new URL('../scripts/simulation/batinova-xl/materials-catalog-2026-09-29.json',import.meta.url),'utf8'));
const bom=JSON.parse(readFileSync(new URL('../scripts/simulation/batinova-xl/bom-templates-2026-09-29.json',import.meta.url),'utf8'));
const realBomTemplateId=String(bom.templates?.[0]?.id||'');
assert.ok(realBomTemplateId.startsWith('BATXL-BOM-'));
const priced=(materials.benchmarks||[]).filter(item=>Number.isFinite(Number(item.price))).slice(0,4);
assert.equal(priced.length,4);
const ht=item=>Number((item.vatIncluded?Number(item.price)/1.21:Number(item.price)).toFixed(4));
const line=(item,qty,extra={})=>({
  ref:item.code,
  label:item.label,
  qty,
  unit:item.unit,
  price:ht(item),
  vatRate:21,
  source:item.source,
  sourcePriceObserved:item.price,
  sourceVatIncluded:item.vatIncluded,
  supplierQuoteRequired:false,
  quantitySource:'BATXL test takeoff',
  bomTemplateId:realBomTemplateId,
  simulation:true,
  ...extra
});

const state={
  version:3,
  company:{name:'BatiNova XL'},
  contacts:[],
  purchaseOrders:[],
  jobs:[
    {id:'BATXL-PRJ-001',reference:'BATXL-PRJ-001',name:'Toiture test',status:'active',financialStory:'healthy_margin'},
    {id:'BATXL-PRJ-002',reference:'BATXL-PRJ-002',name:'Chantier terminé',status:'completed',financialStory:'completed_paid'},
    {id:'BATXL-PRJ-009',reference:'BATXL-PRJ-009',name:'En attente client',status:'waiting',financialStory:'waiting_on_client_decision'}
  ],
  quotes:[
    {
      id:'BATXL-Q-001',ref:'DEV-BATXL-001',title:'Offre principale — Toiture test',job:'BATXL-PRJ-001',status:'accepté',
      lines:[line(priced[0],12),line(priced[1],4),line(priced[3],2,{supplierQuoteRequired:true,price:0})]
    },
    {
      id:'BATXL-Q-002',ref:'DEV-BATXL-002',title:'Offre principale — Chantier terminé',job:'BATXL-PRJ-002',status:'accepted',
      lines:[line(priced[1],3),line(priced[2],8)]
    },
    {
      id:'BATXL-Q-009',ref:'DEV-BATXL-009',title:'Offre principale — En attente client',job:'BATXL-PRJ-009',status:'envoyé',
      lines:[line(priced[0],99)]
    }
  ]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run('batxl-org',JSON.stringify(state),1,'batxl-owner',stamp,stamp);

let assertions=0;
const eq=(a,b,m)=>{assert.equal(a,b,m);assertions++};
const ok=(v,m)=>{assert.ok(v,m);assertions++};
const deep=(a,b,m)=>{assert.deepEqual(a,b,m);assertions++};

const needs=collectCausalNeeds(state);
eq(needs.length,4,'4 lignes matière pricées sur devis acceptés');
eq(new Set(needs.map(n=>n.code)).size,3,'3 codes catalogue uniques');
ok(!needs.some(n=>n.code===priced[3].code),'ligne supplierQuoteRequired exclue');
ok(!needs.some(n=>n.projectId==='BATXL-PRJ-009'),'devis non accepté exclu');

const first=runProcurementBomChainPack({database:db,organizationId:'batxl-org',ownerId:'batxl-owner'});
eq(first.acceptedProjects,2,'2 projets acceptés matérialisés');
eq(first.uniqueMaterialCodes,3,'3 références catalogue mappées');
eq(Number(first.purchaseOrders),2,'2 commandes causales');
eq(Number(first.deliveryNotes),2,'2 BL causaux');
eq(Number(first.supplierInvoices),2,'2 factures fournisseur causales');
eq(Number(first.stockMovements),8,'entrée + sortie pour 4 lignes matière');
eq(first.integrity.foreignKeyViolations,0,'FK check vide');
eq(first.integrity.integrityCheck,'ok','integrity check ok');

eq(Number(db.prepare("SELECT COUNT(*) c FROM field_stock_items WHERE organization_id='batxl-org'").get().c),100,'stock reste à 100 références');
eq(Number(db.prepare("SELECT COUNT(*) c FROM field_stock_items WHERE organization_id='batxl-org' AND reference IN (?,?,?)").get(priced[0].code,priced[1].code,priced[2].code).c),3,'3 références génériques remappées au catalogue');
eq(Number(db.prepare("SELECT COUNT(*) c FROM field_stock_items WHERE organization_id='batxl-org' AND reference=?").get(priced[3].code).c),0,'supplierQuoteRequired non inventé en stock');

const payload=JSON.parse(db.prepare("SELECT payload FROM organization_workspace_state WHERE organization_id='batxl-org'").get().payload);
const causalOrders=(payload.purchaseOrders||[]).filter(o=>String(o.id).startsWith('BATXL-BOMPROC-PO-'));
eq(causalOrders.length,2,'2 BC présents dans le workspace');
ok(causalOrders.every(o=>(o.lines||[]).every(l=>l.bomTemplateId===realBomTemplateId)),'traçabilité vers un vrai template BOM conservée');
ok(causalOrders.every(o=>(o.lines||[]).every(l=>l.catalogSource)),'source catalogue conservée');

eq(Number(db.prepare("SELECT COUNT(*) c FROM supplier_allocations WHERE organization_id='batxl-org' AND id LIKE 'BATXL-BOMPROC-ALLOC-%' AND destination_type='stock'").get().c),2,'coût fournisseur affecté au stock');
eq(Number(db.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id='batxl-org' AND id LIKE 'BATXL-BOMPROC-MOV-OUT-%' AND project_id IN ('BATXL-PRJ-001','BATXL-PRJ-002')").get().c),4,'sorties chantier portent le coût projet');
eq(Number(db.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id='batxl-org' AND project_id='BATXL-PRJ-009' AND id LIKE 'BATXL-BOMPROC-%'").get().c),0,'aucun achat/stock pour projet waiting sans devis accepté');
ok(first.links.every(link=>link.orderedHtCents>0&&link.consumedHtCents>0),'montants commandés et consommés positifs');

const beforeReplay={
  fingerprint:first.fingerprint,
  revision:Number(db.prepare("SELECT revision FROM organization_workspace_state WHERE organization_id='batxl-org'").get().revision),
  orders:Number(first.purchaseOrders),
  deliveries:Number(first.deliveryNotes),
  movements:Number(first.stockMovements),
  invoices:Number(first.supplierInvoices)
};
const second=runProcurementBomChainPack({database:db,organizationId:'batxl-org',ownerId:'batxl-owner'});
const afterReplay={
  fingerprint:second.fingerprint,
  revision:Number(db.prepare("SELECT revision FROM organization_workspace_state WHERE organization_id='batxl-org'").get().revision),
  orders:Number(second.purchaseOrders),
  deliveries:Number(second.deliveryNotes),
  movements:Number(second.stockMovements),
  invoices:Number(second.supplierInvoices)
};
deep(afterReplay,beforeReplay,'replay x2 sans dérive ni duplication');
eq(db.prepare('PRAGMA foreign_key_check').all().length,0,'FK final vide');
eq(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity final ok');

console.log('ia2-procurement-bom-chain: '+assertions+' assertions réussies');
console.log(JSON.stringify({
  acceptedProjects:first.acceptedProjects,
  uniqueMaterialCodes:first.uniqueMaterialCodes,
  purchaseOrders:Number(first.purchaseOrders),
  deliveryNotes:Number(first.deliveryNotes),
  stockMovements:Number(first.stockMovements),
  supplierInvoices:Number(first.supplierInvoices),
  fingerprint:first.fingerprint
}));
