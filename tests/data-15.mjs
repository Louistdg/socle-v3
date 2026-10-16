import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';

const database=new DatabaseSync(new URL('../data/socle.sqlite',import.meta.url));
const row=database.prepare('SELECT payload,revision FROM organization_workspace_state WHERE organization_id=?').get('org-local-owner')||database.prepare('SELECT payload,revision FROM workspace_state WHERE user_id=?').get('local-owner');
assert.ok(row,'La base BatiNova doit exister');const state=JSON.parse(row.payload);
assert.equal(state.company.name,'BatiNova Entreprise Générale SRL');
assert.equal(state.people.length,25);
assert.deepEqual(state.teams.map(team=>team.members.length).sort((a,b)=>b-a),[5,5,5,4]);
const alex=state.people.find(person=>person.name==='Alex Marchal');assert.equal(alex.role,'Magasinier / chauffeur / logistique chantier');assert.equal(alex.employment.grossHourly,21.2);
const byRole=role=>(state.contacts||[]).filter(contact=>contact.roles.includes(role));assert.equal(byRole('Client').length,6);assert.equal(byRole('Fournisseur').length,8);assert.equal(byRole('Sous-traitant').length,3);
assert.equal(state.jobs.length,5);assert.equal(state.jobs.filter(job=>job.clientId).length,5);
assert.equal(state.assets.filter(asset=>asset.group==='vehicles').length,8);assert.equal(state.assets.filter(asset=>asset.group==='tools').length,19);
assert.equal(state.priceCatalog.length,38,'Le catalogue BatiNova consolidé contient 38 articles');assert.ok(state.accountingData.customerInvoices.some(invoice=>invoice.ref==='FAC-2026-094'),'Facture client de référence présente');
assert.equal(state.accountingData.openingPosition.bankAvailable,260000);assert.equal(state.accountingData.openingPosition.stockValue,95000);
for(const invoice of state.accountingData.customerInvoices.filter(invoice=>invoice.netAmount!=null))assert.equal(Math.round((invoice.netAmount+invoice.vatAmount)*100),Math.round(invoice.amount*100),'HTVA + TVA doit égaler TVAC');
const stock={quantity:0,unitCost:12,movements:[]},job={finance:{materials:0}};const move=(type,quantity)=>{const signed=type==='entrée'?quantity:-quantity;assert.ok(stock.quantity+signed>=0);stock.quantity+=signed;stock.movements.push({type,quantity});if(type==='sortie chantier')job.finance.materials+=quantity*stock.unitCost};move('entrée',100);move('sortie chantier',25);assert.equal(stock.quantity,75);assert.equal(job.finance.materials,300);
const imported={progress:48};const reloaded=JSON.parse(JSON.stringify(imported));assert.equal(reloaded.progress,48);
console.log('data-15: 20 assertions réussies');
