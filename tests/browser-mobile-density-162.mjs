import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){console.log('browser-mobile-density-162: SKIP hors Browser Gate');process.exit(0)}

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base);
const tab=await browser.createSession(base);
const artifacts=resolve('tests','artifacts','mobile-density-162');
mkdirSync(artifacts,{recursive:true});

const viewports=[
  {name:'375x667',width:375,height:667},
  {name:'390x844',width:390,height:844},
  {name:'430x844',width:430,height:844}
];
const routes=[
  {key:'home',label:'Accueil',selector:'.ia-role-head'},
  {key:'jobs',label:'Chantiers',selector:'.ia-jobs-list'},
  {key:'planning',label:'Planning',selector:'.ia-b-week-day'},
  {key:'personal',label:'Moi',selector:'.personal-head'}
];

async function viewport(v){
  await tab.call('Emulation.setDeviceMetricsOverride',{width:v.width,height:v.height,deviceScaleFactor:1,mobile:true,screenWidth:v.width,screenHeight:v.height});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
}
async function openRoute(route){
  await tab.evaluate(`(()=>{navigate(${JSON.stringify(route.key)});window.scrollTo(0,0);window.dispatchEvent(new Event('resize'));return true})()`,`density-open:${route.key}`);
  await waitFor(()=>tab.evaluate(
    `(()=>{const main=document.querySelector('#main'),target=main?.querySelector(${JSON.stringify(route.selector)});return Boolean(view===${JSON.stringify(route.key)}&&target&&!main?.querySelector('.ia-state-loading')&&!main?.querySelector('.load-error'))})()`,
    `density-ready:${route.key}`
  ),route.label+' prêt',30000);
  await new Promise(resolve=>setTimeout(resolve,90));
}
async function shot(name){
  const image=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  writeFileSync(resolve(artifacts,name+'.png'),Buffer.from(image.data,'base64'));
}
async function routeMetrics(route){
  return tab.evaluate(`(()=>{
    const main=document.querySelector('#main'),nav=document.querySelector('#socleMobileNav');
    const rect=node=>{if(!node)return null;const r=node.getBoundingClientRect();return{top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    const firstJob=document.querySelector('#main .ia-job-row');
    const firstDay=document.querySelector('#main .ia-b-week-day');
    const hero=document.querySelector('#main .ia-role-head');
    const filters=document.querySelector('#main .toolbar.ia-b-filters,#main .ia-b-filters');
    const planningHead=document.querySelector('#main .ia-b-planning-head');
    const personalHead=document.querySelector('#main .personal-head');
    const personalKpi=document.querySelector('#main .personal-kpis');
    const personalToday=document.querySelector('#main .personal-today');
    return{
      route:${JSON.stringify(route.key)},width:innerWidth,height:innerHeight,
      overflowX:document.documentElement.scrollWidth>innerWidth+1,
      main:rect(main),nav:rect(nav),
      hero:rect(hero),filters:rect(filters),planningHead:rect(planningHead),
      firstJob:rect(firstJob),firstDay:rect(firstDay),
      personalHead:rect(personalHead),personalKpi:rect(personalKpi),personalToday:rect(personalToday)
    };
  })()`,`density-metrics:${route.key}`);
}
function assertRoute(m,v){
  assert.equal(m.overflowX,false,m.route+' ne déborde pas horizontalement '+v.name);
  assert.ok(m.main&&m.main.width<=v.width+1,m.route+' reste dans le viewport '+v.name);
  if(m.route==='home')assert.ok(m.hero&&m.hero.height<=Math.max(170,v.height*.27),'Accueil reste compact '+v.name+' (hero='+m.hero?.height+')');
  if(m.route==='jobs'){
    assert.ok(m.filters&&m.filters.height<=v.height*.52,'Filtres Chantiers restent compacts '+v.name+' ('+m.filters?.height+')');
    if(m.firstJob)assert.ok(m.firstJob.height<=245,'Carte chantier reste compacte '+v.name+' ('+m.firstJob.height+')');
  }
  if(m.route==='planning'){
    const controls=(m.planningHead?.height||0)+(m.filters?.height||0);
    assert.ok(controls<=v.height*.55,'Contrôles Planning restent compacts '+v.name+' ('+controls+')');
  }
  if(m.route==='personal'){
    assert.ok(m.personalHead&&m.personalHead.height<=v.height*.34,'Profil Moi reste compact '+v.name+' ('+m.personalHead?.height+')');
    if(m.personalToday)assert.ok(m.personalToday.height<=180,'Bloc Aujourd’hui reste compact '+v.name+' ('+m.personalToday.height+')');
  }
}

try{
  await tab.navigate(base);
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'density-login');
  assert.equal(login,204,'Le contrôle mobile utilise la session OWNER locale.');
  await tab.reload();
  await waitForApp(tab,'local-owner');

  const results=[];
  for(const v of viewports){
    await viewport(v);
    for(const route of routes){
      await openRoute(route);
      const metrics=await routeMetrics(route);
      assertRoute(metrics,v);
      await shot(route.key+'-'+v.name);
      results.push(metrics);
    }

    await openRoute(routes[0]);
    const opened=await tab.evaluate(`(()=>{const toggle=document.querySelector('#socleMobileNav [data-mobile-menu-toggle]');toggle?.click();return Boolean(toggle)})()`,'density-rubriques-open');
    assert.equal(opened,true,'Le bouton Rubriques existe '+v.name);
    await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#socleMobileMoreDialog')?.open)",'density-rubriques-ready'),'Rubriques ouvert '+v.name,10000);
    await new Promise(resolve=>setTimeout(resolve,80));
    const rubriques=await tab.evaluate(`(()=>{
      const sheet=document.querySelector('.socle-mobile-sheet[open],#socleMobileMoreDialog[open] .socle-mobile-sheet'),dialog=document.querySelector('#socleMobileMoreDialog'),title=dialog?.querySelector('h2'),close=dialog?.querySelector('.socle-mobile-sheet-close'),groups=dialog?.querySelector('.socle-mobile-menu-groups');
      const r=sheet?.getBoundingClientRect(),c=close?.getBoundingClientRect(),style=sheet?getComputedStyle(sheet):null,titleStyle=title?getComputedStyle(title):null;
      return{width:innerWidth,height:innerHeight,open:Boolean(dialog?.open),overflowX:document.documentElement.scrollWidth>innerWidth+1,ratio:r?r.height/innerHeight:0,top:r?.top??999,closeWidth:c?.width||0,closeHeight:c?.height||0,titleColor:titleStyle?.color||'',background:style?.backgroundColor||'',scrollClient:groups?.clientHeight||0,scrollHeight:groups?.scrollHeight||0};
    })()`,'density-rubriques-metrics');
    assert.equal(rubriques.open,true,'Rubriques reste ouvert '+v.name);
    assert.equal(rubriques.overflowX,false,'Rubriques ne déborde pas '+v.name);
    assert.ok(rubriques.ratio>=.89&&rubriques.ratio<=.95,'Rubriques occupe environ 90–95 % (tolérance sous-pixel) '+v.name+' ('+rubriques.ratio+')');
    assert.ok(rubriques.closeWidth>=44&&rubriques.closeHeight>=44,'X Rubriques reste tactile '+v.name);
    assert.ok(rubriques.titleColor&&rubriques.titleColor!==rubriques.background,'Titre Rubriques reste lisible '+v.name);
    if(v.height===667)assert.ok(rubriques.scrollHeight>rubriques.scrollClient,'Rubriques défile sur écran court '+v.name);
    await shot('rubriques-'+v.name);
    await tab.evaluate("document.querySelector('#socleMobileMoreDialog')?.close()", 'density-rubriques-close');
    results.push({route:'rubriques',...rubriques});
  }
  console.log('MOBILE_DENSITY_162=PASS '+JSON.stringify(results));
}finally{
  try{await tab.close()}finally{await browser.close()}
}
