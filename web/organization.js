// Each record has one home. The overview and document library only point to it.
tabs2.find(tab => tab[0] === 'actions')[1] = 'Tâches générales';

function organizationOverview() {
  const assigned = assignments.filter(item => item.date === day && !isArchivedJob(jobs.find(job => job.id === item.job))).length;
  const activeJobs = jobs.filter(job => !['Terminé', 'Archivé'].includes(job.phase)).length;
  const generalTasks = reminders.filter(item => item.linkType === 'company' && item.state !== 'done').length;
  return `<div class="overview-head">
    <div><p class="eyebrow">${esc(company.name)}</p><h1>À voir aujourd’hui</h1></div>
    <label>Date du planning <input type="date" value="${esc(day)}" onchange="day=this.value||reference;render()"></label>
  </div>
  <div class="overview-links">
    <button onclick="navigate('people')"><span>Équipes affectées</span><strong>${assigned}</strong><small>Ouvrir le personnel et les équipes ↗</small></button>
    <button onclick="navigate('jobs')"><span>Chantiers en cours</span><strong>${activeJobs}</strong><small>Ouvrir les dossiers de chantier ↗</small></button>
    <button onclick="navigate('actions')"><span>Tâches générales</span><strong>${generalTasks}</strong><small>Voir le suivi de l’entreprise ↗</small></button>
  </div>
  <p class="overview-note">Les détails restent dans les dossiers du personnel, des chantiers et des biens.</p>`;
};

function generalRemindersFor(tab) {
  return reminders.filter(item => item.linkType === 'company' &&
    (tab === 'done' ? item.state === 'done' : tab === 'waiting' ? item.state === 'waiting' : item.state !== 'done'))
    .sort((a, b) => a.date.localeCompare(b.date));
}

actions = function () {
  const choices = [['open', 'À traiter'], ['waiting', 'En attente'], ['done', 'Terminées']];
  return `<div class="simple-head"><div><p class="eyebrow">SUIVI DE L’ENTREPRISE</p><h1>Tâches générales</h1><p>Les tâches propres à une personne ou à un bien restent dans leur dossier.</p></div>
    <button class="btn primary" onclick="reminderForm()">+ Ajouter une tâche</button></div>
    <section class="panel general-tasks"><div class="tabs">${choices.map(([key, label]) =>
      `<button class="${alertTab === key ? 'selected' : ''}" onclick="alertTab='${key}';render()">${label} (${generalRemindersFor(key).length})</button>`).join('')}</div>
      ${reminderRows(generalRemindersFor(alertTab))}</section>`;
};

const documentFolders = [
  ['Entreprise', 'Pièces propres à la société'],
  ['Personnel', 'Permis et dossiers individuels'],
  ['Formations', 'Attestations de formation'],
  ['Chantiers', 'Plans et autorisations'],
  ['Assurances', 'Assurance de l’entreprise'],
];

allDocuments = function () {
  const list = [];
  if (company.companyInsurance) list.push({
    id: 'company-insurance', category: 'Assurances', name: 'Assurance de l’entreprise',
    type: 'Référence de contrat', owner: company.name, status: 'Référencée',
    date: reference, link: 'company', linkId: 0,
  });
  people.forEach(person => {
    person.training.forEach((training, index) => list.push({
      id: `person-${person.id}-training-${index}`, category: 'Formations',
      name: `Attestation · ${training}`, type: 'Formation', owner: person.name,
      status: 'À joindre', date: person.start, link: 'person', linkId: person.id,
    }));
    (person.hr?.permits || []).forEach((permit, index) => list.push({
      id: `person-${person.id}-permit-${index}`, category: 'Personnel',
      name: `${permit.name} · ${person.name}`, type: 'Permis / habilitation', owner: person.name,
      status: permit.expires && permit.expires < reference ? 'Expiré' : 'Référencé',
      date: permit.expires || reference, link: 'person', linkId: person.id,
    }));
    (person.hr?.accidents || []).forEach((accident, index) => list.push({
      id: `person-${person.id}-accident-${index}`, category: 'Personnel',
      name: `Dossier accident · ${accident.jobName}`, type: 'Accident de travail', owner: person.name,
      status: accident.complete ? 'Complet' : 'À compléter', date: accident.date,
      link: 'person', linkId: person.id,
    }));
  });
  jobs.forEach(job => (job.documents || []).forEach(document => list.push({
    id: `job-${job.id}-${document.id}`, category: 'Chantiers', name: document.name,
    type: document.type, owner: job.name, status: document.status,
    date: document.date, link: 'job', linkId: job.id,
  })));
  return list;
};

documentRows = function () {
  const list = filteredDocuments();
  return list.length ? `<div class="document-file-list">${list.map(document =>
    `<button onclick="openDocumentRecord('${jsString(document.id)}')"><span><strong>${esc(document.name)}</strong><small>${esc(document.owner)} · ${esc(document.type)}</small></span><span class="badge">${esc(document.status)}</span><span aria-hidden="true">↗</span></button>`).join('')}</div>`
    : '<div class="empty">Aucune référence dans ce classement.</div>';
};

documents = function () {
  if (docCategory === 'Tous') return `<div class="simple-head"><div><p class="eyebrow">CLASSEMENT</p><h1>Documents</h1><p>Choisissez un dossier pour retrouver ses pièces.</p></div></div>
    <div class="document-folders">${documentFolders.map(([category, description]) => {
      const count = documentsInCurrentView().filter(document => document.category === category).length;
      return `<button onclick="docCategory='${category}';docQuery='';render()"><span class="folder-icon">${icon('folder')}</span><span><strong>${category}</strong><small>${description}</small></span><b>${count}</b></button>`;
    }).join('')}</div>
    <p class="help-line">Les informations des véhicules restent dans « Biens & matériel ». Cette démonstration ne contient pas encore de fichiers joints.</p>`;
  const folder = documentFolders.find(([category]) => category === docCategory);
  if (!folder) { docCategory = 'Tous'; return documents(); }
  return `<div class="simple-head"><div><button class="link" onclick="docCategory='Tous';docQuery='';render()">← Tous les classements</button>
    <h1>${esc(folder[0])}</h1><p>${esc(folder[1])}</p></div></div>
    <div class="document-toolbar"><input aria-label="Rechercher dans ${esc(folder[0])}" placeholder="Rechercher dans ce classement…" value="${esc(docQuery)}" oninput="docQuery=this.value;refreshDocumentRows()"></div>
    <section class="panel" id="documentRows">${documentRows()}</section>
    <p class="help-line">Références de démonstration : aucun fichier réel n’est joint.</p>`;
};

const changeReminderBeforeOrganization = changeReminder;
changeReminder = function (id, state) {
  changeReminderBeforeOrganization(id, state);
  document.querySelector('#toast').textContent = state === 'done'
    ? 'Tâche classée dans l’historique du dossier.' : 'Statut mis à jour dans le dossier.';
};

const fleetViewBeforeOrganization = fleetView;
fleetView = function () {
  if (assetCategory !== 'vehicles') return fleetViewBeforeOrganization();
  const categories = [['vehicles', 'Véhicules'], ['tools', 'Outillage'], ['rentals', 'Locations'], ['repairs', 'À réparer']];
  return `<div class="simple-head"><div><p class="eyebrow">BIENS & MATÉRIEL</p><h1>Véhicules</h1><p>Chaque véhicule rassemble son assurance, ses contrôles, ses documents et ses pleins.</p></div>
    <button class="btn primary" onclick="assetForm()">+ Ajouter un véhicule</button></div>
    <div class="asset-categories">${categories.map(([key, label]) =>
      `<button class="${assetCategory === key ? 'selected' : ''}" onclick="assetCategory='${key}';render()"><span>${label}</span><strong>${categoryAssets(key).length}</strong></button>`).join('')}</div>
    <section class="panel vehicle-list">${categoryAssets('vehicles').map(asset =>
      `<button onclick="showAsset(${asset.id})"><span><strong>${esc(asset.name)}</strong><small>${esc(asset.vehicle?.registration || 'Immatriculation à renseigner')} · ${esc(asset.attached || 'Emplacement à renseigner')}</small></span><span class="badge ${asset.condition === 'En service' ? 'green' : 'warn'}">${esc(asset.condition)}</span><span class="link">Ouvrir ↗</span></button>`).join('') || '<div class="empty">Aucun véhicule enregistré.</div>'}</section>`;
};

const showAssetBeforeOrganization = showAsset;
showAsset = function (id) {
  showAssetBeforeOrganization(id);
  if (assets.find(asset => asset.id === id)?.group !== 'vehicles') return;
  const root = document.querySelector('#modalbody .modal-inner');
  const fuel = root?.querySelector('.vehicle-fuel');
  const title = root?.querySelector('.modal-top');
  if (fuel && title) {
    title.after(fuel);
    fuel.querySelector('button')?.classList.add('primary');
    fuel.querySelector('button')?.classList.add('btn');
  }
};

const fuelFormBeforeOrganization = fuelForm;
fuelForm = function (assetId = 0) {
  const asset = assets.find(item => item.id === assetId && item.group === 'vehicles');
  if (!asset) return fuelFormBeforeOrganization(assetId);
  modal('Ajouter un plein · ' + asset.name, `<form onsubmit="saveFuel(event)">
    <input type="hidden" name="asset" value="${asset.id}">
    <div class="form-two"><label>Date<input name="date" type="date" required value="${reference}"></label>
    <label>Kilométrage au compteur<input name="odometer" type="number" min="0" required value="${Number(asset.vehicle?.mileage || 0)}"></label>
    <label>Litres<input name="liters" type="number" min="0" step="0.01" required></label>
    <label>Montant payé (€)<input name="total" type="number" min="0" step="0.01" required></label></div>
    <label>Conducteur<input name="driver" required value="Utilisateur connecté"></label>
    <div class="form-two"><label class="upload-field">Photo de la pompe<input name="pump" type="file" accept="image/*" capture="environment"></label>
    <label class="upload-field">Photo du ticket<input name="receipt" type="file" accept="image/*" capture="environment"></label></div>
    <p class="help-line">Les photos sont temporaires dans cette version. La date, le kilométrage, les litres et le montant sont enregistrés dans le véhicule.</p>
    <div class="modal-actions"><button class="btn primary">Enregistrer le plein</button></div></form>`);
};
