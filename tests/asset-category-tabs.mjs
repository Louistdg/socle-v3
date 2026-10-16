import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/admin.js',import.meta.url),'utf8');
const start=source.indexOf('function categoryAssets(key)');
const end=source.indexOf('\nfleetView=',start);
assert.ok(start>=0&&end>start,'Le filtre catégorie du parc existe.');
const assets=[
  {id:'van',group:'vehicles',mode:'Achat',condition:'En service'},
  {id:'tool',group:'tools',mode:'Achat',condition:'En service'},
  {id:'rental',group:'tools',mode:'Location',condition:'En service'},
  {id:'repair',group:'tools',mode:'Achat',condition:'À réparer'},
  {id:'reported',group:'vehicles',mode:'Achat',condition:'En service',issues:[{status:'open'}]},
  {id:'resolved',group:'tools',mode:'Achat',condition:'En service',issues:[{status:'resolved'}]}
];
const sandbox={assets,isVehicle:item=>item.group==='vehicles'};
vm.runInNewContext(source.slice(start,end),sandbox);
const ids=key=>sandbox.categoryAssets(key).map(item=>item.id).sort();
assert.deepEqual(ids('vehicles'),['reported','van']);
assert.deepEqual(ids('tools'),['rental','repair','resolved','tool'],'un bien peut conserver sa catégorie métier tout en apparaissant dans Locations');
assert.deepEqual(ids('rentals'),['rental']);
assert.deepEqual(ids('repairs'),['repair','reported']);
assert.deepEqual(ids('unknown'),[],'Une catégorie inconnue ne doit pas afficher tout le parc.');
console.log('asset-category-tabs: PASS filtres et compteurs Véhicules, Outillage, Locations, À réparer.');
