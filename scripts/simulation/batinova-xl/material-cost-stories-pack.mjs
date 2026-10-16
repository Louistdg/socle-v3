import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../../..');
const DEFAULT_DB=join(ROOT,'data','socle.sqlite');
const STAMP='2026-09-30T04:45:00.000Z';
const PACK_CODE='BATXL-IA2-MATERIAL-COST-STORIES';
const PACK_VERSION=1;
const PRESSURE_PROJECT='BATXL-PRJ-007';
const RETURN_PROJECT='BATXL-PRJ-008';
const SURCHARGE_RATE_BPS=1500;
const STAGE_RATIO=0.50;
const RETURN_RATIO=0.80;

const round=(value,digits=3)=>Number(Number(value||0).toFixed(digits));
const plusDays=(date,days)=>{const d=new Date(String(date)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};

function ownerIdFor(database,organizationId,ownerId){
  if(ownerId)return String(ownerId);
  return String(database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId)?.user_id||'');
}
function workspace(database,organizationId){
  return organizationId?database.prepare('SELECT organization_id,payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId):database.prepare("SELECT organization_id,payload FROM organization_workspace_state WHERE payload LIKE '%BatiNova%' ORDER BY organization_id LIMIT 1").get();
}
function projectBySourceId(state,sourceId){
  return (state.jobs||[]).find(project=>String(project.sourceScenarioId||project.id)===String(sourceId))||null;
}
function procurementOrder(state,projectId){
  return (state.purchaseOrders||[]).filter(order=>String(order.job||'')===String(projectId)).filter(order=>String(order.id||'').startsWith('BATXL-BOMPROC-PO-')).sort((a,b)=>String(a.id).localeCompare(String(b.id)))[0]||null;
}
function orderNetCents(order){
  const direct=Number(order?.netCents);if(Number.isFinite(direct)&&direct>0)return Math.round(direct);
  return (order?.lines||[]).reduce((sum,line)=>Number.isFinite(Number(line.netCents))?sum+Math.round(Number(line.netCents)):sum+Math.round(Math.max(0,Number(line.quantity||0))*Math.max(0,Number(line.unitPriceCents||0))),0);
}

function createPressureExpense(database,{organizationId,ownerId,state}){
  const project=projectBySourceId(state,PRESSURE_PROJECT);
  if(!project||String(project.financialStory||'')!=='material_cost_pressure')throw Error('BATXL material stories: PRJ-007 material_cost_pressure introuvable.');
  const projectId=String(project.id);
  const order=procurementOrder(state,projectId);
  if(!order)throw Error('BATXL material stories: BC causal PRJ-007 introuvable. Exécuter procurement-bom-chain avant ce pack.');
  const supplierId=String(order.supplierId||'');
  if(!supplierId||!database.prepare('SELECT 1 FROM suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL').get(organizationId,supplierId))throw Error('BATXL material stories: fournisseur PRJ-007 introuvable.');
  const baseOrderHtCents=orderNetCents(order);
  if(baseOrderHtCents<=0)throw Error('BATXL material stories: montant BC PRJ-007 invalide.');
  const surchargeHtCents=Math.max(1000,Math.round(baseOrderHtCents*SURCHARGE_RATE_BPS/10000));
  const vatCents=Math.round(surchargeHtCents*.21);
  const expenseId='BATXL-MATPRESS-EXP-007',idempotencyKey='BATXL-MATPRESS-EXP-OP-007';
  const delivery=database.prepare('SELECT id,delivery_date FROM field_delivery_notes WHERE organization_id=? AND order_id=? ORDER BY delivery_date,id LIMIT 1').get(organizationId,String(order.id));
  const expenseDate=delivery?.delivery_date||plusDays(order.expectedDate||order.date||'2026-09-15',2);
  if(!database.prepare('SELECT 1 FROM expenses WHERE organization_id=? AND id=?').get(organizationId,expenseId)){
    database.prepare("INSERT INTO expenses(id,organization_id,supplier_id,project_id,legacy_project_id,purchase_order_id,delivery_note_id,category,description,expense_date,due_date,currency,subtotal_cents,vat_amount_cents,vat_rate_bps,total_cents,payment_status,payment_date,document_name,created_by,created_at,updated_at,supplier_reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(expenseId,organizationId,supplierId,null,projectId,null,null,'materials','BATXL variation fournisseur +15% liée au BC '+String(order.number||order.id),expenseDate,plusDays(expenseDate,30),'EUR',surchargeHtCents,vatCents,2100,surchargeHtCents+vatCents,'unpaid',null,'BATXL-MATPRESS-007.pdf',ownerId,STAMP,STAMP,'BATXL-MATPRESS-007|BC:'+String(order.id),idempotencyKey);
  }else{
    const row=database.prepare('SELECT subtotal_cents,purchase_order_id,legacy_project_id,supplier_reference FROM expenses WHERE organization_id=? AND id=?').get(organizationId,expenseId);
    if(Number(row.subtotal_cents)!==surchargeHtCents||row.purchase_order_id!==null||String(row.legacy_project_id)!==projectId||String(row.supplier_reference)!=='BATXL-MATPRESS-007|BC:'+String(order.id))throw Error('BATXL material stories: dérive surcharge PRJ-007 détectée.');
  }
  const allocationId='BATXL-MATPRESS-ALLOC-007',allocationKey='BATXL-MATPRESS-ALLOC-OP-007';
  const existing=database.prepare('SELECT destination_type,destination_id,amount_cents,reference FROM supplier_allocations WHERE organization_id=? AND idempotency_key=?').get(organizationId,allocationKey);
  if(!existing){
    database.prepare("INSERT INTO supplier_allocations(id,organization_id,expense_id,destination_type,destination_id,amount_cents,label,note,reference,idempotency_key,status,created_by,created_at,cancellation_reason) VALUES(?,?,?,?,?,?,?,?,?,?,'active',?,?,?)").run(allocationId,organizationId,expenseId,'project',projectId,surchargeHtCents,'BATXL variation fournisseur','Surcharge +15% liée au BC '+String(order.id),String(order.id),allocationKey,ownerId,STAMP,'');
  }else if(existing.destination_type!=='project'||String(existing.destination_id)!==projectId||Number(existing.amount_cents)!==surchargeHtCents||String(existing.reference)!==String(order.id))throw Error('BATXL material stories: dérive allocation surcharge PRJ-007 détectée.');
  return {projectId,sourceScenarioId:PRESSURE_PROJECT,financialStory:String(project.financialStory),purchaseOrderId:String(order.id),baseOrderHtCents,surchargeRateBasisPoints:SURCHARGE_RATE_BPS,surchargeHtCents,expenseId,allocationId};
}

function createStockReturnStory(database,{organizationId,ownerId,state}){
  const project=projectBySourceId(state,RETURN_PROJECT);
  if(!project||String(project.financialStory||'')!=='good_margin_with_stock_return')throw Error('BATXL material stories: PRJ-008 good_margin_with_stock_return introuvable.');
  const projectId=String(project.id);
  const original=database.prepare("SELECT m.id,m.stock_item_id,m.movement_date,m.quantity,m.unit_cost_cents,m.source_location_id,s.reference FROM field_stock_movements m JOIN field_stock_items s ON s.organization_id=m.organization_id AND s.id=m.stock_item_id WHERE m.organization_id=? AND m.project_id=? AND m.movement_type='sortie chantier' AND m.id LIKE 'BATXL-BOMPROC-MOV-OUT-%' ORDER BY m.id LIMIT 1").get(organizationId,projectId);
  if(!original)throw Error('BATXL material stories: sortie procurement PRJ-008 introuvable. Exécuter procurement-bom-chain avant ce pack.');
  if(!original.source_location_id)throw Error('BATXL material stories: emplacement source sortie PRJ-008 manquant.');
  const projectLocationId='BATXL-MATSTORY-LOC-PRJ008';
  database.prepare("INSERT OR IGNORE INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?, 'active',?,?,?,?)").run(projectLocationId,organizationId,'Chantier PRJ-008 — stock temporaire','project',ownerId,STAMP,ownerId,STAMP);
  const issueId='BATXL-MATSTORY-MOV-ISSUE-008',issueKey='BATXL-MATSTORY-MOV-OP-ISSUE-008',returnId='BATXL-MATSTORY-MOV-RETURN-008',returnKey='BATXL-MATSTORY-MOV-OP-RETURN-008';
  let issue=database.prepare('SELECT quantity,unit_cost_cents,movement_date,project_id FROM field_stock_movements WHERE organization_id=? AND idempotency_key=?').get(organizationId,issueKey);
  if(!issue){
    const desired=round(Number(original.quantity)*STAGE_RATIO,3);
    const balance=Number(database.prepare('SELECT quantity FROM stock_balances WHERE organization_id=? AND stock_item_id=? AND location_id=?').get(organizationId,String(original.stock_item_id),String(original.source_location_id))?.quantity||0);
    const quantity=round(Math.min(desired,balance),3);if(quantity<=0)throw Error('BATXL material stories: stock disponible insuffisant pour PRJ-008.');
    const movementDate=plusDays(original.movement_date,2);
    database.prepare('INSERT INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,origin,destination,project_id,reason,unit_cost_cents,created_by,created_at,source_location_id,destination_location_id,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(issueId,organizationId,String(original.stock_item_id),movementDate,'sortie chantier',quantity,'BATXL dépôt','BATXL chantier',projectId,'BATXL lot complémentaire PRJ-008',Number(original.unit_cost_cents),ownerId,STAMP,String(original.source_location_id),projectLocationId,issueId,issueKey);
    issue={quantity,unit_cost_cents:Number(original.unit_cost_cents),movement_date:movementDate,project_id:projectId};
  }else if(String(issue.project_id)!==projectId)throw Error('BATXL material stories: dérive projet sortie PRJ-008 détectée.');
  let returned=database.prepare('SELECT quantity,unit_cost_cents,project_id FROM field_stock_movements WHERE organization_id=? AND idempotency_key=?').get(organizationId,returnKey);
  if(!returned){
    const quantity=round(Number(issue.quantity)*RETURN_RATIO,3);if(quantity<=0)throw Error('BATXL material stories: quantité retour PRJ-008 invalide.');
    database.prepare('INSERT INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,origin,destination,project_id,reason,unit_cost_cents,created_by,created_at,source_location_id,destination_location_id,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(returnId,organizationId,String(original.stock_item_id),plusDays(issue.movement_date,1),'retour chantier',quantity,'BATXL chantier','BATXL dépôt',projectId,'BATXL retour surplus PRJ-008',Number(issue.unit_cost_cents),ownerId,STAMP,projectLocationId,String(original.source_location_id),returnId,returnKey);
    returned={quantity,unit_cost_cents:Number(issue.unit_cost_cents),project_id:projectId};
  }else if(String(returned.project_id)!==projectId)throw Error('BATXL material stories: dérive projet retour PRJ-008 détectée.');
  const unitCostCents=Number(issue.unit_cost_cents),grossIssueCents=Math.round(Number(issue.quantity)*unitCostCents),returnCreditCents=Math.round(Number(returned.quantity)*unitCostCents),netStoryCostCents=Math.round((Number(issue.quantity)-Number(returned.quantity))*unitCostCents);
  return {projectId,sourceScenarioId:RETURN_PROJECT,financialStory:String(project.financialStory),stockItemId:String(original.stock_item_id),stockReference:String(original.reference||''),originalConsumptionMovementId:String(original.id),projectLocationId,issueMovementId:issueId,returnMovementId:returnId,issueQuantity:Number(issue.quantity),returnedQuantity:Number(returned.quantity),grossIssueCents,returnCreditCents,netStoryCostCents};
}

function fingerprint(database,organizationId){
  const payload={pressure:database.prepare("SELECT id,legacy_project_id,purchase_order_id,subtotal_cents,total_cents,supplier_reference,idempotency_key FROM expenses WHERE organization_id=? AND id='BATXL-MATPRESS-EXP-007'").all(organizationId),pressureAllocations:database.prepare("SELECT id,expense_id,destination_type,destination_id,amount_cents,reference,idempotency_key FROM supplier_allocations WHERE organization_id=? AND id='BATXL-MATPRESS-ALLOC-007' ORDER BY id").all(organizationId),locations:database.prepare("SELECT id,name,type,status FROM stock_locations WHERE organization_id=? AND id='BATXL-MATSTORY-LOC-PRJ008'").all(organizationId),movements:database.prepare("SELECT id,stock_item_id,movement_type,quantity,project_id,unit_cost_cents,source_location_id,destination_location_id,idempotency_key FROM field_stock_movements WHERE organization_id=? AND id LIKE 'BATXL-MATSTORY-MOV-%' ORDER BY id").all(organizationId)};
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
function persistRun(database,organizationId,ownerId,summary){database.prepare("INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json").run('BATXL-RUN-IA2-MATERIAL-STORIES-V1',organizationId,PACK_CODE,PACK_VERSION,STAMP,ownerId,JSON.stringify(summary));}

export function runMaterialCostStoriesPack({database,organizationId,ownerId}={}){
  const ownDatabase=!database,db=database||new DatabaseSync(DEFAULT_DB);db.exec('PRAGMA foreign_keys=ON');
  const ws=workspace(db,organizationId);if(!ws)throw Error('BATXL material stories: workspace BatiNova introuvable.');
  organizationId=String(ws.organization_id);const state=JSON.parse(ws.payload);if(!/BatiNova/i.test(String(state.company?.name||'')))throw Error('BATXL material stories: société non BatiNova.');
  ownerId=ownerIdFor(db,organizationId,ownerId);if(!ownerId)throw Error('BATXL material stories: OWNER actif introuvable.');
  db.exec('BEGIN IMMEDIATE');
  try{
    const materialPressure=createPressureExpense(db,{organizationId,ownerId,state}),stockReturn=createStockReturnStory(db,{organizationId,ownerId,state});
    const summary={pack:PACK_CODE,version:PACK_VERSION,organizationId,materialPressure,stockReturn,integrity:{foreignKeyViolations:db.prepare('PRAGMA foreign_key_check').all().length,integrityCheck:db.prepare('PRAGMA integrity_check').get().integrity_check},fingerprint:fingerprint(db,organizationId)};
    persistRun(db,organizationId,ownerId,summary);db.exec('COMMIT');if(ownDatabase)db.close();return summary;
  }catch(error){db.exec('ROLLBACK');if(ownDatabase)db.close();throw error;}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const database=new DatabaseSync(process.env.BATXL_DB_PATH||DEFAULT_DB);
  try{console.log(JSON.stringify(runMaterialCostStoriesPack({database,organizationId:process.env.BATXL_ORGANIZATION_ID||undefined,ownerId:process.env.BATXL_OWNER_ID||undefined}),null,2));}finally{database.close();}
}