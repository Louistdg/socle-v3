import assert from 'node:assert/strict';
import {connectBrowser,waitForApp} from './helpers/browser-cdp.mjs';
import {contrastRatio,rgbColor} from './helpers/color-contrast.mjs';

if(!process.env.SOCLE_CDP_URL){console.log('browser-v3-theme-visual-01: SKIP hors Browser Gate');process.exit(0)}

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const themes=['atelier','ardoise','terre','nuit','graphite','carmin','contraste','beton','lin','ciel','foret','bordeaux','cuivre'];
const routes=[['home','.ia-role-head'],['planning','.ia-b-week-board'],['accounting','.server-finance']];
const widths=[[1440,1000],[390,844],[375,667]];
const browser=await connectBrowser(base),tab=await browser.createSession(base),results=[];
try{
  await tab.navigate(base);
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'v3-theme-login');
  assert.equal(login,204,'Le parcours de thèmes utilise uniquement la session OWNER locale.');
  await tab.reload();await waitForApp(tab,'local-owner');

  for(const [width,height] of widths){
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<761,screenWidth:width,screenHeight:height});
    if(width<761){
      const menu=await tab.evaluate("(()=>{const button=document.querySelector('.v3-theme-button'),menu=document.querySelector('#v3-theme-menu');if(!button||!menu)throw Error('Sélecteur V3 des thèmes absent.');if(menu.hidden)button.click();menu.scrollTop=menu.scrollHeight;const last=menu.querySelector('[data-theme=contraste]'),box=menu.getBoundingClientRect(),item=last.getBoundingClientRect();return{overflow:getComputedStyle(menu).overflowY,scrollHeight:menu.scrollHeight,clientHeight:menu.clientHeight,lastVisible:item.bottom<=box.bottom+1&&item.top>=box.top-1,expanded:button.getAttribute('aria-expanded')}})()",'v3-theme-mobile-scroll-'+width);
      assert.equal(menu.overflow,'auto','Le menu des thèmes autorise le défilement vertical sur téléphone.');
      assert.equal(menu.lastVisible,true,'Le dernier thème est atteignable dans le menu mobile.');
      assert.equal(menu.expanded,'true','Le sélecteur de thèmes reste ouvert pendant le défilement.');
      await tab.evaluate("document.querySelector('.v3-theme-button').click()",'v3-theme-close-menu-'+width);
    }

    const pageBackgrounds=[];
    for(const theme of themes){
      const chosen=await tab.evaluate("(()=>{const theme="+JSON.stringify(theme)+";const button=document.querySelector('.v3-theme-button'),menu=document.querySelector('#v3-theme-menu');if(!button||!menu)throw Error('Sélecteur V3 des thèmes absent.');if(menu.hidden)button.click();const option=menu.querySelector('[data-theme=\"'+theme+'\"]');if(!option)throw Error('Thème absent: '+theme);option.click();return{theme:document.body.dataset.v3Theme,stored:localStorage.getItem('socle-v3.theme')}})()",'v3-theme-select-'+theme+'-'+width);
      assert.deepEqual(chosen,{theme,stored:theme},'Le sélecteur de thème applique et mémorise '+theme+'.');
      for(const [route,selector] of routes){
        const metrics=await tab.evaluate("(async()=>{const route=__ROUTE__,selector=__SELECTOR__;navigate(route);const deadline=Date.now()+7000;while(Date.now()<deadline&&(view!==route||!document.querySelector('#main '+selector)||(route==='accounting'&&serverFinanceState==='loading')))await new Promise(resolve=>setTimeout(resolve,25));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const main=document.querySelector('#main'),target=main?.querySelector(selector),style=getComputedStyle(document.body),palette=Object.fromEntries(['bg','paper','soft','selected','ink','muted','accent','accent-text'].map(name=>[name,style.getPropertyValue('--v3-'+name).trim()]));return{route,width:innerWidth,theme:document.body.dataset.v3Theme,stored:localStorage.getItem('socle-v3.theme'),heading:main?.querySelector('h1')?.textContent.trim()||'',found:Boolean(target),overflow:document.documentElement.scrollWidth>innerWidth,canvas:style.backgroundColor,palette}})()".replace('__ROUTE__',JSON.stringify(route)).replace('__SELECTOR__',JSON.stringify(selector)),'v3-theme-'+theme+'-'+route+'-'+width);
        assert.equal(metrics.theme,theme,'Le thème actif correspond au choix '+theme+'.');
        assert.equal(metrics.stored,theme,'Le thème est mémorisé après sélection: '+theme+'.');
        assert.equal(metrics.found,true,route+' affiche son contenu à '+width+'px avec '+theme+'.');
        assert.equal(metrics.overflow,false,route+' ne déborde pas à '+width+'px avec '+theme+'.');
        assert.equal(rgbColor(metrics.canvas),rgbColor(metrics.palette.bg),'Le fond de page suit le thème '+theme+'.');
        assert.ok(contrastRatio(metrics.palette.ink,metrics.palette.paper)>=4.5,'Texte principal lisible sur panneau: '+theme+'.');
        assert.ok(contrastRatio(metrics.palette.muted,metrics.palette.paper)>=4.5,'Texte secondaire lisible sur panneau: '+theme+'.');
        assert.ok(contrastRatio(metrics.palette['accent-text'],metrics.palette.accent)>=4.5,'Bouton principal lisible: '+theme+'.');
        results.push(metrics);
        if(route==='home')pageBackgrounds.push(rgbColor(metrics.palette.bg));
      }
    }
    assert.equal(new Set(pageBackgrounds).size,themes.length,'Les sept thèmes visibles ont des fonds distincts à '+width+'px.');
  }
  console.log('BROWSER_V3_THEME_VISUAL_01=PASS '+JSON.stringify({themes,widths:widths.map(([width])=>width),pages:routes.map(([route])=>route),checks:results.length,mobileMenu:'scrollable'}));
}finally{await browser.close()}
