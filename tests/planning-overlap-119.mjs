import assert from 'node:assert/strict';
import {copyFileSync,mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
import {runCoreClientsProjectsCommercialPack} from '../scripts/simulation/batinova-xl/core-clients-projects-commercial-pack.mjs';
import {runFinanceStockPack} from '../scripts/simulation/batinova-xl/finance-stock-pack.mjs';
import {runClientFinanceStoriesPack} from '../scripts/simulation/batinova-xl/client-finance-stories-pack.mjs';
import {runAssetsFleetPack} from '../scripts/simulation/batinova-xl/assets-fleet-pack.mjs';
import {runProcurementBomChainPack} from '../scripts/simulation/batinova-xl/procurement-bom-chain-pack.mjs';
import {runPlanningPeoplePack} from '../scripts/simulation/batinova-xl/planning-people-pack.mjs';

const organizationId='org-local-owner';
const tempDir=mkdtempSync(join(tmpdir(),'socle-119-proof-'));
const dbPath=join(tempDir,'socle.sqlite');
copyFileSync(new URL('../scripts/simulation/batinova-xl/fixtures/socle-batinova-script1-final-2026-09-24.sqlite',import.meta.url),dbPath);
const db=new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys=ON');
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  if(db.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
  db.exec('BEGIN');
  try{
    db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
    db.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error}
}

function parse(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function workspace(){
  const row=db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  assert.ok(row,'workspace BatiNova requis');
  return parse(row.payload,{});
}
function imported(){return Boolean(db.prepare('SELECT 1 ok FROM field_data_imports WHERE organization_id=?').get(organizationId))}
function minutes(clock,fallback){const [h,m]=String(clock||fallback).split(':').map(Number);return h*60+m}
function overlap(a,b){
  return minutes(a.start_time,'07:00')<minutes(b.end_time,'16:00')&&minutes(b.start_time,'07:00')<minutes(a.end_time,'16:00');
}
function activeAssignments(){
  return db.prepare("SELECT id,organization_id,assignment_date,start_time,end_time,team_id,project_id,people_json,status,created_by,created_at,updated_by,updated_at FROM field_assignments WHERE organization_id=? AND COALESCE(status,'planned')<>'cancelled' ORDER BY assignment_date,start_time,id").all(organizationId);
}
function conflicts(){
  const state=workspace(),names=new Map((state.people||[]).map(p=>[String(p.id),String(p.name||p.id)])),jobs=new Map((state.jobs||[]).map(j=>[String(j.id),j]));
  const byKey=new Map();
  for(const row of activeAssignments())for(const personId of parse(row.people_json,[]).map(String)){
    const key=row.assignment_date+'|'+personId;if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(row);
  }
  const out=[];
  for(const [key,rows] of byKey)for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++)if(overlap(rows[i],rows[j])){
    const [date,personId]=key.split('|'),a=rows[i],b=rows[j],ja=jobs.get(String(a.project_id))||{},jb=jobs.get(String(b.project_id))||{};
    out.push({date,personId,personName:names.get(personId)||personId,
      a:{...a,projectName:String(ja.name||''),projectReference:String(ja.reference||'')},
      b:{...b,projectName:String(jb.name||''),projectReference:String(jb.reference||'')}});
  }
  return out;
}
function legacyInfo(row,state){
  const source=(state.assignments||[]).find(a=>String(a.id)===String(row.id));
  return {batxl:String(row.id).startsWith('BATXL-ASG-'),legacyPayload:Boolean(source),legacySource:source||null};
}
function evidenceForAnthony(){
  const state=workspace(),anthony=(state.people||[]).find(p=>p.name==='Anthony Simon');
  assert.ok(anthony,'Anthony Simon doit exister');
  const jobs=new Map((state.jobs||[]).map(j=>[String(j.id),j]));
  const rows=activeAssignments().filter(row=>['2026-09-28','2026-09-29'].includes(String(row.assignment_date))&&parse(row.people_json,[]).map(String).includes(String(anthony.id)));
  return {personId:String(anthony.id),rows:rows.map(row=>{const job=jobs.get(String(row.project_id))||{};return {...row,projectName:String(job.name||''),projectReference:String(job.reference||''),...legacyInfo(row,state)}})};
}
async function api(method,path,payload){
  const env={DB:{
    prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
    async batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);results.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}
  }};
  const headers={'oai-authenticated-user-id':'local-owner','x-socle-organization-id':organizationId,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return {status:response.status,body};
}

try{
  const initial=workspace(),anthonyInitial=(initial.people||[]).find(p=>p.name==='Anthony Simon');
  assert.ok(anthonyInitial,'fixture: Anthony Simon présent');
  console.log('PROOF119_INITIAL='+JSON.stringify({
    anthony:{id:String(anthonyInitial.id),name:anthonyInitial.name},
    legacyAssignments:(initial.assignments||[]).filter(a=>['2026-09-28','2026-09-29'].includes(String(a.date))&&((a.people||[]).map(String).includes(String(anthonyInitial.id))||(!(a.people||[]).length&&(initial.teams||[]).find(t=>String(t.id)===String(a.team))?.members?.map(String).includes(String(anthonyInitial.id))))),
    fieldImportAlreadyDone:imported(),
    fieldAssignmentCount:activeAssignments().length
  }));

  const phases=[];
  const phase=(name)=>phases.push({name,fieldImportDone:imported(),fieldAssignmentCount:activeAssignments().length,conflicts:conflicts().length});
  phase('migrations');
  runCoreClientsProjectsCommercialPack({database:db,organizationId});phase('core-commercial');
  await runFinanceStockPack({database:db,organizationId,worker});phase('finance-stock');
  runClientFinanceStoriesPack({database:db,organizationId});phase('client-finance-stories');
  runAssetsFleetPack({database:db,organizationId});phase('assets-fleet');
  runProcurementBomChainPack({database:db,organizationId});phase('procurement-bom');
  console.log('PROOF119_PRE_PLANNING='+JSON.stringify(phases));

  await runPlanningPeoplePack({database:db,organizationId,worker});
  phase('planning-people');
  const beforeImport={anthony:evidenceForAnthony(),conflicts:conflicts(),fieldImportDone:imported()};
  console.log('PROOF119_AFTER_PLANNING_BEFORE_IMPORT='+JSON.stringify(beforeImport));

  const response=await api('GET','/api/planning?from=2026-09-28&to=2026-09-29');
  assert.equal(response.status,200,'lecture planning OWNER déclenche import legacy');
  const afterImport={anthony:evidenceForAnthony(),conflicts:conflicts(),fieldImportDone:imported()};
  console.log('PROOF119_AFTER_LEGACY_IMPORT='+JSON.stringify(afterImport));

  assert.equal(afterImport.conflicts.length,0,'Invariant #119: aucune personne ne peut avoir deux affectations actives dont les horaires se chevauchent');
}finally{
  db.close();
  rmSync(tempDir,{recursive:true,force:true});
}
