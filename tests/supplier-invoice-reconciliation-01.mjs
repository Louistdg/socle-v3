import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/supplier-invoice-reconciliation.js',import.meta.url),'utf8');
const ui=readFileSync(new URL('../web/supplier-allocations.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
const context=vm.createContext({});
vm.runInContext(source,context,{filename:'supplier-invoice-reconciliation.js'});
const api=context.supplierInvoiceReconciliation;
const analyze=(...args)=>JSON.parse(JSON.stringify(api.analyze(...args)));

const expense={id:'expense-1',supplier_id:'supplier-1',supplier_name:'A&B <Matériaux>',supplier_reference:'FF-2026-01',expense_date:'2026-10-17',subtotal_cents:125000,purchase_order_id:'order-1',delivery_note_id:'delivery-1'};
const orders=[
 {id:'order-1',number:'BC-001',supplierId:'supplier-1',expectedDate:'2026-10-05',job:'project-1',lines:[
  {id:'line-1',reference:'MAT-1',label:'Tôle zinc',quantity:10,unit:'kg',unitPrice:12.5},
  {id:'line-2',reference:'MAT-2',label:'Fixations',quantity:2,unit:'boîte',unitPrice:4}
 ]},
 {id:'order-2',number:'BC-002',supplierId:'supplier-1',expectedDate:'2026-09-22',job:'project-2',lines:[{id:'line-3',reference:'MAT-3',label:'Gouttière',quantity:5,unit:'m',unitPrice:8}]},
 {id:'order-3',number:'BC-003',supplierId:'supplier-2',expectedDate:'2026-10-05',lines:[]}
];
const deliveries=[
 {id:'delivery-1',number:'BL-001',orderId:'order-1',date:'2026-10-08',status:'Reçue',lines:[
  {orderLineId:'line-1',received:6,condition:'Conforme'},
  {orderLineId:'line-2',received:2,condition:'Refusé'}
 ]},
 {id:'delivery-draft',number:'BL-DRAFT',orderId:'order-1',status:'Brouillon',lines:[{orderLineId:'line-1',received:3,condition:'Conforme'}]}
];

const linked=analyze(expense,orders,deliveries);
assert.equal(linked.status,'candidate');
assert.equal(linked.candidates[0].orderNumber,'BC-001');
assert.ok(linked.candidates[0].reasons.some(reason=>reason.includes('fournisseur identique')));
assert.ok(linked.candidates[0].reasons.some(reason=>reason.includes('même mois')));
assert.deepEqual(linked.candidates[0].lines.map(line=>[line.orderedMilli,line.acceptedMilli,line.refusedMilli,line.missingMilli]),[[10000,6000,0,4000],[2000,0,2000,2000]]);
assert.equal(linked.candidates[0].lines[0].invoicedMilli,null);
assert.equal(linked.candidates[0].lines[0].invoicedUnitPriceCents,null);
console.log('MATCHING_LINKED_CANDIDATE=BC-001 reasons=supplier,linked-order,period');
console.log('MATCHING_LINE=ordered 10kg; accepted 6kg; refused 0kg; missing 4kg; invoiced=unknown');
console.log('MATCHING_REFUSED_LINE=ordered 2 boxes; accepted 0; refused 2; invoiced=unknown');

const unlinked=analyze({...expense,purchase_order_id:null,delivery_note_id:null},orders,deliveries);
assert.equal(unlinked.status,'ambiguous');
assert.deepEqual(unlinked.candidates.map(candidate=>candidate.orderNumber),['BC-001','BC-002']);
assert.equal(unlinked.candidates[0].lines[0].acceptedMilli,6000,'draft delivery quantity is not treated as received');
console.log('MATCHING_AMBIGUOUS=2 same-supplier orders; no automatic selection');

const noSupplier=analyze({...expense,supplier_id:null,purchase_order_id:null,delivery_note_id:null},orders,deliveries);
assert.equal(noSupplier.status,'unmatched');
assert.match(noSupplier.reason,/JE NE SAIS PAS|fournisseur n’est pas renseigné/);
console.log(`MATCHING_NO_CANDIDATE=JE NE SAIS PAS — ${noSupplier.reason}`);

const otherSupplier=analyze({...expense,supplier_id:'supplier-unknown',purchase_order_id:null,delivery_note_id:null},orders,deliveries);
assert.equal(otherSupplier.status,'unmatched');
assert.equal(otherSupplier.candidates.length,0);
console.log('MATCHING_NO_ORDER=unmatched; no supplier order candidate');

const mismatch=analyze({...expense,purchase_order_id:'order-1',delivery_note_id:'delivery-foreign'},orders,[{...deliveries[0],id:'delivery-foreign',orderId:'order-2'}]);
assert.equal(mismatch.status,'unmatched');
assert.match(mismatch.reason,/se contredisent/);
console.log('MATCHING_CONTRADICTORY_LINKS=unmatched; no forced association');

const rendered=api.render(expense,linked);
assert.match(rendered,/JE NE SAIS PAS|Proposition à vérifier/);
assert.match(rendered,/Quantité facturée/);
assert.match(rendered,/Prix facturé/);
assert.match(rendered,/ne crée aucun rapprochement/);
assert.match(rendered,/A&amp;B &lt;Matériaux&gt;/);
assert.ok(!rendered.includes('A&B <Matériaux>'),'dynamic text is HTML-escaped');
console.log('MATCHING_RENDER=invoice lines, review warning, non-persistence and escaped text');

const quantity={value:'8',trim(){return this.value}};
const price={value:'14',trim(){return this.value}};
const quantityResult={textContent:''};
const priceResult={textContent:''};
const row={dataset:{acceptedMilli:'6000',orderedUnitPriceCents:'1250',unit:'kg'},querySelector(selector){return ({'[name="invoicedQuantity"]':quantity,'[name="invoicedUnitPrice"]':price,'[data-quantity-variance]':quantityResult,'[data-price-variance]':priceResult})[selector]}};
context.updateSupplierInvoiceReconciliation({querySelectorAll:()=>[row]});
assert.match(quantityResult.textContent,/Facturé au-delà du reçu/);
assert.match(priceResult.textContent,/Facturé/);
assert.match(priceResult.textContent,/de plus/);
console.log(`MATCHING_MANUAL_VALUES=${quantityResult.textContent}; ${priceResult.textContent}`);

assert.ok(ui.includes('openSupplierInvoiceReconciliation'),'server invoice list opens the reconciliation review');
assert.ok(html.includes('supplier-invoice-reconciliation.js'),'reconciliation script is loaded');
assert.ok(build.includes('supplier-invoice-reconciliation.js'),'build ships the reconciliation script');
assert.ok(source.includes('Mode revue : cet écran ne crée aucun rapprochement'),'review does not persist without match read API');
console.log('supplier-invoice-reconciliation-01: PASS');
