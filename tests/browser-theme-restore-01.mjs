import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {connectBrowser,waitForApp} from './helpers/browser-cdp.mjs';
if(!process.env.SOCLE_CDP_URL)process.exit(0);
const base=process.env.SOCLE_TEST_URL,browser=await connectBrowser(base),tab=await browser.createSession(base);
try{
 await tab.navigate(base);
 await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})})",'login');
 await tab.evaluate("localStorage.removeItem('socle-v3.theme-choice');localStorage.setItem('socle-v3.theme','atelier')",'old-automatic-preference');
 await tab.reload();await waitForApp(tab);
 assert.equal(await tab.evaluate("document.body.dataset.v3Theme",'default'),'petrole-signature');
 for(const width of [1440,390]){
  await tab.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<500});
  const ids=await tab.evaluate("(()=>{const m=document.querySelector('#v3-theme-menu');if(m.hidden)document.querySelector('.v3-theme-button').click();return [...m.querySelectorAll('.v3-theme-choice')].map(b=>({id:b.dataset.theme,collapsed:!!b.closest('details:not([open])')}))})()",'themes-'+width);
  assert.equal(ids.length,19);assert.ok(ids.every(x=>!x.collapsed));assert.equal(ids[0].id,'petrole-signature');assert.equal(ids[1].id,'charbon-ivoire');
  for(const {id} of ids){assert.equal(await tab.evaluate(`(()=>{const m=document.querySelector('#v3-theme-menu');if(m.hidden)document.querySelector('.v3-theme-button').click();const b=m.querySelector('[data-theme="${id}"]');b.scrollIntoView({block:'center'});b.click();return document.body.dataset.v3Theme})()`,'choose-'+id+'-'+width),id)}
  await tab.evaluate("document.querySelector('.v3-theme-button').click();document.querySelector('[data-theme=petrole-signature]').click();document.querySelector('.v3-theme-button').click();document.querySelector('#v3-theme-menu').scrollTop=0",'restore-default');
  if(process.env.SOCLE_THEME_CAPTURE_DIR){const shot=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(process.env.SOCLE_THEME_CAPTURE_DIR+'/SOCLE-THEMES-'+width+'.png',Buffer.from(shot.data,'base64'))}
  if(process.env.SOCLE_THEME_CAPTURE_DIR){await tab.evaluate("document.querySelector('[data-theme=charbon-ivoire]').click()",'second-theme');const shot=await tab.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(process.env.SOCLE_THEME_CAPTURE_DIR+'/SOCLE-CHARBON-'+width+'.png',Buffer.from(shot.data,'base64'))}
 }
 await tab.evaluate("document.querySelector('[data-theme=lin]').click()",'choose-non-default');
 await tab.reload();await waitForApp(tab);assert.equal(await tab.evaluate("document.body.dataset.v3Theme",'persist-non-default'),'lin');
 await tab.evaluate("document.querySelector('[data-theme=petrole-signature]').click()",'restore-petrole-signature');
 await tab.reload();await waitForApp(tab);assert.equal(await tab.evaluate("document.body.dataset.v3Theme",'persist'),'petrole-signature');
 assert.equal(await tab.evaluate("Boolean(document.querySelector('.header-right .avatar .socle-avatar-monogram text'))",'professional-avatar'),true);
 console.log('PASS: 19 thèmes accessibles et sélectionnables sur PC et mobile; Pétrole signature par défaut; choix mémorisé; avatar professionnel.');
}finally{await tab.close();await browser.close()}
