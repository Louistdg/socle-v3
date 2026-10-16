// Archives change visibility, never remove business records or financial links.
let jobArchiveView = 'active', jobSearch = '', documentArchiveView = 'active', quoteArchiveView = 'active';
let documentArchives = {};

function activeJobsForPlanning() { return jobs.filter(job => !isArchivedJob(job)); }
function archivedDocumentParent(record) {
  return record.link === 'job' && isArchivedJob(jobs.find(job => job.id === record.linkId));
}
function documentArchiveKey(record) {
  return JSON.stringify([record.id, record.name, record.type, record.owner]);
}
function isArchivedDocument(record) {
  return Boolean(archivedDocumentParent(record) || documentArchives[documentArchiveKey(record)]);
}
function documentsInCurrentView() {
  return allDocuments().filter(record => isArchivedDocument(record) === (documentArchiveView === 'archived'));
}
function jobDocumentLinks(job) {
  const records = allDocuments().filter(record => record.link === 'job' && record.linkId === job.id);
  const active = records.filter(record => !isArchivedDocument(record));
  const archived = records.filter(isArchivedDocument);
  const links = list => list.map(record => `<button class="doc-link" data-document-id="${esc(record.id)}" onclick="openDocumentRecord(this.dataset.documentId)"><span><strong>${esc(record.name)}</strong><small>${esc(record.type)} · ${esc(record.status)}</small></span><span>Ouvrir ↗</span></button>`).join('');
  return links(active) + (archived.length ? `<details class="detail-history" ${isArchivedJob(job) ? 'open' : ''}><summary>Documents archivés (${archived.length})</summary>${links(archived)}</details>` : '') + (!records.length ? '<p class="person-empty">Aucun document référencé.</p>' : '');
}

const snapshotBeforeArchives = workspaceSnapshot;
workspaceSnapshot = function () {
  return JSON.stringify({...JSON.parse(snapshotBeforeArchives()), documentArchives});
};
const restoreBeforeArchives = restoreWorkspace;
restoreWorkspace = function (state) {
  restoreBeforeArchives(state);
  documentArchives = state.documentArchives && typeof state.documentArchives === 'object' && !Array.isArray(state.documentArchives)
    ? state.documentArchives : {};
};

function archiveSwitch(current, handler, activeCount, archiveCount, label) {
  return `<div class="archive-switch" role="group" aria-label="${esc(label)}">
    <button class="${current === 'active' ? 'selected' : ''}" aria-pressed="${current === 'active'}" onclick="${handler}('active')">En cours <b>${activeCount}</b></button>
    <button class="${current === 'archived' ? 'selected' : ''}" aria-pressed="${current === 'archived'}" onclick="${handler}('archived')">Archives <b>${archiveCount}</b></button>
  </div>`;
}
function setJobArchiveView(value) { jobArchiveView = value; render(); }
function setDocumentArchiveView(value) { documentArchiveView = value; render(); }
function setQuoteArchiveView(value) { quoteArchiveView = value; render(); }

function jobArchiveRows() {
  const query = jobSearch.trim().toLocaleLowerCase('fr');
  const list = jobs.filter(job => isArchivedJob(job) === (jobArchiveView === 'archived'))
    .filter(job => !query || [job.name, job.client, job.town, job.address].join(' ').toLocaleLowerCase('fr').includes(query));
  return list.length ? `<section class="project-list">${list.map(job => {
    const quote = acceptedQuoteForJob(job.id);
    return `<button class="project-row" onclick="showJob(${job.id})"><span class="project-number">${String(job.id).padStart(2, '0')}</span>
      <span class="project-main"><span class="badge">${isArchivedJob(job) ? 'Archivé' : esc(job.phase)}</span><strong>${esc(job.name)}</strong><small>${esc(job.client)} · ${esc(job.town)}</small></span>
      <span><small>Avancement</small><b>${job.progress}%</b><i><em style="width:${Math.max(0, Math.min(100, Number(job.progress) || 0))}%"></em></i></span>
      <span><small>Temps enregistré</small><b>${jobHours(job).toFixed(1)} h</b></span>
      <span><small>Devis</small><b>${quote ? money(quoteGross(quote)) : '—'}</b></span>
      <span><small>Documents</small><b>${(job.documents || []).length}</b></span><strong class="project-open">Ouvrir ↗</strong></button>`;
  }).join('')}</section>` : `<div class="empty">${query ? 'Aucun chantier ne correspond à cette recherche.' : jobArchiveView === 'archived' ? 'Aucun chantier archivé. Les dossiers terminés seront conservés ici.' : 'Aucun chantier en cours. Les anciens dossiers restent dans les archives.'}</div>`;
}
jobsView = function () {
  const archived = jobs.filter(isArchivedJob).length;
  return heading('Chantiers', 'Les dossiers utiles au quotidien, avec les anciens chantiers à part.', false) +
    `<div class="section-heading">${archiveSwitch(jobArchiveView, 'setJobArchiveView', jobs.length - archived, archived, 'Classement des chantiers')}<button class="btn primary" onclick="jobForm()">+ Nouveau chantier</button></div>
    <div class="document-toolbar"><input aria-label="Rechercher un chantier" placeholder="Chantier, client ou commune…" value="${esc(jobSearch)}" oninput="jobSearch=this.value;document.querySelector('#archiveJobRows').innerHTML=jobArchiveRows()"></div>
    ${jobArchiveView === 'archived' ? '<p class="notice">Les devis, factures, heures et documents sont conservés. Un chantier peut être remis en activité depuis son dossier.</p>' : ''}
    <div id="archiveJobRows">${jobArchiveRows()}</div>`;
};

function archiveJobForm(id) {
  const job = jobs.find(item => item.id === id);
  if (!job || isArchivedJob(job)) return;
  const openEntries = (job.timeEntries || []).filter(entry => !entry.departure).length;
  const future = assignments.filter(item => item.job === id && item.date >= new Date().toLocaleDateString('en-CA')).length;
  modal('Terminer et archiver le chantier', `<p><strong>${esc(job.name)}</strong></p>
    <p class="notice">Le chantier et ses documents sortiront des listes en cours. Les devis, factures, heures et historiques resteront conservés et accessibles.</p>
    ${future ? `<p>${future} affectation(s) à venir seront conservées dans l’historique, mais ne compteront plus dans le planning actif.</p>` : ''}
    ${openEntries ? `<p class="form-error" role="alert">${openEntries} pointage(s) sont encore ouverts. Enregistrez les départs avant de terminer ce chantier.</p>` : '<p>Vous pourrez remettre ce chantier en activité à tout moment.</p>'}
    <div class="modal-actions"><button class="btn" onclick="showJob(${id})">Retour au chantier</button>${openEntries ? '' : `<button class="btn primary" onclick="archiveJob(${id})">Terminer et archiver</button>`}</div>`);
}
function archiveJob(id) {
  const job = jobs.find(item => item.id === id);
  if (!job || isArchivedJob(job)) return;
  if ((job.timeEntries || []).some(entry => !entry.departure)) return archiveJobForm(id);
  job.beforeArchive = {phase: job.phase, progress: job.progress};
  job.archivedAt = new Date().toISOString();
  job.phase = 'Terminé';
  job.progress = 100;
  (job.archiveHistory ??= []).push({date: job.archivedAt, action: 'Chantier terminé et archivé'});
  closeModal(); render(); toast('Chantier rangé dans les archives. Son historique est conservé.');
}
function restoreJob(id) {
  const job = jobs.find(item => item.id === id);
  if (!job || !isArchivedJob(job)) return;
  job.phase = job.beforeArchive?.phase && !['Terminé', 'Archivé'].includes(job.beforeArchive.phase) ? job.beforeArchive.phase : 'En cours';
  job.progress = job.beforeArchive?.progress ?? job.progress;
  delete job.archivedAt;
  delete job.beforeArchive;
  (job.archiveHistory ??= []).push({date: new Date().toISOString(), action: 'Chantier remis en activité'});
  closeModal(); render(); showJob(id); toast('Chantier remis en activité.');
}

const showJobBeforeArchives = showJob;
showJob = function (id) {
  if (!jobs.some(job => job.id === id)) return;
  showJobBeforeArchives(id);
  const job = jobs.find(item => item.id === id);
  const root = document.querySelector('#modalbody .modal-inner');
  root?.querySelector('.modal-top')?.insertAdjacentHTML('afterend', `<section class="archive-banner">
    <div><strong>${isArchivedJob(job) ? 'Chantier archivé' : 'Rangement du chantier'}</strong><p>${isArchivedJob(job) ? 'Ce dossier reste accessible avec ses pièces et son historique comptable.' : 'Une fois les travaux terminés, rangez ce dossier pour alléger les listes.'}</p></div>
    <button class="btn" onclick="${isArchivedJob(job) ? 'restoreJob' : 'archiveJobForm'}(${id})">${isArchivedJob(job) ? 'Remettre en activité' : 'Terminer et archiver'}</button></section>`);
  if (isArchivedJob(job)) root?.querySelector('.job-actions')?.remove();
  if (job.archiveHistory?.length) root?.insertAdjacentHTML('beforeend', `<details class="detail-history"><summary>Historique du classement (${job.archiveHistory.length})</summary>${[...job.archiveHistory].reverse().map(item => `<p>${fullDate(item.date.slice(0, 10))} · ${esc(item.action)}</p>`).join('')}</details>`);
};

filteredDocuments = function () {
  const query = docQuery.trim().toLocaleLowerCase('fr');
  return documentsInCurrentView().filter(record => (docCategory === 'Tous' || record.category === docCategory) &&
    (!query || [record.name, record.type, record.owner].join(' ').toLocaleLowerCase('fr').includes(query)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
};
const documentsBeforeArchives = documents;
documents = function () {
  const all = allDocuments(), archived = all.filter(isArchivedDocument).length;
  return archiveSwitch(documentArchiveView, 'setDocumentArchiveView', all.length - archived, archived, 'Classement des documents') + documentsBeforeArchives();
};
const openDocumentBeforeArchives = openDocumentRecord;
openDocumentRecord = function (id) {
  const record = allDocuments().find(item => item.id === id);
  if (!record) return;
  openDocumentBeforeArchives(id);
  if (record.category === 'Comptabilité') return;
  const inherited = archivedDocumentParent(record);
  document.querySelector('#modalbody .modal-inner')?.insertAdjacentHTML('beforeend', `<section class="archive-banner"><div><strong>${isArchivedDocument(record) ? 'Document archivé' : 'Ranger ce document'}</strong><p>${inherited ? 'Ce document suit le classement de son chantier. Remettez le chantier en activité pour le retrouver dans les documents en cours.' : 'Le document reste conservé dans son dossier et peut être retrouvé dans les archives.'}</p></div>${inherited ? '' : `<button class="btn" data-document-id="${esc(id)}" onclick="changeDocumentArchive(this.dataset.documentId,${!isArchivedDocument(record)})">${isArchivedDocument(record) ? 'Remettre dans les documents en cours' : 'Archiver le document'}</button>`}</section>`);
};
function changeDocumentArchive(id, archived) {
  const record = allDocuments().find(item => item.id === id);
  if (!record || record.category === 'Comptabilité' || archivedDocumentParent(record)) return;
  const key = documentArchiveKey(record);
  if (archived) documentArchives[key] = {archivedAt: new Date().toISOString()};
  else delete documentArchives[key];
  closeModal(); render(); toast(archived ? 'Document rangé dans les archives.' : 'Document remis dans la liste en cours.');
}

function quoteIsArchived(quote) { return isArchivedJob(jobs.find(job => job.id === quote.job)); }
quotesView = function () {
  const archived = quotes.filter(quoteIsArchived).length;
  const list = quotes.filter(quote => quoteIsArchived(quote) === (quoteArchiveView === 'archived'));
  const accepted = list.filter(quote => quote.status === 'Accepté').reduce((sum, quote) => sum + quoteGross(quote), 0);
  return heading('Devis', 'Les devis suivent le classement de leur chantier. Tous restent conservés.', false) +
    `<div class="section-heading">${archiveSwitch(quoteArchiveView, 'setQuoteArchiveView', quotes.length - archived, archived, 'Classement des devis')}<button class="btn primary" onclick="quoteForm()">+ Créer un devis</button></div>
    <div class="quote-summary"><div><small>Devis affichés</small><strong>${list.length}</strong></div><div><small>Acceptés · TVAC</small><strong>${money(accepted)}</strong></div></div>
    <section class="panel quote-list"><div class="quote-list-head"><span>Référence / objet</span><span>Client & chantier</span><span>Validité</span><span>Total TVAC</span><span>État</span><span></span></div>${list.map(quote => {
      const job = jobs.find(item => item.id === quote.job);
      return `<button class="quote-list-row" onclick="showQuote(${quote.id})"><span><b>${esc(quote.ref)}</b><small>${esc(quote.title)}</small></span><span><b>${esc(quote.client || job?.client || '')}</b><small>${esc(job?.name || '')}</small></span><span>${fullDate(quote.validUntil)}</span><strong>${money(quoteGross(quote))}</strong><span class="badge">${esc(quote.status)}</span><i>↗</i></button>`;
    }).join('') || '<div class="empty">Aucun devis dans cette vue.</div>'}</section><p class="help-line">Les montants et taux de TVA sont des exemples. Le document final doit être contrôlé avant envoi ou signature.</p>`;
};

const saveAssignmentBeforeArchives = saveAssignment;
saveAssignment = function (event, id) {
  const job = jobs.find(item => item.id === Number(new FormData(event.target).get('job')));
  if (!job || isArchivedJob(job)) {
    event.preventDefault();
    document.querySelector('#assignError').textContent = 'Choisissez un chantier en cours. Un chantier archivé doit d’abord être remis en activité.';
    return;
  }
  return saveAssignmentBeforeArchives(event, id);
};
const arrivalFormBeforeArchives = arrivalForm, saveArrivalBeforeArchives = saveArrival;
arrivalForm = function (id) {
  if (isArchivedJob(jobs.find(job => job.id === id))) return toast('Remettez le chantier en activité avant de pointer une arrivée.');
  return arrivalFormBeforeArchives(id);
};
saveArrival = function (event, id) {
  if (isArchivedJob(jobs.find(job => job.id === id))) { event.preventDefault(); return toast('Ce chantier est archivé.'); }
  return saveArrivalBeforeArchives(event, id);
};

// The patron's reusable posts live once here and are picked from a devis.
let quoteArea='quotes', catalogueQuery='', albums=[];
let priceCatalog=[
  {id:'slate-40-22',category:'Couverture',name:'Ardoise naturelle 40×22 · non isolée',unit:'m²',price:125,vat:6,description:'Démontage et remontage compris.'},
  {id:'gutter-zinc',category:'Couverture',name:'Gouttière zinc',unit:'mètre courant',price:150,vat:6,description:'Pose comprise.'},
  {id:'ridge',category:'Couverture',name:'Faîtage',unit:'mètre courant',price:200,vat:6,description:'Pose comprise.'},
  {id:'asbestos',category:'Évacuation',name:'Conteneur amiante',unit:'unité',price:1000,vat:21,description:'Poste séparé.'}
];
function catalogueTabs(){return `<div class="quote-area-tabs"><button class="${quoteArea==='quotes'?'selected':''}" onclick="quoteArea='quotes';render()">Mes devis</button><button class="${quoteArea==='catalogue'?'selected':''}" onclick="quoteArea='catalogue';render()">Mes ouvrages & tarifs</button></div>`}
const quotesViewFoundation=quotesView;
quotesView=function(){return quoteArea==='catalogue'?catalogueView():catalogueTabs()+quotesViewFoundation()};
function catalogueView(){const q=catalogueQuery.toLowerCase(),list=priceCatalog.filter(x=>!q||[x.name,x.category,x.description].join(' ').toLowerCase().includes(q));return heading('Mes ouvrages & tarifs','Vos propres postes de prix, prêts à ajouter dans un devis.',false)+catalogueTabs()+`<div class="catalogue-tools"><input placeholder="Rechercher un ouvrage…" value="${esc(catalogueQuery)}" oninput="catalogueQuery=this.value;render()"><button class="btn primary" onclick="catalogueForm()">+ Nouvel ouvrage</button></div><div class="catalogue-grid">${list.map(x=>`<article class="catalogue-card"><span class="badge">${esc(x.category)}</span><strong>${esc(x.name)}</strong><span>${esc(x.description)}</span><div class="catalogue-price">${money(x.price)} <small>/ ${esc(x.unit)}</small></div><button class="link" onclick="catalogueForm('${x.id}')">Modifier</button></article>`).join('')||'<div class="empty">Aucun ouvrage trouvé.</div>'}</div>`}
function catalogueForm(id=''){const x=priceCatalog.find(x=>x.id===id)||{name:'',category:'Couverture',unit:'m²',price:'',vat:6,description:''};modal(id?'Modifier un ouvrage':'Nouvel ouvrage',`<form onsubmit="saveCatalogue(event,'${id}')"><label>Nom<input name="name" required value="${esc(x.name)}"></label><div class="form-two"><label>Catégorie<input name="category" required value="${esc(x.category)}"></label><label>Unité<select name="unit">${['m²','mètre courant','unité','forfait'].map(v=>`<option ${v===x.unit?'selected':''}>${v}</option>`).join('')}</select></label><label>Prix HT (€)<input name="price" type="number" min="0" step="0.01" required value="${x.price}"></label><label>TVA<select name="vat">${[6,12,21].map(v=>`<option ${v===x.vat?'selected':''}>${v}</option>`).join('')}</select></label></div><label>Précision<textarea name="description">${esc(x.description)}</textarea></label><div class="modal-actions"><button class="btn primary">Enregistrer</button></div></form>`)}
function saveCatalogue(e,id){e.preventDefault();const f=new FormData(e.target),price=+f.get('price'),name=f.get('name').trim();if(!name||!Number.isFinite(price)||price<0)return;const x={id:id||'work-'+Date.now(),name,category:f.get('category').trim(),unit:f.get('unit'),price,vat:+f.get('vat'),description:f.get('description').trim()};const old=priceCatalog.find(x=>x.id===id);old?Object.assign(old,x):priceCatalog.push(x);closeModal();quoteArea='catalogue';render();toast('Ouvrage enregistré dans vos tarifs.')}
const quoteFormFoundation=quoteForm;
quoteForm=function(id){quoteFormFoundation(id);const target=document.querySelector('#quoteLines');if(target)target.insertAdjacentHTML('beforebegin',`<div class="catalogue-picker"><small>Ajouter depuis mes ouvrages & tarifs</small><select onchange="insertCatalogueLine(this.value);this.value=''"><option value="">Choisir un poste…</option>${priceCatalog.map(x=>`<option value="${esc(x.id)}">${esc(x.name)} — ${money(x.price)} / ${esc(x.unit)}</option>`).join('')}</select></div>`)};
function insertCatalogueLine(id){const x=priceCatalog.find(x=>x.id===id),target=document.querySelector('#quoteLines');if(!x||!target)return;target.insertAdjacentHTML('beforeend',quoteLine({label:x.name,description:x.description,qty:1,unit:x.unit,price:x.price,vat:x.vat}));toast('Poste ajouté au devis.')}

function galleryPhotos(job){return [...(job.photos||[]).map((x,i)=>({id:'p-'+i,name:x.name,url:x.url})),...(job.notes||[]).filter(x=>x.photoUrl).map(x=>({id:'n-'+x.id,name:x.photoName||'Photo chantier',url:x.photoUrl}))]}
function galleryView(){return heading('Réalisations','Vos albums sont créés manuellement à partir des photos de chantier.',false)+`<div class="section-heading"><span class="subtle">Les photos restent dans leur chantier ; aucun fichier n’est dupliqué.</span><button class="btn primary" onclick="albumForm()">+ Créer un album</button></div><div class="album-grid">${albums.map(a=>{const p=a.photos.map(r=>galleryPhoto(r)).find(Boolean);return `<button class="album-card" onclick="openAlbum('${a.id}')">${p?`<img src="${p.url}" alt="${esc(p.name)}">`:''}<strong>${esc(a.name)}</strong><small>${a.photos.length} photo(s) · ${esc(a.category||'Sans catégorie')}</small></button>`}).join('')||'<div class="empty">Créez un album, puis ajoutez-y les photos choisies depuis un chantier.</div>'}</div>`}
function galleryPhoto(r){return galleryPhotos(jobs.find(j=>j.id===r.jobId)||{}).find(p=>p.id===r.photoId)}
function albumForm(){modal('Créer un album',`<form onsubmit="saveAlbum(event)"><label>Nom de l’album<input name="name" required placeholder="Ex. Salles de bain"></label><label>Catégorie<input name="category" placeholder="Ex. Carrelage"></label><div class="modal-actions"><button class="btn primary">Créer</button></div></form>`)}
function saveAlbum(e){e.preventDefault();const f=new FormData(e.target),name=f.get('name').trim();if(!name)return;albums.push({id:'album-'+Date.now(),name,category:f.get('category').trim(),photos:[]});closeModal();navigate('gallery');toast('Album créé.')}
function openAlbum(id){const a=albums.find(a=>a.id===id);modal(a.name,`<div class="photo-picker">${a.photos.map(r=>{const p=galleryPhoto(r);return p?`<figure><img src="${p.url}" alt="${esc(p.name)}"><figcaption>${esc(p.name)}</figcaption></figure>`:''}).join('')||'<p class="empty">Aucune photo dans cet album.</p>'}</div>`)}
const showJobFoundation=showJob;
showJob=function(id){showJobFoundation(id);const root=document.querySelector('#modalbody .modal-inner');if(root)root.insertAdjacentHTML('beforeend',`<section class="job-realizations"><div class="section-heading"><div><h3>Photos & réalisations</h3><p class="subtle">Choisissez vous-même les photos à classer dans vos albums.</p></div><button class="btn" onclick="pickJobPhotos(${id})">Ajouter à un album</button></div></section>`)};
function pickJobPhotos(id){const ps=galleryPhotos(jobs.find(j=>j.id===id));if(!ps.length)return toast('Ajoutez d’abord une photo à ce chantier.');if(!albums.length)return albumForm();modal('Choisir une photo',`<div class="photo-picker">${ps.map(p=>`<button onclick="pickAlbum(${id},'${p.id}')"><img src="${p.url}" alt="${esc(p.name)}"><strong>${esc(p.name)}</strong></button>`).join('')}</div>`)}
function pickAlbum(jobId,photoId){modal('Choisir un album',albums.map(a=>`<button class="doc-link" onclick="addToAlbum('${a.id}',${jobId},'${photoId}')">${esc(a.name)} <span>Ajouter →</span></button>`).join(''))}
function addToAlbum(id,jobId,photoId){const a=albums.find(a=>a.id===id);if(a&&!a.photos.some(p=>p.jobId===jobId&&p.photoId===photoId))a.photos.push({jobId,photoId});closeModal();toast('Photo ajoutée à l’album.')}

const planningFoundation=planning;
planning=function(){return `<div class="socle-legend"><strong>Socle, le point d’appui de votre entreprise.</strong><span>Vos devis, chantiers, équipes, photos et suivis réunis au même endroit.</span></div>`+planningFoundation()};
if(!tabs2.some(x=>x[0]==='gallery'))tabs2.splice(tabs2.findIndex(x=>x[0]==='quotes')+1,0,['gallery','Réalisations']);
const renderFoundation=render;
render=function(){document.querySelector('#nav').innerHTML=tabs2.map(([v,l])=>`<button class="${view===v?'active':''}" ${view===v?'aria-current="page"':''} onclick="navigate('${v}')">${l}</button>`).join('');document.querySelector('#main').innerHTML=({planning,home:planning,people:peopleView,jobs:jobsView,fleet:fleetView,quotes:quotesView,gallery:galleryView,accounting:accountingView,news:newsView,actions,documents,company:companyView,dossiers:dossierView,permissions:permissionsView}[view]||planning)();scheduleSave()};
const snapshotFoundation=workspaceSnapshot;workspaceSnapshot=function(){return JSON.stringify({...JSON.parse(snapshotFoundation()),priceCatalog,albums})};
const restoreFoundation=restoreWorkspace;restoreWorkspace=function(state){restoreFoundation(state);if(Array.isArray(state.priceCatalog))priceCatalog=state.priceCatalog;if(Array.isArray(state.albums))albums=state.albums};

// Home is the field team's daily starting point: planning first, administration second.
planning=function(){
  const active=assignments.filter(a=>a.date===day&&!isArchivedJob(jobs.find(j=>j.id===a.job)));
  const unassigned=teams.filter(team=>!active.some(a=>a.team===team.id));
  const alerts=reminders.filter(r=>r.state!=='done'&&(r.date<=day||r.date<=reference)).slice(0,4);
  return `<div class="socle-legend"><strong>Socle, le point d’appui de votre entreprise.</strong><span>Vos devis, chantiers, équipes, photos et suivis réunis au même endroit.</span></div>
  <div class="planning-head"><div><p class="eyebrow">ORGANISATION TERRAIN</p><h1>Planning des équipes</h1><p>Chaque équipe sait où elle va et avec quel véhicule.</p></div><div class="datecontrols"><button class="btn square" onclick="day=new Date(new Date(day+'T12:00:00').getTime()-86400000).toISOString().slice(0,10);render()">‹</button><input type="date" value="${esc(day)}" onchange="day=this.value||reference;render()"><button class="btn square" onclick="day=new Date(new Date(day+'T12:00:00').getTime()+86400000).toISOString().slice(0,10);render()">›</button><button class="btn primary" onclick="assignForm()">+ Affecter une équipe</button></div></div>
  <div class="dispatch-board">${active.map(a=>{const team=teams.find(t=>t.id===a.team),job=jobs.find(j=>j.id===a.job),vehicle=fleet.find(v=>v.id===a.vehicle);return `<article class="dispatch"><div class="dispatch-top"><span class="badge">${esc(team?.name||'Équipe')}</span><button class="link" onclick="assignForm(${a.id})">Modifier</button></div><button class="job-title" onclick="showJob(${a.job})"><span>CHANTIER</span><h2>${esc(job?.name||'Chantier')}</h2></button><p class="job-type">${esc(job?.address||'Adresse à renseigner')} · ${esc(job?.town||'')}</p><div class="crew-block"><span class="section-label">ÉQUIPE <button class="link" onclick="navigate('people')">Voir →</button></span>${(team?.members||[]).map(id=>{const p=getPerson(id);return p?`<div class="crew-person">${face(p)}<span>${esc(p.name)}<small>${esc(p.role)}</small></span></div>`:''}).join('')}<p class="help-line">${esc(vehicle?.name||'Véhicule à définir')}</p></div></article>`}).join('')}${unassigned.map(team=>`<article class="dispatch add-dispatch"><span class="badge">${esc(team.name)}</span><h3>Pas encore affectée</h3><p>Cette équipe n’a pas de chantier prévu ce jour.</p><button class="btn" onclick="assignForm()">Choisir un chantier</button></article>`).join('')}${!teams.length?'<div class="empty">Créez une équipe pour commencer le planning.</div>':''}</div>
  <section class="panel planning-followup"><div class="panel-head"><div><p class="eyebrow">À SUIVRE</p><h2>Points à ne pas oublier</h2></div><button class="link" onclick="navigate('actions')">Toutes les tâches →</button></div>${alerts.length?alerts.map(r=>`<button class="task" onclick="changeReminder('${jsString(r.id)}','done')"><span class="task-text"><strong>${esc(r.title)}</strong><small>${fullDate(r.date)} · ${esc(r.owner||'Responsable à définir')}</small></span><span class="badge">À traiter</span></button>`).join(''):'<div class="empty">Aucun point urgent pour cette journée.</div>'}</section>`;
};

// Weekly board: the crew on an assignment may differ from the permanent team roster.
function mondayOf(value){const d=new Date(value+'T12:00:00'),shift=(d.getDay()+6)%7;d.setDate(d.getDate()-shift);return d.toISOString().slice(0,10)}
function weekDays(value){const start=mondayOf(value);return Array.from({length:5},(_,i)=>new Date(new Date(start+'T12:00:00').getTime()+i*86400000).toISOString().slice(0,10))}
function shiftWeek(delta){const d=new Date(mondayOf(day)+'T12:00:00');d.setDate(d.getDate()+delta*7);day=d.toISOString().slice(0,10);render()}
planning=function(){const days=weekDays(day),labels=['Lun','Mar','Mer','Jeu','Ven'];return `<div class="socle-legend"><strong>Socle, le point d’appui de votre entreprise.</strong><span>Vos devis, chantiers, équipes, photos et suivis réunis au même endroit.</span></div><div class="planning-head"><div><p class="eyebrow">ORGANISATION TERRAIN</p><h1>Planning des équipes</h1><p>La semaine est visible pour le patron et les équipes.</p></div><div class="datecontrols"><button class="btn square" onclick="shiftWeek(-1)">‹</button><b>${fullDate(days[0])} — ${fullDate(days[4])}</b><button class="btn square" onclick="shiftWeek(1)">›</button><button class="btn primary" onclick="assignForm()">+ Affecter</button></div></div><section class="week-board"><div class="week-head"><span>Équipe</span>${days.map((d,i)=>`<span class="${d===day?'today':''}">${labels[i]}<small>${d.slice(8,10)}</small></span>`).join('')}</div>${teams.map(t=>`<div class="week-row" data-team="${t.id}"><strong>${esc(t.name)}<small>${t.members.length} personne(s)</small></strong>${days.map(d=>{const a=assignments.find(a=>a.team===t.id&&a.date===d&&!isArchivedJob(jobs.find(j=>j.id===a.job))),j=a&&jobs.find(j=>j.id===a.job);return a?`<button class="week-slot filled" onclick="assignForm(${a.id})"><b>${esc(j?.name||'Chantier')}</b><small>${(a.people||t.members).length} prévu(es)</small></button>`:`<button class="week-slot" onclick="assignForm(0,'${d}',${t.id})">+ Ajouter</button>`}).join('')}</div>`).join('')}</section><section class="panel planning-followup"><div class="panel-head"><div><p class="eyebrow">À SUIVRE</p><h2>Points à ne pas oublier</h2></div><button class="link" onclick="navigate('actions')">Toutes les tâches →</button></div>${reminders.filter(r=>r.state!=='done'&&r.date<=days[4]).slice(0,4).map(r=>`<div class="task"><span class="task-text"><strong>${esc(r.title)}</strong><small>${fullDate(r.date)}</small></span><span class="badge">À traiter</span></div>`).join('')||'<div class="empty">Aucun point urgent cette semaine.</div>'}</section>`}
assignForm=function(id){const a=assignments.find(x=>x.id===id)||{date:day,team:teams[0]?.id,job:activeJobsForPlanning()[0]?.id,people:teams[0]?.members||[]};const memberIds=a.people||teams.find(t=>t.id===a.team)?.members||[];modal(id?'Modifier l’affectation':'Préparer une affectation',`<form onsubmit="saveWeeklyAssignment(event,${id||0})"><div class="form-two"><label>Jour<input name="date" type="date" required value="${a.date}"></label><label>Chantier<select name="job">${activeJobsForPlanning().map(j=>`<option value="${j.id}" ${j.id===a.job?'selected':''}>${esc(j.name)}</option>`).join('')}</select></label><label>Équipe<select name="team">${teams.map(t=>`<option value="${t.id}" ${t.id===a.team?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label></div><p class="form-section-title">Personnes prévues ce jour</p><div class="check-people">${people.map(p=>`<label><input type="checkbox" name="people" value="${p.id}" ${memberIds.includes(p.id)?'checked':''}><span><strong>${esc(p.name)}</strong><small>${esc(p.role)}</small></span></label>`).join('')}</div><p class="help-line">Cette sélection ne change pas l’équipe permanente : elle sert uniquement au planning de ce chantier.</p><div class="modal-actions">${id?`<button class="btn" type="button" onclick="removeAssignment(${id})">Retirer</button>`:''}<button class="btn primary">Enregistrer</button></div></form>`)}
function saveWeeklyAssignment(e,id){e.preventDefault();const f=new FormData(e.target),a={id:id||Date.now(),date:f.get('date'),team:+f.get('team'),job:+f.get('job'),vehicle:1,pack:1,people:f.getAll('people').map(Number)};if(!a.people.length)return toast('Choisissez au moins une personne prévue.');if(id)assignments=assignments.map(x=>x.id===id?{...x,...a}:x);else assignments.push(a);day=a.date;closeModal();render();toast('Planning de l’équipe enregistré.')}

// Direct contact information belongs in the worker's own dossier.
const showPersonDossierFoundation=showPersonDossier;
showPersonDossier=function(id){showPersonDossierFoundation(id);const p=getPerson(id),root=document.querySelector('#modalbody .modal-inner');if(!p||!root)return;const section=`<section class="person-section"><div class="section-heading"><h3>Coordonnées</h3><button class="link" onclick="phoneForm(${id})">Modifier</button></div><div class="detail-row"><span>Téléphone</span><b>${esc(p.phone||'À renseigner')}</b></div></section>`;root.querySelector('.person-dossier-head')?.insertAdjacentHTML('afterend',section)};
function phoneForm(id){const p=getPerson(id);modal('Téléphone · '+p.name,`<form onsubmit="savePhone(event,${id})"><label>Numéro de téléphone<input name="phone" type="tel" required maxlength="40" value="${esc(p.phone||'')}"></label><div class="modal-actions"><button class="btn primary">Enregistrer</button></div></form>`)}
function savePhone(e,id){e.preventDefault();const phone=new FormData(e.target).get('phone').trim();if(!phone)return;getPerson(id).phone=phone;closeModal();showPersonDossier(id);toast('Téléphone enregistré dans le dossier personnel.')}

// A permanent orientation line, visible whatever section the patron opens.
function ensureSocleMasthead(){if(document.querySelector('#socleMasthead'))return;document.querySelector('#saveStatus')?.insertAdjacentHTML('afterend',`<div id="socleMasthead" class="socle-masthead"><strong>Socle, le point d’appui de votre entreprise.</strong><span>Vos devis, chantiers, équipes, photos et suivis réunis au même endroit.</span></div>`)}
ensureSocleMasthead();

function enrichWeeklyPlanning(){const cells=document.querySelectorAll?.('.week-row .week-slot');if(!cells)return;const dates=weekDays(day);let i=0;teams.forEach(team=>dates.forEach(date=>{const cell=cells[i++],a=assignments.find(x=>x.team===team.id&&x.date===date&&!isArchivedJob(jobs.find(j=>j.id===x.job)));if(!cell||!a)return;const names=(a.people||team.members).map(id=>getPerson(id)?.name?.split(' ')[0]).filter(Boolean).join(' · ');const vehicle=fleet.find(v=>v.id===a.vehicle);cell.insertAdjacentHTML('beforeend',`<small class="slot-people">${esc(names||'Équipe à préciser')}</small><small class="slot-vehicle">${esc(vehicle?.name||'Véhicule à définir')}</small>`)}))}
const renderForPlanningDetails=render;
render=function(){renderForPlanningDetails();if(view==='planning')enrichWeeklyPlanning();const mast=document.querySelector('#socleMasthead'),nav=document.querySelector('#nav');if(mast&&nav&&nav.before)nav.before(mast)};

// A catalogue can contain thousands of lines: keep it dense, searchable and alphabetical.
catalogueView=function(){const query=catalogueQuery.trim().toLocaleLowerCase('fr');const list=[...priceCatalog].filter(x=>!query||[x.name,x.category,x.description,x.unit].join(' ').toLocaleLowerCase('fr').includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'fr',{sensitivity:'base'}));return heading('Mes ouvrages & tarifs','Vos postes sont rangés par ordre alphabétique.',false)+catalogueTabs()+`<div class="catalogue-tools"><input aria-label="Rechercher un ouvrage" placeholder="Rechercher une référence, un poste…" value="${esc(catalogueQuery)}" oninput="catalogueQuery=this.value;render()"><button class="btn primary" onclick="catalogueForm()">+ Nouvel ouvrage</button></div><section class="panel catalogue-table"><div class="catalogue-table-head"><span>Ouvrage</span><span>Catégorie</span><span>Unité</span><span>Prix HT</span><span></span></div>${list.map(x=>`<button class="catalogue-row" onclick="catalogueForm('${x.id}')"><span><strong>${esc(x.name)}</strong>${x.description?`<small>${esc(x.description)}</small>`:''}</span><span>${esc(x.category)}</span><span>${esc(x.unit)}</span><b>${money(x.price)}</b><i>↗</i></button>`).join('')||'<div class="empty">Aucun ouvrage trouvé.</div>'}</section>`};

function ensureRoofingDemo(){
 const works=[['Ardoise naturelle 40×22 + isolation 12 cm','Couverture','m²',150],['Ardoise naturelle 40×22 + isolation 22 cm','Couverture','m²',170],['Eternit 60×30 · non isolée','Couverture','m²',92],['Eternit 60×30 + isolation 12 cm','Couverture','m²',138],['Tuile terre cuite · rénovation','Couverture','m²',115],['Sous-toiture HPV','Couverture','m²',22],['Lattage et contre-lattage','Charpente','m²',34],['Corniche zinc','Zinguerie','mètre courant',95],['Descente zinc','Zinguerie','mètre courant',76],['Gouttière aluminium','Zinguerie','mètre courant',118],['Solin plomb','Zinguerie','mètre courant',64],['Fenêtre de toit 78×98','Ouvertures','unité',980],['Remplacement velux','Ouvertures','unité',1250],['Bâchage provisoire','Dépannage','forfait',420],['Recherche infiltration','Dépannage','forfait',180],['Échafaudage façade','Accès','forfait',850],['Conteneur déchets toiture','Évacuation','unité',680],['Conteneur amiante','Évacuation','unité',1000],['Dépose toiture amiante','Amiante','m²',58],['Réfection cheminée','Maçonnerie','forfait',1450],['Faîtage ventilé','Couverture','mètre courant',205],['Rive de toiture','Couverture','mètre courant',110],['Isolation laine minérale 18 cm','Isolation','m²',48],['Isolation PIR 12 cm','Isolation','m²',67],['Bardage ardoise','Façade','m²',145]];
 works.forEach((w,i)=>{if(!priceCatalog.some(x=>x.name===w[0]))priceCatalog.push({id:'demo-work-'+i,name:w[0],category:w[1],unit:w[2],price:w[3],vat:6,description:'Poste de démonstration · prix personnel de l’entreprise.'})});
 const specs=[['Toiture Lambert · Wavre','Famille Lambert','Wavre',118,'Ardoise naturelle 40×22 + isolation 12 cm'],['Rénovation Martin · Gembloux','Famille Martin','Gembloux',86,'Eternit 60×30 + isolation 12 cm'],['Toiture école Saint-Paul','École Saint-Paul','Namur',240,'Tuile terre cuite · rénovation'],['Extension Dubois · Jodoigne','Famille Dubois','Jodoigne',64,'Ardoise naturelle 40×22 + isolation 22 cm'],['Façade De Smet · Bruxelles','De Smet SRL','Bruxelles',142,'Bardage ardoise']];
 specs.forEach((s,i)=>{const id=20+i;if(!jobs.some(j=>j.id===id)){const base=JSON.parse(JSON.stringify(jobs[0]));Object.assign(base,{id,name:s[0],client:s[1],town:s[2],address:'Adresse de démonstration',phase:i<3?'En cours':'À préparer',progress:i<3?35+i*15:0,photos:[],materials:[],notes:[],documents:[],timeEntries:[{id:900+i,team:teams[i%teams.length]?.id||1,people:teams[i%teams.length]?.members||[],date:'2026-09-22',arrival:'07:30',departure:'16:00',note:''}],finance:{hourlyCost:38,materials:s[3]*35,subcontracting:i===2?2200:0,other:650},surface:s[3],workType:s[4]});jobs.push(base)}const j=jobs.find(x=>x.id===id);if(!quotes.some(q=>q.job===id))quotes.push({id:200+i,ref:'DEV-2026-'+String(30+i).padStart(3,'0'),job:id,client:s[1],clientAddress:'Adresse de démonstration',title:s[4],date:'2026-09-10',validUntil:'2026-10-10',status:i===4?'Brouillon':'Accepté',deposit:30,paymentTerms:'Selon avancement.',notes:'',exclusions:'',lines:[{label:s[4],description:'Poste de démonstration',qty:s[3],unit:'m²',price:works.find(w=>w[0]===s[4])?.[3]||120,vat:6}]})});
 specs.forEach((s,i)=>{const ref='FAC-2026-'+String(40+i).padStart(3,'0');if(!accountingData.customerInvoices.some(x=>x.ref===ref))accountingData.customerInvoices.push({id:400+i,ref,client:s[1],job:20+i,date:'2026-09-18',due:'2026-10-18',amount:6500+i*2250,status:i%2?'À recevoir':'Payée'})});
}
// Superseded by realistic-demo.js. Kept only for backwards-compatible function references.
function profitabilityView(){const rows=jobs.filter(j=>acceptedQuoteForJob(j.id)).map(j=>({j,f:jobFinance(j)})).sort((a,b)=>b.f.margin-a.f.margin);return heading('Rentabilité des chantiers','Comparez ce qui était vendu, le coût réel et le temps consommé.',false)+`<div class="profit-kpis"><div><small>Chantiers analysés</small><strong>${rows.length}</strong></div><div><small>Marge totale estimée</small><strong>${money(rows.reduce((n,x)=>n+x.f.margin,0))}</strong></div><div><small>Heures enregistrées</small><strong>${rows.reduce((n,x)=>n+x.f.hours,0).toFixed(0)} h</strong></div></div><section class="panel profit-table"><div class="profit-head"><span>Chantier / ouvrage</span><span>Surface</span><span>Équipe</span><span>Heures</span><span>Vendu HT</span><span>Coût estimé</span><span>Marge</span></div>${rows.map(({j,f})=>`<button onclick="showJob(${j.id})"><span><strong>${esc(j.name)}</strong><small>${esc(j.workType||j.type||'Travaux')} · ${esc(j.client)}</small></span><span>${j.surface?j.surface+' m²':'—'}</span><span>${esc(teams.find(t=>t.id===j.timeEntries?.[0]?.team)?.name||'—')}</span><span>${f.hours.toFixed(1)} h</span><span>${money(f.net)}</span><span>${money(f.expenses)}</span><b class="${f.margin<0?'negative':''}">${money(f.margin)}</b></button>`).join('')}</section><p class="notice">Les coûts sont des exemples de démonstration. Le patron pourra ensuite enregistrer les vraies heures, achats et imprévus.</p>`}
if(!tabs2.some(x=>x[0]==='profitability'))tabs2.splice(tabs2.findIndex(x=>x[0]==='accounting')+1,0,['profitability','Rentabilité']);
const renderForProfitability=render;render=function(){renderForProfitability();if(view==='profitability')document.querySelector('#main').innerHTML=profitabilityView()};
const restoreForRoofingDemo=restoreWorkspace;restoreWorkspace=function(state){restoreForRoofingDemo(state)};

function ensureLargeRoofingDemo(){
  const staff=[['Julien Moreau','Couvreur-zingueur'],['Kevin Laurent','Couvreur-zingueur'],['Mathis Simon','Couvreur-zingueur'],['Romain Dubois','Couvreur-zingueur'],['Théo Lambert','Couvreur-zingueur'],['Antoine Renard','Couvreur-zingueur'],['Bastien Leroy','Couvreur-zingueur'],['Nicolas Martin','Couvreur-zingueur'],['Sophie Bernard','Administratif · facturation'],['David Colin','Gestionnaire de chantier'],['Marc Legrand','Chef de chantier'],['Éric Fontaine','Magasinier']];
  staff.forEach((s,i)=>{if(!people.some(p=>p.name===s[0]))people.push({id:500+i,name:s[0],role:s[1],trade:s[1]==='Couvreur-zingueur'?'Couverture-zinguerie':'',category:s[1]==='Couvreur-zingueur'?'Ouvrier':'Employé',qualification:s[1]==='Couvreur-zingueur'?'CP 124':'',otherTrades:[],contract:'CDI',start:'2022-01-10',end:'',birth:'1990-06-15',training:['Travail en hauteur'],initials:s[0].split(' ').map(x=>x[0]).join(''),color:'teal',hr:{leaveTotal:20,leave:[],lateness:[],tickets:[],permits:[],history:[]}})});
  const roofers=people.filter(p=>p.role==='Couvreur-zingueur').map(p=>p.id);[['Équipe Ardoise',roofers.slice(0,4)],['Équipe Zinguerie',roofers.slice(4,7)],['Équipe Rénovation',roofers.slice(7,10)]].forEach((x,i)=>{if(!teams.some(t=>t.name===x[0]))teams.push({id:600+i,name:x[0],members:x[1],color:['teal','orange','purple'][i]})});
  const vehicles=['Ford Transit · 03','Mercedes Sprinter · 04','Iveco Daily · plateau','Renault Master · 05'];vehicles.forEach((name,i)=>{if(!assets.some(a=>a.name===name))assets.push({id:700+i,name,group:'vehicles',category:i===2?'Camion plateau':'Camionnette équipée',mode:'Achat',condition:'En service',provider:'Flotte démonstration',reference:'VEH-2026-'+i,start:'2023-01-10',end:'',monthly:0,responsible:'Marc Legrand',attached:'Équipe terrain',contents:'Échelles, protections, outillage courant',history:[],docs:[],vehicle:{registration:'1-TOIT-'+(20+i),model:name,mileage:48000+i*6000}})});
  const tools=['Monte-matériaux GEDA 300 Z/ZP','Échafaudage façade Layher · 240 m²','Remorque échafaudage','Scie circulaire Makita HS012G','Scie à onglets Makita LS004G','Cloueur charpente Makita AN924','Visseuse à chocs Makita TD003G','Meuleuse Bosch GWX 18V-10','Laser Bosch GRL 18V-3-31','Aspirateur chantier Makita VC003GLZ','Harnais antichute · lot de 12','Ligne de vie temporaire · 40 m'];tools.forEach((name,i)=>{if(!assets.some(a=>a.name===name))assets.push({id:800+i,name,group:'tools',category:name.includes('Échafaudage')?'Échafaudage':name.includes('Remorque')?'Remorque':'Outillage',mode:'Achat',condition:'En service',provider:'Matériel professionnel',reference:'MAT-2026-'+i,start:'2024-02-01',end:'',monthly:0,responsible:'Éric Fontaine',attached:i<2?'Dépôt':'Camionnette terrain',contents:'Inventaire démo',history:[],docs:[]})});
  const jobNames=['Résidence des Tilleuls · Namur','Toiture Durand · Andenne','Rénovation Van den Berg · Nivelles','Immeuble Saint-Jacques · Charleroi','Maison Lefèvre · Wépion','Toiture commerciale · Gembloux','Villa Martin · Ciney','Dépannage toiture · Jambes','Résidence Les Jardins · Liège','Façade ardoise · Bruxelles','Toiture plate · Wavre','Maison familiale · Sambreville'];
  jobNames.forEach((name,i)=>{const id=1000+i;if(jobs.some(j=>j.id===id))return;const surface=[180,95,140,320,76,210,130,0,260,150,110,88][i],base=JSON.parse(JSON.stringify(jobs[0]));Object.assign(base,{id,name,client:['Résidence Tilleuls','Famille Durand','Van den Berg','Immo Saint-Jacques','Famille Lefèvre'][i%5],town:['Namur','Andenne','Nivelles','Charleroi','Wépion'][i%5],address:'Adresse de démonstration',phase:i<7?'En cours':'À préparer',progress:i<7?20+i*8:0,surface,workType:i===7?'Dépannage zinguerie':'Rénovation couverture-zinguerie',photos:[],documents:[],notes:[],materials:[],timeEntries:[{id:1100+i,team:teams[i%teams.length].id,people:teams[i%teams.length].members,date:'2026-09-22',arrival:'07:30',departure:'16:15',note:'Journée de démonstration'}],finance:{hourlyCost:42,materials:surface?surface*(38+i%3*8):540,subcontracting:i===3?4200:0,other:surface?850:260}});jobs.push(base);const price=surface?surface*(120+i%4*12):1250;quotes.push({id:1200+i,ref:'DEV-2026-'+String(60+i).padStart(3,'0'),job:id,client:base.client,clientAddress:base.address,title:base.workType,date:'2026-09-05',validUntil:'2026-10-05',status:i<7?'Accepté':'Brouillon',deposit:30,paymentTerms:'Acompte 30 %, solde selon avancement.',notes:'',exclusions:'',lines:[{label:base.workType,description:'Prestation de démonstration',qty:surface||1,unit:surface?'m²':'forfait',price:surface?Math.round(price/surface):price,vat:6}]});if(i<7)accountingData.customerInvoices.push({id:1300+i,ref:'FAC-2026-'+String(70+i).padStart(3,'0'),client:base.client,job:id,date:'2026-09-20',due:'2026-10-20',amount:Math.round(price*1.06*.3),status:i%3?'À recevoir':'Payée'})});
}
// Superseded by realistic-demo.js.
const restoreLargeDemo=restoreWorkspace;restoreWorkspace=function(state){restoreLargeDemo(state)};
