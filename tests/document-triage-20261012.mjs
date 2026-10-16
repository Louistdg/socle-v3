import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const parserSource=await readFile(new URL('../web/supplier-invoice-pdf.js',import.meta.url),'utf8');
const triageSource=await readFile(new URL('../web/document-triage.js',import.meta.url),'utf8');
const parserContext={};
vm.runInNewContext(parserSource,parserContext,{filename:'supplier-invoice-pdf.js'});
assert.equal(parserContext.parseSupplierPdfAmount('1.234,56 €'),1234.56,'Belgian thousands and decimal separators parse as cents-scale euro amount');
assert.equal(parserContext.parseSupplierPdfDate('12/10/2026'),'2026-10-12','Belgian date parses without changing day and month');
const proposal=parserContext.parseSupplierInvoicePdfText('Bati Matériaux\nFacture n° AB-2026-45821\nDate facture : 12/10/2026\nTotal TVAC : 1.234,56 EUR\nMontant TVA : 214,56 EUR',[{id:'supplier-1',name:'Bati Matériaux'}]);
assert.equal(proposal.supplierId,'supplier-1');
assert.equal(proposal.reference,'AB-2026-45821');
assert.equal(proposal.date,'2026-10-12');
assert.equal(proposal.total,1234.56);
assert.equal(proposal.vat,214.56);
assert.deepEqual(JSON.parse(JSON.stringify(proposal.found)),{supplier:true,reference:true,date:true,total:true,vat:true});
assert.match(triageSource,/name="expenseDate" type="date" required><\/label>/,'la date du document ne doit pas être préremplie à aujourd’hui avant la lecture OCR');
assert.doesNotMatch(triageSource,/name="expenseDate" type="date" required value=/,'une date par défaut ne doit pas masquer celle de la facture');
const orderLinkFunction=triageSource.match(/function socleTriageApplyOrderLinks\([\s\S]*?(?=\nasync function openSocleDocumentTriage)/)?.[0];
assert.ok(orderLinkFunction,'commande → fournisseur/chantier helper exists');
const orderContext={};vm.runInNewContext(orderLinkFunction+';globalThis.apply=socleTriageApplyOrderLinks',orderContext);
const supplierField={value:''},projectField={value:''},orderForm={elements:{namedItem:name=>({supplierId:supplierField,projectId:projectField}[name])}};
assert.equal(orderContext.apply({supplierId:'supplier-7',job:'project-9'},orderForm).supplierChanged,true);
assert.equal(supplierField.value,'supplier-7','fournisseur repris de la commande');
assert.equal(projectField.value,'project-9','chantier repris de la commande');
assert.equal(orderContext.apply({job:'0'},orderForm).supplierChanged,false,'commande dépôt ne vide pas un fournisseur déjà choisi');
assert.match(triageSource,/expenses\.create/,'triage entry is gated by accounting permission');
assert.match(triageSource,/field\.disabled=delivery/,'inactive required fields cannot block bon de livraison flow');
const localRead=triageSource.slice(triageSource.indexOf('async function readSocleTriagedDocument'),triageSource.indexOf('function socleTriageShowDuplicateHint'));
assert.doesNotMatch(localRead,/serverJson\(/,'reading/OCR a document does not submit it to SOCLE');
assert.match(triageSource,/Aucune quantité n’a été réceptionnée et aucun mouvement de stock n’a été créé/,'delivery scan explicitly preserves manual stock confirmation');

const {default:worker}=await import('../dist/server/index.js');
for(const path of ['/document-triage.js','/document-triage.css','/tesseract.js','/tesseract-worker.js','/tesseract-core-lstm.wasm.js']){
  const response=await worker.fetch(new Request(`https://socle.test${path}`),{});
  assert.equal(response.status,200,`${path} is served by the production asset router`);
  assert.ok((await response.text()).length>100,`${path} is not empty`);
}
const model=await worker.fetch(new Request('https://socle.test/tessdata/fra.traineddata.gz'),{});
assert.equal(model.status,200);
assert.equal(model.headers.get('content-type'),'application/gzip');
const bytes=new Uint8Array(await model.arrayBuffer());
assert.deepEqual([...bytes.slice(0,2)],[0x1f,0x8b],'French OCR model is served as the original gzip binary');
assert.ok(bytes.length>600_000,'French model is present in the deployed asset map');
const page=await worker.fetch(new Request('https://socle.test/'),{});
const html=await page.text();
assert.match(html,/document-triage\.js/);
assert.match(html,/socle\.css/);
assert.match(page.headers.get('content-security-policy')||'',/wasm-unsafe-eval/);
assert.match(page.headers.get('content-security-policy')||'',/worker-src 'self' blob:/);

console.log('Document triage: parser, local OCR assets and CSP passed.');
