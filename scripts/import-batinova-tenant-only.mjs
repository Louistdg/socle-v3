import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {openProductionDatabase} from './production-db.mjs';

export const BATINOVA_IAE_SHA256='FE6EB2C61C8D65220D5D6DB2BB9EE55055344394857BF27F2859458287C66897';
export const BATINOVA_IAE_DATASET='QA-BATXL-DEF-2026-10-01';
export const DEFAULT_BATINOVA_ORGANIZATION_ID='org-batinova-iae-2026-10-01';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const excludedTables=new Set([
  'local_migrations','organization_members','local_test_identities','local_test_sessions',
  'production_credentials','production_sessions','organization_invitations','project_access','document_access_grants',
  'member_access_settings','conversation_participants','partner_grants','partner_requests','workspace_state'
]);
const outOfLineTables=new Set(['role_permissions','project_cost_budgets','stock_balances']);
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
const quote=id=>'"'+String(id).replaceAll('"','""')+'"';

export function parseImportCliArgs(args){
  const optionKeys=new Map([
    ['--source','sourcePath'],
    ['--target','targetPath'],
    ['--organization-id','organizationId']
  ]);
  const parsed={};
  for(let index=0;index<args.length;index++){
    const flag=args[index],key=optionKeys.get(flag);
    if(!key)throw new Error(`Option inconnue pour l’import tenant-only: ${String(flag)}`);
    if(Object.hasOwn(parsed,key))throw new Error(`Option répétée: ${flag}`);
    const value=args[index+1];
    if(typeof value!=='string'||!value.trim()||value.startsWith('--')){
      throw new Error(`Valeur manquante ou invalide pour ${flag}.`);
    }
    parsed[key]=value;
    index++;
  }
  if(!parsed.sourcePath)throw new Error('Option requise absente: --source <artefact-IA-E>.');
  if(!parsed.targetPath)throw new Error('Option requise absente: --target <base-SQLite-cible>.');
  parsed.organizationId??=DEFAULT_BATINOVA_ORGANIZATION_ID;
  if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(parsed.organizationId)){
    throw new Error('Valeur invalide pour --organization-id: identifiant tenant mal formé.');
  }
  return parsed;
}

function stringifyActor(value,map){
  if(typeof value==='string')return map.get(value)||value;
  if(Array.isArray(value))return value.map(item=>stringifyActor(item,map));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,stringifyActor(item,map)]));
  return value;
}
function transformJson(value,map){
  if(typeof value!=='string')return value;
  try{return JSON.stringify(stringifyActor(JSON.parse(value),map))}catch{return value}
}
function displayName(profile){return [profile.first_name,profile.last_name].filter(Boolean).join(' ').trim()||profile.id}
function allRows(db,table){return db.prepare(`SELECT * FROM ${quote(table)}`).all()}
function tables(db){return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name)}
function columns(db,table){return db.prepare(`PRAGMA table_info(${quote(table)})`).all().map(row=>row.name)}
function profileForeignKeys(db,table){return db.prepare(`PRAGMA foreign_key_list(${quote(table)})`).all().filter(fk=>fk.table==='profiles').map(fk=>fk.from)}
function insertRow(db,table,row){
  const names=Object.keys(row),sql=`INSERT INTO ${quote(table)} (${names.map(quote).join(',')}) VALUES (${names.map(()=>'?').join(',')})`;
  db.prepare(sql).run(...names.map(name=>row[name]));
}
function stockSnapshotTriggers(){
  const migration=readFileSync(join(root,'drizzle','0012_stock_locations.sql'),'utf8');
  const statements=[...migration.matchAll(/CREATE TRIGGER IF NOT EXISTS stock_movement_(?:validate_before_insert|apply_after_insert)[\s\S]*?^END;/gm)].map(match=>match[0]);
  if(statements.length!==2)throw Error('Les triggers de stock 0012 n’ont pas été trouvés intégralement.');
  return statements;
}

export function importBatiNovaTenantOnly({sourcePath,targetPath,organizationId=DEFAULT_BATINOVA_ORGANIZATION_ID}={}){
  if(!sourcePath||!targetPath)throw new TypeError('Les chemins source et copie cible sont requis.');
  const sourceFile=resolve(sourcePath),targetFile=resolve(targetPath);
  if(!existsSync(sourceFile)||!existsSync(targetFile))throw Error('La source et la copie cible doivent déjà exister.');
  const sourceSha=digest(sourceFile);
  if(sourceSha!==BATINOVA_IAE_SHA256)throw Error(`SHA IA-E inattendu: ${sourceSha}`);
  const source=new DatabaseSync(sourceFile,{readOnly:true});
  const storage=openProductionDatabase({databasePath:targetFile,migrationsDirectory:join(root,'drizzle')});
  const target=storage.database;
  try{
    const sourceOrg=source.prepare("SELECT * FROM organizations WHERE name LIKE '%BatiNova%' ORDER BY id LIMIT 1").get();
    if(!sourceOrg)throw Error('Organisation BatiNova absente de la source.');
    const done=target.prepare('SELECT source_sha256 FROM tenant_imports WHERE organization_id=?').get(organizationId);
    if(done){
      if(done.source_sha256!==sourceSha)throw Error('Un autre artefact est déjà enregistré pour ce tenant.');
      return {status:'already-imported',organizationId,sourceSha,actorCount:Number(target.prepare('SELECT COUNT(*) n FROM provenance_actor_map WHERE organization_id=?').get(organizationId).n)};
    }
    if(target.prepare('SELECT 1 FROM organizations WHERE id=?').get(organizationId))throw Error('ID tenant déjà utilisé sans manifeste d’import; refus d’écraser.');

    const sourceTableNames=tables(source),scoped=sourceTableNames.filter(name=>!excludedTables.has(name)&&!outOfLineTables.has(name)&&columns(source,name).includes('organization_id'));
    const rowsByTable=new Map(scoped.map(table=>[table,source.prepare(`SELECT * FROM ${quote(table)} WHERE organization_id=?`).all(sourceOrg.id)]));
    const sourceProfiles=new Map(source.prepare('SELECT * FROM profiles').all().map(profile=>[profile.id,profile]));
    const sourcePersonByProfile=new Map(source.prepare('SELECT user_id,person_id FROM organization_members WHERE organization_id=? AND person_id IS NOT NULL').all(sourceOrg.id).map(row=>[row.user_id,String(row.person_id)]));
    const actorIds=new Set();
    for(const table of scoped){
      const profileCols=profileForeignKeys(source,table);
      const jsonCols=columns(source,table).filter(col=>col.endsWith('_json')||col==='old_values'||col==='new_values'||col==='summary_json'||col==='payload');
      for(const row of rowsByTable.get(table)){
        for(const col of profileCols)if(row[col]!=null)actorIds.add(String(row[col]));
        for(const col of jsonCols){
          let parsed;try{parsed=JSON.parse(row[col]||'null')}catch{continue;}
          const collect=value=>{if(typeof value==='string'&&sourceProfiles.has(value))actorIds.add(value);else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect)};
          collect(parsed);
        }
        if(table==='audit_logs'&&sourceProfiles.has(String(row.entity_id)))actorIds.add(String(row.entity_id));
        if(table==='organization_workspace_state'&&row.source_user_id&&sourceProfiles.has(String(row.source_user_id)))actorIds.add(String(row.source_user_id));
      }
    }
    for(const id of actorIds)if(!sourceProfiles.has(id))throw Error(`Auteur source sans profil explicatif: ${id}`);
    const actorMap=new Map([...actorIds].map(id=>[id,`provenance:${organizationId}:${id}`]));
    target.exec('PRAGMA defer_foreign_keys=ON; BEGIN IMMEDIATE');
    try{
      target.exec('DROP TRIGGER IF EXISTS stock_movement_validate_before_insert; DROP TRIGGER IF EXISTS stock_movement_apply_after_insert;');
      const org={...sourceOrg,id:organizationId};insertRow(target,'organizations',org);
      for(const sourceId of actorIds){
        const profile=sourceProfiles.get(sourceId),profileId=actorMap.get(sourceId);
        insertRow(target,'profiles',{id:profileId,first_name:profile.first_name,last_name:profile.last_name,email:null,phone:null,avatar_url:null,created_at:profile.created_at,updated_at:profile.updated_at,identity_kind:'provenance'});
        insertRow(target,'provenance_actor_map',{organization_id:organizationId,source_profile_id:sourceId,profile_id:profileId,source_person_id:sourcePersonByProfile.get(sourceId)||null,display_name:displayName(profile),source_dataset:BATINOVA_IAE_DATASET});
      }
      for(const table of scoped){
        const fks=profileForeignKeys(source,table);
        for(const original of rowsByTable.get(table)){
          const row={...original,organization_id:organizationId};
          for(const col of fks)if(row[col]!=null)row[col]=actorMap.get(String(row[col]))||row[col];
          for(const col of columns(source,table).filter(col=>col.endsWith('_json')||col==='old_values'||col==='new_values'||col==='summary_json'||col==='payload'))row[col]=transformJson(row[col],actorMap);
          if(table==='organization_workspace_state'&&row.payload){
            const payload=JSON.parse(row.payload);
            payload.accessAssignments={};
            row.payload=JSON.stringify(payload);
          }
          if(table==='audit_logs'&&actorMap.has(String(row.entity_id)))row.entity_id=actorMap.get(String(row.entity_id));
          if(table==='organization_workspace_state'&&row.source_user_id)row.source_user_id=actorMap.get(String(row.source_user_id))||row.source_user_id;
          insertRow(target,table,row);
        }
      }
      const roleIds=rowsByTable.get('roles').map(row=>row.id);
      if(roleIds.length){
        const q=roleIds.map(()=>'?').join(',');
        for(const row of source.prepare(`SELECT * FROM role_permissions WHERE role_id IN (${q})`).all(...roleIds))insertRow(target,'role_permissions',row);
      }
      const baselineIds=rowsByTable.get('project_financial_baselines').map(row=>row.id);
      if(baselineIds.length){const q=baselineIds.map(()=>'?').join(',');for(const row of source.prepare(`SELECT * FROM project_cost_budgets WHERE baseline_id IN (${q})`).all(...baselineIds))insertRow(target,'project_cost_budgets',row)}
      const stockIds=rowsByTable.get('field_stock_items').map(row=>row.id);
      if(stockIds.length){const q=stockIds.map(()=>'?').join(',');for(const original of source.prepare(`SELECT * FROM stock_balances WHERE stock_item_id IN (${q})`).all(...stockIds))insertRow(target,'stock_balances',{...original,organization_id:organizationId})}
      for(const statement of stockSnapshotTriggers())target.exec(statement);
      insertRow(target,'tenant_imports',{organization_id:organizationId,source_dataset:BATINOVA_IAE_DATASET,source_sha256:sourceSha,imported_at:new Date().toISOString()});
      const fkFailures=target.prepare('PRAGMA foreign_key_check').all();
      if(fkFailures.length)throw Error('foreign_key_check échoue après import: '+JSON.stringify(fkFailures.slice(0,25)));
      const integrity=target.prepare('PRAGMA integrity_check').all();
      if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw Error('integrity_check échoue après import.');
      target.exec('COMMIT');
    }catch(error){try{target.exec('ROLLBACK')}catch{}throw error}
    return {status:'imported',organizationId,sourceSha,actorCount:actorIds.size,tableCount:scoped.length,rowCount:[...rowsByTable.values()].reduce((sum,rows)=>sum+rows.length,0)};
  }finally{source.close();storage.close()}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const options=parseImportCliArgs(process.argv.slice(2));
    const result=importBatiNovaTenantOnly(options);
    console.log(JSON.stringify(result,null,2));
  }catch(error){
    console.error(`Import tenant-only arrêté: ${error instanceof Error?error.message:String(error)}`);
    process.exitCode=1;
  }
}
