import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

let remoteMembers=[
  {userId:'owner',personId:null,name:'Marc Delcourt',roleCode:'OWNER',owner:true,profileName:'Patron',scope:'Toute l’entreprise',permissions:[],projectIds:[],configured:false},
  {userId:'anthony',personId:'11',name:'Anthony Simon',roleCode:'WORKER',owner:false,profileName:'Ouvrier',scope:'Ses chantiers uniquement',permissions:[
    'workspace.view',
    'projects.view.assigned',
    'tasks.view.assigned',
    'tasks.update.assigned',
    'messages.view',
    'messages.send',
    'assets.view',
    'documents.view.assigned'
  ],projectIds:['1'],configured:false}
];
const people=[{id:11,name:'Anthony Simon',role:'Ouvrier',trade:'Couvreur',initials:'AS',color:'teal'}];
const ctx={
  console,
  structuredClone,
  queueMicrotask,
  sessionAccessKey:'pending',
  company:{manager:'Marc Delcourt'},
  people,
  tabs2:[['planning','Accueil'],['permissions','Droits d’accès']],
  view:'home',
  socleCurrentAccess:{userId:'anthony',roleCode:'WORKER'},
  render(){},
  toast(){},
  scheduleSave(){},
  restoreWorkspace(){},
  workspaceSnapshot(){return JSON.stringify({})},
  showPersonDossier(){},
  getPerson(id){return people.find(person=>person.id===id)},
  esc:value=>String(value),
  jsString:value=>String(value).replaceAll("'","\\'"),
  heading:()=>'',
  document:{querySelector(){return null}},
  serverJson:async()=>({members:remoteMembers}),
  fetch:async()=>({ok:true,json:async()=>({members:remoteMembers})})
};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../web/permissions.js',import.meta.url),'utf8'),ctx);
await vm.runInContext('loadServerAccess()',ctx);

assert.equal(vm.runInContext("accessAssignments['person:11'].modules.planning.view",ctx),true,'workspace.view ouvre l’accueil');
assert.equal(vm.runInContext("accessAssignments['person:11'].modules.jobs.view",ctx),true,'projects.view.assigned ouvre les chantiers');
assert.equal(vm.runInContext("accessAssignments['person:11'].modules.messages.view",ctx),true,'messages.view ouvre Messages');
assert.equal(vm.runInContext("accessAssignments['person:11'].modules.actions.view",ctx),true,'tasks.view.assigned ouvre les tâches');
assert.equal(vm.runInContext("accessAssignments['person:11'].modules.fleet.view",ctx),true,'assets.view ouvre le matériel');

assert.equal(vm.runInContext("accessAssignments['person:11'].modules.quotes.view",ctx),false,'Un profil deviné ne doit pas ouvrir Devis sans quotes.view');
assert.equal(vm.runInContext("accessAssignments['person:11'].modules.documents.view",ctx),false,'documents.view.assigned ne doit pas contourner documents.secure.view');
assert.equal(vm.runInContext("accessAssignments['person:11'].modules.accounting.view",ctx),false,'La comptabilité reste fermée sans permission serveur');
assert.equal(vm.runInContext("accessAssignments['person:11'].modules.people.view",ctx),false,'Les RH restent fermées sans permission sensible');

vm.runInContext("applyCurrentServerAccess(serverAccessMembers.find(member=>member.userId==='anthony'))",ctx);
assert.equal(vm.runInContext("sessionAccessKey",ctx),'person:11','La session active doit suivre le compte serveur');
assert.equal(vm.runInContext("accessAssignments.owner.modules.accounting.view",ctx),true,'Le Patron garde son accès complet');

console.log('access-ui-server-authority-22: 11 assertions réussies');
