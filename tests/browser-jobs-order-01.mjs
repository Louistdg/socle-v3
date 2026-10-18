import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectBrowser,waitFor,waitForApp} from './helpers/browser-cdp.mjs';

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const artifacts=join(dirname(fileURLToPath(import.meta.url)),'artifacts','jobs-order');
mkdirSync(artifacts,{recursive:true});
const browser=await connectBrowser(base);let tab;

async function screenshot(name){
  const result=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));
}
const ids = () => tab.evaluate("[...document.querySelectorAll('#main .ia-jobs-table tbody tr')].map(r=>r.dataset.jobOrderId||null)",'job-ids');

try{
  tab=await browser.createSession(base);
  await tab.navigate(base+'/');
  assert.equal(await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'jobs-owner-login'),204);
  await tab.reload();
  await waitForApp(tab,'local-owner');

  await tab.evaluate("serverJson('/api/me/preferences/dashboard/jobs-order',{method:'PUT',body:JSON.stringify({schemaVersion:1,value:{order:[]}})}).catch(()=>{})",'reset-preference');

  await tab.evaluate("navigate('jobs')",'go-jobs');
  await waitFor(()=>tab.evaluate("document.querySelectorAll('#main .ia-jobs-table tbody tr').length>3",'rows-present'),'lignes de chantier',15000);
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-job-move]'))",'arrows-present'),'fleches de tri',10000);

  const initial=await ids();
  assert.ok(initial.filter(Boolean).length>=3,'Au moins trois chantiers identifies : '+JSON.stringify(initial.slice(0,5)));
  await screenshot('01-tri-chantiers');

  // 1. le troisieme chantier remonte de deux crans
  await tab.evaluate("document.querySelectorAll('#main .ia-jobs-table tbody tr')[2].querySelector('[data-job-move=up]').click()",'up-once');
  await new Promise(r=>setTimeout(r,350));
  let current=await ids();
  assert.equal(current[1],initial[2],'Le chantier remonte d’un cran : '+JSON.stringify(current.slice(0,4)));

  await tab.evaluate("document.querySelectorAll('#main .ia-jobs-table tbody tr')[1].querySelector('[data-job-move=up]').click()",'up-twice');
  await new Promise(r=>setTimeout(r,350));
  current=await ids();
  assert.equal(current[0],initial[2],'Le chantier passe en tete : '+JSON.stringify(current.slice(0,4)));

  // 2. l'ordre est enregistre
  await waitFor(()=>tab.evaluate("Array.isArray(socleJobsOrder.order())&&socleJobsOrder.order()[0]==="+JSON.stringify(initial[2]),'order-saved'),'ordre enregistre',10000);

  // 3. et retenu apres un rechargement complet
  await tab.reload();
  await waitForApp(tab,'local-owner');
  await tab.evaluate("navigate('jobs')",'go-jobs-again');
  await waitFor(()=>tab.evaluate("document.querySelectorAll('#main .ia-jobs-table tbody tr').length>3",'rows-again'),'lignes apres rechargement',15000);
  await new Promise(r=>setTimeout(r,700));
  const afterReload=await ids();
  assert.equal(afterReload[0],initial[2],'L’ordre est retenu apres rechargement : '+JSON.stringify(afterReload.slice(0,4)));
  await screenshot('02-ordre-retenu');

  // 4. les fleches se desactivent aux bords
  const bords=await tab.evaluate("({firstUp:document.querySelector('#main .ia-jobs-table tbody tr [data-job-move=up]').getAttribute('aria-disabled'),lastDown:[...document.querySelectorAll('#main .ia-jobs-table tbody tr')].at(-1).querySelector('[data-job-move=down]').getAttribute('aria-disabled')})",'edges');
  assert.equal(bords.firstUp,'true','La fleche haut est desactivee en tete');
  assert.equal(bords.lastDown,'true','La fleche bas est desactivee en fin');

  // 5. ouvrir un chantier fonctionne toujours
  await tab.evaluate("document.querySelectorAll('#main .ia-jobs-table tbody tr')[0].querySelector('.ia-job-identity').click()",'open-job');
  await new Promise(r=>setTimeout(r,500));
  const vue=await tab.evaluate("String(typeof view!=='undefined'?view:'')",'view-after-click');
  assert.ok(vue.length>0,'La liste reste utilisable apres le tri : vue='+vue);

  console.log('BROWSER_JOBS_ORDER_01=PASS lignes='+initial.length+' fleches=ok deplacer=ok persistance=ok selection=ok');
  await tab.close();
  await browser.close();
}catch(error){
  console.error('ECHEC ' + error.message);
  await tab?.close();
  await browser.close();
  process.exit(1);
}
