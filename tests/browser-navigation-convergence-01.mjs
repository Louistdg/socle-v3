import assert from 'node:assert/strict';
import {connectBrowser,waitForApp} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){console.log('browser-navigation-convergence-01: SKIP hors Browser Gate');process.exit(0)}

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base),sessions=[];
const roles=[
  {role:'OWNER',email:'direction@batinova.example',widths:[430,390,375]},
  {role:'TEAM_LEAD',email:'david.leclercq@batinova.example',widths:[390]},
  {role:'WORKER',email:'anthony.simon@batinova.example',widths:[430,390,375]},
  {role:'ACCOUNTING',email:'batxl.accounting@simulation.invalid',widths:[390]}
];
const ownerRequired=['purchases','stock','partners','people','fleet','quotes','gallery','actions','messages','contacts','accounting','permissions','company'];
const workerForbidden=['accounting','stock','purchases','partners'];

async function session(email,role){
  const tab=await browser.createSession(base);sessions.push(tab);
  await tab.navigate(base);
  const login=await tab.evaluate(`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)}})}).then(response=>response.status)`,'nav-login:'+role);
  assert.equal(login,204,'Connexion locale '+role);
  await tab.reload();
  await waitForApp(tab);
  return tab;
}
async function settle(tab){await tab.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))','nav-settle')}
async function point(tab,selector,label){
  return tab.evaluate(`(async()=>{let node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('Cible absente: '+${JSON.stringify(label)});const nav=node.closest('#nav');if(nav){const box=nav.getBoundingClientRect(),rect=node.getBoundingClientRect();if(rect.top<box.top)nav.scrollTop-=box.top-rect.top;else if(rect.bottom>box.bottom)nav.scrollTop+=rect.bottom-box.bottom}else if(!node.closest('#socleMobileNav'))node.scrollIntoView({block:'center',inline:'center'});await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('Cible disparue après scroll: '+${JSON.stringify(label)});const r=node.getBoundingClientRect();if(r.width<1||r.height<1)throw Error('Cible invisible: '+${JSON.stringify(label)});const v=visualViewport,bounds={left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||innerWidth,height:v?.height||innerHeight};if(r.left<bounds.left||r.top<bounds.top||r.right>bounds.left+bounds.width||r.bottom>bounds.top+bounds.height)throw Error('Cible hors viewport après scroll: '+${JSON.stringify(label)}+' '+JSON.stringify({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}));const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!hit||!node.contains(hit))throw Error('Cible masquée: '+${JSON.stringify(label)});return{x:x-bounds.left,y:y-bounds.top}})()`,'nav-point:'+label);
}
async function mouseClick(tab,selector,label){
  const p=await point(tab,selector,label);
  await tab.call('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
  await tab.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
  await settle(tab);
}
async function touchClick(tab,selector,label){
  const p=await point(tab,selector,label);
  await tab.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});
  await tab.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await settle(tab);
  if(selector.includes('data-mobile-menu-toggle'))assert.equal(await tab.evaluate("Boolean(document.querySelector('#socleMobileMoreDialog')?.open)",'nav-dialog-open:'+label),true,'Le toucher ouvre réellement Plus: '+label);
}
async function waitView(tab,route){
  const current=await tab.evaluate(`(async()=>{const end=Date.now()+5000;while(Date.now()<end&&String(view)!==${JSON.stringify(route)})await new Promise(r=>setTimeout(r,25));return String(view)})()`,'nav-view:'+route);
  if(current!==route){const diagnostic=await tab.evaluate(`(()=>{const node=document.querySelector('#nav button[data-nav-route="${route}"]'),rect=node?.getBoundingClientRect(),hit=rect&&document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return{view:String(view),button:node?.outerHTML,rect:rect&&{left:rect.left,top:rect.top,right:rect.right,bottom:rect.bottom},hit:hit&&{tag:hit.tagName,id:hit.id,route:hit.dataset?.navRoute,text:hit.textContent?.trim().slice(0,100),html:hit.outerHTML?.slice(0,260)},nav:{scrollTop:document.querySelector('#nav')?.scrollTop,clientHeight:document.querySelector('#nav')?.clientHeight,scrollHeight:document.querySelector('#nav')?.scrollHeight},active:[...document.querySelectorAll('#nav button.active')].map(button=>button.dataset.navRoute)}}})()`,'nav-diagnostic:'+route);assert.equal(current,route,'Le clic ouvre '+route+'; détail='+JSON.stringify(diagnostic));}
}
async function desktopRoutes(tab,role){
  await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:1000});
  await tab.evaluate("window.dispatchEvent(new Event('resize'))",'nav-desktop-resize:'+role);
  await settle(tab);
  const state=await tab.evaluate(`(()=>({dom:[...document.querySelectorAll('#nav button[data-nav-route]')].map(b=>b.dataset.navRoute),contract:SOCLE_NAVIGATION.desktopEntries().map(e=>e.route),legacy:Boolean(document.querySelector('#nav button[onclick*="applyMobileNavigation"]'))}))()`,'nav-desktop-routes:'+role);
  assert.deepEqual([...state.dom].sort(),[...state.contract].sort(),'ROOT_MODULE_VISIBLE_DESKTOP('+role+') couvre le contrat de navigation, sans imposer un ordre d’affichage');
  assert.equal(state.legacy,false,'Aucun moteur legacy desktop/mobile '+role);
  console.log('ROOT_MODULE_VISIBLE_DESKTOP('+role+')='+JSON.stringify(state.dom));
  return state.dom;
}
async function clickDesktop(tab,route,role){
  await mouseClick(tab,`#nav button[data-nav-route="${route}"]`,role+':desktop:'+route);
  await waitView(tab,route);
}
async function mobileReachable(tab,role,width){
  await tab.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:844});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await tab.evaluate("window.dispatchEvent(new Event('resize'))",'nav-mobile-resize:'+role+':'+width);
  await settle(tab);
  const bottom=await tab.evaluate(`[...document.querySelectorAll('#socleMobileNav button[data-mobile-route]')].map(b=>b.dataset.mobileRoute)`,'nav-bottom:'+role+':'+width);
  await touchClick(tab,'#socleMobileNav [data-mobile-menu-toggle]',role+':plus-open:'+width);
  const more=await tab.evaluate(`[...document.querySelectorAll('#socleMobileMoreDialog button[data-mobile-route]')].map(b=>b.dataset.mobileRoute)`,'nav-more:'+role+':'+width);
  const contract=await tab.evaluate(`SOCLE_NAVIGATION.desktopEntries().map(e=>e.route)`,'nav-contract-mobile:'+role+':'+width);
  const reachable=[...new Set([...bottom,...more])];
  for(const route of contract)assert.ok(reachable.includes(route),'ROOT_MODULE_REACHABLE_MOBILE('+role+') couvre '+route+' à '+width);
  for(const route of reachable)assert.ok(contract.includes(route),'Mobile ne révèle pas de route racine absente desktop: '+route+' '+role);
  console.log('ROOT_MODULE_REACHABLE_MOBILE('+role+','+width+')='+JSON.stringify(reachable));
  await touchClick(tab,'#socleMobileMoreDialog [data-mobile-menu-close]',role+':plus-close:'+width);
  return {bottom,more,reachable,contract};
}
async function clickMobile(tab,route,role,width){
  const direct=await tab.evaluate(`Boolean(document.querySelector('#socleMobileNav button[data-mobile-route="${route}"]'))`,'nav-direct-probe:'+route);
  if(direct)await touchClick(tab,`#socleMobileNav button[data-mobile-route="${route}"]`,role+':mobile:'+width+':'+route);
  else{
    await touchClick(tab,'#socleMobileNav [data-mobile-menu-toggle]',role+':plus:'+width+':'+route);
    await touchClick(tab,`#socleMobileMoreDialog button[data-mobile-route="${route}"]`,role+':mobile-plus:'+width+':'+route);
  }
  await waitView(tab,route);
}

try{
  for(const spec of roles){
    const tab=await session(spec.email,spec.role);
    const desktop=await desktopRoutes(tab,spec.role);
    if(spec.role==='OWNER')for(const route of ownerRequired)assert.ok(desktop.includes(route),'OWNER desktop expose '+route);
    if(spec.role==='WORKER')for(const route of workerForbidden)assert.ok(!desktop.includes(route),'WORKER ne voit pas '+route);
    for(const route of desktop)await clickDesktop(tab,route,spec.role);
    for(const width of spec.widths){
      const mobile=await mobileReachable(tab,spec.role,width);
      if(spec.role==='OWNER')for(const route of ownerRequired)assert.ok(mobile.reachable.includes(route),'OWNER mobile '+width+' atteint '+route);
      if(spec.role==='WORKER')for(const route of workerForbidden)assert.ok(!mobile.reachable.includes(route),'WORKER mobile '+width+' ne voit pas '+route);
      for(const route of desktop)await clickMobile(tab,route,spec.role,width);
    }
    await tab.close();
  }
}finally{
  for(const tab of sessions){try{await tab.close()}catch{}}
  await browser.close();
}

console.log('browser-navigation-convergence-01: PASS ROOT_MODULE_VISIBLE_DESKTOP(role) ⊆ ROOT_MODULE_REACHABLE_MOBILE(role) par clic réel');
