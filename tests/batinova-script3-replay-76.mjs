import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync,cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const root=fileURLToPath(new URL('../',import.meta.url));
const temporaryRoot=realpathSync(tmpdir());
const runtime=mkdtempSync(join(temporaryRoot,'socle-script3-replay-'));
const databasePath=join(runtime,'data','socle.sqlite');
const candidatePath=join(root,'data','socle.sqlite');
const hash=path=>existsSync(path)?createHash('sha256').update(readFileSync(path)).digest('hex'):null;
const candidateBefore=hash(candidatePath);
const quote=name=>'"'+name.replaceAll('"','""')+'"';

function run(name,args=[]){
  const file=join(runtime,'scripts','simulation','batinova-xl',name);
  const result=spawnSync(process.execPath,['--experimental-sqlite',file,...args],{
    cwd:runtime,
    env:{...process.env,BATXL_DB_PATH:databasePath,BATXL_ORGANIZATION_ID:'org-local-owner',BATXL_SIMULATION:'1',SOCLE_QA_DB:databasePath,SOCLE_QA_ORGANIZATION_ID:'org-local-owner',SOCLE_QA_BASE_URL:'',BATXL_EXPECT_FINGERPRINT:''},
    encoding:'utf8',maxBuffer:32*1024*1024,timeout:120_000,windowsHide:true
  });
  assert.equal(result.error,undefined,String(result.error));
  return result;
}

function snapshot(){
  const db=new DatabaseSync(databasePath,{readOnly:true});
  try{
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    const counts=Object.fromEntries(tables.map(table=>[table,Number(db.prepare('SELECT COUNT(*) count FROM '+quote(table)).get().count)]));
    const identifiers=Object.fromEntries(tables.map(table=>{
      const primary=db.prepare('PRAGMA table_info('+quote(table)+')').all().filter(column=>column.pk).sort((a,b)=>a.pk-b.pk).map(column=>quote(column.name));
      return [table,primary.length?db.prepare('SELECT '+primary.join(',')+' FROM '+quote(table)+' ORDER BY '+primary.join(',')).all():[]];
    }));
    const stock=Object.fromEntries(['stock_locations','stock_balances','field_stock_items','field_stock_movements'].map(table=>[
      table,db.prepare('SELECT * FROM '+quote(table)).all().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
    ]));
    const finance=Object.fromEntries(['field_delivery_notes','field_delivery_lines','expenses','supplier_allocations','supplier_payments','project_financial_baselines','project_cost_budgets','invoices','payments','credit_notes'].map(table=>[
      table,db.prepare('SELECT * FROM '+quote(table)).all().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
    ]));
    const workspace=db.prepare('SELECT organization_id,payload FROM organization_workspace_state ORDER BY organization_id').all().map(row=>({organizationId:row.organization_id,payload:JSON.parse(row.payload)}));
    const locations=db.prepare('SELECT id,name,type,status FROM stock_locations WHERE organization_id=? ORDER BY id').all('org-local-owner');
    const foreignKeys=db.prepare('PRAGMA foreign_key_check').all();
    const integrity=db.prepare('PRAGMA integrity_check').all().map(row=>row.integrity_check);
    return {counts,identifiers,stock,finance,workspace,locations,foreignKeys,integrity};
  }finally{db.close();}
}

try{
  // Script3 exige data/socle.sqlite : copier son runtime évite de toucher à la candidate.
  for(const directory of ['scripts','worker','drizzle'])cpSync(join(root,directory),join(runtime,directory),{recursive:true});
  copyFileSync(join(root,'package.json'),join(runtime,'package.json'));
  mkdirSync(join(runtime,'data'));
  copyFileSync(join(root,'scripts','simulation','batinova-xl','fixtures','socle-batinova-script1-final-2026-09-24.sqlite'),databasePath);
  const first=run('batinova-script3.mjs');
  assert.equal(first.status,0,'Script3 run 1 doit réussir.\n'+first.stderr);
  assert.match(first.stdout,/^BATINOVA_SCRIPT_3=PASS/);
  const before=snapshot();
  console.log('SCRIPT3_RUN1=0 LOCATIONS='+JSON.stringify(before.locations));
  assert.equal(before.locations.filter(row=>row.status==='active'&&row.type!=='project').length,3,'Trois emplacements permanents actifs sont requis.');
  assert.ok(before.locations.some(row=>row.id==='BATXL-MATSTORY-LOC-PRJ008'&&row.type==='project'&&row.status==='active'),'Le pack matériel doit conserver son emplacement chantier temporaire.');
  assert.deepEqual(before.foreignKeys,[]);
  assert.deepEqual(before.integrity,['ok']);

  const second=run('batinova-script3.mjs');
  assert.equal(second.status,0,'Script3 run 2 doit réussir.\n'+second.stderr);
  assert.match(second.stdout,/^BATINOVA_SCRIPT_3=PASS/);
  const after=snapshot();
  assert.deepEqual(after.counts,before.counts,'Tous les compteurs de tables doivent rester stables au replay.');
  assert.deepEqual(after.identifiers,before.identifiers,'Toutes les clés primaires doivent être conservées.');
  assert.deepEqual(after.stock,before.stock,'Emplacements, états, soldes, articles et mouvements stock doivent être identiques.');
  assert.deepEqual(after.finance,before.finance,'Livraisons, dépenses, ventilations, paiements et budgets doivent rester identiques.');
  assert.deepEqual(after.workspace,before.workspace,'Le payload métier du workspace doit rester identique ; la révision technique ne fait pas partie du payload.');
  assert.deepEqual(after.foreignKeys,[]);
  assert.deepEqual(after.integrity,['ok']);
  const qa=run('qa-report.mjs',['--db='+databasePath,'--organization=org-local-owner','--require-targets','--json']);
  assert.equal(qa.status,0,'La QA doit rester verte après le replay.\n'+qa.stderr);
  const qaReport=JSON.parse(qa.stdout);
  assert.equal(qaReport.databasePath,databasePath,'La QA doit examiner la base rejouée.');
  assert.equal(qaReport.organizationId,'org-local-owner');
  assert.equal(qaReport.api.enabled,false,'La QA hermétique ne doit appeler aucun serveur existant.');
  assert.deepEqual(qaReport.anomalies,[]);
  console.log('SCRIPT3_RUN2=0 REPLAY_COUNTERS=STABLE REPLAY_IDS=STABLE REPLAY_STOCK=STABLE REPLAY_FINANCE=STABLE REPLAY_WORKSPACE=STABLE FOREIGN_KEY_CHECK=[] INTEGRITY_CHECK=ok QA=PASS');
  console.log('SCRIPT3_REPLAY_COUNTS='+JSON.stringify(after.counts));

  // Un quatrième emplacement permanent doit toujours faire échouer la calibration.
  const db=new DatabaseSync(databasePath);
  try{
    db.prepare("INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) SELECT 'REPLAY-EXTRA-WAREHOUSE',organization_id,'Dépôt supplémentaire test','warehouse','active',created_by,created_at,updated_by,updated_at FROM stock_locations WHERE organization_id=? AND type='warehouse' LIMIT 1").run('org-local-owner');
  }finally{db.close();}
  const invalid=run('finance-stock-pack.mjs');
  assert.notEqual(invalid.status,0,'La contrainte exactement trois ne doit pas être supprimée.');
  assert.match(invalid.stderr,/calibration exige exactement 3 emplacements.*obtenu=4/);
  console.log('FINANCE_STOCK_EXTRA_PERMANENT_REJECTED=PASS');
}finally{
  assert.equal(hash(candidatePath),candidateBefore,'La candidate du dépôt doit rester intacte.');
  const actualRuntime=realpathSync(runtime);
  assert.equal(dirname(actualRuntime),temporaryRoot,'Nettoyage limité au runtime temporaire créé.');
  assert.match(basename(actualRuntime),/^socle-script3-replay-[^\\/]+$/);
  rmSync(actualRuntime,{recursive:true,force:true});
}
