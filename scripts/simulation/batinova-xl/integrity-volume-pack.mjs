import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {assertManifest,defaults,environment,packFiles} from './manifest.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');

function parseArgs(argv){
  const out={db:process.env[environment.databasePath]||join(root,defaults.databaseRelativePath),organization:process.env[environment.organizationId]||defaults.organizationId,replayPacks:false,json:false,packs:[]};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--db')out.db=resolve(argv[++i]||'');
    else if(arg==='--organization')out.organization=String(argv[++i]||'').trim();
    else if(arg==='--replay-packs')out.replayPacks=true;
    else if(arg==='--pack')out.packs.push(resolve(argv[++i]||''));
    else if(arg==='--json')out.json=true;
    else if(arg==='--check-only')out.replayPacks=false;
    else throw new Error('Argument IA4 inconnu : '+arg);
  }
  if(!out.organization)throw new Error('organization_id BATXL manquant');
  return out;
}
function qi(name){return '"'+String(name).replaceAll('"','""')+'"'}
function tableExists(db,name){return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))}
function columns(db,table){return db.prepare(`PRAGMA table_info(${qi(table)})`).all().map(row=>String(row.name))}
function tableNames(db){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>String(row.name))}
function stableValue(value){
  if(value===null)return null;
  if(value instanceof Uint8Array)return 'blob:sha256:'+createHash('sha256').update(value).digest('hex');
  if(typeof value==='bigint')return value.toString();
  if(typeof value==='number'&&!Number.isFinite(value))return String(value);
  return value;
}
function canonicalRow(row){
  const ordered={};
  for(const key of Object.keys(row).sort())ordered[key]=stableValue(row[key]);
  return JSON.stringify(ordered);
}
function snapshot(db){
  const hash=createHash('sha256'),tables={};let totalRows=0;
  for(const table of tableNames(db)){
    const rows=db.prepare(`SELECT * FROM ${qi(table)}`).all().map(canonicalRow).sort();
    tables[table]=rows.length;totalRows+=rows.length;
    hash.update(table+'\n'+rows.length+'\n');
    for(const row of rows)hash.update(row+'\n');
  }
  return {hash:hash.digest('hex'),totalRows,tables};
}
function anomaly(type,table,detail){return{type,table,detail}}
function duplicateChecks(db,table,cols,anomalies){
  if(cols.includes('id')){
    const scope=cols.includes('organization_id')?'organization_id,id':'id';
    const rows=db.prepare(`SELECT ${scope},COUNT(*) AS n FROM ${qi(table)} WHERE id IS NOT NULL GROUP BY ${scope} HAVING COUNT(*)>1 LIMIT 100`).all();
    for(const row of rows)anomalies.push(anomaly('duplicate_id',table,row));
  }
  for(const key of ['idempotency_key','operation_key'])if(cols.includes(key)){
    const scope=cols.includes('organization_id')?`organization_id,${qi(key)}`:qi(key);
    const rows=db.prepare(`SELECT ${scope},COUNT(*) AS n FROM ${qi(table)} WHERE ${qi(key)} IS NOT NULL AND trim(CAST(${qi(key)} AS TEXT))<>'' GROUP BY ${scope} HAVING COUNT(*)>1 LIMIT 100`).all();
    for(const row of rows)anomalies.push(anomaly('duplicate_operation_key',table,row));
  }
}
function declaredCrossTenantChecks(db,table,cols,anomalies){
  if(!cols.includes('organization_id'))return;
  const fks=db.prepare(`PRAGMA foreign_key_list(${qi(table)})`).all();
  const groups=new Map();
  for(const fk of fks){
    const key=String(fk.id);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(fk);
  }
  for(const group of groups.values()){
    const target=String(group[0].table||'');
    if(!target||!tableExists(db,target))continue;
    const targetCols=columns(db,target);
    if(!targetCols.includes('organization_id'))continue;
    const joins=group.map(fk=>`c.${qi(fk.from)}=p.${qi(fk.to)}`).join(' AND ');
    const nonNull=group.map(fk=>`c.${qi(fk.from)} IS NOT NULL`).join(' AND ');
    if(!joins||!nonNull)continue;
    const rows=db.prepare(`SELECT c.rowid AS row_id,c.organization_id AS child_org,p.organization_id AS parent_org FROM ${qi(table)} c JOIN ${qi(target)} p ON ${joins} WHERE ${nonNull} AND c.organization_id<>p.organization_id LIMIT 100`).all();
    for(const row of rows)anomalies.push(anomaly('cross_tenant_fk',table,{target,...row}));
  }
}
function knownProjectCrossTenant(db,table,cols,anomalies){
  if(!tableExists(db,'projects')||!cols.includes('organization_id')||!cols.includes('project_id'))return;
  const rows=db.prepare(`SELECT c.rowid AS row_id,c.organization_id,c.project_id,p.organization_id AS project_org FROM ${qi(table)} c JOIN projects p ON p.id=c.project_id WHERE c.project_id IS NOT NULL AND c.organization_id<>p.organization_id LIMIT 100`).all();
  for(const row of rows)anomalies.push(anomaly('cross_tenant_project',table,row));
}

function globalBatxlIdChecks(db,anomalies){
  const seen=new Map();
  for(const table of tableNames(db)){
    const cols=columns(db,table);if(!cols.includes('id'))continue;
    const select=cols.includes('organization_id')?`organization_id,id`:`NULL AS organization_id,id`;
    const rows=db.prepare(`SELECT ${select} FROM ${qi(table)} WHERE CAST(id AS TEXT) LIKE 'BATXL-%'`).all();
    for(const row of rows){
      const key=`${row.organization_id??''}|${String(row.id)}`;
      if(!seen.has(key))seen.set(key,[]);
      seen.get(key).push(table);
    }
  }
  for(const [key,tables] of seen)if(new Set(tables).size>1){
    const split=key.indexOf('|');
    anomalies.push(anomaly('duplicate_batxl_id_across_tables','batinova-xl',{organization_id:key.slice(0,split)||null,id:key.slice(split+1),tables:[...new Set(tables)].sort()}));
  }
}
function workspaceOperationKeyChecks(db,anomalies){
  if(!tableExists(db,'organization_workspace_state'))return;
  const rows=db.prepare('SELECT organization_id,payload FROM organization_workspace_state').all();
  const names=new Set(['operationKey','operation_key','idempotencyKey','idempotency_key']);
  for(const row of rows){
    let payload;try{payload=JSON.parse(row.payload||'{}')}catch{anomalies.push(anomaly('invalid_workspace_json','organization_workspace_state',{organization_id:row.organization_id}));continue}
    const seen=new Map(),stack=[{value:payload,path:'$'}];
    while(stack.length){
      const {value,path}=stack.pop();
      if(Array.isArray(value)){for(let i=value.length-1;i>=0;i--)stack.push({value:value[i],path:`${path}[${i}]`});continue}
      if(!value||typeof value!=='object')continue;
      for(const [key,child] of Object.entries(value)){
        const childPath=`${path}.${key}`;
        if(names.has(key)&&child!==null&&String(child).trim()!==''){
          const op=String(child);if(!seen.has(op))seen.set(op,[]);seen.get(op).push(childPath);
        }
        if(child&&typeof child==='object')stack.push({value:child,path:childPath});
      }
    }
    for(const [key,paths] of seen)if(paths.length>1)anomalies.push(anomaly('duplicate_workspace_operation_key','organization_workspace_state',{organization_id:row.organization_id,key,paths:paths.slice(0,20)}));
  }
}

function foreignKeyChecks(db,anomalies){
  for(const row of db.prepare('PRAGMA foreign_key_check').all())anomalies.push(anomaly('foreign_key_violation',String(row.table||''),row));
}
function projectAndCustomerChecks(db,anomalies){
  if(tableExists(db,'projects')){
    const cols=columns(db,'projects');
    if(cols.includes('organization_id')&&tableExists(db,'organizations')){
      const rows=db.prepare("SELECT p.id,p.organization_id FROM projects p LEFT JOIN organizations o ON o.id=p.organization_id WHERE p.organization_id IS NULL OR trim(p.organization_id)='' OR o.id IS NULL LIMIT 100").all();
      for(const row of rows)anomalies.push(anomaly('project_without_organization','projects',row));
    }
    if(cols.includes('customer_id')&&tableExists(db,'customers')){
      const rows=db.prepare("SELECT p.id,p.organization_id,p.customer_id FROM projects p LEFT JOIN customers c ON c.id=p.customer_id AND c.organization_id=p.organization_id WHERE p.customer_id IS NOT NULL AND c.id IS NULL LIMIT 100").all();
      for(const row of rows)anomalies.push(anomaly('missing_or_cross_tenant_customer','projects',row));
    }
  }
}
function relationTargetChecks(db,anomalies,targetTable,column,type){
  if(!tableExists(db,targetTable))return;
  const targetCols=columns(db,targetTable);
  if(!targetCols.includes('id')||!targetCols.includes('organization_id'))return;
  for(const table of tableNames(db)){
    if(table===targetTable)continue;
    const cols=columns(db,table);
    if(!cols.includes('organization_id')||!cols.includes(column))continue;
    const rows=db.prepare(`SELECT c.rowid AS row_id,c.organization_id,c.${qi(column)} AS related_id FROM ${qi(table)} c LEFT JOIN ${qi(targetTable)} t ON t.id=c.${qi(column)} AND t.organization_id=c.organization_id WHERE c.${qi(column)} IS NOT NULL AND trim(CAST(c.${qi(column)} AS TEXT))<>'' AND t.id IS NULL LIMIT 100`).all();
    for(const row of rows)anomalies.push(anomaly(type,table,row));
  }
}
function stockChecks(db,anomalies){
  if(tableExists(db,'field_stock_items')){
    const rows=db.prepare('SELECT organization_id,id,quantity,reserved FROM field_stock_items WHERE archived_at IS NULL AND (quantity < -0.000001 OR reserved < -0.000001) LIMIT 100').all();
    for(const row of rows)anomalies.push(anomaly('negative_stock','field_stock_items',row));
  }
  if(tableExists(db,'stock_balances')){
    const rows=db.prepare('SELECT organization_id,stock_item_id,location_id,quantity FROM stock_balances WHERE quantity < -0.000001 LIMIT 100').all();
    for(const row of rows)anomalies.push(anomaly('negative_stock_balance','stock_balances',row));
    if(tableExists(db,'field_stock_items')){
      const rows2=db.prepare(`SELECT i.organization_id,i.id,i.quantity,COALESCE(SUM(b.quantity),0) AS balance_total FROM field_stock_items i LEFT JOIN stock_balances b ON b.organization_id=i.organization_id AND b.stock_item_id=i.id WHERE i.archived_at IS NULL GROUP BY i.organization_id,i.id HAVING ABS(i.quantity-COALESCE(SUM(b.quantity),0))>0.000001 LIMIT 100`).all();
      for(const row of rows2)anomalies.push(anomaly('stock_projection_mismatch','field_stock_items',row));
    }
  }
}
function assignmentChecks(db,anomalies){
  if(!tableExists(db,'field_assignments'))return;
  const cols=columns(db,'field_assignments'),active=cols.includes('status')?"status<>'cancelled' AND ":'';
  for(const resource of ['vehicle_id','pack_id','asset_id','equipment_id','material_id'])if(cols.includes(resource)){
    const rows=db.prepare(`SELECT organization_id,assignment_date,${qi(resource)} AS resource_id,COUNT(DISTINCT team_id) AS teams,GROUP_CONCAT(DISTINCT team_id) AS team_ids FROM field_assignments WHERE ${active}${qi(resource)} IS NOT NULL AND trim(CAST(${qi(resource)} AS TEXT))<>'' GROUP BY organization_id,assignment_date,${qi(resource)} HAVING COUNT(DISTINCT team_id)>1 LIMIT 100`).all();
    for(const row of rows)anomalies.push(anomaly('resource_double_assignment','field_assignments',{resource,...row}));
  }
  if(cols.includes('people_json')){
    const times=cols.includes('start_time')&&cols.includes('end_time'),assignments=db.prepare(`SELECT id,organization_id,assignment_date,team_id,people_json${times?',start_time,end_time':''} FROM field_assignments ${cols.includes('status')?"WHERE status<>'cancelled'":''} ORDER BY organization_id,assignment_date,id`).all();
    const seen=new Map(),clock=(value,fallback)=>{const [h,m]=String(value||fallback).split(':').map(Number);return h*60+m};
    for(const row of assignments){
      let people=[];try{people=JSON.parse(row.people_json||'[]')}catch{anomalies.push(anomaly('invalid_people_json','field_assignments',{id:row.id}));continue}
      if(!Array.isArray(people)){anomalies.push(anomaly('invalid_people_json','field_assignments',{id:row.id}));continue}
      const start=clock(row.start_time,'07:00'),end=clock(row.end_time,'16:00');
      for(const person of people){
        const key=`${row.organization_id}|${row.assignment_date}|${String(person)}`;
        if(!seen.has(key))seen.set(key,{organization_id:row.organization_id,date:row.assignment_date,person_id:String(person),items:[]});
        seen.get(key).items.push({id:String(row.id),team_id:String(row.team_id),start,end});
      }
    }
    for(const item of seen.values())for(let i=0;i<item.items.length;i++)for(let j=i+1;j<item.items.length;j++){
      const a=item.items[i],b=item.items[j];
      if(a.start<b.end&&b.start<a.end)anomalies.push(anomaly('person_assignment_interval_overlap','field_assignments',{organization_id:item.organization_id,date:item.date,person_id:item.person_id,assignment_ids:[a.id,b.id],team_ids:[a.team_id,b.team_id],intervals:[[a.start,a.end],[b.start,b.end]]}));
    }
  }
}
function knownOrphanChecks(db,anomalies){
  if(tableExists(db,'field_stock_movements')&&tableExists(db,'field_stock_items')){
    const rows=db.prepare(`SELECT m.id,m.organization_id,m.stock_item_id FROM field_stock_movements m LEFT JOIN field_stock_items i ON i.organization_id=m.organization_id AND i.id=m.stock_item_id WHERE i.id IS NULL LIMIT 100`).all();
    for(const row of rows)anomalies.push(anomaly('orphan_stock_movement','field_stock_movements',row));
  }
  if(tableExists(db,'field_delivery_lines')&&tableExists(db,'field_stock_items')){
    const rows=db.prepare(`SELECT l.id,l.organization_id,l.stock_item_id FROM field_delivery_lines l LEFT JOIN field_stock_items i ON i.organization_id=l.organization_id AND i.id=l.stock_item_id WHERE l.stock_item_id IS NOT NULL AND i.id IS NULL LIMIT 100`).all();
    for(const row of rows)anomalies.push(anomaly('orphan_delivery_stock_item','field_delivery_lines',row));
  }
}
function runChecks(db){
  const anomalies=[];
  const fkEnabled=Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys)===1;
  if(!fkEnabled)anomalies.push(anomaly('foreign_keys_disabled','sqlite',{}));
  foreignKeyChecks(db,anomalies);
  const integrityRows=db.prepare('PRAGMA integrity_check').all().map(row=>String(row.integrity_check));
  const integrityOk=integrityRows.length===1&&integrityRows[0]==='ok';
  if(!integrityOk)anomalies.push(anomaly('integrity_check_failed','sqlite',{rows:integrityRows}));
  for(const table of tableNames(db)){
    const cols=columns(db,table);
    duplicateChecks(db,table,cols,anomalies);
    declaredCrossTenantChecks(db,table,cols,anomalies);
    knownProjectCrossTenant(db,table,cols,anomalies);
  }
  globalBatxlIdChecks(db,anomalies);
  workspaceOperationKeyChecks(db,anomalies);
  projectAndCustomerChecks(db,anomalies);
  relationTargetChecks(db,anomalies,'customers','customer_id','missing_or_cross_tenant_customer');
  relationTargetChecks(db,anomalies,'suppliers','supplier_id','missing_or_cross_tenant_supplier');
  stockChecks(db,anomalies);
  assignmentChecks(db,anomalies);
  knownOrphanChecks(db,anomalies);
  return {foreignKeys:fkEnabled,foreignKeyCheckEmpty:!anomalies.some(x=>x.type==='foreign_key_violation'),integrityCheck:integrityOk?'ok':integrityRows,anomalies};
}
function discoverPacks(explicit){
  if(explicit.length)return [...new Set(explicit)].filter(existsSync);
  return packFiles.map(name=>join(here,name)).filter(existsSync);
}
function runPack(pack,dbPath,organization){
  const result=spawnSync(process.execPath,['--experimental-sqlite',pack,'--db',dbPath,'--organization',organization],{
    cwd:root,
    env:{...process.env,[environment.databasePath]:dbPath,[environment.organizationId]:organization,[environment.simulationMode]:defaults.simulationMode},
    encoding:'utf8',maxBuffer:20*1024*1024
  });
  return {pack,exitCode:result.status??1,signal:result.signal||null,stdout:String(result.stdout||'').trim(),stderr:String(result.stderr||'').trim()};
}
function diffCounts(before,after){
  const tables=[...new Set([...Object.keys(before.tables),...Object.keys(after.tables)])].sort(),diff={};
  for(const table of tables){const delta=(after.tables[table]||0)-(before.tables[table]||0);if(delta)diff[table]=delta}
  return diff;
}
function replay(dbPath,organization,explicitPacks){
  const packs=discoverPacks(explicitPacks);
  const db0=new DatabaseSync(dbPath);db0.exec('PRAGMA foreign_keys=ON');const before=snapshot(db0);db0.close();
  const integratedPacks=packs.filter(pack=>packFiles.some(name=>pack.endsWith('/'+name)||pack.endsWith('\\'+name)));
  const defaultDb=resolve(join(root,defaults.databaseRelativePath));
  if(integratedPacks.length&&resolve(dbPath)!==defaultDb)return{packs,firstRuns:[],secondRuns:[],before,afterFirst:null,afterSecond:null,replayStable:false,error:'Replay BATXL intégré refusé sur une base non standard : certains packs publiés ouvrent data/socle.sqlite directement.'};
  const firstRuns=packs.map(pack=>runPack(pack,dbPath,organization));
  if(firstRuns.some(run=>run.exitCode!==0))return{packs,firstRuns,secondRuns:[],before,afterFirst:null,afterSecond:null,replayStable:false,error:'Premier lancement de pack en échec'};
  const db1=new DatabaseSync(dbPath);db1.exec('PRAGMA foreign_keys=ON');const afterFirst=snapshot(db1);db1.close();
  const secondRuns=packs.map(pack=>runPack(pack,dbPath,organization));
  if(secondRuns.some(run=>run.exitCode!==0))return{packs,firstRuns,secondRuns,before,afterFirst,afterSecond:null,replayStable:false,error:'Deuxième lancement de pack en échec'};
  const db2=new DatabaseSync(dbPath);db2.exec('PRAGMA foreign_keys=ON');const afterSecond=snapshot(db2);db2.close();
  return {packs,firstRuns,secondRuns,before,afterFirst,afterSecond,firstDelta:diffCounts(before,afterFirst),secondDelta:diffCounts(afterFirst,afterSecond),replayStable:afterFirst.hash===afterSecond.hash};
}

export function runIntegrityVolumePack(options={}){
  const dbPath=resolve(options.db||process.env[environment.databasePath]||join(root,defaults.databaseRelativePath));
  const organization=options.organization||process.env[environment.organizationId]||defaults.organizationId;
  if(!existsSync(dbPath))throw new Error('Base SQLite introuvable : '+dbPath);
  const manifestCheck=assertManifest();
  const packPresence=packFiles.map(name=>({name,path:join(here,name),present:existsSync(join(here,name))}));
  const missingPacks=packPresence.filter(item=>!item.present);
  const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON');
  const before=snapshot(db),checks=runChecks(db);db.close();
  const replayResult=options.replayPacks?replay(dbPath,organization,options.packs||[]):null;
  let afterReplayChecks=null,finalSnapshot=before;
  if(replayResult?.afterSecond){
    const finalDb=new DatabaseSync(dbPath);finalDb.exec('PRAGMA foreign_keys=ON');finalSnapshot=snapshot(finalDb);afterReplayChecks=runChecks(finalDb);finalDb.close();
  }
  const allAnomalies=[...checks.anomalies,...(afterReplayChecks?.anomalies||[])];
  for(const item of missingPacks)allAnomalies.push(anomaly('missing_pack','batinova-xl',{name:item.name,path:item.path}));
  if(replayResult&&!replayResult.replayStable)allAnomalies.push(anomaly('replay_not_idempotent','batinova-xl',{secondDelta:replayResult.secondDelta||null,error:replayResult.error||null}));
  return {
    pack:'integrity-volume-pack',
    mode:'SIMULATION_READ_ONLY_CONTROL',
    organizationId:organization,
    databasePath:dbPath,
    manifest:manifestCheck,
    packPresence,
    created:{businessRows:0},
    rowsControlled:finalSnapshot.totalRows,
    tableCounts:finalSnapshot.tables,
    foreignKeys:(afterReplayChecks||checks).foreignKeys,
    foreignKeyCheckEmpty:(afterReplayChecks||checks).foreignKeyCheckEmpty,
    integrityCheck:(afterReplayChecks||checks).integrityCheck,
    duplicateCount:allAnomalies.filter(x=>x.type.startsWith('duplicate_')).length,
    anomalies:allAnomalies,
    replay:replayResult?{
      packs:replayResult.packs,
      beforeRows:replayResult.before.totalRows,
      afterFirstRows:replayResult.afterFirst?.totalRows??null,
      afterSecondRows:replayResult.afterSecond?.totalRows??null,
      firstDelta:replayResult.firstDelta||null,
      secondDelta:replayResult.secondDelta||null,
      stable:replayResult.replayStable,
      firstRuns:replayResult.firstRuns,
      secondRuns:replayResult.secondRuns
    }:null,
    snapshotHash:finalSnapshot.hash
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const args=parseArgs(process.argv.slice(2));
    const result=runIntegrityVolumePack({db:args.db,organization:args.organization,replayPacks:args.replayPacks,packs:args.packs});
    console.log(JSON.stringify(result,null,args.json?2:0));
    if(result.anomalies.length)process.exitCode=1;
  }catch(error){
    console.error(error?.stack||String(error));process.exitCode=1;
  }
}
