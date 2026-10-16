// Hub chantier en lecture seule : toutes les données et permissions viennent du serveur.
const projectHubUiState=new Map();

function projectHubDate(value){
  if(!value)return '';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?String(value):date.toLocaleString('fr-BE',{dateStyle:'short',timeStyle:'short'});
}
function projectHubCount(value){return value===null||value===undefined?'—':String(value)}
function projectHubMoney(cents){return cents===null||cents===undefined?'À compléter':new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(Number(cents)/100)}
function projectHubForecastPanel(state){
  if(!state.hub.capabilities?.viewFinancial)return '';
  if(state.forecastStatus==='loading')return '<section class="v3-project-finance"><h3>Rentabilité prévisionnelle</h3><p>Calcul serveur en cours…</p></section>';
  if(state.forecastStatus==='error')return '<section class="v3-project-finance"><h3>Rentabilité prévisionnelle</h3><p>Les chiffres de rentabilité ne sont pas disponibles pour ce chantier.</p></section>';
  const f=state.forecast;if(!f)return '';
  const labels={BASELINE_MISSING:'Prévisions de coûts à compléter',LABOUR_HOURLY_COST_MISSING:'Coût horaire manquant',LABOUR_TIME_ENTRIES_MISSING:'Pointages de main-d’œuvre manquants',TIME_CORRECTIONS_PENDING:'Corrections d’heures à valider',SUPPLIER_DELIVERIES_PENDING:'Livraisons fournisseur encore attendues',SUPPLIER_PRICE_VARIANCE:'Écart de prix commande/facture à vérifier',SUPPLIER_INVOICE_MATCHING_INCOMPLETE:'Lignes de facture fournisseur à rapprocher',BUDGET_MATERIALS_MISSING:'Budget matériaux manquant',BUDGET_SUBCONTRACTING_MISSING:'Budget sous-traitance manquant',BUDGET_EQUIPMENT_MISSING:'Budget matériel manquant',BUDGET_OTHER_MISSING:'Autres budgets manquants',LABOUR_RAD_UNKNOWN:'Heures restantes non estimées',UNCLASSIFIED_COSTS:'Certains coûts ou engagements restent à classer'};
  const confidence={HIGH:'Données suffisamment complètes',MEDIUM:'Estimation à compléter',LOW:'Marge impossible à établir'}[f.quality?.confidence]||'Qualité à vérifier';
  const reasons=(f.quality?.reasons||[]).map(x=>labels[x]||'Données complémentaires nécessaires');
  return `<section class="v3-project-finance" aria-label="Rentabilité prévisionnelle"><div class="v3-project-finance-head"><div><p class="eyebrow">CALCUL SERVEUR · HTVA</p><h3>Rentabilité prévisionnelle</h3></div><span class="v3-quality" data-quality="${esc(f.quality?.confidence||'LOW')}">${esc(confidence)}</span></div><div class="v3-project-finance-grid"><div><span>Marché accepté</span><strong>${projectHubMoney(f.revenue?.totalContractCents)}</strong></div><div><span>Coûts déjà constatés</span><strong>${projectHubMoney(f.totals?.costToDateCents)}</strong></div><div><span>Coût prévu à la fin</span><strong>${projectHubMoney(f.totals?.catCents)}</strong></div><div class="v3-project-margin"><span>Marge estimée</span><strong>${projectHubMoney(f.totals?.projectedMarginCents)}</strong></div></div>${reasons.length?`<p class="v3-project-finance-quality">À compléter : ${esc([...new Set(reasons)].join(' · '))}.</p>`:'<p class="v3-project-finance-quality">Les budgets et les coûts connus sont pris en compte dans cette estimation.</p>'}<p class="v3-project-finance-foot">Cette marge estimée se distingue des factures émises et de l’argent encaissé.</p></section>`;
}
function projectHubTimelineRows(events){
  if(!events?.length)return '<div class="empty">Aucun événement visible avec vos permissions.</div>';
  return events.map(event=>`<div class="detail-row"><span><strong>${esc(event.title||event.type||'Événement')}</strong><small>${esc(event.description||event.entityType||'')} · ${esc(projectHubDate(event.occurredAt))}</small></span></div>`).join('');
}
function projectHubReadOnlyPanel(projectId){
  const state=projectHubUiState.get(String(projectId));
  if(!state||state.status==='loading')return `<section class="panel" data-project-hub><div class="panel-head"><div><p class="eyebrow">HUB CHANTIER</p><h2>Vue transversale</h2></div></div><p class="subtle">Chargement des données autorisées…</p></section>`;
  if(state.status==='error')return `<section class="panel" data-project-hub><div class="panel-head"><div><p class="eyebrow">HUB CHANTIER</p><h2>Vue transversale</h2></div></div><p class="notice">${esc(state.error||'Hub chantier indisponible.')}</p></section>`;
  const hub=state.hub,timeline=state.timeline,summary=hub.summary||{};
  return `<section class="panel" data-project-hub>
    <div class="panel-head"><div><p class="eyebrow">HUB CHANTIER · LECTURE SEULE</p><h2>${esc(hub.identity?.name||'Chantier')}</h2><span>${esc(hub.identity?.reference||'')} ${hub.identity?.status?'· '+esc(hub.identity.status):''}</span></div><span class="badge green">Serveur</span></div>
    <div class="detail-row"><span>Devis visibles</span><b>${projectHubCount(summary.quotesCount)}</b></div>
    <div class="detail-row"><span>Factures clients visibles</span><b>${projectHubCount(summary.clientInvoicesCount)}</b></div>
    <div class="detail-row"><span>Commandes fournisseur visibles</span><b>${projectHubCount(summary.purchaseOrdersCount)}</b></div>
    <div class="detail-row"><span>Livraisons visibles</span><b>${projectHubCount(summary.deliveriesCount)}</b></div>
    <div class="detail-row"><span>Tâches ouvertes visibles</span><b>${projectHubCount(summary.openTasksCount)}</b></div>
    <div class="detail-row"><span>Documents visibles</span><b>${projectHubCount(summary.documentsCount)}</b></div>
    ${projectHubForecastPanel(state)}
    <div class="panel-head" style="margin-top:22px"><div><h3>Derniers événements</h3><span>Filtrés côté serveur selon vos droits et votre périmètre chantier.</span></div></div>
    ${projectHubTimelineRows(timeline.events)}
  </section>`;
}
async function loadProjectHubReadOnly(projectId){
  const key=String(projectId||'');if(!key)return;
  const existing=projectHubUiState.get(key);if(existing?.status==='loading'||existing?.status==='ready')return;
  projectHubUiState.set(key,{status:'loading'});
  try{
    const [hub,timeline]=await Promise.all([
      serverJson('/api/projects/'+encodeURIComponent(key)+'/hub?limit=5'),
      serverJson('/api/projects/'+encodeURIComponent(key)+'/timeline?limit=10')
    ]);
    const state={status:'ready',hub,timeline,forecastStatus:hub.capabilities?.viewFinancial?'loading':'hidden'};projectHubUiState.set(key,state);
    if(hub.capabilities?.viewFinancial){try{state.forecast=await serverJson('/api/projects/'+encodeURIComponent(key)+'/financial-forecast');state.forecastStatus='ready'}catch{state.forecastStatus='error'}}
  }catch(error){
    projectHubUiState.set(key,{status:'error',error:error.message||'Hub chantier indisponible.'});
  }
  if(typeof render==='function'&&view==='jobWorkspace'&&String(currentJobId||'')===key)render();
}
const renderBeforeProjectHub=render;
render=function(){
  renderBeforeProjectHub();
  if(view!=='jobWorkspace'||!currentJobId)return;
  const main=document.querySelector('#main');if(!main||main.querySelector('[data-project-hub]'))return;
  const key=String(currentJobId),state=projectHubUiState.get(key);
  main.insertAdjacentHTML('beforeend',projectHubReadOnlyPanel(key));
  if(!state)queueMicrotask(()=>loadProjectHubReadOnly(key));
};
