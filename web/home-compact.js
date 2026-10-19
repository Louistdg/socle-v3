/* Accueil compact : les informations d'abord, la météo et les portails visibles. */
(function(){
'use strict';
function esc(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
}
function firstName(){
  var name='';
  try{
    if(typeof company!=='undefined'&&company&&company.manager)name=company.manager;
    else if(typeof people!=='undefined'&&Array.isArray(people)&&people[0])name=people[0].name||'';
  }catch(error){}
  return String(name).trim().split(/\s+/)[0]||'';
}
function counts(){
  var tasks=0,jobsCount=0,documentsCount=0;
  try{if(typeof reminders!=='undefined'&&Array.isArray(reminders))tasks=reminders.filter(function(item){return item.state!=='done';}).length;}catch(error){}
  try{var title=document.querySelector('.ia-attention h2');var match=title&&String(title.textContent).match(/\d+/);if(match)tasks=Number(match[0]);}catch(error){}
  try{if(typeof jobs!=='undefined'&&Array.isArray(jobs))jobsCount=jobs.filter(function(job){return !['Archivé','Terminé'].includes(job.phase);}).length;}catch(error){}
  try{if(typeof documents!=='undefined'&&Array.isArray(documents))documentsCount=documents.length;}catch(error){}
  return {tasks:tasks,jobs:jobsCount,documents:documentsCount};
}
function kpi(label,value,note){
  return '<div class="home-kpi"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><em>'+esc(note||'')+'</em></div>';
}
function updateKpis(intro,copy){
  var data=counts();
  var date='';
  try{date=new Intl.DateTimeFormat('fr-BE',{weekday:'long',day:'numeric',month:'long'}).format(new Date());}catch(error){}
  if(copy)copy.innerHTML='<h1>Bonjour '+esc(firstName())+'</h1><p class="home-sub">'+esc(date)+' · '+data.tasks+' chose'+(data.tasks===1?'':'s')+' à traiter</p>';
  var kpis=intro.querySelector('.home-kpis');
  if(!kpis){kpis=document.createElement('div');kpis.className='home-kpis';intro.append(kpis);}
  kpis.innerHTML=kpi('À traiter',data.tasks,data.tasks===1?'1 action':'actions en cours')+kpi('Chantiers',data.jobs,'actifs')+kpi('Documents',data.documents,'ce mois')+kpi('Alertes',0,'rien d’urgent');
}
function compactIntro(intro){
  var role=intro.dataset.v3Role||'';
  var copy=intro.firstElementChild;
  if(!copy)return;
  if(intro.dataset.homeCompact===role){updateKpis(intro,null);return;}
  updateKpis(intro,copy);
  var quick=intro.querySelector('.v3-shortcuts');
  if(quick)Array.prototype.slice.call(quick.children,2).forEach(function(node){node.remove();});
  intro.dataset.homeCompact=role;
}
function ensureGrid(main){
  var attention=main.querySelector('.ia-attention');
  var weather=main.querySelector('.ia-home-weather');
  var portals=main.querySelector('.ia-home-portals');
  if(!weather&&!portals)return;
  var grid=main.querySelector('.home-top-grid');
  if(!grid){grid=document.createElement('div');grid.className='home-top-grid';}
  if(weather&&weather.parentElement!==grid)grid.append(weather);
  if(portals&&portals.parentElement!==grid)grid.append(portals);
  if(attention&&attention.nextElementSibling!==grid)attention.after(grid);
}
function stylePortals(main){
  var links=main.querySelector('.ia-home-portals .ia-home-portal-links');
  if(!links)return;
  var mobile=window.matchMedia('(max-width:899px)').matches;
  links.style.gridTemplateColumns=mobile?'repeat(3,minmax(0,1fr))':'';
  Array.prototype.forEach.call(links.querySelectorAll('a'),function(link){
    link.style.gridTemplateColumns=mobile?'20px minmax(0,1fr)':'';
    link.style.minHeight=mobile?'42px':'';
    link.style.padding=mobile?'5px':'';
    link.style.fontSize=mobile?'8.5px':'';
    link.style.gap=mobile?'3px':'';
    var label=link.querySelector('.ia-home-portal-label');
    if(label){label.style.whiteSpace=mobile?'nowrap':'';label.style.overflow=mobile?'hidden':'';label.style.textOverflow=mobile?'ellipsis':'';label.style.fontSize=mobile?'8.5px':'';}
    var arrow=link.querySelector('.ia-home-portal-arrow');
    if(arrow)arrow.style.display=mobile?'none':'';
  });
  Array.prototype.forEach.call(links.querySelectorAll('.ia-home-portal-mark'),function(mark){
    mark.style.width=mobile?'20px':'';
    mark.style.height=mobile?'20px':'';
    mark.style.fontSize=mobile?'7px':'';
    mark.style.borderRadius=mobile?'6px':'';
  });
}
function hideNoise(main){
  ['.ia-job-canvas-shell','.ia-quick-actions','.ia-screen-purpose'].forEach(function(selector){
    var node=main.querySelector(selector);
    if(node)node.hidden=true;
  });
  ['#socleMasthead','#saveStatus'].forEach(function(selector){
    var node=document.querySelector(selector);
    if(node){node.hidden=true;node.style.setProperty('display','none','important');}
  });
}
function enhance(){
  if(typeof view==='undefined'||view!=='home')return;
  document.body.dataset.auditRoute='home';
  var main=document.querySelector('#main');
  if(!main)return;
  var intro=main.querySelector('.v3-intro');
  if(intro)compactIntro(intro);
  ensureGrid(main);
  stylePortals(main);
  hideNoise(main);
}
var pending=false;
function schedule(){
  if(pending)return;
  pending=true;
  requestAnimationFrame(function(){pending=false;enhance();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
else schedule();
var main=document.querySelector('#main');
if(main)new MutationObserver(schedule).observe(main,{childList:true});
if(document.body)new MutationObserver(schedule).observe(document.body,{childList:true});
window.addEventListener('resize',schedule,{passive:true});

var homeWidgetDefs=[
  {id:'weather',label:'Météo',selector:'.ia-home-weather'},
  {id:'portals',label:'Portails officiels',selector:'.ia-home-portals'},
  {id:'attention',label:'Centre de contrôle',selector:'.ia-attention'},
  {id:'messages',label:'Messages récents',selector:'.ia-owner-messages'},
  {id:'tasks',label:'Priorités',selector:'.ia-owner-tasks'},
  {id:'calendar',label:'Calendrier',selector:'.ia-owner-week'},
  {id:'jobs',label:'Chantiers',selector:'.v3-jobs'}
];
var homeWidgetHidden=[],homeWidgetsReady=false,homeWidgetsLoading=false;
function applyHomeWidgets(){
  if(typeof view==='undefined'||view!=='home')return;
  homeWidgetDefs.forEach(function(def){
    var node=document.querySelector('#main '+def.selector);
    if(node)node.hidden=homeWidgetHidden.indexOf(def.id)>=0;
  });
}
function loadHomeWidgets(){
  if(homeWidgetsReady||homeWidgetsLoading||typeof serverJson!=='function')return;
  homeWidgetsLoading=true;
  serverJson('/api/me/preferences/dashboard/home-widgets').then(function(data){
    var value=data&&data.preference&&data.preference.value;
    homeWidgetHidden=value&&Array.isArray(value.hidden)?value.hidden.map(String):[];
    homeWidgetsReady=true;homeWidgetsLoading=false;applyHomeWidgets();
  }).catch(function(){homeWidgetsLoading=false;});
}
function openHomeWidgetsForm(){
  if(typeof modal!=='function')return;
  var checks=homeWidgetDefs.map(function(def){
    return '<label class="home-widget-check"><input type="checkbox" name="widget" value="'+def.id+'" '+(homeWidgetHidden.indexOf(def.id)<0?'checked':'')+'> <span>'+def.label+'</span></label>';
  }).join('');
  modal('Personnaliser l’accueil','<form onsubmit="homeWidgetsSave(event)"><p class="help-line">Choisissez les blocs visibles sur l’accueil. Le réglage est conservé pour votre compte.</p><div class="home-widget-list">'+checks+'</div><div class="modal-actions"><button class="btn" type="button" onclick="closeModal()">Annuler</button><button class="btn primary">Enregistrer</button></div></form>');
}
globalThis.homeWidgetsSave=function(event){
  event.preventDefault();
  var checked={};Array.prototype.forEach.call(event.target.querySelectorAll('input[name="widget"]'),function(input){checked[input.value]=input.checked;});
  homeWidgetHidden=homeWidgetDefs.filter(function(def){return !checked[def.id];}).map(function(def){return def.id;});
  applyHomeWidgets();closeModal();
  if(typeof serverJson==='function')serverJson('/api/me/preferences/dashboard/home-widgets',{method:'PUT',body:JSON.stringify({schemaVersion:1,value:{hidden:homeWidgetHidden}})}).then(function(){toast('Accueil personnalisé.')}).catch(function(){toast('Réglage local appliqué, sauvegarde serveur indisponible.')});else toast('Accueil personnalisé.');
};
function mountHomeCustomizer(){
  if(typeof view==='undefined'||view!=='home')return;
  var intro=document.querySelector('#main .v3-intro');
  if(!intro||intro.querySelector('[data-home-customize]'))return;
  var button=document.createElement('button');button.type='button';button.className='btn home-customize';button.dataset.homeCustomize='';button.textContent='Personnaliser';
  button.addEventListener('click',openHomeWidgetsForm);
  var shortcuts=intro.querySelector('.v3-shortcuts');
  if(shortcuts)shortcuts.append(button);else intro.append(button);
  loadHomeWidgets();applyHomeWidgets();
}
var originalEnhance=enhance;
enhance=function(){originalEnhance();mountHomeCustomizer();};
})();
