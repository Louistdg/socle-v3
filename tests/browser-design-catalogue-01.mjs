import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connectBrowser} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){console.log('browser-design-catalogue-01: SKIP hors Browser Gate');process.exit(0)}

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const themes=[['atelier','Ciment'],['nuit','Bitume'],['graphite','Graphite']];
const viewports=[[1440,1000,false],[390,844,true]];
const artifacts=resolve('tests','artifacts','design-catalogue-01');
mkdirSync(artifacts,{recursive:true});
const browser=await connectBrowser(base),tab=await browser.createSession(base),results=[];
try{
  const response=await fetch(base+'/catalogue');
  assert.equal(response.status,200,'/catalogue répond sans authentification');
  assert.ok((response.headers.get('content-type')||'').includes('text/html'),'la route sert une page HTML');
  await tab.navigate(base+'/catalogue');
  for(const [theme,label] of themes){
    await tab.evaluate(`(()=>{const select=document.querySelector('#palette');select.value=${JSON.stringify(theme)};select.dispatchEvent(new Event('change',{bubbles:true}));return document.body.dataset.v3Theme})()`,'catalogue-theme-'+theme);
    for(const [width,height,mobile] of viewports){
      await tab.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:height});
      const metrics=await tab.evaluate(`(()=>{
        const required=['.button-primary','.button:not(.button-primary)','.button-danger','.field[type=number]','.field[type=date]','.field[type=search]','.field[aria-invalid=true]','.field:disabled','table thead','tbody tr[aria-selected=true]','.primitive-menu','.primitive-dialog','.notice','.tooltip-demo','.resource-card .card-head','.resource-card .card-meta','.resource-card .card-state','.resource-card .card-foot','.status-ok','.status-warn','.status-danger','.state-block','.spinner','.state-error'];
        const missing=required.filter(selector=>!document.querySelector(selector));
        const control=document.querySelector('.field:not([disabled])'),card=document.querySelector('.resource-card'),primary=document.querySelector('.button-primary');
        control.focus();const fieldStyle=getComputedStyle(control),cardStyle=getComputedStyle(card),root=getComputedStyle(document.body),accent=root.getPropertyValue('--sx-accent').trim(),hex=/^#([a-f0-9]{6})$/i.exec(accent),accentRGB=hex?'rgb('+[0,2,4].map(i=>parseInt(hex[1].slice(i,i+2),16)).join(', ')+')':'';
        return{theme:document.body.dataset.v3Theme,viewport:innerWidth,missing,controlHeight:Math.round(control.getBoundingClientRect().height),controlMin:fieldStyle.minHeight,focusVisible:control.matches(':focus-visible'),focusRing:fieldStyle.boxShadow,accentRGB,buttonHeight:Math.round(primary.getBoundingClientRect().height),cardShadow:cardStyle.boxShadow,background:root.backgroundColor,accent,label:${JSON.stringify(label)}};
      })()`,'catalogue-metrics-'+theme+'-'+width);
      assert.deepEqual(metrics.missing,[],'Toutes les primitives sont visibles dans '+label+' à '+width+' px.');
      assert.equal(metrics.theme,theme,'la palette choisie est réellement appliquée');
      assert.equal(metrics.controlHeight,mobile?48:32,'hauteur du champ adaptée au tactile à '+width+' px');
      assert.equal(metrics.buttonHeight,mobile?48:44,'cible primaire tactile à '+width+' px');
      assert.equal(metrics.focusVisible,true,'le champ focalisé expose :focus-visible');
      assert.notEqual(metrics.focusRing,'none','le champ focalisé dessine son anneau visible');
      assert.ok(metrics.focusRing.includes(metrics.accentRGB),'l’anneau de focus suit la palette courante');
      assert.equal(metrics.cardShadow,'none','la carte centrale reste sans ombre');
      const screenshot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});
      writeFileSync(resolve(artifacts,`${theme}-${width}.png`),Buffer.from(screenshot.data,'base64'));
      results.push(metrics);
    }
  }
  console.log('DESIGN_CATALOGUE_01='+JSON.stringify(results));
}finally{await browser.close()}
