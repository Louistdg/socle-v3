import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectBrowser,waitFor,waitForApp} from './helpers/browser-cdp.mjs';

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const artifacts=join(dirname(fileURLToPath(import.meta.url)),'artifacts','job-tabs');
mkdirSync(artifacts,{recursive:true});
const browser=await connectBrowser(base);let tab;

async function screenshot(name){
  const result=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));
}
const labels = () => tab.evaluate("[...document.querySelectorAll('.job-workspace-tabs button')].filter(b=>b.dataset.jobTabKey).map(b=>b.textContent.trim())",'tab-labels');

try{
  tab=await browser.createSession(base);
  await tab.navigate(base+'/');
  assert.equal(await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'tabs-owner-login'),204);
  await tab.reload();
  await waitForApp(tab,'local-owner');

  await tab.evaluate("serverJson('/api/me/preferences/dashboard/job-tabs',{method:'PUT',body:JSON.stringify({schemaVersion:1,value:{order:[]}})}).then(r=>r.status)",'reset-preference');
  await tab.reload();
  await waitForApp(tab,'local-owner');

  const jobId=await tab.evaluate("String(jobs.filter(job=>String(job.phase||job.status||'')!=='Archivé')[0].id)",'first-job');
  await tab.evaluate(`openJobWorkspace(${JSON.stringify(jobId)})`,'open-job');
  await waitFor(()=>tab.evaluate("document.querySelectorAll('.job-workspace-tabs button[data-job-tab-key]').length>=6",'tabs-present'),'onglets presents',15000);
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('.job-tab-move [data-move]'))",'arrows-present'),'fleches presentes',10000);

  const initial=await labels();
  assert.ok(initial.length>=6,'Six onglets : '+JSON.stringify(initial));
  assert.equal(initial[0],'Résumé');
  await screenshot('01-fleches');

  // 1. le troisieme onglet remonte de deux crans, une fleche a la fois
  await tab.evaluate("document.querySelectorAll('.job-workspace-tabs button[data-job-tab-key]')[2].nextElementSibling.querySelector('[data-move=left]').click()",'move-left-once');
  await new Promise(r=>setTimeout(r,350));
  let current=await labels();
  assert.equal(current[1],initial[2],'L’onglet remonte d’un cran : '+JSON.stringify(current));

  await tab.evaluate("document.querySelectorAll('.job-workspace-tabs button[data-job-tab-key]')[1].nextElementSibling.querySelector('[data-move=left]').click()",'move-left-twice');
  await new Promise(r=>setTimeout(r,350));
  current=await labels();
  assert.equal(current[0],initial[2],'L’onglet passe en tete : '+JSON.stringify(current));

  // 2. l'ordre est enregistre puis retenu apres un rechargement complet
  await waitFor(()=>tab.evaluate("[...document.querySelectorAll('.job-workspace-tabs button[data-job-tab-key]')][0].textContent.trim()==="+JSON.stringify(initial[2]),'order-saved'),'ordre enregistre',10000);
  await waitFor(()=>tab.evaluate("Array.isArray(socleJobTabs.order())&&socleJobTabs.order().length===6",'order-persisted'),'ordre transmis au serveur',10000);
  await tab.reload();
  await waitForApp(tab,'local-owner');
  await tab.evaluate(`openJobWorkspace(${JSON.stringify(jobId)})`,'reopen-job');
  await waitFor(()=>tab.evaluate("document.querySelectorAll('.job-workspace-tabs button[data-job-tab-key]').length>=6",'tabs-again'),'onglets apres rechargement',15000);
  await new Promise(r=>setTimeout(r,700));
  const afterReload=await labels();
  assert.equal(afterReload[0],initial[2],'L’ordre est retenu apres rechargement : '+JSON.stringify(afterReload));
  await screenshot('02-ordre-retenu');

  // 3. les fleches se desactivent aux bords
  const bords=await tab.evaluate("({firstLeft:document.querySelector('.job-workspace-tabs button[data-job-tab-key]').nextElementSibling.querySelector('[data-move=left]').getAttribute('aria-disabled'),lastRight:[...document.querySelectorAll('.job-workspace-tabs button[data-job-tab-key]')].at(-1).nextElementSibling.querySelector('[data-move=right]').getAttribute('aria-disabled')})",'edges');
  assert.equal(bords.firstLeft,'true','La fleche gauche est desactivee en tete de liste');
  assert.equal(bords.lastRight,'true','La fleche droite est desactivee en fin de liste');

  // 4. choisir un onglet fonctionne toujours
  await tab.evaluate("document.querySelectorAll('.job-workspace-tabs button[data-job-tab-key]')[1].click()",'click-tab');
  await new Promise(r=>setTimeout(r,400));
  const selected=await tab.evaluate("document.querySelector('.job-workspace-tabs button.selected')?.textContent.trim()",'selected-tab');
  assert.ok(selected&&selected.length>0,'Un onglet est selectionne apres le clic : '+JSON.stringify(selected));

  // Le raccourci clavier (Ctrl + fleche) est en place dans le module mais ne se
  // verifie pas dans ce navigateur sans interface : il n'est donc pas affirme
  // ici. Les fleches, elles, sont prouvees ci-dessus.

  console.log('BROWSER_JOB_TABS_01=PASS onglets='+initial.length+' fleches=ok deplacer=ok persistance=ok selection=ok');
}finally{
  await tab?.close();
  await browser.close();
}
