import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const ui=readFileSync(new URL('../web/supplier-allocations.js',import.meta.url),'utf8');
const start=ui.indexOf('function supplierExpenseDuplicate('),end=ui.indexOf('\nserverExpenseForm=',start);
assert.ok(start>=0&&end>start,'Les contrôles de doublon sont présents dans la source.');
const context={serverExpenses:[
  {id:'expense-1',supplier_id:'supplier-a',supplier_reference:' INV-42 ',expense_date:'2026-10-01',total_cents:12100,payment_status:'paid',description:'Tuiles rouges chantier Delcourt'},
  {id:'expense-2',supplier_id:'supplier-b',supplier_reference:'INV-42',expense_date:'2026-10-02',total_cents:5000}
],fullDate:value=>'date '+value,centsMoney:value=>'€'+(value/100).toFixed(2).replace('.',',')};
runInNewContext(ui.slice(start,end)+';globalThis.findDuplicate=supplierExpenseDuplicate;globalThis.checkDuplicate=updateSupplierExpenseDuplicateWarning;',context);
const same=context.findDuplicate('supplier-a','inv-42');
assert.equal(same.id,'expense-1','Même fournisseur et référence insensible à la casse repérés.');
assert.equal(context.findDuplicate('supplier-b','inv-42'),context.serverExpenses[1],'Une référence identique chez un autre fournisseur reste autorisée.');
assert.equal(context.findDuplicate('supplier-a',''),null,'Une référence vide ne déclenche pas d’alerte.');
assert.equal(context.findDuplicate('','INV-42'),null,'Sans fournisseur identifié, pas de détection hasardeuse.');
const warning={hidden:true,textContent:''},button={disabled:false};
const form={elements:{supplierId:{value:'supplier-a'},supplierReference:{value:'inv-42'}},querySelector(selector){return selector==='#supplierExpenseDuplicateWarning'?warning:button}};
assert.equal(context.checkDuplicate(form).id,'expense-1');
assert.equal(warning.hidden,false,'Le formulaire affiche le doublon potentiel.');
assert.match(warning.textContent,/INV-42/,'Le message montre la référence qui a déclenché le contrôle.');
assert.match(warning.textContent,/2026-10-01/,'Le message donne la date de la dépense déjà saisie.');
assert.match(warning.textContent,/€121,00/,'Le message montre le montant TTC déjà enregistré pour comparaison.');
assert.match(warning.textContent,/déjà payée/,'Le message précise si la facture trouvée est déjà payée.');
assert.match(warning.textContent,/Tuiles rouges chantier Delcourt/,'Le message donne le libellé pour vérifier qu’il s’agit de la même facture.');
assert.equal(button.disabled,true,'La saisie est bloquée localement quand la référence existe déjà.');
form.elements.supplierReference.value='INV-43';
assert.equal(context.checkDuplicate(form),null);
assert.equal(warning.hidden,true,'L’avertissement se retire après correction de la référence.');
assert.equal(button.disabled,false,'Le formulaire redevient utilisable après correction.');
assert.match(ui,/aria-live="polite"/,'Le message est annoncé aux lecteurs d’écran.');
assert.match(ui,/oninput="updateSupplierExpenseDuplicateWarning\(this\.form\)"/,'La vérification se met à jour pendant la saisie.');
assert.match(readFileSync(new URL('../worker/index.js',import.meta.url),'utf8'),/Une facture de ce fournisseur porte déjà cette référence\./,'Le refus serveur reste la dernière protection.');
console.log('supplier-duplicate-warning-01: 14 assertions réussies');
