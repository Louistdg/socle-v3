/* Fil d'Ariane discret, aligné sur la navigation réelle. */
(function(){
'use strict';
var pending=false;
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function currentLabel(){
  var heading=document.querySelector('#main h1');
  if(heading&&String(heading.textContent||'').trim())return String(heading.textContent).trim();
  var nav=globalThis.SOCLE_NAVIGATION;
  if(nav&&typeof nav.item==='function'&&typeof view!=='undefined'){
    var entry=nav.item(view);
    if(entry&&entry.label)return entry.label;
  }
  return typeof view==='string'?view:'';
}
function render(){
  var main=document.querySelector('#main');
  if(!main)return;
  var existing=main.querySelector(':scope > .sx-breadcrumb');
  if(typeof view==='undefined'||view==='home'){
    if(existing)existing.remove();
    return;
  }
  var label=currentLabel();
  if(!label){if(existing)existing.remove();return;}
  if(!existing){
    existing=document.createElement('nav');
    existing.className='sx-breadcrumb';
    existing.setAttribute('aria-label',"Fil d'Ariane");
    main.prepend(existing);
  }
  var icon=typeof globalThis.sxIcon==='function'?globalThis.sxIcon('chevron'):'›';
  existing.innerHTML='<a href="#" data-sx-home>Accueil</a><span class="sx-breadcrumb-sep" aria-hidden="true">'+icon+'</span><strong aria-current="page">'+esc(label)+'</strong>';
  var home=existing.querySelector('[data-sx-home]');
  if(home)home.addEventListener('click',function(event){event.preventDefault();if(typeof navigate==='function')navigate('home');});
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;render();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
var main=document.querySelector('#main');
if(main)new MutationObserver(schedule).observe(main,{childList:true});
globalThis.syncSocleBreadcrumb=render;
})();
