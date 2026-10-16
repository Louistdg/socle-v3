import { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const arg=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3) ?? null;
const flags=new Set(process.argv.filter(value=>value.startsWith('--')&&!value.includes('=')));
const databasePath=resolve(arg('db')||process.env.SOCLE_QA_DB||join(root,'data','socle.sqlite'));
const requestedOrganization=arg('organization')||process.env.SOCLE_QA_ORGANIZATION_ID||'';
const baseUrl=(arg('base-url')||process.env.SOCLE_QA_BASE_URL||'').replace(/\/$/,'');
if(baseUrl){const host=new URL(baseUrl).hostname;if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('BATXL QA refuse tout appel réseau non local. Utilisez uniquement le serveur SOCLE local.')}
const ownerEmail=arg('owner-email')||process.env.SOCLE_QA_OWNER_EMAIL||'direction@batinova.example';
const workerEmail=arg('worker-email')||process.env.SOCLE_QA_WORKER_EMAIL||'anthony.simon@batinova.example';
const expectedFingerprint=arg('expect-fingerprint')||process.env.BATXL_EXPECT_FINGERPRINT||'';
const reportOnly=flags.has('--report-only');
const jsonOnly=flags.has('--json');
const strictTargets=flags.has('--require-targets');
const packsOnly=flags.has('--packs-only');

if(Number(process.versions.node.split('.')[0])<22){
  console.error(`BATXL QA: Node 22+ requis, runtime actuel ${process.versions.node}.`);
  process.exit(1);
}

const packDir=here;
const packs=existsSync(packDir)?readdirSync(packDir).filter(name=>name.endsWith('.mjs')).sort():[];
const expectedPacks=['core-clients-projects-commercial-pack.mjs','finance-stock-pack.mjs','client-finance-stories-pack.mjs','assets-fleet-pack.mjs','procurement-bom-chain-pack.mjs','planning-people-pack.mjs','labor-cost-baseline-pack.mjs','material-cost-stories-pack.mjs','documents-pack.mjs','field-operations-stories-pack.mjs','integrity-volume-pack.mjs','manifest.mjs','qa-report.mjs','batinova-script3.mjs'];
const packsIntegrated=expectedPacks.map(name=>({name,present:packs.includes(name)}));
const missingPacks=packsIntegrated.filter(item=>!item.present).map(item=>item.name);
if(missingPacks.length){
  console.error(`BATXL QA packs.presence: FAIL — packs manquants: ${missingPacks.join(', ')}`);
  if(packsOnly||!reportOnly)process.exit(1);
}
if(packsOnly){
  console.log(JSON.stringify({check:'packs.presence',status:'PASS',packsIntegrated},null,2));
  process.exit(0);
}

const calibrationPath=join(here,'reference-data-2026-09-29.json');
if(!existsSync(calibrationPath)){
  console.error(`BATXL QA calibration.presence: FAIL — source gelée absente: ${calibrationPath}`);
  process.exit(1);
}
const calibration=JSON.parse(readFileSync(calibrationPath,'utf8'));
const profile=calibration?.missingSimulationTargets;
if(calibration?.datasetCode!=='BATXL-REFERENCE-DATA-2026-09-29'||!profile){
  console.error('BATXL QA calibration.validity: FAIL — référence BatiNova XL invalide ou incomplète.');
  process.exit(1);
}

if(!existsSync(databasePath)){
  console.error(`BATXL QA: base SQLite introuvable: ${databasePath}`);
  process.exit(1);
}

const database=new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys=ON');
database.exec('PRAGMA query_only=ON');

const checks=[];
const anomalies=[];
const performanceRows=[];
const tables=new Set(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>String(row.name)));
const quoteIdent=name=>'"'+String(name).replaceAll('"','""')+'"';
const hasTable=name=>tables.has(name);
const columnsCache=new Map();
function columns(name){
  if(!hasTable(name))return [];
  if(!columnsCache.has(name))columnsCache.set(name,database.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all().map(row=>String(row.name)));
  return columnsCache.get(name);
}
const hasColumn=(table,column)=>columns(table).includes(column);
function scalar(sql,params=[]){const row=database.prepare(sql).get(...params);return row?Number(Object.values(row)[0]??0):0}
function countTable(table,where='',params=[]){
  if(!hasTable(table))return 0;
  return scalar(`SELECT COUNT(*) count FROM ${quoteIdent(table)}${where?` WHERE ${where}`:''}`,params);
}
function addCheck(name,status,detail,extra={}){checks.push({name,status,detail,...extra})}
function timed(name,fn){const start=performance.now();const value=fn();const ms=Number((performance.now()-start).toFixed(2));performanceRows.push({name,ms,status:ms>1500?'FAIL':ms>500?'SLOW':'PASS'});return value}
function parseJson(value,fallback=null){try{return JSON.parse(String(value))}catch{return fallback}}

let workspace=null;
let organizationId=requestedOrganization;
if(hasTable('organization_workspace_state')){
  const rows=database.prepare('SELECT organization_id,payload,revision FROM organization_workspace_state ORDER BY updated_at DESC,organization_id').all();
  const chosen=rows.find(row=>requestedOrganization&&String(row.organization_id)===requestedOrganization)
    ||rows.find(row=>/BatiNova/i.test(parseJson(row.payload,{})?.company?.name||''))
    ||rows[0];
  if(chosen){organizationId=String(chosen.organization_id);workspace=parseJson(chosen.payload,{});}
}else if(hasTable('workspace_state')){
  const rows=database.prepare('SELECT user_id,payload,revision FROM workspace_state ORDER BY updated_at DESC,user_id').all();
  const chosen=rows.find(row=>/BatiNova/i.test(parseJson(row.payload,{})?.company?.name||''))||rows[0];
  if(chosen){workspace=parseJson(chosen.payload,{});}
}
if(!workspace)workspace={};
if(!organizationId&&hasTable('organizations'))organizationId=String(database.prepare('SELECT id FROM organizations ORDER BY created_at,id LIMIT 1').get()?.id||'');
const orgWhere=table=>organizationId&&hasColumn(table,'organization_id')?{sql:'organization_id=?',params:[organizationId]}:{sql:'',params:[]};
const scopedCount=(table,extra='',extraParams=[])=>{
  if(!hasTable(table))return 0;
  const org=orgWhere(table);const clauses=[org.sql,extra].filter(Boolean);
  return countTable(table,clauses.join(' AND '),[...org.params,...extraParams]);
};

function contactRoleCount(role){return Array.isArray(workspace.contacts)?workspace.contacts.filter(contact=>(contact.roles||[]).some(item=>String(item).toLowerCase()===role.toLowerCase())).length:0}
function workspaceArrayCount(keys){
  const wanted=new Set(keys.map(key=>key.toLowerCase().replace(/[^a-z0-9]/g,'')));let best=0;
  const seen=new Set();
  const visit=value=>{
    if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
    if(Array.isArray(value)){for(const item of value)visit(item);return}
    for(const [key,child] of Object.entries(value)){
      const normalized=key.toLowerCase().replace(/[^a-z0-9]/g,'');
      if(wanted.has(normalized)&&Array.isArray(child))best=Math.max(best,child.length);
      visit(child);
    }
  };
  visit(workspace);return best;
}
function max(...values){return Math.max(0,...values.map(value=>Number(value||0)))}

const people=max(workspace.people?.length,scopedCount('hr_people',hasColumn('hr_people','active')?'active=1':''));
const teams=max(workspace.teams?.length,scopedCount('hr_teams',hasColumn('hr_teams','active')?'active=1':''));
const clients=max(contactRoleCount('Client'),scopedCount('customers',hasColumn('customers','archived_at')?'archived_at IS NULL':''));
const projects=max(workspace.jobs?.length,scopedCount('projects',hasColumn('projects','archived_at')?'archived_at IS NULL':''));
const assignments=scopedCount('field_assignments');
const timeEntries=scopedCount('time_entries',hasColumn('time_entries','archived_at')?'archived_at IS NULL':'');
const tasks=scopedCount('project_tasks',hasColumn('project_tasks','archived_at')?'archived_at IS NULL':'');
const stockItems=scopedCount('field_stock_items',hasColumn('field_stock_items','archived_at')?'archived_at IS NULL':'');
const stockMovements=scopedCount('field_stock_movements');
const assets=Array.isArray(workspace.assets)?workspace.assets:[];
function relationalAssetGroupCount(group){
  if(!hasTable('field_assets')||!hasColumn('field_assets','payload_json'))return 0;
  const org=orgWhere('field_assets');const rows=database.prepare(`SELECT payload_json FROM field_assets${org.sql?` WHERE ${org.sql}`:''}${hasColumn('field_assets','archived_at')?(org.sql?' AND ':' WHERE ')+'archived_at IS NULL':''}`).all(...org.params);
  return rows.filter(row=>String(parseJson(row.payload_json,{})?.group||'').toLowerCase()===group).length;
}
const vehicles=max(assets.filter(asset=>String(asset.group||'').toLowerCase()==='vehicles').length,relationalAssetGroupCount('vehicles'));
const tools=max(assets.filter(asset=>String(asset.group||'').toLowerCase()==='tools').length,relationalAssetGroupCount('tools'));
const suppliers=max(contactRoleCount('Fournisseur'),scopedCount('suppliers',hasColumn('suppliers','archived_at')?'archived_at IS NULL':''));
const subcontractors=max(contactRoleCount('Sous-traitant'),workspaceArrayCount(['subcontractors','subContractors']));
const purchaseOrders=max(workspaceArrayCount(['purchaseOrders','supplierOrders','orders']),scopedCount('purchase_orders'));
const deliveries=scopedCount('field_delivery_notes');
const supplierInvoices=max(workspaceArrayCount(['supplierInvoices','purchaseInvoices']),scopedCount('supplier_invoices'),hasTable('expenses')?scopedCount('expenses',hasColumn('expenses','supplier_reference')?"COALESCE(supplier_reference,'')<>''":''):0);
const quotes=max(workspace.quotes?.length,scopedCount('quotes_server',hasColumn('quotes_server','archived_at')?'archived_at IS NULL':''));
const clientInvoices=max(workspace.accountingData?.customerInvoices?.length,scopedCount('invoices',hasColumn('invoices','archived_at')?'archived_at IS NULL':''));
const documents=scopedCount('secure_documents');
const documentPhotos=hasTable('secure_documents')&&hasColumn('secure_documents','content_type')?scopedCount('secure_documents',"content_type LIKE 'image/%'"):0;
const notePhotos=hasTable('field_project_notes')&&hasColumn('field_project_notes','photo_name')?scopedCount('field_project_notes',"COALESCE(photo_name,'')<>''"):0;
const photos=max(documentPhotos+notePhotos,workspaceArrayCount(['photos','projectPhotos','sitePhotos']));
const stockLocations=scopedCount('stock_locations',hasColumn('stock_locations','status')?"status='active'":'');
const stockPermanentLocations=hasTable('stock_locations')&&hasColumn('stock_locations','type')
  ?scopedCount('stock_locations',hasColumn('stock_locations','status')?"status='active' AND type<>'project'":"type<>'project'")
  :stockLocations;
const stockProjectLocations=hasTable('stock_locations')&&hasColumn('stock_locations','type')
  ?scopedCount('stock_locations',hasColumn('stock_locations','status')?"status='active' AND type='project'":"type='project'")
  :0;
const supplierPayments=scopedCount('supplier_payments');

const registryRows=documents;
const profileTargets=[
  {key:'people',label:'Personnes',actual:people,mode:'exact',expected:Number(profile.people)},
  {key:'teams',label:'Équipes',actual:teams,mode:'exact',expected:Number(profile.teams)},
  {key:'clients',label:'Clients',actual:clients,mode:'exact',expected:Number(profile.clients)},
  {key:'projects',label:'Chantiers',actual:projects,mode:'exact',expected:Number(profile.projects)},
  {key:'assignments',label:'Affectations planning',actual:assignments,mode:'max',max:Number(profile.planningAssignmentsMax)},
  {key:'stockItems',label:'Références stock',actual:stockItems,mode:'exact',expected:Number(profile.stockReferences)},
  {key:'stockLocations',label:'Emplacements stock permanents',actual:stockPermanentLocations,mode:'exact',expected:Number(profile.stockLocations)},
  {key:'vehicles',label:'Véhicules',actual:vehicles,mode:'exact',expected:Number(profile.vehicles)},
  {key:'tools',label:'Matériels / outils',actual:tools,mode:'exact',expected:Number(profile.toolsAndEquipment)},
  {key:'suppliers',label:'Fournisseurs',actual:suppliers,mode:'exact',expected:Number(profile.suppliers)},
  {key:'subcontractors',label:'Sous-traitants',actual:subcontractors,mode:'exact',expected:Number(profile.subcontractors)},
  {key:'quotes',label:'Devis',actual:quotes,mode:'range',min:Number(profile.quotesMin),max:Number(profile.quotesMax)},
  {key:'registryRows',label:'Registre documents/photos',actual:registryRows,mode:'min',min:251}
].map(item=>{
  let status='FAIL',target='';
  if(item.mode==='exact'){status=item.actual===item.expected?'PASS':'FAIL';target=`= ${item.expected}`;}
  else if(item.mode==='max'){status=item.actual<=item.max?'PASS':'FAIL';target=`<= ${item.max}`;}
  else if(item.mode==='range'){status=item.actual>=item.min&&item.actual<=item.max?'PASS':'FAIL';target=`${item.min}–${item.max}`;}
  else {status=item.actual>=item.min?'PASS':'FAIL';target=`>= ${item.min}`;}
  return {...item,target,status};
});

const stressIndicators=[
  {key:'timeEntries',label:'Pointages',actual:timeEntries,threshold:250},
  {key:'tasks',label:'Tâches',actual:tasks,threshold:80},
  {key:'stockMovements',label:'Mouvements stock',actual:stockMovements,threshold:250},
  {key:'purchaseOrders',label:'Commandes fournisseur',actual:purchaseOrders,threshold:35},
  {key:'deliveries',label:'Livraisons / BL',actual:deliveries,threshold:45},
  {key:'supplierInvoices',label:'Factures fournisseur',actual:supplierInvoices,threshold:30},
  {key:'clientInvoices',label:'Factures client',actual:clientInvoices,threshold:15}
].map(item=>({...item,status:item.actual>=item.threshold?'STRESS_MET':'PROFILE_ONLY'}));

const volumeTargets=profileTargets;

const foreignKeys=Number(database.prepare('PRAGMA foreign_keys').get()?.foreign_keys||0);
const fkRows=timed('PRAGMA foreign_key_check',()=>database.prepare('PRAGMA foreign_key_check').all());
const integrityRows=timed('PRAGMA integrity_check',()=>database.prepare('PRAGMA integrity_check').all());
const integrityOk=integrityRows.length===1&&String(integrityRows[0].integrity_check||Object.values(integrityRows[0])[0])==='ok';
addCheck('sqlite.foreign_keys',foreignKeys===1?'PASS':'FAIL',`PRAGMA foreign_keys=${foreignKeys}`);
addCheck('sqlite.foreign_key_check',fkRows.length===0?'PASS':'FAIL',`${fkRows.length} violation(s)`);
addCheck('sqlite.integrity_check',integrityOk?'PASS':'FAIL',integrityOk?'ok':JSON.stringify(integrityRows.slice(0,10)));
if(fkRows.length)anomalies.push({type:'foreign_key',count:fkRows.length,sample:fkRows.slice(0,10)});

let duplicateIds=0;let duplicateOperationKeys=0;
for(const table of [...tables].sort()){
  const cols=columns(table);const scope=organizationId&&cols.includes('organization_id');
  if(cols.includes('id')){
    const sql=`SELECT id,COUNT(*) count FROM ${quoteIdent(table)} WHERE id IS NOT NULL ${scope?'AND organization_id=?':''} GROUP BY id HAVING COUNT(*)>1 LIMIT 20`;
    const rows=database.prepare(sql).all(...(scope?[organizationId]:[]));
    if(rows.length){duplicateIds+=rows.reduce((sum,row)=>sum+Number(row.count)-1,0);anomalies.push({type:'duplicate_id',table,rows});}
  }
  for(const column of ['operation_key','idempotency_key']){
    if(!cols.includes(column))continue;
    const sql=`SELECT ${quoteIdent(column)} key,COUNT(*) count FROM ${quoteIdent(table)} WHERE ${quoteIdent(column)} IS NOT NULL AND TRIM(${quoteIdent(column)})<>'' ${scope?'AND organization_id=?':''} GROUP BY ${quoteIdent(column)} HAVING COUNT(*)>1 LIMIT 20`;
    const rows=database.prepare(sql).all(...(scope?[organizationId]:[]));
    if(rows.length){duplicateOperationKeys+=rows.reduce((sum,row)=>sum+Number(row.count)-1,0);anomalies.push({type:'duplicate_operation_key',table,column,rows});}
  }
}
addCheck('duplicates.ids',duplicateIds===0?'PASS':'FAIL',`${duplicateIds} doublon(s) d'identifiant`);
addCheck('duplicates.operation_keys',duplicateOperationKeys===0?'PASS':'FAIL',`${duplicateOperationKeys} doublon(s) operationKey/idempotencyKey`);

let missingOrganizations=0;
if(hasTable('organizations')){
  for(const table of [...tables].sort()){
    if(table==='organizations'||!hasColumn(table,'organization_id'))continue;
    const count=scalar(`SELECT COUNT(*) count FROM ${quoteIdent(table)} t LEFT JOIN organizations o ON o.id=t.organization_id WHERE t.organization_id IS NULL OR o.id IS NULL`);
    if(count){missingOrganizations+=count;anomalies.push({type:'missing_organization',table,count});}
  }
}
addCheck('tenant.organization_links',missingOrganizations===0?'PASS':'FAIL',`${missingOrganizations} ligne(s) sans organisation valide`);

let crossTenant=0;
function crossTenantJoin(label,child,childId,parent,parentId='id'){
  if(!hasTable(child)||!hasTable(parent)||!hasColumn(child,'organization_id')||!hasColumn(child,childId)||!hasColumn(parent,'organization_id')||!hasColumn(parent,parentId))return;
  const rows=database.prepare(`SELECT c.${quoteIdent(childId)} child_id,c.organization_id child_org,p.organization_id parent_org FROM ${quoteIdent(child)} c JOIN ${quoteIdent(parent)} p ON p.${quoteIdent(parentId)}=c.${quoteIdent(childId)} WHERE c.${quoteIdent(childId)} IS NOT NULL AND c.organization_id<>p.organization_id ${organizationId?'AND c.organization_id=?':''} LIMIT 20`).all(...(organizationId?[organizationId]:[]));
  if(rows.length){crossTenant+=rows.length;anomalies.push({type:'cross_tenant',label,rows});}
}
crossTenantJoin('projects.customer','projects','customer_id','customers');
crossTenantJoin('expenses.supplier','expenses','supplier_id','suppliers');
crossTenantJoin('expenses.project','expenses','project_id','projects');
crossTenantJoin('project_financial_baselines.project','project_financial_baselines','project_id','projects');
crossTenantJoin('supplier_invoice_matches.project','supplier_invoice_matches','project_id','projects');
if(hasTable('project_access')&&hasTable('organization_members')){
  const count=scalar(`SELECT COUNT(*) count FROM project_access p LEFT JOIN organization_members m ON m.organization_id=p.organization_id AND m.user_id=p.user_id WHERE m.user_id IS NULL ${organizationId?'AND p.organization_id=?':''}`,organizationId?[organizationId]:[]);
  if(count){crossTenant+=count;anomalies.push({type:'project_access_without_membership',count});}
}
addCheck('tenant.cross_tenant',crossTenant===0?'PASS':'FAIL',`${crossTenant} relation(s) cross-tenant suspecte(s)`);

let stockNegative=0;
if(hasTable('field_stock_items')&&hasColumn('field_stock_items','quantity'))stockNegative+=scopedCount('field_stock_items','quantity<0');
if(hasTable('stock_balances')&&hasColumn('stock_balances','quantity'))stockNegative+=scopedCount('stock_balances','quantity<0');
addCheck('stock.non_negative',stockNegative===0?'PASS':'FAIL',`${stockNegative} solde(s) négatif(s)`);
addCheck('stock.locations',stockPermanentLocations===Number(profile.stockLocations)?'PASS':'FAIL',`${stockPermanentLocations} emplacement(s) permanent(s) actif(s), cible calibrée = ${profile.stockLocations}; ${stockProjectLocations} emplacement(s) chantier actif(s) hors quota`);
let staleProjectLocations=0;
if(hasTable('stock_locations')&&hasTable('stock_balances')&&hasColumn('stock_locations','type')&&hasColumn('stock_locations','status')){
  const params=organizationId?[organizationId]:[];
  staleProjectLocations=scalar(`SELECT COUNT(*) count FROM stock_locations l
    WHERE l.type='project' AND l.status='active' ${organizationId?'AND l.organization_id=?':''}
      AND COALESCE((SELECT SUM(b.quantity) FROM stock_balances b WHERE b.organization_id=l.organization_id AND b.location_id=l.id),0)<=0`,params);
}
addCheck('stock.project_locations',staleProjectLocations===0?'PASS':'FAIL',`${stockProjectLocations} emplacement(s) chantier actif(s), ${staleProjectLocations} sans solde positif`);

let planningPersonCollisions=0;let planningAssetCollisions=0;
if(hasTable('field_assignments')&&['assignment_date','team_id','people_json'].every(col=>hasColumn('field_assignments',col))){
  const whereParts=[];const params=[];
  if(organizationId){whereParts.push('organization_id=?');params.push(organizationId)}
  if(hasColumn('field_assignments','status'))whereParts.push("status<>'cancelled'");
  const where=whereParts.length?'WHERE '+whereParts.join(' AND '):'';
  const timeSelect=hasColumn('field_assignments','start_time')&&hasColumn('field_assignments','end_time')?',start_time,end_time':'';
  const rows=database.prepare(`SELECT id,assignment_date,team_id,people_json,vehicle_id,pack_id${timeSelect} FROM field_assignments ${where} ORDER BY assignment_date,team_id,id`).all(...params);
  const peopleByDay=new Map(),assetsByDay=new Map(),clock=value=>{const [h,m]=String(value||'').split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null};
  for(const row of rows){
    const date=String(row.assignment_date),team=String(row.team_id),people=parseJson(row.people_json,[])||[],start=clock(row.start_time??'07:00')??420,end=clock(row.end_time??'16:00')??960;
    if(!peopleByDay.has(date))peopleByDay.set(date,new Map());
    for(const person of people.map(String)){
      const map=peopleByDay.get(date);if(!map.has(person))map.set(person,[]);map.get(person).push({id:String(row.id),team,start,end});
    }
    if(!assetsByDay.has(date))assetsByDay.set(date,new Map());
    for(const [kind,value] of [['vehicle',row.vehicle_id],['pack',row.pack_id]])if(value){const key=`${kind}:${value}`,map=assetsByDay.get(date);if(!map.has(key))map.set(key,new Set());map.get(key).add(team)}
  }
  for(const [date,map] of peopleByDay)for(const [person,items] of map)for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++)if(items[i].start<items[j].end&&items[j].start<items[i].end){planningPersonCollisions++;anomalies.push({type:'person_assignment_overlap',date,person,assignments:[items[i].id,items[j].id],teams:[items[i].team,items[j].team],intervals:[[items[i].start,items[i].end],[items[j].start,items[j].end]]});}
  for(const [date,map] of assetsByDay)for(const [asset,teamSet] of map)if(teamSet.size>1){planningAssetCollisions++;anomalies.push({type:'asset_double_team',date,asset,teams:[...teamSet]});}
}
addCheck('planning.person_interval_overlap',planningPersonCollisions===0?'PASS':'FAIL',`${planningPersonCollisions} collision(s)`);
addCheck('planning.asset_double_team',planningAssetCollisions===0?'PASS':'FAIL',`${planningAssetCollisions} collision(s)`);

let missingClients=0;
if(Array.isArray(workspace.jobs)&&Array.isArray(workspace.contacts)){
  const contactIds=new Set(workspace.contacts.map(contact=>String(contact.id)));
  missingClients=workspace.jobs.filter(job=>job.clientId!=null&&!contactIds.has(String(job.clientId))).length;
}
addCheck('projects.clients_exist',missingClients===0?'PASS':'FAIL',`${missingClients} chantier(s) avec client absent du workspace`);

let documentRelationIssues=0;
if(hasTable('document_relations')&&hasTable('secure_documents')){
  const rows=database.prepare(`SELECT r.id,r.organization_id,r.document_id,r.relation_type,r.relation_id FROM document_relations r LEFT JOIN secure_documents d ON d.id=r.document_id AND d.organization_id=r.organization_id WHERE d.id IS NULL ${organizationId?'AND r.organization_id=?':''} LIMIT 50`).all(...(organizationId?[organizationId]:[]));
  documentRelationIssues+=rows.length;if(rows.length)anomalies.push({type:'document_orphan_relation',rows});
}
addCheck('documents.relations',documentRelationIssues===0?'PASS':'FAIL',`${documentRelationIssues} relation(s) documentaire(s) orpheline(s)`);

const performanceQueries=[
  ['projects.list','projects',hasColumn('projects','organization_id')?'organization_id=?':'',organizationId?[organizationId]:[]],
  ['tasks.list','project_tasks',hasColumn('project_tasks','organization_id')?'organization_id=?':'',organizationId?[organizationId]:[]],
  ['time_entries.page','time_entries',hasColumn('time_entries','organization_id')?'organization_id=?':'',organizationId?[organizationId]:[]],
  ['stock.movements','field_stock_movements',hasColumn('field_stock_movements','organization_id')?'organization_id=?':'',organizationId?[organizationId]:[]],
  ['documents.list','secure_documents',hasColumn('secure_documents','organization_id')?'organization_id=?':'',organizationId?[organizationId]:[]],
  ['expenses.list','expenses',hasColumn('expenses','organization_id')?'organization_id=?':'',organizationId?[organizationId]:[]]
];
for(const [name,table,where,params] of performanceQueries){
  if(!hasTable(table))continue;
  timed(name,()=>database.prepare(`SELECT * FROM ${quoteIdent(table)}${where?` WHERE ${where}`:''} LIMIT 251`).all(...params));
}
for(const row of performanceRows)addCheck(`performance.${row.name}`,row.status,`${row.ms} ms`);

const scaleLimits=[];
for(const [label,table] of [['time_entries','time_entries'],['stock_movements','field_stock_movements'],['documents','secure_documents'],['tasks','project_tasks']]){
  const count=scopedCount(table);if(count>250)scaleLimits.push({label,table,count,note:'volume >250: pagination API obligatoire à vérifier'});
}

async function apiProbe(){
  if(!baseUrl)return {enabled:false,results:[]};
  const results=[];
  async function login(email){
    const response=await fetch(baseUrl+'/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});
    const cookie=response.headers.get('set-cookie')?.split(';')[0]||'';
    return {status:response.status,cookie};
  }
  async function get(cookie,path,org=organizationId){
    const start=performance.now();let response,error='';let body=null;
    try{response=await fetch(baseUrl+path,{headers:{cookie,...(org?{'x-socle-organization-id':org}:{})}});const text=await response.text();try{body=JSON.parse(text)}catch{body=text}}
    catch(err){error=String(err)}
    const ms=Number((performance.now()-start).toFixed(2));
    const status=response?.status||0;const perf=ms>1500?'FAIL':ms>500?'SLOW':'PASS';
    results.push({path,status,ms,performance:perf,error});return {status,body,ms};
  }
  const owner=await login(ownerEmail);results.push({path:'/__local-test/login owner',status:owner.status,ms:0,performance:owner.status===204?'PASS':'FAIL'});
  if(owner.status===204&&owner.cookie){
    const ownerResponses={};
    for(const path of ['/api/bootstrap','/api/state','/api/field-data','/api/time-entries?limit=250','/api/documents','/api/accounting/summary'])ownerResponses[path]=await get(owner.cookie,path);
    if(timeEntries>250){const body=ownerResponses['/api/time-entries?limit=250']?.body||{};results.push({path:'owner.time-entries.pagination',status:body.nextCursor?200:500,ms:0,performance:body.nextCursor?'PASS':'FAIL',detail:body.nextCursor?'nextCursor présent':'volume >250 sans nextCursor'});}
    if(documents>250){const body=ownerResponses['/api/documents']?.body||{};const cursor=body.nextCursor||body.cursor||body.pagination?.nextCursor;results.push({path:'owner.documents.pagination',status:cursor?200:500,ms:0,performance:cursor?'PASS':'FAIL',detail:cursor?'pagination exposée':'volume >250 sans curseur de pagination'});}
    const projectIds=(workspace.jobs||[]).map(job=>String(job.id)).filter(Boolean).slice(0,5);
    if(projectIds.length){let ok=0;for(const projectId of projectIds){const forecast=await get(owner.cookie,'/api/projects/'+encodeURIComponent(projectId)+'/financial-forecast');if(forecast.status===200)ok++;}results.push({path:'owner.forecast.sample',status:ok===projectIds.length?200:500,ms:0,performance:ok===projectIds.length?'PASS':'FAIL',detail:`${ok}/${projectIds.length} forecast(s) HTTP 200`});}
  }
  const worker=await login(workerEmail);results.push({path:'/__local-test/login worker',status:worker.status,ms:0,performance:worker.status===204?'PASS':'FAIL'});
  if(worker.status===204&&worker.cookie){
    const stateResponse=await get(worker.cookie,'/api/state');
    const state=stateResponse.body?.state||{};const sensitive=[];
    const inspect=(value,path='state')=>{if(!value||typeof value!=='object')return;if(Array.isArray(value)){value.forEach((item,index)=>inspect(item,`${path}[${index}]`));return}for(const [key,child] of Object.entries(value)){if(/^(price|unitPrice|unit_price|cost|unitCost|unit_cost|grossHourly|hourlyCost|margin)$/i.test(key)&&typeof child==='number'&&child!==0)sensitive.push(`${path}.${key}`);inspect(child,`${path}.${key}`)}};
    inspect(state);
    results.push({path:'worker.price-mask',status:sensitive.length?500:200,ms:0,performance:sensitive.length?'FAIL':'PASS',sensitivePaths:sensitive.slice(0,30)});
    if(hasTable('project_access')&&hasTable('projects')){
      const profile=hasTable('profiles')&&hasColumn('profiles','email')?database.prepare('SELECT id FROM profiles WHERE lower(email)=lower(?) LIMIT 1').get(workerEmail):null;
      if(profile){
        const inaccessible=database.prepare(`SELECT p.id FROM projects p WHERE p.organization_id=? AND NOT EXISTS(SELECT 1 FROM project_access a WHERE a.organization_id=p.organization_id AND a.user_id=? AND a.project_id=p.id) LIMIT 1`).get(organizationId,String(profile.id));
        if(inaccessible){const probe=await get(worker.cookie,'/api/projects/'+encodeURIComponent(inaccessible.id));results.push({path:'worker.cross-project',status:probe.status,ms:probe.ms,performance:[403,404].includes(probe.status)?'PASS':'FAIL'});}
      }
    }
    if(hasTable('organizations')){
      const profile=hasTable('profiles')&&hasColumn('profiles','email')?database.prepare('SELECT id FROM profiles WHERE lower(email)=lower(?) LIMIT 1').get(workerEmail):null;
      let foreign=null;
      if(profile&&hasTable('organization_members'))foreign=database.prepare(`SELECT o.id FROM organizations o WHERE o.id<>? AND NOT EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=o.id AND m.user_id=? AND m.status='active') ORDER BY o.id LIMIT 1`).get(organizationId,String(profile.id));
      else foreign=database.prepare('SELECT id FROM organizations WHERE id<>? ORDER BY id LIMIT 1').get(organizationId);
      if(foreign){const probe=await get(worker.cookie,'/api/bootstrap',String(foreign.id));results.push({path:'worker.cross-tenant',status:probe.status,ms:probe.ms,performance:probe.status===403?'PASS':'FAIL'});}
    }
  }
  return {enabled:true,results};
}
const api=await apiProbe();
for(const result of api.results){
  const status=result.performance==='PASS'?'PASS':result.performance==='SLOW'?'SLOW':'FAIL';
  addCheck(`api.${result.path}`,status,`HTTP ${result.status} · ${result.ms} ms${result.error?' · '+result.error:''}`);
}

addCheck('packs.presence','PASS',`${expectedPacks.length}/${expectedPacks.length} packs présents`);

const fingerprintPayload={organizationId,calibrationCode:calibration.datasetCode,profile:Object.fromEntries(profileTargets.map(item=>[item.key,item.actual])),checks:checks.filter(item=>!item.name.startsWith('performance.')&&!item.name.startsWith('api.')).map(item=>[item.name,item.status,item.detail])};
const fingerprint=createHash('sha256').update(JSON.stringify(fingerprintPayload)).digest('hex');
if(expectedFingerprint)addCheck('replay.fingerprint',fingerprint===expectedFingerprint?'PASS':'FAIL',`attendu ${expectedFingerprint}, obtenu ${fingerprint}`);

const summary={
  generatedAt:new Date().toISOString(),
  node:process.version,
  databasePath,
  organizationId:organizationId||null,
  company:workspace.company?.name||null,
  packsIntegrated,
  calibration:{datasetCode:calibration.datasetCode,frozenAt:calibration.frozenAt,simulationPeriod:calibration.simulationPeriod},
  profileTargets,
  stressIndicators,
  volumes:volumeTargets,
  extraVolumes:{stockLocations,stockPermanentLocations,stockProjectLocations,supplierPayments},
  checks,
  scaleLimits,
  api,
  anomalies,
  fingerprint
};

const failCount=checks.filter(item=>item.status==='FAIL').length;
const slowCount=checks.filter(item=>item.status==='SLOW').length;
const targetFailCount=profileTargets.filter(item=>item.status==='FAIL').length;
if(!jsonOnly){
  console.log('BATINOVA XL — QA / ASSEMBLAGE / STRESS');
  console.log(`Node ${process.version} · organisation ${organizationId||'non déterminée'}`);
  console.log('\nPROFIL MÉTIER — calibration BATXL');
  for(const item of profileTargets)console.log(`${item.status.padEnd(4)} ${item.label.padEnd(26)} ${String(item.actual).padStart(6)} / cible ${item.target}`);
  console.log('\nSTRESS QA — non bloquant');
  for(const item of stressIndicators)console.log(`${item.status.padEnd(12)} ${item.label.padEnd(26)} ${String(item.actual).padStart(6)} / stress >= ${item.threshold}`);
  console.log('\nCONTRÔLES');
  for(const item of checks)console.log(`${item.status.padEnd(4)} ${item.name} — ${item.detail}`);
  if(scaleLimits.length){console.log('\nLIMITES >250');for(const item of scaleLimits)console.log(`- ${item.label}: ${item.count}`)}
  console.log(`\nFingerprint: ${fingerprint}`);
  console.log(`Résumé: ${failCount} FAIL, ${slowCount} SLOW, ${targetFailCount} cible(s) du profil calibré non conforme(s).`);
}
console.log(JSON.stringify(summary,null,2));
database.close();

const shouldFail=failCount>0||(strictTargets&&targetFailCount>0);
if(shouldFail&&!reportOnly)process.exit(1);
