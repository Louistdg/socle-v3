import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const temporary=mkdtempSync(join(tmpdir(),'socle-bl-browser-'));
const name='BL-original-01AB.pdf',file=join(temporary,name),bytes='%PDF-1.4\nBL browser fixture original\n%%EOF';
writeFileSync(file,bytes);
const browser=await connectBrowser(base),tab=await browser.createSession(base);
try{
  await tab.navigate(base);
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'bl-login');
  assert.equal(login,204);await tab.reload();await waitForApp(tab,'local-owner');
  const setup=await tab.evaluate("(async()=>{await loadServerFieldData({renderAfter:false});const o=purchaseOrders.find(o=>!['annulée','cancelled'].includes(o.status));if(!o)throw Error('Commande témoin absente');window.blOrderId=String(o.id);return {id:blOrderId,orders:JSON.stringify(purchaseOrders)}})()",'bl-order-fixture');
  const observations=[];
  for(const width of [1440,375,390,430]){
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await tab.evaluate("iaAShowPurchaseOrder(blOrderId)",'bl-open-'+width);
    await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-delivery-scans] form'))",'bl-ready-'+width),'scan form '+width);
    const document=await tab.call('DOM.getDocument',{});
    const input=await tab.call('DOM.querySelector',{nodeId:document.root.nodeId,selector:'[data-delivery-scans] input[aria-label="Bon de livraison original"]'});
    assert.ok(input.nodeId);
    await tab.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[file]});
    await waitFor(()=>tab.evaluate("!document.querySelector('[data-delivery-scans] [type=submit]').disabled",'bl-file-ready-'+width),'file selected '+width);
    await tab.evaluate("document.querySelector('[data-delivery-scans] form').requestSubmit()",'bl-submit-'+width);
    await waitFor(()=>tab.evaluate("document.querySelector('[data-delivery-scans] [role=status]').textContent.includes('conservé')&&!document.querySelector('[data-delivery-scans] [role=status]').textContent.includes('Enregistrement')",'bl-upload-ready-'+width),'upload '+width);
    const state=await tab.evaluate("(async()=>{const r=await serverJson('/api/purchase-orders/'+encodeURIComponent(blOrderId)+'/delivery-scans');const s=r.scans.find(s=>s.originalName==='BL-original-01AB.pdf');const response=await fetch('/api/purchase-orders/'+encodeURIComponent(blOrderId)+'/delivery-scans/'+s.id+'/original',{headers:{'x-socle-organization-id':activeSocleOrganizationId}});const root=document.querySelector('[data-delivery-scans]');return{id:s.id,count:r.scans.filter(s=>s.originalName==='BL-original-01AB.pdf').length,content:await response.text(),contentType:response.headers.get('content-type'),orders:JSON.stringify(purchaseOrders),formWidth:root.getBoundingClientRect().width,modalWidth:document.querySelector('#modal').getBoundingClientRect().width,hasDownload:root.innerText.includes('Télécharger l’original'),camera:root.querySelector('[capture=environment]')?.accept}})()",'bl-proof-'+width);
    assert.equal(state.count,1,'dedup after UI uploads '+width);assert.equal(state.content,bytes);assert.equal(state.contentType,'application/pdf');assert.equal(state.orders,setup.orders,'order unchanged '+width);assert.ok(state.hasDownload);assert.match(state.camera,/image\/jpeg/);assert.ok(state.modalWidth<=width+1,'modal fits '+width);assert.ok(state.formWidth<=state.modalWidth,'scan panel fits '+width);
    observations.push(state.id);
  }
  assert.equal(new Set(observations).size,1,'all widths return same scan');
  const tenantCleared=await tab.evaluate("(()=>{setActiveSocleOrganizationId('bl-other-tenant');return !document.querySelector('[data-delivery-scans]')})()",'bl-clear-on-tenant-change');
  assert.equal(tenantCleared,true,'no stale tenant document panel');
  console.log('BROWSER_BL_SCAN_01AB=PASS upload/download/dedup/order preserved, 1440/375/390/430, tenant panel cleared.');
}finally{await browser.close();rmSync(temporary,{recursive:true,force:true});}
