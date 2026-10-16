import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){console.log('browser-home-person-scope-01: SKIP hors Browser Gate');process.exit(0)}

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base),sessions=[];
let homonymFixtureEnabled=false;
async function setHomonymFixture(enabled){
  const response=await fetch(base+'/__local-test/home-person-scope-homonym',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enabled})});
  assert.equal(response.status,204,'Fixture homonyme locale '+(enabled?'activée':'désactivée'));
  homonymFixtureEnabled=enabled;
}
mkdirSync(new URL('./artifacts/',import.meta.url),{recursive:true});

async function login(email){
  const tab=await browser.createSession(base);sessions.push(tab);
  await tab.navigate(base);
  const status=await tab.evaluate(`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)}})}).then(response=>response.status)`,'home-scope-login:'+email);
  assert.equal(status,204,'Connexion locale '+email);
  await tab.reload();
  await waitForApp(tab);
  await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  return tab;
}
async function openHome(tab,label){
  await tab.evaluate(`(()=>{navigate('home');window.dispatchEvent(new Event('resize'));return true})()`,'home-scope-open:'+label);
  await waitFor(()=>tab.evaluate(`(()=>{const main=document.querySelector('#main');return Boolean(view==='home'&&main&&!main.querySelector('.ia-state-loading')&&!main.querySelector('.load-error'))})()`,'home-scope-ready:'+label), 'home ready '+label,30000);
}
async function weekQuery(tab,viewAs=''){
  return tab.evaluate(`(async()=>{const anchor=String(typeof reference!=='undefined'?reference:new Date().toISOString().slice(0,10)),start=new Date(anchor+'T12:00:00');start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(start.getDate()+4);const query=new URLSearchParams({from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)});if(${JSON.stringify(viewAs)})query.set('view_as_user_id',${JSON.stringify(viewAs)});return serverJson('/api/home-overview?'+query.toString())})()`,'home-scope-api');
}
async function probe(tab,label){
  return tab.evaluate(`(()=>({role:document.body.dataset.iaARole||'',text:document.querySelector('#main')?.innerText||'',quick:[...document.querySelectorAll('#main .ia-quick-actions button,#main .ia-action-panel button,#main .ia-worker-actions button')].map(button=>button.textContent.trim().replace(/\\s+/g,' ')),priority:[...document.querySelectorAll('#main .ia-summary .ia-summary-row strong')].map(node=>node.textContent.trim()),week:[...document.querySelectorAll('#main .ia-person-week li:not(.is-empty) strong')].map(node=>node.textContent.trim()),hasOwnerQuick:/Nouveau chantier|Nouveau devis|Personnel & équipes/.test(document.querySelector('#main')?.innerText||''),viewport:{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}}))()`,'home-scope-probe:'+label);
}
async function screenshot(tab,name){
  const image=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  writeFileSync(new URL('./artifacts/home-person-scope-'+name+'.png',import.meta.url),Buffer.from(image.data,'base64'));
}
const ids=body=>body.tasks.map(item=>String(item.id)).sort();
const assignmentIds=body=>body.assignments.map(item=>String(item.id)).sort();
const obligations=body=>body.obligations.map(item=>String(item.title)).sort();
function assertPersonalServerScope(data,label){
  const userId=String(data?.access?.userId||''),personId=String(data?.access?.personId||'');
  assert.ok(userId,label+' possède un userId effectif');
  assert.ok(personId,label+' possède un personId effectif');
  for(const task of data.tasks||[]){
    const participants=(task.people||[]).map(String);
    assert.ok(String(task.assignedTo||'')===userId||String(task.createdBy||'')===userId||participants.includes(userId),label+' ne reçoit que des tâches dont il est participant');
  }
  for(const assignment of data.assignments||[])assert.ok((assignment.people||[]).map(String).includes(personId),label+' ne reçoit que ses affectations explicites');
}

try{
  const davidTab=await login('david.leclercq@batinova.example');
  await openHome(davidTab,'david');
  const davidData=await weekQuery(davidTab);
  const davidProbe=await probe(davidTab,'david');
  assert.equal(davidData.access.roleCode,'TEAM_LEAD');
  assert.equal(davidProbe.role,davidData.access.roleCode);
  const davidActual=await davidTab.evaluate(`(()=>{const access=globalThis.socleCurrentAccess;return access?{userId:String(access.userId||''),personId:String(access.personId||''),roleCode:String(access.roleCode||'')}:null})()`,'home-scope-david-actual');
  assert.deepEqual(davidActual,{userId:String(davidData.access.userId),personId:String(davidData.access.personId),roleCode:String(davidData.access.roleCode)},'la session David correspond exactement à l’identité serveur authentifiée');
  assertPersonalServerScope(davidData,'David');
  assert.equal(davidData.widgetScopes.tasks,'person');
  assert.equal(davidData.widgetScopes.week,'person');
  assert.equal(davidProbe.hasOwnerQuick,false,'David ne reçoit pas les actions rapides OWNER');
  assert.equal(davidProbe.viewport.width,390);
  assert.equal(davidProbe.viewport.overflow,false,'pas de débordement horizontal sur l’accueil David');
  await screenshot(davidTab,'david-team-lead');

  const workerTab=await login('anthony.simon@batinova.example');
  await openHome(workerTab,'anthony');
  const workerData=await weekQuery(workerTab);
  const workerProbe=await probe(workerTab,'anthony');
  assert.equal(workerData.access.roleCode,'WORKER');
  assert.equal(workerProbe.role,workerData.access.roleCode);
  const workerActual=await workerTab.evaluate(`(()=>{const access=globalThis.socleCurrentAccess;return access?{userId:String(access.userId||''),personId:String(access.personId||''),roleCode:String(access.roleCode||'')}:null})()`,'home-scope-worker-actual');
  assert.deepEqual(workerActual,{userId:String(workerData.access.userId),personId:String(workerData.access.personId),roleCode:String(workerData.access.roleCode)},'la session WORKER correspond exactement à son identité serveur authentifiée');
  assertPersonalServerScope(workerData,'WORKER');
  assert.equal(workerData.widgetScopes.tasks,'person');
  assert.equal(workerProbe.hasOwnerQuick,false,'le WORKER ne reçoit pas les actions rapides OWNER');
  assert.equal(workerProbe.viewport.overflow,false,'pas de débordement horizontal sur l’accueil WORKER');
  await screenshot(workerTab,'anthony-worker');

  await setHomonymFixture(true);
  const homonymTab=await login('anthony.homonym@batinova.example');
  await openHome(homonymTab,'anthony-homonym');
  const homonymData=await weekQuery(homonymTab);
  const homonymProbe=await probe(homonymTab,'anthony-homonym');
  assert.equal(homonymData.access.roleCode,'WORKER');
  assert.equal(homonymData.access.name,workerData.access.name,'les deux profils de test portent volontairement le même nom');
  assert.notEqual(String(homonymData.access.userId),String(workerData.access.userId),'les homonymes ont des userId distincts');
  assert.notEqual(String(homonymData.access.personId),String(workerData.access.personId),'les homonymes ont des personId distincts');
  const workerTaskIds=new Set(ids(workerData));
  assert.equal(ids(homonymData).some(id=>workerTaskIds.has(id)),false,'aucune tâche du premier Anthony ne fuit vers son homonyme');
  assertPersonalServerScope(homonymData,'Homonyme WORKER');
  assert.equal(homonymProbe.role,'WORKER');
  assert.equal(homonymProbe.hasOwnerQuick,false,'l’homonyme WORKER ne reçoit pas les actions OWNER');
  await screenshot(homonymTab,'anthony-homonym-worker');
  await setHomonymFixture(false);

  const ownerTab=await login('direction@batinova.example');
  await openHome(ownerTab,'owner');
  const ownerData=await weekQuery(ownerTab);
  const ownerProbe=await probe(ownerTab,'owner');
  assert.equal(ownerData.access.roleCode,'OWNER');
  assert.equal(ownerData.widgetScopes.tasks,'organization');
  assert.equal(ownerProbe.role,'OWNER');
  assert.equal(ownerProbe.hasOwnerQuick,true,'le OWNER conserve ses actions globales');
  await screenshot(ownerTab,'owner');

  await ownerTab.evaluate(`(()=>{navigate('permissions');return true})()`,'home-scope-open-permissions');
  await waitFor(()=>ownerTab.evaluate(
    "(()=>Boolean(view==='permissions'&&typeof serverAccessReady!=='undefined'&&serverAccessReady&&accessMembers().some(item=>String(item.serverUserId||'')==="+JSON.stringify(String(davidData.access.userId))+")))()",
    'home-scope-permissions-ready'
  ),'permissions roster ready',30000);

  const previewInfo=await ownerTab.evaluate(
    "(async()=>{const targetUserId="+JSON.stringify(String(davidData.access.userId))+",targetPersonId="+JSON.stringify(String(davidData.access.personId))+",targetRole="+JSON.stringify(String(davidData.access.roleCode))+";const member=typeof accessMembers==='function'?accessMembers().find(item=>String(item.serverUserId||'')===targetUserId):null;if(!member)throw Error('Compte serveur David introuvable pour le test view-as');if(String(member.id||'')!==targetPersonId)throw Error('Le roster David ne correspond pas au personId serveur.');if(String(member.serverRoleCode||'')!==targetRole)throw Error('Le rôle serveur David ne correspond pas.');const saveDeadline=Date.now()+15000;while(!(storageReady&&!saveRunning&&!saveFailed&&workspaceSnapshot()===savedSnapshot)&&Date.now()<saveDeadline)await new Promise(resolve=>setTimeout(resolve,50));if(!(storageReady&&!saveRunning&&!saveFailed&&workspaceSnapshot()===savedSnapshot))throw Error('Workspace not settled before access preview');const actual=globalThis.socleAuthenticatedAccess||globalThis.socleCurrentAccess;await startAccessPreview(member.key);return{key:member.key,userId:String(member.serverUserId),personId:String(member.id),serverRoleCode:String(member.serverRoleCode),sessionKey:String(sessionAccessKey||''),preview:globalThis.socleAccessPreview,verified:globalThis.socleAccessPreviewVerified,previewError:globalThis.socleAccessPreviewError||'',toast:document.querySelector('#toast')?.innerText||'',actual:actual&&{userId:String(actual.userId||''),roleCode:String(actual.roleCode||'')}}})()",
    'home-scope-start-view-as'
  );
  assert.equal(previewInfo.actual.roleCode,'OWNER','l’acteur authentifié reste OWNER pendant le view-as');
  assert.equal(previewInfo.sessionKey,previewInfo.key,'la session UI active exactement la personne ciblée');
  assert.deepEqual({userId:previewInfo.userId,personId:previewInfo.personId,roleCode:previewInfo.serverRoleCode},{userId:String(davidData.access.userId),personId:String(davidData.access.personId),roleCode:String(davidData.access.roleCode)},'la cible UI correspond exactement à David côté serveur/roster');
  await waitFor(()=>ownerTab.evaluate(
    "(()=>{const main=document.querySelector('#main');return Boolean(view==='home'&&String(sessionAccessKey||'')==="+JSON.stringify(previewInfo.key)+"&&document.body.dataset.iaARole==="+JSON.stringify(String(davidData.access.roleCode))+"&&main&&!main.querySelector('.ia-state-loading'))})()",
    'home-scope-preview-ready'
  ),'view-as David ready',30000);
  const previewData=await weekQuery(ownerTab,previewInfo.userId);
  const previewProbe=await probe(ownerTab,'owner-view-as-david');

  assert.equal(previewData.preview,true);
  assert.equal(previewData.access.userId,davidData.access.userId);
  assert.deepEqual(ids(previewData),ids(davidData),'view-as OWNER reproduit exactement les tâches visibles par David');
  assert.deepEqual(assignmentIds(previewData),assignmentIds(davidData),'view-as OWNER reproduit exactement le planning visible par David');
  assert.deepEqual(obligations(previewData),obligations(davidData),'view-as OWNER reproduit exactement les obligations visibles par David');
  assert.equal(previewProbe.role,'TEAM_LEAD');
  assert.equal(previewProbe.hasOwnerQuick,false,'le mode view-as ne conserve aucune action rapide OWNER');

  const quick=await ownerTab.evaluate(`(()=>{quickCreateMenu();const labels=[...document.querySelectorAll('#modalbody .quick-create-menu button')].map(button=>button.textContent.trim().replace(/\\s+/g,' '));const violations=[];if(labels.some(x=>x.startsWith('Nouveau chantier'))&&!canModuleAction('jobs','add'))violations.push('jobs.add');if(labels.some(x=>x.startsWith('Nouveau devis'))&&!canModuleAction('quotes','add'))violations.push('quotes.add');if(labels.some(x=>x.startsWith('Ajouter une personne'))&&!canModuleAction('people','add'))violations.push('people.add');if(labels.some(x=>x.startsWith('Ajouter une dépense'))&&!canFieldAction('submitExpense'))violations.push('submitExpense');closeModal();return{labels,violations}})()`,'home-scope-quick-create');
  assert.deepEqual(quick.violations,[],'le menu + ne révèle aucune action interdite au profil simulé');
  await screenshot(ownerTab,'owner-view-as-david');
  await ownerTab.call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false,screenWidth:1280,screenHeight:900});
  await ownerTab.evaluate(`(()=>{window.dispatchEvent(new Event('resize'));render();return true})()`,'home-scope-preview-desktop-render');
  await waitFor(()=>ownerTab.evaluate(
    "(()=>{const main=document.querySelector('#main');return Boolean(main&&String(sessionAccessKey||'')==="+JSON.stringify(previewInfo.key)+"&&document.body.dataset.iaARole==="+JSON.stringify(String(davidData.access.roleCode))+"&&!main.querySelector('.ia-state-loading'))})()",
    'home-scope-preview-desktop-ready'
  ),'view-as David desktop ready',30000);
  const desktopPreview=await probe(ownerTab,'owner-view-as-david-desktop');
  assert.equal(desktopPreview.viewport.width,1280,'preuve desktop exécutée à 1280 px');
  assert.equal(desktopPreview.viewport.overflow,false,'aucun débordement horizontal en desktop');
  assert.equal(desktopPreview.hasOwnerQuick,false,'le view-as desktop ne récupère pas les actions OWNER');
  const desktopTarget=await ownerTab.evaluate(`(()=>{const member=typeof accessMembers==='function'?accessMembers().find(item=>item.key===sessionAccessKey):null;return member?{userId:String(member.serverUserId||''),personId:String(member.id||''),roleCode:String(member.serverRoleCode||'')}:null})()`,'home-scope-preview-desktop-target');
  assert.deepEqual(desktopTarget,{userId:String(previewData.access.userId),personId:String(previewData.access.personId),roleCode:String(previewData.access.roleCode)},'le scope David reste identique entre mobile et desktop');
  await screenshot(ownerTab,'owner-view-as-david-desktop');
  await ownerTab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});

  await ownerTab.evaluate(`(async()=>{await stopAccessPreview();return String(sessionAccessKey||'')})()`,'home-scope-stop-david-preview');
  const candidateMembers=await ownerTab.evaluate(`(()=>accessMembers().filter(item=>!item.owner&&item.id!=null&&item.serverUserId&&item.serverRoleCode==='WORKER').map(item=>({key:item.key,userId:String(item.serverUserId),personId:String(item.id),roleCode:String(item.serverRoleCode),name:item.name})))()`,'home-scope-worker-candidates');
  const signature=data=>JSON.stringify({tasks:ids(data),assignments:assignmentIds(data)});
  const davidSignature=signature(davidData);
  let alternate=null;
  for(const member of candidateMembers){
    if(member.userId===String(davidData.access.userId))continue;
    const data=await weekQuery(ownerTab,member.userId);
    if(signature(data)===davidSignature)continue;
    await ownerTab.evaluate("(async()=>{await startAccessPreview("+JSON.stringify(member.key)+");return String(sessionAccessKey||'')})()",'home-scope-start-other-worker');
    alternate={...member,data,davidSignature,workerSignature:signature(data)};
    break;
  }
  assert.ok(alternate,'un WORKER d’un autre périmètre doit être disponible pour prouver le changement de scope');
  await waitFor(()=>ownerTab.evaluate(`(()=>{const main=document.querySelector('#main');return Boolean(view==='home'&&document.body.dataset.iaARole==='WORKER'&&main&&!main.querySelector('.ia-state-loading'))})()`,'home-scope-other-worker-ready'),'other worker view-as ready',30000);
  const alternateProbe=await probe(ownerTab,'owner-view-as-other-worker');
  assert.equal(alternateProbe.role,'WORKER');
  assert.notEqual(alternate.workerSignature,alternate.davidSignature,'les affectations/tâches d’un autre WORKER diffèrent réellement de celles de David');
  const alternateTarget=await ownerTab.evaluate(`(()=>{const member=typeof accessMembers==='function'?accessMembers().find(item=>item.key===sessionAccessKey):null;return member?{userId:String(member.serverUserId||''),personId:String(member.id||''),roleCode:String(member.serverRoleCode||'')}:null})()`,'home-scope-alternate-target');
  assert.deepEqual(alternateTarget,{userId:String(alternate.data.access.userId),personId:String(alternate.data.access.personId),roleCode:String(alternate.data.access.roleCode)},'le second view-as utilise exactement son identité serveur, sans dépendre du nom affiché');
  assert.equal(alternateProbe.hasOwnerQuick,false,'le second profil simulé ne récupère pas les raccourcis OWNER');
  await screenshot(ownerTab,'owner-view-as-other-worker');

  const unlinkedPreview=await ownerTab.evaluate(`(async()=>{await stopAccessPreview();const member=accessMembers().find(item=>String(item.serverUserId||'')==='test-unlinked-worker'),before=String(sessionAccessKey||'');if(member)await startAccessPreview(member.key);const after=String(sessionAccessKey||''),anchor=String(typeof reference!=='undefined'?reference:new Date().toISOString().slice(0,10)),start=new Date(anchor+'T12:00:00');start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(start.getDate()+4);const query='/api/home-overview?from='+encodeURIComponent(start.toISOString().slice(0,10))+'&to='+encodeURIComponent(end.toISOString().slice(0,10))+'&view_as_user_id='+encodeURIComponent('test-unlinked-worker'),response=await fetch(query,{headers:{'x-socle-organization-id':String(globalThis.socleCurrentOrganizationId||'')}});let body={};try{body=await response.json()}catch{}return{status:response.status,body,before,after,listed:Boolean(member),memberId:member?.id??null}})()`,'home-scope-unlinked-preview');
  assert.equal(unlinkedPreview.listed,true,'le compte serveur sans roster reste visible comme entrée serveur non liée');
  assert.equal(unlinkedPreview.memberId,null,'le compte non relié n’acquiert aucun personId artificiel dans le roster UI');
  assert.equal(unlinkedPreview.before,'owner');
  assert.equal(unlinkedPreview.after,'owner','Tester cet accès refuse le profil sans roster sans quitter OWNER');
  // Le refus serveur du view-as sans roster est couvert hermétiquement dans home-person-scope-01.mjs.
  // Ici, la preuve Browser conserve le garde-fou UI puis vérifie ci-dessous la session réelle sans roster de bout en bout.

  const unlinkedTab=await login('unlinked.worker@batinova.example');
  await unlinkedTab.evaluate(`(()=>{navigate('home');return true})()`,'home-scope-unlinked-home');
  const unlinkedResponse=await unlinkedTab.evaluate(`(async()=>{const anchor=String(typeof reference!=='undefined'?reference:new Date().toISOString().slice(0,10)),start=new Date(anchor+'T12:00:00');start.setDate(start.getDate()-((start.getDay()+6)%7));const end=new Date(start);end.setDate(start.getDate()+4);const query='/api/home-overview?from='+encodeURIComponent(start.toISOString().slice(0,10))+'&to='+encodeURIComponent(end.toISOString().slice(0,10)),response=await fetch(query,{headers:{'x-socle-organization-id':String(globalThis.socleCurrentOrganizationId||'')}});let body={};try{body=await response.json()}catch{}return{status:response.status,body}})()`,'home-scope-unlinked-api');
  assert.equal(unlinkedResponse.status,403,'un WORKER réel sans roster est refusé côté serveur');
  await waitFor(()=>unlinkedTab.evaluate(`(()=>Boolean(document.querySelector('#main .ia-state-error')||document.querySelector('#main .ia-state-forbidden')))()`,'home-scope-unlinked-error-ready'),'unlinked secure home ready',30000);
  const unlinkedUi=await unlinkedTab.evaluate(`(()=>({role:document.body.dataset.iaARole||'',rows:document.querySelectorAll('#main .ia-summary-row').length,ownerQuick:/Nouveau chantier|Nouveau devis|Personnel & équipes/.test(document.querySelector('#main')?.innerText||''),text:document.querySelector('#main')?.innerText||''}))()`,'home-scope-unlinked-ui');
  assert.equal(unlinkedUi.role,'WORKER');
  assert.equal(unlinkedUi.rows,0,'aucune tâche globale n’est rendue pour le profil sans roster');
  assert.equal(unlinkedUi.ownerQuick,false,'aucun raccourci OWNER ne fuit vers le profil sans roster');
  await screenshot(unlinkedTab,'unlinked-worker-secure');

  console.log('HOME_PERSON_SCOPE_BROWSER='+JSON.stringify({
    david:{access:davidData.access,tasks:ids(davidData),assignments:assignmentIds(davidData),obligations:obligations(davidData),ui:davidProbe},
    worker:{access:workerData.access,tasks:ids(workerData),assignments:assignmentIds(workerData),obligations:obligations(workerData),ui:workerProbe},
    homonym:{access:homonymData.access,tasks:ids(homonymData),assignments:assignmentIds(homonymData),ui:homonymProbe},
    owner:{access:ownerData.access,taskCount:ownerData.tasks.length,assignmentCount:ownerData.assignments.length,ui:ownerProbe},
    preview:{access:previewData.access,tasks:ids(previewData),assignments:assignmentIds(previewData),obligations:obligations(previewData),ui:previewProbe,quickCreate:quick},
    alternate:{userId:alternate.userId,name:alternate.name,ui:alternateProbe},
    unlinked:{preview:unlinkedPreview,direct:unlinkedResponse}
  }));
  console.log('browser-home-person-scope-01: PASS 390px + desktop · identité serveur · homonymes · view-as multi-personnes · no-roster guard');
}finally{
  if(homonymFixtureEnabled){try{await setHomonymFixture(false)}catch{}}
  for(const tab of sessions){try{await tab.close()}catch{}}
  await browser.close();
}
