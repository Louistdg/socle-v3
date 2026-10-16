import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/server-modules.js',import.meta.url),'utf8');
const preamble=source.slice(0,source.indexOf('let serverFinance=null'));
const css=readFileSync(new URL('../web/organization.css',import.meta.url),'utf8');

class Element{
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.children=[];this.listeners={};this.attributes={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';this.className='';this.id='';
  }
  appendChild(child){this.children.push(child);child.parentNode=this;return child}
  replaceChildren(...children){this.children=children;for(const child of children)child.parentNode=this;this.textContent=''}
  addEventListener(type,fn){this.listeners[type]=fn}
  setAttribute(name,value){this.attributes[name]=String(value)}
  getAttribute(name){return this.attributes[name]??null}
  focus(){this.focused=true}
  querySelector(selector){
    const match=(element)=>selector.startsWith('#')?element.id===selector.slice(1):selector.startsWith('[name=')?element.name===selector.slice(6,-1).replaceAll('"',''):selector==='button[type="submit"]'?element.tagName==='BUTTON'&&element.type==='submit':selector==='[data-create-organization-status]'?Object.hasOwn(element.dataset,'createOrganizationStatus'):false;
    const visit=(parent)=>{for(const child of parent.children){if(match(child))return child;const found=visit(child);if(found)return found}return null};return visit(this);
  }
  async click(){return this.listeners.click?.({currentTarget:this})}
}

async function setup(roleCode){
  const storage=new Map([['socle.activeOrganizationId','org-batinova']]);let reloads=0,created=false;const calls=[];
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
  const label=new Element('span'),select=new Element('select'),status=new Element('small');
  const nodes={'#organizationLabel':label,'#organizationSwitcher':select,'#organizationSwitcherStatus':status};
  const queued=[];
  const fetch=async(url,options={})=>{
    calls.push({url,method:options.method||'GET',headers:options.headers||{},body:options.body});
    if(url==='/api/organizations'&&(options.method||'GET')==='GET'){
      const organizations=[{id:'org-batinova',name:'BatiNova',role_code:roleCode}];if(created)organizations.push({id:'org-fayt',name:'Menuiserie Fayt',role_code:roleCode});
      return new Response(JSON.stringify({activeOrganizationId:'org-batinova',organizations}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(url==='/api/organizations'&&options.method==='POST'){
      const parsed=JSON.parse(options.body);assert.deepEqual(Object.keys(parsed),['name'],'Le client ne transmet que le nom');assert.equal(parsed.name,'Menuiserie Fayt');created=true;
      return new Response(JSON.stringify({organization:{id:'org-fayt',name:parsed.name}}),{status:201,headers:{'content-type':'application/json'}});
    }
    if(url==='/api/bootstrap')return new Response(JSON.stringify({organization:{id:options.headers['x-socle-organization-id']}}),{status:200,headers:{'content-type':'application/json'}});
    return new Response(JSON.stringify({error:'unexpected'}),{status:500,headers:{'content-type':'application/json'}});
  };
  const ctx={console:{...console,warn(){}},URLSearchParams,Response,FormData,localStorage,fetch,queueMicrotask:fn=>queued.push(fn),tabs2:[['jobs','Chantiers']],view:'home',location:{search:'',reload(){reloads++}},restoreWorkspace(){},accessAssignments:{owner:{modelVersion:3}},ACCESS_MODEL_VERSION:3,migrateAccessModel(){},document:{querySelector:selector=>nodes[selector]||null,createElement:tag=>new Element(tag)},esc:String};
  ctx.globalThis=ctx;vm.createContext(ctx);vm.runInContext(preamble,ctx);await queued[0]();
  return {ctx,label,select,status,calls,storage,get reloads(){return reloads},get created(){return created}};
}

const owner=await setup('OWNER');
const duplicateOrganizations=[
  {id:'horizon-team',name:'Atelier Horizon',created_at:'2026-10-10T23:49:02.596Z'},
  {id:'horizon-jobs',name:'Atelier Horizon',created_at:'2026-10-11T00:04:29.532Z'},
  {id:'single',name:'Entreprise unique',created_at:'2026-10-11T01:00:00.000Z'}
];
const duplicatesBefore=JSON.stringify(duplicateOrganizations),duplicateLabels=owner.ctx.socleOrganizationDisplayLabels(duplicateOrganizations);
assert.notEqual(duplicateLabels.get('horizon-team'),duplicateLabels.get('horizon-jobs'),'Homonymous simulations are distinguishable by their creation dates.');
assert.match(duplicateLabels.get('horizon-team'),/01:49/,'Creation time uses Brussels time.');
assert.match(duplicateLabels.get('horizon-jobs'),/02:04/);
assert.equal(duplicateLabels.get('single'),'Entreprise unique','Unique organization names stay concise.');
assert.equal(JSON.stringify(duplicateOrganizations),duplicatesBefore,'Display labels never rename or merge organizations.');
const fallbackLabels=owner.ctx.socleOrganizationDisplayLabels([{id:'one',name:'Test'},{id:'two',name:'Test'}]);
assert.notEqual(fallbackLabels.get('one'),fallbackLabels.get('two'),'Older API responses without creation times still produce distinct labels.');
const add=owner.label.children.flatMap(node=>node.children||[]).find(node=>node.className==='organization-add');
assert.ok(add,'OWNER voit le bouton Ajouter une entreprise');
await add.click();
const form=owner.label.querySelector('#organizationCreateForm'),input=form.querySelector('[name="organizationName"]'),submit=form.querySelector('button[type="submit"]');
assert.equal(form.hidden,false,'Le formulaire compact s’ouvre depuis le sélecteur existant');
input.value='Menuiserie Fayt';
await form.listeners.submit({preventDefault(){},currentTarget:form});
assert.equal(owner.calls.filter(call=>call.url==='/api/organizations'&&call.method==='POST').length,1,'Le formulaire crée une organisation par POST');
assert.ok(owner.calls.filter(call=>call.url==='/api/organizations'&&call.method==='GET').length>=2,'GET /api/organizations est relu après création');
assert.equal(owner.storage.get('socle.activeOrganizationId'),'org-batinova','La création ne change pas le tenant actif');
assert.ok(owner.label.children.some(node=>node.className==='organization-current'&&node.textContent==='BatiNova'));
assert.ok(owner.label.children.flatMap(node=>node.children||[]).some(node=>node.className==='organization-choice'&&node.textContent==='Menuiserie Fayt'),'Fayt apparaît immédiatement dans le sélecteur');
assert.match(owner.status.textContent,/Entreprise créée/,'La réussite est annoncée sans recharger ni sélectionner un autre tenant');
const fayt=owner.label.children.flatMap(node=>node.children||[]).find(node=>node.className==='organization-choice'&&node.textContent==='Menuiserie Fayt');
await fayt.click();
assert.equal(owner.storage.get('socle.activeOrganizationId'),'org-fayt','Le bouton de Fayt passe par la validation serveur et le stockage existant');
assert.equal(owner.reloads,1,'Le changement utilise le rechargement normal pour purger les données en mémoire');
assert.ok(owner.calls.some(call=>call.url==='/api/bootstrap'&&call.headers['x-socle-organization-id']==='org-fayt'),'La bascule vérifie le tenant par /api/bootstrap');

for(const role of ['TEAM_LEAD','WORKER','ACCOUNTING']){
  const user=await setup(role);
  assert.equal(user.label.children.flatMap(node=>node.children||[]).some(node=>node.className==='organization-add'),false,`${role} ne voit pas le bouton de création`);
}
assert.match(css,/\.organization-create-form\[hidden\]\{display:none\}/,'Le formulaire caché reste réellement invisible');
assert.match(css,/@media\(max-width:760px\)\{[\s\S]*\.organization-create-form input\{min-height:44px;font-size:16px\}/,'Le formulaire est utilisable au toucher sur mobile');
console.log('multi-org-create-ui-01: OWNER-only, POST + GET refresh, choix Fayt via bootstrap, rôles refusés et styles mobile PASS');
