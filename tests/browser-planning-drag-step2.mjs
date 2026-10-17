import assert from 'node:assert/strict';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base),tab=await browser.createSession(base);
const frames=`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`;
let fixtureId='';
try{
  await tab.navigate(base+'/');
  const login=await tab.evaluate(`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(response=>response.status)`,'login-owner');
  assert.equal(login,204,'La session OWNER locale est établie.');
  await tab.reload();await waitForApp(tab);
  await tab.evaluate(`window.__planningDragRequests=[];const original=window.fetch.bind(window);window.fetch=async(...args)=>{const response=await original(...args);if(String(args[0]).includes('/api/planning/replan'))window.__planningDragRequests.push({status:response.status,body:await response.clone().json().catch(()=>({}))});return response}`,'observe-replan-route');

  const setup=await tab.evaluate(`(async()=>{
    const response=await fetch('/api/planning?from=2026-09-28&to=2026-10-04',{cache:'no-store'}),data=await response.json();
    if(!response.ok)throw Error('planning HTTP '+response.status);
    const assignments=(data.assignments||[]).filter(row=>row.status!=='cancelled'&&(row.people||[]).length);
    let fixture=null;
    for(const target of assignments.filter(row=>row.date<='2026-10-01')){
      const person=String(target.people[0]);
      for(let offset=1;offset<=4;offset++){
        const date=new Date(target.date+'T12:00:00');date.setDate(date.getDate()+offset);const sourceDate=date.toISOString().slice(0,10);
        if(sourceDate>'2026-10-04'||assignments.some(row=>row.date===sourceDate&&(String(row.team)===String(target.team)||(row.people||[]).map(String).includes(person))))continue;
        const create=await fetch('/api/assignments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:sourceDate,teamId:String(target.team),projectId:String(target.job),people:[person],startTime:target.startTime||'07:00',endTime:target.endTime||'16:00',assignmentType:'reinforcement',status:'planned',reason:'Fixture test déplacement bureau'})});
        const body=await create.json().catch(()=>({}));if(create.status===201){fixture={id:String(body.id||body.assignment?.id),sourceDate,targetDate:target.date,freeDate:'',person,targetId:String(target.id)};break}
      }
      if(fixture)break;
    }
    if(!fixture)return{error:'Aucune affectation fixture créée',candidates:assignments.length};
    for(let offset=1;offset<=4;offset++){
      const date=new Date(fixture.sourceDate+'T12:00:00');date.setDate(date.getDate()+offset);const key=date.toISOString().slice(0,10);
      if(key>'2026-10-04'||assignments.some(row=>row.date===key&&(row.people||[]).map(String).includes(fixture.person)))continue;
      fixture.freeDate=key;break;
    }
    return fixture;
  })()`,'create-planning-drag-fixture');
  assert.ok(setup.id,'Fixture d’affectation créée : '+JSON.stringify(setup));fixtureId=setup.id;
  assert.ok(setup.freeDate,'Une journée visible sans affectation est disponible : '+JSON.stringify(setup));
  await tab.evaluate(`navigate('planning');iaBSetPlanningAnchor(${JSON.stringify(setup.sourceDate)});${frames}`,'open-fixture-week');
  await waitFor(()=>tab.evaluate(`!iaBPlanningState.loading&&iaBPlanningState.data&&document.querySelector('[data-assignment-id="${setup.id}"]')`,'fixture-rendered',5_000),'l’affectation test est rendue',15_000);

  // Le glissé n'existe que pour un pointeur fin. Un Chromium sans interface sous
  // Linux annonce « aucun survol, pointeur grossier » : le produit refuse alors
  // le geste, à juste titre. Le harnais force donc un pointeur de bureau
  // (--blink-settings), et cette assertion le vérifie explicitement plutôt que
  // de laisser la suite dépendre du matériel annoncé par la machine.
  const pointer=await tab.evaluate(`(()=>({combo:matchMedia('(hover: hover) and (pointer: fine)').matches,available:iaBPlanningDragAvailable(),draggable:document.querySelectorAll('#main .ia-b-slot[draggable="true"]').length}))()`,'pointer-capability');
  assert.equal(pointer.combo,true,'Le harnais doit annoncer un pointeur fin et un survol (voir --blink-settings de scripts/browser-gate.mjs).');
  assert.equal(pointer.available,true,'Avec un pointeur fin, le glissé est disponible.');
  assert.ok(pointer.draggable>0,'Avec un pointeur fin, les cartes du planning sont déplaçables.');
  console.log('DRAG_POINTER='+JSON.stringify(pointer));

  const cancel=await tab.evaluate(`(()=>{const card=document.querySelector('[data-assignment-id="${setup.id}"]'),data=new DataTransfer();card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));const selected=card.classList.contains('is-move-selected');card.dispatchEvent(new DragEvent('dragend',{bubbles:true}));return{selected,requests:window.__planningDragRequests.length,sourceDate:iaBPlanningState.data.assignments.find(row=>String(row.id)===${JSON.stringify(setup.id)})?.date,selection:iaBMoveSelection}})()`,'cancel-drag');
  assert.equal(cancel.selected,true,'La carte source est visible comme sélectionnée pendant le geste.');
  assert.equal(cancel.requests,0,'L’annulation n’envoie aucune requête au serveur.');
  assert.equal(cancel.sourceDate,setup.sourceDate,'L’annulation conserve la date source.');
  assert.equal(cancel.selection,null,'L’annulation efface la sélection.');
  console.log('DRAG_CANCEL='+JSON.stringify(cancel));
  const escape=await tab.evaluate(`(()=>{const card=document.querySelector('[data-assignment-id="${setup.id}"]');card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:new DataTransfer()}));document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return{requests:window.__planningDragRequests.length,selection:iaBMoveSelection,date:iaBPlanningState.data.assignments.find(row=>String(row.id)===${JSON.stringify(setup.id)})?.date,cardStillAtSource:Boolean(document.querySelector('[data-assignment-id="${setup.id}"]'))}})()`,'escape-cancels-drag');
  assert.equal(escape.requests,0,'Échap n’envoie aucune requête.');
  assert.equal(escape.selection,null,'Échap efface la sélection du planning.');
  assert.equal(escape.date,setup.sourceDate,'Échap laisse la date inchangée.');
  assert.ok(escape.cardStillAtSource,'La carte reste rendue à sa place.');
  console.log('DRAG_ESCAPE='+JSON.stringify(escape));

  const rejection=await tab.evaluate(`(async()=>{const card=document.querySelector('[data-assignment-id="${setup.id}"]'),target=document.querySelector('[data-planning-date="${setup.targetDate}"]'),data=new DataTransfer();card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));const highlighted=target.classList.contains('is-drag-over');target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));const deadline=Date.now()+8000;while(window.__planningDragRequests.length<1&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));while((iaBPlanningState.loading||iaBPlanningState.key!==iaBPlanningKey())&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));await new Promise(resolve=>setTimeout(resolve,100));return{highlighted,request:window.__planningDragRequests[0]||null,fixture:iaBPlanningState.data.assignments.find(row=>String(row.id)===${JSON.stringify(setup.id)}),toast:document.querySelector('#toast')?.textContent||''}})()`,'rejected-conflict-drop');
  assert.ok(rejection.highlighted,'La case cible se met en évidence pendant le survol.');
  assert.equal(rejection.request?.status,409,'Le conflit est refusé par la route existante.');
  assert.equal(rejection.fixture?.date,setup.sourceDate,'Après le refus, la carte demeure sur sa date source.');
  assert.match(rejection.toast,/conflit|refus|affectation/i,'Le refus est annoncé dans l’interface.');
  console.log('DRAG_REJECTED='+JSON.stringify(rejection));

  const success=await tab.evaluate(`(async()=>{const card=document.querySelector('[data-assignment-id="${setup.id}"]'),target=document.querySelector('[data-planning-date="${setup.freeDate}"]'),data=new DataTransfer();card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:data}));target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));const highlighted=target.classList.contains('is-drag-over');target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));const deadline=Date.now()+8000;while(window.__planningDragRequests.length<2&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));while((iaBPlanningState.loading||iaBPlanningState.key!==iaBPlanningKey())&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));return{highlighted,request:window.__planningDragRequests[1]||null,date:iaBPlanningState.data.assignments.find(row=>String(row.id)===${JSON.stringify(setup.id)})?.date}})()`,'successful-drop');
  assert.ok(success.highlighted,'La case libre se met en évidence.');
  assert.equal(success.request?.status,200,'Le déplacement utilise la route de replanification.');
  assert.equal(success.date,setup.freeDate,'L’affectation est affichée à la nouvelle date.');
  await tab.reload();await waitForApp(tab);
  await tab.evaluate(`navigate('planning');iaBSetPlanningAnchor(${JSON.stringify(setup.freeDate)});${frames}`,'reload-planning');
  await waitFor(()=>tab.evaluate(`!iaBPlanningState.loading&&iaBPlanningState.data&&iaBPlanningState.data.assignments.some(row=>String(row.id)===${JSON.stringify(setup.id)}&&row.date===${JSON.stringify(setup.freeDate)})`,'persisted-after-reload',5_000),'le déplacement persiste après rechargement',15_000);
  console.log('DRAG_SUCCESS='+JSON.stringify({...success,persistedAfterReload:true}));

  await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await tab.call('Emulation.setEmulatedMedia',{features:[{name:'hover',value:'none'},{name:'pointer',value:'coarse'}]});
  await tab.evaluate(`render();${frames}`,'mobile-layout-settled');
  const mobile=await tab.evaluate(`(()=>({available:iaBPlanningDragAvailable(),draggable:document.querySelectorAll('#main .ia-b-slot[draggable="true"]').length,moveChoices:document.querySelectorAll('#main .ia-b-move-choice').length,hasTouchHandlers:typeof iaBPlanningDragSource==='undefined'}))()`,'mobile-drag-availability');
  assert.equal(mobile.available,false,'Au doigt, le glissé de bureau se désactive.');
  assert.equal(mobile.draggable,0,'Aucune carte n’est déplaçable au doigt.');
  assert.ok(mobile.moveChoices>0,'Le contrôle de l’étape 1 reste disponible au tactile.');
  console.log('DRAG_MOBILE='+JSON.stringify(mobile));
}finally{
  if(fixtureId){try{const cleanup=await tab.evaluate(`fetch('/api/assignments/'+encodeURIComponent(${JSON.stringify(fixtureId)}),{method:'DELETE'}).then(response=>response.status)`,'cleanup-planning-drag-fixture');console.log('DRAG_FIXTURE_CLEANUP='+cleanup)}catch(error){console.error('DRAG_FIXTURE_CLEANUP_ERROR='+error.message)}}
  await tab.close();await browser.close();
}
console.log('browser-planning-drag-step2: PASS — succès persistant, conflit refusé et affiché, annulation sans requête, aucune activation tactile.');
