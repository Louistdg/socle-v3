import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';
const base=process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386';
const browser=await connectBrowser(base),tab=await browser.createSession(base);
const ev=(s)=>tab.evaluate(s,'team-composer');
const ready=()=>waitFor(()=>ev("typeof tc!=='undefined'&&tc.state==='ready'&&!tc.busy"),'team board ready',20000);
const open=async()=>{await ev("navigate('people');peopleSection='teams';render()");await ready()};
let touchMode=false;
const click=async(selector)=>{const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);if(touchMode){await tab.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:4,radiusY:4}]});await tab.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});return}await tab.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await tab.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p})};
const capture=async(name)=>{mkdirSync('tests/artifacts',{recursive:true});const shot=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync('tests/artifacts/'+name+'.png',Buffer.from(shot.data,'base64'))};
try{
 await tab.navigate(base+'/');assert.equal(await ev("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)"),204);
 await tab.reload();await waitForApp(tab);
 await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await ev("navigator.serviceWorker.ready.then(()=>caches.open('socle-shell-v1')).then(c=>c.put('/socle.css',new Response('.tc-board{display:block!important}',{headers:{'Content-Type':'text/css'}})))");
 await tab.reload();await waitForApp(tab);
 await open();
 assert.equal(await ev("getComputedStyle(document.querySelector('.tc-board')).display"),'grid','old PWA stylesheet cannot mask the new board');
 const fixture=await ev(`(async()=>{const r=await serverJson('/api/hr/teams',{method:'POST',body:JSON.stringify({name:'0 · Équipe test '+(9999999999999-Date.now())})});return {team:r.team.id,person:(tc.people.find(p=>!tcPersonTeams(p.id).length)||tc.people[0]).id,job:jobs[0].id}})()`);
 await ev('tcLoad()');await ready();await capture('team-composer-before-drag');
 // Use a real mouse gesture: no direct call to tcMove or synthetic DragEvent.
 const points=await ev(`(()=>{const grip=document.querySelector('[data-tc-move="${fixture.person}"]'),target=document.querySelector('[data-tc-target="${fixture.team}"]');grip.scrollIntoView({block:'center'});const a=grip.getBoundingClientRect(),b=target.getBoundingClientRect();return{a:{x:a.x+a.width/2,y:a.y+a.height/2},b:{x:b.x+30,y:b.y+30}}})()`);
 await tab.call('Input.dispatchMouseEvent',{type:'mouseMoved',...points.a});
 await tab.call('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',buttons:1,clickCount:1,...points.a});
 for(let i=1;i<=15;i++)await tab.call('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:points.a.x+(points.b.x-points.a.x)*i/15,y:points.a.y+(points.b.y-points.a.y)*i/15});
 await tab.call('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...points.b});
 await waitFor(()=>ev(`!tc.busy&&tcPersonTeams('${fixture.person}').includes('${fixture.team}')`),'real desktop drag saved',15000);
 await tab.reload();await waitForApp(tab);await open();assert.deepEqual(await ev(`tcPersonTeams('${fixture.person}')`),[fixture.team]);
 // Persisted move can be undone using the ordinary destination dialog after reload.
 await click(`[data-tc-person="${fixture.person}"] [data-tc-move]`);
 await ev(`document.querySelector('#tc-move-form select').value='';document.querySelector('#tc-move-form').requestSubmit()`);await ready();
 assert.deepEqual(await ev(`tcPersonTeams('${fixture.person}')`),[]);
 await click('.tc-feedback button');await ready();assert.deepEqual(await ev(`tcPersonTeams('${fixture.person}')`),[fixture.team]);
 await capture('team-composer-pc');
 // Planning uses the saved composition, with inline errors and no closing on refusal.
 await click(`[data-tc-plan="${fixture.team}"]`);
 await waitFor(()=>ev("Boolean(document.querySelector('#tc-plan-form'))"),'plan form');
 const date=await ev("iaBAddDays(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Brussels'}).format(new Date()),21)");
 await ev(`(()=>{const f=document.querySelector('#tc-plan-form');f.elements.date.value='${date}';f.elements.job.value='${fixture.job}';f.requestSubmit()})()`);
 await waitFor(()=>ev("view==='planning'&&!document.querySelector('dialog[open] #tc-plan-form')&&!iaBPlanningState.loading"),'assignment saved',20000);
 assert.ok(await ev(`iaBPlanningState.data.assignments.some(a=>String(a.team)==='${fixture.team}'&&a.people.map(String).includes('${fixture.person}'))`));
 await tab.reload();await waitForApp(tab);await ev(`navigate('planning');iaBSetPlanningAnchor('${date}')`);
 await waitFor(()=>ev(`!iaBPlanningState.loading&&iaBPlanningState.data?.assignments.some(a=>String(a.team)==='${fixture.team}')`),'assignment persists',15000);
 await ev(`iaBOpenAssignment(iaBPlanningState.data.assignments.find(a=>String(a.team)==='${fixture.team}').id)`);
 assert.equal(await ev("document.querySelector('dialog[open] select[name=team]').value"),fixture.team,'editing retains the newly created relational team');
 await ev('closeModal()');
 await capture('team-planning-pc');
 await open();await click(`[data-tc-plan="${fixture.team}"]`);await waitFor(()=>ev("Boolean(document.querySelector('#tc-plan-form'))"),'plan form');
 await ev(`(()=>{const f=document.querySelector('#tc-plan-form');f.elements.date.value='${date}';f.elements.job.value='${fixture.job}';f.requestSubmit()})()`);
 await waitFor(()=>ev("/conflit/i.test(document.querySelector('#tc-plan-form .form-error')?.textContent||'')"),'overlap rejected',15000);
 await ev('closeModal()');
 for(const width of [360,412]){
  touchMode=true;
  await tab.call('Emulation.setDeviceMetricsOverride',{width,height:915,deviceScaleFactor:1,mobile:true});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await tab.call('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'});
  await ev('render()');await ready();
  assert.equal(await ev('document.documentElement.scrollWidth>innerWidth'),false,'no horizontal page overflow');
  await click(`[data-tc-person="${fixture.person}"] [data-tc-move]`);
  assert.ok(await ev("document.querySelector('#tc-move-form select').getBoundingClientRect().width>100"));
  await capture('team-composer-samsung-'+width+'-move');
  await ev("document.querySelector('#tc-move-form select').value='';document.querySelector('#tc-move-form').requestSubmit()");await ready();
  assert.deepEqual(await ev(`tcPersonTeams('${fixture.person}')`),[]);
  await click('.tc-feedback button');await ready();
  await ev('window.scrollTo(0,0)');await capture('team-composer-samsung-'+width);
 }
 console.log('browser-team-composer: PASS — real drag, persistence, undo, planning, overlap refusal, Samsung 360/412');
}catch(error){await capture('team-composer-failure');console.log(await ev('JSON.stringify({error:tc.error,state:tc.state,drag:tc.drag,message:tc.message})'));throw error}finally{await tab.close();await browser.close()}
