import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {connectBrowser,waitFor,waitForApp} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){console.log('browser-task-spatial-desk-01: SKIP hors Browser Gate');process.exit(0)}
const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const browser=await connectBrowser(base),tab=await browser.createSession(base);
try{
  await tab.navigate(base+'/');
  assert.equal(await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'desk-login'),204);
  await tab.reload();await waitForApp(tab);
  await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-spatial-desk',{method:'DELETE'}).catch(()=>{})",'desk-reset');
  await tab.evaluate("(()=>{scheduleSave=()=>{};for(const [id,title] of [['desk-one','Alerte à distribuer'],['desk-two','Contrôler les heures']])if(!reminders.some(x=>x.id===id))reminders.push({id,title,date:reference,kind:'Administratif',owner:'Louis',state:'todo',note:''});alertTab='todo';navigate('actions')})()",'desk-fixtures');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-open-spatial-desk]'))",'desk-button'),'bouton bureau');
  await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await tab.evaluate("document.querySelector('[data-open-spatial-desk]').click()",'desk-open');
  await waitFor(()=>tab.evaluate("document.querySelector('.tsd-folder')&&document.querySelector('.tsd-status')?.textContent.includes('personnelle')",'desk-ready'),'bureau chargé');
  if(process.env.SOCLE_DESK_CAPTURE){const shot=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(process.env.SOCLE_DESK_CAPTURE,Buffer.from(shot.data,'base64'))}
  const before=await tab.evaluate("({count:document.querySelectorAll('.tsd-folder').length,tasks:document.querySelectorAll('.tsd-task').length,zoom:document.querySelector('[data-desk-zoom]').textContent,first:document.querySelector('.tsd-folder')?.style.left})",'desk-first');
  assert.ok(before.count>=4);assert.ok(before.tasks>=2);assert.equal(before.zoom,'100 %');
  await tab.evaluate("document.querySelector('[data-desk-action=in]').click()",'desk-zoom');
  await waitFor(()=>tab.evaluate("document.querySelector('.tsd-status')?.textContent==='Disposition enregistrée'",'desk-zoom-saved'),'zoom enregistré');
  const zoom=await tab.evaluate("document.querySelector('[data-desk-zoom]').textContent",'desk-zoom-value');assert.equal(zoom,'120 %');
  const grip=await tab.evaluate("(()=>{const r=document.querySelector('.tsd-folder [data-desk-handle]').getBoundingClientRect();return{x:r.x+35,y:r.y+20}})()",'desk-handle-point');
  await tab.call('Input.dispatchMouseEvent',{type:'mouseMoved',...grip});
  await tab.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...grip});
  for(let step=1;step<=4;step++)await tab.call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:grip.x+step*18,y:grip.y+step*13});
  await tab.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:grip.x+72,y:grip.y+52});
  await waitFor(()=>tab.evaluate("document.querySelector('.tsd-status')?.textContent==='Disposition enregistrée'",'desk-move-saved'),'dossier enregistré');
  const moved=await tab.evaluate("document.querySelector('.tsd-folder')?.style.left",'desk-position');assert.notEqual(moved,before.first);
  const saved=await tab.evaluate("serverJson('/api/me/preferences/dashboard/task-spatial-desk').then(r=>r.preference?.value)",'desk-server-saved');assert.ok(saved?.positions?.__inbox__?.x>100);assert.equal(saved.camera.zoom,1.2);
  await tab.evaluate(`(()=>{const task=document.querySelector('[data-desk-task="desk-one"]'),folder=document.querySelector('[data-desk-folder="task-folder-priority"]'),dt=new DataTransfer();task.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));folder.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt}));folder.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));return true})()`,'desk-task-drop');
  await waitFor(()=>tab.evaluate("serverJson('/api/me/preferences/dashboard/task-folders').then(r=>r.preference?.value?.assignments?.['desk-one']==='task-folder-priority')",'desk-assignment-saved'),'tâche rangée');
  await tab.evaluate("document.querySelector('[data-desk-action=close]').click()",'desk-close');assert.equal(await tab.evaluate("Boolean(document.querySelector('.tsd-overlay'))",'desk-closed'),false);
  await tab.evaluate("document.querySelector('[data-open-spatial-desk]').click()",'desk-reopen');
  await waitFor(()=>tab.evaluate("document.querySelector('.tsd-status')?.textContent.includes('personnelle')",'desk-reopened'),'bureau rechargé');
  assert.equal(await tab.evaluate("document.querySelector('[data-desk-zoom]').textContent",'desk-persisted-zoom'),'120 %');
  await tab.evaluate("document.querySelector('[data-desk-action=close]').click();socleCurrentAccess={...socleCurrentAccess,owner:false,roleCode:'WORKER',permissions:['tasks.view.assigned']};render()",'desk-worker');
  await waitFor(()=>tab.evaluate("!document.querySelector('[data-open-spatial-desk]')",'desk-worker-hidden'),'accès bureau masqué');
  await tab.evaluate("socleCurrentAccess={...socleCurrentAccess,owner:false,roleCode:'CUSTOM',permissions:['projects.view.all','tasks.manage.project','ui.module.people.edit','ui.module.actions.edit']};render()",'desk-office');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-open-spatial-desk]'))",'desk-office-visible'),'accès administration');
  console.log('browser-task-spatial-desk-01: PASS — zoom, déplacement, rangement, persistance, ouvrier exclu et administration autorisée');
}finally{await tab.close();await browser.close()}
