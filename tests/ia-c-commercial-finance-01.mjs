import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const contacts=readFileSync(new URL('../web/contacts.js',import.meta.url),'utf8');
const server=readFileSync(new URL('../web/server-modules.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../web/style.css',import.meta.url),'utf8');

let n=0;
const ok=(condition,message)=>{assert.ok(condition,message);n++};

ok(contacts.includes('iaCContactVisibleCount=5'),'annuaire limite les aperçus à 5');
ok(contacts.includes('Afficher les '),'annuaire propose Afficher plus');
ok(contacts.includes("localeCompare(String(b.name||''),'fr'"),'annuaire trié A-Z');

ok(server.includes("serverJson('/api/quotes')"),'devis chargés depuis le serveur');
ok(server.includes("saveQuote=async function"),'création/modification devis serveur');
ok(server.includes("iaCUpdateQuoteStatus"),'statut devis persisté côté serveur');
ok(server.includes("iaCFinanceVisibleCount=5"),'finance limite les listes à 5');
ok(server.includes("serverInvoices"),'factures serveur utilisées');
ok(server.includes("serverExpenses"),'dépenses serveur utilisées');
ok(server.includes("openServerInvoice"),'facture ouvre paiement/avoirs/solde serveur');
ok(server.includes("serverInvoiceForm"),'création facture serveur conservée');
ok(server.includes("serverExpenseForm"),'création dépense serveur conservée');
ok(server.includes("iaCInvoiceStatus"),'filtres facture présents');
ok(server.includes("iaCExpenseStatus"),'filtres dépense présents');

ok(style.includes('.ia-c-finance-toolbar'),'styles IA-C présentes');
ok(style.includes('.ia-c-list-more'),'contrôle Afficher plus stylé');

console.log(`ia-c-commercial-finance-01: ${n} assertions passed`);
