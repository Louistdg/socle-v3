/* Statut, confidentialité et conditions, accessibles depuis le pied de page. */
(function(){
'use strict';
var dialog,body;
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function ensure(){
  if(dialog)return;
  dialog=document.createElement('dialog');dialog.id='sx-trust-dialog';dialog.className='sx-dialog';
  dialog.innerHTML='<div class="sx-dialog-head"><h2 id="sx-trust-title">Statut</h2><button type="button" class="sx-button" data-sx-close aria-label="Fermer">Fermer</button></div><div class="sx-dialog-body" id="sx-trust-body"></div>';
  document.body.append(dialog);body=dialog.querySelector('#sx-trust-body');
  dialog.querySelector('[data-sx-close]').addEventListener('click',function(){dialog.close();});
  dialog.addEventListener('click',function(event){if(event.target===dialog)dialog.close();});
  var footer=document.querySelector('footer');
  if(footer&&!footer.querySelector('.sx-trust-links')){
    var nav=document.createElement('nav');nav.className='sx-trust-links';nav.setAttribute('aria-label','Informations légales');
    nav.innerHTML='<button type="button" data-trust="status">Statut</button><button type="button" data-trust="journal">Journal</button><button type="button" data-trust="privacy">Confidentialité</button><button type="button" data-trust="terms">Conditions</button>';
    footer.append(nav);
    nav.addEventListener('click',function(event){var button=event.target.closest('[data-trust]');if(button)open(button.dataset.trust);});
  }
}
function status(){
  var saved=document.querySelector('#saveStatus')?.textContent||'';
  body.innerHTML='<p class="sx-muted">Vérification du service…</p>';
  fetch('/health',{cache:'no-store'}).then(function(response){return response.json().catch(function(){return {};}).then(function(data){return {ok:response.ok,data:data};});}).then(function(result){
    body.innerHTML='<p><span class="sx-badge ok">Service en ligne</span></p><div class="detail-row"><span>Adresse</span><b>'+esc(location.host)+'</b></div><div class="detail-row"><span>Version</span><b>3.0.0</b></div><div class="detail-row"><span>Sauvegarde</span><b>'+esc(saved||'Automatique')+'</b></div><div class="detail-row"><span>Thème</span><b>'+esc(document.body.dataset.v3Theme||'Comète')+'</b></div><div class="detail-row"><span>Erreurs récentes</span><b>'+esc(String((globalThis.socleErrorLog?globalThis.socleErrorLog():[]).length))+'</b></div><p class="sx-muted">Dernière vérification : '+esc(new Date().toLocaleString('fr-BE'))+'</p>';
    var errors=globalThis.socleErrorLog?globalThis.socleErrorLog():[];
    if(errors.length)body.insertAdjacentHTML('beforeend','<details class="audit-panel-details"><summary>Voir les erreurs récentes</summary>'+errors.slice(-5).reverse().map(function(item){return '<div class="detail-row"><span><strong>'+esc(item.message)+'</strong><small>'+esc(item.route||'')+'</small></span><small>'+esc(new Date(item.at).toLocaleString('fr-BE'))+'</small></div>';}).join('')+'</details>');
  }).catch(function(){
    body.innerHTML='<p><span class="sx-badge danger">Service indisponible</span></p><p class="sx-muted">Impossible de joindre /health pour le moment. Vos modifications restent dans cette page.</p>';
  });
}
function actionLabel(action){
  var names={member:'Membre',planning:'Planning',assignment:'Affectation',purchase_order:'Commande',invoice:'Facture',expense:'Dépense',document:'Document',time_entry:'Pointage',asset:'Matériel',supplier_allocation:'Ventilation',supplier_invoice_match:'Rapprochement',simulation:'Simulation'};
  var parts=String(action||'action').split('.'),prefix=names[parts[0]]||parts[0].replace(/_/g,' ');
  var rest=parts.slice(1).map(function(part){return part.replace(/_/g,' ');}).join(' · ');
  return prefix+(rest?' · '+rest:'');
}
function journal(){
  body.innerHTML='<p class="sx-muted">Chargement du journal…</p>';
  fetch('/api/audit-log?limit=40',{cache:'no-store',credentials:'same-origin'}).then(function(response){
    if(!response.ok)throw new Error(response.status===403?'Journal réservé aux personnes autorisées.':'Journal indisponible.');
    return response.json();
  }).then(function(data){
    var events=data.events||[];
    body.innerHTML=events.length?events.map(function(event){
      return '<div class="detail-row"><span><strong>'+esc(actionLabel(event.action))+'</strong><small>'+esc(event.entityType||'')+' · '+esc(String(event.entityId||''))+'</small></span><span><b>'+esc(event.actorName||'Utilisateur')+'</b><small>'+esc(new Date(event.createdAt).toLocaleString('fr-BE'))+'</small></span></div>';
    }).join(''):'<div class="empty">Aucune action enregistrée pour le moment.</div>';
  }).catch(function(error){
    body.innerHTML='<p class="sx-badge danger">'+esc(error.message)+'</p><p class="sx-muted">Le journal est accessible aux personnes qui ont le droit de consultation.</p>';
  });
}
function open(kind){
  ensure();
  var title=dialog.querySelector('#sx-trust-title');
  if(kind==='status'){title.textContent='Statut du service';status();}
  else if(kind==='journal'){title.textContent='Journal des actions';journal();}
  else if(kind==='privacy'){title.textContent='Confidentialité';body.innerHTML='<p>Vos données restent dans l’entreprise active. Les documents privés passent par une autorisation serveur.</p><p>Les préférences d’affichage (thème, filtres de tableau, brouillons de formulaire) sont stockées dans votre navigateur pour cette session. Les brouillons ne contiennent jamais de mots de passe ni de fichiers.</p><p>Pour toute demande d’accès ou de suppression, contactez l’administrateur de votre entreprise.</p>';}
  else{title.textContent='Conditions d’utilisation';body.innerHTML='<p>SOCLE est un outil de gestion interne. Les données affichées doivent être vérifiées avant toute décision administrative, comptable ou juridique.</p><p>L’aperçu de démonstration contient des données fictives. Ne pas y saisir de données personnelles réelles.</p><p>Les sauvegardes et les droits d’accès sont gérés par l’administrateur de l’entreprise.</p>';}
  if(!dialog.open)dialog.showModal();
}
function schedule(){ensure();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
globalThis.openSocleTrust=open;
})();
