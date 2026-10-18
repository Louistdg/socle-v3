import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectBrowser,waitFor,waitForApp} from './helpers/browser-cdp.mjs';

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const artifacts=join(dirname(fileURLToPath(import.meta.url)),'artifacts','offline');
mkdirSync(artifacts,{recursive:true});
const browser=await connectBrowser(base);let tab;
async function screenshot(name){const result=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(artifacts,name+'.png'),Buffer.from(result.data,'base64'));}
async function setOffline(flag){await tab.call('Network.enable',{});await tab.call('Network.emulateNetworkConditions',{offline:flag,latency:0,downloadThroughput:flag?0:-1,uploadThroughput:flag?0:-1});}

try{
  tab=await browser.createSession(base);await tab.navigate(base+'/');
  assert.equal(await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(response=>response.status)",'offline-owner-login'),204);
  await tab.reload();await waitForApp(tab,'local-owner');

  // 1. le service worker prend la main, et la photographie de l'entreprise est gardée
  await waitFor(()=>tab.evaluate("navigator.serviceWorker.ready.then(registration=>Boolean(registration.active))",'sw-active'),'service worker actif',15000);
  const snapshot=await tab.evaluate("socleOffline.readSnapshot().then(record=>({savedAt:record&&record.savedAt,jobs:record&&record.state&&record.state.jobs?record.state.jobs.length:0,company:record&&record.state&&record.state.company?record.state.company.name:''}))",'offline-snapshot');
  assert.ok(snapshot.jobs>=3,'La photographie contient les chantiers : '+JSON.stringify(snapshot));
  assert.ok(snapshot.savedAt,'La photographie porte une date');

  // 2. hors connexion, l'application s'ouvre quand meme
  const projects=await tab.evaluate("jobs.filter(job=>String(job.phase||job.status||'')!=='Archivé').slice(0,2).map(job=>({id:String(job.id),name:job.name}))",'offline-projects');
  assert.ok(projects.length>=1,'Au moins un chantier a noter');
  await setOffline(true);
  await tab.reload();
  await waitForApp(tab,'local-owner');
  const offlineState=await tab.evaluate("({jobs:typeof jobs!=='undefined'?jobs.length:0,online:navigator.onLine,banner:document.querySelector('[data-offline-banner]')?document.querySelector('[data-offline-banner]').innerText:''})",'offline-state');
  assert.equal(offlineState.online,false,'Le navigateur est bien hors connexion');
  assert.ok(offlineState.jobs>=3,'Les chantiers sont lisibles hors connexion : '+JSON.stringify(offlineState));
  assert.match(offlineState.banner,/Hors connexion/,'Le bandeau annonce l’état');
  await screenshot('01-hors-connexion');

  // 3. une note ecrite hors connexion attend sur le telephone
  await tab.evaluate(`openJobWorkspace(${JSON.stringify(projects[0].id)})`,'open-offline-job');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-offline-note-form]'))",'offline-note-form'),'formulaire de note present',15000);
  await tab.evaluate("(()=>{const form=document.querySelector('[data-offline-note-form]');form.querySelector('[name=text]').value='Note ecrite sans reseau';[...form.querySelectorAll('[data-offline-category]')].find(button=>button.textContent==='Problème').click();form.querySelector('button[type=submit]').click()})()",'queue-offline-note');
  await waitFor(()=>tab.evaluate("socleOffline.listQueue().then(items=>items.length===1)",'offline-queue-count'),'note mise en file',10000);
  const queued=await tab.evaluate("socleOffline.listQueue().then(items=>items.map(item=>({projectId:item.projectId,category:item.category,text:item.text})))",'offline-queue-content');
  assert.equal(queued[0].text,'Note ecrite sans reseau');
  assert.equal(queued[0].category,'Problème');
  assert.match(await tab.evaluate("document.querySelector('[data-offline-banner]').innerText",'offline-banner-pending'),/1 note en attente/);
  await screenshot('02-note-en-attente');

  // 4. au retour du reseau, la note part et la file se vide
  await setOffline(false);
  await waitFor(()=>tab.evaluate('navigator.onLine === true','online-flag'),'retour du réseau',15000);
  await tab.evaluate("window.dispatchEvent(new Event('online'))",'back-online');
  // L'envoi part de lui-meme au retour du reseau ; l'appel explicite ne sert
  // que de filet. Ce qui compte, c'est que la note arrive et que la file se vide.
  await tab.evaluate("socleOffline.flushQueue()",'flush-queue');
  await waitFor(()=>tab.evaluate("socleOffline.listQueue().then(items=>items.length===0)",'offline-queue-empty'),'file vidée',10000);
  const serverNotes=await tab.evaluate(`serverJson('/api/projects/'+encodeURIComponent(${JSON.stringify(projects[0].id)})+'/notes').then(data=>(data.notes||[]).map(note=>note.text))`,'server-notes');
  assert.ok(serverNotes.includes('Note ecrite sans reseau'),'La note est arrivée au serveur : '+JSON.stringify(serverNotes.slice(0,5)));
  assert.doesNotMatch(await tab.evaluate("document.querySelector('[data-offline-banner]').innerText",'banner-after-send'),/note en attente/,'Le bandeau ne signale plus d’attente');
  await screenshot('03-note-envoyee');

  console.log('BROWSER_OFFLINE_01=PASS snapshot='+snapshot.jobs+' chantiers hors-connexion=ok note-en-attente=ok envoi=ok');
}finally{
  await tab?.close();
  await browser.close();
}
