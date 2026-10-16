import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const serverSource=readFileSync(new URL('../web/server-modules.js',import.meta.url),'utf8');
const preamble=serverSource.slice(0,serverSource.indexOf('let serverFinance=null'));
const adminSource=readFileSync(new URL('../web/admin.js',import.meta.url),'utf8');
const workerSource=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');

const store=new Map([['socle.activeOrganizationId','org-stale']]);
const localStorage={
  getItem:key=>store.get(key)??null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key)
};
const calls=[];
let reloads=0;
let organizationsActive='org-valid';
let organizationsFixture=[{id:'org-valid',name:'Socle.Simu.V2',role_code:'WORKER'},{id:'org-batinova-iae-2026-10-01',name:'BatiNova Entreprise Générale SRL',role_code:'WORKER'}];
let organizationsUnavailable=false;
function makeNode(tag='span'){
  const attributes={};
  const node={tagName:String(tag).toUpperCase(),id:'',value:'',textContent:'',selected:false,hidden:false,disabled:false,className:'',type:'',title:'',children:[],listeners:{},dataset:{},attributes,
    replaceChildren(...children){this.children=children;this.textContent=''},appendChild(child){this.children.push(child);return child},addEventListener(type,fn){this.listeners[type]=fn},
    setAttribute(name,value){attributes[name]=String(value);if(name==='id')this.id=String(value)},getAttribute(name){return attributes[name]??null},focus(){this.focused=true},
    click(){return this.listeners.click?.({target:this,stopPropagation(){}})},querySelector(selector){const match=c=>selector.startsWith('.')?String(c.className||'').split(/\s+/).includes(selector.slice(1)):selector.startsWith('#')?c.id===selector.slice(1):false;const queue=[...this.children];while(queue.length){const child=queue.shift();if(match(child))return child;queue.push(...(child.children||[]))}return null}
  };
  return node;
}
const organizationSelect=makeNode('select');organizationSelect.hidden=true;organizationSelect.replaceChildren=function(...children){this.children=children;this.value=children.find(child=>child.selected)?.value||children[0]?.value||''};
const organizationLabel=makeNode('span');organizationLabel.textContent='Chargement…';
const organizationStatus=makeNode('small');organizationStatus.hidden=true;
const elements={'#organizationSwitcher':organizationSelect,'#organizationLabel':organizationLabel,'#organizationSwitcherStatus':organizationStatus};
const fetch=async(url,options={})=>{
  const headers=options.headers||{},organization=headers['x-socle-organization-id']||'';
  calls.push({url,organization,method:options.method||'GET'});
  if(url==='/api/organizations')return new Response(JSON.stringify({
    activeOrganizationId:organizationsActive,
    organizations:organizationsUnavailable?[]:organizationsFixture
  }),{status:organizationsUnavailable?503:200,headers:{'content-type':'application/json'}});
  if(url==='/api/projects/1'){
    if(organization==='org-stale')return new Response(JSON.stringify({error:'Accès refusé à cette entreprise.'}),{status:403,headers:{'content-type':'application/json'}});
    if(organization==='org-valid')return new Response(JSON.stringify({project:{id:'1'}}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url==='/api/bootstrap'){
    if(organization==='org-bad')return new Response(JSON.stringify({error:'Accès refusé à cette entreprise.'}),{status:403,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({organization:{id:organization}}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(url==='/api/state')return new Response(JSON.stringify({organizationId:organization,state:{roster:[organization==='org-valid'?'Simu V2 roster':'BatiNova roster']}}),{status:200,headers:{'content-type':'application/json'}});
  return new Response(JSON.stringify({error:'unexpected'}),{status:500,headers:{'content-type':'application/json'}});
};

const queued=[];
const ctx={
  console:{...console,warn(){}},
  URLSearchParams,
  Response,
  FormData,
  localStorage,
  fetch,
  queueMicrotask:fn=>queued.push(fn),
  tabs2:[['jobs','Chantiers']],
  view:'planning',
  location:{search:'',reload(){reloads++}},
  restoreWorkspace(){},
  accessAssignments:{owner:{modelVersion:3}},
  ACCESS_MODEL_VERSION:3,
  migrateAccessModel(){},
  document:{querySelector(selector){return elements[selector]||null},createElement:makeNode,addEventListener(){}},
  window:{matchMedia(){return{matches:false}},addEventListener(){}},
  esc:value=>String(value)
};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(preamble,ctx);

const project=await vm.runInContext("serverJson('/api/projects/1')",ctx);
assert.equal(project.project.id,'1','La requête GET doit être rejouée après récupération de l’entreprise valide');
assert.equal(store.get('socle.activeOrganizationId'),'org-valid','L’identifiant périmé doit être remplacé');
assert.deepEqual(calls.slice(0,3).map(call=>[call.url,call.organization]),[
  ['/api/projects/1','org-stale'],
  ['/api/organizations',''],
  ['/api/projects/1','org-valid']
]);

await assert.rejects(()=>vm.runInContext("selectSocleOrganization('org-bad')",ctx),/Accès refusé à cette entreprise/);
assert.equal(store.get('socle.activeOrganizationId'),'org-valid','Une sélection invalide ne doit jamais être persistée');

await vm.runInContext("selectSocleOrganization('org-new')",ctx);
assert.equal(store.get('socle.activeOrganizationId'),'org-new','Une entreprise validée est persistée après validation serveur');
assert.equal(reloads,1,'Le changement validé recharge l’application une fois');

organizationsActive='org-batinova-iae-2026-10-01';
await queued[0]();
assert.equal(organizationSelect.hidden,true,'Le select natif reste caché : le changement de tenant utilise des choix explicites');
assert.deepEqual(organizationSelect.children.map(option=>[option.value,option.textContent]),[
  ['org-valid','Socle.Simu.V2'],
  ['org-batinova-iae-2026-10-01','BatiNova Entreprise Générale SRL']
],'Les deux entreprises sont réellement proposées');
assert.equal(organizationSelect.value,'org-batinova-iae-2026-10-01','BatiNova reste l’entreprise active dans le sélecteur');
assert.equal(organizationLabel.hidden,false,'Le nom de l’entreprise active reste toujours visible');
assert.equal(organizationLabel.children[0].textContent,'BatiNova Entreprise Générale SRL','Le tenant actif est affiché explicitement');
assert.equal(organizationLabel.children[1].className,'organization-mobile-trigger','Le bouton compact mobile est généré');
assert.equal(organizationLabel.children[1].textContent,'⌄','Le nom actif est affiché à part et le bouton compact sert seulement à ouvrir le menu');
assert.equal(organizationLabel.children[1].dataset.hasMenu,'true','Le bouton sait qu’un menu multi-org est disponible');
assert.equal(organizationLabel.children[1].getAttribute('aria-expanded'),'false','Le menu mobile démarre replié');
assert.equal(organizationLabel.children[2].children.length,1,'Une alternative de tenant est proposée dans le menu');
assert.equal(organizationLabel.children[2].children[0].textContent,'Socle.Simu.V2','Le bouton de bascule nomme explicitement l’autre entreprise');
assert.equal(organizationLabel.children[2].dataset.mobileOpen,'false','Les alternatives sont repliées par défaut sur mobile');
assert.equal(organizationStatus.hidden,true,'Aucun message d’erreur n’est affiché en cas de succès');

const simulaSwitchButton=organizationLabel.children[2].children[0];
await simulaSwitchButton.click();
assert.equal(store.get('socle.activeOrganizationId'),'org-valid','Le choix tactile persiste l’entreprise validée après réponse serveur');
await vm.runInContext('initOrganizationSwitcher()',ctx);
assert.equal(organizationLabel.children[0].textContent,'Socle.Simu.V2','Après rechargement, l’entreprise choisie est réaffichée');
assert.equal((await vm.runInContext("serverJson('/api/state')",ctx)).state.roster[0],'Simu V2 roster','Les données chargées suivent l’entreprise choisie');
assert.equal(calls.at(-1).organization,'org-valid','Le chargement du tenant actif transmet son ID au serveur');

const batinovaSwitchButton=organizationLabel.children[2].children[0];
await batinovaSwitchButton.click();
assert.equal(store.get('socle.activeOrganizationId'),'org-batinova-iae-2026-10-01','Le retour vers BatiNova persiste aussi le choix');
await vm.runInContext('initOrganizationSwitcher()',ctx);
assert.equal(organizationLabel.children[0].textContent,'BatiNova Entreprise Générale SRL','Le retour A→B→A reste visible après réinitialisation');
assert.equal((await vm.runInContext("serverJson('/api/state')",ctx)).state.roster[0],'BatiNova roster','Les données reviennent au tenant BatiNova sélectionné');
assert.equal(calls.at(-1).organization,'org-batinova-iae-2026-10-01','Le retour tenant transmet son ID au serveur');
const finalSimuSwitchButton=organizationLabel.children[2].children[0];
await finalSimuSwitchButton.click();
assert.equal(store.get('socle.activeOrganizationId'),'org-valid','Le cycle complet revient à A');
await vm.runInContext('initOrganizationSwitcher()',ctx);
assert.equal(organizationLabel.children[0].textContent,'Socle.Simu.V2','Le cycle A→B→A termine sur A');
assert.equal((await vm.runInContext("serverJson('/api/state')",ctx)).state.roster[0],'Simu V2 roster','Le roster A revient après B');

organizationsFixture=[{id:'org-batinova-iae-2026-10-01',name:'BatiNova Entreprise Générale SRL',role_code:'WORKER'}];
await vm.runInContext('initOrganizationSwitcher()',ctx);
assert.equal(organizationSelect.hidden,true,'Le sélecteur natif reste caché lorsqu’une seule entreprise est accessible');
assert.equal(organizationLabel.children[0].textContent,'BatiNova Entreprise Générale SRL','Le nom desktop de l’entreprise unique reste disponible');
assert.equal(organizationLabel.children[1].className,'organization-mobile-trigger','Une entreprise unique conserve le bouton mobile compact');
assert.equal(organizationLabel.children[1].textContent,'⌄','Le nom unique reste dans le libellé et le bouton d’ouverture est neutre');
assert.equal(organizationLabel.children[1].dataset.hasMenu,'false','Une entreprise unique non-OWNER n’ouvre aucun menu');
assert.equal(organizationLabel.children.length,2,'Aucune liste ni action Ajouter n’est générée pour une entreprise unique non-OWNER');
organizationsUnavailable=true;
await vm.runInContext('initOrganizationSwitcher()',ctx);
assert.equal(organizationSelect.hidden,true,'Le sélecteur reste caché quand la liste ne peut pas être chargée');
assert.equal(organizationLabel.textContent,'Entreprise indisponible','La panne ne laisse pas un contrôle vide et trompeur');
assert.equal(organizationStatus.hidden,false,'La cause du sélecteur indisponible est signalée');

assert.match(adminSource,/serverJson\('\/api\/state'\)/,'Le chargement principal doit utiliser le client API conscient de l’entreprise');
assert.match(adminSource,/serverJson\('\/api\/state',\{method:'PUT'/,'La sauvegarde doit cibler la même entreprise active');
assert.match(adminSource,/finally\{document\.querySelector\('#nav'\)\.removeAttribute\('inert'\)\}/,'La navigation doit être réactivée même après erreur');
assert.match(adminSource,/Chargement partiel SOCLE/,'Une panne d’un module secondaire doit rester partielle');
assert.match(workerSource,/organizationId:ctx\.organizationId/,'Le backend doit renvoyer l’entreprise réellement utilisée pour l’état');
const organizationCss=readFileSync(new URL('../web/organization.css',import.meta.url),'utf8');
assert.match(organizationCss,/#organizationSwitcher\[hidden\]\s*\{\s*display:none;/,'Le style ne doit pas rendre visible le sélecteur tant qu’il est caché');
assert.match(organizationCss,/\.topbar \.workspace\{[^}]*display:flex/,'Le changement d’entreprise reste affiché sur mobile');
assert.match(organizationCss,/\.organization-mobile-trigger\{display:inline-flex/,'Le téléphone affiche le bouton compact du tenant actif');
assert.match(organizationCss,/\.organization-choices\[data-mobile-open="false"\]\{display:none\}/,'Les choix restent repliés par défaut sur mobile');
assert.match(organizationCss,/\.organization-choice,\.organization-add\{[^}]*min-height:44px/,'Les choix ouverts gardent une cible tactile confortable');

console.log('access-recovery-ui-22: choix replié A→B→A, persistance, données serveur et récupération testés');
