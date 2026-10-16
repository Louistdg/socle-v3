import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../../..');
const DEFAULT_DB=join(ROOT,'data','socle.sqlite');
const STAMP='2026-09-29T20:30:00.000Z';
const PACK_CODE='BATXL-IA2-BOM-PROCUREMENT-CHAIN';
const MATERIALS=JSON.parse(readFileSync(new URL('./materials-catalog-2026-09-29.json',import.meta.url),'utf8'));
const MATERIAL_BY_CODE=new Map((MATERIALS.benchmarks||[]).map(item=>[String(item.code),item]));

const norm=v=>String(v??'').trim().toLocaleLowerCase('fr');
const accepted=status=>['accepté','accepte','accepted'].includes(norm(status));
const cents=v=>Math.round(Number(v||0)*100);
const round=(v,d=3)=>Number(Number(v||0).toFixed(d));
const pad=(n,w=3)=>String(n).padStart(w,'0');
const plusDays=(date,days)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};

function primaryAcceptedQuotes(state){
  return (state.quotes||[])
    .filter(q=>accepted(q.status))
    .filter(q=>String(q.title||'').startsWith('Offre principale'))
    .sort((a,b)=>String(a.job).localeCompare(String(b.job))||String(a.id).localeCompare(String(b.id)));
}

function materialLines(quote){
  return (quote.lines||[]).filter(line=>{
    const code=String(line.ref||'');
    return Boolean(MATERIAL_BY_CODE.get(code))
      && !line.supplierQuoteRequired
      && Number(line.qty)>0
      && Number(line.price)>0;
  });
}

function fingerprintPayload(database,organizationId,state){
  return {
    orders:(state.purchaseOrders||[]).filter(o=>String(o.id).startsWith('BATXL-BOMPROC-PO-')).map(o=>[
      o.id,o.job,o.status,(o.lines||[]).map(l=>[l.ref,l.quantity,l.unitPriceCents])
    ]),
    deliveryNotes:database.prepare("SELECT id,order_id,project_id,delivery_date,status FROM field_delivery_notes WHERE organization_id=? AND id LIKE 'BATXL-BOMPROC-BL-%' ORDER BY id").all(organizationId),
    movements:database.prepare("SELECT id,stock_item_id,movement_type,quantity,project_id,unit_cost_cents FROM field_stock_movements WHERE organization_id=? AND id LIKE 'BATXL-BOMPROC-MOV-%' ORDER BY id").all(organizationId),
    expenses:database.prepare("SELECT id,purchase_order_id,delivery_note_id,subtotal_cents,total_cents FROM expenses WHERE organization_id=? AND id LIKE 'BATXL-BOMPROC-EXP-%' ORDER BY id").all(organizationId)
  };
}

function fingerprint(database,organizationId,state){
  return createHash('sha256').update(JSON.stringify(fingerprintPayload(database,organizationId,state))).digest('hex');
}

function ensureOwnerId(database,organizationId,ownerId){
  if(ownerId)return ownerId;
  return database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId)?.user_id||null;
}

function mapCatalogToExistingStock(database,organizationId,actor,needs){
  const all=database.prepare("SELECT id,reference,name,unit,unit_cost_cents FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL ORDER BY CASE WHEN reference LIKE 'BATXL-STK-%' THEN 0 ELSE 1 END,reference,id").all(organizationId);
  const byReference=new Map(all.map(row=>[String(row.reference),row]));
  const generic=all.filter(row=>String(row.reference||'').startsWith('BATXL-STK-'));
  let genericIndex=0;
  const mapped=new Map();
  for(const need of needs){
    const code=need.code;
    if(mapped.has(code))continue;
    let row=byReference.get(code);
    if(!row){
      while(genericIndex<generic.length&&mapped.has(String(generic[genericIndex].reference)))genericIndex++;
      row=generic[genericIndex++];
      if(!row)throw new Error('BATXL BOMPROC: pas assez de références stock existantes pour mapper '+code);
      database.prepare('UPDATE field_stock_items SET reference=?,name=?,unit=?,unit_cost_cents=?,supplier=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?')
        .run(code,need.label,need.unit,need.unitCostCents,'BATXL catalog '+String(need.source||''),actor,STAMP,organizationId,row.id);
      row={...row,reference:code,name:need.label,unit:need.unit,unit_cost_cents:need.unitCostCents};
      byReference.set(code,row);
    }
    mapped.set(code,row);
  }
  return mapped;
}

function createMovement(database,{id,key,organizationId,stockItemId,date,type,quantity,projectId,reason,unitCostCents,actor,sourceLocationId=null,destinationLocationId=null}){
  if(database.prepare('SELECT 1 FROM field_stock_movements WHERE organization_id=? AND idempotency_key=?').get(organizationId,key))return false;
  database.prepare('INSERT INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,origin,destination,project_id,reason,unit_cost_cents,created_by,created_at,source_location_id,destination_location_id,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,organizationId,stockItemId,date,type,quantity,'BATXL BOM','BATXL BOM',projectId,reason,unitCostCents,actor,STAMP,sourceLocationId,destinationLocationId,id,key);
  return true;
}

export function collectCausalNeeds(state){
  const projects=new Map((state.jobs||[]).map(p=>[String(p.id),p]));
  const rows=[];
  for(const quote of primaryAcceptedQuotes(state)){
    const project=projects.get(String(quote.job));
    if(!project)continue;
    for(const line of materialLines(quote)){
      const material=MATERIAL_BY_CODE.get(String(line.ref));
      rows.push({
        projectId:String(project.id),
        projectReference:String(project.reference||project.id),
        projectStatus:String(project.status||''),
        financialStory:String(project.financialStory||''),
        quoteId:String(quote.id),
        quoteRef:String(quote.ref||quote.id),
        code:String(line.ref),
        label:String(line.label||material?.label||line.ref),
        unit:String(line.unit||material?.unit||'unit'),
        quantity:round(Number(line.qty),3),
        unitCostCents:cents(line.price),
        bomTemplateId:String(line.bomTemplateId||''),
        quantitySource:String(line.quantitySource||''),
        source:String(line.source||material?.source||''),
        sourcePriceObserved:Number(line.sourcePriceObserved??material?.price??0),
        sourceVatIncluded:line.sourceVatIncluded??material?.vatIncluded??null
      });
    }
  }
  return rows;
}

export function runProcurementBomChainPack({database,organizationId,ownerId}={}){
  const ownDatabase=!database;
  const db=database||new DatabaseSync(DEFAULT_DB);
  db.exec('PRAGMA foreign_keys=ON');

  let ws;
  if(organizationId)ws=db.prepare('SELECT organization_id,payload,revision FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  else ws=db.prepare("SELECT organization_id,payload,revision FROM organization_workspace_state WHERE payload LIKE '%BatiNova%' ORDER BY organization_id LIMIT 1").get();
  if(!ws)throw new Error('BATXL BOMPROC: workspace BatiNova introuvable.');
  organizationId=String(ws.organization_id);
  let state=JSON.parse(ws.payload);
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw new Error('BATXL BOMPROC: société non BatiNova.');
  const actor=ensureOwnerId(db,organizationId,ownerId);
  if(!actor)throw new Error('BATXL BOMPROC: OWNER introuvable.');

  const causalNeeds=collectCausalNeeds(state);
  if(!causalNeeds.length)throw new Error('BATXL BOMPROC: aucun besoin matière pricé issu d’un devis principal accepté.');

  const uniqueNeeds=[...new Map(causalNeeds.map(n=>[n.code,n])).values()];
  const stockMap=mapCatalogToExistingStock(db,organizationId,actor,uniqueNeeds);
  const location=db.prepare("SELECT id FROM stock_locations WHERE organization_id=? AND status='active' ORDER BY CASE WHEN type='warehouse' THEN 0 ELSE 1 END,name,id LIMIT 1").get(organizationId);
  if(!location)throw new Error('BATXL BOMPROC: emplacement stock actif introuvable.');
  const supplierIds=db.prepare("SELECT id FROM suppliers WHERE organization_id=? AND archived_at IS NULL ORDER BY id").all(organizationId).map(r=>String(r.id));
  if(!supplierIds.length)throw new Error('BATXL BOMPROC: fournisseur relationnel introuvable.');

  const grouped=new Map();
  for(const need of causalNeeds){
    if(!grouped.has(need.projectId))grouped.set(need.projectId,[]);
    grouped.get(need.projectId).push(need);
  }

  state.purchaseOrders=Array.isArray(state.purchaseOrders)?state.purchaseOrders:[];
  const links=[];
  let index=0;
  for(const [projectId,lines] of [...grouped.entries()].sort(([a],[b])=>a.localeCompare(b))){
    index++;
    const project=(state.jobs||[]).find(p=>String(p.id)===projectId);
    const supplierId=supplierIds[(index-1)%supplierIds.length];
    const poId='BATXL-BOMPROC-PO-'+pad(index);
    const poOp='BATXL-BOMPROC-PO-OP-'+pad(index);
    const poLines=lines.map((line,lineIndex)=>{
      const net=line.quantity*line.unitCostCents;
      const vat=Math.round(net*.21);
      return {
        id:'BATXL-BOMPROC-POL-'+pad(index)+'-'+pad(lineIndex+1,2),
        reference:line.code,
        label:line.label,
        quantity:line.quantity,
        received:0,
        unit:line.unit,
        unitPrice:line.unitCostCents/100,
        unitPriceCents:line.unitCostCents,
        vatRate:21,
        netCents:Math.round(net),
        vatCents:vat,
        totalCents:Math.round(net)+vat,
        bomTemplateId:line.bomTemplateId,
        quantitySource:line.quantitySource,
        catalogSource:line.source,
        sourcePriceObserved:line.sourcePriceObserved,
        sourceVatIncluded:line.sourceVatIncluded,
        simulation:true
      };
    });
    const netCents=poLines.reduce((sum,line)=>sum+line.netCents,0);
    const vatCents=poLines.reduce((sum,line)=>sum+line.vatCents,0);
    let po=state.purchaseOrders.find(o=>String(o.id)===poId||String(o.operationKey||'')===poOp);
    if(!po){
      const orderDate=plusDays('2026-09-01',index-1);
      const expectedDate=plusDays(orderDate,3);
      po={
        id:poId,
        number:'BATXL-BOM-BC-'+pad(index),
        supplierId,
        date:orderDate,
        expectedDate,
        job:projectId,
        requester:'BATXL BOM procurement chain',
        status:'commandée',
        lines:poLines,
        operationKey:poOp,
        netCents,
        vatCents,
        totalCents:netCents+vatCents,
        netAmount:netCents/100,
        vatAmount:vatCents/100,
        totalAmount:(netCents+vatCents)/100,
        sourceQuoteId:lines[0].quoteId,
        sourceQuoteRef:lines[0].quoteRef,
        simulation:true,
        createdAt:STAMP,
        externalTransmission:'Bloquée — simulation'
      };
      state.purchaseOrders.push(po);
    }

    const blId='BATXL-BOMPROC-BL-'+pad(index);
    const blOp='BATXL-BOMPROC-BL-OP-'+pad(index);
    const story=String(project?.financialStory||'');
    const deliveryDate=story==='supplier_delay'?plusDays(po.expectedDate,6):plusDays(po.expectedDate,1);
    if(!db.prepare('SELECT 1 FROM field_delivery_notes WHERE organization_id=? AND idempotency_key=?').get(organizationId,blOp)){
      db.prepare("INSERT INTO field_delivery_notes(id,organization_id,order_id,supplier_id,project_id,number,delivery_date,receiver_person_id,receiver_name,comment,file_name,status,created_by,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(blId,organizationId,poId,supplierId,projectId,'BATXL-BOM-BL-'+pad(index),deliveryDate,null,'BATXL Simulation','Réception issue du besoin BOM','BATXL-BOM-BL-'+pad(index)+'.pdf','Reçue',actor,STAMP,blOp);
      for(let lineIndex=0;lineIndex<poLines.length;lineIndex++){
        const line=poLines[lineIndex];
        const stock=stockMap.get(line.reference);
        db.prepare('INSERT INTO field_delivery_lines(id,organization_id,delivery_note_id,order_line_id,reference,label,ordered,received,condition,difference,stock_item_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
          .run('BATXL-BOMPROC-BLL-'+pad(index)+'-'+pad(lineIndex+1,2),organizationId,blId,line.id,line.reference,line.label,line.quantity,line.quantity,'Conforme',0,stock.id);
        createMovement(db,{
          id:'BATXL-BOMPROC-MOV-IN-'+pad(index)+'-'+pad(lineIndex+1,2),
          key:'BATXL-BOMPROC-MOV-OP-IN-'+pad(index)+'-'+pad(lineIndex+1,2),
          organizationId,stockItemId:stock.id,date:deliveryDate,type:'entrée',quantity:line.quantity,projectId,
          reason:'BATXL BOM réception '+line.reference,unitCostCents:line.unitPriceCents,actor,destinationLocationId:String(location.id)
        });
      }
    }

    const consumptionRatio=String(project?.status)==='completed'?1:(String(project?.status)==='blocked'?0.35:0.65);
    let consumedCents=0;
    for(let lineIndex=0;lineIndex<poLines.length;lineIndex++){
      const line=poLines[lineIndex];
      const stock=stockMap.get(line.reference);
      const quantity=round(line.quantity*consumptionRatio,3);
      if(quantity<=0)continue;
      createMovement(db,{
        id:'BATXL-BOMPROC-MOV-OUT-'+pad(index)+'-'+pad(lineIndex+1,2),
        key:'BATXL-BOMPROC-MOV-OP-OUT-'+pad(index)+'-'+pad(lineIndex+1,2),
        organizationId,stockItemId:stock.id,date:plusDays(deliveryDate,2),type:'sortie chantier',quantity,projectId,
        reason:'BATXL BOM consommation '+line.reference,unitCostCents:line.unitPriceCents,actor,sourceLocationId:String(location.id)
      });
      consumedCents+=Math.round(quantity*line.unitPriceCents);
    }

    const expId='BATXL-BOMPROC-EXP-'+pad(index);
    const expOp='BATXL-BOMPROC-EXP-OP-'+pad(index);
    if(!db.prepare('SELECT 1 FROM expenses WHERE organization_id=? AND id=?').get(organizationId,expId)){
      db.prepare("INSERT INTO expenses(id,organization_id,supplier_id,project_id,legacy_project_id,purchase_order_id,delivery_note_id,category,description,expense_date,due_date,currency,subtotal_cents,vat_amount_cents,vat_rate_bps,total_cents,payment_status,payment_date,document_name,created_by,created_at,updated_at,supplier_reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(expId,organizationId,supplierId,null,null,poId,blId,'materials','BATXL BOM — '+String(project?.name||projectId),deliveryDate,plusDays(deliveryDate,30),'EUR',netCents,vatCents,2100,netCents+vatCents,'unpaid',null,'BATXL-BOM-FF-'+pad(index)+'.pdf',actor,STAMP,STAMP,'BATXL-BOM-FF-'+pad(index),expOp);
      db.prepare("INSERT INTO supplier_allocations(id,organization_id,expense_id,destination_type,destination_id,amount_cents,label,note,reference,idempotency_key,status,created_by,created_at,cancellation_reason) VALUES(?,?,?,?,?,?,?,?,?,?,'active',?,?,?)")
        .run('BATXL-BOMPROC-ALLOC-'+pad(index),organizationId,expId,'stock',null,netCents,'BATXL BOM stock','Coût fournisseur affecté au stock; coût projet porté par la sortie chantier','BATXL-BOM-FF-'+pad(index),'BATXL-BOMPROC-ALLOC-OP-'+pad(index),actor,STAMP,'');
    }

    links.push({
      projectId,
      projectReference:String(project?.reference||projectId),
      financialStory:story,
      quoteId:String(lines[0].quoteId),
      purchaseOrderId:poId,
      deliveryNoteId:blId,
      expenseId:expId,
      materialCodes:poLines.map(line=>line.reference),
      orderedHtCents:netCents,
      consumedHtCents:consumedCents,
      delayedDelivery:story==='supplier_delay'
    });
  }

  const nextPayload=JSON.stringify(state);
  if(nextPayload!==ws.payload){
    const result=db.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,source_user_id=?,updated_at=? WHERE organization_id=? AND revision=?')
      .run(nextPayload,actor,STAMP,organizationId,ws.revision);
    if(!result.changes)throw new Error('BATXL BOMPROC: conflit de révision workspace.');
  }
  state=JSON.parse(db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId).payload);

  const summary={
    pack:PACK_CODE,
    organizationId,
    sourceCatalog:MATERIALS.catalogCode,
    sourceObservedAt:MATERIALS.observedAt,
    acceptedProjects:links.length,
    uniqueMaterialCodes:uniqueNeeds.length,
    purchaseOrders:db.prepare("SELECT COUNT(*) c FROM json_each((SELECT payload FROM organization_workspace_state WHERE organization_id=?),'$.purchaseOrders') WHERE json_extract(value,'$.id') LIKE 'BATXL-BOMPROC-PO-%'").get(organizationId).c,
    deliveryNotes:db.prepare("SELECT COUNT(*) c FROM field_delivery_notes WHERE organization_id=? AND id LIKE 'BATXL-BOMPROC-BL-%'").get(organizationId).c,
    stockMovements:db.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id=? AND id LIKE 'BATXL-BOMPROC-MOV-%'").get(organizationId).c,
    supplierInvoices:db.prepare("SELECT COUNT(*) c FROM expenses WHERE organization_id=? AND id LIKE 'BATXL-BOMPROC-EXP-%'").get(organizationId).c,
    links,
    integrity:{
      foreignKeyViolations:db.prepare('PRAGMA foreign_key_check').all().length,
      integrityCheck:db.prepare('PRAGMA integrity_check').get().integrity_check
    },
    fingerprint:fingerprint(db,organizationId,state)
  };

  if(ownDatabase)db.close();
  return summary;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const database=new DatabaseSync(process.env.BATXL_DB_PATH||DEFAULT_DB);
  try{
    console.log(JSON.stringify(runProcurementBomChainPack({
      database,
      organizationId:process.env.BATXL_ORGANIZATION_ID||undefined,
      ownerId:process.env.BATXL_OWNER_ID||undefined
    }),null,2));
  }finally{
    database.close();
  }
}
