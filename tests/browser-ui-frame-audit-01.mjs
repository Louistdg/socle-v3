import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connectBrowser,waitForApp} from './helpers/browser-cdp.mjs';
import {contrastRatio,rgbColor} from './helpers/color-contrast.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base),tab=await browser.createSession(base),artifacts=resolve('tests','artifacts','ui-frame-audit-01');
mkdirSync(artifacts,{recursive:true});
try{
  await tab.navigate(base);
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'ui-frame-audit-login');
  assert.equal(login,204,'Le contrôle visuel utilise la session OWNER locale de test.');
  await tab.reload();await waitForApp(tab,'local-owner');
  const results=[];
  for(const width of [1440,390]){
    const mobile=width<500;
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height:mobile?844:1000,deviceScaleFactor:1,mobile,screenWidth:width,screenHeight:mobile?844:1000});
    for(const [route,selector] of [['home','.ia-role-head'],['planning','.ia-b-week-day'],['personal','.personal-head'],['people','.people-toolbar'],['jobs','.ia-jobs-list'],['purchases','.panel'],['stock','.finance-grid>.finance-box'],['fleet','.asset-categories'],['accounting','.server-finance-grid'],['actions','.task-batch-list'],['documents','.document-secure-list'],['quotes','.quote-list']]){
      const metrics=await tab.evaluate(`(async()=>{navigate(${JSON.stringify(route)});const deadline=Date.now()+6000;while(Date.now()<deadline&&(!document.querySelector('#main h1')||view!==${JSON.stringify(route)}||!document.querySelector('#main '+${JSON.stringify(selector)})))await new Promise(r=>setTimeout(r,25));await new Promise(r=>setTimeout(r,80));const main=document.querySelector('#main'),target=main?.querySelector(${JSON.stringify(selector)}),style=target?getComputedStyle(target):null,root=getComputedStyle(document.body),rgb=value=>{const h=/^#([a-f0-9]{6})$/i.exec(value.trim());if(h){const x=h[1];return 'rgb('+[0,2,4].map(i=>parseInt(x.slice(i,i+2),16)).join(', ')+')'}const m=value.match(/[\\d.]+/g)||[];return m.length>=3?'rgb('+m.slice(0,3).map(Number).join(', ')+')':value};return{route:${JSON.stringify(route)},heading:main?.querySelector('h1')?.textContent.trim()||'',found:Boolean(target),background:style?.backgroundColor||'',color:style?.color||'',border:style?.borderTopColor||'',borderStyle:style?.borderTopStyle||'',radius:style?.borderRadius||'',overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,surface:rgb(root.getPropertyValue('--ia-surface').trim()),soft:rgb(root.getPropertyValue('--v3-paper').trim()),line:rgb(root.getPropertyValue('--ia-line').trim()),frames:${JSON.stringify(route)}==='stock'?[...main.querySelectorAll('.finance-grid>.finance-box')].map(n=>({background:getComputedStyle(n).backgroundColor,border:getComputedStyle(n).borderTopStyle,radius:getComputedStyle(n).borderRadius})):${JSON.stringify(route)}==='accounting'?[...main.querySelectorAll('.server-finance-grid article')].map(n=>getComputedStyle(n).backgroundColor):[]}})()`,`${route}-${width}`);
      assert.ok(metrics.found,`${route} rend son écran à ${width}px.`);
      assert.equal(metrics.overflow,false,`${route} ne déborde pas à ${width}px.`);
      const shell=await tab.evaluate(`(()=>{const org=document.querySelector('.organization-current'),demo=document.querySelector('.header-right .demo'),footer=document.querySelector('footer'),logout=document.querySelector(".header-right form[action$='/logout']");return{simulationBadge:Boolean(document.querySelector('.simulation-badge')),demoVisible:Boolean(demo&&getComputedStyle(demo).display!=='none'),staleFooter:[...(footer?.children||[])].some(element=>getComputedStyle(element).display!=='none'&&/V2|simulation|recherche/i.test(element.textContent||'')),logoutHidden:!logout||getComputedStyle(logout).display==='none',workspaceWidth:document.querySelector('.workspace')?.getBoundingClientRect().width||0,organizationColor:org?getComputedStyle(org).color:'',organizationVisible:Boolean(org&&getComputedStyle(org).display!=='none'),topbarColor:getComputedStyle(document.querySelector('.topbar')).backgroundColor,tableHint:Boolean(document.querySelector('#main .data-table.v3-has-horizontal-overflow>.v3-table-scroll-hint:not([hidden])')),tabsHint:Boolean(document.querySelector('#main .v3-tabs-scroll-hint:not([hidden])'))}})()`,`${route}-shell-${width}`);
      assert.equal(shell.simulationBadge,false,'Aucun badge de simulation ne reste affiché en V3.');
      assert.equal(shell.demoVisible,false,'Le libellé de démonstration ne reste pas visible dans l’en-tête V3.');
      assert.equal(shell.staleFooter,false,'Le pied de page ne contient plus de libellé de recherche ou de V2.');
      if(mobile){assert.equal(shell.logoutHidden,true,'La déconnexion de l’en-tête est déplacée dans le menu mobile.');const logoutMoved=await tab.evaluate("(()=>{const toggle=document.querySelector('#socleMobileNav [data-mobile-menu-toggle]');if(!toggle)return false;toggle.click();const dialog=document.querySelector('#socleMobileMoreDialog'),form=dialog?.querySelector('.socle-mobile-logout[action$=\"/logout\"]'),visible=Boolean(dialog?.open&&form&&getComputedStyle(form).display!=='none');dialog?.close();return visible})()",'mobile-logout-destination');assert.equal(logoutMoved,true,'La déconnexion reste accessible dans le menu Plus mobile.');assert.ok(shell.workspaceWidth>=115,'Le sélecteur d’entreprise garde une largeur utile sur téléphone.');const brand=await tab.evaluate("(()=>{const node=document.querySelector('.topbar .brand');return{font:getComputedStyle(node).fontSize,width:node.getBoundingClientRect().width}})()",'mobile-brand-layout');assert.equal(brand.font,'0px','Le mot-symbole complet est masqué sur téléphone pour éviter le chevauchement.');assert.ok(brand.width<=40,'Le logo compact conserve une largeur maîtrisée sur téléphone.');}
      if(!mobile&&shell.organizationVisible&&shell.organizationColor)assert.ok(contrastRatio(rgbColor(shell.organizationColor),rgbColor(shell.topbarColor))>=4.5,'Le nom de l’entreprise reste lisible dans l’en-tête PC: '+JSON.stringify(shell));
      if(mobile&&route==='purchases')assert.equal(shell.tableHint,true,'Le tableau Achats indique clairement son défilement horizontal.');
      if(mobile&&route==='accounting')assert.equal(shell.tabsHint,true,'Les onglets Comptabilité indiquent clairement leur défilement horizontal.');
      if(route==='people')assert.equal(metrics.background,metrics.surface,'La barre Personnel utilise la surface commune.');
      if(route==='stock'){
        assert.ok(metrics.frames.length>=3,'Les trois indicateurs Stock sont présents.');
        assert.ok(metrics.frames.every(frame=>frame.background===`rgb(${metrics.surface.match(/\d+/g).join(', ')})`&&frame.border==='solid'&&frame.radius==='12px'),'Les indicateurs Stock ont le même fond, bord et rayon que les panneaux.');
      }
      if(route==='accounting'){
        assert.equal(metrics.frames.length,6,'Les six indicateurs financiers sont rendus.');
        assert.ok(metrics.frames.every(color=>color===`rgb(${metrics.soft.match(/\d+/g).join(', ')})`),'Les indicateurs financiers utilisent la surface secondaire du thème.');
      }
      const shot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:!mobile});
      writeFileSync(resolve(artifacts,`${route}-${width}.png`),Buffer.from(shot.data,'base64'));
      results.push(metrics);
    }
  }
  console.log('UI_FRAME_AUDIT_01='+JSON.stringify(results));
}finally{await browser.close()}
