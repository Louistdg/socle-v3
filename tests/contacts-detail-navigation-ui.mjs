import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/contacts.js',import.meta.url),'utf8');
const start=source.indexOf('function openContact(id)');
const end=source.indexOf('\nfunction contactMatches',start);
assert.ok(start>=0&&end>start,'Le parcours d’ouverture de fiche est présent.');
const state={contacts:[{id:'supplier-1'}],currentContactId:'',view:'contacts',renders:0,messages:[]};
const sandbox={contacts:state.contacts,currentContactId:state.currentContactId,view:state.view,render:()=>state.renders++,toast:message=>state.messages.push(message)};
vm.runInNewContext(source.slice(start,end),sandbox);
sandbox.openContact('supplier-1');
assert.equal(sandbox.view,'contact');
assert.equal(sandbox.currentContactId,'supplier-1');
assert.equal(state.renders,1,'La fiche sélectionnée est rendue sans naviguer vers Planning.');
sandbox.openContact('missing');
assert.equal(state.messages[0],'Contact introuvable dans cet annuaire.');

assert.match(source,/Retour à l’annuaire/,'La fiche offre un retour explicite à Contacts.');
assert.doesNotMatch(source,/\+iaCServerDirectoryPanel\(\)/,'La seconde liste technique n’est plus rendue dans Contacts.');
console.log('contacts-detail-navigation-ui: PASS ouverture de fiche, retour et annuaire unique.');
