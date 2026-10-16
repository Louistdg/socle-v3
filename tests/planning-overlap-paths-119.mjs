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
function parse(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function minutes(clock,fallback){const [h,m]=String(clock||fallback).split(':').map(Number);return h*60+m}
function overlaps(a,b){return minutes(a.start_time,'07:00')<minutes(b.end_time,'16:00')&&minutes(b.start_time,'07:00')<minutes(a.end_time,'16:00')}
function makeDb(){
  const dir=mkdtempSync(join(tmpdir(),'socle-119-path-')),path=join(dir,'socle.sqlite');
  copyFileSync(new URL('../scripts/simulation/batinova-xl/fixtures/socle-batinova-script1-final-2026-09-24.sqlite',import.meta.url),path);
  const db=new DatabaseSync(path);db.exec('PRAGMA foreign_keys=ON');db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    if(db.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
    db.exec('BEGIN');try{db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));db.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
  }
  return {db,dir};
}
function state(db){return parse(db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId).payload,{})}
function conflictRows(db){
  const workspace=state(db),names=new Map((workspace.people||[]).map(p=>[String(p.id),String(p.name||p.id)]));
  const jobs=new Map((workspace.jobs||[]).map(j=>[String(j.id),j]));
  const rows=db.prepare("SELECT id,organization_id,assignment_date,start_time,end_time,team_id,project_id,people_json,status,created_by,created_at,updated_by,updated_at FROM field_assignments WHERE organization_id=? AND status<>'cancelled' ORDER BY assignment_date,start_time,id").all(organizationId);
  const grouped=new Map();
  for(const row of rows)for(const personId of parse(row.people_json,[]).map(String)){
    const key=row.assignment_date+'|'+personId;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);
  }
  const found=[];
  for(const [key,list] of grouped)for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++)if(overlaps(list[i],list[j])){
    const [date,personId]=key.split('|'),a=list[i],b=list[j],ja=jobs.get(String(a.project_id))||{},jb=jobs.get(String(b.project_id))||{};
    found.push({date,personId,personName:names.get(personId)||personId,a:{...a,projectName:ja.name||'',projectReference:ja.reference||''},b:{...b,projectName:jb.name||'',projectReference:jb.reference||''}});
  }
  return found;
}
function env(db){return{DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}}}
async function api(db,method,path,payload){
  const headers={'oai-authenticated-user-id':'local-owner','x-socle-organization-id':organizationId,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env(db));
  let body={};try{body=await response.json()}catch{}return{status:response.status,body};
}
async function prePlanning(db){
  runCoreClientsProjectsCommercialPack({database:db,organizationId});
  await runFinanceStockPack({database:db,organizationId,worker});
  runClientFinanceStoriesPack({database:db,organizationId});
  runAssetsFleetPack({database:db,organizationId});
  runProcurementBomChainPack({database:db,organizationId});
}
function anthony(db){const p=(state(db).people||[]).find(x=>x.name==='Anthony Simon');assert.ok(p);return p}
function ownerId(db){return String(db.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' LIMIT 1").get(organizationId).user_id)}

const failures=[];

// Probe A — legacy import bypasses the normal assignment API conflict guard.
{
  const {db,dir}=makeDb();
  try{
    await prePlanning(db);await runPlanningPeoplePack({database:db,organizationId,worker});
    const a=anthony(db),w=state(db),canonical=db.prepare("SELECT * FROM field_assignments WHERE organization_id=? AND id='BATXL-ASG-20260928-T01'").get(organizationId);
    assert.ok(canonical,'affectation canonique Anthony 28/09 requise');
    const otherTeam=(w.teams||[]).find(t=>String(t.id)!==String(canonical.team_id))||w.teams[1];
    const otherProject=(w.jobs||[]).find(j=>String(j.id)!==String(canonical.project_id))||w.jobs[1];
    const next=structuredClone(w);next.assignments=[...(next.assignments||[]),{id:'legacy-overlap-119-20260928',date:'2026-09-28',job:otherProject.id,team:otherTeam.id,people:[a.id],startTime:'07:00',endTime:'16:00'}];
    db.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,updated_at=? WHERE organization_id=?').run(JSON.stringify(next),'2026-10-03T21:30:00.000Z',organizationId);
    db.prepare('DELETE FROM field_data_imports WHERE organization_id=?').run(organizationId);
    const response=await api(db,'GET','/api/planning?from=2026-09-28&to=2026-09-28');
    assert.equal(response.status,200);
    const found=conflictRows(db).filter(x=>x.personId===String(a.id)&&x.date==='2026-09-28');
    const imported=db.prepare("SELECT * FROM field_assignments WHERE organization_id=? AND id='legacy-overlap-119-20260928'").get(organizationId)||null;
    const audit=db.prepare("SELECT new_values FROM audit_logs WHERE organization_id=? AND action='field_data.legacy_imported' ORDER BY created_at DESC,id DESC LIMIT 1").get(organizationId);
    const auditValues=parse(audit?.new_values||'{}',{});
    console.log('PROOF119_LEGACY_RESULT='+JSON.stringify({conflicts:found,imported,audit:auditValues}));
    if(found.length)failures.push('legacy_import_bypass:'+found.length);
    assert.equal(imported,null,'legacy conflictuel ne doit pas être importé par-dessus une affectation active');
    assert.ok(Number(auditValues.assignments_skipped_conflict||0)>=1,'skip legacy conflictuel audité');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{db.close();rmSync(dir,{recursive:true,force:true})}
}

// Probe B — a stale BATXL simulation row with another id is ignored by choosePeriod and survives replay.
{
  const {db,dir}=makeDb();
  try{
    await prePlanning(db);
    const a=anthony(db),w=state(db),owner=ownerId(db),team=(w.teams||[])[3]||(w.teams||[])[1],project=(w.jobs||[])[7]||(w.jobs||[])[1];
    for(const date of ['2026-09-28','2026-09-29']){
      const id='BATXL-ASG-STALE-'+date.replaceAll('-','')+'-X';
      db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at,start_time,end_time,assignment_type,status,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(id,organizationId,date,String(team.id),String(project.id),JSON.stringify([String(a.id)]),null,'BATXL-PACK-PLANNING','',owner,date+'T04:30:00.000Z',owner,date+'T04:30:00.000Z','07:00','16:00','team','planned','stale simulation row #119');
    }
    const first=await runPlanningPeoplePack({database:db,organizationId,worker});
    const found=conflictRows(db).filter(x=>x.personId===String(a.id)&&['2026-09-28','2026-09-29'].includes(x.date));
    const staleRows=db.prepare("SELECT id,status,reason,project_id,team_id,people_json FROM field_assignments WHERE organization_id=? AND id LIKE 'BATXL-ASG-STALE-%' ORDER BY id").all(organizationId);
    const activeAnthony=db.prepare("SELECT id,assignment_date,start_time,end_time,project_id,team_id,people_json,status FROM field_assignments WHERE organization_id=? AND status<>'cancelled' AND assignment_date IN ('2026-09-28','2026-09-29') AND people_json LIKE ? ORDER BY assignment_date,id").all(organizationId,'%\"'+String(a.id)+'\"%');
    const snapshot=()=>db.prepare("SELECT id,assignment_date,start_time,end_time,project_id,team_id,people_json,status,reason,created_by,created_at,updated_by,updated_at FROM field_assignments WHERE organization_id=? AND id LIKE 'BATXL-ASG-%' ORDER BY id").all(organizationId);
    const beforeReplay=snapshot(),second=await runPlanningPeoplePack({database:db,organizationId,worker}),afterReplay=snapshot();
    console.log('PROOF119_BATXL_RECONCILIATION='+JSON.stringify({conflicts:found,staleRows,activeAnthony,firstAssignments:first.assignments,secondAssignments:second.assignments}));
    if(found.length)failures.push('batxl_replay_bypass:'+found.length);
    assert.equal(staleRows.length,2,'deux lignes BATXL historiques de la sonde sont retrouvées');
    assert.ok(staleRows.every(row=>row.status==='cancelled'&&String(row.reason).includes('BATXL #119')),'seules les lignes BATXL obsolètes sont neutralisées');
    assert.deepEqual(activeAnthony.map(row=>row.id),['BATXL-ASG-20260928-T01','BATXL-ASG-20260929-T01'],'Anthony garde uniquement les deux affectations canoniques actives');
    assert.equal(first.assignments,87,'snapshot BATXL actif reste à 87 affectations');
    assert.equal(second.assignments,87,'replay conserve 87 affectations actives');
    assert.deepEqual(afterReplay,beforeReplay,'replay BATXL x2 strictement idempotent après réconciliation');
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  }finally{db.close();rmSync(dir,{recursive:true,force:true})}
}

if(failures.length){
  console.error('PROOF119_EXPECTED_FAILURES='+JSON.stringify(failures));
  assert.deepEqual(failures,[],'#119: les chemins import/replay ne doivent jamais créer ou conserver un overlap actif');
}
console.log('planning-overlap-paths-119: PASS');
