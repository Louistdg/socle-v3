(function(){
'use strict';

var MOBILE_MAX=760;
var KNOWN_ROLES=new Set(['OWNER','TEAM_LEAD','WORKER','ACCOUNTING']);
var MOBILE_GROUPS=[['priority','Priorités'],['operations','Opérations'],['support','Suivi'],['management','Gestion'],['settings','Paramètres']];

function navigationContract(){return globalThis.SOCLE_NAVIGATION||null}
globalThis.SOCLE_NAVIGATION_V2=globalThis.SOCLE_NAVIGATION;

function isMobile(){return window.matchMedia?window.matchMedia('(max-width:'+MOBILE_MAX+'px)').matches:Number(window.innerWidth||document.documentElement.clientWidth||9999)<=MOBILE_MAX}
// Fixed chrome must follow the visible viewport when a wide module overflows.
function syncMobileViewport(){
  var viewport=window.visualViewport;if(!viewport||!isMobile())return;
  var nav=document.querySelector('#socleMobileNav'),dialog=document.querySelector('#socleMobileMoreDialog');
  [nav,dialog].filter(Boolean).forEach(function(node){
    node.style.left=viewport.offsetLeft+'px';
    node.style.right='auto';
    node.style.width=viewport.width+'px';
    node.style.boxSizing='border-box';
    node.style.bottom='auto';
    if(node===dialog){node.style.height=(viewport.height*.94)+'px';node.style.maxHeight=(viewport.height*.94)+'px'}
    node.style.top=(viewport.offsetTop+viewport.height-node.getBoundingClientRect().height)+'px';
  });
}
function escapeHtml(value){
  if(typeof esc==='function')return esc(String(value==null?'':value));
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]});
}
function currentRole(){
  if(typeof sessionAccessKey!=='undefined'&&sessionAccessKey==='owner')return 'OWNER';
  var assignment=typeof sessionAssignment==='function'?sessionAssignment():null;
  var profile=String(assignment&&assignment.profile||'').toLowerCase();
  var member=typeof accessMembers==='function'&&typeof sessionAccessKey!=='undefined'?accessMembers().find(function(item){return item.key===sessionAccessKey}):null;
  var serverRole=String(member&&member.serverRoleCode||'');
  if(serverRole==='ACCOUNTING'||profile.includes('comptable')||profile.includes('administration'))return 'ACCOUNTING';
  if(serverRole==='TEAM_LEAD'||profile.includes('chef'))return 'TEAM_LEAD';
  if(serverRole==='WORKER'||profile.includes('ouvrier')||profile.includes('apprenti')||profile.includes('stagiaire')||profile.includes('intérimaire'))return 'WORKER';
  if(typeof socleCurrentAccess!=='undefined'){
    var accessRole=String(socleCurrentAccess&&socleCurrentAccess.roleCode||'');
    if(KNOWN_ROLES.has(accessRole))return accessRole;
  }
  return 'OWNER';
}
function visible(key){
  var contract=navigationContract();
  if(contract)return Boolean(contract.available(key)&&contract.allowed(key));
  if(key==='home')return true;
  if(typeof canViewModule==='function')return Boolean(canViewModule(key));
  return typeof tabs2!=='undefined'&&tabs2.some(function(item){return item[0]===key});
}
function item(key){
  var contract=navigationContract(),entry=contract&&contract.item(key);
  if(entry)return {key:entry.route,label:entry.label,short:entry.short||entry.label,icon:entry.icon||'',group:entry.group};
  return {key:key,label:key,short:key,icon:'',group:'operations'};
}
function ensureBottomNav(){
  var nav=document.querySelector('#socleMobileNav');
  if(!isMobile()){closeMobileMore(false);document.body.removeAttribute('data-mobile-nav');if(nav)nav.remove();return null}
  document.body.setAttribute('data-mobile-nav','true');
  if(!nav){
    nav=document.createElement('nav');
    nav.id='socleMobileNav';
    nav.className='socle-mobile-nav';
    nav.setAttribute('aria-label','Navigation mobile');
    nav.addEventListener('click',function(event){
      var toggle=event.target&&event.target.closest?event.target.closest('[data-mobile-menu-toggle]'):null;
      if(toggle&&nav.contains(toggle)){toggleMobileMore();return}
      var button=event.target&&event.target.closest?event.target.closest('button[data-mobile-route]'):null;
      if(!button||!nav.contains(button))return;
      navigateMobileRoute(button.dataset.mobileRoute);
    });
    document.body.appendChild(nav);
  }
  return nav;
}
function mobileMoreDialog(){
  var dialog=document.querySelector('#socleMobileMoreDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='socleMobileMoreDialog';
  dialog.className='socle-mobile-sheet';
  dialog.setAttribute('aria-labelledby','socleMobileMoreTitle');
  dialog.addEventListener('click',function(event){if(event.target===dialog)closeMobileMore(true)});
  dialog.addEventListener('close',function(){
    var toggle=document.querySelector('#socleMobileNav [data-mobile-menu-toggle]');
    if(toggle)toggle.setAttribute('aria-expanded','false');
  });
  document.body.appendChild(dialog);
  return dialog;
}
function mobileMoreGroups(query){
  var keys=secondaryKeys(),needle=String(query||'').trim().toLocaleLowerCase('fr');
  var groups=MOBILE_GROUPS;
  return groups.map(function(group){
    var entries=keys.map(item).filter(function(entry){
      var label=(typeof tabs2!=='undefined'&&(tabs2.find(function(tab){return tab[0]===entry.key})||[])[1])||entry.label;
      return entry.group===group[0]&&(!needle||(label+' '+entry.label).toLocaleLowerCase('fr').includes(needle));
    });
    return {label:group[1],entries:entries};
  }).filter(function(group){return group.entries.length});
}
function mobileMoreGroupsMarkup(query){
  var groups=mobileMoreGroups(query),count=groups.reduce(function(total,group){return total+group.entries.length},0);
  var groupsHtml=groups.map(function(group){
    var entriesHtml=group.entries.map(function(entry){
      var label=(typeof tabs2!=='undefined'&&(tabs2.find(function(tab){return tab[0]===entry.key})||[])[1])||entry.label;
      return '<button type="button" data-mobile-route="'+escapeHtml(entry.key)+'"><span aria-hidden="true">'+escapeHtml(entry.icon||'›')+'</span><strong>'+escapeHtml(label)+'</strong><span aria-hidden="true">↗</span></button>';
    }).join('');
    return '<section class="socle-mobile-menu-group"><h3>'+escapeHtml(group.label)+'</h3><div>'+entriesHtml+'</div></section>';
  }).join('');
  return count?groupsHtml:'<p class="socle-mobile-menu-empty">Aucune rubrique ne correspond à cette recherche.</p>';
}
function bindMobileMenuRoutes(dialog){
  dialog.querySelectorAll('button[data-mobile-route]').forEach(function(button){button.addEventListener('click',function(){var route=button.dataset.mobileRoute;closeMobileMore(false);navigateMobileRoute(route)})});
}
function renderMobileMoreDialog(){
  var dialog=mobileMoreDialog();
  dialog.innerHTML='<div class="socle-mobile-sheet-grabber" aria-hidden="true"></div><div class="socle-mobile-sheet-head"><div><p class="eyebrow">NAVIGATION</p><h2 id="socleMobileMoreTitle">Rubriques</h2><span>Ouvrez directement une rubrique autorisée pour votre compte.</span></div><button type="button" class="socle-mobile-sheet-close" data-mobile-menu-close aria-label="Fermer le menu">×</button></div><label class="socle-mobile-menu-search"><span class="sr-only">Rechercher une rubrique</span><input type="search" data-mobile-menu-search placeholder="Rechercher une rubrique…" autocomplete="off"></label><div class="socle-mobile-menu-groups"></div><footer class="socle-mobile-menu-foot"><span>Les droits d’accès de votre compte restent inchangés.</span>'+mobileLogoutMarkup()+'</footer>';
  var search=dialog.querySelector('[data-mobile-menu-search]'),results=dialog.querySelector('.socle-mobile-menu-groups');
  var updateResults=function(){results.innerHTML=mobileMoreGroupsMarkup(search.value);bindMobileMenuRoutes(dialog)};
  search.addEventListener('input',updateResults);
  dialog.querySelector('[data-mobile-menu-close]')?.addEventListener('click',function(){closeMobileMore(true)});
  updateResults();
  return dialog;
}
function openMobileMore(){
  if(!isMobile())return;
  var toggle=document.querySelector('#socleMobileNav [data-mobile-menu-toggle]');
  var dialog=renderMobileMoreDialog();
  if(toggle)toggle.setAttribute('aria-expanded','true');
  if(!dialog.open)dialog.showModal();
  syncMobileViewport();
}
function closeMobileMore(returnFocus){
  var dialog=document.querySelector('#socleMobileMoreDialog');
  if(dialog?.open)dialog.close();
  var toggle=document.querySelector('#socleMobileNav [data-mobile-menu-toggle]');
  if(toggle){toggle.setAttribute('aria-expanded','false');if(returnFocus)toggle.focus()}
}
function toggleMobileMore(){var dialog=document.querySelector('#socleMobileMoreDialog');if(dialog?.open)closeMobileMore(true);else openMobileMore()}
function navigateMobileRoute(route){
  closeMobileMore(false);
  if(route&&typeof navigate==='function')navigate(route);
}
function renderBottomNav(){
  var nav=ensureBottomNav();if(!nav)return;
  var role=currentRole(),contract=navigationContract(),keys=contract?contract.mobilePrimary(role).map(function(entry){return entry.route}):[],moreActive=secondaryKeys().includes(typeof view!=='undefined'?view:''),menuOpen=Boolean(document.querySelector('#socleMobileMoreDialog')?.open);
  nav.innerHTML=keys.map(function(key){
    var entry=item(key),active=typeof view!=='undefined'&&view===key;
    return '<button type="button" data-mobile-route="'+escapeHtml(key)+'" class="'+(active?'active':'')+'" '+(active?'aria-current="page"':'')+'><span class="socle-mobile-nav-icon" aria-hidden="true">'+escapeHtml(entry.icon)+'</span><span>'+escapeHtml(entry.short)+'</span></button>';
  }).join('')+'<button type="button" data-mobile-menu-toggle aria-label="Plus — ouvrir les autres rubriques" aria-haspopup="dialog" aria-expanded="'+(menuOpen?'true':'false')+'" class="'+(moreActive?'active':'')+'" '+(moreActive?'aria-current="location"':'')+'><span class="socle-mobile-nav-icon" aria-hidden="true">⋯</span><span>Plus</span></button>';
}
function secondaryKeys(){
  var contract=navigationContract();
  if(contract)return contract.mobileMore(currentRole()).map(function(entry){return entry.route});
  return [];
}
function syncPersonalMobileCleanup(){
  document.querySelectorAll('[data-socle-mobile-extras]').forEach(function(node){node.remove()});
  var main=document.querySelector('#main');
  if(!main)return;
  var hide=Boolean(isMobile()&&typeof view!=='undefined'&&view==='personal');
  var nodes=[
    main.querySelector('.personal-official > .panel-head'),
    main.querySelector('.personal-official-links'),
    main.querySelector('.personal-company-access'),
    main.querySelector('.ia-overview-personal-portals')
  ].filter(Boolean);
  nodes.forEach(function(node){
    node.dataset.mobilePersonalDuplicate='true';
    node.hidden=hide;
  });
}
function mobileLogoutMarkup(){
  var source=document.querySelector('.header-right form[action$="/logout"]');
  return source?'<form class="socle-mobile-logout" method="post" action="/auth/logout"><button type="submit">Se déconnecter</button></form>':'';
}
function sanitizePersonalSubtitle(){
  if(typeof view==='undefined'||view!=='personal')return;
  var subtitle=document.querySelector('#main .personal-head h1 + span');
  if(!subtitle)return;
  var text=subtitle.textContent||'';
  if(text.includes('·'))subtitle.textContent=text.split('·')[0].trim();
}
function syncMobileChrome(){
  if(typeof globalThis.syncSocleDesktopNavigation==='function')globalThis.syncSocleDesktopNavigation();
  renderBottomNav();
  syncMobileViewport();
  syncPersonalMobileCleanup();
  sanitizePersonalSubtitle();
}
var originalNavigate=typeof navigate==='function'?navigate:null;
if(originalNavigate){
  navigate=function(){
    var result=originalNavigate.apply(this,arguments);
    queueMicrotask(syncMobileChrome);
    return result;
  };
}
var originalRender=typeof render==='function'?render:null;
if(originalRender){
  render=function(){
    var result=originalRender.apply(this,arguments);
    syncMobileChrome();
    queueMicrotask(syncMobileChrome);
    return result;
  };
}
window.addEventListener('resize',syncMobileChrome,{passive:true});
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',syncMobileViewport,{passive:true});
  window.visualViewport.addEventListener('scroll',syncMobileViewport,{passive:true});
}
document.addEventListener('keydown',function(event){if(event.key==='Escape')closeMobileMore(false)});
document.addEventListener('DOMContentLoaded',syncMobileChrome);
queueMicrotask(syncMobileChrome);
})();
