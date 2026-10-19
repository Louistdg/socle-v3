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
  var main=document.querySelector('#main');
  if(!main)return;
  var intro=main.querySelector('.v3-intro');
  if(intro)compactIntro(intro);
  ensureGrid(main);
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
})();
