/* E2E-02 — QUOTE-PREPROJECT-LIFECYCLE
 * Commercial quotes can exist with organization + canonical customer only.
 * No project, financial baseline, stock movement or delivery is created here.
 */
let e2e02CustomerCatalogReady=false;

function e2e02CustomerLabel(customer){
  return String(customer?.companyName||[customer?.firstName,customer?.lastName].filter(Boolean).join(' ')||customer?.id||'').trim();
}
function e2e02CustomerAddress(customer){
  const locality=[customer?.postalCode,customer?.city].filter(Boolean).join(' ').trim();
  return [customer?.street,locality].filter(Boolean).join(', ').trim();
}
async function e2e02EnsureCustomers(){
  if(e2e02CustomerCatalogReady)return;
  if(typeof iaCServerDirectoryState!=='undefined'&&iaCServerDirectoryState==='ready'){
    e2e02CustomerCatalogReady=true;
    return;
  }
  const data=await serverJson('/api/customers?limit=250');
  iaCCustomers=Array.isArray(data.customers)?data.customers:[];
  e2e02CustomerCatalogReady=true;
}
function e2e02ApplyCustomer(select){
  const customer=iaCCustomers.find(item=>String(item.id)===String(select.value||'')),form=select.form;
  if(!form)return;
  const client=form.querySelector('[name="client"]'),address=form.querySelector('[name="clientAddress"]');
  if(customer){
    if(client){client.value=e2e02CustomerLabel(customer);client.readOnly=true}
    if(address&&!address.value)address.value=e2e02CustomerAddress(customer);
  }else if(client){
    client.readOnly=false;
  }
}
function e2e02QuoteFormMarkup(id='',draftId='',preferredCustomerId=''){
  const quote=quotes.find(item=>String(item.id)===String(id||''))||{
    title:'',job:null,projectId:null,customerId:null,client:'',clientAddress:'',
    date:reference,validUntil:isoDay(reference,30),deposit:30,
    paymentTerms:'Acompte à la commande, situations suivant avancement, solde à la réception.',
    exclusions:'Travaux imprévus non décrits dans le devis.',notes:'',
    lines:[{label:'',description:'',qty:1,unit:'forfait',price:0,vat:6}]
  };
  const draft=typeof quoteDrafts!=='undefined'?quoteDrafts.find(item=>String(item.id)===String(draftId||'')):null;
  const projectId=quote.projectId??quote.job??null;
  const selectedCustomerId=String(preferredCustomerId||draft?.customerId||quote.customerId||'');
  const selectedCustomer=iaCCustomers.find(item=>String(item.id)===selectedCustomerId);
  const legacyProjectLinked=Boolean(id&&projectId&&!selectedCustomerId);
  const customerRequired=!legacyProjectLinked;
  const clientValue=selectedCustomer?e2e02CustomerLabel(selectedCustomer):(draft?.contact||quote.client||'');
  const addressValue=quote.clientAddress||e2e02CustomerAddress(selectedCustomer)||draft?.place||'';
  const titleValue=draft?('Devis à établir · '+draft.place):quote.title;
  const notesValue=draft?[quote.notes||'', 'Adresse de la visite : '+draft.place, 'Relevé terrain : '+(draft.notes||'voir dossier de visite.')].filter(Boolean).join('\n\n'):quote.notes||'';
  const customerOptions=[
    '<option value="">'+(legacyProjectLinked?'Client historique · conserver le libellé':'Choisir le client…')+'</option>',
    ...iaCCustomers.map(customer=>'<option value="'+esc(customer.id)+'" '+(String(customer.id)===selectedCustomerId?'selected':'')+'>'+esc(e2e02CustomerLabel(customer))+'</option>')
  ].join('');
  const projectOptions=[
    '<option value="">Aucun chantier · devis commercial</option>',
    ...jobs.map(job=>'<option value="'+esc(job.id)+'" '+(String(job.id)===String(projectId||'')?'selected':'')+'>'+esc(job.name)+' · '+esc(job.client||job.town||'')+'</option>')
  ].join('');
  const idArg=id?"'"+jsString(String(id))+"'":"''";
  return '<form class="quote-editor e2e02-quote-editor" data-e2e02-preproject="true" onsubmit="e2e02SaveQuote(event,'+idArg+')">'+
    '<section><p class="form-section-title">Client & chantier</p>'+
    '<div class="form-two">'+
      '<label>Client canonique<select name="customerId" '+(customerRequired?'required':'')+' onchange="e2e02ApplyCustomer(this)">'+customerOptions+'</select></label>'+
      '<label>Chantier <span class="subtle">(facultatif)</span><select name="job">'+projectOptions+'</select></label>'+
    '</div>'+
    '<p class="help-line">Le devis peut être préparé et accepté avant la création du chantier. La conversion chantier sera une étape séparée.</p>'+
    '<div class="form-two">'+
      '<label>Libellé client<input name="client" required maxlength="120" value="'+esc(clientValue)+'" '+(selectedCustomer?'readonly':'')+'></label>'+
      '<label>Adresse client / lieu prévu<input name="clientAddress" required maxlength="200" value="'+esc(addressValue)+'"></label>'+
    '</div>'+
    '<label>Objet du devis<input name="title" required maxlength="150" value="'+esc(titleValue)+'"></label>'+
    '<div class="form-two"><label>Date du devis<input name="date" type="date" required value="'+esc(quote.date)+'"></label><label>Valable jusqu’au<input name="validUntil" type="date" required value="'+esc(quote.validUntil)+'"></label></div>'+
    '</section>'+
    '<section><div class="quote-lines-title"><p class="form-section-title">Détail des travaux</p><button type="button" class="link" onclick="addQuoteLine()">+ Ajouter une ligne</button></div>'+
    '<div class="catalogue-picker"><small>Ajouter depuis mes ouvrages & tarifs</small><select onchange="insertCatalogueLine(this.value);this.value=\'\'"><option value="">Choisir un poste…</option>'+priceCatalog.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+' — '+money(item.price)+' / '+esc(item.unit)+'</option>').join('')+'</select></div>'+
    '<div id="quoteLines">'+(quote.lines||[]).map(quoteLine).join('')+'</div></section>'+
    '<section><p class="form-section-title">Conditions</p><div class="form-two">'+
      '<label>Acompte demandé (%)<input name="deposit" type="number" min="0" max="100" value="'+Number(quote.deposit||0)+'"></label>'+
      '<label>Conditions de paiement<input name="paymentTerms" maxlength="300" value="'+esc(quote.paymentTerms||'')+'"></label>'+
    '</div><label>Remarques<textarea name="notes" rows="3">'+esc(notesValue)+'</textarea></label><label>Exclusions / réserves<textarea name="exclusions" rows="3">'+esc(quote.exclusions||'')+'</textarea></label></section>'+
    '<p id="quoteError" class="form-error" role="alert"></p>'+
    (iaCCustomers.length?'<div class="modal-actions"><button class="btn primary">Enregistrer le devis</button></div>':'<p class="notice"><strong>Aucun client canonique disponible.</strong> Créez d’abord le client dans l’annuaire commercial.</p>')+
    '</form>';
}
function e2e02OpenQuoteForm(id='',draftId='',preferredCustomerId=''){
  if(!canModuleAction('quotes',id?'edit':'add'))return denyAccess('Vous ne pouvez pas créer ou modifier de devis.');
  modal(id?'Modifier le devis':'Créer un devis',e2e02QuoteFormMarkup(id,draftId,preferredCustomerId));
}
quoteForm=function(id='',draftId='',preferredCustomerId=''){
  if(!canModuleAction('quotes',id?'edit':'add'))return denyAccess('Vous ne pouvez pas créer ou modifier de devis.');
  e2e02EnsureCustomers()
    .then(()=>e2e02OpenQuoteForm(id,draftId,preferredCustomerId))
    .catch(error=>toast(error.message||'Annuaire clients indisponible.'));
};
function quoteFormForCustomer(customerId){
  quoteForm('','',String(customerId||''));
}
async function e2e02SaveQuote(event,id=''){
  event.preventDefault();
  if(!canModuleAction('quotes',id?'edit':'add'))return denyAccess('Vous ne pouvez pas enregistrer ce devis.');
  const form=new FormData(event.target),error=event.target.querySelector('#quoteError');
  const labels=form.getAll('label'),descriptions=form.getAll('description'),qtys=form.getAll('qty'),units=form.getAll('unit'),prices=form.getAll('price'),vats=form.getAll('vat');
  if(!labels.length||labels.some(value=>!String(value).trim())){if(error)error.textContent='Ajoutez au moins une ligne de travaux.';return}
  const lines=labels.map((label,index)=>({
    label:String(label).trim(),description:String(descriptions[index]||'').trim(),
    qty:Number(qtys[index]),unit:String(units[index]||'forfait').trim(),
    price:Number(prices[index]),vat:Number(vats[index])
  }));
  if(lines.some(line=>!line.unit||!Number.isFinite(line.qty)||!Number.isFinite(line.price)||line.qty<=0||line.price<0||![0,6,12,21].includes(line.vat))){if(error)error.textContent='Une ligne de devis est invalide.';return}
  const existing=id?quotes.find(item=>String(item.id)===String(id)):null;
  const projectId=String(form.get('job')||'').trim()||null,customerId=String(form.get('customerId')||'').trim()||null;
  if(!projectId&&!customerId){if(error)error.textContent='Choisissez un client pour un devis sans chantier.';return}
  const payload={
    projectId,customerId,reference:existing?.ref||existing?.reference||'',
    status:existing?.serverStatus||'draft',
    title:String(form.get('title')||'').trim(),
    client:String(form.get('client')||'').trim(),
    clientAddress:String(form.get('clientAddress')||'').trim(),
    date:form.get('date'),validUntil:form.get('validUntil'),
    deposit:Number(form.get('deposit'))||0,
    paymentTerms:String(form.get('paymentTerms')||'').trim(),
    notes:String(form.get('notes')||'').trim(),
    exclusions:String(form.get('exclusions')||'').trim(),lines
  };
  const button=event.target.querySelector('button.primary');if(button)button.disabled=true;
  try{
    const result=await serverJson(id?'/api/quotes/'+encodeURIComponent(id):'/api/quotes',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
    const q=result.quote,local={...q,id:q.id,ref:q.reference,status:iaCQuoteStatusLabel(q.status),serverStatus:q.status,job:q.projectId};
    const pos=quotes.findIndex(item=>String(item.id)===String(q.id));if(pos>=0)quotes[pos]=local;else quotes.unshift(local);
    let linkWarning='';const sourceDraftId=String(form.get('sourceDraftId')||'').trim();if(sourceDraftId){try{await serverJson('/api/quote-visits/'+encodeURIComponent(sourceDraftId)+'/quote',{method:'POST',body:JSON.stringify({quoteId:q.id})});await loadQuoteVisits({quiet:true})}catch(linkError){linkWarning=' Le devis existe, mais son relevé terrain n’a pas pu être rattaché : '+(linkError.message||'réessayez depuis le dossier de visite.')}}
    closeModal();iaCQuotesState='ready';render();toast((result.replayed?'Devis déjà à jour.':'Devis enregistré sur le serveur.')+linkWarning);
  }catch(errorValue){if(error)error.textContent=errorValue.message||'Enregistrement refusé.';if(button)button.disabled=false}
}
saveLinkedQuote=e2e02SaveQuote;
saveQuote=e2e02SaveQuote;

iaCUpdateQuoteStatus=async function(id,label){
  const q=quotes.find(item=>String(item.id)===String(id));if(!q)return;
  const status=iaCQuoteStatusCode(label);
  try{
    const result=await serverJson('/api/quotes/'+encodeURIComponent(id),{method:'PUT',body:JSON.stringify({
      projectId:q.projectId??q.job??null,customerId:q.customerId||null,reference:q.ref||q.reference||'',status,
      title:q.title||'',client:q.client||'',clientAddress:q.clientAddress||'',date:q.date,validUntil:q.validUntil,
      deposit:q.deposit||0,paymentTerms:q.paymentTerms||'',notes:q.notes||'',exclusions:q.exclusions||'',lines:q.lines||[]
    })});
    q.status=label;q.serverStatus=status;
    if(result.quote){q.projectId=result.quote.projectId;q.job=result.quote.projectId;q.customerId=result.quote.customerId}
    iaCQuotesState='idle';await iaCLoadQuotes();toast(result.replayed?'Statut déjà à jour.':'Statut du devis enregistré.');
  }catch(error){toast(error.message||'Mise à jour du devis refusée.')}
};

const e2e02QuotesViewBase=quotesView;
quotesView=function(){
  return e2e02QuotesViewBase().replaceAll('<small>Chantier</small>','<small>Sans chantier</small>');
};

const e2e02ContactsViewBase=contactsView;
contactsView=function(){
  return e2e02ContactsViewBase()+iaCServerDirectoryPanel();
};

const e2e02DirectoryPanelBase=iaCServerDirectoryPanel;
iaCServerDirectoryPanel=function(){
  if(iaCServerDirectoryState!=='ready')return e2e02DirectoryPanelBase();
  e2e02CustomerCatalogReady=true;
  const q=String(contactQuery||'').trim().toLowerCase();
  const customers=iaCCustomers.filter(c=>[c.companyName,c.firstName,c.lastName,c.email,c.phone,c.vatNumber].join(' ').toLowerCase().includes(q));
  const suppliers=iaCSuppliers.filter(v=>[v.name,v.email,v.phone,v.vatNumber].join(' ').toLowerCase().includes(q));
  const customerRows=customers.slice(0,25).map(c=>
    '<div class="detail-row"><span><strong>'+esc(e2e02CustomerLabel(c))+'</strong><small>'+esc(c.vatNumber||c.email||c.phone||'Coordonnées à renseigner')+'</small></span>'+
    '<span><span class="badge">Serveur</span> '+(canModuleAction('quotes','add')?'<button class="btn" type="button" onclick="quoteFormForCustomer(\''+jsString(c.id)+'\')">Créer un devis</button>':'')+'</span></div>'
  ).join('');
  const supplierRows=suppliers.slice(0,25).map(v=>'<div class="detail-row"><span><strong>'+esc(v.name)+'</strong><small>'+esc(v.vatNumber||v.email||v.phone||'Coordonnées à renseigner')+'</small></span><span class="badge">Serveur</span></div>').join('');
  return '<section class="panel ia-c-server-directory"><div class="panel-head"><div><p class="eyebrow">DONNÉES COMMERCIALES · SERVEUR</p><h2>Clients '+customers.length+' · Fournisseurs '+suppliers.length+'</h2><span>Tenant-scoped · persisté côté serveur</span></div></div><div class="ia-c-directory-columns"><div><h3>Clients</h3>'+(customerRows||'<div class="empty">Aucun client serveur.</div>')+'</div><div><h3>Fournisseurs</h3>'+(supplierRows||'<div class="empty">Aucun fournisseur serveur.</div>')+'</div></div></section>';
};

const e2e02ShowQuoteBase=showQuote;
showQuote=function(id){
  e2e02ShowQuoteBase(id);
  const q=quotes.find(item=>String(item.id)===String(id));
  if(q&&!q.projectId&&!q.job){
    document.querySelector('#modalbody .send-worker-quote')?.remove();
    const actions=document.querySelector('#modalbody .modal-actions');
    if(actions&&!actions.querySelector('.e2e02-preproject-badge'))actions.insertAdjacentHTML('afterbegin','<span class="badge e2e02-preproject-badge">Devis pré-chantier</span>');
  }
};
