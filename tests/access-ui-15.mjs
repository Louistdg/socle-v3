import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const puts=[];
let remoteMembers=[
 {userId:'owner',personId:null,name:'Marc Delcourt',roleCode:'OWNER',owner:true,profileName:'Patron',scope:'Toute l’entreprise',permissions:[],projectIds:[],configured:false},
 {userId:'julien',personId:'10',name:'Julien Lambert',roleCode:'USER_x',owner:false,profileName:'Chef d’équipe',scope:'Ses chantiers uniquement',permissions:['ui.module.planning.view','ui.module.jobs.view','ui.module.jobs.add','ui.sensitive.quotePrices'],projectIds:['1'],configured:true}
];
const people=[{id:10,name:'Julien Lambert',role:'Chef d’équipe',trade:'Couvreur',initials:'JL',color:'teal'}];
const ctx={console,structuredClone,queueMicrotask,sessionAccessKey:'owner',company:{manager:'Marc Delcourt'},people,tabs2:[['planning','Accueil'],['permissions','Droits d’accès']],view:'home',render(){},toast(){},scheduleSave(){},restoreWorkspace(){},workspaceSnapshot(){return JSON.stringify({})},showPersonDossier(){},getPerson(id){return people.find(p=>p.id===id)},esc:s=>String(s),jsString:s=>String(s).replaceAll("'","\\'"),heading:()=>'',document:{querySelector(){return null}},fetch:async(url,options={})=>{if(options.method==='PUT'){puts.push({url,body:JSON.parse(options.body),organizationId:ctx.socleCurrentOrganizationId});const target=decodeURIComponent(url.split('/').at(-1));const body=JSON.parse(options.body);remoteMembers=remoteMembers.map(member=>member.userId===target?{...member,profileName:body.profileName,scope:body.scope,projectIds:body.projectIds,configured:true,permissions:Object.entries(body.modules).flatMap(([module,actions])=>Object.entries(actions).filter(([,enabled])=>enabled).map(([action])=>`ui.module.${module}.${action}`)).concat(Object.entries(body.sensitive).filter(([,enabled])=>enabled).map(([key])=>`ui.sensitive.${key}`))}:member);return{ok:true,json:async()=>({members:remoteMembers})}}return{ok:true,json:async()=>({members:remoteMembers})}}};
ctx.socleCurrentOrganizationId='org-batinova-iae-2026-10-01';
ctx.socleCurrentAccess={userId:'owner',roleCode:'OWNER'};
const tenantRequests=[];
ctx.serverJson=async(url,options={})=>{
 tenantRequests.push({url,organizationId:ctx.socleCurrentOrganizationId});
 if(options.method==='PUT'){const response=await ctx.fetch(url,options);return response.json()}
 if(url==='/api/access-control')return{members:remoteMembers};
 if(url==='/api/roles')return{roles:[]};
 if(url==='/api/invitations')return{invitations:[],emailDeliveryEnabled:true,manualTestEnabled:true};
 if(url==='/api/invitation-roster')return{organizationId:ctx.socleCurrentOrganizationId,organizationName:'BatiNova',source:'workspace_state',rosterCount:25,eligibleCount:2,people:[{id:'1790270195166',name:'David Leclercq',role:'Chef E1',active:true},{id:'1790270195400',name:'Anthony Simon',role:'Ouvrier E1',active:true}]};
 throw new Error('Unexpected tenant API route: '+url);
};
ctx.globalThis=ctx;vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../web/permissions.js',import.meta.url),'utf8'),ctx);
await vm.runInContext('loadServerAccess()',ctx);
assert.equal(vm.runInContext("serverAccessReady",ctx),true);
assert.deepEqual(tenantRequests.slice(0,4).map(item=>item.url),['/api/access-control','/api/roles','/api/invitations','/api/invitation-roster']);
assert(tenantRequests.every(item=>item.organizationId==='org-batinova-iae-2026-10-01'),'les lectures de permissions suivent l’organisation active');
assert.equal(vm.runInContext('serverInvitationRoster.length',ctx),2);
const invitationMarkup=vm.runInContext('permissionsView()',ctx);
assert.match(invitationMarkup,/value="1790270195166">David Leclercq/);
assert.match(invitationMarkup,/value="1790270195400">Anthony Simon/);
assert.match(invitationMarkup,/Personne du roster — BatiNova/);
assert.equal(vm.runInContext("accessMembers().find(x=>x.key==='person:10').serverUserId",ctx),'julien');
assert.equal(vm.runInContext("accessAssignments['person:10'].profile",ctx),'Chef d’équipe');
assert.equal(vm.runInContext("accessAssignments['person:10'].modules.jobs.view",ctx),true);
assert.equal(vm.runInContext("accessAssignments['person:10'].modules.jobs.edit",ctx),false);
assert.equal(vm.runInContext("accessAssignments['person:10'].sensitive.quotePrices",ctx),true);
assert.equal(vm.runInContext("serverProjectAccess['person:10'].has('1')",ctx),true);
vm.runInContext("applyCurrentServerAccess(serverAccessMembers.find(x=>x.userId==='julien'))",ctx);assert.equal(vm.runInContext("sessionAccessKey",ctx),'person:10');assert.equal(vm.runInContext("accessAssignments['person:10'].scope",ctx),'Ses chantiers uniquement');
vm.runInContext("toggleModuleAccess('person:10','jobs','edit',true)",ctx);await new Promise(resolve=>setTimeout(resolve,0));await vm.runInContext("serverAccessSaveQueues['person:10']",ctx);
assert.equal(puts.length,1);assert.equal(puts[0].url,'/api/access-control/julien');assert.equal(puts[0].body.modules.jobs.edit,true);assert.equal(puts[0].body.projectIds[0],'1');assert.equal(puts[0].organizationId,'org-batinova-iae-2026-10-01');
console.log('access-ui-15: tenant actif, roster BatiNova et permissions serveur vérifiés');
