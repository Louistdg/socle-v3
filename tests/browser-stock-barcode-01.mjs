import assert from 'node:assert/strict';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){
  console.log('browser-stock-barcode-01: SKIP hors Browser Gate');
  process.exit(0);
}
const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const browser=await connectBrowser(base);
const tab=await browser.createSession(base);
async function viewport(width,height){
  await tab.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600,screenWidth:width,screenHeight:height});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:width<600,maxTouchPoints:width<600?5:1});
}
try{
  await tab.navigate(base);
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'barcode-login');
  assert.equal(login,204);
  await tab.reload();await waitForApp(tab,'local-owner');

  const setup=await tab.evaluate("(async()=>{const locations=await serverJson('/api/stock-locations');let loc=(locations.locations||[]).find(x=>x.name==='Dépôt Barcode QA');if(!loc){const x=await serverJson('/api/stock-locations',{method:'POST',body:JSON.stringify({name:'Dépôt Barcode QA',type:'warehouse'})});loc={id:x.id,name:'Dépôt Barcode QA'}}const field=await serverJson('/api/field-data');let item=(field.stockItems||[]).find(x=>x.name==='Article Barcode QA');if(!item){const x=await serverJson('/api/stock-items',{method:'POST',body:JSON.stringify({reference:'BAR-QA',name:'Article Barcode QA',unit:'pièce',quantity:6,locationId:loc.id,minimum:1,supplier:'QA',supplierReference:'SUP-BAR-QA',barcode:'4006381333931',aliases:['barcode qa'],operationKey:'browser-barcode-create'})});item={id:x.id}}await loadServerFieldData({renderAfter:false});await loadStockCatalog({force:true,renderAfter:false});return{itemId:item.id,locationId:loc.id}})()",'barcode-setup');
  assert.ok(setup.itemId&&setup.locationId);

  const baselineMoves=await tab.evaluate("(async()=>{const r=await serverJson('/api/stock-items/'+encodeURIComponent("+JSON.stringify(setup.itemId)+")+'/movements');return r.movements.length})()",'barcode-moves-before');

  for(const [width,height] of [[1440,1000],[430,844],[390,844],[375,667]]){
    await viewport(width,height);
    await tab.evaluate("(()=>{navigate('stock');window.scrollTo(0,0);window.dispatchEvent(new Event('resize'));return true})()",'barcode-stock-'+width);
    await waitFor(()=>tab.evaluate("Boolean(view==='stock'&&document.querySelector('.stock-catalog-shell')&&stockCatalogState==='ready')",'barcode-ready-'+width),'stock barcode '+width,30000);
    const page=await tab.evaluate("(()=>{const button=[...document.querySelectorAll('.stock-catalog-actions button')].find(x=>x.textContent.trim()==='Scanner');return{scanner:Boolean(button),height:button?.getBoundingClientRect().height||0,overflow:document.documentElement.scrollWidth>innerWidth+1,external:[...document.scripts].map(s=>s.src).filter(src=>/^https?:/.test(src)&&!src.startsWith(location.origin)),fallback:typeof stockBarcodeFallbackDecode==='function'}})()",'barcode-page-'+width);
    assert.equal(page.scanner,true,'bouton scanner '+width);assert.equal(page.overflow,false,'aucun overflow '+width);assert.equal(page.fallback,true,'fallback embarqué présent '+width);assert.deepEqual(page.external,[],'aucun script CDN '+width);if(width<600)assert.ok(page.height>=44,'cible tactile scanner '+width);

    await tab.evaluate("stockBarcodeOpenScanner({skipCamera:true})",'barcode-open-'+width);
    await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-stock-barcode-video]')&&document.querySelector('.stock-barcode-manual'))",'barcode-dialog-'+width),'scanner dialog '+width,10000);
    const metrics=await tab.evaluate("(()=>{const form=document.querySelector('.stock-barcode-manual'),input=form?.querySelector('input'),button=form?.querySelector('button');return{overflow:document.documentElement.scrollWidth>innerWidth+1,inputHeight:input?.getBoundingClientRect().height||0,buttonHeight:button?.getBoundingClientRect().height||0,status:document.querySelector('[data-stock-barcode-status]')?.textContent||''}})()",'barcode-metrics-'+width);
    assert.equal(metrics.overflow,false,'scanner overflow '+width);assert.ok(metrics.inputHeight>=40);assert.ok(metrics.buttonHeight>=44);assert.match(metrics.status,/saisie manuelle/i);

    await tab.evaluate("(()=>{const form=document.querySelector('.stock-barcode-manual'),input=form.querySelector('input');input.value='4006381333931';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()",'barcode-manual-'+width);
    await waitFor(()=>tab.evaluate("document.querySelector('[data-stock-barcode-result]')?.innerText.includes('Article Barcode QA')",'barcode-result-'+width),'barcode result '+width,10000);
    const result=await tab.evaluate("(()=>({text:document.querySelector('[data-stock-barcode-result]')?.innerText||'',overflow:document.documentElement.scrollWidth>innerWidth+1}))()",'barcode-result-metrics-'+width);
    assert.match(result.text,/Article Barcode QA/);assert.match(result.text,/6 pièce/);assert.equal(result.overflow,false);
    await tab.evaluate("closeModal()",'barcode-close-'+width);
  }

  const afterMoves=await tab.evaluate("(async()=>{const r=await serverJson('/api/stock-items/'+encodeURIComponent("+JSON.stringify(setup.itemId)+")+'/movements');return r.movements.length})()",'barcode-moves-after');
  assert.equal(afterMoves,baselineMoves,'lookup scanner ne crée aucun mouvement');

  await viewport(390,844);
  await tab.evaluate("stockBarcodeOpenScanner({skipCamera:true})",'barcode-repeat-open');
  await tab.evaluate("(()=>{const form=document.querySelector('.stock-barcode-manual'),input=form.querySelector('input');input.value='4006381333931';form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return true})()",'barcode-repeat');
  await waitFor(()=>tab.evaluate("document.querySelector('[data-stock-barcode-result]')?.innerText.includes('Article Barcode QA')",'barcode-repeat-result'),'repeat result',10000);
  const repeatMoves=await tab.evaluate("(async()=>{const r=await serverJson('/api/stock-items/'+encodeURIComponent("+JSON.stringify(setup.itemId)+")+'/movements');return r.movements.length})()",'barcode-repeat-moves');
  assert.equal(repeatMoves,baselineMoves,'scan répété ne crée aucun mouvement');
  await tab.evaluate("closeModal()");

  await tab.evaluate("stockBarcodeOpenScanner()",'barcode-camera-unavailable');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-stock-barcode-status]')?.textContent)",'barcode-camera-status'),'camera status',10000);
  const cameraStatus=await tab.evaluate("document.querySelector('[data-stock-barcode-status]')?.textContent||''",'barcode-camera-status-text');
  assert.ok(cameraStatus.length>0,'état caméra explicite en headless');
  await tab.evaluate("closeModal()");

  await tab.evaluate("stockBarcodeManageItem("+JSON.stringify(setup.itemId)+")",'barcode-manage');
  await waitFor(()=>tab.evaluate("document.querySelector('.stock-barcode-manager')?.innerText.includes('4006381333931')",'barcode-manager-ready'),'barcode manager',10000);
  const manager=await tab.evaluate("(()=>({text:document.querySelector('.stock-barcode-manager')?.innerText||'',overflow:document.documentElement.scrollWidth>innerWidth+1}))()",'barcode-manager-metrics');
  assert.match(manager.text,/4006381333931/);assert.match(manager.text,/Principal/);assert.equal(manager.overflow,false);

  console.log('BROWSER_STOCK_BARCODE_01=PASS — 1440/430/390/375, fallback manuel, scan répété et gestion barcode');
}finally{
  try{await tab.close()}finally{await browser.close()}
}
