import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const nodeMajor=Number(process.versions.node.split('.')[0]);
if(nodeMajor<22){
  console.error('SOCLE CI: Node 22+ est requis. Les suites SQLite ne sont pas exécutées sur Node '+process.versions.node+'.');
  process.exit(1);
}
const excluded=new Set(['browser-team-composer.mjs','browser-15.mjs','browser-identities-15.mjs','browser-regression-116.mjs','browser-mobile-navigation-129.mjs','browser-navigation-convergence-01.mjs','browser-ui-frame-audit-01.mjs','browser-home-person-scope-01.mjs','browser-multi-org-isolation-01.mjs','browser-ui-foundation-01.mjs','browser-stock-catalog-v2-01.mjs','browser-stock-barcode-01.mjs','browser-e2e-02-quote-preproject.mjs','browser-bl-scan-01ab.mjs','browser-access-preview-theme-contrast-01.mjs','browser-document-triage-20261012.mjs','browser-planning-drag-step2.mjs','browser-design-catalogue-01.mjs','data-15.mjs','browser-didactic-layer-01.mjs','browser-field-journal-01.mjs','browser-search-01.mjs','browser-planning-board-01.mjs','browser-attention-01.mjs','browser-task-folders-01.mjs','browser-task-spatial-desk-01.mjs','browser-document-folders-01.mjs','browser-job-canvas-01.mjs','browser-offline-01.mjs','browser-job-tabs-01.mjs','browser-jobs-order-01.mjs']);
const tests=readdirSync(join(root,'tests'))
  .filter(name=>name.endsWith('.mjs')&&!excluded.has(name))
  .sort();

if(tests.length===0){
  console.error('SOCLE CI: aucune suite métier hermétique détectée. Refus du faux succès.');
  process.exit(1);
}

for(const name of tests){
  console.log(`\n=== ${name} ===`);
  const result=spawnSync(process.execPath,['--experimental-sqlite',join(root,'tests',name)],{
    cwd:root,
    stdio:'inherit',
    env:process.env
  });
  if(result.status!==0){
    console.error(`\nÉCHEC: ${name}`);
    process.exit(result.status||1);
  }
}
console.log('\n=== verify-contrast.mjs ===');
const contrast=spawnSync(process.execPath,[join(root,'scripts/audit/verify-contrast.mjs')],{
  cwd:root,
  stdio:'inherit',
  env:process.env
});
if(contrast.status!==0){
  console.error('\nÉCHEC: scripts/audit/verify-contrast.mjs');
  process.exit(contrast.status||1);
}
console.log(`\nSOCLE CI: ${tests.length+1} suites hermétiques réussies.`);
console.log('Hors CI standard: browser-15.mjs, browser-identities-15.mjs, browser-regression-116.mjs, browser-mobile-navigation-129.mjs, browser-navigation-convergence-01.mjs, browser-ui-frame-audit-01.mjs, browser-home-person-scope-01.mjs, browser-multi-org-isolation-01.mjs, browser-ui-foundation-01.mjs, browser-stock-catalog-v2-01.mjs, browser-stock-barcode-01.mjs, browser-e2e-02-quote-preproject.mjs, browser-bl-scan-01ab.mjs, browser-access-preview-theme-contrast-01.mjs, browser-document-triage-20261012.mjs, browser-planning-drag-step2.mjs, browser-design-catalogue-01.mjs, browser-didactic-layer-01.mjs, browser-field-journal-01.mjs, browser-search-01.mjs, browser-planning-board-01.mjs, browser-attention-01.mjs, browser-task-folders-01.mjs, browser-document-folders-01.mjs, browser-job-canvas-01.mjs (Chromium/CDP) et data-15.mjs (simulation BatiNova externe).');
