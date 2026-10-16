import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/admin.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/ui-foundation.css',import.meta.url),'utf8');
const integrationCss=readFileSync(new URL('../web/ia-a-ui.css',import.meta.url),'utf8');
const ui=readFileSync(new URL('../web/ui-foundation.js',import.meta.url),'utf8');

const start=source.indexOf('function assetHasActiveFollowup');
const end=source.indexOf('\nfleetView=',start);
assert.ok(start>=0&&end>start,'helpers de filtre Biens & matériel présents');

const assets=[
  {id:1,name:'Crafter 01',category:'Camionnette équipée',condition:'En service',attached:'Équipe Toiture',responsible:'Thomas',provider:'Garage Démo',reference:'AUTO-1',vehicle:{registration:'1-ABC-123',model:'Crafter'}},
  {id:2,name:'Compresseur atelier',category:'Machine',condition:'À réparer',attached:'Atelier',responsible:'Antoine',provider:'Outils SA',reference:'OUT-2',repairNote:'Fuite raccord'},
  {id:3,name:'Visseuse 18V',category:'Outil',condition:'En service',attached:'Équipe Toiture',responsible:'Mehdi',provider:'Outils SA',reference:'OUT-3'}
];
const reminders=[
  {id:'r1',linkType:'asset',linkId:1,state:'todo'},
  {id:'r2',linkType:'asset',linkId:3,state:'done'}
];

const sandbox={
  reminders,
  assetSearch:'',
  assetType:'all',
  assetCondition:'all',
  assetAttachment:'all',
  assetFollowup:'all'
};
vm.runInNewContext(source.slice(start,end),sandbox);

const ids=()=>sandbox.assetFilteredList(assets).map(item=>item.id);
assert.deepEqual(ids(),[1,2,3],'aucun filtre retourne toute la catégorie');

sandbox.assetSearch='crafter';
assert.deepEqual(ids(),[1],'recherche texte nom');
sandbox.assetSearch='1-abc';
assert.deepEqual(ids(),[1],'recherche immatriculation');
sandbox.assetSearch='thomas';
assert.deepEqual(ids(),[1],'recherche responsable');

sandbox.assetSearch='';
sandbox.assetType='Machine';
assert.deepEqual(ids(),[2],'filtre Type');

sandbox.assetType='all';
sandbox.assetCondition='En service';
assert.deepEqual(ids(),[1,3],'filtre État');

sandbox.assetCondition='all';
sandbox.assetAttachment='Équipe Toiture';
assert.deepEqual(ids(),[1,3],'filtre Rattachement');

sandbox.assetAttachment='all';
sandbox.assetFollowup='active';
assert.deepEqual(ids(),[1,2],'filtre Suivi actif = alerte ouverte ou réparation');
sandbox.assetFollowup='none';
assert.deepEqual(ids(),[3],'filtre Sans suivi actif');

sandbox.assetFollowup='all';
assert.deepEqual(Array.from(sandbox.assetFilterValues(assets,'attached')),['Atelier','Équipe Toiture'],'options rattachement dédupliquées');
assert.equal(sandbox.assetFilterCount(),0,'compteur filtres avancés à zéro');
sandbox.assetType='Machine';
sandbox.assetCondition='À réparer';
assert.equal(sandbox.assetFilterCount(),2,'compteur filtres avancés');

const fleetStart=source.indexOf('fleetView=function(){');
const fleetEnd=source.indexOf('\nfunction vehicleAlertState',fleetStart);
const fleet=source.slice(fleetStart,fleetEnd);
assert.ok(fleet.includes('assetFilterBarHTML()'),'vue Biens & matériel utilise le renderer partagé des filtres');
assert.ok(fleet.includes('assetFilterContextHTML('),'vue Biens & matériel utilise ContextLine canonique');
assert.equal(fleet.includes('Ajouter un véhicule'),false,'pas de libellé dynamique véhicule dans la barre');

const helperStart=source.indexOf('function assetFilterBarHTML(){');
const helperEnd=source.indexOf('\nfunction assetFilterContextHTML',helperStart);
const helper=source.slice(helperStart,helperEnd);
assert.ok(helperStart>=0&&helperEnd>helperStart,'renderer métier partagé des contrôles présents');
assert.ok(helper.includes('SocleUI.CompactFilterBar('),'CompactFilterBar réellement construit par la Foundation');
assert.ok(helper.includes('SocleUI.renderHTML('),'nœud canonique adapté au contrat string/innerHTML');
assert.ok(helper.includes('SocleUI.PrimaryAction('),'action primaire construite par la Foundation');
for(const label of ['Recherche','Type','État','Rattachement','Suivi'])assert.ok(helper.includes(`data-label="${label}"`),'contrôle transmis au composant partagé: '+label);
assert.ok(helper.includes("label:'+ Ajouter un bien'"),'libellé PrimaryAction stable');
for(const duplicatedStructure of ['ui-compact-filter-bar','ui-filter-sheet__header','ui-filter-sheet-close','ui-filter-actions'])assert.equal(helper.includes(duplicatedStructure),false,'pas de structure Foundation recopiée: '+duplicatedStructure);

const iaUi=readFileSync(new URL('../web/ia-a-ui.js',import.meta.url),'utf8');
const overrideStart=iaUi.indexOf('fleetView=function(){',iaUi.indexOf("if(typeof fleetView==='function')"));
const overrideEnd=iaUi.indexOf('\n  };',overrideStart);
const override=iaUi.slice(overrideStart,overrideEnd);
assert.ok(override.includes('assetFilterBarHTML()'),'override IA-A consomme le renderer métier commun');
assert.equal(override.includes('ui-compact-filter-bar'),false,'override IA-A ne recopie pas la structure Foundation');
assert.equal(override.includes('ui-filter-sheet__header'),false,'override IA-A ne recopie pas le bottom sheet');

assert.ok(css.includes('.ui-filter-sheet[data-open="true"]'),'bottom sheet canonique stylé');
assert.ok(css.includes('position:fixed'),'bottom sheet mobile fixé');
assert.ok(css.includes('max-height:min(85dvh,640px)'),'bottom sheet modal borné en hauteur');
assert.ok(integrationCss.includes('body[data-ia-a-role] .asset-categories'),'espacement mort catégorie réduit dans la couche métier');
assert.ok(integrationCss.includes('.assets-filter-bar'),'barre Assets stylée dans la couche d’intégration');
assert.ok(ui.includes('CompactFilterBar.toggleSheet=toggleCompactFilterSheet'),'contrôleur bottom sheet canonique exposé sur CompactFilterBar');
assert.ok(ui.includes("setAttribute('aria-modal','true')"),'bottom sheet Foundation exposé comme dialogue modal');
assert.ok(ui.includes("event.key==='Escape'"),'fermeture clavier Escape portée par Foundation');
assert.ok(ui.includes('sibling.inert=true'),'arrière-plan rendu inerte par Foundation');
assert.ok(ui.includes('event.shiftKey'),'navigation clavier Shift+Tab gérée par Foundation');

console.log('ASSETS_FILTER_FOUNDATION_01=PASS — recherche, Type, État, Rattachement, Suivi, PrimaryAction et bottom sheet mobile verrouillés');
