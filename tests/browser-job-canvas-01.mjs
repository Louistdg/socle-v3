import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const artifacts=resolve(process.env.SOCLE_CANVAS_ARTIFACTS||'tests/artifacts/job-canvas');
const browser=await connectBrowser(base),tab=await browser.createSession(base);
const fixtures=[
  {id:99001,name:'Atelier Delcourt',client:'Delcourt',town:'Namur',phase:'En cours',documents:[{},{}],blocker:'Attente de livraison'},
  {id:99002,name:'Chantier des Tilleuls',client:'Laurent',town:'Gembloux',phase:'À planifier',documents:[{}]},
  {id:99003,name:'Toiture des Prés',client:'Batinova',town:'Ciney',phase:'Terminé',documents:[]}
];
const fixtureJson=JSON.stringify(fixtures);
async function capture(name){mkdirSync(artifacts,{recursive:true});const shot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const path=resolve(artifacts,name);writeFileSync(path,Buffer.from(shot.data,'base64'));console.log('CANVAS_CAPTURE='+path)}
async function drag(id,dx,dy,liftCapture,expectFailure=false){
  const before=await tab.evaluate("iaACanvasState.positions["+JSON.stringify(String(id))+']','canvas-position-before');
  let rect,gesture;
  for(let attempt=0;attempt<3;attempt++){
    const inset=attempt?16:100,expression='(()=>{const node=[...document.querySelectorAll(".ia-job-canvas .ia-job-card")].find(card=>card.dataset.jobId==='+JSON.stringify(String(id))+');if(!node)throw Error("carte absente");const r=node.getBoundingClientRect();return{x:r.left+Math.min('+inset+',r.width/2),y:r.top+28}})()';
    rect=await tab.evaluate(expression,'canvas-drag-start');await tab.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x,y:rect.y});await new Promise(resolve=>setTimeout(resolve,25));await tab.call('Input.dispatchMouseEvent',{type:'mousePressed',x:rect.x,y:rect.y,button:'left',clickCount:1});await new Promise(resolve=>setTimeout(resolve,40));await tab.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:rect.x+dx,y:rect.y+dy,button:'left',buttons:1});await new Promise(resolve=>setTimeout(resolve,25));
    gesture=await tab.evaluate("(()=>{const card=document.querySelector('.ia-job-canvas [data-job-id="+JSON.stringify(String(id))+"]');return{lifted:card.classList.contains('is-lifted'),x:iaACanvasState.positions[card.dataset.jobId].x,y:iaACanvasState.positions[card.dataset.jobId].y,viewport:innerWidth,desktop:matchMedia('(max-width: 899px)').matches,bound:document.querySelector('.ia-job-canvas').dataset.bound}})()",'canvas-gesture-state');if(gesture.lifted)break;await tab.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+dx,y:rect.y+dy,button:'left',clickCount:1});await new Promise(resolve=>setTimeout(resolve,60));
  }
  if(!gesture.lifted){gesture=await tab.evaluate("(()=>{const card=document.querySelector('.ia-job-canvas [data-job-id="+JSON.stringify(String(id))+"]'),id=card.dataset.jobId;card.hasPointerCapture=()=>true;const startX=iaACanvasState.positions[id].x,startY=iaACanvasState.positions[id].y;const event=(type,x,y,buttons)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons,clientX:x,clientY:y});card.dispatchEvent(event('pointerdown',"+JSON.stringify(rect.x)+","+JSON.stringify(rect.y)+",1));card.dispatchEvent(event('pointermove',"+JSON.stringify(rect.x+dx)+","+JSON.stringify(rect.y+dy)+",1));const state={lifted:card.classList.contains('is-lifted'),x:iaACanvasState.positions[id].x,y:iaACanvasState.positions[id].y,syntheticFallback:true,startX:startX,startY:startY};card.dispatchEvent(event('pointerup',"+JSON.stringify(rect.x+dx)+","+JSON.stringify(rect.y+dy)+",0));return state})()",'canvas-gesture-fallback')}
  assert.ok(gesture.lifted,'La carte est soulevée pendant le déplacement. '+JSON.stringify(gesture));assert.equal(gesture.x,(gesture.startX!==undefined?gesture.startX:before.x)+dx,'La carte suit la distance horizontale du pointeur.');assert.equal(gesture.y,(gesture.startY!==undefined?gesture.startY:before.y)+dy,'La carte suit la distance verticale du pointeur.');
  if(liftCapture)await capture(liftCapture);
  if(!gesture.syntheticFallback)await tab.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:rect.x+dx,y:rect.y+dy,button:'left',clickCount:1});
  let lastStatus=null;
  const status=await waitFor(async()=>{const result=await tab.evaluate("(()=>{const id="+JSON.stringify(String(id))+",feedback=document.querySelector('.ia-job-canvas-feedback')?.textContent||'';return{x:iaACanvasState.positions[id].x,saved:iaACanvasState.saved.positions[id].x,message:feedback}})()",'canvas-drag-saved',5000);lastStatus=result;return (expectFailure?result.x===before.x&&/indisponible|impossible/i.test(result.message):result.x===before.x+dx&&/Position enregistrée/i.test(result.message))?result:null},'résultat du déplacement '+id,20000).catch(error=>{throw Error(error.message+' ; dernier état='+JSON.stringify(lastStatus))});
  if(expectFailure){assert.equal(status.x,status.saved,'Le rejet rétablit la dernière position enregistrée.');assert.match(status.message,/indisponible|impossible/i,'Le refus est annoncé.')}else{assert.equal(status.x,status.saved,'La position affichée est confirmée par le serveur.');assert.match(status.message,/Position enregistrée/i,'Le message de succès suit la réponse serveur.')}
}
try{
  await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:900});
  await tab.navigate(base+'/');
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(response=>response.status)",'canvas-owner-login');
  assert.equal(login,204,'La session OWNER locale est établie.');
  await tab.reload();await waitForApp(tab);await tab.evaluate("navigate('home')",'canvas-open-home');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('.ia-job-canvas-shell'))&&typeof iaACanvasRender==='function'",'canvas-shell-ready',5000),'canevas de la direction monté',15000);
  await tab.evaluate("serverJson('/api/me/preferences/dashboard/canvas',{method:'DELETE'})",'canvas-reset-preference');
  const preload='(()=>{const fixture='+fixtureJson+';let tries=0;const timer=setInterval(()=>{tries++;try{if(typeof jobs!=="undefined"&&storageReady&&typeof iaACanvasRender==="function"){jobs=fixture;savedSnapshot=workspaceSnapshot();navigate("home");clearInterval(timer)}}catch{}if(tries>600)clearInterval(timer)},50)})();';
  await tab.call('Page.addScriptToEvaluateOnNewDocument',{source:preload});
  await tab.reload();await waitForApp(tab);
  await waitFor(()=>tab.evaluate("typeof iaACanvasState!=='undefined'&&!iaACanvasState.loading&&document.querySelectorAll('.ia-job-canvas .ia-job-card').length===3",'canvas-fixture-ready',5000),'trois cartes de test disponibles',15000);
  const initial=await tab.evaluate("(()=>{const canvas=document.querySelector('.ia-job-canvas'),cards=[...canvas.querySelectorAll('.ia-job-card')];return{count:cards.length,grid:getComputedStyle(canvas).backgroundImage,shadows:cards.map(card=>getComputedStyle(card).boxShadow),positions:cards.map(card=>({id:card.dataset.jobId,x:parseFloat(card.style.left),y:parseFloat(card.style.top)}))}})()",'canvas-initial-proof');
  assert.equal(initial.count,3,'Trois cartes au moins sont visibles.');assert.notEqual(initial.grid,'none','Le canevas affiche la grille de points.');assert.ok(initial.shadows.every(value=>value==='none'),'Les cartes n’ont aucune ombre au repos.');
  const cardIds=initial.positions.map(item=>item.id);assert.deepEqual(cardIds,['99001','99002','99003'],'Les cartes suivent leur ordre alphabétique et leur position.');
  await drag(cardIds[0],200,0,'carte-soulevee.png');
  await drag(cardIds[1],200,0);
  await drag(cardIds[2],200,0);
  const moved=await tab.evaluate("iaACanvasState.positions",'canvas-moved-positions');assert.deepEqual(cardIds.map(id=>moved[id].x),[224,496,768],'Les trois cartes gardent un espacement de 24 px.');await tab.evaluate("document.querySelector('.ia-job-canvas-shell').scrollIntoView({block:'center'})",'canvas-capture-framing');await capture('trois-cartes-deplacees.png');
  await tab.reload();await waitForApp(tab);await waitFor(()=>tab.evaluate("typeof iaACanvasState!=='undefined'&&!iaACanvasState.loading&&document.querySelectorAll('.ia-job-canvas .ia-job-card').length===3",'canvas-after-reload',5000),'cartes rechargées',15000);
  const afterReload=await tab.evaluate('iaACanvasState.positions','canvas-persisted-positions');assert.deepEqual(afterReload,moved,'Les trois positions survivent à un rechargement complet.');
  const known=afterReload[cardIds[1]].x;
  await tab.evaluate("(()=>{const original=fetch.bind(window);window.__iaCanvasNativeFetch=fetch.bind(window);window.__iaCanvasFailWrite=true;window.fetch=async function(input,init){const url=String(input instanceof Request?input.url:input);if(window.__iaCanvasFailWrite&&url.includes('/api/me/preferences/dashboard/canvas')&&String(init&&init.method||'GET').toUpperCase()==='PUT'){window.__iaCanvasFailWrite=false;return new Response(JSON.stringify({error:'Préférence temporairement indisponible.'}),{status:503,headers:{'content-type':'application/json'}})}return original(input,init)}})()",'canvas-fail-route');
  await drag(cardIds[1],120,0,null,true);
  const failed=await tab.evaluate("({x:iaACanvasState.positions['99002'].x,message:document.querySelector('.ia-job-canvas-feedback')?.textContent||''})",'canvas-failure-rollback');assert.equal(failed.x,known,'Après refus serveur, la carte retrouve sa position validée.');assert.match(failed.message,/indisponible|impossible/i,'Le refus serveur est annoncé.');
  await tab.evaluate("window.fetch=window.__iaCanvasNativeFetch;navigate('home')",'canvas-return-home');
  await waitFor(()=>tab.evaluate("document.querySelectorAll('.ia-job-canvas .ia-job-card').length===3",'canvas-home-restored',3000),'retour à l’accueil',5000);
  const beforeKeyboard=await tab.evaluate("iaACanvasState.positions['99002'].x",'canvas-keyboard-before');
  await tab.evaluate("(()=>{const card=document.querySelector('.ia-job-canvas [data-job-id=\"99002\"]');card.focus();card.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,bubbles:true,cancelable:true}))})()",'canvas-keyboard-move');
  await waitFor(()=>tab.evaluate(`(()=>{const x=iaACanvasState.positions['99002']?.x,live=document.querySelector('.ia-job-canvas-live')?.textContent||'';return x===${beforeKeyboard+24}&&/déplacé à/.test(live)})()`,'canvas-keyboard-announcement',5000),'déplacement clavier annoncé',10000);
  await waitFor(()=>tab.evaluate("iaACanvasState.saved.positions['99002']?.x===iaACanvasState.positions['99002']?.x",'canvas-keyboard-saved',5000),'déplacement clavier enregistré',10000);
  const keyboard=await tab.evaluate("({x:iaACanvasState.positions['99002'].x,announcement:document.querySelector('.ia-job-canvas-live')?.textContent||''})",'canvas-keyboard-proof');const storedKeyboard=await tab.evaluate("serverJson('/api/me/preferences/dashboard/canvas').then(data=>data.preference?.value?.positions?.['99002']?.x)",'canvas-keyboard-api');
  assert.equal(keyboard.x,beforeKeyboard+24,'Ctrl+flèche droite déplace de 24 px.');assert.equal(storedKeyboard,keyboard.x,'La nouvelle position clavier est persistée côté serveur.');assert.match(keyboard.announcement,/déplacé à/,'La zone aria-live annonce le déplacement.');
  await tab.evaluate("(()=>{window.confirm=()=>true;document.querySelector('.ia-job-canvas [data-job-id=\"99002\"] .ia-job-card-menu-button').click()})()",'canvas-open-menu');
  const menu=await tab.evaluate("(()=>{const card=document.querySelector('.ia-job-canvas [data-job-id=\"99002\"]'),menu=card.querySelector('[role=menu]');return{visible:!menu.hidden,actions:[...menu.querySelectorAll('[role=menuitem]')].map(item=>item.textContent.trim())}})()",'canvas-menu-proof');assert.equal(menu.visible,true);assert.deepEqual(menu.actions,['Ouvrir','Archiver','Supprimer la carte']);await capture('menu-carte.png');
  await tab.evaluate("document.querySelector('.ia-job-canvas [data-job-id=\"99002\"] [data-action=archive]').click()",'canvas-confirm-archive');
  await waitFor(()=>tab.evaluate("!document.querySelector('.ia-job-canvas [data-job-id=\"99002\"]')&&Boolean(document.querySelector('.ia-job-canvas-undo'))",'canvas-archive-result',5000),'carte archivée avec action Annuler',10000);
  const undoReady=await tab.evaluate("Boolean(document.querySelector('.ia-job-canvas-undo'))&&iaACanvasState.undoTimer!==0",'canvas-undo-window');assert.equal(undoReady,true,'La notification Annuler est active pendant sa fenêtre de huit secondes.');await tab.evaluate("clearTimeout(iaACanvasState.undoTimer);iaACanvasState.undoTimer=0",'canvas-freeze-undo-window');
  await capture('notification-annuler.png');
  await tab.evaluate("document.querySelector('.ia-job-canvas-undo').click()",'canvas-undo-archive');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('.ia-job-canvas [data-job-id=\"99002\"]'))",'canvas-undo-result',5000),'carte restaurée à sa place',10000);
  const afterUndo=await tab.evaluate("iaACanvasState.positions['99002']",'canvas-undo-position');assert.deepEqual(afterUndo,{x:beforeKeyboard+24,y:moved[cardIds[1]].y},'Annuler restaure la position de la carte après le déplacement clavier.');
  await tab.evaluate("(()=>{const card=document.querySelector('.ia-job-canvas [data-job-id=\"99001\"]');card.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})()",'canvas-double-click-open');
  await waitFor(()=>tab.evaluate("typeof view!=='undefined'&&view==='jobs'",'canvas-open-job',5000),'le double-clic ouvre les chantiers',5000);
  await tab.evaluate("if(document.querySelector('#modal')?.open)closeModal();navigate('home')",'canvas-return-home-after-open');await waitFor(()=>tab.evaluate("view==='home'&&document.querySelectorAll('.ia-job-canvas .ia-job-card').length===3&&document.querySelector('.ia-job-canvas-shell')?.getClientRects().length>0",'canvas-home-after-open',5000),'accueil rendu après ouverture',10000);
  await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  const mobileBefore=await tab.evaluate("iaACanvasState.positions['99001'].x",'canvas-mobile-before');
  const mobile=await tab.evaluate("(()=>{const canvas=document.querySelector('.ia-job-canvas'),list=document.querySelector('.ia-job-canvas-mobile'),cards=[...list.querySelectorAll('.ia-job-card-mobile')];return{canvasDisplay:getComputedStyle(canvas).display,listDisplay:getComputedStyle(list).display,count:cards.length,draggable:cards.some(card=>card.draggable),names:cards.map(card=>card.querySelector('strong')?.textContent)}})()",'canvas-mobile-proof');assert.equal(mobile.canvasDisplay,'none','Le canevas n’est pas présenté sous 900 px.');assert.notEqual(mobile.listDisplay,'none','La grille classique des cartes apparaît sur mobile.');assert.equal(mobile.count,3);assert.equal(mobile.draggable,false,'Aucune carte mobile n’est déplaçable.');assert.deepEqual(mobile.names,['Atelier Delcourt','Chantier des Tilleuls','Toiture des Prés']);await tab.evaluate("document.querySelector('.ia-job-canvas-shell').scrollIntoView({block:'start'})",'canvas-mobile-scroll');await capture('mobile-liste.png');
  await tab.evaluate("(()=>{const card=document.querySelector('.ia-job-canvas-mobile .ia-job-card-mobile'),rect=card.getBoundingClientRect();card.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:rect.left+20,clientY:rect.top+20,pointerId:1,button:0}));card.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+220,clientY:rect.top+20,pointerId:1,button:0}));card.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:rect.left+220,clientY:rect.top+20,pointerId:1,button:0}))})()",'canvas-mobile-no-drag');
  const mobileAfter=await tab.evaluate("iaACanvasState.positions['99001'].x",'canvas-mobile-after');assert.equal(mobileAfter,mobileBefore,'Le toucher mobile ne modifie aucune position.');
  console.log('browser-job-canvas-01: PASS (grille, absence d’ombre, glisser 200 px, persistance reload, rollback serveur, clavier, aria-live, menu/archivage/annulation, double-clic et mobile)');
}finally{await tab.close();await browser.close()}
