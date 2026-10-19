let contacts=[],contactQuery='',contactRole='Tous',currentContactId='';
const restoreContacts=restoreWorkspace;restoreWorkspace=function(s){restoreContacts(s);contacts=s.contacts||[]};const snapshotContacts=workspaceSnapshot;workspaceSnapshot=function(){const s=JSON.parse(snapshotContacts());s.contacts=contacts;return JSON.stringify(s)};
if(!tabs2.some(t=>t[0]==='contacts'))tabs2.splice(tabs2.findIndex(t=>t[0]==='jobs')+1,0,['contacts','Contacts']);
const roles=['Client','Architecte','Bureau d’études','Fournisseur','Sous-traitant','Syndic'];
contactForm=function(id=''){const c=contacts.find(x=>x.id===id)||{name:'',company:'',roles:['Client'],phone:'',email:''};modal('Contact',`<form onsubmit="saveContact(event,'${id}')"><label>Nom<input name="name" required value="${esc(c.name)}"></label><label>Société<input name="company" value="${esc(c.company)}"></label><div class="check-people">${roles.map(r=>`<label><input type="checkbox" name="roles" value="${r}" ${c.roles.includes(r)?'checked':''}>${r}</label>`).join('')}</div><label>Téléphone<input name="phone" value="${esc(c.phone)}"></label><label>E-mail<input type="email" name="email" value="${esc(c.email)}"></label><div class="modal-actions"><button class="btn primary">Enregistrer</button></div></form>`)}
saveContact=function(e,id){e.preventDefault();const f=new FormData(e.target),d={name:f.get('name').trim(),company:f.get('company').trim(),roles:f.getAll('roles'),phone:f.get('phone').trim(),email:f.get('email').trim()};if(!d.name||!d.roles.length)return;const c=contacts.find(x=>x.id===id);if(c)Object.assign(c,d);else contacts.push({id:'contact-'+crypto.randomUUID(),...d});closeModal();render();toast('Contact enregistré.')}
function contactsView(){const list=contacts.filter(c=>(contactRole==='Tous'||c.roles.includes(contactRole))&&[c.name,c.company,c.phone,c.email].join(' ').toLowerCase().includes(contactQuery.toLowerCase()));return heading('Contacts','Clients, architectes, fournisseurs et sous-traitants.',false)+`<div class="catalogue-tools"><input placeholder="Rechercher un contact…" value="${esc(contactQuery)}" oninput="contactQuery=this.value;render()"><label class="btn upload">Importer CSV<input type="file" accept=".csv,text/csv" onchange="importContactsCsv(event)"></label><button class="btn primary" onclick="contactForm()">+ Nouveau contact</button></div><div class="filter-pills">${['Tous',...roles].map(r=>`<button class="${contactRole===r?'selected':''}" onclick="contactRole='${r}';render()">${r}</button>`).join('')}</div><section class="panel">${list.map(c=>`<button class="task" onclick="openContact('${c.id}')"><span class="task-text"><strong>${esc(c.name)}</strong><small>${esc(c.company||c.roles.join(' · '))} · ${esc(c.phone||c.email||'Coordonnées à renseigner')}</small></span><span class="badge">${c.roles.join(' · ')}</span></button>`).join('')||'<div class="empty">Ajoutez votre premier contact.</div>'}</section>`}
function openContact(id){if(!contacts.some(contact=>String(contact.id)===String(id)))return toast('Contact introuvable dans cet annuaire.');currentContactId=String(id);view='contact';render()}
function contactMatches(c,value){return Boolean(value)&&[c.id,c.name,c.company,c.email,c.phone].filter(Boolean).some(item=>String(item).trim().toLowerCase()===String(value).trim().toLowerCase())}
function contactDetail(){const c=contacts.find(x=>String(x.id)===String(currentContactId));if(!c){view='contacts';return contactsView()}const linked=jobs.filter(j=>(j.contactIds||[]).includes(c.id)||contactMatches(c,j.client)),tasks=reminders.filter(r=>contactMatches(c,r.contactId)||contactMatches(c,r.contact)||contactMatches(c,r.note)),quoteItems=quotes.filter(q=>contactMatches(c,q.client)||contactMatches(c,q.contact)||linked.some(j=>j.id===q.job)),invoices=(accountingData?.customerInvoices||[]).filter(i=>contactMatches(c,i.client)||contactMatches(c,i.contact)||linked.some(j=>j.id===i.job)),bills=(accountingData?.supplierBills||[]).filter(b=>contactMatches(c,b.supplier)||contactMatches(c,b.contact)||linked.some(j=>j.id===b.job)),docs=allDocuments().filter(d=>contactMatches(c,d.owner)||contactMatches(c,d.contact)||linked.some(j=>String(j.id)===String(d.linkId)||String(j.id)===String(d.job)));const rows=(items,empty,renderItem)=>items.length?items.map(renderItem).join(''):`<div class="empty">${empty}</div>`;return '<div class="contact-detail-back"><button class="btn" type="button" onclick="navigate(\'contacts\')">← Retour à l’annuaire</button></div>'+heading(c.name,c.company||c.roles.join(' · '),false)+`<div class="contact-actions">${c.phone?`<a class="btn" href="tel:${esc(c.phone)}">Appeler</a>`:''}${c.email?`<a class="btn primary" href="mailto:${esc(c.email)}">Écrire un e-mail</a>`:''}<button class="btn" onclick="contactForm('${c.id}')">Modifier</button><button class="btn" onclick="mergeContactForm('${c.id}')">Fusionner un doublon</button></div><section class="panel"><div class="panel-head"><h2>Chantiers associés</h2></div>${rows(linked,'Aucun chantier associé.',j=>`<button class="task" onclick="openJobWorkspace(${j.id})"><span class="task-text"><strong>${esc(j.name)}</strong><small>${esc(j.client||j.town||'')}</small></span><span>↗</span></button>`)}</section><section class="panel"><div class="panel-head"><h2>Historique commercial</h2></div>${rows(quoteItems,'Aucun devis associé.',q=>`<div class="detail-row"><span><strong>${esc(q.ref||q.title||'Devis')}</strong><small>${esc(q.status||'')}</small></span><b>${q.amount!=null?money(q.amount):''}</b></div>`)}${rows(invoices,'Aucune facture client associée.',i=>`<div class="detail-row"><span><strong>${esc(i.ref||'Facture client')}</strong><small>${fullDate(i.due||i.date)} · ${esc(i.status||'')}</small></span><b>${money(i.amount||0)}</b></div>`)}</section><section class="panel"><div class="panel-head"><h2>Suivi opérationnel</h2></div>${rows(tasks,'Aucune tâche associée.',r=>`<button class="task" onclick="showReminder('${jsString(r.id)}')"><span class="task-text"><strong>${esc(r.title)}</strong><small>${fullDate(r.date)} · ${esc(r.kind||'Tâche')}</small></span><span>↗</span></button>`)}</section><section class="panel"><div class="panel-head"><h2>Documents et achats</h2></div>${rows(docs,'Aucun document associé.',d=>`<div class="detail-row"><span><strong>${esc(d.name||d.type||'Document')}</strong><small>${esc(d.type||'')} · ${fullDate(d.date)}</small></span></div>`)}${rows(bills,'Aucune facture fournisseur associée.',b=>`<div class="detail-row"><span><strong>${esc(b.ref||'Facture fournisseur')}</strong><small>${fullDate(b.date)} · ${esc(b.status||'')}</small></span><b>${money(b.amount||0)}</b></div>`)}</section>`}
function mergeContactForm(targetId){const candidates=contacts.filter(c=>c.id!==targetId);modal('Fusionner un doublon',`<p class="notice">Les liens aux chantiers du contact choisi seront ajoutés à cette fiche, puis le doublon sera retiré.</p>${candidates.map(c=>`<button class="doc-link" onclick="mergeContacts('${targetId}','${c.id}')"><span><strong>${esc(c.name)}</strong><small>${esc(c.company||c.email||c.phone||'')}</small></span><span>Fusionner</span></button>`).join('')||'<div class="empty">Aucun autre contact.</div>'}`)}
function mergeContacts(keepId,removeId){const keep=contacts.find(c=>c.id===keepId),remove=contacts.find(c=>c.id===removeId);if(!keep||!remove)return;for(const key of ['company','phone','email'])if(!keep[key]&&remove[key])keep[key]=remove[key];keep.roles=[...new Set([...keep.roles,...remove.roles])];jobs.forEach(j=>{if((j.contactIds||[]).includes(removeId))j.contactIds=[...new Set([...(j.contactIds||[]).filter(id=>id!==removeId),keepId])];});contacts=contacts.filter(c=>c.id!==removeId);closeModal();render();toast('Doublon fusionné, liens conservés.')}
function parseCsv(text,separator){const out=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const char=text[i],next=text[i+1];if(char==='"'&&quoted&&next==='"'){cell+='"';i++}else if(char==='"')quoted=!quoted;else if(char===separator&&!quoted){row.push(cell.trim());cell=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&next==='\n')i++;row.push(cell.trim());if(row.some(Boolean))out.push(row);row=[];cell=''}else cell+=char}row.push(cell.trim());if(row.some(Boolean))out.push(row);return out}
function normalizeHeader(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function importContactsCsv(event){const file=event.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{const raw=String(reader.result).replace(/^\uFEFF/,''),separator=(raw.match(/;/g)||[]).length>(raw.match(/,/g)||[]).length?';':',',rows=parseCsv(raw,separator);if(rows.length<2)return toast('Le fichier CSV ne contient aucune ligne à importer.');const headers=rows.shift().map(normalizeHeader),field=(aliases,row)=>{const i=headers.findIndex(h=>aliases.includes(h));return i<0?'':row[i]||''},proposed=rows.map(row=>({name:field(['nom','name','contact'],row),company:field(['societe','company','entreprise'],row),roles:field(['role','type','fonction'],row).split(/[|,/]/).map(x=>x.trim()).filter(x=>roles.includes(x)),phone:field(['telephone','phone','tel'],row),email:field(['email','e-mail','mail'],row)})).filter(item=>item.name).map(item=>({...item,roles:item.roles.length?item.roles:['Client']}));previewContactsImport(proposed,file.name)};reader.readAsText(file,'UTF-8')}
let pendingContactsImport=[];
function previewContactsImport(items,fileName){const existing=item=>contacts.find(c=>c.name.toLowerCase()===item.name.toLowerCase()&&(item.email&&c.email.toLowerCase()===item.email.toLowerCase()||item.phone&&c.phone===item.phone)),newItems=items.filter(item=>!existing(item)),duplicates=items.filter(item=>existing(item));pendingContactsImport=newItems;modal('Vérifier l’import · '+fileName,`<p class="notice"><strong>${newItems.length}</strong> nouveau(x) contact(s) et <strong>${duplicates.length}</strong> doublon(s) potentiel(s). Rien n’est ajouté avant confirmation.</p><div class="import-preview"><h3>Nouveaux contacts</h3>${newItems.slice(0,12).map(item=>`<div class="detail-row"><span><strong>${esc(item.name)}</strong><small>${esc(item.company||item.email||item.phone||'')}</small></span><span class="badge green">À ajouter</span></div>`).join('')||'<p class="subtle">Aucun.</p>'}${newItems.length>12?`<p class="subtle">… et ${newItems.length-12} autre(s).</p>`:''}<h3>Doublons potentiels</h3>${duplicates.slice(0,12).map(item=>`<div class="detail-row"><span><strong>${esc(item.name)}</strong><small>${esc(item.company||item.email||item.phone||'')}</small></span><span class="badge warn">À fusionner manuellement</span></div>`).join('')||'<p class="subtle">Aucun.</p>'}</div><div class="modal-actions"><button class="btn" onclick="closeModal()">Annuler</button><button class="btn primary" onclick="confirmContactsImport()">Importer ${newItems.length} contact(s)</button></div>`)}
function confirmContactsImport(){const items=pendingContactsImport;items.forEach(item=>contacts.push({id:'contact-'+crypto.randomUUID(),...item}));pendingContactsImport=[];closeModal();render();toast(`${items.length} contact(s) importé(s). Les doublons restent à vérifier.`)}
const renderContacts=render;render=function(){if(view!=='contacts'&&view!=='contact')return renderContacts();document.querySelector('#nav').innerHTML=tabs2.map(([k,l])=>`<button class="${view===k?'active':''}" onclick="navigate('${k}')">${l}</button>`).join('');document.querySelector('#main').innerHTML=view==='contacts'?contactsView():contactDetail();scheduleSave()};

/* IA-C — annuaire commercial: liste courte + vue complète */
let iaCContactVisibleCount=5;
const iaCContactsViewBase=contactsView;
contactsView=function(){
  const query=String(contactQuery||'').trim().toLowerCase();
  const filtered=contacts
    .filter(c=>(contactRole==='Tous'||c.roles.includes(contactRole)))
    .filter(c=>[c.name,c.company,c.phone,c.email,...(c.roles||[])].join(' ').toLowerCase().includes(query))
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'fr',{sensitivity:'base'}));
  const visible=filtered.slice(0,iaCContactVisibleCount);
  const remaining=Math.max(0,filtered.length-visible.length);
  return heading('Contacts','Clients, architectes, fournisseurs et sous-traitants.',false)+
    `<div class="catalogue-tools"><input placeholder="Rechercher un contact…" value="${esc(contactQuery)}" oninput="contactQuery=this.value;iaCContactVisibleCount=5;render()"><label class="btn upload">Importer CSV<input type="file" accept=".csv,text/csv" onchange="importContactsCsv(event)"></label><button class="btn primary" onclick="contactForm()">+ Nouveau contact</button></div>
    <div class="filter-pills">${['Tous',...roles].map(r=>`<button class="${contactRole===r?'selected':''}" onclick="contactRole='${jsString(r)}';iaCContactVisibleCount=5;render()">${r}</button>`).join('')}</div>
    <section class="panel"><div class="panel-head"><div><p class="eyebrow">ANNUAIRE COMMERCIAL</p><h2>${filtered.length} contact(s)</h2></div><span class="subtle">A→Z · recherche · filtre · fiche détaillée</span></div>
    ${visible.map(c=>`<button class="task" data-contact-id="${esc(c.id)}" onclick="openContact('${jsString(c.id)}')"><span class="task-text"><strong>${esc(c.name)}</strong><small>${esc(c.company||c.roles.join(' · '))} · ${esc(c.phone||c.email||'Coordonnées à renseigner')}</small></span><span class="badge">${esc(c.roles.join(' · '))}</span></button>`).join('')||'<div class="empty">Aucun contact ne correspond à la recherche.</div>'}
    ${remaining>0?`<div class="ia-c-list-more"><button class="btn" onclick="iaCContactVisibleCount=contacts.length;render()">Afficher les ${remaining} autres</button></div>`:''}</section>`;
};

/* IA-C — annuaire relationnel serveur */
let iaCServerDirectoryState='idle',iaCCustomers=[],iaCSuppliers=[];
async function iaCLoadServerDirectory(){
  if(iaCServerDirectoryState==='loading')return;
  iaCServerDirectoryState='loading';render();
  try{
    const [customersData,suppliersData]=await Promise.all([serverJson('/api/customers?limit=250'),serverJson('/api/suppliers?limit=250')]);
    iaCCustomers=Array.isArray(customersData.customers)?customersData.customers:[];
    iaCSuppliers=Array.isArray(suppliersData.suppliers)?suppliersData.suppliers:[];
    iaCServerDirectoryState='ready';
  }catch(error){iaCServerDirectoryState='error';}
  render();
}
function iaCServerDirectoryPanel(){
  if(iaCServerDirectoryState==='idle'){queueMicrotask(iaCLoadServerDirectory);return '<section class="panel loading-card"><strong>Chargement de l’annuaire serveur…</strong></section>';}
  if(iaCServerDirectoryState==='loading')return '<section class="panel loading-card"><strong>Chargement de l’annuaire serveur…</strong></section>';
  if(iaCServerDirectoryState==='error')return '<section class="panel load-error"><h2>Annuaire serveur indisponible</h2><button class="btn" onclick="iaCServerDirectoryState=\'idle\';render()">Réessayer</button></section>';
  const q=String(contactQuery||'').trim().toLowerCase();
  const customers=iaCCustomers.filter(c=>[c.companyName,c.firstName,c.lastName,c.email,c.phone,c.vatNumber].join(' ').toLowerCase().includes(q));
  const suppliers=iaCSuppliers.filter(v=>[v.name,v.email,v.phone,v.vatNumber].join(' ').toLowerCase().includes(q));
  const customerRows=customers.slice(0,25).map(c=>'<div class="detail-row"><span><strong>'+esc(c.companyName||[c.firstName,c.lastName].filter(Boolean).join(' ')||c.id)+'</strong><small>'+esc(c.vatNumber||c.email||c.phone||'Coordonnées à renseigner')+'</small></span><span class="badge">Serveur</span></div>').join('');
  const supplierRows=suppliers.slice(0,25).map(v=>'<div class="detail-row"><span><strong>'+esc(v.name)+'</strong><small>'+esc(v.vatNumber||v.email||v.phone||'Coordonnées à renseigner')+'</small></span><span class="badge">Serveur</span></div>').join('');
  return '<section class="panel ia-c-server-directory"><div class="panel-head"><div><p class="eyebrow">DONNÉES COMMERCIALES · SERVEUR</p><h2>Clients '+customers.length+' · Fournisseurs '+suppliers.length+'</h2><span>Tenant-scoped · persisté côté serveur</span></div></div><div class="ia-c-directory-columns"><div><h3>Clients</h3>'+(customerRows||'<div class="empty">Aucun client serveur.</div>')+'</div><div><h3>Fournisseurs</h3>'+(supplierRows||'<div class="empty">Aucun fournisseur serveur.</div>')+'</div></div></section>';
}

(function () {
  var contactMenu = null;
  function closeContactMenu() { if (contactMenu) { contactMenu.remove(); contactMenu = null; } }
  function contactById(id) { return (typeof contacts !== 'undefined' && Array.isArray(contacts)) ? contacts.find(function (item) { return String(item.id) === String(id); }) : null; }
  function contactItem(label, action) { var button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label; button.dataset.contactAction = action; return button; }
  function openContactMenu(row, x, y) {
    closeContactMenu();
    var contact = row ? contactById(row.dataset.contactId) : null;
    if (!contact) return;
    var menu = document.createElement('div');
    menu.className = 'ia-job-context ia-contact-context';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Actions du contact');
    var title = document.createElement('div');
    title.className = 'ia-job-context-title';
    title.textContent = contact.name || 'Contact';
    var meta = document.createElement('small');
    meta.textContent = [contact.company, contact.phone, contact.email].filter(Boolean).join(' · ') || (contact.roles || []).join(' · ');
    title.append(meta);
    menu.append(title, contactItem('Ouvrir la fiche', 'open'));
    if (contact.phone) menu.append(contactItem('Appeler', 'call'));
    if (contact.email) menu.append(contactItem('Écrire un e-mail', 'mail'));
    menu.append(contactItem('Modifier', 'edit'), contactItem('Fusionner un doublon', 'merge'));
    if (contact.email) menu.append(contactItem('Copier l’e-mail', 'copy'));
    menu.style.visibility = 'hidden';
    document.body.append(menu);
    menu.style.left = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8)) + 'px';
    menu.style.visibility = 'visible';
    contactMenu = menu;
    menu.addEventListener('click', function (event) {
      var button = event.target.closest('[data-contact-action]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      var action = button.dataset.contactAction;
      closeContactMenu();
      if (action === 'open' && typeof openContact === 'function') openContact(contact.id);
      if (action === 'call' && contact.phone) window.location.href = 'tel:' + contact.phone;
      if (action === 'mail' && contact.email) window.location.href = 'mailto:' + contact.email;
      if (action === 'edit' && typeof contactForm === 'function') contactForm(contact.id);
      if (action === 'merge' && typeof mergeContactForm === 'function') mergeContactForm(contact.id);
      if (action === 'copy' && contact.email && navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(contact.email).then(function () { if (typeof toast === 'function') toast('E-mail copié.'); }).catch(function () {});
    });
  }
  document.addEventListener('contextmenu', function (event) {
    if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) return;
    var row = event.target.closest ? event.target.closest('#main [data-contact-id]') : null;
    if (!row) return;
    event.preventDefault();
    openContactMenu(row, event.clientX, event.clientY);
  });
  document.addEventListener('pointerdown', function (event) { if (contactMenu && !contactMenu.contains(event.target)) closeContactMenu(); }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeContactMenu();
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      var row = event.target.closest ? event.target.closest('#main [data-contact-id]') : null;
      if (!row) return;
      event.preventDefault();
      var box = row.getBoundingClientRect();
      openContactMenu(row, box.left + 40, box.top + 20);
    }
  });
  window.addEventListener('scroll', closeContactMenu, true);
})();

(function () {
  var drawer = null;
  function closeDrawer() { if (drawer) { drawer.remove(); drawer = null; } }
  function jobById(id) { return (typeof jobs !== 'undefined' && Array.isArray(jobs)) ? jobs.find(function (job) { return String(job.id) === String(id); }) : null; }
  function linked(job, contactId) { return (job.contactIds || []).map(String).includes(String(contactId)); }
  function associate(job, contactId) {
    if (!job || linked(job, contactId)) return false;
    var previous = (job.contactIds || []).slice();
    job.contactIds = (job.contactIds || []).concat([contactId]);
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof render === 'function') render();
    var contact = (typeof contacts !== 'undefined' ? contacts : []).find(function (item) { return String(item.id) === String(contactId); });
    if (typeof toast === 'function') toast((contact ? contact.name : 'Contact') + ' associé au chantier.', 'Annuler', function () {
      job.contactIds = previous;
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof render === 'function') render();
    });
    return true;
  }
  function rowFor(contact, job) {
    var row = document.createElement('div');
    row.className = 'job-contact-row' + (linked(job, contact.id) ? ' is-linked' : '');
    row.draggable = !linked(job, contact.id);
    row.dataset.contactId = contact.id;
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    var name = document.createElement('strong');
    name.textContent = contact.name || 'Contact';
    var meta = document.createElement('small');
    meta.textContent = [contact.company, contact.phone, contact.email].filter(Boolean).join(' · ') || (contact.roles || []).join(' · ');
    row.append(name, meta);
    if (linked(job, contact.id)) {
      var badge = document.createElement('span');
      badge.className = 'job-contact-linked';
      badge.textContent = 'Associé';
      row.append(badge);
    }
    row.addEventListener('click', function () { if (!linked(job, contact.id) && associate(job, contact.id)) closeDrawer(); });
    row.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!linked(job, contact.id) && associate(job, contact.id)) closeDrawer(); } });
    row.addEventListener('dragstart', function (event) {
      if (linked(job, contact.id)) { event.preventDefault(); return; }
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'copy';
        try { event.dataTransfer.setData('text/plain', 'contact:' + contact.id); } catch (error) {}
      }
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', function () { row.classList.remove('is-dragging'); });
    return row;
  }
  function openDrawer(jobId) {
    closeDrawer();
    var job = jobById(jobId);
    if (!job) return;
    var panel = document.createElement('aside');
    panel.className = 'job-contact-drawer';
    panel.setAttribute('aria-label', 'Contacts du chantier');
    var head = document.createElement('div');
    head.className = 'job-contact-drawer-head';
    var title = document.createElement('div');
    var eyebrow = document.createElement('p'); eyebrow.className = 'eyebrow'; eyebrow.textContent = 'CONTACTS DU CHANTIER';
    var heading = document.createElement('h2'); heading.textContent = job.name || 'Chantier';
    title.append(eyebrow, heading);
    var close = document.createElement('button'); close.type = 'button'; close.className = 'btn'; close.textContent = 'Fermer'; close.addEventListener('click', closeDrawer);
    head.append(title, close);
    var hint = document.createElement('p');
    hint.className = 'job-contact-drawer-hint';
    hint.textContent = 'Glissez un contact sur la zone ci-dessous, ou cliquez pour l’associer.';
    var drop = document.createElement('div');
    drop.className = 'job-contact-drop';
    drop.dataset.jobContactDrop = '';
    drop.textContent = 'Déposez un contact ici';
    var search = document.createElement('input');
    search.type = 'search'; search.placeholder = 'Rechercher un contact…'; search.setAttribute('aria-label', 'Rechercher un contact à associer');
    var list = document.createElement('div');
    list.className = 'job-contact-list';
    var sorted = (typeof contacts !== 'undefined' && Array.isArray(contacts) ? contacts.slice() : []).sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'fr', { sensitivity: 'base' }); });
    sorted.forEach(function (contact) { list.append(rowFor(contact, job)); });
    if (!sorted.length) { var empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'Aucun contact dans l’annuaire.'; list.append(empty); }
    search.addEventListener('input', function () {
      var value = String(search.value || '').toLocaleLowerCase('fr');
      Array.prototype.forEach.call(list.querySelectorAll('.job-contact-row'), function (row) {
        row.hidden = Boolean(value) && !row.textContent.toLocaleLowerCase('fr').includes(value);
      });
    });
    drop.addEventListener('dragover', function (event) { event.preventDefault(); drop.classList.add('is-over'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('dragleave', function () { drop.classList.remove('is-over'); });
    drop.addEventListener('drop', function (event) {
      event.preventDefault();
      drop.classList.remove('is-over');
      var contactId = '';
      try { contactId = String(event.dataTransfer.getData('text/plain') || '').replace('contact:', ''); } catch (error) {}
      if (contactId && associate(job, contactId)) closeDrawer();
    });
    panel.append(head, hint, drop, search, list);
    var backdrop = document.createElement('button');
    backdrop.type = 'button'; backdrop.className = 'job-contact-backdrop'; backdrop.setAttribute('aria-label', 'Fermer');
    backdrop.addEventListener('click', closeDrawer);
    var host = document.createElement('div');
    host.className = 'job-contact-layer';
    host.append(backdrop, panel);
    document.body.append(host);
    drawer = host;
    var escape = function (event) { if (event.key === 'Escape') { closeDrawer(); document.removeEventListener('keydown', escape); } };
    document.addEventListener('keydown', escape);
    search.focus();
  }
  function enhanceJobWorkspace() {
    var head = document.querySelector('#main .job-workspace-head');
    if (!head || head.querySelector('[data-job-contacts-button]')) return;
    if (typeof currentJobId === 'undefined' || !currentJobId) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn job-contacts-button';
    button.dataset.jobContactsButton = '';
    button.textContent = 'Contacts';
    button.addEventListener('click', function () { openDrawer(currentJobId); });
    head.append(button);
  }
  var observer = new MutationObserver(function () { enhanceJobWorkspace(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', enhanceJobWorkspace);
  globalThis.openJobContactsDrawer = openDrawer;
})();
