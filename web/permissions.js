// Access-control demo: role presets with per-person adjustments.
const accessModules=[
  {key:'planning',label:'Planning',detail:'Affectations, disponibilités et organisation du terrain'},
  {key:'people',label:'Personnel & équipes',detail:'Dossiers individuels, contrats et compétences'},
  {key:'jobs',label:'Chantiers',detail:'Heures, matériaux, photos et remarques'},
  {key:'messages',label:'Messages',detail:'Conversations internes, équipes et chantiers'},
  {key:'fleet',label:'Biens & matériel',detail:'Véhicules, carburant, outillage et réparations'},
  {key:'quotes',label:'Devis & fiches d’exécution',detail:'Devis complets ou version terrain sans prix'},
  {key:'accounting',label:'Comptabilité',detail:'Factures, TVA, coûts et rentabilité'},
  {key:'news',label:'Actualités & règles',detail:'Veille, échéances et décisions'},
  {key:'actions',label:'Administratif & alertes',detail:'Actions générales et suivis à traiter'},
  {key:'documents',label:'Documents',detail:'Recherche et classement transversal'},
  {key:'company',label:'Entreprise',detail:'Identité, banque, assurances et interlocuteurs'},
  {key:'permissions',label:'Droits d’accès',detail:'Profils et permissions des utilisateurs'}
];

const sensitiveAccess=[
  {key:'quotePrices',label:'Prix des devis',detail:'Prix unitaires, totaux et acomptes'},
  {key:'jobMargins',label:'Coûts et marges des chantiers',detail:'Main-d’œuvre, achats et rentabilité'},
  {key:'payroll',label:'Coût du personnel',detail:'Salaires, charges et coût horaire'},
  {key:'privateDocuments',label:'Documents et remarques confidentiels',detail:'Notes patron, contrats et pièces sensibles'},
  {key:'manageAccess',label:'Modifier les permissions',detail:'Créer des profils et changer les droits des autres'}
];

const accessProfiles={
  'Patron':{
    scope:'Toute l’entreprise',
    modules:'all',
    sensitive:'all'
  },
  'Administration':{
    scope:'Toute l’entreprise',
    modules:{planning:'v',people:'vam',jobs:'v',messages:'vam',fleet:'vm',quotes:'vam',accounting:'vam',news:'vam',actions:'vam',documents:'vam',company:'vm',permissions:'v'},
    sensitive:['quotePrices','jobMargins','payroll','privateDocuments']
  },
  'Chef d’équipe':{
    scope:'Son équipe et ses chantiers',
    modules:{planning:'v',people:'v',jobs:'vam',messages:'va',fleet:'va',quotes:'v',accounting:'',news:'v',actions:'vam',documents:'va',company:'',permissions:''},
    sensitive:[]
  },
  'Ouvrier':{
    scope:'Ses chantiers uniquement',
    modules:{planning:'v',people:'',jobs:'va',messages:'va',fleet:'va',quotes:'',accounting:'',news:'v',actions:'va',documents:'',company:'',permissions:''},
    sensitive:[]
  },
  'Comptable':{
    scope:'Toute l’entreprise',
    modules:{planning:'',people:'v',jobs:'v',messages:'v',fleet:'v',quotes:'v',accounting:'vam',news:'v',actions:'v',documents:'va',company:'v',permissions:''},
    sensitive:['quotePrices','jobMargins','payroll','privateDocuments']
  }
};

let selectedAccessKey='owner';
let accessAssignments={};
let serverAccessReady=false,serverAccessLoading=false,serverAccessError='',serverAccessMembers=[],serverProjectAccess={};
let serverInvitationRoles=[],serverInvitations=[],serverInvitationRoster=[],serverInvitationRosterOrganizationId='',serverInvitationRosterOrganizationName='',serverInvitationRosterCount=0,serverInvitationError='',serverInvitationLoading=false,serverInvitationEmailEnabled=false,serverInvitationManualTestEnabled=false,serverInvitationWorkerOnly=false,serverInvitationLink='';
const serverAccessSaveQueues={};

function serverMemberForPerson(personId){return serverAccessMembers.find(member=>!member.owner&&String(member.personId||'')===String(personId))}
function serverOwnerMember(){return serverAccessMembers.find(member=>member.owner)}
function assignmentFromServer(member,remote){
  const profile=remote?.owner?'Patron':accessProfiles[remote?.profileName]?remote.profileName:defaultProfileFor(member),assignment=permissionSet(profile),codes=new Set(remote?.permissions||[]);
  assignment.scope=remote?.scope||assignment.scope;
  if(!remote?.owner){
    const hasAny=(...items)=>items.some(code=>codes.has(code)),configured=Boolean(remote?.configured);
    accessModules.forEach(module=>{
      const prefix=`ui.module.${module.key}.`,ui={view:codes.has(prefix+'view'),add:codes.has(prefix+'add'),edit:codes.has(prefix+'edit')};
      if(!configured){
        const derived={
          planning:{view:hasAny('workspace.view','projects.view.all','projects.view.assigned'),add:hasAny('planning.assignments.manage'),edit:hasAny('planning.assignments.manage')},
          personal:{view:hasAny('workspace.view'),add:hasAny('time_entries.create.own','time_entries.correction.request'),edit:hasAny('time_entries.create.own','time_entries.correction.request')},
          jobs:{view:hasAny('projects.view.all','projects.view.assigned'),add:hasAny('project_materials.create','project_notes.create'),edit:hasAny('project_execution.edit')},
          messages:{view:hasAny('messages.view'),add:hasAny('messages.send'),edit:hasAny('messages.manage')},
          people:{view:hasAny('hr.sensitive.view'),add:false,edit:false},
          quotes:{view:hasAny('quotes.view'),add:hasAny('quotes.create'),edit:hasAny('quotes.edit')},
          gallery:{view:false,add:false,edit:false},
          fleet:{view:hasAny('assets.view','stock.view','deliveries.view'),add:hasAny('assets.manage','stock.items.manage','stock.move','deliveries.receive'),edit:hasAny('assets.manage','stock.items.manage','stock.move','deliveries.receive')},
          accounting:{view:hasAny('accounting.view','financial.dashboard.view','expenses.view','invoices.view'),add:hasAny('expenses.create','payments.create','credit_notes.create','supplier_allocations.create'),edit:hasAny('payments.create','credit_notes.create','supplier_allocations.create','supplier_allocations.cancel')},
          actions:{view:hasAny('tasks.view.assigned'),add:hasAny('tasks.comment.create','tasks.manage.project'),edit:hasAny('tasks.update.assigned','tasks.manage.project')},
          documents:{view:hasAny('documents.secure.view'),add:hasAny('documents.secure.manage'),edit:hasAny('documents.secure.manage')},
          company:{view:hasAny('company.settings.view'),add:false,edit:false},
          permissions:{view:hasAny('permissions.view'),add:hasAny('permissions.manage'),edit:hasAny('permissions.manage')}
        }[module.key]||{view:false,add:false,edit:false};
        assignment.modules[module.key]=derived;
      }else assignment.modules[module.key]=ui;
      if(!assignment.modules[module.key].view){assignment.modules[module.key].add=false;assignment.modules[module.key].edit=false}
    });
    sensitiveAccess.forEach(item=>{
      const derived={quotePrices:'quotes.prices.view',jobMargins:'margins.view',payroll:'hr.sensitive.view',privateDocuments:'documents.secure.confidential',manageAccess:'permissions.manage',paySlips:'hr.sensitive.view'}[item.key];
      assignment.sensitive[item.key]=remote?.configured?codes.has(`ui.sensitive.${item.key}`):Boolean(derived&&codes.has(derived));
    });
  }
  if(typeof fieldDefaults==='function')assignment.fieldActions=fieldDefaults(profile);
  if(!remote?.owner&&typeof fieldPermissions!=='undefined'&&Array.isArray(fieldPermissions))for(const item of fieldPermissions){
    const derived={logHours:['time_entries.create.own','time_entries.create.team'],requestTimeCorrection:['time_entries.correction.request'],approveTimeCorrection:['time_entries.correction.review'],scheduleTeams:['planning.assignments.manage'],manageTeams:[],logFuel:['fuel.create'],reportAssetIssue:['asset_issues.create'],manageAssets:['assets.manage'],consumeStock:['stock.consume.assigned'],manageAlerts:[],manageSharedCalendar:[],managePeople:[],removePeople:[],paymentReminders:[],markPayments:['payments.create'],uploadPaySlips:[],viewProfitability:['margins.view']}[item.key]||[];
    assignment.fieldActions[item.key]=remote?.configured?codes.has(`ui.field.${item.key}`):derived.some(code=>codes.has(code));
  }
  if(typeof ACCESS_MODEL_VERSION!=='undefined')assignment.modelVersion=ACCESS_MODEL_VERSION;
  assignment.disabled=false;
  return assignment;
}
function applyServerAccessMembers(members){
  serverAccessMembers=Array.isArray(members)?members:[];serverProjectAccess={};
  const all=accessMembers();
  for(const member of all){const remote=member.owner?serverOwnerMember():member.serverUserId?serverAccessMembers.find(item=>item.userId===member.serverUserId):null;if(!remote)continue;accessAssignments[member.key]=assignmentFromServer(member,remote);serverProjectAccess[member.key]=new Set((remote.projectIds||[]).map(String));}
  ensureAccessAssignments();
}
function applyCurrentServerAccess(remote){
  if(!remote||!remote.userId)return;
  serverAccessMembers=[...serverAccessMembers.filter(item=>item.userId!==remote.userId),remote];
  const members=accessMembers(),member=remote.owner?members.find(item=>item.owner):remote.personId?(members.find(item=>item.key==='person:'+remote.personId)||members.find(item=>item.serverUserId===remote.userId)):members.find(item=>item.serverUserId===remote.userId);
  if(!member)return;
  accessAssignments[member.key]=assignmentFromServer(member,remote);serverProjectAccess[member.key]=new Set((remote.projectIds||[]).map(String));ensureAccessAssignments();
  if(typeof sessionAccessKey!=='undefined')sessionAccessKey=remote.owner?'owner':member.key;
}
globalThis.applyCurrentServerAccess=applyCurrentServerAccess;
async function loadServerAccess(force=false){
  if(serverAccessLoading||serverAccessReady&&!force)return;serverAccessLoading=true;serverAccessError='';
  try{const data=await serverJson('/api/access-control');applyServerAccessMembers(data.members);serverAccessReady=true;if(isCurrentServerOwner())await loadServerInvitations()}
  catch(error){serverAccessError=error.message||'Droits serveur indisponibles.';serverAccessReady=false}
  finally{serverAccessLoading=false;if(view==='permissions')render()}
}
function isCurrentServerOwner(){const access=globalThis.socleCurrentAccess||{};return access.roleCode==='OWNER'||serverAccessMembers.some(member=>member.owner&&String(member.userId)===String(access.userId||''))}
async function loadServerInvitations(){if(!isCurrentServerOwner()){serverInvitationLink='';serverInvitationRoster=[];serverInvitationRosterOrganizationId='';serverInvitationRosterOrganizationName='';serverInvitationRosterCount=0;return}if(serverInvitationLoading)return;serverInvitationLoading=true;serverInvitationError='';try{const [roles,invites,roster]=await Promise.all([serverJson('/api/roles'),serverJson('/api/invitations'),serverJson('/api/invitation-roster')]),activeOrganizationId=String(globalThis.socleCurrentOrganizationId||'');if(activeOrganizationId&&String(roster.organizationId||'')!==activeOrganizationId)throw Error('Le roster reçu ne correspond pas à l’entreprise active. Rechargez la page.');serverInvitationWorkerOnly=invites.manualTestWorkerOnly===true;serverInvitationRoles=(roles.roles||[]).filter(role=>['TEAM_LEAD','WORKER','ACCOUNTING'].includes(role.code)&&(!serverInvitationWorkerOnly||role.code==='WORKER'));serverInvitations=invites.invitations||[];serverInvitationRoster=Array.isArray(roster.people)?roster.people:[];serverInvitationRosterOrganizationId=String(roster.organizationId||'');serverInvitationRosterOrganizationName=String(roster.organizationName||'');serverInvitationRosterCount=Number(roster.rosterCount||0);serverInvitationEmailEnabled=invites.emailDeliveryEnabled===true;serverInvitationManualTestEnabled=invites.manualTestEnabled===true}catch(error){serverInvitationError=error.message||'Invitations indisponibles.';serverInvitationRoster=[];serverInvitationRosterOrganizationId='';serverInvitationRosterOrganizationName='';serverInvitationRosterCount=0;serverInvitationEmailEnabled=false;serverInvitationManualTestEnabled=false;serverInvitationWorkerOnly=false}finally{serverInvitationLoading=false;if(view==='permissions')render()}}
async function createOwnerInvitation(event){event.preventDefault();if(!isCurrentServerOwner())return;const form=event.currentTarget,data=Object.fromEntries(new FormData(form));data.personId=String(data.personId||'').trim()||null;data.deliveryMode=String(data.deliveryMode||'email');data.expiresInDays=7;const button=form.querySelector('button[type="submit"]');button.disabled=true;try{const result=await serverJson('/api/invitations',{method:'POST',body:JSON.stringify(data)});if(result.deliveryMode==='manual-test'){const path=String(result.activationPath||'');if(!new RegExp('^/invite/activate#[A-Fa-f0-9-]{40,100}$').test(path))throw Error('Le lien de test n’a pas pu être affiché de façon sûre.');serverInvitationLink=path;toast('Invitation de test créée. Aucun e-mail envoyé. Copiez le lien ci-dessous.')}else{serverInvitationLink='';toast('Invitation envoyée par e-mail.')}form.reset();await loadServerInvitations()}catch(error){toast(error.message||'Invitation refusée.')}finally{button.disabled=false}}
async function copyOwnerInvitationLink(){if(!isCurrentServerOwner()||!serverInvitationLink)return;try{await navigator.clipboard.writeText(location.origin+serverInvitationLink);toast('Lien d’activation copié.')}catch{toast('Copie indisponible. Sélectionnez le lien affiché et copiez-le manuellement.')}}
function updateInvitationRosterRequirement(select){const roleCode=select?.selectedOptions?.[0]?.dataset?.roleCode||'',person=document.querySelector('#owner-invite-person');if(!person)return;person.required=false;if(roleCode==='ACCOUNTING')person.value=''}
async function revokeOwnerInvitation(invitationId){if(!isCurrentServerOwner())return;try{await serverJson('/api/invitations/'+encodeURIComponent(invitationId),{method:'DELETE'});toast('Invitation révoquée.');await loadServerInvitations()}catch(error){toast(error.message||'Révocation refusée.')}}
function accessPayload(key){const assignment=accessAssignments[key],projects=[...(serverProjectAccess[key]||new Set())];return {profileName:assignment.profile,scope:assignment.scope,modules:assignment.modules,sensitive:assignment.sensitive,fieldActions:assignment.fieldActions||{},projectIds:projects}}
function persistServerAccess(key,message='Droits enregistrés côté serveur.'){
  const member=accessMembers().find(item=>item.key===key);if(!member||member.owner)return Promise.resolve();if(!member.serverUserId){toast('Aucun compte utilisateur actif n’est lié à cette personne.');return Promise.resolve()}
  serverAccessSaveQueues[key]=(serverAccessSaveQueues[key]||Promise.resolve()).catch(()=>{}).then(async()=>{try{const data=await serverJson('/api/access-control/'+encodeURIComponent(member.serverUserId),{method:'PUT',body:JSON.stringify(accessPayload(key))});applyServerAccessMembers(data.members);toast(message);if(view==='permissions')render()}catch(error){toast(error.message||'Enregistrement des droits refusé.');await loadServerAccess(true)}});return serverAccessSaveQueues[key]
}
function scopeNeedsProjects(scope){return !['Toute l’entreprise','Tous les chantiers','Comptabilité et pièces administratives','Matériel et besoins du terrain','Ses propres informations'].includes(scope)}
function toggleServerProject(key,projectId,enabled){if(!serverProjectAccess[key])serverProjectAccess[key]=new Set();enabled?serverProjectAccess[key].add(String(projectId)):serverProjectAccess[key].delete(String(projectId));persistServerAccess(key,'Périmètre chantier enregistré côté serveur.')}


function permissionSet(profileName){
  const profile=accessProfiles[profileName]||accessProfiles.Ouvrier;
  const modules={};
  accessModules.forEach(module=>{
    const code=profile.modules==='all'?'vam':profile.modules[module.key]||'';
    modules[module.key]={view:code.includes('v'),add:code.includes('a'),edit:code.includes('m')};
  });
  const sensitive={};
  sensitiveAccess.forEach(item=>sensitive[item.key]=profile.sensitive==='all'||profile.sensitive.includes(item.key));
  return {profile:profileName,scope:profile.scope,modules,sensitive};
}

function accessMembers(){
  const ownerRemote=serverOwnerMember(),used=new Set();if(ownerRemote)used.add(ownerRemote.userId);
  const owner={key:'owner',name:company.manager||ownerRemote?.name||'Propriétaire',subtitle:'Propriétaire du compte',initials:'LM',color:'teal',owner:true,serverUserId:ownerRemote?.userId||''};
  const peopleMembers=people.map(p=>{const remote=serverMemberForPerson(p.id);if(remote)used.add(remote.userId);return {key:'person:'+p.id,name:p.name,subtitle:[p.role,p.trade].filter(Boolean).join(' · '),initials:p.initials,color:p.color,owner:false,id:p.id,serverUserId:remote?.userId||'',serverRoleCode:remote?.roleCode||''}});
  const serverOnly=serverAccessMembers.filter(remote=>!remote.owner&&!used.has(remote.userId)).map(remote=>({key:'server:'+remote.userId,name:remote.name||remote.email||remote.userId,subtitle:remote.email||remote.roleCode,initials:(remote.name||remote.userId).split(' ').map(part=>part[0]).slice(0,2).join('').toUpperCase(),color:'teal',owner:false,serverUserId:remote.userId,serverRoleCode:remote.roleCode}));
  return [owner,...peopleMembers,...serverOnly];
}

function defaultProfileFor(member){
  if(member.owner)return 'Patron';
  const serverRole=String(member.serverRoleCode||'');
  if(serverRole==='TEAM_LEAD')return 'Chef d’équipe';
  if(serverRole==='WORKER')return 'Ouvrier';
  if(serverRole==='ACCOUNTING')return 'Comptable';
  const p=getPerson(member.id);
  if(p?.role==='Administration'||p?.category==='Employé')return 'Administration';
  if((p?.role||'').toLowerCase().includes('chef'))return 'Chef d’équipe';
  return 'Ouvrier';
}

function normaliseAssignment(member,current){
  if(member.owner)return permissionSet('Patron');
  const profile=accessProfiles[current?.profile]?current.profile:defaultProfileFor(member);
  const fallback=permissionSet(profile);
  const out={profile,scope:current?.scope||fallback.scope,modules:{},sensitive:{}};
  accessModules.forEach(module=>{
    const value=current?.modules?.[module.key]||fallback.modules[module.key];
    out.modules[module.key]={view:Boolean(value.view),add:Boolean(value.add),edit:Boolean(value.edit)};
    if(!out.modules[module.key].view){out.modules[module.key].add=false;out.modules[module.key].edit=false}
  });
  sensitiveAccess.forEach(item=>out.sensitive[item.key]=Boolean(current?.sensitive?.[item.key]??fallback.sensitive[item.key]));
  return out;
}

function ensureAccessAssignments(){
  const current=accessAssignments&&typeof accessAssignments==='object'?accessAssignments:{};
  const next={};
  accessMembers().forEach(member=>next[member.key]=normaliseAssignment(member,current[member.key]));
  accessAssignments=next;
  if(!accessAssignments[selectedAccessKey])selectedAccessKey='owner';
}

ensureAccessAssignments();
const restoreAccessBase=restoreWorkspace;
restoreWorkspace=function(state){restoreAccessBase(state);accessAssignments=state.accessAssignments||{};ensureAccessAssignments()};
const snapshotAccessBase=workspaceSnapshot;
workspaceSnapshot=function(){ensureAccessAssignments();const state=JSON.parse(snapshotAccessBase());state.accessAssignments=accessAssignments;return JSON.stringify(state)};

if(!tabs2.some(tab=>tab[0]==='permissions')){
  const companyIndex=tabs2.findIndex(tab=>tab[0]==='company');
  tabs2.splice(companyIndex<0?tabs2.length:companyIndex,0,['permissions','Droits d’accès']);
}

function accessFace(member){const initials=member?.initials||String(member?.name||'?').split(' ').map(part=>part[0]).slice(0,2).join('');return `<span class="person-avatar ${esc(member?.color||'teal')}">${typeof soclePersonAvatar==='function'?soclePersonAvatar(member):esc(initials)}</span>`}
function accessSummary(assignment){
  const visible=accessModules.filter(module=>assignment.modules[module.key].view).length;
  const editable=accessModules.filter(module=>assignment.modules[module.key].edit).length;
  return {visible,editable};
}

function chooseAccessMember(key){selectedAccessKey=key;render()}

function changeAccessProfile(key,profile){
  if(key==='owner'||!accessProfiles[profile])return;
  accessAssignments[key]=permissionSet(profile);if(typeof fieldDefaults==='function')accessAssignments[key].fieldActions=fieldDefaults(profile);
  render();persistServerAccess(key,'Profil appliqué et enregistré côté serveur.');
}

function changeAccessScope(key,scope){
  if(key==='owner')return;
  accessAssignments[key].scope=scope;
  render();persistServerAccess(key,'Périmètre visible enregistré côté serveur.');
}

function toggleModuleAccess(key,moduleKey,action,enabled){
  if(key==='owner'||!accessAssignments[key]?.modules[moduleKey])return;
  const permission=accessAssignments[key].modules[moduleKey];
  permission[action]=Boolean(enabled);
  if(action==='view'&&!enabled){permission.add=false;permission.edit=false}
  if((action==='add'||action==='edit')&&enabled)permission.view=true;
  render();persistServerAccess(key,'Permission enregistrée côté serveur.');
}

function toggleSensitiveAccess(key,permissionKey,enabled){
  if(key==='owner'||!(permissionKey in accessAssignments[key].sensitive))return;
  accessAssignments[key].sensitive[permissionKey]=Boolean(enabled);
  render();persistServerAccess(key,'Accès sensible enregistré côté serveur.');
}

function resetAccessProfile(key){
  if(key==='owner')return;
  accessAssignments[key]=permissionSet(accessAssignments[key].profile);if(typeof fieldDefaults==='function')accessAssignments[key].fieldActions=fieldDefaults(accessAssignments[key].profile);
  render();persistServerAccess(key,'Réglages du profil réappliqués côté serveur.');
}

function previewMemberAccess(key){
  ensureAccessAssignments();
  const member=accessMembers().find(item=>item.key===key),assignment=accessAssignments[key];
  if(!member||!assignment)return;
  const visible=accessModules.filter(module=>assignment.modules[module.key].view);
  const hidden=accessModules.filter(module=>!assignment.modules[module.key].view);
  const privateItems=sensitiveAccess.filter(item=>assignment.sensitive[item.key]);
  modal('Aperçu de l’accès · '+member.name,`<div class="access-preview-head">${accessFace(member)}<div><span class="badge">${esc(assignment.profile)}</span><h3>${esc(assignment.scope)}</h3></div></div><section class="access-preview-section"><p class="form-section-title">Rubriques visibles</p><div class="access-preview-modules">${visible.map(module=>{const p=assignment.modules[module.key],actions=['Voir',p.add?'Ajouter':'',p.edit?'Modifier':''].filter(Boolean).join(' · ');return `<div><strong>${esc(module.label)}</strong><span>${actions}</span></div>`}).join('')||'<p class="person-empty">Aucune rubrique visible.</p>'}</div></section><section class="access-preview-section"><p class="form-section-title">Données sensibles accessibles</p>${privateItems.length?`<div class="training-tags">${privateItems.map(item=>`<span>${esc(item.label)}</span>`).join('')}</div>`:'<p class="person-empty">Aucune donnée sensible.</p>'}</section>${hidden.length?`<p class="notice"><strong>Masqué :</strong> ${hidden.map(module=>esc(module.label)).join(', ')}.</p>`:''}<p class="help-line">Les comptes actifs sont contrôlés côté serveur. Les personnes sans compte restent visibles uniquement comme préparation d’accès.</p><div class="modal-actions"><button class="btn primary" onclick="closeModal()">Fermer l’aperçu</button></div>`);
}

function permissionsView(){
  if(!serverAccessReady){if(!serverAccessLoading)queueMicrotask(()=>loadServerAccess());return heading('Accès & permissions','Le patron choisit précisément ce que chaque personne peut voir et faire.',false)+`<section class="panel"><h2>${serverAccessError?'Connexion aux droits impossible':'Chargement des droits serveur…'}</h2><p class="subtle">${esc(serverAccessError||'Lecture des rôles, permissions et périmètres chantier.')}</p>${serverAccessError?'<button class="btn primary" onclick="loadServerAccess(true)">Réessayer</button>':''}</section>`}
  ensureAccessAssignments();
  const members=accessMembers(),member=members.find(item=>item.key===selectedAccessKey)||members[0],assignment=accessAssignments[member.key],serverLocked=!member.owner&&!member.serverUserId,locked=member.owner||serverLocked,summary=accessSummary(assignment);
  const scopes=[...new Set(['Ses propres informations','Ses chantiers uniquement','Son équipe et ses chantiers','Toute l’entreprise',...Object.values(accessProfiles).map(profile=>profile.scope)])];
  const invitationDeliveryOptions=serverInvitationEmailEnabled&&serverInvitationManualTestEnabled?'<label>Mode<select name="deliveryMode"><option value="email">Envoi d’e-mail</option><option value="manual-test">Test manuel — sans e-mail</option></select></label>':`<input type="hidden" name="deliveryMode" value="${serverInvitationManualTestEnabled?'manual-test':'email'}">`;
  const invitationPanel=isCurrentServerOwner()?`<section class="panel owner-invitation-panel"><div class="panel-head"><div><p class="eyebrow">NOUVEAU COMPTE</p><h2>Inviter un utilisateur</h2></div><span class="badge">${serverInvitationManualTestEnabled?(serverInvitationWorkerOnly?'TEST OUVRIER — V3':'TEST MANUEL'):'E-mail sécurisé'}</span></div><p class="subtle">Seul le propriétaire peut inviter. Le compte et son adhésion seront créés après activation. Le mode manuel, s’il est activé, est réservé à l’environnement de test explicitement autorisé et n’envoie aucun e-mail ; chaque lien reste à usage unique et lié à l’adresse saisie.</p>${serverInvitationError?`<p class="access-locked-message">${esc(serverInvitationError)}</p>`:''}<form id="owner-invite-form" class="owner-invitation-form" onsubmit="createOwnerInvitation(event)"><label>Adresse e-mail<input name="email" type="email" autocomplete="off" maxlength="254" required></label><label>Rôle<select name="roleId" required onchange="updateInvitationRosterRequirement(this)">${serverInvitationRoles.map((role,index)=>`<option value="${esc(role.id)}" data-role-code="${esc(role.code)}" ${index===0?'selected':''}>${esc(role.name||role.code)}</option>`).join('')}</select></label><label>Personne du roster — ${esc(serverInvitationRosterOrganizationName||'entreprise active')}<select id="owner-invite-person" name="personId"><option value="">Aucune — compte séparé</option>${serverInvitationRoster.map(person=>`<option value="${esc(person.id)}">${esc(person.name||String(person.id))}${person.role?' · '+esc(person.role):''}</option>`).join('')}</select><small class="subtle">${serverInvitationRoster.length} personne(s) disponible(s) sur ${serverInvitationRosterCount} active(s) pour ${esc(serverInvitationRosterOrganizationName||'l’entreprise active')}.</small></label>${invitationDeliveryOptions}<button class="btn primary" type="submit" ${serverInvitationRoles.length&&(serverInvitationEmailEnabled||serverInvitationManualTestEnabled)?'':'disabled'}>${serverInvitationManualTestEnabled&&!serverInvitationEmailEnabled?'Créer le lien de test':'Envoyer l’invitation'}</button></form>${serverInvitationLink?`<div class="owner-invitation-manual-result" role="status"><p><strong>Lien d’activation de test — aucun e-mail envoyé.</strong></p><label>Lien secret à usage unique<input type="text" readonly autocomplete="off" spellcheck="false" value="${esc(location.origin+serverInvitationLink)}"></label><button class="btn" type="button" onclick="copyOwnerInvitationLink()">Copier le lien</button><p class="subtle">Ce lien n’est affiché qu’après sa création, dans la session OWNER. Ouvrez-le dans un navigateur ou une fenêtre privée déconnectée de l’OWNER. Le serveur ne permet pas de le récupérer une seconde fois.</p></div>`:''}${serverInvitations.length?`<div class="owner-invitation-list"><p class="eyebrow">INVITATIONS RÉCENTES</p>${serverInvitations.filter(invite=>invite.status==='pending').map(invite=>`<div><span><strong>${esc(invite.email)}</strong><small>${esc(invite.role_name||invite.role_code||'')} · expire le ${esc(invite.expires_at||'')}</small></span><button class="link" onclick="revokeOwnerInvitation('${jsString(invite.id)}')">Révoquer</button></div>`).join('')||'<p class="person-empty">Aucune invitation en attente.</p>'}</div>`:''}</section>`:'';
  const projectPanel=!member.owner&&member.serverUserId&&scopeNeedsProjects(assignment.scope)?`<section class="panel access-project-scope"><div class="panel-head"><div><p class="eyebrow">PÉRIMÈTRE CHANTIERS</p><h2>Chantiers accessibles</h2></div><span class="badge">Contrôle serveur</span></div><div class="sensitive-grid">${jobs.map(job=>`<label><span><strong>${esc(job.name)}</strong><small>${esc(job.reference||job.town||'')}</small></span><input type="checkbox" ${(serverProjectAccess[member.key]||new Set()).has(String(job.id))?'checked':''} onchange="toggleServerProject('${jsString(member.key)}','${jsString(job.id)}',this.checked)"><i aria-hidden="true"></i></label>`).join('')||'<p class="person-empty">Aucun chantier disponible.</p>'}</div></section>`:'';
  return heading('Accès & permissions','Le patron choisit précisément ce que chaque personne peut voir et faire.',false)+`
    <section class="access-owner-note"><div><span class="access-lock">✓</span><div><strong>Le compte patron garde toujours tous les droits.</strong><span>Les autres accès peuvent partir d’un profil, puis être adaptés personne par personne.</span></div></div><span class="badge green">Contrôle du patron</span></section>
    ${invitationPanel}
    <div class="access-layout">
      <aside class="panel access-directory">
        <div class="access-directory-head"><p class="eyebrow">UTILISATEURS</p><h2>${members.length} accès</h2></div>
        <div class="access-member-list">${members.map(item=>{const itemAssignment=accessAssignments[item.key];return `<button class="${item.key===member.key?'selected':''}" onclick="chooseAccessMember('${jsString(item.key)}')">${accessFace(item)}<span><strong>${esc(item.name)}</strong><small>${esc(item.subtitle||'')}</small><em>${esc(itemAssignment.profile)}</em></span>${item.owner?'<b title="Accès total">✓</b>':'<i>›</i>'}</button>`}).join('')}</div>
      </aside>
      <div class="access-editor">
        <section class="panel access-profile-card">
          <div class="access-profile-person">${accessFace(member)}<div><p class="eyebrow">ACCÈS DE</p><h2>${esc(member.name)}</h2><span>${esc(member.subtitle||'')}</span></div><button class="btn" onclick="previewMemberAccess('${jsString(member.key)}')">Voir son aperçu</button></div>
          <div class="access-profile-fields">
            <label>Profil de départ<select ${locked?'disabled':''} onchange="changeAccessProfile('${jsString(member.key)}',this.value)">${Object.keys(accessProfiles).map(profile=>`<option ${profile===assignment.profile?'selected':''} ${!locked&&profile==='Patron'?'disabled':''}>${esc(profile)}</option>`).join('')}</select></label>
            <label>Périmètre visible<select ${locked?'disabled':''} onchange="changeAccessScope('${jsString(member.key)}',this.value)">${scopes.map(scope=>`<option ${scope===assignment.scope?'selected':''}>${esc(scope)}</option>`).join('')}</select></label>
            <div class="access-profile-stats"><span><b>${summary.visible}</b> rubriques visibles</span><span><b>${summary.editable}</b> modifiables</span></div>
          </div>
          ${member.owner?'<p class="access-locked-message">Accès total verrouillé : le propriétaire ne peut pas se retirer ses propres droits.</p>':serverLocked?'<p class="access-locked-message">Cette personne n’a pas encore de compte utilisateur actif. Les droits serveur seront configurables après création/invitation de son compte.</p>':`<div class="access-reset"><span>Les changements ci-dessous sont enregistrés dans le RBAC serveur pour ${esc(member.name)}.</span><button class="link" onclick="resetAccessProfile('${jsString(member.key)}')">Réappliquer le profil ${esc(assignment.profile)}</button></div>`}
        </section>
        ${projectPanel}
        <section class="panel permission-panel">
          <div class="panel-head"><div><p class="eyebrow">RUBRIQUES DU LOGICIEL</p><h2>Ce que cette personne peut faire</h2></div><span class="subtle">Décocher « Voir » masque toute la rubrique.</span></div>
          <div class="permission-table" tabindex="0" role="region" aria-label="Droits par rubrique : voir, ajouter et modifier">
            <div class="permission-row permission-head"><span>Rubrique</span><span>Voir</span><span>Ajouter</span><span>Modifier</span></div>
            ${accessModules.map(module=>{const p=assignment.modules[module.key];return `<div class="permission-row"><span><strong>${esc(module.label)}</strong><small>${esc(module.detail)}</small></span>${['view','add','edit'].map(action=>`<label><input type="checkbox" ${p[action]?'checked':''} ${locked?'disabled':''} aria-label="${action==='view'?'Voir':action==='add'?'Ajouter dans':'Modifier'} ${esc(module.label)}" onchange="toggleModuleAccess('${jsString(member.key)}','${jsString(module.key)}','${jsString(action)}',this.checked)"><i aria-hidden="true"></i></label>`).join('')}</div>`}).join('')}
          </div>
        </section>
        <section class="panel sensitive-panel">
          <div class="panel-head"><div><p class="eyebrow">DONNÉES SENSIBLES</p><h2>Informations à protéger</h2></div><span class="badge warn">Réservé selon le rôle</span></div>
          <div class="sensitive-grid">${sensitiveAccess.map(item=>`<label><span><strong>${esc(item.label)}</strong><small>${esc(item.detail)}</small></span><input type="checkbox" ${assignment.sensitive[item.key]?'checked':''} ${locked?'disabled':''} onchange="toggleSensitiveAccess('${jsString(member.key)}','${jsString(item.key)}',this.checked)"><i aria-hidden="true"></i></label>`).join('')}</div>
        </section>
        <p class="notice">Pour les comptes actifs, les changements de cette page sont enregistrés dans <strong>role_permissions</strong> et <strong>project_access</strong> côté serveur. Masquer un bouton reste un confort d’interface, jamais une sécurité.</p>
      </div>
    </div>`;
}

const showPersonAccessBase=showPersonDossier;
showPersonDossier=function(id){
  showPersonAccessBase(id);
  const person=getPerson(id),root=document.querySelector('#modalbody .modal-inner');
  root?.insertAdjacentHTML?.('beforeend',`<section class="person-section"><div class="section-heading"><div><h3>Droits d’accès</h3><span class="subtle">Profil et rubriques visibles dans le logiciel</span></div><button class="btn" onclick="selectedAccessKey='person:${id}';closeModal();navigate('permissions')">Gérer les droits</button></div><p class="person-empty">${esc(accessAssignments['person:'+id]?.profile||defaultProfileFor({id,owner:false}))} · ${esc(accessAssignments['person:'+id]?.scope||'Périmètre à définir')}</p></section>`);
};

const renderAccessBase=render;
render=function(){
  if(view!=='permissions')return renderAccessBase();
  document.querySelector('#nav').innerHTML=tabs2.map(([value,label])=>`<button class="${view===value?'active':''}" ${view===value?'aria-current="page"':''} onclick="navigate('${value}')">${label}</button>`).join('');
  document.querySelector('#main').innerHTML=permissionsView();
  scheduleSave();
};
