import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connectBrowser,waitForApp} from './helpers/browser-cdp.mjs';
import {rgbColor,luminance,contrastRatio} from './helpers/color-contrast.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const themes=['olive','forest','slate','night','graphite','earth','moss','aubergine','high-contrast','chalk'];
// Factures is part of the existing accounting view.
const routes=[['home','.ia-role-head'],['jobs','.ia-jobs-list'],['planning','.ia-b-week-day'],['quotes','.quote-list'],['purchases','.panel'],['people','.people-toolbar'],['stock','.finance-grid>.finance-box'],['documents','.document-secure-list'],['accounting','.compact-finance-table'],['actions','.task-batch-list'],['personal','.personal-head']];
const artifacts=resolve('tests','artifacts','theme-surfaces-01');
mkdirSync(artifacts,{recursive:true});
const surfaceTargetSelectors={home:['.ia-role-head','.ia-owner-panel'],jobs:['.ia-jobs-list','.ia-job-row'],planning:['.ia-b-week-board','.ia-b-week-day'],quotes:['.quote-list','.quote-list-row'],purchases:['.panel','.ia-compact-table'],people:['.people-toolbar','.people-table'],stock:['.finance-box','.data-table'],documents:['.document-secure-list','.document-file-list'],accounting:['.compact-finance-table','.compact-finance-table th'],actions:['.task-batch-list','.task'],personal:['.personal-head','.personal-today']};

// This function runs inside Chromium; no application state or data is changed.
async function inspect({theme,route,selector,mode,surfaceTargetSelectors={}}){
  iaAApplyTheme(theme,true);
  navigate(route);
  const deadline=Date.now()+6000;
  while(Date.now()<deadline&&(view!==route||!document.querySelector('#main '+selector)||(route==='accounting'&&serverFinanceState==='loading')||(route==='planning'&&iaBPlanningState.loading)))await new Promise(r=>setTimeout(r,30));
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  if(mode==='menu')document.querySelector('[data-mobile-menu-toggle]').click();
  if(mode==='form')addAction();
  const root=getComputedStyle(document.body),main=document.querySelector('#main');
  const palette=Object.fromEntries(['bg','surface','surface-soft','surface-raised','text','muted','line','control-line','accent-strong','button-text','shell','shell-text','shell-muted','focus'].map(k=>[k,root.getPropertyValue('--ia-'+k).trim()]));
  function background(node){
    for(let current=node;current;current=current.parentElement){const color=getComputedStyle(current).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent')return color;}
    return root.backgroundColor;
  }
  function sample(node,pseudo){
    const style=getComputedStyle(node,pseudo);
    return{node:node.className||node.tagName,color:style.color,background:background(node),fill:style.backgroundColor,border:style.borderTopColor,text:node.textContent.trim().slice(0,60)};
  }
  const scope=mode==='menu'?document.querySelector('#socleMobileMoreDialog'):mode==='form'?document.querySelector('#modal'):main;
  const texts=[...scope.querySelectorAll('h1,h2,.heading p,.simple-head p,.panel small,.notice,.badge,.socle-mobile-sheet-head span,.socle-mobile-menu-group h3,.socle-mobile-menu-foot,.socle-mobile-menu-group button,.modal-inner label,.modal-inner .btn')].filter(n=>n.getBoundingClientRect().height&&getComputedStyle(n).opacity!=='0').map(n=>sample(n));
  const fields=[...scope.querySelectorAll('input:not([type=checkbox]):not([type=hidden]),select,textarea')].filter(n=>n.getBoundingClientRect().height).map(n=>sample(n));
  const placeholders=[...scope.querySelectorAll('input[placeholder],textarea[placeholder]')].filter(n=>n.getBoundingClientRect().height).map(n=>sample(n,'::placeholder'));
  const surfaces=[...scope.querySelectorAll('.panel,.filter-pills,.module-switch,.tabs,.notice,.ia-job-row,.data-table th,.people-table th')].filter(n=>n.getBoundingClientRect().height).map(n=>sample(n));
  const targetSurfaces=(surfaceTargetSelectors[route]||[]).map(selector=>{const node=main.querySelector(selector);return node&&node.getBoundingClientRect().height?sample(node):null}).filter(Boolean);
  const chrome=['header','.topbar','#nav','.socle-mobile-nav'].map(selector=>{const node=document.querySelector(selector);return node?sample(node):null}).filter(Boolean);
  const nav=innerWidth<761?[...document.querySelectorAll('.socle-mobile-nav button')].map(n=>({...sample(n),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})):[];
  const menuTargets=mode==='menu'?[...scope.querySelectorAll('button,a,[role="button"]')].map(n=>({name:n.textContent.trim().slice(0,45),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})):[];
  return{theme,route,mode,width:innerWidth,found:Boolean(main.querySelector(selector)),palette,body:root.backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,texts,fields,placeholders,surfaces,targetSurfaces,chrome,nav,menuTargets,open:mode?Boolean(scope.open):false};
}

function check(result){
  const label=`${result.theme}/${result.route}/${result.mode||'page'}/${result.width}`,p=result.palette;
  assert.ok(result.found,'Page rendue: '+label);
  assert.equal(result.overflow,false,'Aucun débordement: '+label);
  assert.equal(result.body,rgbColor(p.bg),'Le canevas suit le thème: '+label);
  if(['olive','slate','night','graphite','moss','aubergine'].includes(result.theme))assert.ok(luminance(p.surface)<.1,'Cartes réellement sombres: '+label);
  for(const background of [p.bg,p.surface,p['surface-soft'],p['surface-raised']]){
    assert.ok(contrastRatio(p.text,background)>=4.5,'Texte principal contrasté: '+label);
    assert.ok(contrastRatio(p.muted,background)>=4.5,'Texte secondaire contrasté: '+label);
  }
  assert.ok(contrastRatio(p['shell-text'],p.shell)>=4.5,'Texte du shell contrasté: '+label);
  assert.ok(contrastRatio(p['shell-muted'],p.shell)>=4.5,'Texte secondaire du shell contrasté: '+label);
  assert.ok(contrastRatio(p['control-line'],p.surface)>=3,'Bordure des champs visible: '+label);
  for(const background of [p.bg,p.surface,p['surface-soft'],p['surface-raised']])assert.ok(contrastRatio(p.focus,background)>=3,'Focus visible: '+label);
  for(const item of [...result.texts,...result.fields,...result.placeholders,...result.nav]){
    const ratio=contrastRatio(item.color,item.background);
    assert.ok(ratio>=4.5,`Contraste ${ratio.toFixed(2)} < 4.5: ${label} / ${item.node} / ${item.text} (${item.color} sur ${item.background})`);
  }
  for(const field of result.fields)assert.ok(contrastRatio(field.border,field.background)>=3,`Bordure de champ visible: ${label} / ${field.node} (${field.border} sur ${field.background})`);
  for(const target of result.nav)assert.ok(target.height>=44,`Navigation basse confortable au toucher: ${label} / ${target.height}px`);
  for(const target of result.menuTargets)assert.ok(target.height>=40,`Action tactile du menu visible: ${label} / ${target.name} / ${target.height}px`);
  const neutral=[p.surface,p['surface-soft'],p['surface-raised']].map(rgbColor);
  for(const item of result.surfaces)if(item.fill!=='rgba(0, 0, 0, 0)')assert.ok(neutral.includes(item.fill),`Surface fixe résiduelle: ${label} / ${item.node} / ${item.fill}`);
  const themed=[p.bg,p.shell,p.surface,p['surface-soft'],p['surface-raised']].map(rgbColor);
  for(const item of result.targetSurfaces)if(item.background!=='rgba(0, 0, 0, 0)'&&item.background!=='transparent')assert.ok(themed.includes(item.background),`Grande surface hors tokens du thème: ${label} / ${item.node} / ${item.background}`);
  if(result.mode)assert.equal(result.open,true,'Panneau ouvert: '+label);
}

function distance(a,b){const x=rgbColor(a).match(/\d+/g).map(Number),y=rgbColor(b).match(/\d+/g).map(Number);return x.reduce((sum,c,i)=>sum+Math.abs(c-y[i]),0)}
function compareAllThemes(results){
  for(const width of [1440,390])for(const [route] of routes){
    const rendered=results.filter(r=>r.width===width&&r.route===route&&!r.mode);
    for(let a=0;a<themes.length;a++)for(let b=a+1;b<themes.length;b++){
      const first=rendered.find(r=>r.theme===themes[a]),second=rendered.find(r=>r.theme===themes[b]),label=`${themes[a]}/${themes[b]}/${route}/${width}`;
      assert.ok(first&&second,'Deux rendus présents: '+label);
      assert.ok(distance(first.body,second.body)>=18,'Le fond change entre thèmes: '+label);
      assert.ok(first.targetSurfaces.length&&second.targetSurfaces.length,'Surface principale rendue: '+label);
      assert.ok(first.targetSurfaces.some((surface,index)=>second.targetSurfaces[index]&&surface.background!=='rgba(0, 0, 0, 0)'&&surface.background!=='transparent'&&second.targetSurfaces[index].background!=='rgba(0, 0, 0, 0)'&&second.targetSurfaces[index].background!=='transparent'&&distance(surface.background,second.targetSurfaces[index].background)>=8),'Les grandes surfaces changent entre thèmes: '+label);
      assert.ok(first.chrome.length&&second.chrome.length,'Navigation rendue: '+label);
      assert.ok(distance(first.chrome[0].fill,second.chrome[0].fill)>=8,'Le shell change entre thèmes: '+label);
    }
  }
  for(const width of [1440,390])for(const theme of ['slate','moss']){
    const form=results.find(r=>r.width===width&&r.theme===theme&&r.mode==='form');
    assert.ok(form?.fields.length,'Champs visibles sur le formulaire: '+theme+'/'+width);
    if(width===390){const menu=results.find(r=>r.width===width&&r.theme===theme&&r.mode==='menu');assert.ok(menu?.open&&menu.chrome.some(n=>n.node.includes('socle-mobile-nav')),'Navigation mobile visible: '+theme+'/'+width)}
  }
}

const browser=await connectBrowser(base),tab=await browser.createSession(base),results=[];
async function screenshot(name){const shot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(resolve(artifacts,name+'.png'),Buffer.from(shot.data,'base64'));}
try{
  await tab.navigate(base);
  assert.equal(await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'theme-surfaces-login'),204);
  await tab.reload();await waitForApp(tab,'local-owner');
  for(const width of [1440,375,390,430]){
    const mobile=width<761;
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height:mobile?844:1000,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:mobile?844:1000});
    for(const theme of themes){
      for(const [route,selector] of routes){
        const result=await tab.evaluate(`(${inspect.toString()})(${JSON.stringify({theme,route,selector,surfaceTargetSelectors})})`,`theme-${theme}-${route}-${width}`);
        check(result);results.push(result);
        if((width===1440&&['home','planning','accounting','quotes'].includes(route))||(width===390&&['home','planning','personal'].includes(route)))await screenshot(`${route}-${theme}-${width}`);
      }
      for(const mode of mobile?['menu','form']:['form']){
        const result=await tab.evaluate(`(${inspect.toString()})(${JSON.stringify({theme,route:'home',selector:'.ia-role-head',mode,surfaceTargetSelectors})})`,`theme-${mode}-${theme}-${width}`);
        check(result);results.push(result);
        if(width===390)await screenshot(`${mode}-${theme}-${width}`);
        await tab.evaluate(mode==='menu'?"document.querySelector('#socleMobileMoreDialog .socle-mobile-sheet-close').click()":'closeModal()','close-theme-panel');
      }
    }
    // Exercise the canonical picker, then a real reload and a route transition.
    await tab.evaluate("document.querySelector('#socleThemeButton').click();document.querySelector('#socleThemeMenu [data-theme=chalk]').click()",'choose-persistent-light-theme');
    await tab.reload();await waitForApp(tab,'local-owner');
    const persistedLight=await tab.evaluate("navigate('documents');({id:document.body.dataset.socleTheme,stored:localStorage.getItem('socle.theme')})",'theme-light-persistence');
    assert.deepEqual(persistedLight,{id:'chalk',stored:'chalk'},'Le thème clair Craie est conservé après navigation/rechargement à '+width+'px.');
    await tab.evaluate("document.querySelector('#socleThemeButton').click();document.querySelector('#socleThemeMenu [data-theme=night]').click()",'choose-persistent-dark-theme');
    await tab.reload();await waitForApp(tab,'local-owner');
    const persisted=await tab.evaluate("navigate('documents');({id:document.body.dataset.socleTheme,stored:localStorage.getItem('socle.theme')})",'theme-persistence');
    assert.deepEqual(persisted,{id:'night',stored:'night'},'Thème conservé après navigation/rechargement à '+width+'px.');
  }
  compareAllThemes(results);
  writeFileSync(resolve(artifacts,'results.json'),JSON.stringify(results,null,2));
  console.log('THEME_SURFACES_01=PASS '+JSON.stringify({checks:results.length,themes,widths:[1440,375,390,430],contrast:'4.5:1',persistence:'PASS'}));
}finally{await browser.close()}
