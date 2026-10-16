import assert from 'node:assert/strict';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base),failures=[];
const check=(condition,message,actual)=>{
  if(condition)return;
  const detail=actual===undefined?'':` · obtenu ${JSON.stringify(actual)}`;
  failures.push(message+detail);
  console.error('REGRESSION_116_FAIL '+message+detail);
};
const frames=`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`;
let cancelledFixtureId='',ownerRetainsCancelledFixture=false;
let weekendEnabledByOwner=false;

async function clickElement(tab,selector,mobile){
  await tab.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(node)node.scrollIntoView({block:'center',inline:'center'})})()`,'scroll-target:'+selector);
  await tab.evaluate(frames,'target-in-view:'+selector);
  const point=await tab.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return null;const rect=node.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`,`click-target:${selector}`);
  assert.ok(point,'Cible visible : '+selector);
  if(mobile){
    await tab.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
    await tab.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{
    await tab.call('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});
    await tab.call('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
    await tab.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
  }
  await tab.evaluate(frames,'click-settled:'+selector);
}

const tab=await browser.createSession(base);
try{
  await tab.navigate(base+'/');
  const login=await tab.evaluate(`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(response=>response.status)`,'login-owner');
  assert.equal(login,204,'La session OWNER locale doit être établie par le serveur.');
  await tab.reload();
  await waitForApp(tab);

  for(const viewport of [{name:'desktop',width:1440,height:1000,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
    await tab.call('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile,screenWidth:viewport.width,screenHeight:viewport.height});
    await tab.call('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile,maxTouchPoints:viewport.mobile?5:1});

    await tab.evaluate(`navigate('planning');${frames}`,'open-owner-planning-days:'+viewport.name);
    await waitFor(()=>tab.evaluate(`Boolean(iaBPlanningState?.error||(!iaBPlanningState?.loading&&iaBPlanningState?.data))`,'owner-planning-days-loaded:'+viewport.name,5_000),'planning patron chargé avant réglage des jours '+viewport.name,15_000);
    if(!weekendEnabledByOwner){
      const actualDefault=await tab.evaluate(`(()=>({days:[...document.querySelectorAll('#main .ia-b-week-day h3')].map(node=>node.textContent.trim()),saturday:document.querySelector('#main .ia-b-weekday-settings input[name="includeSaturday"]')?.checked,sunday:document.querySelector('#main .ia-b-weekday-settings input[name="includeSunday"]')?.checked,settings:Boolean(document.querySelector('#main .ia-b-weekday-settings'))}))()`,'owner-default-weekday-render:'+viewport.name);
      check(actualDefault.days.length===5,'Le planning patron affiche cinq jours avant activation du week-end '+viewport.name,actualDefault.days);
      check(actualDefault.settings&&!actualDefault.saturday&&!actualDefault.sunday,'Samedi et dimanche sont décochés par défaut pour le patron '+viewport.name,actualDefault);
      check(JSON.stringify(iaBDayNumbers(actualDefault.days))===JSON.stringify([1,2,3,4,5]),'Les jours ouvrés sont la vue patron par défaut '+viewport.name,actualDefault.days);
      await clickElement(tab,'#main .ia-b-weekday-settings input[name="includeSaturday"]',viewport.mobile);
      await clickElement(tab,'#main .ia-b-weekday-settings input[name="includeSunday"]',viewport.mobile);
      await clickElement(tab,'#main .ia-b-weekday-settings button[type="submit"]',viewport.mobile);
      try{await waitFor(()=>tab.evaluate(`iaBVisibleDaysState.loaded&&JSON.stringify(iaBVisibleDaysState.days)===JSON.stringify([1,2,3,4,5,6,0])&&!iaBPlanningState.loading`,'owner-weekend-settings-saved:'+viewport.name,5_000),'enregistrement du samedi et dimanche pour toute l’entreprise '+viewport.name,15_000)}catch(error){const diagnostic=await tab.evaluate(`(async()=>{const response=await fetch('/api/me/preferences/planning/visible-days',{cache:'no-store'}),saved=await response.json().catch(()=>({})),form=document.querySelector('#main .ia-b-weekday-settings');return{http:response.status,saved,days:iaBVisibleDaysState,planning:{loading:iaBPlanningState.loading,error:iaBPlanningState.error,key:iaBPlanningState.key},form:form?{saturday:form.elements.includeSaturday?.checked,sunday:form.elements.includeSunday?.checked,submitDisabled:form.querySelector('[type="submit"]')?.disabled}:null,toast:document.querySelector('#toast')?.textContent}})()`,'owner-weekend-save-diagnostic:'+viewport.name);console.error('PLANNING_WEEKEND_SAVE_DIAGNOSTIC='+JSON.stringify(diagnostic));throw error}
      weekendEnabledByOwner=true;
    }else{
      const sharedDays=await tab.evaluate(`(()=>({days:iaBVisibleDaysState.days.slice(),saturday:document.querySelector('#main .ia-b-weekday-settings input[name="includeSaturday"]')?.checked,sunday:document.querySelector('#main .ia-b-weekday-settings input[name="includeSunday"]')?.checked,rendered:document.querySelectorAll('#main .ia-b-week-day').length}))()`,'owner-shared-weekend-settings:'+viewport.name);
      check(JSON.stringify(sharedDays.days)===JSON.stringify([1,2,3,4,5,6,0])&&sharedDays.saturday&&sharedDays.sunday&&sharedDays.rendered===7,'Le réglage du week-end reste partagé après changement d’écran '+viewport.name,sharedDays);
    }

    await tab.evaluate(`navigate('permissions');${frames}`,'open-permissions:'+viewport.name);
    await waitFor(()=>tab.evaluate(`typeof serverAccessReady!=='undefined'&&serverAccessReady&&!serverAccessLoading`,'permissions-ready:'+viewport.name,5_000),'permissions ready '+viewport.name,15_000);
    await waitFor(()=>tab.evaluate(`storageReady&&!saveRunning&&!saveFailed&&workspaceSnapshot()===savedSnapshot`,'permissions-workspace-saved:'+viewport.name,5_000),'espace stable avant test des droits '+viewport.name,15_000);
    const worker=await tab.evaluate(`(()=>{const member=accessMembers().find(item=>!item.owner&&item.id&&item.serverRoleCode==='WORKER'&&item.name==='Anthony Simon');return member?{key:member.key,id:String(member.id),name:member.name,profile:accessAssignments[member.key].profile,serverRoleCode:member.serverRoleCode}:null})()`,'find-worker-preview:'+viewport.name);
    assert.ok(worker,'Le parcours d’accès doit proposer un profil ouvrier à prévisualiser ('+viewport.name+').');
    if(!cancelledFixtureId){
      const cancelledFixture=await tab.evaluate(`(async personId=>{
        const sourceResponse=await fetch('/api/planning?from=2026-09-28&to=2026-10-02',{cache:'no-store'}),sourceData=await sourceResponse.json();
        if(!sourceResponse.ok)return{error:'planning source HTTP '+sourceResponse.status};
        const source=(sourceData.assignments||[]).find(item=>item.status!=='cancelled'&&['2026-09-28','2026-09-29'].includes(item.date)&&(item.people||[]).map(String).includes(personId));
        if(!source)return{error:'aucune mission active témoin pour Anthony le 28/09 ou le 29/09'};
        const createResponse=await fetch('/api/assignments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({date:source.date,teamId:String(source.team),projectId:String(source.job),people:[personId],startTime:source.startTime||'07:00',endTime:source.endTime||'16:00',assignmentType:source.assignmentType||'team',status:'cancelled',reason:'Fixture de non-régression #119'})}),created=await createResponse.json();
        if(createResponse.status!==201)return{error:'création fixture annulée HTTP '+createResponse.status,detail:created.error||''};
        const id=String(created.id||created.assignment?.id||'');
        const verifyResponse=await fetch('/api/planning?from=2026-09-28&to=2026-10-02',{cache:'no-store'}),verifyData=await verifyResponse.json();
        return{id,ownerRetainsCancelled:(verifyData.assignments||[]).some(item=>String(item.id)===id&&item.status==='cancelled')};
      })(${JSON.stringify(worker.id)})`,'seed-cancelled-planning-fixture:'+viewport.name);
      assert.ok(cancelledFixture.id,'La fixture annulée de régression #119 doit être créée : '+JSON.stringify(cancelledFixture));
      assert.ok(cancelledFixture.ownerRetainsCancelled,'La vue de gestion conserve la ligne annulée dans son historique.');
      cancelledFixtureId=cancelledFixture.id;
      ownerRetainsCancelledFixture=cancelledFixture.ownerRetainsCancelled;
      console.log('REGRESSION_119_CANCELLED_FIXTURE='+JSON.stringify(cancelledFixture));
    }
    await clickElement(tab,`.access-member-list button[onclick="chooseAccessMember('${worker.key}')"]`,viewport.mobile);
    await waitFor(()=>tab.evaluate(`document.querySelector('.access-preview-actions button.primary')?.textContent.includes('Tester cet accès')`,'worker-preview-button:'+viewport.name,5_000),'bouton de prévisualisation ouvrier '+viewport.name,10_000);
    await clickElement(tab,'.access-preview-actions button.primary',viewport.mobile);
    await waitFor(()=>tab.evaluate(`globalThis.socleAccessPreviewVerified===true&&globalThis.socleCurrentAccess?.roleCode==='WORKER'&&/Mode test en lecture seule activé/.test(document.querySelector('#toast')?.innerText||'')`,'worker-preview-server-confirmed:'+viewport.name,5_000),'rôle WORKER confirmé par le serveur et interface stabilisée '+viewport.name,20_000);
    await tab.evaluate(`navigate('planning');${frames}`,'open-worker-planning:'+viewport.name);
    await waitFor(()=>tab.evaluate(`Boolean(iaBPlanningState?.error||(!iaBPlanningState?.loading&&iaBPlanningState?.key===iaBPlanningKey()))`,'planning-loaded:'+viewport.name,5_000),'planning chargé '+viewport.name,15_000);
    await tab.evaluate(`iaBSetPlanningAnchor('2026-09-28');${frames}`,'select-regression-week:'+viewport.name);
    try{await waitFor(()=>tab.evaluate(`Boolean(iaBPlanningState?.error||(!iaBPlanningState?.loading&&iaBPlanningState?.key===iaBPlanningKey()))`,'regression-week-loaded:'+viewport.name,5_000),'semaine de régression #116 chargée '+viewport.name,15_000)}catch(error){const state=await tab.evaluate(`({state:iaBPlanningState,expectedKey:iaBPlanningKey(),anchor:iaBPlanningAnchor,mode:iaBPlanningMode,role:socleCurrentAccess?.roleCode,preview:globalThis.socleAccessPreview,person:iaBWorkerPersonId(),view,planningVisible:canViewModule('planning'),assignment:sessionAssignment().modules?.planning,main:document.querySelector('#main')?.innerText||''})`,'regression-week-diagnostic:'+viewport.name);throw Error(error.message+' · état '+JSON.stringify(state))}
    const planning=await tab.evaluate(`(()=>{
      const days=[...document.querySelectorAll('#main .ia-b-worker-day')];
      const data=iaBPlanningState.data||{},personId=${JSON.stringify(worker.id)};
      const dateSet=new Set(days.map(day=>day.dataset.planningDate));
      const visibleAssignments=iaBFilteredAssignments(),expected=visibleAssignments.filter(item=>dateSet.has(item.date)&&(item.people||[]).map(String).includes(personId));
      const mins=value=>{const [h,m]=String(value||'').split(':').map(Number);return h*60+m},serverOverlaps=[];
      for(let i=0;i<expected.length;i++)for(let j=i+1;j<expected.length;j++)if(expected[i].date===expected[j].date&&mins(expected[i].startTime||'07:00')<mins(expected[j].endTime||'16:00')&&mins(expected[j].startTime||'07:00')<mins(expected[i].endTime||'16:00'))serverOverlaps.push([String(expected[i].id),String(expected[j].id)]);
      const missionDates=Object.fromEntries(['2026-09-28','2026-09-29'].map(date=>[date,expected.filter(item=>item.date===date).length]));
      const missionCards=[...document.querySelectorAll('#main .ia-b-worker-mission')];
      return{banner:document.querySelector('#main .access-test-banner')?.innerText||'',profile:sessionAssignment().profile,personId:String(sessionPerson()?.id||''),serverRole:socleCurrentAccess?.roleCode||'',heading:document.querySelector('#main .heading h1')?.textContent.trim()||'',workerDayCount:days.length,weekdays:days.map(day=>new Date(day.dataset.planningDate+'T12:00:00').getDay()),missionCount:missionCards.length,expectedOwnMissionCount:expected.length,cancelledInView:visibleAssignments.filter(item=>item.status==='cancelled').length,cancelledFixtureRendered:missionCards.some(node=>node.dataset.assignmentId===${JSON.stringify(cancelledFixtureId)}),cancelledFixturePresentForManager:${JSON.stringify(ownerRetainsCancelledFixture)},serverOverlaps,missionDates,managementDayCount:document.querySelectorAll('#main .ia-b-week-day').length,managementControls:document.querySelectorAll('#main .ia-b-filters,#main .ia-b-actions,#main .ia-b-planning-head>.tabs').length,visibleMissionTexts:missionCards.map(node=>node.innerText)}
    })()`,'worker-preview-output:'+viewport.name);
    console.log('REGRESSION_116_WORKER_'+viewport.name.toUpperCase()+'='+JSON.stringify(planning));
    check(planning.profile==='Ouvrier'||planning.profile==='Apprenti','Le profil prévisualisé est WORKER '+viewport.name,planning.profile);
    check(planning.personId===worker.id,'Le planning est rattaché à la personne prévisualisée '+viewport.name,{expected:worker.id,actual:planning.personId});
    check(planning.heading==='Mon planning','Le titre affiche Mon planning '+viewport.name,planning.heading);
    check(planning.workerDayCount===7,'Le planning ouvrier reprend les sept jours activés par le patron '+viewport.name,planning.workerDayCount);
    check(JSON.stringify(planning.weekdays)===JSON.stringify([1,2,3,4,5,6,0]),'Le planning ouvrier reprend samedi et dimanche activés par le patron '+viewport.name,planning.weekdays);
    check(planning.managementDayCount===0,'Le planning ouvrier ne montre pas la vue de gestion '+viewport.name,planning.managementDayCount);
    check(planning.managementControls===0,'Le planning ouvrier masque filtres et commandes de gestion '+viewport.name,planning.managementControls);
    check(planning.missionCount===planning.expectedOwnMissionCount,'Le planning ouvrier montre exactement les affectations serveur, sans déduplication frontend '+viewport.name,{visible:planning.missionCount,expected:planning.expectedOwnMissionCount});
    check(planning.cancelledInView===0&&!planning.cancelledFixtureRendered&&planning.cancelledFixturePresentForManager,'La ligne annulée reste dans la réponse de gestion mais disparaît de la vue ouvrier '+viewport.name,{cancelledInView:planning.cancelledInView,fixtureRendered:planning.cancelledFixtureRendered,managerRetains:planning.cancelledFixturePresentForManager});
    check(planning.serverOverlaps.length===0,'Anthony Simon ne reçoit aucune mission serveur simultanée '+viewport.name,planning.serverOverlaps);
    check(planning.missionDates['2026-09-28']===1&&planning.missionDates['2026-09-29']===1,'Anthony garde une seule mission les 28/09 et 29/09 '+viewport.name,planning.missionDates);

    await tab.evaluate(`(async()=>{await stopAccessPreview();navigate('fleet');${frames}})()`,'open-fleet:'+viewport.name);
    await waitFor(()=>tab.evaluate(`document.querySelector('.asset-categories button')?.textContent`,'fleet-open:'+viewport.name,5_000),'Biens & matériel visible '+viewport.name,10_000);
    const labels=[['vehicles','Véhicules',1],['tools','Outillage',2],['rentals','Locations',3],['repairs','À réparer',4],['vehicles','Véhicules',1]];
    let vehicleIds=[];
    for(const [key,label,buttonIndex] of labels){
      // Stable by visible order so the same interaction test also runs against the unfixed baseline.
      const selector=`.asset-categories button:nth-child(${buttonIndex})`;
      await clickElement(tab,selector,viewport.mobile);
      const result=await tab.evaluate(`(()=>{
        const button=document.querySelector(${JSON.stringify(selector)}),
          context=document.querySelector('#main .assets-filter-summary .ui-context-line__item'),
          filterBar=document.querySelector('#main .assets-filter-bar[data-ui-foundation="CompactFilterBar"]'),
          rows=[...document.querySelectorAll('#main .ia-asset-row')].filter(row=>!row.hidden);
        const expected=categoryAssets(${JSON.stringify(key)}).slice(0,Number(IA_A_LIST_LIMIT||12)).map(asset=>String(asset.id));
        return{
          category:assetCategory,
          selected:button?.classList.contains('selected')||false,
          label:button?.querySelector('span')?.textContent.trim()||'',
          context:context?.textContent.trim()||'',
          compactFilterBar:Boolean(filterBar),
          visibleIds:rows.map(row=>String(row.dataset.id)),
          expectedIds:expected,
          visibleNames:rows.map(row=>row.querySelector('strong')?.textContent.trim()||''),
          empty:document.querySelector('#main .ia-asset-list .empty')?.textContent.trim()||''
        }
      })()`,'fleet-category:'+viewport.name+':'+key);
      console.log('REGRESSION_116_FLEET_'+viewport.name.toUpperCase()+'_'+key.toUpperCase()+'='+JSON.stringify(result));
      check(result.category===key,'La catégorie active devient '+label+' '+viewport.name,result.category);
      check(result.selected,'Le bouton '+label+' est sélectionné '+viewport.name,result.selected);
      check(result.label===label,'Le libellé du bouton '+label+' est correct '+viewport.name,result.label);
      check(result.compactFilterBar,'Le CompactFilterBar canonique est rendu pour '+label+' '+viewport.name,result.compactFilterBar);
      check(result.context.startsWith(label+' · '),'La ContextLine correspond à la catégorie '+label+' '+viewport.name,result.context);
      check(JSON.stringify(result.visibleIds)===JSON.stringify(result.expectedIds),'La liste rendue correspond à '+label+' '+viewport.name,{visible:result.visibleIds,expected:result.expectedIds,empty:result.empty});
      if(result.expectedIds.length===0)check(result.empty.includes('Aucun bien ne correspond aux filtres.'),'Un état vide explicite remplace la liste pour '+label+' '+viewport.name,result.empty);
      if(key==='vehicles'){
        check(result.visibleIds.length>0,'La catégorie Véhicules rend une liste '+viewport.name,result.visibleIds);
        if(vehicleIds.length)check(JSON.stringify(result.visibleIds)===JSON.stringify(vehicleIds),'Le retour vers Véhicules restaure sa liste '+viewport.name,result.visibleIds);
        vehicleIds=result.visibleIds;
      }else{
        check(JSON.stringify(result.visibleIds)!==JSON.stringify(vehicleIds),'Le contenu a réellement quitté Véhicules pour '+label+' '+viewport.name,result.visibleIds);
      }
    }
  }
  if(weekendEnabledByOwner){
    await tab.evaluate(`(async()=>{await stopAccessPreview();navigate('planning');${frames}})()`,'restore-owner-planning-default');
    await waitFor(()=>tab.evaluate(`Boolean(iaBPlanningState?.error||(!iaBPlanningState?.loading&&iaBPlanningState?.data))`,'owner-planning-default-loaded',5_000),'planning patron chargé pour restaurer le réglage par défaut',15_000);
    const weekend=await tab.evaluate(`(()=>({saturday:document.querySelector('#main .ia-b-weekday-settings input[name="includeSaturday"]')?.checked,sunday:document.querySelector('#main .ia-b-weekday-settings input[name="includeSunday"]')?.checked}))()`,'owner-weekend-before-cleanup');
    if(weekend.saturday)await clickElement(tab,'#main .ia-b-weekday-settings input[name="includeSaturday"]',false);
    if(weekend.sunday)await clickElement(tab,'#main .ia-b-weekday-settings input[name="includeSunday"]',false);
    await clickElement(tab,'#main .ia-b-weekday-settings button[type="submit"]',false);
    await waitFor(()=>tab.evaluate(`iaBVisibleDaysState.loaded&&JSON.stringify(iaBVisibleDaysState.days)===JSON.stringify([1,2,3,4,5])&&!iaBPlanningState.loading`,'restore-weekday-default-saved',5_000),'retour du réglage partagé au lundi-vendredi après le test',15_000);
  }
  if(cancelledFixtureId){
    const cleanup=await tab.evaluate(`(async id=>{const response=await fetch('/api/assignments/'+encodeURIComponent(id),{method:'DELETE'});return{status:response.status}})(${JSON.stringify(cancelledFixtureId)})`,'cleanup-cancelled-planning-fixture');
    assert.equal(cleanup.status,200,'La fixture annulée temporaire est supprimée de la copie Browser Gate.');
  }
}finally{
  await tab.close();
  await browser.close();
}

assert.deepEqual(failures,[],'Régression #116 : parcours réel WORKER / catégories matériel en échec.');
console.log('browser-regression-116: PASS WORKER + Véhicules/Outillage/Locations/À réparer/Véhicules · desktop/mobile.');

function iaBDayNumbers(labels){
  const names=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  return labels.map(label=>names.findIndex(name=>String(label||'').toLocaleLowerCase('fr-BE').startsWith(name)));
}
