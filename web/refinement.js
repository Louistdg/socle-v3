// Refinement pass: clearer separation of people/teams and richer business records.
let peopleSection='people',tradeFilter='Tous',docCategory='Tous',docQuery='';

const refinementProfiles={
  1:{category:'Ouvrier',trade:'Couvreur',qualification:'Q2',otherTrades:['Charpentier']},
  2:{category:'Ouvrier',trade:'Couvreur',qualification:'Q1',otherTrades:['Isolation']},
  3:{category:'Apprenti',trade:'Couvreur',qualification:'Apprenti 3e année',otherTrades:[]},
  4:{category:'Ouvrier',trade:'Maçon',qualification:'Q2',otherTrades:['Coffreur']},
  5:{category:'Intérimaire',trade:'Charpentier',qualification:'Q1',otherTrades:['Bardeur']},
  6:{category:'Employé',trade:'Administration',qualification:'Gestion administrative',otherTrades:['Facturation']}
};

const toolSeeds=[
  ['tool-drill-01','Visseuse 18 V · 01','Makita DDF484','MK-DDF-24031','Atelier principal'],
  ['tool-drill-02','Visseuse 18 V · 02','Makita DDF484','MK-DDF-24032','VW Crafter 01'],
  ['tool-drill-03','Visseuse à choc · 03','DeWalt DCF887','DW-887-22114','Iveco Daily 02'],
  ['tool-drill-04','Perceuse SDS · 04','Bosch GBH 18V-26','BS-GBH-19082','Atelier principal'],
  ['tool-drill-05','Perceuse-visseuse · 05','Milwaukee M18 FPD3','MW-FPD3-23017','Atelier principal'],
  ['tool-saw-01','Scie circulaire · 01','Makita DHS680','MK-DHS-21044','VW Crafter 01'],
  ['tool-saw-02','Scie circulaire · 02','DeWalt DCS570','DW-DCS-22081','Iveco Daily 02'],
  ['tool-nailer-01','Cloueur gaz · 01','Spit Pulsa 40P+','SP-40P-23109','Atelier principal'],
  ['tool-laser-01','Laser rotatif · 01','Bosch GRL 400 H','BS-GRL-20051','Bureau technique']
];

function ensureRefinementData(seedDemo=false){if(globalThis.SOCLE_PRODUCTION||company.blankWorkspace)return;
  people.forEach(p=>{
    const profile=refinementProfiles[p.id]||{};
    p.category??=profile.category||'Ouvrier';
    p.trade??=profile.trade||'';
    p.qualification??=profile.qualification||'';
    p.otherTrades??=profile.otherTrades||[];
  });

  jobs.forEach((j,i)=>{
    j.documents??=[];
    if(seedDemo&&!j.documents.length){
      j.documents=i===0
        ?[{id:'plan',name:'Plan de toiture · indice B',type:'Plan',date:'2026-09-08',status:'Validé'},{id:'permit',name:'Autorisation communale',type:'Autorisation',date:'2026-08-19',status:'Classé'},{id:'safety',name:'Plan de sécurité chantier',type:'Sécurité',date:'2026-09-14',status:'À signer'}]
        :i===1
          ?[{id:'plan',name:'Plans architecte · extension',type:'Plan',date:'2026-08-28',status:'Validé'},{id:'permit',name:'Permis d’urbanisme',type:'Autorisation',date:'2026-07-12',status:'Classé'}]
          :[{id:'order',name:'Bon d’intervention',type:'Chantier',date:'2026-09-20',status:'Classé'}];
    }
    j.finance??={materials:i===0?5900:i===1?3650:480,subcontracting:i===1?1800:0,other:i===0?850:i===1?620:190,hourlyCost:38};
    if(seedDemo&&!j.refinementTimeSeed&&!(j.timeEntries||[]).length){
      if(i===0)j.timeEntries=[
        {id:9101,team:1,people:[1,2,3],date:'2026-09-17',arrival:'07:15',departure:'16:15',note:'Dépose et protection'},
        {id:9102,team:1,people:[1,2,3],date:'2026-09-18',arrival:'07:10',departure:'16:05',note:'Sous-toiture et lattage'},
        {id:9103,team:1,people:[1,2,3],date:'2026-09-21',arrival:'07:20',departure:'15:50',note:'Pose des tuiles'}
      ];
      if(i===1)j.timeEntries=[
        {id:9201,team:2,people:[4,5],date:'2026-09-18',arrival:'07:30',departure:'16:00',note:'Implantation'},
        {id:9202,team:2,people:[4,5],date:'2026-09-21',arrival:'07:25',departure:'16:10',note:'Montage charpente'}
      ];
      j.refinementTimeSeed=true;
    }
  });

  quotes.forEach((q,i)=>{
    const j=jobs.find(j=>j.id===q.job);
    q.client??=j?.client||'';
    q.clientAddress??=j?[j.address,j.town].filter(Boolean).join(', '):'';
    q.date??=i===0?'2026-08-22':'2026-09-12';
    q.validUntil??=i===0?'2026-09-21':'2026-10-12';
    q.deposit??=30;
    q.paymentTerms??='Acompte à la commande, solde selon l’avancement des travaux.';
    q.exclusions??='Travaux imprévus non décrits dans le présent devis.';
    q.notes??='Sous réserve de l’état réel du support après ouverture.';
    q.lines=(q.lines||[]).map((l,k)=>({
      ...l,
      description:l.description||(k===0?'Fourniture, préparation et mise en œuvre selon la fiche chantier.':'Fourniture et pose, finitions comprises.'),
      unit:l.unit||(Number(l.qty)>10?'m²':'forfait'),
      vat:Number.isFinite(Number(l.vat))?Number(l.vat):(i===0?6:21)
    }));
  });

  if(!accountingData.refinedPayroll){accountingData.monthlyPayroll=22400;accountingData.refinedPayroll=true}
  accountingData.customerInvoices.forEach((x,i)=>{
    x.job??=jobs.find(j=>j.client===x.client)?.id||jobs[i%jobs.length]?.id||0;
    x.date??=i===0?'2026-09-15':'2026-08-30';
  });
  const moreInvoices=[
    {id:3,ref:'FAC-2026-016',client:'Famille Renard',job:1,date:'2026-08-28',due:'2026-09-12',amount:4500,status:'Payée'},
    {id:4,ref:'FAC-2026-022',client:'Élodie Dumas',job:2,date:'2026-09-20',due:'2026-10-20',amount:5250,status:'À recevoir'},
    {id:5,ref:'FAC-2026-023',client:'Atelier Nord',job:3,date:'2026-09-21',due:'2026-10-06',amount:1450,status:'À recevoir'}
  ];
  moreInvoices.forEach(x=>{if(!accountingData.customerInvoices.some(y=>y.ref===x.ref))accountingData.customerInvoices.push(x)});

  toolSeeds.forEach((seed,i)=>{
    if(assets.some(a=>a.seedCode===seed[0]))return;
    assets.push({
      id:100+i,seedCode:seed[0],name:seed[1],brandModel:seed[2],serial:seed[3],category:'Outil',group:'tools',mode:'Achat',provider:'Outillage Pro · démo',reference:'FAC-OUT-'+String(101+i),start:'2024-0'+((i%8)+1)+'-15',end:'',monthly:0,responsible:'Responsable matériel',attached:seed[4],contents:'Outil inventorié avec chargeur et accessoires correspondants.',condition:i===3?'À réparer':'En service',repairNote:i===3?'Mandrin à contrôler avant remise en service.':'',history:[{date:'2024-0'+((i%8)+1)+'-15',text:'Achat, marquage et entrée dans l’inventaire.'},{date:'2026-06-10',text:'Contrôle visuel et inventaire réalisés.'}],docs:['Facture d’achat','Fiche d’inventaire']
    });
  });

  newsItems.forEach((n,i)=>{
    n.userStatus??='À vérifier';
    n.deadline??=['2026-10-15','2026-11-01','2026-12-31'][i]||'2026-12-31';
  });
}

ensureRefinementData(true);
const restoreRefinementBase=restoreWorkspace;
restoreWorkspace=function(s){restoreRefinementBase(s);ensureRefinementData()};

function personnelTable(list){
  return list.length?`<div class="data-table people-table"><table><thead><tr><th>Personne</th><th>Fonction</th><th>Métier</th><th>Équipe / statut</th><th></th></tr></thead><tbody>${list.map(p=>{const id=typeof p.id==='number'&&Number.isSafeInteger(p.id)?String(p.id):JSON.stringify(String(p.id)).replaceAll('"','&quot;'),teamNames=(teams||[]).filter(team=>(team.members||[]).map(String).includes(String(p.id))).map(team=>team.name),status=p.inactiveAt?'Inactif':'Actif';return `<tr class="personnel-row" data-person-id="${id}" role="button" tabindex="0" onclick="showPersonDossier(${id})" onkeydown="if(event.target===this&&(event.key==='Enter'||event.key===' ')){event.preventDefault();showPersonDossier(${id})}"><td><span class="person-cell">${face(p)}<span><strong>${esc(p.name)}</strong><small>Entrée le ${fullDate(p.start)}</small></span></span></td><td>${esc(p.role||'À définir')}</td><td><strong>${esc(p.trade||'À définir')}</strong>${p.otherTrades?.length?`<small>+ ${esc(p.otherTrades.join(', '))}</small>`:''}</td><td>${esc(teamNames.join(', ')||'Sans équipe')} · ${status}</td><td><span class="person-drag-grip" draggable="true" data-person-drag="${id}" role="button" tabindex="0" aria-label="Glisser ${esc(p.name)} dans une équipe" title="Glisser dans une équipe"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="5" cy="3.5" r="1.3"/><circle cx="11" cy="3.5" r="1.3"/><circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/><circle cx="5" cy="12.5" r="1.3"/><circle cx="11" cy="12.5" r="1.3"/></svg></span><span class="link">Dossier ↗</span></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Aucune personne dans cette sélection.</div>';
}

peopleView=function(){
  const types=['Tous','Ouvrier','Employé','Apprenti','Stagiaire','Intérimaire'];
  const trades=['Tous',...new Set(people.map(p=>p.trade).filter(Boolean))];
  const filtered=people.filter(p=>(personCategory==='Tous'||p.category===personCategory)&&(tradeFilter==='Tous'||p.trade===tradeFilter));
  const assigned=new Set(teams.flatMap(t=>t.members));
  return heading('Personnel & équipes','Les dossiers individuels et les équipes sont volontairement séparés.',false)+`
    <div class="module-switch" role="group" aria-label="Vue du personnel">
      <button aria-pressed="${peopleSection==='people'}" class="${peopleSection==='people'?'selected':''}" onclick="peopleSection='people';render()">Tout le personnel <b>${people.length}</b></button>
      <button aria-pressed="${peopleSection==='teams'}" class="${peopleSection==='teams'?'selected':''}" onclick="peopleSection='teams';render()">Équipes attitrées <b>${teams.length}</b></button>
    </div>
    ${peopleSection==='people'?`
      <div class="people-toolbar balanced-toolbar"><div class="filter-pills">${types.map(v=>`<button class="${v===personCategory?'selected':''}" onclick="personCategory='${v}';render()">${v==='Tous'?'Tous les statuts':v}</button>`).join('')}</div><div><label class="inline-select">Métier<select onchange="tradeFilter=this.value;render()">${trades.map(v=>`<option ${v===tradeFilter?'selected':''}>${esc(v)}</option>`).join('')}</select></label><button class="btn primary" onclick="personForm()">+ Personne</button></div></div>
      <section class="panel"><div class="panel-head"><div><p class="eyebrow">DOSSIERS INDIVIDUELS</p><h2>${filtered.length} personne(s)</h2></div><span class="subtle">Cliquez sur une ligne pour ouvrir l’historique complet.</span></div>${personnelTable(filtered)}</section>
    `:`
      <div class="section-heading"><div><p class="eyebrow">ORGANISATION DU TERRAIN</p><h2>Équipes attitrées</h2></div><button class="btn primary" onclick="teamForm()">+ Créer une équipe</button></div>
      <div class="team-overview">${teams.map(t=>`<section class="panel team-overview-card" data-team-drop="${esc(t.id)}"><div class="panel-head"><div><p class="eyebrow">ÉQUIPE</p><h2>${esc(t.name)} <span class="count">${t.members.length}</span></h2></div><button class="btn" onclick="teamForm(${t.id})">Composer</button></div>${personnelTable(t.members.map(getPerson).filter(Boolean))}</section>`).join('')}<section class="panel team-overview-card" data-team-drop=""><div class="panel-head"><div><p class="eyebrow">DISPONIBLES</p><h2>Sans équipe attitrée</h2></div></div>${personnelTable(people.filter(p=>!assigned.has(p.id)))}</section></div>
    `}`;
};

const showPersonDossierRefinementBase=showPersonDossier;
showPersonDossier=function(id){
  showPersonDossierRefinementBase(id);
  const p=getPerson(id),head=document.querySelector('#modalbody .person-dossier-head');
  if(!p||!head)return;
  head.insertAdjacentHTML('afterend',`<section class="professional-summary"><div><small>Fonction</small><strong>${esc(p.role||'À définir')}</strong></div><div><small>Corps de métier</small><strong>${esc(p.trade||'À définir')}</strong></div><div><small>Qualification</small><strong>${esc(p.qualification||'À définir')}</strong></div><div><small>Autres compétences</small><strong>${esc(p.otherTrades?.join(', ')||'—')}</strong></div></section>`);
};

function quoteNet(q){return (q.lines||[]).reduce((sum,l)=>sum+Number(l.qty||0)*Number(l.price||0),0)}
function quoteVat(q){return (q.lines||[]).reduce((sum,l)=>sum+Number(l.qty||0)*Number(l.price||0)*Number(l.vat||0)/100,0)}
function quoteGross(q){return quoteNet(q)+quoteVat(q)}
function acceptedQuoteForJob(id){return quotes.find(q=>q.job===id&&q.status==='Accepté')||quotes.find(q=>q.job===id)}
function jobFinance(j){
  const q=acceptedQuoteForJob(j.id),hours=jobHours(j),invoices=accountingData.customerInvoices.filter(x=>x.job===j.id),billed=invoices.reduce((s,x)=>s+Number(x.amount||0),0),paid=invoices.filter(x=>x.status==='Payée').reduce((s,x)=>s+Number(x.amount||0),0),labour=hours*Number(j.finance?.hourlyCost||38),expenses=labour+Number(j.finance?.materials||0)+Number(j.finance?.subcontracting||0)+Number(j.finance?.other||0),net=quoteNet(q||{lines:[]});
  return {q,hours,billed,paid,labour,expenses,net,margin:net-expenses};
}
function projectFinanceTable(){
  return `<div class="data-table finance-history"><table><thead><tr><th>Chantier</th><th>Devis HT</th><th>Facturé TVAC</th><th>Encaissé</th><th>Heures</th><th>Main-d’œuvre</th><th>Matériaux</th><th>Sous-traitance</th><th>Marge prévisionnelle</th><th></th></tr></thead><tbody>${jobs.map(j=>{const f=jobFinance(j);return `<tr><td><strong>${esc(j.name)}</strong><small>${esc(j.client)} · ${esc(j.phase)}</small></td><td>${f.q?money(f.net):'—'}</td><td>${money(f.billed)}</td><td>${money(f.paid)}</td><td>${f.hours.toFixed(1)} h</td><td>${money(f.labour)}</td><td>${money(j.finance?.materials||0)}</td><td>${money(j.finance?.subcontracting||0)}</td><td><strong class="${f.margin<0?'negative':''}">${f.q?money(f.margin):'—'}</strong><small>avant frais généraux</small></td><td><button class="link" onclick="showJob(${j.id})">Ouvrir ↗</button></td></tr>`}).join('')}</tbody></table></div>`;
}
function financialEvents(){
  const events=[];
  quotes.forEach(q=>events.push({date:q.date,label:`${q.ref} · ${q.status}`,detail:q.title,amount:quoteGross(q),kind:'Devis',job:q.job}));
  accountingData.customerInvoices.forEach(x=>events.push({date:x.date||x.due,label:`${x.ref} · ${x.status}`,detail:x.client,amount:x.amount,kind:'Facture',job:x.job}));
  jobs.forEach(j=>j.timeEntries.forEach(x=>events.push({date:x.date,label:`Heures · ${teams.find(t=>t.id===x.team)?.name||'Équipe'}`,detail:j.name,amount:null,kind:`${(netMinutes(x)*(x.people?.length||0)/60).toFixed(1)} h`,job:j.id})));
  return events.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12);
}

accountingView=function(){
  const unpaid=accountingData.customerInvoices.filter(x=>x.status!=='Payée').reduce((n,x)=>n+Number(x.amount||0),0),paid=accountingData.customerInvoices.filter(x=>x.status==='Payée').reduce((n,x)=>n+Number(x.amount||0),0),fuel=fuelRows().reduce((n,x)=>n+Number(x.total||0),0),supplier=accountingData.supplierBills.reduce((n,x)=>n+Number(x.amount||0),0);
  return heading('Comptabilité simplifiée','Une vue de pilotage compréhensible avant le passage chez le comptable.',false)+`
    <div class="account-kpis refined-kpis"><div><small>Factures clients à recevoir</small><strong>${money(unpaid)}</strong><span>${accountingData.customerInvoices.filter(x=>x.status!=='Payée').length} document(s)</span></div><div><small>Déjà encaissé</small><strong>${money(paid)}</strong><span>sur les factures enregistrées</span></div><div><small>Coût total du personnel / mois</small><strong>${money(accountingData.monthlyPayroll)}</strong><span>ensemble de l’équipe · démo</span></div><div><small>TVA estimée à réserver</small><strong>${money(accountingData.vatReserve)}</strong><span>à valider avec le comptable</span></div></div>
    <section class="panel account-projects"><div class="panel-head"><div><p class="eyebrow">RENTABILITÉ & SUIVI</p><h2>Historique financier par chantier</h2></div><span class="subtle">Devis, facturation, heures et dépenses réunis.</span></div>${projectFinanceTable()}</section>
    <div class="account-layout refined-account-layout"><section class="panel"><div class="panel-head"><h2>Factures clients</h2><button class="btn primary" onclick="invoiceForm()">+ Facture</button></div><div class="data-table"><table><thead><tr><th>Référence</th><th>Chantier</th><th>Échéance</th><th>Montant TVAC</th><th>État</th></tr></thead><tbody>${accountingData.customerInvoices.map(x=>`<tr><td><strong>${esc(x.ref)}</strong><small>${esc(x.client)}</small></td><td>${esc(jobs.find(j=>j.id===x.job)?.name||'Non lié')}</td><td>${fullDate(x.due)}</td><td>${money(x.amount)}</td><td><button class="badge ${x.status==='Payée'?'green':'warn'}" onclick="toggleInvoice(${x.id})">${esc(x.status)}</button></td></tr>`).join('')}</tbody></table></div></section><aside><section class="panel account-side"><h2>Dépenses suivies</h2><div><span>Personnel · total mensuel</span><b>${money(accountingData.monthlyPayroll)}</b></div><div><span>Fournisseurs à payer</span><b>${money(supplier)}</b></div><div><span>Carburant · total enregistré</span><b>${money(fuel)}</b></div><button class="link" onclick="assetCategory='vehicles';navigate('fleet')">Détail dans les véhicules →</button></section></aside></div>
    <section class="panel ledger-panel"><div class="panel-head"><div><p class="eyebrow">JOURNAL</p><h2>Derniers mouvements des chantiers</h2></div></div><div class="ledger-list">${financialEvents().map(x=>`<button onclick="showJob(${x.job})"><time>${fullDate(x.date)}</time><span class="badge">${esc(x.kind)}</span><span><strong>${esc(x.label)}</strong><small>${esc(x.detail)}</small></span><b>${x.amount===null?'':money(x.amount)}</b><i>↗</i></button>`).join('')}</div></section>
    <p class="notice">Cette vue sert au pilotage. Les déclarations, taux applicables et écritures définitives restent à valider avec le comptable.</p>`;
};

invoiceForm=function(){modal('Ajouter une facture client',`<form onsubmit="saveInvoice(event)"><label>Chantier<select name="job">${jobs.map(j=>`<option value="${j.id}">${esc(j.name)} · ${esc(j.client)}</option>`).join('')}</select></label><div class="form-two"><label>Référence<input name="ref" required placeholder="FAC-2026-024"></label><label>Date de facture<input name="date" type="date" required value="${reference}"></label><label>Échéance<input name="due" type="date" required value="${reference}"></label><label>Montant TVAC<input name="amount" type="number" min="0" step="0.01" required></label></div><div class="modal-actions"><button class="btn primary">Enregistrer</button></div></form>`)};
saveInvoice=function(e){e.preventDefault();const f=new FormData(e.target),j=jobs.find(j=>j.id===+f.get('job'));accountingData.customerInvoices.push({id:Date.now(),ref:f.get('ref').trim(),client:j?.client||'',job:j?.id||0,date:f.get('date'),due:f.get('due'),amount:+f.get('amount'),status:'À recevoir'});closeModal();render();toast('Facture ajoutée au chantier.')};

quotesView=function(){
  const accepted=quotes.filter(q=>q.status==='Accepté').reduce((n,q)=>n+quoteGross(q),0);
  return heading('Devis','Des devis complets pour le patron, avec une version terrain sans les prix.',false)+`<div class="quote-summary"><div><small>Devis suivis</small><strong>${quotes.length}</strong></div><div><small>Acceptés · TVAC</small><strong>${money(accepted)}</strong></div><button class="btn primary" onclick="quoteForm()">+ Créer un devis</button></div><section class="panel quote-list"><div class="quote-list-head"><span>Référence / objet</span><span>Client & chantier</span><span>Validité</span><span>Total TVAC</span><span>État</span><span></span></div>${quotes.map(q=>{const j=jobs.find(j=>j.id===q.job);return `<button class="quote-list-row" onclick="showQuote(${q.id})"><span><b>${esc(q.ref)}</b><small>${esc(q.title)}</small></span><span><b>${esc(q.client||j?.client||'')}</b><small>${esc(j?.name||'Chantier à choisir')}</small></span><span>${fullDate(q.validUntil)}</span><strong>${money(quoteGross(q))}</strong><span class="badge ${q.status==='Accepté'?'green':'warn'}">${esc(q.status)}</span><i>↗</i></button>`}).join('')}</section><p class="help-line">Les montants et taux de TVA sont des exemples. Le document final doit être contrôlé avant envoi ou signature.</p>`;
};

quoteLine=function(l={label:'',description:'',qty:1,unit:'forfait',price:0,vat:21}){return `<div class="quote-edit-line"><input name="label" aria-label="Désignation" placeholder="Désignation" required maxlength="150" value="${esc(l.label)}"><input name="description" aria-label="Description" placeholder="Description / ce qui est compris" maxlength="400" value="${esc(l.description||'')}"><input name="qty" aria-label="Quantité" type="number" min="0.01" step="0.01" required value="${l.qty}"><input name="unit" aria-label="Unité" placeholder="m²" required maxlength="20" value="${esc(l.unit||'')}"><input name="price" aria-label="Prix unitaire HT" type="number" min="0" step="0.01" required value="${l.price}"><select name="vat" aria-label="TVA"><option value="6" ${Number(l.vat)===6?'selected':''}>6 %</option><option value="12" ${Number(l.vat)===12?'selected':''}>12 %</option><option value="21" ${Number(l.vat)===21?'selected':''}>21 %</option></select><button type="button" class="link remove-line" aria-label="Supprimer la ligne" onclick="this.parentElement.remove()">×</button></div>`};
function addQuoteLine(){document.querySelector('#quoteLines').insertAdjacentHTML('beforeend',quoteLine())}
function fillQuoteFromJob(select){const j=jobs.find(j=>j.id===+select.value),form=select.form;if(!j)return;if(!form.client.value)form.client.value=j.client;if(!form.clientAddress.value)form.clientAddress.value=[j.address,j.town].filter(Boolean).join(', ')}
quoteForm=function(id){
  const q=quotes.find(q=>q.id===id)||{title:'',job:jobs[0]?.id,client:jobs[0]?.client||'',clientAddress:[jobs[0]?.address,jobs[0]?.town].filter(Boolean).join(', '),date:reference,validUntil:'2026-10-22',deposit:30,paymentTerms:'Acompte à la commande, solde selon l’avancement des travaux.',exclusions:'Travaux imprévus non décrits dans le présent devis.',notes:'',lines:[{label:'',description:'',qty:1,unit:'forfait',price:0,vat:21}]};
  modal(id?'Modifier le devis':'Créer un devis',`<form class="quote-editor" onsubmit="saveQuote(event,${id||0})"><section><p class="form-section-title">Client & chantier</p><label>Chantier<select name="job" onchange="fillQuoteFromJob(this)">${jobs.map(j=>`<option value="${j.id}" ${j.id===q.job?'selected':''}>${esc(j.name)} · ${esc(j.client)}</option>`).join('')}</select></label><div class="form-two"><label>Client<input name="client" required maxlength="120" value="${esc(q.client||'')}"></label><label>Adresse du client / chantier<input name="clientAddress" required maxlength="200" value="${esc(q.clientAddress||'')}"></label></div><label>Objet du devis<input name="title" required maxlength="150" value="${esc(q.title)}"></label><div class="form-two"><label>Date du devis<input name="date" type="date" required value="${q.date}"></label><label>Valable jusqu’au<input name="validUntil" type="date" required value="${q.validUntil}"></label></div></section><section><div class="quote-lines-title"><p class="form-section-title">Détail des travaux</p><button type="button" class="link" onclick="addQuoteLine()">+ Ajouter une ligne</button></div><div class="quote-line-head"><span>Désignation</span><span>Description</span><span>Qté</span><span>Unité</span><span>Prix unit. HT</span><span>TVA</span><span></span></div><div id="quoteLines">${q.lines.map(quoteLine).join('')}</div></section><section><p class="form-section-title">Conditions</p><div class="form-two"><label>Acompte demandé (%)<input name="deposit" type="number" min="0" max="100" step="1" value="${q.deposit||0}"></label><label>Conditions de paiement<input name="paymentTerms" maxlength="300" value="${esc(q.paymentTerms||'')}"></label></div><label>Remarques<textarea name="notes" rows="3" maxlength="1000">${esc(q.notes||'')}</textarea></label><label>Exclusions / réserves<textarea name="exclusions" rows="3" maxlength="1000">${esc(q.exclusions||'')}</textarea></label></section><p id="quoteError" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn primary">Enregistrer le devis</button></div></form>`);
};
saveQuote=function(e,id){
  e.preventDefault();const f=new FormData(e.target),labels=f.getAll('label'),descriptions=f.getAll('description'),qtys=f.getAll('qty'),units=f.getAll('unit'),prices=f.getAll('price'),vats=f.getAll('vat');
  if(!labels.length||labels.some(x=>!x.trim())){document.querySelector('#quoteError').textContent='Ajoutez au moins une ligne avec une désignation.';return}
  const lines=labels.map((label,i)=>({label:label.trim(),description:descriptions[i].trim(),qty:+qtys[i],unit:units[i].trim(),price:+prices[i],vat:+vats[i]}));
  if(lines.some(l=>!l.unit||!Number.isFinite(l.qty)||!Number.isFinite(l.price)||l.qty<=0||l.price<0))return;
  const data={title:f.get('title').trim(),job:+f.get('job'),client:f.get('client').trim(),clientAddress:f.get('clientAddress').trim(),date:f.get('date'),validUntil:f.get('validUntil'),deposit:+f.get('deposit')||0,paymentTerms:f.get('paymentTerms').trim(),notes:f.get('notes').trim(),exclusions:f.get('exclusions').trim(),lines};
  let q=quotes.find(q=>q.id===id);if(q)Object.assign(q,data);else quotes.push({id:Date.now(),ref:'DEV-'+new Date().getFullYear()+'-'+String(14+quotes.length).padStart(3,'0'),status:'Brouillon',...data});
  closeModal();render();toast('Devis enregistré et relié au chantier.');
};

showQuote=function(id){
  const q=quotes.find(q=>q.id===id),j=jobs.find(j=>j.id===q.job);if(!q)return;
  modal(q.ref,`<article class="quote-paper"><header><div><p class="eyebrow">${esc(company.name)}</p><h2>DEVIS</h2><small>${esc(company.vat||'TVA à renseigner')} · ${esc(company.phone||'Téléphone à renseigner')}</small></div><div><strong>${esc(q.ref)}</strong><span>Émis le ${fullDate(q.date)}</span><span>Valable jusqu’au ${fullDate(q.validUntil)}</span></div></header><div class="quote-parties"><div><small>CLIENT</small><strong>${esc(q.client)}</strong><span>${esc(q.clientAddress)}</span></div><div><small>CHANTIER</small><strong>${esc(j?.name||'—')}</strong><span>${esc(j?[j.address,j.town].filter(Boolean).join(', '):'')}</span></div></div><h3>${esc(q.title)}</h3><div class="data-table quote-detail"><table><thead><tr><th>Description</th><th>Qté</th><th>Unité</th><th>Prix unitaire HT</th><th>TVA</th><th>Total HT</th></tr></thead><tbody>${q.lines.map(l=>`<tr><td><strong>${esc(l.label)}</strong><small>${esc(l.description||'')}</small></td><td>${l.qty}</td><td>${esc(l.unit||'')}</td><td>${money(l.price)}</td><td>${l.vat} %</td><td><strong>${money(l.qty*l.price)}</strong></td></tr>`).join('')}</tbody></table></div><div class="quote-totals"><div><span>Total HT</span><b>${money(quoteNet(q))}</b></div><div><span>TVA</span><b>${money(quoteVat(q))}</b></div><div class="grand"><span>Total TVAC</span><b>${money(quoteGross(q))}</b></div>${q.deposit?`<div><span>Acompte demandé · ${q.deposit} %</span><b>${money(quoteGross(q)*q.deposit/100)}</b></div>`:''}</div><div class="quote-conditions"><div><small>CONDITIONS DE PAIEMENT</small><p>${esc(q.paymentTerms||'À préciser')}</p></div><div><small>REMARQUES</small><p>${esc(q.notes||'—')}</p></div><div><small>EXCLUSIONS / RÉSERVES</small><p>${esc(q.exclusions||'—')}</p></div></div></article><label class="field-label">Statut de suivi<select onchange="quotes.find(q=>q.id===${id}).status=this.value;render();toast('Statut du devis mis à jour.')">${['Brouillon','À présenter','Accepté','Refusé'].map(s=>`<option ${s===q.status?'selected':''}>${s}</option>`).join('')}</select></label><div class="modal-actions"><button class="btn" onclick="showWorkerQuote(${id})">Version équipe · sans prix</button><button class="btn" onclick="quoteForm(${id})">Modifier</button><button class="btn primary" onclick="showJob(${q.job})">Voir le chantier</button></div>`);
};
function showWorkerQuote(id){const q=quotes.find(q=>q.id===id),j=jobs.find(j=>j.id===q.job);modal('Fiche d’exécution · '+q.ref,`<div class="worker-sheet"><div><span class="badge">Sans prix</span><h2>${esc(q.title)}</h2><p>${esc(j?.name||'')} · ${esc(j?[j.address,j.town].filter(Boolean).join(', '):'')}</p></div><ol>${q.lines.map(l=>`<li><strong>${esc(l.label)}</strong><span>${esc(l.description||'')}</span><small>${l.qty} ${esc(l.unit||'')}</small></li>`).join('')}</ol>${q.notes?`<div class="notice"><strong>Remarque</strong><br>${esc(q.notes)}</div>`:''}<p class="help-line">Cette vue destinée à l’équipe reprend le contenu des travaux sans afficher les prix.</p></div><div class="modal-actions"><button class="btn" onclick="showQuote(${id})">Retour au devis complet</button><button class="btn primary" onclick="showJob(${q.job})">Ouvrir le chantier</button></div>`)}

const fleetRefinementBase=fleetView;
fleetView=function(){
  if(assetCategory!=='tools')return fleetRefinementBase();
  const cats=[['vehicles','Flotte automobile'],['tools','Outillage'],['rentals','Locations'],['repairs','À réparer']],list=categoryAssets('tools');
  return heading('Biens & matériel','La traçabilité du parc, sans transformer l’outillage en planning.',false)+`<div class="asset-categories">${cats.map(([k,l])=>`<button class="${k===assetCategory?'selected':''}" onclick="assetCategory='${k}';render()"><span>${l}</span><strong>${categoryAssets(k).length}</strong></button>`).join('')}</div><div class="section-heading"><div><p class="eyebrow">INVENTAIRE</p><h2>Outillage</h2></div><button class="btn primary" onclick="assetForm()">+ Ajouter un outil</button></div><section class="panel data-table tool-table"><table><thead><tr><th>Outil</th><th>Marque / modèle</th><th>N° de série</th><th>Emplacement actuel</th><th>Financement</th><th>État</th><th></th></tr></thead><tbody>${list.map(a=>`<tr><td><strong>${esc(a.name)}</strong><small>${esc(a.category)}</small></td><td>${esc(a.brandModel||'À renseigner')}</td><td><code>${esc(a.serial||a.reference||'—')}</code></td><td>${esc(a.attached||'À renseigner')}</td><td>${esc(a.mode)}<small>${esc(a.provider||'')}</small></td><td><span class="badge ${a.condition==='En service'?'green':'warn'}">${esc(a.condition)}</span></td><td><button class="link" onclick="showAsset(${a.id})">Dossier ↗</button></td></tr>`).join('')}</tbody></table></section><p class="help-line">Chaque outil conserve son achat, son numéro de série, son emplacement, ses documents et son historique.</p>`;
};

const showAssetRefinementBase=showAsset;
showAsset=function(id){
  showAssetRefinementBase(id);const a=assets.find(a=>a.id===id),root=document.querySelector('#modalbody .modal-inner'),anchor=root?.querySelector('.modal-actions');if(!a||!root)return;
  let extra='';
  if(a.group==='tools'&&(a.serial||a.brandModel))extra+=`<section class="person-section"><h3 class="detail-heading">Identification de l’outil</h3><div class="detail-row"><span>Marque / modèle</span><b>${esc(a.brandModel||'À renseigner')}</b></div><div class="detail-row"><span>Numéro de série</span><b>${esc(a.serial||'À renseigner')}</b></div></section>`;
  if(a.group==='vehicles')extra+=`<section class="person-section vehicle-fuel"><div class="section-heading"><div><h3>Carburant & kilométrage</h3><span class="subtle">${esc(a.vehicle?.fuel||'Carburant à préciser')} · historique propre à ce véhicule</span></div><button class="link" onclick="fuelForm(${a.id})">+ Enregistrer un plein</button></div>${a.fuelEntries?.length?`<div class="mini-fuel-list">${[...a.fuelEntries].sort((x,y)=>y.date.localeCompare(x.date)).map(x=>`<div><time>${fullDate(x.date)}</time><span>${Number(x.odometer).toLocaleString('fr-BE')} km · ${x.liters} L</span><b>${x.total===undefined?'':money(x.total)}</b><small>${esc(x.driver||'')} · ${x.receiptAttached?'ticket conservé':'sans ticket'}</small></div>`).join('')}</div>`:'<p class="person-empty">Aucun plein enregistré pour ce véhicule.</p>'}</section>`;
  if(extra)(anchor||root).insertAdjacentHTML(anchor?'beforebegin':'beforeend',extra);
};
saveFuel=function(e){e.preventDefault();const f=new FormData(e.target),a=assets.find(a=>a.id===+f.get('asset')),pump=f.get('pump'),receipt=f.get('receipt'),x={id:Date.now(),date:f.get('date'),odometer:+f.get('odometer'),liters:+f.get('liters'),total:+f.get('total'),driver:f.get('driver').trim(),pumpName:pump?.size?pump.name:'',receiptName:receipt?.size?receipt.name:'',pumpUrl:pump?.size?URL.createObjectURL(pump):'',receiptUrl:receipt?.size?URL.createObjectURL(receipt):''};a.fuelEntries.push(x);if(a.vehicle)a.vehicle.mileage=x.odometer;closeModal();assetCategory='vehicles';render();showAsset(a.id);toast('Plein ajouté à l’historique du véhicule.')};

jobsView=function(){return heading('Chantiers','Un dossier clair par chantier : équipe, devis, documents, matériaux, heures et remarques.',false)+`<div class="section-heading"><div><p class="eyebrow">DOSSIERS DE PRODUCTION</p><h2>${jobs.length} chantiers</h2></div><button class="btn primary" onclick="jobForm()">+ Nouveau chantier</button></div><section class="project-list">${jobs.map(j=>{const q=acceptedQuoteForJob(j.id);return `<button class="project-row" onclick="showJob(${j.id})"><span class="project-number">${String(j.id).padStart(2,'0')}</span><span class="project-main"><span class="badge">${esc(j.phase)}</span><strong>${esc(j.name)}</strong><small>${esc(j.client)} · ${esc(j.address)}, ${esc(j.town)}</small></span><span><small>Avancement</small><b>${j.progress}%</b><i><em style="width:${j.progress}%"></em></i></span><span><small>Temps enregistré</small><b>${jobHours(j).toFixed(1)} h</b></span><span><small>Devis</small><b>${q?money(quoteGross(q)):'—'}</b></span><span><small>Documents</small><b>${j.documents.length}</b></span><strong class="project-open">Ouvrir ↗</strong></button>`}).join('')}</section>`};

const showJobRefinementBase=showJob;
showJob=function(id){
  showJobRefinementBase(id);const j=jobs.find(j=>j.id===id),root=document.querySelector('#modalbody .modal-inner');if(!j||!root)return;
  const q=acceptedQuoteForJob(id);
  root.insertAdjacentHTML('beforeend',`<section class="job-detail-section"><div class="section-heading"><h3>Devis & documents du chantier</h3><span class="subtle">Plans, autorisations et pièces liées</span></div>${q?`<button class="doc-link" onclick="showWorkerQuote(${q.id})"><span><strong>${esc(q.ref)} · fiche d’exécution</strong><small>Version équipe sans prix</small></span><span>Ouvrir ↗</span></button>`:''}${jobDocumentLinks(j)}</section>`);
};

function allDocuments(){
  const list=[
    {id:'company-registration',category:'Entreprise',name:'Extrait d’entreprise / BCE',type:'Identité légale',owner:company.name,status:company.enterpriseNumber?'Classé':'À compléter',date:reference,link:'company',linkId:0},
    {id:'company-insurance',category:'Entreprise',name:'Assurance responsabilité de l’entreprise',type:'Assurance',owner:company.name,status:company.companyInsurance?'Classé':'À compléter',date:reference,link:'company',linkId:0},
    {id:'company-bank',category:'Entreprise',name:'Attestation bancaire',type:'Banque',owner:company.name,status:company.iban?'Classé':'À compléter',date:reference,link:'company',linkId:0}
  ];
  people.forEach(p=>{
    list.push({id:`person-${p.id}-contract`,category:'Personnel',name:`Contrat de travail · ${p.name}`,type:p.contract,owner:p.name,status:'Classé',date:p.start,link:'person',linkId:p.id});
    p.training.forEach((t,i)=>list.push({id:`person-${p.id}-training-${i}`,category:'Personnel',name:`Attestation · ${t}`,type:'Formation',owner:p.name,status:'À vérifier',date:p.start,link:'person',linkId:p.id}));
    p.hr.permits.forEach((x,i)=>list.push({id:`person-${p.id}-permit-${i}`,category:'Personnel',name:`${x.name} · ${p.name}`,type:'Permis / habilitation',owner:p.name,status:x.expires&&x.expires<reference?'Expiré':'Classé',date:x.expires||reference,link:'person',linkId:p.id}));
    p.hr.accidents.forEach((a,i)=>list.push({id:`person-${p.id}-accident-${i}`,category:'Personnel',name:`Dossier accident · ${a.jobName}`,type:'Accident de travail',owner:p.name,status:a.complete?'Complet':'À compléter',date:a.date,link:'person',linkId:p.id}));
  });
  assets.forEach(a=>{
    (a.docs||[]).forEach((name,i)=>list.push({id:`asset-${a.id}-${i}`,category:'Véhicules & matériel',name,type:a.mode==='Leasing'?'Leasing':'Bien / matériel',owner:a.name,status:'Classé',date:a.start||reference,link:'asset',linkId:a.id}));
    if(a.vehicle){list.push({id:`asset-${a.id}-insurance`,category:'Véhicules & matériel',name:`Assurance · ${a.name}`,type:'Assurance véhicule',owner:a.vehicle.registration,status:a.vehicle.insuranceEnd?'Classé':'À compléter',date:a.vehicle.insuranceEnd||reference,link:'asset',linkId:a.id},{id:`asset-${a.id}-inspection`,category:'Véhicules & matériel',name:`Contrôle technique · ${a.name}`,type:'Contrôle technique',owner:a.vehicle.registration,status:a.vehicle.inspection?'À suivre':'À compléter',date:a.vehicle.inspection||reference,link:'asset',linkId:a.id})}
  });
  jobs.forEach(j=>j.documents.forEach(d=>list.push({id:`job-${j.id}-${d.id}`,category:'Chantiers',name:d.name,type:d.type,owner:j.name,status:d.status,date:d.date,link:'job',linkId:j.id})));
  quotes.forEach(q=>list.push({id:`quote-${q.id}`,category:'Chantiers',name:`${q.ref} · ${q.title}`,type:'Devis',owner:q.client,status:q.status,date:q.date,link:'quote',linkId:q.id}));
  accountingData.customerInvoices.forEach(x=>list.push({id:`invoice-${x.id}`,category:'Comptabilité',name:`${x.ref} · ${x.client}`,type:'Facture client',owner:jobs.find(j=>j.id===x.job)?.name||x.client,status:x.status,date:x.date||x.due,link:'job',linkId:x.job}));
  accountingData.supplierBills.forEach(x=>list.push({id:`supplier-${x.id}`,category:'Comptabilité',name:`Facture fournisseur · ${x.supplier}`,type:'Facture fournisseur',owner:x.supplier,status:x.status,date:reference,link:'accounting',linkId:0}));
  return list;
}
function filteredDocuments(){const q=docQuery.toLowerCase().trim();return allDocuments().filter(d=>(docCategory==='Tous'||d.category===docCategory)&&(!q||(d.name+' '+d.type+' '+d.owner).toLowerCase().includes(q))).sort((a,b)=>(b.date||'').localeCompare(a.date||''))}
function documentRows(){const list=filteredDocuments();return list.length?`<div class="data-table document-table"><table><thead><tr><th>Document</th><th>Catégorie</th><th>Dossier lié</th><th>Date / échéance</th><th>État</th><th></th></tr></thead><tbody>${list.map(d=>`<tr><td><strong>${esc(d.name)}</strong><small>${esc(d.type)}</small></td><td><span class="badge">${esc(d.category)}</span></td><td>${esc(d.owner)}</td><td>${fullDate(d.date)}</td><td><span class="badge ${['Classé','Complet','Payée','Accepté','Validé'].includes(d.status)?'green':'warn'}">${esc(d.status)}</span></td><td><button class="link" onclick="openDocumentRecord('${d.id}')">Ouvrir ↗</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aucun document ne correspond à cette recherche.</div>'}
function refreshDocumentRows(){const el=document.querySelector('#documentRows');if(el)el.innerHTML=documentRows()}
documents=function(){const list=allDocuments(),cats=['Tous','Entreprise','Personnel','Chantiers','Véhicules & matériel','Comptabilité'];return heading('Documents','Tous les documents de l’entreprise, classés et reliés à leur dossier.',false)+`<div class="document-kpis"><div><small>Documents référencés</small><strong>${list.length}</strong></div><div><small>À compléter ou vérifier</small><strong>${list.filter(d=>!['Classé','Complet','Payée','Accepté','Validé'].includes(d.status)).length}</strong></div><div><small>Catégories</small><strong>${cats.length-1}</strong></div></div><div class="document-toolbar"><input aria-label="Rechercher un document" placeholder="Rechercher un contrat, une assurance, un chantier…" value="${esc(docQuery)}" oninput="docQuery=this.value;refreshDocumentRows()"><select aria-label="Filtrer les documents" onchange="docCategory=this.value;refreshDocumentRows()">${cats.map(c=>`<option ${c===docCategory?'selected':''}>${esc(c)}</option>`).join('')}</select></div><section class="panel" id="documentRows">${documentRows()}</section><p class="help-line">Les lignes de démonstration représentent des emplacements de classement. Aucun fichier réel n’est joint.</p>`};
function openDocumentRecord(id){const d=allDocuments().find(x=>x.id===id);if(!d)return;const actions={person:`personForm(${d.linkId})`,asset:`showAsset(${d.linkId})`,job:`showJob(${d.linkId})`,quote:`showQuote(${d.linkId})`,accounting:"closeModal();navigate('accounting')",company:"closeModal();navigate('company')"};modal(d.name,`<span class="badge">${esc(d.category)}</span><div class="detail-row"><span>Type</span><b>${esc(d.type)}</b></div><div class="detail-row"><span>Dossier lié</span><b>${esc(d.owner)}</b></div><div class="detail-row"><span>Date / échéance</span><b>${fullDate(d.date)}</b></div><div class="detail-row"><span>État</span><b>${esc(d.status)}</b></div><p class="notice">Référence de démonstration : aucun fichier réel n’est joint.</p><div class="modal-actions"><button class="btn primary" onclick="${actions[d.link]||"closeModal()"}">Ouvrir le dossier associé</button></div>`)}

function newsDecision(id,status){const n=newsItems.find(x=>x.id===id);if(!n)return;n.userStatus=status;if(status==='Concerné')return newsToReminder(id);render();toast('Décision enregistrée dans la veille.')}
function regulationAgenda(){const items=[...newsItems].sort((a,b)=>a.deadline.localeCompare(b.deadline));return `<section class="panel regulation-agenda"><div class="panel-head"><div><p class="eyebrow">À ANTICIPER</p><h2>Agenda des changements</h2></div><span class="subtle">Un changement marqué « Concerné » crée une alerte.</span></div>${items.map(n=>`<article><time><b>${new Date(n.deadline+'T12:00:00').getDate()}</b><span>${new Date(n.deadline+'T12:00:00').toLocaleDateString('fr-BE',{month:'short',year:'numeric'})}</span></time><div><span class="badge">${esc(n.category)}</span><h3>${esc(n.title)}</h3><p>${esc(n.action)}</p></div><span class="badge ${n.userStatus==='Concerné'?'green':n.userStatus==='Pas concerné'?'':'warn'}">${esc(n.userStatus)}</span><button class="btn" onclick="newsDecision('${n.id}','Concerné')">Créer le suivi</button></article>`).join('')}</section>`}
newsView=function(){
  const year=reference.slice(0,4),list=newsFilter==='relevant'?newsItems.filter(n=>n.important):newsFilter==='all'?newsItems:newsItems.filter(n=>String(n.year)===year);
  return heading('Actualités & règles','Les informations importantes, leur impact et les décisions de l’entreprise.',false)+`<div class="news-notice"><strong>Veille de démonstration</strong><span>Une information réelle devra toujours afficher sa source officielle et sa date de vérification.</span></div><div class="section-heading"><div class="filter-pills">${[['relevant','Cela vous concerne'],['all','À connaître'],['year','Récapitulatif '+year],['agenda','Agenda des changements']].map(([v,l])=>`<button class="${newsFilter===v?'selected':''}" onclick="newsFilter='${v}';render()">${l}</button>`).join('')}</div></div>${newsFilter==='agenda'?regulationAgenda():`<div class="news-grid">${list.map(n=>`<article class="news-card"><div class="news-top"><span class="badge">${esc(n.category)}</span><time>${fullDate(n.date)}</time></div><h2>${esc(n.title)}</h2><p>${esc(n.summary)}</p><dl><div><dt>Qui est concerné ?</dt><dd>${esc(n.applies)}</dd></div><div><dt>Impact possible</dt><dd>${esc(n.impact)}</dd></div><div><dt>Action proposée</dt><dd>${esc(n.action)}</dd></div></dl><div class="news-decision"><span>Décision : <b>${esc(n.userStatus)}</b></span><div><button onclick="newsDecision('${n.id}','Pas concerné')">Pas concerné</button><button onclick="newsDecision('${n.id}','À vérifier')">À vérifier</button><button onclick="newsDecision('${n.id}','Concerné')">Concerné · créer une alerte</button></div></div><div class="news-source"><span>${esc(n.source)}</span><small>Échéance de démo · ${fullDate(n.deadline)}</small></div></article>`).join('')}</div>`}`;
};

render=function(){document.querySelector('#nav').innerHTML=tabs2.map(([v,l])=>`<button class="${view===v?'active':''}" ${view===v?'aria-current="page"':''} onclick="navigate('${v}')">${l}</button>`).join('');document.querySelector('#main').innerHTML=({planning,home:planning,people:peopleView,jobs:jobsView,fleet:fleetView,quotes:quotesView,accounting:accountingView,news:newsView,actions,documents,company:companyView,dossiers:dossierView}[view]||planning)();scheduleSave()};

(function () {
  var draggedPersonId = null;
  var dragSnapshot = null;
  function teamsCopy() {
    return (typeof teams !== 'undefined' ? teams : []).map(function (team) {
      return { id: team.id, members: (team.members || []).slice() };
    });
  }
  function clearPersonDrag() {
    draggedPersonId = null;
    Array.prototype.forEach.call(document.querySelectorAll('.personnel-row.is-person-dragging,.team-overview-card.is-person-drop-target'), function (node) {
      node.classList.remove('is-person-dragging', 'is-person-drop-target');
    });
  }
  function movePersonToTeam(personId, teamId) {
    if (typeof teams === 'undefined' || !Array.isArray(teams)) return;
    var previous = teamsCopy();
    teams.forEach(function (team) {
      team.members = (team.members || []).filter(function (member) { return String(member) !== String(personId); });
    });
    var target = teamId ? teams.find(function (team) { return String(team.id) === String(teamId); }) : null;
    if (target) target.members = (target.members || []).concat([personId]);
    if (typeof scheduleSave === 'function') scheduleSave();
    if (typeof render === 'function') render();
    if (typeof toast === 'function') toast(target ? 'Personne ajoutée à ' + target.name + '.' : 'Personne retirée de son équipe.', 'Annuler', function () {
      previous.forEach(function (saved) {
        var team = teams.find(function (item) { return String(item.id) === String(saved.id); });
        if (team) team.members = saved.members.slice();
      });
      if (typeof scheduleSave === 'function') scheduleSave();
      if (typeof render === 'function') render();
    });
  }
  document.addEventListener('dragstart', function (event) {
    var grip = event.target.closest ? event.target.closest('[data-person-drag]') : null;
    if (!grip) return;
    var row = grip.closest('.personnel-row');
    if (!row) return;
    draggedPersonId = grip.dataset.personDrag;
    dragSnapshot = teamsCopy();
    row.classList.add('is-person-dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      try { event.dataTransfer.setData('text/plain', 'person:' + draggedPersonId); } catch (error) {}
    }
  });
  document.addEventListener('dragover', function (event) {
    if (!draggedPersonId) return;
    var target = event.target.closest ? event.target.closest('[data-team-drop]') : null;
    if (!target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    Array.prototype.forEach.call(document.querySelectorAll('.team-overview-card.is-person-drop-target'), function (node) {
      node.classList.remove('is-person-drop-target');
    });
    target.classList.add('is-person-drop-target');
  });
  document.addEventListener('drop', function (event) {
    if (!draggedPersonId) return;
    var target = event.target.closest ? event.target.closest('[data-team-drop]') : null;
    if (!target) return;
    event.preventDefault();
    var personId = draggedPersonId;
    var teamId = target.dataset.teamDrop || '';
    clearPersonDrag();
    movePersonToTeam(personId, teamId);
  });
  document.addEventListener('dragend', clearPersonDrag);
})();
