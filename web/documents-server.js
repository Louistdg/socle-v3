// Point 8 — private server-backed documents. workspace_state is never a file store.
let serverDocuments=[],serverDocumentsState='idle',serverDocumentsError='',serverDocumentsNextCursor=null,serverDocumentsLoadingMore=false,docTypeFilter='',docOriginFilter='';
const documentTypeLabels={other:'Autre',report:'Rapport',signed_report:'Rapport signé',contract:'Contrat',quote:'Devis',invoice:'Facture client',supplier_invoice:'Facture fournisseur',receipt:'Ticket ou reçu',delivery_note:'Bon de livraison',purchase_order:'Commande',certificate:'Attestation',photo:'Photo',hr:'Personnel',technical:'Technique'};
const documentOriginLabels={manual_upload:'Import manuel',mobile_upload:'Mobile chantier',email_import:'E-mail',generated:'Généré par SOCLE',scanner:'Scanner',migration:'Migration',legacy:'Historique',other:'Autre'};
const documentRelationLabels={customer:'Client',supplier:'Fournisseur',person:'Personnel',project:'Chantier',quote:'Devis',invoice:'Facture client',expense:'Facture fournisseur / dépense',payment:'Paiement',purchase_order:'Commande',delivery:'Livraison',asset:'Matériel / véhicule'};
let serverDocumentsSearchTimer=0,serverDocumentsRequestToken=0;
function documentRegistryUrl({q=String(docQuery||''),documentType=docTypeFilter,origin=docOriginFilter,relationType='',relationId='',cursor='',limit=250}={}){
  const params=new URLSearchParams();
  const query=String(q||'').trim().slice(0,120);
  if(query)params.set('q',query);
  if(documentType)params.set('document_type',String(documentType));
  if(origin)params.set('origin',String(origin));
  if(relationType)params.set('relation_type',String(relationType));
  if(relationId)params.set('relation_id',String(relationId));
  if(cursor)params.set('cursor',String(cursor));
  if(limit)params.set('limit',String(limit));
  const encoded=params.toString();
  return '/api/documents'+(encoded?'?'+encoded:'');
}
async function loadServerDocuments(token=++serverDocumentsRequestToken){
  serverDocumentsState='loading';serverDocumentsError='';
  try{
    const data=await serverJson(documentRegistryUrl());
    if(token!==serverDocumentsRequestToken)return;
    serverDocuments=data.documents||[];serverDocumentsNextCursor=data.nextCursor||null;serverDocumentsState='ready';
  }catch(error){
    if(token!==serverDocumentsRequestToken)return;
    serverDocumentsError=error.message;serverDocumentsState='error';
  }
  if(token===serverDocumentsRequestToken&&view==='documents')render();
}
function queueServerDocumentsReload(){
  clearTimeout(serverDocumentsSearchTimer);
  const token=++serverDocumentsRequestToken;
  serverDocumentsState='loading';
  serverDocumentsSearchTimer=setTimeout(()=>loadServerDocuments(token),180);
}
async function loadMoreServerDocuments(){
  if(!serverDocumentsNextCursor||serverDocumentsLoadingMore||serverDocumentsState!=='ready')return;
  const token=serverDocumentsRequestToken,cursor=serverDocumentsNextCursor;
  serverDocumentsLoadingMore=true;
  if(view==='documents')render();
  try{
    const data=await serverJson(documentRegistryUrl({cursor}));
    if(token!==serverDocumentsRequestToken)return;
    const seen=new Set(serverDocuments.map(document=>String(document.id)));
    for(const document of data.documents||[])if(!seen.has(String(document.id))){serverDocuments.push(document);seen.add(String(document.id))}
    serverDocumentsNextCursor=data.nextCursor||null;
  }catch(error){
    if(token===serverDocumentsRequestToken)toast(error.message||'Page documentaire indisponible.');
  }finally{
    if(token===serverDocumentsRequestToken){serverDocumentsLoadingMore=false;if(view==='documents')render()}
  }
}
function documentRelationText(relation){return `${documentRelationLabels[relation.type]||relation.type} · ${relation.targetId}`}
function documentsServerView(){if(serverDocumentsState==='idle')queueMicrotask(loadServerDocuments);if(serverDocumentsState==='loading'||serverDocumentsState==='idle')return `<div class="simple-head"><div><p class="eyebrow">DOCUMENTS PRIVÉS</p><h1>Documents</h1><p>Chargement de la bibliothèque sécurisée…</p></div></div>`;if(serverDocumentsState==='error')return `<div class="simple-head"><div><p class="eyebrow">DOCUMENTS PRIVÉS</p><h1>Documents</h1><p>${esc(serverDocumentsError)}</p></div><button class="btn" onclick="serverDocumentsState='idle';render()">Réessayer</button></div>`;const visible=serverDocuments;return `<div class="simple-head"><div><p class="eyebrow">DOCUMENTS PRIVÉS · SERVEUR</p><h1>Documents</h1><p>Un fichier unique peut être relié à plusieurs objets métier. Les aperçus et téléchargements passent toujours par l’autorisation serveur.</p></div><button class="btn primary" onclick="documentUploadForm()">+ Importer</button></div><div class="document-toolbar"><input aria-label="Rechercher les documents" placeholder="Rechercher titre, type, relation…" value="${esc(docQuery||'')}" maxlength="120" oninput="docQuery=this.value;queueServerDocumentsReload()"><select aria-label="Filtrer par type" onchange="docTypeFilter=this.value;queueServerDocumentsReload()"><option value="">Tous les types</option>${Object.entries(documentTypeLabels).map(([value,label])=>`<option value="${value}" ${docTypeFilter===value?'selected':''}>${esc(label)}</option>`).join('')}</select><select aria-label="Filtrer par origine" onchange="docOriginFilter=this.value;queueServerDocumentsReload()"><option value="">Toutes les origines</option>${Object.entries(documentOriginLabels).map(([value,label])=>`<option value="${value}" ${docOriginFilter===value?'selected':''}>${esc(label)}</option>`).join('')}</select><button class="btn" onclick="loadServerDocuments()">Actualiser</button></div><section class="panel document-secure-list">${visible.map(document=>`<button class="document-secure-row" data-document-id="${esc(document.id)}" onclick="openSecureDocument('${jsString(document.id)}')"><span><strong>${esc(document.title||document.originalName)}</strong><small>${esc(documentTypeLabels[document.documentType]||document.documentType||'Autre')} · ${esc(document.documentDate||document.createdAt?.slice(0,10)||'—')} · ${Number(document.byteSize||0).toLocaleString('fr-BE')} octets · ${(document.relations||[]).length} relation(s)</small></span><span class="badge ${document.sensitivity==='standard'?'green':'warn'}">${esc(document.sensitivity)}</span><span aria-hidden="true">↗</span></button>`).join('')||'<div class="empty">Aucun document autorisé dans cette vue.</div>'}</section>${serverDocumentsNextCursor?`<div class="document-toolbar"><button class="btn" onclick="loadMoreServerDocuments()" ${serverDocumentsLoadingMore?'disabled':''}>${serverDocumentsLoadingMore?'Chargement…':'Afficher plus'}</button></div>`:''}<p class="help-line">Les fichiers ne sont pas exposés par URL publique et ne sont pas stockés dans workspace_state.</p>`}
documents=function(){return documentsServerView()};
function documentUploadForm(defaultRelationType='',defaultRelationId=''){const ownerType=defaultRelationType||'organization',ownerId=defaultRelationId||'';modal('Importer un document privé',`<form onsubmit="saveSecureDocument(event)" enctype="multipart/form-data"><input type="hidden" name="operationKey" value="document-${crypto.randomUUID()}"><input type="hidden" name="ownerType" value="${esc(ownerType)}"><input type="hidden" name="ownerId" value="${esc(ownerId)}"><label>Fichier PDF ou image<input type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" required></label><div class="form-two"><label>Titre<input name="title" maxlength="180"></label><label>Type documentaire<select name="documentType">${Object.entries(documentTypeLabels).map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join('')}</select></label><label>Date du document<input type="date" name="documentDate"></label><label>Origine<select name="origin">${Object.entries(documentOriginLabels).filter(([value])=>!['legacy','migration','generated'].includes(value)).map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join('')}</select></label><label>Catégorie<input name="category" maxlength="80" value="other"></label><label>Référence<input name="reference" maxlength="180"></label><label>Confidentialité<select name="sensitivity"><option value="standard">Standard</option><option value="confidential">Confidentiel</option><option value="restricted">Restreint</option></select></label></div><label>Description<textarea name="description" maxlength="2000" rows="3"></textarea></label><fieldset><legend>Première relation métier (facultative)</legend><div class="form-two"><label>Type<select name="relationType"><option value="">Aucune</option>${Object.entries(documentRelationLabels).map(([value,label])=>`<option value="${value}" ${defaultRelationType===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>ID de la ressource<input name="relationId" maxlength="200" value="${esc(defaultRelationId)}"></label></div></fieldset><p class="help-line">Depuis un chantier ou un autre contexte métier, SOCLE l’utilise comme propriétaire principal et comme relation du fichier. Le serveur valide toujours l’organisation et les permissions.</p><div id="documentFormError" class="form-error"></div><div class="modal-actions"><button class="btn primary">Importer</button></div></form>`)}
async function saveSecureDocument(event){event.preventDefault();const form=event.target,button=form.querySelector('button[type="submit"],button:not([type])'),data=new FormData(form),type=String(data.get('relationType')||''),targetId=String(data.get('relationId')||'').trim();data.delete('relationType');data.delete('relationId');data.set('relations',JSON.stringify(type&&targetId?[{type,targetId}]:[]));if(button)button.disabled=true;try{const response=await fetch('/api/documents',{method:'POST',body:data,cache:'no-store'}),result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Import refusé.');closeModal();await loadServerDocuments();toast(result.replayed?'Import déjà traité : aucun doublon créé.':'Document importé côté serveur.')}catch(error){const box=document.querySelector('#documentFormError');if(box)box.textContent=error.message;else toast(error.message);if(button)button.disabled=false}}
async function openSecureDocument(documentId){try{const data=await serverJson('/api/documents/'+encodeURIComponent(documentId)),document=data.document;modal(esc(document.title||document.originalName),`<div class="modal-inner secure-document-detail"><div class="detail-row"><span>Fichier</span><b>${esc(document.originalName)}</b></div><div class="detail-row"><span>Type documentaire</span><b>${esc(documentTypeLabels[document.documentType]||document.documentType||'Autre')}</b></div><div class="detail-row"><span>Date</span><b>${esc(document.documentDate||'—')}</b></div><div class="detail-row"><span>Origine</span><b>${esc(documentOriginLabels[document.origin]||document.origin||'—')}</b></div><div class="detail-row"><span>Propriétaire métier</span><b>${esc(document.ownerType||'organization')} · ${esc(document.ownerId||'—')}</b></div><div class="detail-row"><span>Auteur</span><b>${esc(document.uploadedBy||'—')}</b></div><div class="detail-row"><span>Format</span><b>${esc(document.contentType)}</b></div><div class="detail-row"><span>Intégrité SHA-256</span><code>${esc(document.checksumSha256||'—')}</code></div><div class="detail-row"><span>Confidentialité</span><b>${esc(document.sensitivity)}</b></div><p>${esc(document.description||'')}</p><section><div class="section-heading"><h3>Relations</h3><button class="link" onclick="secureDocumentRelationForm('${jsString(document.id)}')">+ Relation</button></div>${(document.relations||[]).map(relation=>`<div class="detail-row"><span>${esc(documentRelationText(relation))}</span><button class="link" onclick="removeSecureDocumentRelation('${jsString(document.id)}','${jsString(relation.id)}')">Retirer</button></div>`).join('')||'<div class="empty">Document non classé.</div>'}</section><div class="modal-actions"><button class="btn" onclick="openSecureDocumentFile('${jsString(document.id)}','preview')">Aperçu</button><button class="btn" onclick="openSecureDocumentFile('${jsString(document.id)}','download')">Télécharger</button><button class="btn" onclick="openSecureDocumentHistory('${jsString(document.id)}')">Historique</button><button class="btn" onclick="secureDocumentEditForm('${jsString(document.id)}')">Métadonnées</button><button class="btn danger" onclick="archiveSecureDocument('${jsString(document.id)}')">Archiver</button></div></div>`)}catch(error){toast(error.message||'Document inaccessible.')}}
function openSecureDocumentFile(documentId,kind){if(!['preview','download'].includes(kind))return toast('Action documentaire invalide.');const url=safeDocumentUrl(`/api/documents/${encodeURIComponent(documentId)}/${kind}`);if(!url)return toast('Adresse documentaire refusée.');window.open(url,'_blank','noopener,noreferrer')}
async function secureDocumentEditForm(documentId){try{const {document}=await serverJson('/api/documents/'+encodeURIComponent(documentId));modal('Métadonnées du document',`<form onsubmit="saveSecureDocumentMetadata(event,'${jsString(documentId)}')"><label>Titre<input name="title" required maxlength="180" value="${esc(document.title)}"></label><div class="form-two"><label>Type documentaire<select name="documentType">${Object.entries(documentTypeLabels).map(([value,label])=>`<option value="${value}" ${document.documentType===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label><label>Date du document<input type="date" name="documentDate" value="${esc(document.documentDate||'')}"></label><label>Origine<input value="${esc(documentOriginLabels[document.origin]||document.origin||'—')}" disabled></label><label>Catégorie<input name="category" maxlength="80" value="${esc(document.category)}"></label><label>Référence<input name="reference" maxlength="180" value="${esc(document.reference||'')}"></label><label>Confidentialité<select name="sensitivity">${['standard','confidential','restricted'].map(value=>`<option value="${value}" ${document.sensitivity===value?'selected':''}>${value}</option>`).join('')}</select></label></div><label>Description<textarea name="description" maxlength="2000">${esc(document.description||'')}</textarea></label><div class="modal-actions"><button class="btn primary">Enregistrer</button></div></form>`)}catch(error){toast(error.message)}}
async function saveSecureDocumentMetadata(event,documentId){event.preventDefault();const f=new FormData(event.target),button=event.target.querySelector('button');if(button)button.disabled=true;try{await serverJson('/api/documents/'+encodeURIComponent(documentId),{method:'PATCH',body:JSON.stringify({title:String(f.get('title')||''),documentType:String(f.get('documentType')||'other'),documentDate:String(f.get('documentDate')||''),category:String(f.get('category')||''),reference:String(f.get('reference')||''),sensitivity:String(f.get('sensitivity')||'standard'),description:String(f.get('description')||'')})});closeModal();await loadServerDocuments();toast('Métadonnées enregistrées côté serveur.')}catch(error){toast(error.message);if(button)button.disabled=false}}
function secureDocumentRelationForm(documentId){modal('Ajouter une relation',`<form onsubmit="addSecureDocumentRelation(event,'${jsString(documentId)}')"><div class="form-two"><label>Type<select name="type">${Object.entries(documentRelationLabels).map(([value,label])=>`<option value="${value}">${esc(label)}</option>`).join('')}</select></label><label>ID de la ressource<input name="targetId" required maxlength="200"></label></div><div class="modal-actions"><button class="btn primary">Ajouter</button></div></form>`)}
async function addSecureDocumentRelation(event,documentId){event.preventDefault();const f=new FormData(event.target),button=event.target.querySelector('button');if(button)button.disabled=true;try{await serverJson('/api/documents/'+encodeURIComponent(documentId)+'/relations',{method:'POST',body:JSON.stringify({type:String(f.get('type')),targetId:String(f.get('targetId')||'').trim()})});closeModal();await loadServerDocuments();await openSecureDocument(documentId);toast('Relation enregistrée côté serveur.')}catch(error){toast(error.message);if(button)button.disabled=false}}
async function removeSecureDocumentRelation(documentId,relationId){try{await serverJson('/api/documents/'+encodeURIComponent(documentId)+'/relations/'+encodeURIComponent(relationId),{method:'DELETE'});closeModal();await loadServerDocuments();await openSecureDocument(documentId);toast('Relation retirée. Le fichier unique est conservé.')}catch(error){toast(error.message)}}
async function openSecureDocumentHistory(documentId){try{const data=await serverJson('/api/documents/'+encodeURIComponent(documentId)+'/history'),history=data.history||[];modal('Historique du document',`<div class="modal-inner">${history.map(event=>`<div class="detail-row"><span><b>${esc(event.action)}</b><small>${esc(event.userId||'—')} · ${esc(String(event.createdAt||'').replace('T',' ').slice(0,19))}</small></span></div>`).join('')||'<div class="empty">Aucun événement enregistré.</div>'}</div>`)}catch(error){toast(error.message||'Historique inaccessible.')}}
async function archiveSecureDocument(documentId){const reason=window.prompt('Motif d’archivage (facultatif) :','')??null;if(reason===null)return;try{await serverJson('/api/documents/'+encodeURIComponent(documentId)+'/archive',{method:'POST',body:JSON.stringify({reason:String(reason).trim()})});closeModal();await loadServerDocuments();toast('Document archivé côté serveur.')}catch(error){toast(error.message)}}
function documentsForRelation(type,targetId){if(serverDocumentsState==='idle')queueMicrotask(loadServerDocuments);return serverDocuments.filter(document=>(document.relations||[]).some(relation=>relation.type===type&&String(relation.targetId)===String(targetId)))}
if(typeof jobDocumentLinks==='function'){jobDocumentLinks=function(job){const linked=documentsForRelation('project',job.id);return `<div class="section-heading"><span class="subtle">Documents privés liés à ce chantier</span><button class="link" onclick="documentUploadForm('project','${jsString(job.id)}')">+ Document</button></div>${linked.map(document=>`<button class="doc-link" onclick="openSecureDocument('${jsString(document.id)}')"><span><strong>${esc(document.title||document.originalName)}</strong><small>${esc(document.category)} · ${esc(document.sensitivity)}</small></span><span>Ouvrir ↗</span></button>`).join('')||'<div class="empty">Aucun document serveur autorisé pour ce chantier.</div>'}`}}


function secureDocumentContextHtml(type,targetId,title='Documents liés',linked=[]){
  const key=type+':'+String(targetId);
  return `<section class="panel document-context-panel" data-document-context="${esc(key)}"><div class="section-heading"><div><h3>${esc(title)}</h3><span class="subtle">Fichier privé unique · relations transversales</span></div><button class="link" onclick="documentUploadForm('${jsString(type)}','${jsString(String(targetId))}')">+ Document</button></div>${linked.map(document=>`<button class="doc-link" onclick="openSecureDocument('${jsString(document.id)}')"><span><strong>${esc(document.title||document.originalName)}</strong><small>${esc(documentTypeLabels[document.documentType]||document.documentType||document.category||'Autre')} · ${esc(document.documentDate||String(document.createdAt||'').slice(0,10)||'—')} · ${esc(document.sensitivity)}</small></span><span>Ouvrir ↗</span></button>`).join('')||'<div class="empty">Aucun document autorisé pour ce dossier.</div>'}</section>`;
}
async function appendSecureDocumentContext(type,targetId,title){
  const node=document.querySelector('#modalbody');if(!node||!targetId)return;
  const key=type+':'+String(targetId),token=key+':'+crypto.randomUUID();node.dataset.pendingDocumentContext=token;
  let linked=[];
  try{
    const data=await serverJson(documentRegistryUrl({q:'',documentType:'',origin:'',relationType:type,relationId:String(targetId)}));
    linked=data.documents||[];
  }catch(error){
    if(node.dataset.pendingDocumentContext!==token||!document.querySelector('#modal[open]'))return;
    node.querySelectorAll('.document-context-panel').forEach(panel=>panel.remove());
    const message=document.createElement('section');message.className='panel document-context-panel';message.textContent=error.message||'Documents indisponibles.';node.appendChild(message);
    return;
  }
  if(node.dataset.pendingDocumentContext!==token||!document.querySelector('#modal[open]'))return;
  node.querySelectorAll('.document-context-panel').forEach(panel=>panel.remove());
  node.insertAdjacentHTML('beforeend',secureDocumentContextHtml(type,targetId,title,linked));
}
function attachDocumentContextAfter(openFunction,type,idResolver,title){
  if(typeof openFunction!=='function')return openFunction;
  return function(...args){const result=openFunction.apply(this,args),targetId=idResolver(...args);if(targetId)queueMicrotask(()=>appendSecureDocumentContext(type,targetId,title));return result}
}
if(typeof openServerInvoice==='function')openServerInvoice=attachDocumentContextAfter(openServerInvoice,'invoice',id=>id,'Documents de la facture');
if(typeof openAccountingExpense==='function'){
  const openAccountingExpenseBeforeDocuments=openAccountingExpense;
  openAccountingExpense=function(index){const demo=typeof isDemoFinance==='function'&&isDemoFinance(),item=demo?(typeof demoExpenses!=='undefined'?demoExpenses[index]:null):(typeof serverExpenses!=='undefined'?serverExpenses[index]:null),result=openAccountingExpenseBeforeDocuments(index);if(!demo&&item?.id)queueMicrotask(()=>appendSecureDocumentContext('expense',item.id,'Justificatifs et documents'));const node=document.querySelector('#modalbody');if(node){const obsolete=[...node.querySelectorAll('.help-line')].find(el=>el.textContent.includes('stockage documentaire'));if(obsolete)obsolete.remove()}return result};
}
if(typeof showAsset==='function')showAsset=attachDocumentContextAfter(showAsset,'asset',id=>id,'Documents du matériel / véhicule');
if(typeof showPersonDossier==='function')showPersonDossier=attachDocumentContextAfter(showPersonDossier,'person',id=>id,'Documents du personnel');
if(typeof showQuote==='function')showQuote=attachDocumentContextAfter(showQuote,'quote',id=>id,'Documents du devis');

function installDocumentContextHooks(){
  if(typeof openSupplierAllocation==='function'&&!openSupplierAllocation.__documentContextHook){
    const base=openSupplierAllocation;
    const wrapped=async function(expenseId){
      const result=await base.apply(this,arguments);
      if(expenseId)await appendSecureDocumentContext('expense',expenseId,'Justificatifs et documents');
      return result;
    };
    wrapped.__documentContextHook=true;openSupplierAllocation=wrapped;
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installDocumentContextHooks,{once:true});else setTimeout(installDocumentContextHooks,0);
