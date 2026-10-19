import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectBrowser,waitFor,waitForApp} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){
  console.log('browser-document-folders-01: SKIP hors Browser Gate');
  process.exit(0);
}

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const artifacts=join(dirname(fileURLToPath(import.meta.url)),'artifacts','document-folders');
mkdirSync(artifacts,{recursive:true});
const browser=await connectBrowser(base);const tab=await browser.createSession(base);
async function shot(name){const r=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(artifacts,name+'.png'),Buffer.from(r.data,'base64'))}
try{
  await tab.navigate(base+'/');
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'document-folders-login');
  assert.equal(login,204);
  await tab.reload();await waitForApp(tab,'local-owner');
  await tab.evaluate("serverJson('/api/me/preferences/dashboard/document-folders',{method:'DELETE'}).catch(()=>{})",'document-folders-reset');
  await tab.evaluate("navigate('documents')",'document-folders-open');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-document-folders-bar]'))&&document.querySelectorAll('.document-folder-row').length>0",'document-folders-ready'),'documents prêts',15000);

  const initial=await tab.evaluate(`(()=>({rows:document.querySelectorAll('.document-folder-row').length,chips:[...document.querySelectorAll('[data-document-folder-chip]')].map(n=>n.innerText.split(String.fromCharCode(10)).join(' ')),handles:document.querySelectorAll('.document-folder-row .task-drag-handle').length,moves:document.querySelectorAll('.document-folder-row .document-move').length}))()`,'document-folders-initial');
  assert.ok(initial.rows>=1,'Des documents sont disponibles.');
  assert.equal(initial.handles,initial.rows,'Chaque document a sa poignée.');
  assert.equal(initial.moves,initial.rows,'Chaque document a son bouton Déplacer.');
  assert.ok(initial.chips.some(text=>text.includes('Fournisseurs')),'Les dossiers par défaut sont proposés.');

  await tab.evaluate("document.querySelector('.document-folders-bar .task-folder-add').click()",'document-folders-open-form');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#modal[open] input[name=name]'))",'document-folders-form'),'formulaire dossier');
  await tab.evaluate("(()=>{const f=document.querySelector('#modal form');f.elements.name.value='Factures 2026';f.requestSubmit();return true})()",'document-folders-create');
  await waitFor(()=>tab.evaluate("[...document.querySelectorAll('[data-document-folder-chip]')].some(n=>n.innerText.includes('Factures 2026'))",'document-folders-created'),'dossier créé');
  const folderId=await tab.evaluate("[...document.querySelectorAll('[data-document-folder-chip]')].find(n=>n.innerText.includes('Factures 2026'))?.dataset.documentFolderChip",'document-folders-folder-id');
  const documentId=await tab.evaluate("document.querySelector('.document-folder-row')?.dataset.documentId",'document-folders-document-id');

  await tab.evaluate(`(()=>{const row=document.querySelector('.document-folder-row'),handle=row.querySelector('.task-drag-handle'),chip=[...document.querySelectorAll('[data-document-folder-chip]')].find(n=>n.dataset.documentFolderChip===${JSON.stringify(folderId)}),dt=new DataTransfer();handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));chip.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));chip.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));handle.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));return true})()`,'document-folders-drag');
  await waitFor(()=>tab.evaluate("document.querySelector('.document-folder-row .task-folder-tag')?.textContent.includes('Factures 2026')",'document-folders-tag'),'étiquette de dossier');
  const stored=await tab.evaluate("serverJson('/api/me/preferences/dashboard/document-folders').then(data=>data.preference?.value||null)",'document-folders-stored');
  assert.equal(stored.assignments[documentId],folderId,'Le rangement du document est enregistré.');
  await shot('01-documents-range');

  await tab.reload();await waitForApp(tab,'local-owner');
  await tab.evaluate("navigate('documents')",'document-folders-reopen');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-document-folders-bar]'))&&document.querySelectorAll('.document-folder-row').length>0",'document-folders-reloaded'),'documents après rechargement',15000);
  await waitFor(()=>tab.evaluate("document.querySelector('.document-folder-row .task-folder-tag')?.textContent.includes('Factures 2026')",'document-folders-persisted'),'rangement retenu après rechargement');

  await tab.evaluate(`(()=>{const grip=document.querySelector('[data-document-folder-drag="${folderId}"]'),target=document.querySelector('[data-document-folder-chip="document-folder-suppliers"]'),dt=new DataTransfer();grip.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));grip.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));return true})()`,'document-folders-reorder');
  await waitFor(async()=>{const value=await tab.evaluate("serverJson('/api/me/preferences/dashboard/document-folders').then(data=>data.preference?.value||null)",'document-folders-order-read');return value&&value.folders.findIndex(f=>f.id===folderId)<value.folders.findIndex(f=>f.id==='document-folder-suppliers')},'document-folders-order',12000);

  await tab.evaluate("document.querySelector('.document-folder-row .document-move').click()",'document-folders-keyboard-open');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#modal[open] .task-board-move-list'))",'document-folders-move-dialog'),'menu Déplacer');
  await tab.evaluate("(()=>{const button=[...document.querySelectorAll('#modal .task-board-move-list .btn')].find(n=>n.textContent.includes('Sans dossier'));button.click();return true})()",'document-folders-keyboard-choose');
  await waitFor(async()=>{const value=await tab.evaluate("serverJson('/api/me/preferences/dashboard/document-folders').then(data=>data.preference?.value||null)",'document-folders-undo-read');return value&&!value.assignments[documentId]},'document-folders-undo-persisted',12000);

  await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await tab.evaluate("scrollTo(0,0)",'document-folders-mobile-top');
  await new Promise(resolve=>setTimeout(resolve,300));
  const mobile=await tab.evaluate(`(()=>{const bar=document.querySelector('.document-folders-bar'),row=document.querySelector('.document-folder-row'),move=row?.querySelector('.document-move');return{height:Math.round(bar?.getBoundingClientRect().height||0),overflow:document.documentElement.scrollWidth>innerWidth,move:Math.round(move?.getBoundingClientRect().width||0),rows:document.querySelectorAll('.document-folder-row').length}})()`,'document-folders-mobile');
  assert.equal(mobile.overflow,false,'Aucun débordement horizontal au téléphone.');
  assert.ok(mobile.height<=180,'La barre de dossiers documents reste compacte: '+mobile.height+' px');
  assert.ok(mobile.move>=44,'Le bouton Déplacer garde 44 px au téléphone.');
  assert.ok(mobile.rows>=1,'Les documents restent visibles au téléphone.');
  await shot('02-documents-mobile');

  await tab.evaluate("serverJson('/api/me/preferences/dashboard/document-folders',{method:'DELETE'}).catch(()=>{})",'document-folders-cleanup');
  console.log('BROWSER_DOCUMENT_FOLDERS_01=PASS dossiers=creation+glisser+persistance+reordonnancement+clavier+annulation+mobile');
}catch(error){
  console.error('ECHEC '+error.message);
  try{await tab.evaluate("serverJson('/api/me/preferences/dashboard/document-folders',{method:'DELETE'}).catch(()=>{})",'document-folders-cleanup-error')}catch{}
  process.exitCode=1;
}finally{
  await tab.close();await browser.close();
}
