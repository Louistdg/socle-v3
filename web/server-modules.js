// Server-backed modules. These screens never use browser state as their source of truth.
if(!tabs2.some(([key])=>key==='messages')){const jobsIndex=tabs2.findIndex(([key])=>key==='jobs');tabs2.splice(jobsIndex+1,0,['messages','Messages'])}
const requestedServerView=new URLSearchParams(location.search).get('view');if(['messages','accounting'].includes(requestedServerView))view=requestedServerView;

const restoreBeforeServerModules=restoreWorkspace;
restoreWorkspace=function(state){restoreBeforeServerModules(state);if(!accessAssignments.owner||accessAssignments.owner.modelVersion!==ACCESS_MODEL_VERSION)migrateAccessModel()};

let activeSocleOrganizationId=localStorage.getItem('socle.activeOrganizationId')||'';
const socleNativeFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=function(input,init={}){
  const preview=globalThis.socleAccessPreview;
  if(!preview?.userId)return socleNativeFetch(input,init);
  let requestUrl;try{requestUrl=new URL(input instanceof Request?input.url:String(input),location.href)}catch{return socleNativeFetch(input,init)}
  if(requestUrl.origin!==location.origin||!requestUrl.pathname.startsWith('/api/'))return socleNativeFetch(input,init);
  const method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  if(!['GET','HEAD'].includes(method))return Promise.resolve(new Response(JSON.stringify({error:'Le mode test des accès est en lecture seule. Quittez-le pour effectuer cette action.'}),{status:403,headers:{'content-type':'application/json;charset=utf-8'}}));
  const headers=new Headers(input instanceof Request?input.headers:undefined);new Headers(init.headers||{}).forEach((value,key)=>headers.set(key,value));headers.set('x-socle-access-preview-user-id',String(preview.userId));
  return socleNativeFetch(input,{...init,headers});
};
function setActiveSocleOrganizationId(value){
  activeSocleOrganizationId=String(value||'');
  if(activeSocleOrganizationId)localStorage.setItem('socle.activeOrganizationId',activeSocleOrganizationId);
  else localStorage.removeItem('socle.activeOrganizationId');
}
async function fetchSocleJson(url,options,organizationId){
  const headers={...(options.body&&!((options.body instanceof FormData))?{'content-type':'application/json'}:{}),...(organizationId?{'x-socle-organization-id':organizationId}:{}),...(options.headers||{})};
  const response=await fetch(url,{cache:'no-store',...options,headers}),data=await response.json().catch(()=>({}));
  return {response,data};
}
async function recoverActiveSocleOrganization(){
  const response=await fetch('/api/organizations',{cache:'no-store'}),data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||'Impossible de vérifier votre entreprise.');
  const organizations=Array.isArray(data.organizations)?data.organizations:[],ids=new Set(organizations.map(item=>String(item.id)));
  const fallback=ids.has(activeSocleOrganizationId)?activeSocleOrganizationId:String(data.activeOrganizationId||organizations[0]?.id||'');
  setActiveSocleOrganizationId(fallback);
  return {data,organizations};
}
async function serverJson(url,options={}){
  const explicitOrganization=Object.prototype.hasOwnProperty.call(options,'socleOrganizationId');
  const {socleOrganizationId,socleSkipOrganization=false,...requestOptions}=options;
  const organizationId=socleSkipOrganization?'':explicitOrganization?String(socleOrganizationId||''):activeSocleOrganizationId;
  let {response,data}=await fetchSocleJson(url,requestOptions,organizationId);
  const method=String(requestOptions.method||'GET').toUpperCase();
  if(!response.ok&&response.status===403&&data.error==='Accès refusé à cette entreprise.'&&!socleSkipOrganization&&!explicitOrganization&&organizationId){
    const previous=activeSocleOrganizationId;
    await recoverActiveSocleOrganization();
    if(['GET','HEAD'].includes(method)&&activeSocleOrganizationId&&activeSocleOrganizationId!==previous)({response,data}=await fetchSocleJson(url,requestOptions,activeSocleOrganizationId));
  }
  if(!response.ok){const error=Error(data.error||'Le serveur ne répond pas.');error.status=response.status;throw error}
  return data;
}
async function serverBlob(url,options={}){
  const explicitOrganization=Object.prototype.hasOwnProperty.call(options,'socleOrganizationId');
  const {socleOrganizationId,socleSkipOrganization=false,...requestOptions}=options;
  const organizationId=socleSkipOrganization?'':explicitOrganization?String(socleOrganizationId||''):activeSocleOrganizationId;
  const send=organization=>fetch(url,{cache:'no-store',...requestOptions,headers:{...(organization?{'x-socle-organization-id':organization}:{}),...(requestOptions.headers||{})}});
  let response=await send(organizationId);
  if(!response.ok&&response.status===403&&!socleSkipOrganization&&!explicitOrganization&&organizationId){
    const data=await response.clone().json().catch(()=>({}));
    if(data.error==='Accès refusé à cette entreprise.'){
      const previous=activeSocleOrganizationId;
      await recoverActiveSocleOrganization();
      if(activeSocleOrganizationId&&activeSocleOrganizationId!==previous)response=await send(activeSocleOrganizationId);
    }
  }
  if(!response.ok){const data=await response.clone().json().catch(()=>({}));const error=Error(data.error||'Le fichier ne peut pas être chargé.');error.status=response.status;throw error}
  return response.blob();
}
async function loadSocleOrganizations(){const {data,organizations}=await recoverActiveSocleOrganization();if(!activeSocleOrganizationId&&data.activeOrganizationId)setActiveSocleOrganizationId(data.activeOrganizationId);return organizations}
async function selectSocleOrganization(organizationId){const candidate=String(organizationId||'');if(!candidate)return;if(globalThis.socleAccessPreview){toast('Quittez le mode test avant de changer d’entreprise.');return}await serverJson('/api/bootstrap',{socleOrganizationId:candidate});setActiveSocleOrganizationId(candidate);serverFinanceState='idle';messageState='idle';location.reload()}
async function createSocleOrganization(event){
  event.preventDefault();
  if(event.currentTarget.dataset.allowed!=='true')return;
  const form=event.currentTarget,input=form.querySelector('[name="organizationName"]'),submit=form.querySelector('button[type="submit"]'),status=form.querySelector('[data-create-organization-status]');
  const name=String(input?.value||'').trim();
  if(!name){if(status){status.hidden=false;status.textContent='Saisissez le nom de l’entreprise.'}input?.focus();return}
  submit.disabled=true;if(status){status.hidden=true;status.textContent=''}let createdOrganization=null;
  try{
    const result=await serverJson('/api/organizations',{method:'POST',body:JSON.stringify({name})});
    createdOrganization=result.organization;
    if(!createdOrganization?.id)throw Error('Le serveur n’a pas confirmé l’identifiant de l’entreprise créée.');
    const organizations=await initOrganizationSwitcher();
    if(!organizations?.some(item=>String(item.id)===String(createdOrganization.id)))throw Error('L’entreprise a été créée mais la liste n’a pas pu être actualisée. Rechargez la page avant de réessayer.');
    const nextStatus=document.querySelector('#organizationSwitcherStatus');
    if(nextStatus){nextStatus.hidden=false;nextStatus.textContent='Entreprise créée. Vous pouvez maintenant la sélectionner.'}
  }catch(error){
    const message=createdOrganization?`Entreprise créée, mais actualisation incomplète. Rechargez la page avant toute nouvelle tentative. (${error.message||'liste indisponible'})`:error.message||'Impossible de créer l’entreprise.';
    const currentStatus=createdOrganization?document.querySelector('#organizationSwitcherStatus'):status;
    if(currentStatus){currentStatus.hidden=false;currentStatus.textContent=message}
  }finally{submit.disabled=false}
}
function syncSocleSessionOrganization(userId,organizationId){
  globalThis.socleCurrentOrganizationId=String(organizationId||'');
  const currentUser=String(userId||''),previousUser=localStorage.getItem('socle.sessionUserId')||'';
  if(currentUser&&previousUser&&previousUser!==currentUser)setActiveSocleOrganizationId('');
  if(currentUser)localStorage.setItem('socle.sessionUserId',currentUser);
  if(organizationId)setActiveSocleOrganizationId(organizationId);
}
globalThis.syncSocleSessionOrganization=syncSocleSessionOrganization;
function setSocleMobileOrganizationMenu(label,open){
  const root=label||document.querySelector('#organizationLabel'),choices=root?.querySelector('.organization-choices'),trigger=root?.querySelector('.organization-mobile-trigger');
  if(!choices||!trigger)return;
  const next=Boolean(open&&trigger.dataset.hasMenu==='true');
  choices.dataset.mobileOpen=String(next);
  trigger.setAttribute('aria-expanded',String(next));
}
function closeSocleMobileOrganizationMenu(){setSocleMobileOrganizationMenu(document.querySelector('#organizationLabel'),false)}
function bindSocleMobileOrganizationMenuDismissal(){
  if(globalThis.__socleOrganizationMenuDismissalBound)return;
  globalThis.__socleOrganizationMenuDismissalBound=true;
  document.addEventListener('click',event=>{
    const label=document.querySelector('#organizationLabel');
    if(label&&!label.contains(event.target))setSocleMobileOrganizationMenu(label,false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){
      const trigger=document.querySelector('#organizationLabel .organization-mobile-trigger');
      if(trigger?.getAttribute('aria-expanded')==='true'){closeSocleMobileOrganizationMenu();trigger.focus()}
    }
  });
  window.addEventListener('resize',()=>{if(!window.matchMedia('(max-width:760px)').matches)closeSocleMobileOrganizationMenu()});
}
function socleOrganizationDisplayLabels(organizations){
  const groups=new Map(),labels=new Map();
  for(const organization of organizations){const key=String(organization.name).trim().toLocaleLowerCase('fr');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(organization)}
  for(const group of groups.values()){
    const candidates=group.map(organization=>{
      if(group.length===1)return String(organization.name);
      const created=new Date(organization.created_at||'');
      const date=Number.isNaN(created.getTime())?'':new Intl.DateTimeFormat('fr-BE',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Brussels'}).format(created);
      return String(organization.name)+(date?' · créée le '+date:'');
    });
    group.forEach((organization,index)=>{const candidate=candidates[index],duplicate=candidates.filter(label=>label===candidate).length>1;labels.set(String(organization.id),candidate+(duplicate?' · espace '+(index+1):''))});
  }
  return labels;
}
async function initOrganizationSwitcher(){
  const select=document.querySelector('#organizationSwitcher'),label=document.querySelector('#organizationLabel'),status=document.querySelector('#organizationSwitcherStatus');
  if(!select)return null;
  select.hidden=true;
  if(label){label.hidden=false;label.textContent='Chargement…'}
  if(status){status.hidden=true;status.textContent=''}
  try{
    const organizations=(await loadSocleOrganizations()).filter(item=>item&&String(item.id||'').trim()&&String(item.name||'').trim());
    const displayLabels=socleOrganizationDisplayLabels(organizations),displayName=organization=>displayLabels.get(String(organization.id))||String(organization.name);
    const ids=new Set(organizations.map(item=>String(item.id)));
    if(!ids.has(activeSocleOrganizationId)&&organizations.length)setActiveSocleOrganizationId(organizations[0].id);
    const options=organizations.map(item=>{const option=document.createElement('option');option.value=String(item.id);option.textContent=displayName(item);option.selected=String(item.id)===activeSocleOrganizationId;return option});
    select.replaceChildren(...options);
    select.value=activeSocleOrganizationId;
    // Le select natif reste un état de secours. L'interface visible utilise le nom actif et des boutons explicites.
    select.hidden=true;
    if(!organizations.length){
      if(label){label.hidden=false;label.textContent='Aucune entreprise accessible'}
      if(status){status.hidden=false;status.textContent='Aucune entreprise accessible à ce compte.'}
      return [];
    }
    const active=organizations.find(item=>String(item.id)===activeSocleOrganizationId)||organizations[0];
    const canCreateOrganization=active.role_code==='OWNER';
    const hasMobileMenu=organizations.length>1||canCreateOrganization;
    if(label){
      label.hidden=false;
      label.replaceChildren();
      const current=document.createElement('strong');
      current.className='organization-current';
      current.textContent=displayName(active);
      current.title=displayName(active);
      label.appendChild(current);

      const mobileTrigger=document.createElement('button');
      mobileTrigger.type='button';
      mobileTrigger.className='organization-mobile-trigger';
      mobileTrigger.textContent='⌄';
      mobileTrigger.dataset.hasMenu=String(hasMobileMenu);
      mobileTrigger.setAttribute('aria-label','Changer d’entreprise · entreprise active : '+displayName(active));
      mobileTrigger.title='Changer d’entreprise · '+displayName(active);
      if(hasMobileMenu){
        mobileTrigger.setAttribute('aria-haspopup','menu');
        mobileTrigger.setAttribute('aria-expanded','false');
        mobileTrigger.setAttribute('aria-controls','organizationChoices');
      }else{
        mobileTrigger.setAttribute('aria-disabled','true');
      }
      label.appendChild(mobileTrigger);

      if(hasMobileMenu){
        const choices=document.createElement('span');
        choices.id='organizationChoices';
        choices.className='organization-choices';
        choices.dataset.mobileOpen='false';
        choices.setAttribute('role','menu');
        for(const item of organizations){
          if(String(item.id)===String(active.id))continue;
          const button=document.createElement('button');
          button.type='button';
          button.className='organization-choice';
          button.textContent=displayName(item);
          button.title='Basculer vers '+displayName(item);
          button.dataset.organizationId=String(item.id);
          button.setAttribute('role','menuitem');
          button.addEventListener('click',async()=>{
            setSocleMobileOrganizationMenu(label,false);
            button.disabled=true;
            try{await selectSocleOrganization(item.id)}
            catch(error){
              button.disabled=false;
              if(status){status.hidden=false;status.textContent=error.message||'Impossible de changer d’entreprise.'}
            }
          });
          choices.appendChild(button);
        }
        if(canCreateOrganization){
          const addButton=document.createElement('button');
          addButton.type='button';addButton.className='organization-add';addButton.textContent='+ Ajouter une entreprise';
          addButton.setAttribute('role','menuitem');
          addButton.setAttribute('aria-expanded','false');addButton.setAttribute('aria-controls','organizationCreateForm');
          addButton.addEventListener('click',()=>{
            const form=label.querySelector('#organizationCreateForm');
            if(!form)return;
            form.hidden=!form.hidden;addButton.setAttribute('aria-expanded',String(!form.hidden));
            if(!form.hidden)form.querySelector('[name="organizationName"]')?.focus();
          });
          choices.appendChild(addButton);
          const form=document.createElement('form');
          form.id='organizationCreateForm';form.className='organization-create-form';form.hidden=true;form.dataset.allowed='true';
          form.addEventListener('submit',createSocleOrganization);
          const formLabel=document.createElement('label');formLabel.htmlFor='organizationName';formLabel.textContent='Nom de l’entreprise';
          const input=document.createElement('input');input.id='organizationName';input.name='organizationName';input.type='text';input.maxLength=160;input.required=true;input.autocomplete='organization';input.placeholder='Ex. Menuiserie Fayt';
          const submit=document.createElement('button');submit.type='submit';submit.className='organization-create-submit';submit.textContent='Créer l’entreprise';
          const formStatus=document.createElement('small');formStatus.dataset.createOrganizationStatus='';formStatus.setAttribute('role','status');formStatus.setAttribute('aria-live','polite');formStatus.hidden=true;
          form.appendChild(formLabel);form.appendChild(input);form.appendChild(submit);form.appendChild(formStatus);choices.appendChild(form);
        }
        label.appendChild(choices);
        mobileTrigger.addEventListener('click',event=>{
          event.stopPropagation();
          setSocleMobileOrganizationMenu(label,mobileTrigger.getAttribute('aria-expanded')!=='true');
        });
      }
      bindSocleMobileOrganizationMenuDismissal();
    }
    return organizations;
  }catch(error){
    select.replaceChildren();
    if(label){label.hidden=false;label.textContent='Entreprise indisponible'}
    if(status){status.hidden=false;status.textContent='La liste des entreprises n’a pas pu être chargée. Actualisez la page pour réessayer.'}
    console.warn('Sélecteur entreprise indisponible',error);
    return null;
  }
}
queueMicrotask(initOrganizationSwitcher);

let serverFinance=null,serverExpenses=[],serverInvoices=[],serverFinanceState='idle',serverFinanceError='';
let serverSimulationRuns=[],serverSimulationState='idle';
const centsMoney=value=>new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(Number(value||0)/100);
const demoFinance={bankBalance:24380000,availableCash:15742000,clientsOwe:9658000,toPay:4398000,overdue:1846000,overdueCount:2,reserves:2640000,bankName:'Compte professionnel · BE••••••••4721',lastSync:'23/09/2026 · 08:30'};
const demoExpenses=[
 {expense_date:'2026-09-22',description:'Carburant · Sprinter ARD',category:'Carburant',total_cents:18460,vat_amount_cents:3203,payment_status:'paid',document_name:'ticket-carburant-22-09.jpg'},
 {expense_date:'2026-09-21',description:'Ardoises naturelles · Résidence Meuse',category:'Matériaux',total_cents:1846000,vat_amount_cents:104490,payment_status:'paid',document_name:'facture-negoce-AR-45821.pdf'},
 {expense_date:'2026-09-20',description:'Location nacelle · Immeuble Sambre',category:'Location',total_cents:328000,vat_amount_cents:56950,payment_status:'unpaid',document_name:'bon-location-NAC-091.pdf'},
 {expense_date:'2026-09-19',description:'Bobines zinc et accessoires',category:'Matériaux',total_cents:1264000,vat_amount_cents:219310,payment_status:'unpaid',document_name:'facture-zinc-2026-884.pdf'},
 {expense_date:'2026-09-18',description:'Conteneur déchets · Ferme Leroy',category:'Sous-traitance',total_cents:594000,vat_amount_cents:103091,payment_status:'paid',document_name:'ticket-conteneur-5178.pdf'}
];
const isDemoFinance=()=>!globalThis.SOCLE_PRODUCTION&&company?.demoProfileVersion===REALISTIC_DEMO_VERSION&&!Number(serverFinance?.bankBalance||0)&&!serverExpenses.length;
async function loadServerFinance(){if(serverFinanceState==='loading')return;serverFinanceState='loading';serverFinanceError='';try{const [summary,expenses,invoices]=await Promise.all([serverJson('/api/accounting/summary'),serverJson('/api/expenses'),serverJson('/api/invoices')]);serverFinance=summary;serverExpenses=expenses.expenses||[];serverInvoices=invoices.invoices||[];serverFinanceState='ready'}catch(error){serverFinanceError=error.message;serverFinanceState='error'}if(view==='accounting'||view==='home')render()}
async function loadServerSimulationRuns(){if(serverSimulationState==='loading')return;serverSimulationState='loading';try{const data=await serverJson('/api/simulation-runs?script_code=BATINOVA_SCRIPT_2&version=1');serverSimulationRuns=data.runs||[];serverSimulationState='ready'}catch{serverSimulationRuns=[];serverSimulationState='error'}if(view==='accounting')render()}
function simulationStatusPanel(){if(serverSimulationState==='idle')queueMicrotask(loadServerSimulationRuns);if(serverSimulationState==='loading'||serverSimulationState==='idle')return '';const run=serverSimulationRuns[0];if(!run)return '';const period=run.summary?.period||{},stats=run.summary||{};return `<section class="panel simulation-status"><div class="panel-head"><div><p class="eyebrow">SIMULATION PRODUIT</p><h2>BatiNova · Script n°2 appliqué</h2><span>${period.from&&period.to?fullDate(period.from)+' → '+fullDate(period.to):'Scénario 10 jours'} · version ${run.version}</span></div><span class="badge green">ACTIF</span></div><div class="finance-grid"><div class="finance-box"><small>Pointages</small><strong>${Number(stats.timeEntries||0)}</strong></div><div class="finance-box"><small>Tâches</small><strong>${Number(stats.tasks||0)}</strong></div><div class="finance-box"><small>Livraisons</small><strong>${Number(stats.deliveries||0)}</strong></div><div class="finance-box"><small>Mouvements stock</small><strong>${Number(stats.stockMovements||0)}</strong></div><div class="finance-box"><small>Factures fournisseur</small><strong>${Number(stats.supplierExpenses||0)}</strong></div><div class="finance-box"><small>Ventilations</small><strong>${Number(stats.allocations||0)}</strong></div></div><p class="help-line">Ces données sont des données de simulation persistées dans SOCLE. Aucun envoi externe réel n'est déclenché.</p></section>`}
function serverFinancePanel(){if(serverFinanceState==='idle')queueMicrotask(loadServerFinance);if(serverFinanceState==='loading'||serverFinanceState==='idle')return `<section class="panel server-finance loading-card"><strong>Chargement de la situation financière…</strong></section>`;if(serverFinanceState==='error')return `<section class="panel server-finance load-error"><h2>Données financières indisponibles</h2><p>${esc(serverFinanceError)}</p><button class="btn" onclick="serverFinanceState='idle';render()">Réessayer</button></section>`;const demo=isDemoFinance(),s=demo?demoFinance:serverFinance;return `<section class="server-finance"><div class="panel-head"><div><p class="eyebrow">${demo?'JEU DE DÉMONSTRATION':'DONNÉES SERVEUR · ENTREPRISE ISOLÉE'}</p><h2>${demo?'Situation financière de démonstration':'Situation financière réelle'}</h2><span>${demo?'Exemple cohérent pour visualiser le tableau de bord : aucun compte bancaire réel n’est connecté.':'Calculée côté serveur à partir des factures, dépenses, comptes et réserves enregistrés.'}</span></div><span class="badge ${demo?'warn':(s.quality.complete?'green':'warn')}">${demo?'DÉMONSTRATION':(s.quality.complete?'Données disponibles':'À configurer')}</span></div>${demo?`<div class="notice"><strong>${esc(s.bankName)}</strong> · Dernière mise à jour fictive : ${s.lastSync}</div>`:''}<div class="server-finance-grid"><article><small>Argent en banque</small><strong>${centsMoney(s.bankBalance)}</strong></article><article><small>Réellement disponible</small><strong class="${s.availableCash<0?'negative-money':''}">${centsMoney(s.availableCash)}</strong></article><article><small>Les clients vous doivent</small><strong>${centsMoney(s.clientsOwe)}</strong></article><article><small>À payer</small><strong>${centsMoney(s.toPay)}</strong></article><article><small>Factures en retard</small><strong>${centsMoney(s.overdue)}</strong><span>${s.overdueCount} facture(s)</span></article><article><small>Réserves mises de côté</small><strong>${centsMoney(s.reserves)}</strong></article></div>${!demo&&s.quality.missing.length?`<p class="notice"><strong>Estimation incomplète.</strong> ${s.quality.missing.map(esc).join(' · ')}</p>`:''}</section>`}

function invoiceStatusLabel(status){return status==='paid'?'Payée':status==='partially_paid'?'Partiellement payée':status==='credited'?'Soldée par avoir':status==='credit_due'?'Crédit client à traiter':'À recevoir'}
function serverInvoiceById(id){return serverInvoices.find(invoice=>String(invoice.id)===String(id))}
function serverInvoiceForm(){const suggested='FAC-'+reference.slice(0,4)+'-'+String(serverInvoices.length+1).padStart(3,'0');modal('Nouvelle facture client',`<form onsubmit="saveServerInvoice(event)"><div class="form-two"><label>Chantier<select name="projectId"><option value="">Sans chantier</option>${jobs.map(job=>`<option value="${job.id}">${esc(job.reference||job.name)} · ${esc(job.name)}</option>`).join('')}</select></label><label>Numéro<input name="invoiceNumber" required maxlength="120" value="${esc(suggested)}"></label><label>Date<input name="issueDate" type="date" required value="${reference}"></label><label>Échéance<input name="dueDate" type="date" required value="${reference}"></label><label>Montant HTVA (€)<input name="subtotal" type="number" min="0.01" step="0.01" required></label><label>TVA (€)<input name="vat" type="number" min="0" step="0.01" value="0" required></label></div><label>Note<textarea name="notes" maxlength="2000" placeholder="Situation, acompte, avancement…"></textarea></label><p class="notice">La facture est créée côté serveur. Aucun envoi réel au client ou à Peppol n'est déclenché.</p><p id="serverInvoiceCreateError" class="form-error"></p><div class="modal-actions"><button class="btn primary">Créer la facture</button></div></form>`)}
async function saveServerInvoice(event){event.preventDefault();const form=new FormData(event.target),button=event.target.querySelector('button.primary'),subtotal=Math.round(Number(form.get('subtotal'))*100),vat=Math.round(Number(form.get('vat'))*100),error=document.querySelector('#serverInvoiceCreateError');if(!Number.isSafeInteger(subtotal)||subtotal<=0||!Number.isSafeInteger(vat)||vat<0){if(error)error.textContent='Montant ou TVA invalide.';return}if(button)button.disabled=true;try{await serverJson('/api/invoices',{method:'POST',body:JSON.stringify({customerId:null,projectId:form.get('projectId')||null,invoiceNumber:String(form.get('invoiceNumber')||'').trim(),issueDate:form.get('issueDate'),dueDate:form.get('dueDate'),subtotalCents:subtotal,vatAmountCents:vat,notes:String(form.get('notes')||'').trim()})});closeModal();serverFinanceState='idle';await loadServerFinance();render();toast('Facture client créée côté serveur.')}catch(e){if(error)error.textContent=e.message;if(button)button.disabled=false}}
async function refreshServerInvoices(){serverFinanceState='idle';await loadServerFinance()}
function serverInvoicesPanel(){if(serverFinanceState!=='ready')return '';return `<section class="panel server-invoices"><div class="panel-head"><div><p class="eyebrow">FACTURES CLIENTS · SERVEUR</p><h2>Paiements, avoirs et soldes</h2><span>Le restant dû et le statut sont calculés côté serveur.</span></div><span><span class="badge green">${serverInvoices.length} facture(s)</span> <button class="btn primary" onclick="serverInvoiceForm()">+ Facture client</button></span></div>${serverInvoices.length?`<div class="data-table"><table><thead><tr><th>Facture</th><th>Total</th><th>Payé</th><th>Avoirs</th><th>Restant</th><th>État</th></tr></thead><tbody>${serverInvoices.map(invoice=>`<tr><td><button class="link" onclick="openServerInvoice('${jsString(invoice.id)}')"><strong>${esc(invoice.invoiceNumber)}</strong></button></td><td>${centsMoney(invoice.totalCents)}</td><td>${centsMoney(invoice.paidCents)}</td><td>${centsMoney(invoice.creditNoteCents)}</td><td><strong>${centsMoney(invoice.remainingCents)}</strong>${invoice.customerCreditCents?`<small>Crédit client ${centsMoney(invoice.customerCreditCents)}</small>`:''}</td><td><span class="badge ${invoice.status==='paid'||invoice.status==='credited'?'green':invoice.status==='partially_paid'?'warn':''}">${esc(invoiceStatusLabel(invoice.status))}</span></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucune facture client serveur.</div>'}</section>`}
function openServerInvoice(id){const invoice=serverInvoiceById(id);if(!invoice)return toast('Facture serveur introuvable.');const paymentRows=invoice.payments.map(row=>`<div class="detail-row"><span><strong>${centsMoney(row.amountCents)}</strong><small>${fullDate(row.paymentDate)} · ${esc(row.paymentMethod)}${row.reference?' · '+esc(row.reference):''}</small></span><small>${esc(row.note||'')}</small></div>`).join('')||'<div class="empty">Aucun paiement enregistré.</div>',creditRows=invoice.creditNotes.map(row=>`<div class="detail-row"><span><strong>${centsMoney(row.amountCents)}</strong><small>${fullDate(row.creditDate)} · ${esc(row.reference||'Avoir')}</small></span><small>${esc(row.reason)}</small></div>`).join('')||'<div class="empty">Aucun avoir enregistré.</div>';modal(invoice.invoiceNumber,`<div class="server-invoice-summary"><div class="detail-row"><span>Total facture</span><b>${centsMoney(invoice.totalCents)}</b></div><div class="detail-row"><span>Total payé</span><b>${centsMoney(invoice.paidCents)}</b></div><div class="detail-row"><span>Total avoirs</span><b>${centsMoney(invoice.creditNoteCents)}</b></div><div class="detail-row"><span>Restant dû</span><b>${centsMoney(invoice.remainingCents)}</b></div>${invoice.customerCreditCents?`<div class="notice"><strong>Crédit client à traiter : ${centsMoney(invoice.customerCreditCents)}</strong><br>Aucun remboursement bancaire n'est créé automatiquement.</div>`:''}<div class="detail-row"><span>État</span><b>${esc(invoiceStatusLabel(invoice.status))}</b></div></div><h3>Paiements</h3>${paymentRows}<h3>Avoirs</h3>${creditRows}<div class="modal-actions"><button class="btn" onclick="closeModal()">Fermer</button>${invoice.remainingCents>0&&(canFieldAction('markPayments')||canModuleAction('accounting','edit'))?`<button class="btn primary" onclick="serverPaymentForm('${jsString(invoice.id)}')">+ Paiement</button>`:''}${canModuleAction('accounting','edit')?`<button class="btn" onclick="serverCreditNoteForm('${jsString(invoice.id)}')">+ Avoir</button>`:''}</div>`)}
function serverPaymentForm(invoiceId){const invoice=serverInvoiceById(invoiceId);if(!invoice)return;modal('Enregistrer un paiement',`<form onsubmit="saveServerPayment(event,'${jsString(invoiceId)}')"><div class="form-two"><label>Montant (€)<input name="amount" type="number" min="0.01" step="0.01" max="${(invoice.remainingCents/100).toFixed(2)}" required></label><label>Date<input name="paymentDate" type="date" value="${reference}" required></label><label>Moyen<select name="paymentMethod"><option value="bank_transfer">Virement</option><option value="card">Carte</option><option value="cash">Espèces</option><option value="direct_debit">Domiciliation</option><option value="cheque">Chèque</option><option value="other">Autre</option></select></label><label>Référence<input name="reference" maxlength="240"></label></div><label>Note<textarea name="note" maxlength="1000"></textarea></label><p class="form-error" id="serverPaymentError" role="alert"></p><div class="modal-actions"><button class="btn" type="button" onclick="openServerInvoice('${jsString(invoiceId)}')">Annuler</button><button class="btn primary">Enregistrer le paiement</button></div></form>`)}
async function saveServerPayment(event,invoiceId){event.preventDefault();const form=event.target,button=form.querySelector('button.primary'),error=form.querySelector('#serverPaymentError'),data=new FormData(form),amount=Math.round(Number(data.get('amount'))*100);button.disabled=true;error.textContent='';try{await serverJson(`/api/invoices/${encodeURIComponent(invoiceId)}/payments`,{method:'POST',body:JSON.stringify({amountCents:amount,paymentDate:data.get('paymentDate'),paymentMethod:data.get('paymentMethod'),reference:data.get('reference').trim(),note:data.get('note').trim(),operationKey:`payment-${crypto.randomUUID()}`})});closeModal();await refreshServerInvoices();toast('Paiement enregistré côté serveur.')}catch(e){error.textContent=e.message;button.disabled=false}}
function serverCreditNoteForm(invoiceId){const invoice=serverInvoiceById(invoiceId);if(!invoice)return;const max=Math.max(0,invoice.totalCents-invoice.creditNoteCents);modal('Créer un avoir',`<form onsubmit="saveServerCreditNote(event,'${jsString(invoiceId)}')"><div class="form-two"><label>Montant (€)<input name="amount" type="number" min="0.01" step="0.01" max="${(max/100).toFixed(2)}" required></label><label>Date<input name="creditDate" type="date" value="${reference}" required></label><label>Référence<input name="reference" maxlength="240"></label></div><label>Motif<input name="reason" maxlength="500" required></label><label>Note<textarea name="note" maxlength="1000"></textarea></label><p class="form-error" id="serverCreditError" role="alert"></p><div class="modal-actions"><button class="btn" type="button" onclick="openServerInvoice('${jsString(invoiceId)}')">Annuler</button><button class="btn primary">Créer l'avoir</button></div></form>`)}
async function saveServerCreditNote(event,invoiceId){event.preventDefault();const form=event.target,button=form.querySelector('button.primary'),error=form.querySelector('#serverCreditError'),data=new FormData(form),amount=Math.round(Number(data.get('amount'))*100);button.disabled=true;error.textContent='';try{await serverJson(`/api/invoices/${encodeURIComponent(invoiceId)}/credit-notes`,{method:'POST',body:JSON.stringify({amountCents:amount,creditDate:data.get('creditDate'),reason:data.get('reason').trim(),reference:data.get('reference').trim(),note:data.get('note').trim(),operationKey:`credit-${crypto.randomUUID()}`})});closeModal();await refreshServerInvoices();toast('Avoir enregistré côté serveur.')}catch(e){error.textContent=e.message;button.disabled=false}}

function serverExpensesView(){const demo=isDemoFinance(),rows=demo?demoExpenses:serverExpenses;return `<section class="panel server-expenses"><div class="panel-head"><div><p class="eyebrow">${demo?'DÉPENSES · DÉMONSTRATION':'DÉPENSES RÉELLES'}</p><h2>Achats, tickets et factures</h2><span>${demo?'Exemples de tickets et factures pour montrer le suivi attendu.':'Une seule saisie, conservée côté serveur et prête à être reliée au chantier.'}</span></div><button class="btn primary" onclick="serverExpenseForm()">+ Ajouter une dépense</button></div>${rows.length?`<div class="data-table"><table><thead><tr><th>Date</th><th>Description</th><th>Catégorie</th><th>Montant TVAC</th><th>Paiement</th><th>Justificatif</th></tr></thead><tbody>${rows.map(item=>`<tr><td>${fullDate(item.expense_date)}</td><td><strong>${esc(item.description)}</strong></td><td>${esc(item.category)}</td><td><strong>${centsMoney(item.total_cents)}</strong><small>TVA ${centsMoney(item.vat_amount_cents)}</small></td><td><span class="badge ${item.payment_status==='paid'?'green':'warn'}">${item.payment_status==='paid'?'Payée':'À payer'}</span></td><td>${item.document_name?`<span class="badge">${esc(item.document_name)}</span>`:'<span class="subtle">Manquant</span>'}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty honest-empty"><strong>Aucune dépense réelle enregistrée.</strong><p>Ajoutez le premier ticket ou la première facture.</p></div>`}</section>`}
function serverExpenseForm(){modal('Ajouter une dépense',`<form onsubmit="saveServerExpense(event)"><div class="form-two"><label>Date<input name="expenseDate" type="date" required value="${reference}"></label><label>Catégorie<select name="category"><option value="materials">Matériaux</option><option value="tools">Outillage</option><option value="fuel">Carburant</option><option value="vehicle">Véhicule</option><option value="restaurant">Restaurant / repas</option><option value="subcontracting">Sous-traitance</option><option value="rental">Location</option><option value="overhead">Frais généraux</option><option value="other">Autre</option></select></label><label>Montant TVAC (€)<input name="total" type="number" min="0.01" step="0.01" required></label><label>TVA comprise (€)<input name="vatAmount" type="number" min="0" step="0.01" value="0" required></label></div><label>Description<input name="description" required maxlength="240" placeholder="Ex. rouleaux d’isolant · fournisseur X"></label><label>État du paiement<select name="paymentStatus"><option value="unpaid">À payer</option><option value="paid">Déjà payée</option></select></label><label>Justificatif<input name="document" type="file" accept="image/*,application/pdf" capture="environment"></label><p class="notice">Le montant est calculé et conservé en centimes côté serveur. Le fichier sera relié au stockage documentaire dès que celui-ci est connecté ; son nom est déjà conservé.</p><p id="serverExpenseError" class="form-error"></p><div class="modal-actions"><button class="btn primary">Enregistrer la dépense</button></div></form>`)}
async function saveServerExpense(event){event.preventDefault();const form=new FormData(event.target),file=form.get('document'),button=event.target.querySelector('button'),total=Number(form.get('total')),vat=Number(form.get('vatAmount')),operationKey=event.target.dataset.operationKey||(event.target.dataset.operationKey='expense-'+crypto.randomUUID());if(!Number.isFinite(total)||!Number.isFinite(vat)||vat>total){document.querySelector('#serverExpenseError').textContent='La TVA ne peut pas dépasser le montant TVAC.';return}if(button)button.disabled=true;try{await serverJson('/api/expenses',{method:'POST',body:JSON.stringify({expenseDate:form.get('expenseDate'),category:form.get('category'),total:form.get('total'),vatAmount:form.get('vatAmount'),description:form.get('description').trim(),paymentStatus:form.get('paymentStatus'),documentName:file?.name||null,operationKey})});closeModal();serverFinanceState='idle';render();toast('Dépense enregistrée côté serveur.')}catch(error){document.querySelector('#serverExpenseError').textContent=error.message;if(button)button.disabled=false}}
function toggleOtherChoice(select,targetId){const target=document.querySelector('#'+targetId),input=target?.querySelector('input'),on=select.value==='other'||select.value==='Autre dépense';if(target)target.hidden=!on;if(input){input.required=on;if(!on)input.value=''}}
serverExpenseForm=function(){modal('Ajouter une dépense',`<form onsubmit="saveServerExpense(event)"><div class="form-two"><label>Date<input name="expenseDate" type="date" required value="${reference}"></label><label>Catégorie<select name="category" onchange="toggleOtherChoice(this,'serverExpenseCategoryCustom')"><option value="materials">Matériaux</option><option value="tools">Outillage</option><option value="fuel">Carburant</option><option value="vehicle">Véhicule</option><option value="restaurant">Restaurant / repas</option><option value="subcontracting">Sous-traitance</option><option value="rental">Location</option><option value="overhead">Frais généraux</option><option value="other">Autre</option></select></label><label id="serverExpenseCategoryCustom" hidden>Précisez la catégorie<input name="customCategory" maxlength="80" placeholder="Ex. assurance, frais bancaire…"></label><label>Montant TVAC (€)<input name="total" type="number" min="0.01" step="0.01" required></label><label>TVA comprise (€)<input name="vatAmount" type="number" min="0" step="0.01" value="0" required></label></div><label>Description<input name="description" required maxlength="240"></label><label>État du paiement<select name="paymentStatus"><option value="unpaid">À payer</option><option value="paid">Déjà payée</option></select></label><label>Justificatif<input name="document" type="file" accept="image/*,application/pdf" capture="environment"></label><p id="serverExpenseError" class="form-error"></p><div class="modal-actions"><button class="btn primary">Enregistrer la dépense</button></div></form>`) };
saveServerExpense=async function(event){event.preventDefault();const form=new FormData(event.target),file=form.get('document'),button=event.target.querySelector('button'),total=Number(form.get('total')),vat=Number(form.get('vatAmount')),category=String(form.get('customCategory')||form.get('category')||'').trim();if(!category||!Number.isFinite(total)||!Number.isFinite(vat)||vat>total){document.querySelector('#serverExpenseError').textContent=!category?'Précisez la catégorie.':'La TVA ne peut pas dépasser le montant TVAC.';return}if(button)button.disabled=true;try{await serverJson('/api/expenses',{method:'POST',body:JSON.stringify({expenseDate:form.get('expenseDate'),category,total:form.get('total'),vatAmount:form.get('vatAmount'),description:form.get('description').trim(),paymentStatus:form.get('paymentStatus'),documentName:file?.name||null})});closeModal();serverFinanceState='idle';render();toast('Dépense enregistrée côté serveur.')}catch(error){document.querySelector('#serverExpenseError').textContent=error.message;if(button)button.disabled=false}};
function openAccountingExpense(index){const rows=isDemoFinance()?demoExpenses:serverExpenses,item=rows[index];if(!item)return;const job=jobs.find(entry=>entry.id===Number(item.project_id));modal('Détail de la dépense',`<div class="detail-row"><span>Date</span><b>${fullDate(item.expense_date)}</b></div><div class="detail-row"><span>Catégorie</span><b>${esc(item.category)}</b></div><div class="detail-row"><span>Montant TVAC</span><b>${centsMoney(item.total_cents)}</b></div><div class="detail-row"><span>TVA</span><b>${centsMoney(item.vat_amount_cents)}</b></div><div class="detail-row"><span>Paiement</span><b>${item.payment_status==='paid'?'Payée':'À payer'}</b></div><div class="detail-row"><span>Justificatif</span><b>${esc(item.document_name||'Non joint')}</b></div>${job?`<div class="modal-actions"><button class="btn primary" onclick="showJob(${job.id})">Voir le chantier lié</button></div>`:'<p class="notice">Aucun chantier n’est relié à cette dépense.</p>'}<p class="help-line">Le fichier réel sera ouvrable dès que le stockage documentaire sera connecté.</p>`) }
serverExpensesView=function(){const demo=isDemoFinance(),rows=demo?demoExpenses:serverExpenses;return `<section class="panel server-expenses"><div class="panel-head"><div><p class="eyebrow">${demo?'DÉPENSES · DÉMONSTRATION':'DÉPENSES RÉELLES'}</p><h2>Achats, tickets et factures</h2><span>Cliquez une ligne pour voir le détail.</span></div><button class="btn primary" onclick="serverExpenseForm()">+ Ajouter une dépense</button></div>${rows.length?`<div class="data-table"><table><thead><tr><th>Date</th><th>Description</th><th>Catégorie</th><th>Montant TVAC</th><th>Paiement</th><th>Justificatif</th></tr></thead><tbody>${rows.map((item,index)=>`<tr class="clickable-row" onclick="openAccountingExpense(${index})"><td>${fullDate(item.expense_date)}</td><td><strong>${esc(item.description)}</strong></td><td>${esc(item.category)}</td><td><strong>${centsMoney(item.total_cents)}</strong><small>TVA ${centsMoney(item.vat_amount_cents)}</small></td><td><span class="badge ${item.payment_status==='paid'?'green':'warn'}">${item.payment_status==='paid'?'Payée':'À payer'}</span></td><td>${item.document_name?`<span class="badge">${esc(item.document_name)}</span>`:'<span class="subtle">Manquant</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucune dépense enregistrée.</div>'}</section>`};
jobProgressAccountingView=function(){if(!canFieldAction('viewProfitability'))return '';const rows=jobs.filter(job=>acceptedQuoteForJob(job.id)&&job.phase!=='À préparer').map(job=>{const quote=acceptedQuoteForJob(job.id),invoices=accountingData.customerInvoices.filter(invoice=>invoice.job===job.id),paid=invoices.filter(invoice=>invoice.status==='Payée').reduce((sum,invoice)=>sum+Number(invoice.amount||0),0),open=invoices.filter(invoice=>invoice.status!=='Payée'),due=open.filter(invoice=>invoice.due<reference);return {job,quote,paid,open,due}});return `<section class="panel job-progress-accounting"><div class="panel-head"><div><p class="eyebrow">RÉSERVÉ AU PATRON</p><h2>Avancée des chantiers & encaissements</h2><span>Cliquez le chantier pour voir son dossier avant toute relance.</span></div><span class="badge">${rows.length} chantier(s)</span></div><div class="data-table"><table><thead><tr><th>Chantier</th><th>Avancée</th><th>Vendu TVAC</th><th>Encaissé</th><th>À encaisser</th><th>Relance</th></tr></thead><tbody>${rows.map(({job,quote,paid,open,due})=>{const sold=quoteGross(quote),openAmount=open.reduce((sum,invoice)=>sum+Number(invoice.amount||0),0),progress=Math.max(0,Math.min(100,Number(job.progress||0)));return `<tr><td><button class="link" onclick="showJob(${job.id})"><strong>${esc(job.name)}</strong><small>${esc(job.client||'')} · Voir le chantier ↗</small></button></td><td><strong>${progress} %</strong><div class="progress"><span style="width:${progress}%"></span></div></td><td><strong>${money(sold)}</strong></td><td>${money(paid)}</td><td><strong class="${openAmount?'negative-money':''}">${money(openAmount)}</strong><small>${open.length?open.length+' facture(s)':'Tout est encaissé'}</small></td><td>${due.length?`<button class="btn" onclick="paymentReminderPicker(${job.id})">Relancer · ${due.length}</button>`:open.length?'<span class="subtle">Pas encore échéance</span>':'<span class="badge green">À jour</span>'}</td></tr>`}).join('')}</tbody></table></div><p class="help-line">La relance reste à valider : aucun e-mail ou SMS réel ne part automatiquement.</p></section>`};
function jobProgressAccountingView(){if(!canFieldAction('viewProfitability'))return '';const rows=jobs.filter(job=>acceptedQuoteForJob(job.id)&&job.phase!=='À préparer').map(job=>{const quote=acceptedQuoteForJob(job.id),invoices=accountingData.customerInvoices.filter(invoice=>invoice.job===job.id),paid=invoices.filter(invoice=>invoice.status==='Payée').reduce((sum,invoice)=>sum+Number(invoice.amount||0),0),open=invoices.filter(invoice=>invoice.status!=='Payée'),due=open.filter(invoice=>invoice.due<reference);return {job,quote,invoices,paid,open,due}});return `<section class="panel job-progress-accounting"><div class="panel-head"><div><p class="eyebrow">RÉSERVÉ AU PATRON</p><h2>Avancée des chantiers & encaissements</h2><span>Comparez l’avancement réel, le devis vendu et les factures à relancer.</span></div><span class="badge">${rows.length} chantier(s)</span></div><div class="data-table"><table><thead><tr><th>Chantier</th><th>Avancée</th><th>Vendu TVAC</th><th>Encaissé</th><th>À encaisser</th><th>Relance</th></tr></thead><tbody>${rows.map(({job,quote,paid,open,due})=>{const sold=quoteGross(quote),openAmount=open.reduce((sum,invoice)=>sum+Number(invoice.amount||0),0),progress=Math.max(0,Math.min(100,Number(job.progress||0)));return `<tr><td><strong>${esc(job.name)}</strong><small>${esc(job.client||'')}</small></td><td><strong>${progress} %</strong><div class="progress"><span style="width:${progress}%"></span></div></td><td><strong>${money(sold)}</strong></td><td>${money(paid)}</td><td><strong class="${openAmount?'negative-money':''}">${money(openAmount)}</strong><small>${open.length?open.length+' facture(s)':'Tout est encaissé'}</small></td><td>${due.length?`<button class="btn" onclick="paymentReminderPicker(${job.id})">Relancer · ${due.length}</button>`:open.length?'<span class="subtle">Pas encore échéance</span>':'<span class="badge green">À jour</span>'}</td></tr>`}).join('')}</tbody></table></div><p class="help-line">La relance reste à valider : l’e-mail ou le SMS réel ne sera envoyé qu’une fois la messagerie de l’entreprise connectée.</p></section>`}
function paymentReminderPicker(jobId){const job=jobs.find(item=>item.id===jobId),invoices=accountingData.customerInvoices.filter(invoice=>invoice.job===jobId&&invoice.status!=='Payée'&&invoice.due<reference);if(!invoices.length)return;modal('Relancer '+job.name,`<div><p class="notice">Choisissez la facture à relancer. Chaque relance sera ajoutée à son historique avant tout envoi réel.</p>${invoices.map(invoice=>`<article class="detail-row"><span><strong>${esc(invoice.ref)}</strong><small>${esc(invoice.client)} · échéance ${fullDate(invoice.due)}</small></span><span><strong>${money(invoice.amount)}</strong><button class="btn" onclick="sendPaymentReminder(${invoice.id})">Préparer la relance</button></span></article>`).join('')}</div><div class="modal-actions"><button class="btn" onclick="closeModal();navigate('accounting')">Fermer</button></div>`) }
accountingView=function(){return managementTabs('accounting')+heading('Comptabilité','Trésorerie, factures, dépenses et réserves : une vue simple de ce qui entre, sort et reste disponible.',false)+simulationStatusPanel()+serverFinancePanel()+serverInvoicesPanel()+serverExpensesView()+jobProgressAccountingView()+`<section class="panel accounting-next><div><p class="eyebrow">MISE EN PLACE PROGRESSIVE</p><h2>Prochaines connexions</h2><p>Comptes bancaires, factures clients, réserves et justificatifs pourront être reliés ici sans double encodage. Les montants de démonstration disparaîtront dès qu’une entreprise connectera ses propres données.</p></div></section>`};

let conversations=[],conversationMessages=[],activeConversationId='',messageState='idle',messageError='';
async function loadConversations(){if(messageState==='loading')return;messageState='loading';messageError='';try{const data=await serverJson('/api/conversations');conversations=data.conversations||[];messageState='ready';if(activeConversationId&&!conversations.some(item=>item.id===activeConversationId)){activeConversationId='';conversationMessages=[]}}catch(error){messageState='error';messageError=error.message}if(view==='messages')render()}
async function openConversation(id){activeConversationId=id;conversationMessages=[];messageState='loading-messages';render();try{const data=await serverJson('/api/messages?conversation_id='+encodeURIComponent(id));conversationMessages=data.messages||[];messageState='ready'}catch(error){messageState='error';messageError=error.message}if(view==='messages')render()}
function messageTime(value){if(!value)return '';return new Date(value).toLocaleString('fr-BE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
function messagesView(){if(messageState==='idle')queueMicrotask(loadConversations);const active=conversations.find(item=>item.id===activeConversationId);return `<div class="simple-head messaging-head"><div><p class="eyebrow">COMMUNICATION ENTREPRISE</p><h1>Messages</h1><p>Une question, une information de chantier ou un besoin de matériel, sans devoir téléphoner à toute l’équipe.</p></div>${canModuleAction('messages','add')?'<button class="btn primary" onclick="conversationForm()">+ Nouvelle conversation</button>':''}</div>${messageState==='error'?`<section class="panel load-error"><h2>Messagerie indisponible</h2><p>${esc(messageError)}</p><button class="btn" onclick="messageState='idle';render()">Réessayer</button></section>`:`<section class="messenger"><aside class="conversation-list"><div class="conversation-list-title"><strong>Conversations</strong><span>${conversations.length}</span></div>${conversations.map(item=>`<button class="${item.id===activeConversationId?'active':''}" onclick="openConversation('${jsString(item.id)}')"><span class="message-avatar">${esc(item.title.slice(0,2).toUpperCase())}</span><span><strong>${esc(item.title)}</strong><small>${esc(item.last_message||({company:'Canal de l’entreprise',team:'Conversation d’équipe',project:'Discussion de chantier',direct:'Conversation privée'}[item.kind]||''))}</small></span><time>${messageTime(item.last_message_at)}</time></button>`).join('')||'<div class="empty compact-empty">Aucune conversation. Créez le premier canal de l’entreprise.</div>'}</aside><div class="conversation-pane">${active?`<header><button type="button" class="btn conversation-back" onclick="activeConversationId='';conversationMessages=[];render()">← Conversations</button><div><strong>${esc(active.title)}</strong><small>${esc({company:'Toute l’entreprise',team:'Équipe',project:'Chantier',direct:'Conversation privée'}[active.kind]||active.kind)}</small></div>${active.project_id?'<span class="badge">Liée à un chantier</span>':''}</header><div class="message-thread">${messageState==='loading-messages'?'<div class="empty">Chargement des messages…</div>':conversationMessages.map(item=>`<article><span class="message-avatar">${esc(((item.first_name||'U')[0]+(item.last_name||'')[0]).toUpperCase())}</span><div><p><strong>${esc([item.first_name,item.last_name].filter(Boolean).join(' ')||'Utilisateur')}</strong><time>${messageTime(item.created_at)}</time></p><div>${esc(item.body).replace(/\n/g,'<br>')}</div></div></article>`).join('')||'<div class="empty">Aucun message pour le moment.</div>'}</div><form class="message-composer" onsubmit="sendMessage(event)"><textarea name="body" rows="2" maxlength="4000" required placeholder="Écrire un message à l’équipe…"></textarea><button class="btn primary">Envoyer</button></form>`:'<div class="empty conversation-placeholder"><strong>Sélectionnez une conversation</strong><p>Les messages restent dans l’entreprise et peuvent être rattachés à un chantier.</p></div>'}</div></section>`}`}
function conversationForm(){modal('Nouvelle conversation',`<form onsubmit="saveConversation(event)"><label>Nom de la conversation<input name="title" required maxlength="120" placeholder="Ex. Équipe toiture · chantier Martin"></label><div class="form-two"><label>Type<select name="kind"><option value="team">Équipe</option><option value="project">Chantier</option><option value="company">Toute l’entreprise</option><option value="direct">Privée</option></select></label><label>Équipe liée<select name="teamId"><option value="">Aucune</option>${teams.map(team=>`<option value="${team.id}">${esc(team.name)}</option>`).join('')}</select></label><label>Chantier lié<select name="projectId"><option value="">Aucun</option>${jobs.map(job=>`<option value="${job.id}">${esc(job.name)}</option>`).join('')}</select></label></div><p class="form-section-title">Participants explicites</p><div class="check-people compact-recipients">${people.filter(person=>!person.inactiveAt).map(person=>`<label><input type="checkbox" name="participant" value="${person.id}">${face(person)}<span><strong>${esc(person.name)}</strong><small>${esc(person.role||'')}</small></span></label>`).join('')}</div><p class="notice"><strong>Entreprise :</strong> tous les utilisateurs ayant le droit Messages. <strong>Équipe :</strong> membres de l’équipe et participants explicites autorisés. <strong>Chantier :</strong> uniquement les utilisateurs ayant accès à ce chantier. <strong>Privée :</strong> participants explicites uniquement.</p><p id="conversationError" class="form-error"></p><div class="modal-actions"><button class="btn primary">Créer la conversation</button></div></form>`)}
async function saveConversation(event){event.preventDefault();const form=new FormData(event.target),kind=String(form.get('kind')||''),button=event.target.querySelector('button[type="submit"],button:not([type])'),participantPersonIds=form.getAll('participant').map(String);if(kind==='direct'&&!participantPersonIds.length){document.querySelector('#conversationError').textContent='Choisissez au moins une autre personne pour une conversation privée.';return}if(kind==='team'&&!form.get('teamId')){document.querySelector('#conversationError').textContent='Choisissez l’équipe concernée.';return}if(kind==='project'&&!form.get('projectId')){document.querySelector('#conversationError').textContent='Choisissez le chantier concerné.';return}if(button)button.disabled=true;try{const result=await serverJson('/api/conversations',{method:'POST',body:JSON.stringify({title:form.get('title').trim(),kind,teamId:form.get('teamId')||null,projectId:form.get('projectId')||null,participantPersonIds})});closeModal();messageState='idle';await loadConversations();await openConversation(result.id);toast('Conversation créée avec le périmètre serveur appliqué.')}catch(error){document.querySelector('#conversationError').textContent=error.message;if(button)button.disabled=false}}
async function sendMessage(event){event.preventDefault();const form=new FormData(event.target),text=form.get('body').trim(),button=event.target.querySelector('button');if(!text||!activeConversationId)return;if(button)button.disabled=true;try{await serverJson('/api/messages?conversation_id='+encodeURIComponent(activeConversationId),{method:'POST',body:JSON.stringify({body:text})});event.target.reset();await openConversation(activeConversationId);messageState='idle';await loadConversations()}catch(error){toast(error.message);if(button)button.disabled=false}}

let serverAuditEvents=[],serverAuditState='idle',serverAuditError='';
async function loadServerAuditLog({renderAfter=true}={}){
  if(serverAuditState==='loading')return;
  serverAuditState='loading';serverAuditError='';
  try{const data=await serverJson('/api/audit-log?limit=80');serverAuditEvents=data.events||[];serverAuditState='ready'}
  catch(error){serverAuditEvents=[];serverAuditError=error.message||'Historique indisponible.';serverAuditState='error'}
  if(renderAfter&&view==='accounting')render();
}
function auditActionLabel(action){
  const labels={
    'simulation.applied':'Simulation appliquée',
    'purchase_order.created':'Commande fournisseur créée',
    'delivery.received':'Livraison enregistrée',
    'stock.movement.created':'Mouvement de stock',
    'expense.created':'Facture fournisseur / dépense créée',
    'supplier_allocation.created':'Ventilation fournisseur créée',
    'invoice.created':'Facture client créée',
    'payment.created':'Paiement client enregistré',
    'credit_note.created':'Avoir client créé',
    'fuel.created':'Plein carburant enregistré',
    'asset_issue.created':'Incident matériel signalé',
    'task.created':'Tâche chantier créée',
    'task.updated':'Tâche chantier mise à jour',
    'time_entry.arrival':'Arrivée pointée',
    'time_entry.departure':'Départ pointé',
    'time_entry.correction_requested':'Correction d’heures demandée',
    'time_entry.correction_approved':'Correction d’heures approuvée'
  };
  return labels[action]||String(action||'').replaceAll('_',' ').replaceAll('.',' · ');
}
function auditEntityLabel(type){
  const labels={project_task:'Tâche',time_entry:'Pointage',time_entry_correction:'Correction',purchase_order:'Commande',delivery_note:'Livraison',stock_movement:'Stock',expense:'Dépense',supplier_allocation:'Ventilation',invoice:'Facture client',payment:'Paiement',credit_note:'Avoir',asset:'Matériel',simulation_run:'Simulation'};
  return labels[type]||String(type||'Événement').replaceAll('_',' ');
}
function serverAuditTimelinePanel(){
  if(serverAuditState==='idle')queueMicrotask(()=>loadServerAuditLog());
  if(serverAuditState==='loading'||serverAuditState==='idle')return '<section class="panel"><div class="empty">Chargement de l’historique d’activité…</div></section>';
  if(serverAuditState==='error')return '';
  return `<section class="panel server-audit-timeline"><div class="panel-head"><div><p class="eyebrow">HISTORIQUE · SERVEUR</p><h2>Activité récente de l’entreprise</h2><span>Journal technique des opérations réellement enregistrées dans SOCLE.</span></div><span class="badge">${serverAuditEvents.length} événement(s)</span></div>${serverAuditEvents.length?`<div class="audit-timeline">${serverAuditEvents.map(event=>`<article class="detail-row"><span><strong>${esc(auditActionLabel(event.action))}</strong><small>${esc(auditEntityLabel(event.entityType))} · ${esc(String(event.entityId||''))}</small></span><span><b>${esc(event.actorName||'Utilisateur')}</b><small>${esc(new Date(event.createdAt).toLocaleString('fr-BE'))}</small></span></article>`).join('')}</div>`:'<div class="empty">Aucune activité serveur enregistrée.</div>'}</section>`;
}
const accountingViewBeforeAuditTimeline=accountingView;
accountingView=function(){return accountingViewBeforeAuditTimeline()+serverAuditTimelinePanel()}

let serverProjectTasks=[],serverProjectTasksState='idle',serverProjectTasksError='';
async function loadServerProjectTasks({renderAfter=true}={}){
  if(serverProjectTasksState==='loading')return;
  serverProjectTasksState='loading';serverProjectTasksError='';
  try{const data=await serverJson('/api/tasks');serverProjectTasks=data.tasks||[];serverProjectTasksState='ready'}
  catch(error){serverProjectTasks=[];serverProjectTasksError=error.message||'Tâches chantier indisponibles.';serverProjectTasksState='error'}
  if(renderAfter&&view==='actions')render();
}
function serverProjectTaskStatus(task){return task.status==='done'?['Terminée','green']:task.status==='in_progress'?['En cours','']:task.status==='blocked'?['Bloquée','red']:['À faire','warn']}
function serverProjectTaskPriority(task){return task.priority==='urgent'?'Urgente':task.priority==='high'?'Haute':task.priority==='low'?'Basse':'Normale'}
function serverProjectTaskPanel(){
  if(serverProjectTasksState==='idle')queueMicrotask(()=>loadServerProjectTasks());
  if(serverProjectTasksState==='loading'||serverProjectTasksState==='idle')return '<section class="panel"><div class="empty">Chargement des tâches chantier…</div></section>';
  if(serverProjectTasksState==='error')return '';
  const open=serverProjectTasks.filter(task=>task.status!=='done'),done=serverProjectTasks.filter(task=>task.status==='done');
  const rows=[...open,...done];
  return `<section class="panel server-project-tasks"><div class="panel-head"><div><p class="eyebrow">TÂCHES CHANTIER · SERVEUR</p><h2>Travail opérationnel des équipes</h2><span>Ces tâches viennent des chantiers et respectent le périmètre d’accès de l’utilisateur.</span></div><span class="badge">${open.length} ouverte(s)</span></div>${rows.length?`<div class="data-table"><table><thead><tr><th>Tâche</th><th>Chantier</th><th>Responsable</th><th>Priorité</th><th>État</th></tr></thead><tbody>${rows.map(task=>{const project=jobs.find(job=>String(job.id)===String(task.projectId)),status=serverProjectTaskStatus(task);return `<tr><td><button class="link" onclick="openServerProjectTask('${jsString(task.id)}')"><strong>${esc(task.title)}</strong></button><small>${esc(task.description||'')}</small></td><td>${esc(project?.reference||project?.name||task.projectId)}</td><td>${esc(task.assignedToName||'Non assignée')}</td><td><span class="badge ${task.priority==='urgent'?'red':task.priority==='high'?'warn':''}">${serverProjectTaskPriority(task)}</span></td><td><span class="badge ${status[1]}">${status[0]}</span></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Aucune tâche chantier visible.</div>'}</section>`;
}
function openServerProjectTask(id){
  const task=serverProjectTasks.find(item=>String(item.id)===String(id));if(!task)return;
  const project=jobs.find(job=>String(job.id)===String(task.projectId)),status=serverProjectTaskStatus(task);
  const controls=task.status==='todo'?'<button class="btn primary" onclick="changeServerProjectTaskStatus(\''+jsString(task.id)+'\',\'in_progress\')">Commencer</button>':task.status==='in_progress'?'<button class="btn" onclick="changeServerProjectTaskStatus(\''+jsString(task.id)+'\',\'blocked\')">Bloquer</button><button class="btn primary" onclick="changeServerProjectTaskStatus(\''+jsString(task.id)+'\',\'done\')">Terminer</button>':task.status==='blocked'?'<button class="btn primary" onclick="changeServerProjectTaskStatus(\''+jsString(task.id)+'\',\'in_progress\')">Reprendre</button>':'';
  modal(task.title,`<span class="badge ${status[1]}">${status[0]}</span><p>${esc(task.description||'Aucune description.')}</p><div class="detail-row"><span>Chantier</span><b>${esc(project?.reference||project?.name||task.projectId)}</b></div><div class="detail-row"><span>Responsable</span><b>${esc(task.assignedToName||'Non assignée')}</b></div><div class="detail-row"><span>Priorité</span><b>${serverProjectTaskPriority(task)}</b></div><div class="modal-actions"><button class="btn" onclick="closeModal();showJob('${jsString(project?.id??'')}')">Ouvrir le chantier</button>${controls}</div>`);
}
async function changeServerProjectTaskStatus(id,status){
  try{await serverJson('/api/tasks/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status})});closeModal();serverProjectTasksState='idle';await loadServerProjectTasks();toast('Tâche chantier mise à jour côté serveur.')}catch(error){toast(error.message||'Mise à jour de la tâche refusée.')}
}
const actionsBeforeServerProjectTasks=actions;
actions=function(){return actionsBeforeServerProjectTasks()+serverProjectTaskPanel()}

const renderBeforeServerModules=render;
render=function(){renderBeforeServerModules();if(view==='messages'||view==='training'){const main=document.querySelector('#main');if(main)main.innerHTML=view==='messages'?messagesView():trainingCatalogueView();const nav=document.querySelector('#nav');if(nav)nav.innerHTML=tabs2.filter(([key])=>canViewModule(key)).map(([key,label])=>`<button class="${view===key?'active':''}" ${view===key?'aria-current="page"':''} onclick="navigate('${key}')">${label}</button>`).join('')}};

// Stabilisation transversale: les actions déléguables ci-dessous sont désormais confirmées par le serveur.
async function loadServerQuotes(){try{const data=await serverJson('/api/quotes');return data.quotes||[]}catch(error){console.warn('Devis serveur indisponibles',error);return []}}
saveLinkedQuote=async function(event,id){event.preventDefault();if(!canModuleAction('quotes',id?'edit':'add'))return denyAccess('Vous ne pouvez pas enregistrer ce devis.');const form=new FormData(event.target),labels=form.getAll('label'),descriptions=form.getAll('description'),qtys=form.getAll('qty'),units=form.getAll('unit'),prices=form.getAll('price'),vats=form.getAll('vat');if(!labels.length||labels.some(value=>!String(value).trim())){document.querySelector('#quoteError').textContent='Ajoutez au moins une ligne de travaux.';return}const title=String(form.get('title')||'').trim(),client=String(form.get('client')||'').trim();let job=jobs.find(item=>String(item.id)===String(form.get('job')));if(!job){document.querySelector('#quoteError').textContent='La stabilisation exige un chantier serveur existant avant le devis.';return}const lines=labels.map((label,index)=>({label:String(label).trim(),description:String(descriptions[index]||'').trim(),qty:+qtys[index],unit:String(units[index]||'forfait').trim(),price:+prices[index],vat:+vats[index]})),payload={projectId:String(job.id),reference:id?(quotes.find(q=>q.id===id)?.ref||''):'',status:'draft',title,client,clientAddress:String(form.get('clientAddress')||'').trim(),date:form.get('date'),validUntil:form.get('validUntil'),deposit:+form.get('deposit')||0,paymentTerms:String(form.get('paymentTerms')||'').trim(),notes:String(form.get('notes')||'').trim(),exclusions:String(form.get('exclusions')||'').trim(),lines};const button=event.target.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;try{const result=await serverJson(id?'/api/quotes/'+encodeURIComponent(id):'/api/quotes',{method:id?'PUT':'POST',body:JSON.stringify(payload)}),q=result.quote;const local={id:q.id,ref:q.reference,status:'Brouillon',title:q.title,job:q.projectId,client:q.client,clientAddress:q.clientAddress,date:q.date,validUntil:q.validUntil,deposit:q.deposit,paymentTerms:q.paymentTerms,notes:q.notes,exclusions:q.exclusions,lines:q.lines};const pos=quotes.findIndex(item=>String(item.id)===String(id));if(pos>=0)quotes[pos]=local;else quotes.push(local);closeModal();navigate('quotes');toast('Devis enregistré sur le serveur.')}catch(error){const target=document.querySelector('#quoteError');if(target)target.textContent=error.message;else toast(error.message);if(button)button.disabled=false}}

saveExpenseReceipt=async function(event){event.preventDefault();if(!requireField('submitExpense','Vous ne pouvez pas déposer de dépense.'))return;const form=new FormData(event.target),file=form.get('file'),category=String(form.get('customCategory')||form.get('category')||'').trim(),jobId=String(form.get('job')||'0'),button=event.target.querySelector('button[type="submit"],button:not([type])');if(!file?.name||!category)return;if(button)button.disabled=true;const operationKey=event.target.dataset.operationKey||(event.target.dataset.operationKey=`expense-${crypto.randomUUID()}`);try{const expense=await serverJson('/api/expenses',{method:'POST',body:JSON.stringify({supplierId:null,supplierReference:String(form.get('supplier')||'').trim(),projectId:jobId==='0'?null:jobId,category,description:String(form.get('note')||form.get('supplier')||category).trim(),expenseDate:form.get('date'),total:+form.get('amount'),vatAmount:0,paymentStatus:'unpaid',paymentDate:null,documentName:file.name,operationKey})});const upload=new FormData();upload.set('file',file);upload.set('operationKey','expense-receipt:'+expense.id);upload.set('title',file.name);upload.set('description',String(form.get('note')||''));upload.set('category','invoice');upload.set('reference',String(form.get('supplier')||''));upload.set('sensitivity','standard');upload.set('relations',JSON.stringify([{type:'expense',targetId:expense.id},...(jobId==='0'?[]:[{type:'project',targetId:jobId}])]));await serverJson('/api/documents',{method:'POST',body:upload});closeModal();serverFinanceState='idle';render();toast('Pièce et dépense enregistrées sur le serveur.')}catch(error){toast(error.message||'Enregistrement refusé.');if(button)button.disabled=false}}

/* IA-C — commercial/finance UX: server-backed quotes + scalable finance lists */
let iaCQuotesState='idle',iaCQuotesError='',iaCFinanceSection='invoices',iaCFinanceQuery='',iaCInvoiceStatus='all',iaCExpenseStatus='all',iaCFinanceVisibleCount=5;
let iaCQuoteQuery='',iaCQuoteStatus='all',iaCQuoteVisibleCount=5;

function iaCQuoteStatusLabel(status){
  return ({draft:'Brouillon',sent:'À présenter',accepted:'Accepté',rejected:'Refusé',expired:'Expiré'})[status]||status||'Brouillon';
}
function iaCQuoteStatusCode(label){
  return ({Brouillon:'draft','À présenter':'sent',Accepté:'accepted',Refusé:'rejected',Expiré:'expired'})[label]||'draft';
}
async function iaCLoadQuotes(){
  if(iaCQuotesState==='loading')return;
  iaCQuotesState='loading';iaCQuotesError='';
  try{
    const data=await serverJson('/api/quotes');
    quotes=(data.quotes||[]).map(q=>({...q,id:q.id,ref:q.reference,status:iaCQuoteStatusLabel(q.status),serverStatus:q.status,job:q.projectId}));
    iaCQuotesState='ready';
  }catch(error){iaCQuotesState='error';iaCQuotesError=error.message||'Devis serveur indisponibles.'}
  if(view==='quotes')render();
}
function iaCQuotesView(){
  if(iaCQuotesState==='idle')queueMicrotask(iaCLoadQuotes);
  if(iaCQuotesState==='loading'||iaCQuotesState==='idle')return heading('Devis','Chaîne commerciale serveur : devis, TVA, acceptation et suivi.',false)+'<section class="panel loading-card"><strong>Chargement des devis…</strong></section>';
  if(iaCQuotesState==='error')return heading('Devis','Chaîne commerciale serveur : devis, TVA, acceptation et suivi.',false)+'<section class="panel load-error"><h2>Devis indisponibles</h2><p>'+esc(iaCQuotesError)+'</p><button class="btn" onclick="iaCQuotesState=\'idle\';render()">Réessayer</button></section>';
  const query=String(iaCQuoteQuery||'').trim().toLowerCase();
  const statuses=['Tous','Brouillon','À présenter','Accepté','Refusé','Expiré'];
  const filtered=quotes.filter(q=>(iaCQuoteStatus==='all'||q.status===iaCQuoteStatus)&&[q.ref,q.title,q.client,q.status].join(' ').toLowerCase().includes(query)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(a.ref||'').localeCompare(String(b.ref||''),'fr'));
  const visible=filtered.slice(0,iaCQuoteVisibleCount),remaining=Math.max(0,filtered.length-visible.length);
  const totalAccepted=filtered.filter(q=>q.status==='Accepté').reduce((n,q)=>n+quoteGross(q),0);
  return heading('Devis','Chaîne commerciale serveur : devis, TVA, acceptation et suivi.',false)+
    '<div class="quote-summary"><div><small>Devis suivis</small><strong>'+filtered.length+'</strong></div><div><small>Acceptés · TVAC</small><strong>'+money(totalAccepted)+'</strong></div><button class="btn primary" onclick="quoteForm()">+ Créer un devis</button></div>'+
    '<div class="ia-c-finance-toolbar"><input placeholder="Rechercher référence, client, chantier…" value="'+esc(iaCQuoteQuery)+'" oninput="iaCQuoteQuery=this.value;iaCQuoteVisibleCount=5;render()"><div class="filter-pills">'+statuses.map(s=>'<button class="'+(iaCQuoteStatus===s|| (s==='Tous'&&iaCQuoteStatus==='all')?'selected':'')+'" onclick="iaCQuoteStatus='+(s==='Tous'?"'all'":"'"+jsString(s)+"'")+';iaCQuoteVisibleCount=5;render()">'+s+'</button>').join('')+'</div></div>'+
    '<section class="panel quote-list"><div class="quote-list-head"><span>Référence / objet</span><span>Client & chantier</span><span>Validité</span><span>Total TVAC</span><span>État</span><span></span></div>'+
    (visible.map(q=>{const j=jobs.find(x=>String(x.id)===String(q.job));return '<button class="quote-list-row" onclick="showQuote(\''+jsString(q.id)+'\')"><span><b>'+esc(q.ref||'Devis')+'</b><small>'+esc(q.title||'')+'</small></span><span><b>'+esc(q.client||j?.client||'')+'</b><small>'+esc(j?.name||'Chantier')+'</small></span><span>'+fullDate(q.validUntil)+'</span><strong>'+money(quoteGross(q))+'</strong><span class="badge '+(q.status==='Accepté'?'green':'warn')+'">'+esc(q.status)+'</span><i>↗</i></button>'}).join('')||'<div class="empty">Aucun devis correspondant.</div>')+
    (remaining>0?'<div class="ia-c-list-more"><button class="btn" onclick="iaCQuoteVisibleCount=quotes.length;render()">Afficher les '+remaining+' autres</button></div>':'')+
    '</section><p class="help-line">Les prix et taux restent soumis aux permissions Finance/RBAC. Les données sont enregistrées côté serveur.</p>';
}
quotesView=iaCQuotesView;

saveQuote=async function(event,id){
  event.preventDefault();
  if(!canModuleAction('quotes',id?'edit':'add'))return denyAccess('Vous ne pouvez pas enregistrer ce devis.');
  const form=new FormData(event.target),labels=form.getAll('label'),descriptions=form.getAll('description'),qtys=form.getAll('qty'),units=form.getAll('unit'),prices=form.getAll('price'),vats=form.getAll('vat');
  const error=document.querySelector('#quoteError');
  if(!labels.length||labels.some(value=>!String(value).trim())){if(error)error.textContent='Ajoutez au moins une ligne de travaux.';return}
  const lines=labels.map((label,index)=>({label:String(label).trim(),description:String(descriptions[index]||'').trim(),qty:+qtys[index],unit:String(units[index]||'forfait').trim(),price:+prices[index],vat:+vats[index]}));
  if(lines.some(line=>!line.unit||!Number.isFinite(line.qty)||!Number.isFinite(line.price)||line.qty<=0||line.price<0||![0,6,12,21].includes(line.vat))){if(error)error.textContent='Une ligne de devis est invalide.';return}
  const existing=id?quotes.find(q=>String(q.id)===String(id)):null;
  const payload={projectId:String(form.get('job')),reference:existing?.ref||'',status:existing?.serverStatus||'draft',title:String(form.get('title')||'').trim(),client:String(form.get('client')||'').trim(),clientAddress:String(form.get('clientAddress')||'').trim(),date:form.get('date'),validUntil:form.get('validUntil'),deposit:+form.get('deposit')||0,paymentTerms:String(form.get('paymentTerms')||'').trim(),notes:String(form.get('notes')||'').trim(),exclusions:String(form.get('exclusions')||'').trim(),lines};
  const button=event.target.querySelector('button.primary');if(button)button.disabled=true;
  try{
    const result=await serverJson(id?'/api/quotes/'+encodeURIComponent(id):'/api/quotes',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
    const q=result.quote;const local={...q,id:q.id,ref:q.reference,status:iaCQuoteStatusLabel(q.status),serverStatus:q.status,job:q.projectId};
    const pos=quotes.findIndex(item=>String(item.id)===String(q.id));if(pos>=0)quotes[pos]=local;else quotes.unshift(local);
    closeModal();iaCQuotesState='ready';render();toast('Devis enregistré sur le serveur.');
  }catch(errorValue){if(error)error.textContent=errorValue.message||'Enregistrement refusé.';if(button)button.disabled=false}
};

async function iaCUpdateQuoteStatus(id,label){
  const q=quotes.find(item=>String(item.id)===String(id));if(!q)return;
  const status=iaCQuoteStatusCode(label);
  try{
    await serverJson('/api/quotes/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({projectId:String(q.job),reference:q.ref||'',status,title:q.title||'',client:q.client||'',clientAddress:q.clientAddress||'',date:q.date,validUntil:q.validUntil,deposit:q.deposit||0,paymentTerms:q.paymentTerms||'',notes:q.notes||'',exclusions:q.exclusions||'',lines:q.lines||[]})});
    q.status=label;q.serverStatus=status;iaCQuotesState='idle';await iaCLoadQuotes();toast('Statut du devis enregistré.');
  }catch(error){toast(error.message||'Mise à jour du devis refusée.')}
}
const iaCShowQuoteBase=showQuote;
showQuote=function(id){
  iaCShowQuoteBase(id);
  const select=document.querySelector('#modalbody select[onchange*="quotes.find"]');
  if(select)select.setAttribute('onchange',"iaCUpdateQuoteStatus('"+jsString(id)+"',this.value)");
};

function iaCFinanceRows(){
  const query=String(iaCFinanceQuery||'').trim().toLowerCase();
  const invoices=serverInvoices.filter(x=>(iaCInvoiceStatus==='all'||invoiceStatusLabel(x.status)===iaCInvoiceStatus||x.status===iaCInvoiceStatus)&&[x.invoiceNumber,x.client,x.projectName,x.status].join(' ').toLowerCase().includes(query)).sort((a,b)=>String(b.issueDate||'').localeCompare(String(a.issueDate||'')));
  const expenses=serverExpenses.filter(x=>(iaCExpenseStatus==='all'||x.payment_status===iaCExpenseStatus)&&[x.description,x.category,x.document_name,x.supplier_name].join(' ').toLowerCase().includes(query)).sort((a,b)=>String(b.expense_date||'').localeCompare(String(a.expense_date||'')));
  return {invoices,expenses};
}
function iaCFinanceToolbar(){
  return '<div class="ia-c-finance-toolbar"><input placeholder="Rechercher facture, client, fournisseur, dépense…" value="'+esc(iaCFinanceQuery)+'" oninput="iaCFinanceQuery=this.value;iaCFinanceVisibleCount=5;render()"><div class="module-switch"><button class="'+(iaCFinanceSection==='invoices'?'selected':'')+'" onclick="iaCFinanceSection=\'invoices\';iaCFinanceVisibleCount=5;render()">Factures</button><button class="'+(iaCFinanceSection==='expenses'?'selected':'')+'" onclick="iaCFinanceSection=\'expenses\';iaCFinanceVisibleCount=5;render()">Dépenses</button></div></div>';
}
function iaCInvoicesPanel(){
  if(serverFinanceState!=='ready')return '<section class="panel loading-card"><strong>Chargement des factures serveur…</strong></section>';
  const rows=iaCFinanceRows().invoices,visible=rows.slice(0,iaCFinanceVisibleCount),remaining=Math.max(0,rows.length-visible.length);
  const statuses=[['all','Tous'],['unpaid','À recevoir'],['partially_paid','Partiellement payée'],['paid','Payée'],['credited','Soldée par avoir'],['credit_due','Crédit client']];
  return '<section class="panel server-invoices"><div class="panel-head"><div><p class="eyebrow">FACTURES CLIENTS · SERVEUR</p><h2>'+rows.length+' facture(s)</h2><span>Paiements, avoirs et soldes calculés côté serveur.</span></div><button class="btn primary" onclick="serverInvoiceForm()">+ Facture client</button></div>'+
    '<div class="filter-pills">'+statuses.map(s=>'<button class="'+(iaCInvoiceStatus===s[0]?'selected':'')+'" onclick="iaCInvoiceStatus=\''+s[0]+'\';iaCFinanceVisibleCount=5;render()">'+s[1]+'</button>').join('')+'</div>'+
    '<div class="data-table"><table><thead><tr><th>Facture</th><th>Total</th><th>Payé</th><th>Avoirs</th><th>Restant</th><th>État</th></tr></thead><tbody>'+
    (visible.map(invoice=>'<tr><td><button class="link" onclick="openServerInvoice(\''+jsString(invoice.id)+'\')"><strong>'+esc(invoice.invoiceNumber)+'</strong></button></td><td>'+centsMoney(invoice.totalCents)+'</td><td>'+centsMoney(invoice.paidCents)+'</td><td>'+centsMoney(invoice.creditNoteCents)+'</td><td><strong>'+centsMoney(invoice.remainingCents)+'</strong></td><td><span class="badge '+(invoice.status==='paid'||invoice.status==='credited'?'green':invoice.status==='partially_paid'?'warn':'')+'">'+esc(invoiceStatusLabel(invoice.status))+'</span></td></tr>').join('')||'<tr><td colspan="6"><div class="empty">Aucune facture correspondante.</div></td></tr>')+
    '</tbody></table></div>'+(remaining>0?'<div class="ia-c-list-more"><button class="btn" onclick="iaCFinanceVisibleCount=serverInvoices.length;render()">Afficher les '+remaining+' autres</button></div>':'')+'</section>';
}
function iaCExpensesPanel(){
  if(serverFinanceState!=='ready')return '<section class="panel loading-card"><strong>Chargement des dépenses serveur…</strong></section>';
  const rows=iaCFinanceRows().expenses,visible=rows.slice(0,iaCFinanceVisibleCount),remaining=Math.max(0,rows.length-visible.length);
  const statuses=[['all','Tous'],['unpaid','À payer'],['partial','Partielle'],['paid','Payée']];
  return '<section class="panel server-expenses"><div class="panel-head"><div><p class="eyebrow">DÉPENSES · SERVEUR</p><h2>'+rows.length+' dépense(s)</h2><span>Achats, tickets et factures fournisseurs.</span></div><button class="btn primary" onclick="serverExpenseForm()">+ Ajouter une dépense</button></div>'+
    '<div class="filter-pills">'+statuses.map(s=>'<button class="'+(iaCExpenseStatus===s[0]?'selected':'')+'" onclick="iaCExpenseStatus=\''+s[0]+'\';iaCFinanceVisibleCount=5;render()">'+s[1]+'</button>').join('')+'</div>'+
    '<div class="data-table"><table><thead><tr><th>Date</th><th>Description</th><th>Catégorie</th><th>Montant TVAC</th><th>Paiement</th><th>Justificatif</th></tr></thead><tbody>'+
    (visible.map(item=>'<tr><td>'+fullDate(item.expense_date)+'</td><td><strong>'+esc(item.description)+'</strong><small>'+esc(item.supplier_name||'')+(item.supplier_reference?' · N° '+esc(item.supplier_reference):'')+'</small></td><td>'+esc(item.category)+'</td><td><strong>'+centsMoney(item.total_cents)+'</strong><small>TVA '+centsMoney(item.vat_amount_cents)+'</small></td><td><span class="badge '+(item.payment_status==='paid'?'green':'warn')+'">'+(item.payment_status==='paid'?'Payée':'À payer')+'</span></td><td>'+(item.document_name?'<span class="badge">'+esc(item.document_name)+'</span>':'<span class="subtle">Manquant</span>')+'</td></tr>').join('')||'<tr><td colspan="6"><div class="empty">Aucune dépense correspondante.</div></td></tr>')+
    '</tbody></table></div>'+(remaining>0?'<div class="ia-c-list-more"><button class="btn" onclick="iaCFinanceVisibleCount=serverExpenses.length;render()">Afficher les '+remaining+' autres</button></div>':'')+'</section>';
}
const iaCAccountingViewBase=accountingView;
accountingView=function(){
  if(serverFinanceState==='idle')queueMicrotask(loadServerFinance);
  const section=iaCFinanceSection==='expenses'?iaCExpensesPanel():iaCInvoicesPanel();
  return managementTabs('accounting')+heading('Comptabilité','Trésorerie, factures, dépenses et suivi commercial.',false)+simulationStatusPanel()+serverFinancePanel()+iaCFinanceToolbar()+section+jobProgressAccountingView()+'<p class="notice">Les opérations financières visibles ici sont serveur et tenant-scoped. Les déclarations fiscales définitives restent à valider avec le comptable.</p>';
};

/* IA-C — banque et rapprochement serveur */
let iaCBankState='idle',iaCBankAccounts=[],iaCBankTransactions=[];
async function iaCLoadBank(){
  if(iaCBankState==='loading')return;
  iaCBankState='loading';render();
  try{
    const [accountsData,transactionsData]=await Promise.all([serverJson('/api/bank/accounts'),serverJson('/api/bank/transactions?limit=250')]);
    iaCBankAccounts=Array.isArray(accountsData.accounts)?accountsData.accounts:[];
    iaCBankTransactions=Array.isArray(transactionsData.transactions)?transactionsData.transactions:[];
    iaCBankState='ready';
  }catch(error){iaCBankState='error';}
  render();
}
async function iaCAddBankAccount(){
  const name=window.prompt('Nom du compte bancaire');if(!name)return;
  const iban=window.prompt('IBAN (optionnel)')||'',openingRaw=window.prompt('Solde initial en euros','0')||'0',opening=Math.round(Number(openingRaw.replace(',','.'))*100);
  if(!Number.isSafeInteger(opening))return toast('Solde initial invalide.');
  try{const data=await serverJson('/api/bank/accounts',{method:'POST',body:JSON.stringify({name,iban,currency:'EUR',openingBalanceCents:opening})});iaCBankAccounts.unshift(data.account);render();toast('Compte bancaire enregistré sur le serveur.')}catch(error){toast(error.message||'Compte bancaire non enregistré.')}
}
async function iaCAddBankTransaction(){
  if(!iaCBankAccounts.length)return toast('Créez d’abord un compte bancaire.');
  modal('Ajouter un mouvement bancaire',`<form onsubmit="iaCSaveBankTransaction(event)"><label>Compte<select name="bankAccountId" required>${iaCBankAccounts.map(account=>`<option value="${esc(account.id)}">${esc(account.name)} · ${centsMoney(account.currentBalanceCents)}</option>`).join('')}</select></label><div class="form-two"><label>Date<input type="date" name="transactionDate" value="${reference}" required></label><label>Montant (€)<input type="number" name="amount" step="0.01" placeholder="+ encaissement · − sortie" required></label></div><label>Contrepartie<input name="counterpartyName" maxlength="180" placeholder="Client ou fournisseur"></label><label>Libellé<input name="description" maxlength="240" required></label><label>Référence bancaire<input name="reference" maxlength="180"></label><p class="notice">Saisie d’un mouvement observé : aucun paiement de facture n’est créé automatiquement. Le rapprochement se fera séparément après vérification.</p><p class="form-error" id="iaCBankCreateError" role="alert"></p><div class="modal-actions"><button type="button" class="btn" onclick="closeModal()">Annuler</button><button class="btn primary">Enregistrer le mouvement</button></div></form>`);
}
async function iaCSaveBankTransaction(event){event.preventDefault();const form=event.target,data=new FormData(form),button=form.querySelector('button.primary'),amount=Math.round(Number(String(data.get('amount')||'').replace(',','.'))*100),error=form.querySelector('#iaCBankCreateError');if(!Number.isSafeInteger(amount)||amount===0){error.textContent='Le montant doit être différent de zéro.';return}button.disabled=true;try{await serverJson('/api/bank/transactions',{method:'POST',body:JSON.stringify({bankAccountId:String(data.get('bankAccountId')),transactionDate:String(data.get('transactionDate')),amountCents:amount,currency:'EUR',description:String(data.get('description')||'').trim(),reference:String(data.get('reference')||'').trim(),counterpartyName:String(data.get('counterpartyName')||'').trim(),operationKey:'ui-bank-'+crypto.randomUUID()})});closeModal();await iaCLoadBank();serverFinanceState='idle';await loadServerFinance();toast('Mouvement enregistré. Aucun paiement de facture n’a été généré.')}catch(value){error.textContent=value.message||'Mouvement refusé.';button.disabled=false}}
async function iaCReconcileBankTransaction(id){
  const tx=iaCBankTransactions.find(item=>String(item.id)===String(id));if(!tx)return;
  const invoiceOptions=serverInvoices.filter(item=>item.remainingCents>0&&tx.amountCents>0).map(item=>`<option value="invoice:${esc(item.id)}">Client · ${esc(item.invoiceNumber)} · ${esc(item.client||'Client')} · reste ${centsMoney(item.remainingCents)}</option>`).join(''),expenseOptions=serverExpenses.filter(item=>Number(item.remainingCents??item.remaining_cents??item.subtotal_cents??0)>0&&tx.amountCents<0).map(item=>`<option value="expense:${esc(item.id)}">Fournisseur · ${esc(item.supplier_name||item.description)} · reste HTVA ${centsMoney(Number(item.remainingCents??item.remaining_cents??item.subtotal_cents??0))}</option>`).join('');
  modal('Vérifier le rapprochement',`<p class="notice"><strong>${esc(tx.counterpartyName||tx.description||'Mouvement')}</strong> · ${fullDate(tx.transactionDate)} · ${centsMoney(tx.amountCents)}<br>Choisissez une pièce correspondante. SOCLE ne validera pas de paiement de facture sans confirmation séparée.</p><form onsubmit="iaCSaveBankReconciliation(event,'${jsString(id)}')"><label>Facture ou dépense<select name="target" required><option value="">Choisir une pièce…</option>${invoiceOptions}${expenseOptions}</select></label><p class="help-line">Le rapprochement relie les deux éléments pour le suivi. Vérifiez le montant, la contrepartie et la référence avant de confirmer.</p><p class="form-error" id="iaCBankMatchError" role="alert"></p><div class="modal-actions"><button type="button" class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" ${invoiceOptions||expenseOptions?'':'disabled'}>Confirmer le rapprochement</button></div></form>`);
}
async function iaCSaveBankReconciliation(event,id){event.preventDefault();const form=event.target,value=String(new FormData(form).get('target')||''),separator=value.indexOf(':'),matchType=value.slice(0,separator),matchId=value.slice(separator+1),button=form.querySelector('button.primary'),error=form.querySelector('#iaCBankMatchError');if(!['invoice','expense'].includes(matchType)||!matchId){error.textContent='Choisissez une facture ou une dépense.';return}button.disabled=true;try{await serverJson('/api/bank/transactions/'+encodeURIComponent(id)+'/reconcile',{method:'POST',body:JSON.stringify({matchType,matchId})});closeModal();await iaCLoadBank();toast('Rapprochement enregistré après confirmation.')}catch(value){error.textContent=value.message||'Rapprochement refusé.';button.disabled=false}}
async function iaCUnreconcileBankTransaction(id){
  try{await serverJson('/api/bank/transactions/'+encodeURIComponent(id)+'/unreconcile',{method:'POST',body:JSON.stringify({})});await iaCLoadBank();toast('Rapprochement annulé.')}catch(error){toast(error.message||'Annulation du rapprochement refusée.')}
}
function iaCBankPanel(){
  if(iaCBankState==='idle'){queueMicrotask(iaCLoadBank);return '<section class="panel loading-card"><strong>Chargement de la banque serveur…</strong></section>';}
  if(iaCBankState==='loading')return '<section class="panel loading-card"><strong>Chargement de la banque serveur…</strong></section>';
  if(iaCBankState==='error')return '<section class="panel load-error"><h2>Banque serveur indisponible</h2><button class="btn" onclick="iaCBankState=\'idle\';render()">Réessayer</button></section>';
  const accountCards=iaCBankAccounts.map(a=>'<div class="detail-row"><span><strong>'+esc(a.name)+'</strong><small>'+esc(a.iban||'IBAN non renseigné')+' · '+esc(a.currency)+'</small></span><strong>'+centsMoney(a.currentBalanceCents)+'</strong></div>').join('');
  const txRows=iaCBankTransactions.slice(0,25).map(tx=>'<tr><td>'+fullDate(tx.transactionDate)+'</td><td><strong>'+esc(tx.counterpartyName||tx.description||'Mouvement')+'</strong><small>'+esc(tx.reference||'')+'</small></td><td>'+centsMoney(tx.amountCents)+'</td><td><span class="badge '+(tx.status==='reconciled'?'green':tx.status==='ignored'?'':'warn')+'">'+(tx.status==='reconciled'?'Rapproché':tx.status==='ignored'?'Ignoré':'À rapprocher')+'</span></td><td>'+(tx.status==='reconciled'?'<button class="btn" onclick="iaCUnreconcileBankTransaction(\''+jsString(tx.id)+'\')">Annuler le rapprochement</button>':tx.status==='ignored'?'<span class="subtle">Exclu</span>':'<button class="btn" onclick="iaCReconcileBankTransaction(\''+jsString(tx.id)+'\')">Vérifier et rapprocher</button>')+'</td></tr>').join('');
  return '<section class="panel ia-c-bank-panel"><div class="panel-head"><div><p class="eyebrow">BANQUE · SERVEUR</p><h2>'+iaCBankAccounts.length+' compte(s) · '+iaCBankTransactions.length+' mouvement(s)</h2><span>Le solde déclaré du compte reste distinct des pièces et paiements SOCLE.</span></div><div class="contact-actions"><button class="btn" onclick="iaCAddBankAccount()">+ Compte</button><button class="btn primary" onclick="iaCAddBankTransaction()">+ Saisir un mouvement</button></div></div><div class="detail-list">'+(accountCards||'<div class="empty">Aucun compte bancaire.</div>')+'</div><div class="data-table"><table><thead><tr><th>Date</th><th>Contrepartie</th><th>Montant</th><th>État</th><th></th></tr></thead><tbody>'+(txRows||'<tr><td colspan="5"><div class="empty">Aucun mouvement bancaire.</div></td></tr>')+'</tbody></table></div></section>';
}
function iaCAccountingInbox(){if(serverFinanceState!=='ready')return '';const missingAllocation=serverExpenses.filter(item=>Number(item.remainingCents??item.remaining_cents??item.subtotal_cents??0)>0),missingProject=serverExpenses.filter(item=>!item.project_id&&!item.purchase_order_id),missingDocument=serverExpenses.filter(item=>!item.document_name),missingSupplier=serverExpenses.filter(item=>!item.supplier_id&&!item.supplier_name),unlinkedInvoices=serverInvoices.filter(item=>!item.projectId),lateInvoices=serverInvoices.filter(item=>item.status!=='paid'&&item.status!=='credited'&&item.status!=='credit_due'&&item.dueDate&&item.dueDate<reference);const items=[{count:missingAllocation.length,label:'dépenses à ventiler',detail:'Un montant HTVA reste à affecter.',action:"iaCFinanceSection='expenses';render()"},{count:missingProject.length,label:'dépenses sans chantier ni commande',detail:'À rattacher si elles concernent un chantier.',action:"iaCFinanceSection='expenses';render()"},{count:missingDocument.length,label:'justificatifs manquants',detail:'Le nom de fichier ne remplace pas une pièce lisible.',action:"iaCFinanceSection='expenses';render()"},{count:missingSupplier.length,label:'fournisseurs à préciser',detail:'Vérifier l’identité du fournisseur.',action:"iaCFinanceSection='expenses';render()"},{count:unlinkedInvoices.length,label:'factures client sans chantier',detail:'À rattacher au chantier concerné.',action:"iaCFinanceSection='invoices';render()"},{count:lateInvoices.length,label:'factures client en retard',detail:'Vérifier le paiement avant relance.',action:"iaCFinanceSection='invoices';iaCInvoiceStatus='unpaid';render()"},{count:Number(globalThis.serverFinance?.bankUnreconciled||0),label:'mouvements bancaires à rapprocher',detail:'Chaque rapprochement reste à confirmer par une personne.',action:"document.querySelector('.ia-c-bank-panel')?.scrollIntoView({behavior:'smooth',block:'start'})"}].filter(item=>item.count>0);return '<section class="panel ia-c-accounting-inbox"><div class="panel-head"><div><p class="eyebrow">À TRAITER · CONTRÔLE HUMAIN</p><h2>'+items.reduce((sum,item)=>sum+item.count,0)+' point(s) à vérifier</h2><span>Des alertes pour compléter les données — aucune écriture comptable n’est générée automatiquement.</span></div><span class="badge '+(items.length?'warn':'green')+'">'+(items.length?'À vérifier':'Tout est à jour')+'</span></div>'+(items.length?'<div class="ia-c-inbox-grid">'+items.map(item=>'<button class="ia-c-inbox-item" onclick="'+item.action+'"><strong>'+item.count+'</strong><span><b>'+item.label+'</b><small>'+item.detail+'</small></span><i>Ouvrir →</i></button>').join('')+'</div>':'<p class="empty">Aucune pièce incomplète selon les informations actuellement enregistrées.</p>')+'</section>'}
function iaCAccountingView(){
  if(serverFinanceState==='idle')queueMicrotask(loadServerFinance);
  const section=iaCFinanceSection==='expenses'?iaCExpensesPanel():iaCInvoicesPanel();
  return managementTabs('accounting')+heading('Comptabilité','Un cockpit simple : ce qui est en banque, ce qui est dû et ce qui reste à vérifier.',false)+simulationStatusPanel()+serverFinancePanel()+iaCAccountingInbox()+iaCFinanceToolbar()+iaCBankPanel()+section+jobProgressAccountingView()+'<p class="notice">Le solde bancaire est séparé des factures et dépenses. Un rapprochement ne crée jamais un paiement automatiquement. La marge chantier reste une estimation tant que les heures, achats et pièces utiles ne sont pas complets. Les déclarations fiscales définitives restent à valider avec le comptable.</p>';
}
accountingView=iaCAccountingView;
