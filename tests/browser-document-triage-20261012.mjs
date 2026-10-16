import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectBrowser,waitFor,waitForApp} from './helpers/browser-cdp.mjs';

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const invoicePath=fileURLToPath(new URL('./fixtures/document-triage-invoice.png',import.meta.url));
const invoiceBytes=readFileSync(invoicePath),invoiceHash=createHash('sha256').update(invoiceBytes).digest('hex');
const temporary=mkdtempSync(join(tmpdir(),'socle-document-triage-'));
const deliveryPath=join(temporary,'bon-livraison-triage-test.pdf');
const deliveryBytes=Buffer.from('%PDF-1.4\nBon de livraison test SOCLE\n%%EOF\n');
writeFileSync(deliveryPath,deliveryBytes);
const browser=await connectBrowser(base);let tab;

async function triageButton(){await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#main .document-triage-action'))",'triage-button'),'triage action');await tab.evaluate("document.querySelector('#main .document-triage-action').click()",'open-triage');await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#modal')?.open&&document.querySelector('#socleDocumentTriageForm'))",'triage-form-open'),'triage form is open');}
async function chooseFile(path){const document=await tab.call('DOM.getDocument',{}),input=await tab.call('DOM.querySelector',{nodeId:document.root.nodeId,selector:'#socleDocumentTriageForm input[name="file"]'});assert.ok(input.nodeId,'file input is present');await tab.call('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path]});await waitFor(()=>tab.evaluate("Boolean(document.querySelector('#socleTriageRead')&&!document.querySelector('#socleTriageRead').disabled)",'triage-file-selected'),'file selected');}
async function setViewport(width){await tab.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600,screenWidth:width,screenHeight:844});return tab.evaluate(`(()=>{const form=document.querySelector('#socleDocumentTriageForm'),dialog=document.querySelector('#modal');return{viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,formWidth:form?.getBoundingClientRect().width||0,formScroll:form?.scrollWidth||0,dialogWidth:dialog?.getBoundingClientRect().width||0}})()`,'triage-layout-'+width)}

try{
  tab=await browser.createSession(base);await tab.navigate(base);
  assert.equal(await tab.evaluate("fetch('/__local-test/logout',{method:'POST'}).then(response=>response.status)",'logout'),204);
  assert.equal(await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(response=>response.status)",'owner-login'),204);
  await tab.reload();await waitForApp(tab,'local-owner');

  await tab.evaluate("navigate('purchases')",'open-purchases');await triageButton();
  const uniqueBefore=await tab.evaluate("(async()=>{const [expenses,documents]=await Promise.all([serverJson('/api/expenses'),serverJson('/api/documents')]);return{expenses:(expenses.expenses||[]).filter(item=>item.supplier_reference==='AB-2026-45821').length,documents:(documents.documents||[]).filter(item=>item.originalName==='document-triage-invoice.png').length,orders:purchaseOrders.length}})()",'triage-before-read');
  assert.equal(uniqueBefore.expenses,0,'invoice fixture has not been recorded before the test');assert.equal(uniqueBefore.documents,0,'invoice original has not been uploaded before the test');assert.ok(uniqueBefore.orders>0,'purchase orders are available');
  const mobileLayout=await setViewport(390);assert.equal(mobileLayout.overflow,false,'triage dialog does not overflow on mobile');assert.ok(mobileLayout.dialogWidth<=mobileLayout.viewport+1,'triage dialog fits mobile width');
  const desktopLayout=await setViewport(1440);assert.equal(desktopLayout.overflow,false,'triage dialog does not overflow on desktop');
  await setViewport(390);await chooseFile(invoicePath);
  await tab.evaluate("(()=>{window.__triageWrites=[];window.__triageFetch=window.fetch.bind(window);window.fetch=(input,init={})=>{const method=String(init.method||input?.method||'GET').toUpperCase();if(!['GET','HEAD','OPTIONS'].includes(method))window.__triageWrites.push(method+' '+String(input));return window.__triageFetch(input,init)}})()",'track-triage-network');
  await tab.evaluate("document.querySelector('#socleTriageRead').click()",'read-invoice-locally');
  await waitFor(()=>tab.evaluate("document.querySelector('#socleTriageSource')?.textContent.includes('OCR local')&&document.querySelector('#socleTriageSource')?.textContent.includes('Aucun enregistrement n’a encore été effectué.')",'triage-ocr-result'), 'local OCR result',90000);
  const proposal=await tab.evaluate("(()=>{const form=document.querySelector('#socleDocumentTriageForm');return{supplier:form.elements.namedItem('supplierId').value,reference:form.elements.namedItem('supplierReference').value,date:form.elements.namedItem('expenseDate').value,total:form.elements.namedItem('total').value,vat:form.elements.namedItem('vatAmount').value,description:form.elements.namedItem('description').value,writes:window.__triageWrites}})()",'triage-proposal');
  assert.equal(proposal.supplier,'BATXL-SUP-01','OCR recognizes the existing supplier');assert.equal(proposal.reference,'AB-2026-45821','OCR proposes the invoice number');assert.equal(proposal.date,'2026-10-12','OCR date replaces an empty date field');assert.equal(proposal.total,'123.45','OCR recognizes the VAT-inclusive total');assert.equal(proposal.vat,'21.45','OCR recognizes the VAT amount');assert.match(proposal.description,/Marchand Matériaux/);assert.deepEqual(proposal.writes,[],'reading a document causes no write request');
  await tab.evaluate("window.fetch=window.__triageFetch",'restore-fetch');
  const linked=await tab.evaluate("(()=>{const form=document.querySelector('#socleDocumentTriageForm'),order=form.elements.namedItem('purchaseOrderId');order.value='BATXL-PO-001';order.dispatchEvent(new Event('change',{bubbles:true}));return{supplier:form.elements.namedItem('supplierId').value,project:form.elements.namedItem('projectId').value,order:order.value}})()",'link-existing-order');
  assert.deepEqual(linked,{supplier:'BATXL-SUP-01',project:'BATXL-PRJ-02000',order:'BATXL-PO-001'},'selecting a purchase order reuses its supplier and project');
  await tab.evaluate("document.querySelector('#socleTriageSave').click()",'save-triaged-invoice');
  await waitFor(()=>tab.evaluate("!document.querySelector('#modal')?.open",'triage-saved'),'expense and original saved');
  const saved=await tab.evaluate(`(async()=>{const [expenses,documents]=await Promise.all([serverJson('/api/expenses'),serverJson('/api/documents')]),matches=(expenses.expenses||[]).filter(item=>item.supplier_reference==='AB-2026-45821'),expense=matches[0],docs=(documents.documents||[]).filter(item=>item.originalName==='document-triage-invoice.png'),doc=docs[0];if(!expense||!doc)return{expenseCount:matches.length,documentCount:docs.length};const response=await fetch('/api/documents/'+encodeURIComponent(doc.id)+'/download',{headers:{'x-socle-organization-id':activeSocleOrganizationId}}),bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');return{expenseCount:matches.length,documentCount:docs.length,expenseId:expense.id,supplierId:expense.supplier_id,projectId:expense.project_id,purchaseOrderId:expense.purchase_order_id,documentType:doc.documentType,relation:doc.relations?.some(item=>item.type==='expense'&&String(item.targetId)===String(expense.id)),originalStatus:response.status,originalHash:digest}})()`, 'triage-saved-records');
  assert.equal(saved.expenseCount,1,'one expense was created');assert.equal(saved.documentCount,1,'one secure original was stored');assert.equal(saved.supplierId,'BATXL-SUP-01');assert.equal(saved.projectId,'BATXL-PRJ-02000');assert.equal(saved.purchaseOrderId,'BATXL-PO-001');assert.equal(saved.documentType,'supplier_invoice');assert.equal(saved.relation,true,'the secure original is linked to its expense');assert.equal(saved.originalStatus,200,'the original can be reopened');assert.equal(saved.originalHash,invoiceHash,'the original bytes are unchanged');

  await tab.evaluate("navigate('purchases')",'open-purchases-for-delivery');await triageButton();
  const deliveryChoice=await tab.evaluate("(()=>{const form=document.querySelector('#socleDocumentTriageForm'),type=form.elements.namedItem('documentType');type.value='delivery_note';type.dispatchEvent(new Event('change',{bubbles:true}));return{type:type.value,button:document.querySelector('#socleTriageSave').textContent,expenseInputsDisabled:[...document.querySelector('#socleTriageExpenseFields').querySelectorAll('input,select')].every(input=>input.disabled),orderExists:[...form.elements.namedItem('deliveryOrderId').options].some(option=>option.value==='BATXL-PO-001'),notice:document.querySelector('#socleTriageDeliveryFields').innerText}})()",'delivery-mode');
  assert.equal(deliveryChoice.type,'delivery_note');
  assert.equal(deliveryChoice.button,'Conserver le bon de livraison');assert.equal(deliveryChoice.expenseInputsDisabled,true,'hidden invoice fields do not block the delivery flow');assert.equal(deliveryChoice.orderExists,true);assert.match(deliveryChoice.notice,/ni mouvement de stock/i);
  const orderBefore=await tab.evaluate("JSON.stringify(purchaseOrders.find(order=>String(order.id)==='BATXL-PO-001'))",'delivery-order-before');
  const selectedDeliveryOrder=await tab.evaluate("(()=>{const form=document.querySelector('#socleDocumentTriageForm');form.elements.namedItem('deliveryOrderId').value='BATXL-PO-001';return{type:form.elements.namedItem('documentType').value,order:form.elements.namedItem('deliveryOrderId').value}})()",'select-delivery-order');assert.equal(selectedDeliveryOrder.type,'delivery_note');assert.equal(selectedDeliveryOrder.order,'BATXL-PO-001');await chooseFile(deliveryPath);
  const deliveryModeAfterFile=await tab.evaluate("(()=>({type:document.querySelector('#socleDocumentTriageForm').elements.namedItem('documentType').value,button:document.querySelector('#socleTriageSave').textContent}))()",'delivery-mode-after-file');assert.equal(deliveryModeAfterFile.type,'delivery_note',JSON.stringify(deliveryModeAfterFile));assert.equal(deliveryModeAfterFile.button,'Conserver le bon de livraison');
  const mobileDelivery=await setViewport(390);assert.equal(mobileDelivery.overflow,false,'delivery scan dialog fits mobile');
  await tab.evaluate("document.querySelector('#socleTriageSave').click()",'save-delivery-note-original');
  const deliverySaveState=await waitFor(()=>tab.evaluate("(()=>{const text=document.querySelector('#modalbody')?.innerText||'',error=document.querySelector('#socleTriageError')?.textContent.trim();return text.includes('aucun mouvement de stock n’a été créé')?'success':error?'error: '+error:''})()",'delivery-save-result'),'delivery upload result');
  assert.equal(deliverySaveState,'success',deliverySaveState);
  const scan=await tab.evaluate(`(async()=>{const result=await serverJson('/api/purchase-orders/BATXL-PO-001/delivery-scans'),matches=(result.scans||[]).filter(item=>item.originalName==='bon-livraison-triage-test.pdf'),item=matches[0],order=JSON.stringify(purchaseOrders.find(value=>String(value.id)==='BATXL-PO-001'));if(!item)return{count:matches.length,order};const response=await fetch('/api/purchase-orders/BATXL-PO-001/delivery-scans/'+encodeURIComponent(item.id)+'/original',{headers:{'x-socle-organization-id':activeSocleOrganizationId}}),bytes=await response.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');return{count:matches.length,order,status:response.status,hash:digest}})()`, 'delivery-scan-proof');
  assert.equal(scan.count,1,'delivery note is linked to the purchase order once');assert.equal(scan.order,orderBefore,'saving the original leaves the purchase order unchanged');assert.equal(scan.status,200,'delivery original is accessible from the order');assert.equal(scan.hash,createHash('sha256').update(deliveryBytes).digest('hex'),'delivery original is stored unchanged');
  await tab.evaluate("document.querySelector('#socleTriageOpenOrder').click()",'open-order-from-delivery-result');await waitFor(()=>tab.evaluate("Boolean(document.querySelector('[data-delivery-scans]'))",'delivery-order-open'),'delivery result opens its order');

  console.log('BROWSER_DOCUMENT_TRIAGE_20261012=PASS OCR local, facture→dépense→original, commande reutilisee, livraison sans reception, mobile 390px.');
}finally{
  try{await browser.close()}finally{rmSync(temporary,{recursive:true,force:true})}
}
