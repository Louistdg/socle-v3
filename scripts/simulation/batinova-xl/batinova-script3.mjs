import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const dbPath=resolve(process.env.BATXL_DB_PATH||join(root,'data','socle.sqlite'));
const organizationId=process.env.BATXL_ORGANIZATION_ID||'org-local-owner';
const standardDb=resolve(join(root,'data','socle.sqlite'));

if(dbPath!==standardDb)throw new Error('BATINOVA_SCRIPT_3 exige la base standard data/socle.sqlite pour garantir que tous les packs utilisent la même base.');
if(!existsSync(dbPath))throw new Error('BATINOVA_SCRIPT_3: base absente '+dbPath);

const steps=[
  ['migrations',join(root,'scripts','batinova-script2.mjs'),['--migrate-only']],
  ['core-commercial',join(here,'core-clients-projects-commercial-pack.mjs'),[]],
  ['finance-stock',join(here,'finance-stock-pack.mjs'),[]],
  ['client-finance-stories',join(here,'client-finance-stories-pack.mjs'),[]],
  ['assets-fleet',join(here,'assets-fleet-pack.mjs'),[]],
  ['procurement-bom',join(here,'procurement-bom-chain-pack.mjs'),[]],
  ['planning-people',join(here,'planning-people-pack.mjs'),[]],
  ['labor-cost',join(here,'labor-cost-baseline-pack.mjs'),[]],
  ['material-cost-stories',join(here,'material-cost-stories-pack.mjs'),[]],
  ['documents',join(here,'documents-pack.mjs'),[]],
  ['field-operations-stories',join(here,'field-operations-stories-pack.mjs'),[]]
];

const results=[];
for(const [name,file,args] of steps){
  if(!existsSync(file))throw new Error('BATINOVA_SCRIPT_3: fichier manquant '+file);
  const run=spawnSync(process.execPath,['--experimental-sqlite',file,...args],{
    cwd:root,
    env:{...process.env,BATXL_DB_PATH:dbPath,BATXL_ORGANIZATION_ID:organizationId,BATXL_SIMULATION:'1'},
    encoding:'utf8',
    maxBuffer:32*1024*1024
  });
  const result={name,file,exitCode:run.status??1,signal:run.signal||null,stdout:String(run.stdout||'').trim(),stderr:String(run.stderr||'').trim()};
  results.push(result);
  if(result.exitCode!==0){
    console.error(JSON.stringify({status:'FAIL',organizationId,dbPath,failed:name,results},null,2));
    process.exit(1);
  }
}

console.log('BATINOVA_SCRIPT_3=PASS');
console.log(JSON.stringify({status:'PASS',organizationId,dbPath,steps:results.map(r=>({name:r.name,exitCode:r.exitCode}))},null,2));
