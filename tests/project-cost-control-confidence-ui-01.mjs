import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../web/supplier-allocations.js',import.meta.url),'utf8');
const start=source.indexOf('function costControlAmount('),end=source.indexOf('\nasync function loadProjectCostControl',start);
assert.ok(start>=0&&end>start,'Les fonctions du pilotage chantier sont présentes.');
const context={
  projectedJobFinance:()=>({net:10000}),
  allocationMoney:value=>'€'+(Number(value)/100).toFixed(2),
  money:value=>'€'+Number(value).toFixed(2),
  esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
};
runInNewContext(source.slice(start,end)+';globalThis.render=projectCostControlHtml;',context);

const incomplete=context.render({id:'job-1'}, {
  labour:{hours:8,actualCostCents:null,remainingPlannedCostCents:null},
  procurement:{costToDateCents:0,invoicedCents:0,receivedNotInvoicedCents:null,outstandingOrderCents:0,unpaidCents:0,pendingDeliveryOrders:null},
  client:{invoicedTotalCents:0,invoicedNetCents:0,paidTotalCents:0,outstandingTotalCents:0,creditTotalCents:0},
  alerts:{pendingTimeCorrections:1},costControl:{totalCostToDateCents:null,costAtCompletionCents:null},
  quality:{confidence:'LOW',reasons:['LABOUR_HOURLY_COST_MISSING','LABOUR_TIME_ENTRIES_MISSING','BASELINE_MISSING']}
});
assert.match(incomplete,/8\.0 h pointées/,'Les heures pointées restent visibles même si leur coût manque.');
assert.match(incomplete,/Données à compléter/,'La qualité des données est explicite.');
assert.match(incomplete,/Coût horaire de la main-d’œuvre à renseigner/,'La cause du coût incomplet est traduite pour le patron.');
assert.match(incomplete,/Pointages de main-d’œuvre manquants/,'Les pointages absents sur un chantier terminé sont traduits pour le patron.');
assert.match(incomplete,/Marge projetée<\/small><strong>À compléter/,'La marge projetée reste inconnue si le coût à terminaison manque.');
assert.match(incomplete,/1 alerte\(s\)/,'Une correction d’heures en attente reste visible sur la fiche chantier.');
assert.match(incomplete,/1 correction d’heure en attente/,'Le patron voit clairement pourquoi une vérification est nécessaire.');
assert.match(incomplete,/reçu non facturé À renseigner/,'Une valeur fournisseur inconnue reste explicitement inconnue.');
assert.match(incomplete,/Nombre de livraisons à vérifier dans les commandes/,'Un nombre de livraisons inconnu ne devient pas un faux zéro.');
assert.match(incomplete,/vérifiez les bons de livraison/,'L’écran indique quelle vérification terrain manque.');
assert.doesNotMatch(incomplete,/Coût engagé à date<\/small><strong>€0\.00/,'Un coût réel inconnu ne devient pas un faux zéro.');
assert.doesNotMatch(incomplete,/Coût estimé à terminaison<\/small><strong>€0\.00/,'Un coût à terminaison inconnu ne devient pas un faux zéro.');

const complete=context.render({id:'job-1'}, {
  labour:{hours:8,actualCostCents:40000,remainingPlannedCostCents:460000},
  procurement:{costToDateCents:40000,invoicedCents:40000,receivedNotInvoicedCents:0,outstandingOrderCents:0,unpaidCents:40000,pendingDeliveryOrders:0,supplierPriceVarianceCents:0,supplierInvoiceMatchingPendingCents:0},
  client:{invoicedTotalCents:0,invoicedNetCents:0,paidTotalCents:0,outstandingTotalCents:0,creditTotalCents:0},
  alerts:{},costControl:{totalCostToDateCents:80000,costAtCompletionCents:680000},
  quality:{confidence:'HIGH',reasons:[]}
});
assert.match(complete,/Données fiables/,'Un chantier complet est distingué des données incomplètes.');
assert.match(complete,/Marge projetée<\/small><strong>€3200\.00/,'La marge utilise le coût à terminaison connu.');
assert.match(complete,/8\.0 h pointées/,'Les heures restent visibles dans le scénario complet.');
assert.match(complete,/Écart de prix €0\.00 · facture à rapprocher €0\.00/,'Les écarts et rapprochements fournisseur sont chiffrés dans le suivi.');
const pending=context.render({id:'job-1'}, {
  labour:{hours:8,actualCostCents:40000,remainingPlannedCostCents:460000},
  procurement:{costToDateCents:40000,invoicedCents:40000,receivedNotInvoicedCents:0,outstandingOrderCents:0,unpaidCents:0,pendingDeliveryOrders:1,supplierPriceVarianceCents:1200,supplierInvoiceMatchingPendingCents:800},
  client:{invoicedTotalCents:0,invoicedNetCents:0,paidTotalCents:0,outstandingTotalCents:0,creditTotalCents:0},
  alerts:{},costControl:{totalCostToDateCents:80000,costAtCompletionCents:680000},
  quality:{confidence:'HIGH',reasons:[]}
});
assert.match(pending,/Données à compléter/,'Une livraison attendue empêche un badge de fiabilité malgré une ancienne qualité haute.');
assert.match(pending,/Écart de prix €12\.00 · facture à rapprocher €8\.00/,'les montants d’écart et de rapprochement sont visibles et distincts');
console.log('project-cost-control-confidence-ui-01: 20 assertions réussies');
