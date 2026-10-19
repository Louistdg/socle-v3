import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectBrowser,waitFor,waitForApp} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){
  console.log('browser-task-folders-01: SKIP hors Browser Gate');
  process.exit(0);
}

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const artifacts=join(dirname(fileURLToPath(import.meta.url)),'artifacts','task-folders');
mkdirSync(artifacts,{recursive:true});
const browser=await connectBrowser(base);const tab=await browser.createSession(base);
async function screenshot(name){const shot=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'))}
const tasks=[
  {id:'test-task-folder-1',title:'Valider les heures de la semaine',date:'2026-10-18',kind:'Administratif',owner:'Louis',state:'todo',note:''},
  {id:'test-task-folder-2',title:'Commander les ardoises',date:'2026-10-18',kind:'Administratif',owner:'Louis',state:'todo',note:''},
  {id:'test-task-folder-3',title:'Classer les factures fournisseurs',date:'2026-10-18',kind:'Administratif',owner:'Louis',state:'todo',note:''}
];
async function injectTasks(){
  await tab.evaluate(`(()=>{scheduleSave=()=>{};const fixtures=${JSON.stringify(tasks)};fixtures.forEach(item=>{if(!reminders.some(r=>r.id===item.id))reminders.push({...item,date:reference})});alertTab='todo';navigate('actions');return true})()`,'task-folders-inject');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-task-folders-bar]'))&&document.querySelectorAll('.batch-task[data-task-id]').length>=3",'task-folders-ready'),'dossiers de tâches prêts',12000);
}
try{
  await tab.navigate(base+'/');
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'task-folders-login');
  assert.equal(login,204);
  await tab.reload();await waitForApp(tab,'local-owner');
  await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-folders',{method:'DELETE'}).catch(()=>{})",'task-folders-reset');
  await injectTasks();

  const initial=await tab.evaluate(`(()=>({chips:[...document.querySelectorAll('.task-folder-chip')].map(node=>node.innerText.split(String.fromCharCode(10)).join(' ')),rows:document.querySelectorAll('.batch-task[data-task-id]').length,active:[...document.querySelectorAll('.task-folder-chip.is-active')].map(node=>node.innerText.split(String.fromCharCode(10)).join(' '))}))()`,'task-folders-initial');
  assert.equal(initial.rows,3,'Les trois tâches de test sont dans la vue À faire.');
  assert.ok(initial.chips.some(text=>text.includes('Priorités')),'Les dossiers par défaut sont proposés.');
  assert.ok(initial.active.some(text=>text.includes('Toutes')),'La vue Toutes est active par défaut.');

  await tab.evaluate("document.querySelector('.task-folder-add').click()",'task-folders-open-form');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#modal[open] input[name=name]'))",'task-folders-folder-form'),'formulaire dossier');
  await tab.evaluate("(()=>{const form=document.querySelector('#modal form');form.elements.name.value='À faire cette semaine';form.requestSubmit();return true})()",'task-folders-create-folder');
  await waitFor(()=>tab.evaluate("[...document.querySelectorAll('.task-folder-chip')].some(node=>node.innerText.includes('À faire cette semaine'))",'task-folders-folder-created'),'dossier créé');
  const folderId=await tab.evaluate("[...document.querySelectorAll('.task-folder-chip')].find(node=>node.innerText.includes('À faire cette semaine'))?.dataset.taskFolderChip",'task-folders-folder-id');
  assert.ok(folderId&&folderId.startsWith('task-folder-'),'Un identifiant de dossier stable est créé.');

  const drag=await tab.evaluate(`(()=>{const row=document.querySelector('.batch-task[data-task-id="${tasks[0].id}"]'),handle=row.querySelector('.task-drag-handle'),chip=[...document.querySelectorAll('.task-folder-chip')].find(node=>node.dataset.taskFolderChip===${JSON.stringify(folderId)}),dt=new DataTransfer();handle.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));chip.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));chip.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));handle.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));return true})()`,'task-folders-drag');
  assert.equal(drag,true);
  await waitFor(()=>tab.evaluate("document.querySelector('.batch-task[data-task-id="+JSON.stringify(tasks[0].id)+"] .task-folder-tag')?.textContent.includes('À faire cette semaine')",'task-folders-tag'),'étiquette de dossier');
  const stored=await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-folders').then(data=>data.preference?.value||null)",'task-folders-stored');
  assert.equal(stored.assignments[tasks[0].id],folderId,'Le glisser est enregistré dans la préférence personnelle.');
  assert.equal(stored.folders.find(folder=>folder.id===folderId).name,'À faire cette semaine','Le nom du dossier est enregistré.');
  await screenshot('01-dossiers-desktop');

  await tab.reload();await waitForApp(tab,'local-owner');
  await injectTasks();
  await waitFor(()=>tab.evaluate("document.querySelector('.batch-task[data-task-id="+JSON.stringify(tasks[0].id)+"] .task-folder-tag')?.textContent.includes('À faire cette semaine')",'task-folders-reload-tag'),'dossier retenu après rechargement');

  const reorder=await tab.evaluate(`(()=>{const grip=document.querySelector('[data-task-folder-drag="${folderId}"]'),target=document.querySelector('[data-task-folder-chip="task-folder-priority"]'),dt=new DataTransfer();grip.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));grip.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:dt}));return true})()`,'task-folders-reorder');
  assert.equal(reorder,true);
  await waitFor(async()=>{const value=await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-folders').then(data=>data.preference?.value||null)",'task-folders-order-read');return value&&value.folders.findIndex(folder=>folder.id===folderId)<value.folders.findIndex(folder=>folder.id==='task-folder-priority')},'task-folders-order-persisted');
  await screenshot('02-dossiers-reordonnes');

  await tab.evaluate("document.querySelector('.batch-task[data-task-id="+JSON.stringify(tasks[1].id)+"] .task-move').click()",'task-folders-keyboard-open');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#modal[open] .task-board-move-list'))",'task-folders-move-dialog'),'menu Déplacer');
  await tab.evaluate(`(()=>{const button=[...document.querySelectorAll('#modal .task-board-move-list .btn')].find(node=>node.textContent.includes('À faire cette semaine'));button.click();return true})()`,'task-folders-keyboard-choose');
  await waitFor(()=>tab.evaluate("document.querySelector('.batch-task[data-task-id="+JSON.stringify(tasks[1].id)+"] .task-folder-tag')?.textContent.includes('À faire cette semaine')",'task-folders-keyboard-tag'),'déplacement au clavier');
  await tab.evaluate("document.querySelector('.task-board-undo .link').click()",'task-folders-undo');
  await waitFor(async()=>{const value=await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-folders').then(data=>data.preference?.value||null)",'task-folders-undo-read');return value&&!value.assignments[tasks[1].id]},'task-folders-undo-persisted');
  assert.equal(await tab.evaluate("document.querySelector('.batch-task[data-task-id="+JSON.stringify(tasks[1].id)+"] .task-folder-tag')?.textContent.includes('À faire cette semaine')||false",'task-folders-undo-tag'),false,'L’annulation retire l’étiquette.');

  await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await tab.evaluate("scrollTo(0,0)",'task-folders-mobile-top');
  await new Promise(resolve=>setTimeout(resolve,250));
  const mobile=await tab.evaluate(`(()=>{const bar=document.querySelector('.task-folders-bar'),move=document.querySelector('.task-move'),grip=document.querySelector('.task-folder-grip');return{height:Math.round(bar?.getBoundingClientRect().height||0),overflow:document.documentElement.scrollWidth>innerWidth,moveWidth:Math.round(move?.getBoundingClientRect().width||0),gripDisplay:grip?getComputedStyle(grip).display:'none',chips:document.querySelectorAll('.task-folder-chip').length}})()`,'task-folders-mobile');
  assert.equal(mobile.overflow,false,'Aucun débordement horizontal sur téléphone.');
  assert.ok(mobile.height<=180,'La barre de dossiers reste compacte au téléphone: '+mobile.height+' px');
  assert.ok(mobile.moveWidth>=44,'Le bouton Déplacer garde une cible tactile de 44 px.');
  assert.equal(mobile.gripDisplay,'none','La poignée de glisser est retirée au téléphone, où le bouton Déplacer prend le relais.');
  assert.ok(mobile.chips>=3,'Les dossiers restent visibles au téléphone.');
  await screenshot('03-dossiers-mobile');

  await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-folders',{method:'DELETE'}).catch(()=>{})",'task-folders-cleanup');
  console.log('BROWSER_TASK_FOLDERS_01=PASS dossiers=creation+glisser+persistance+reordonnancement+clavier+annulation+mobile');
}catch(error){
  console.error('ECHEC '+error.message);
  try{await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-folders',{method:'DELETE'}).catch(()=>{})",'task-folders-cleanup-error')}catch{}
  process.exitCode=1;
}finally{
  await tab.close();await browser.close();
}
