/* Palette de commandes : Ctrl+K, navigation, actions et recherche serveur. */
(function(){
'use strict';
var dialog, input, list, commands=[], dataCommands=[], visible=[], active=0, timer=0, requestId=0;
var routeByGroup={projects:'jobs',contacts:'contacts',people:'team',quotes:'quotes',invoices:'accounting',documents:'documents'};
var iconByGroup={projects:'briefcase',contacts:'user',people:'users',quotes:'file',invoices:'euro',documents:'file'};

function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function icon(name){return typeof globalThis.sxIcon==='function'?globalThis.sxIcon(name):'';}
function available(){return typeof view!=='undefined'&&document.querySelector('#main')}

function buildCommands(){
  var out=[];var nav=globalThis.SOCLE_NAVIGATION;
  if(nav&&typeof nav.desktopEntries==='function'){
    nav.desktopEntries().forEach(function(entry){
      out.push({kind:'route',route:entry.route,label:entry.label,meta:'Navigation',icon:entry.route==='home'?'home':entry.route==='jobs'?'briefcase':entry.route==='planning'?'calendar':entry.route==='documents'?'file':entry.route==='personal'?'user':entry.route==='accounting'?'euro':entry.route==='people'?'users':'chevron'});
    });
  }
  [
    ['jobForm','Nouveau chantier','Action','briefcase'],
    ['quoteForm','Nouveau devis','Action','file'],
    ['documentUploadForm','Importer un document','Action','file'],
    ['expenseForm','Nouvelle dépense','Action','euro']
  ].forEach(function(item){
    if(typeof globalThis[item[0]]==='function')out.push({kind:'action',fn:item[0],label:item[1],meta:item[2],icon:item[3]});
  });
  return out;
}
function allCommands(){return commands.concat(dataCommands)}
function render(){
  if(!list)return;
  var q=String(input.value||'').trim().toLocaleLowerCase('fr');
  var local=commands.filter(function(cmd){return !q||(cmd.label+' '+cmd.meta).toLocaleLowerCase('fr').includes(q)});
  var data=dataCommands.filter(function(cmd){return !q||(cmd.label+' '+cmd.context).toLocaleLowerCase('fr').includes(q)});
  visible=local.concat(data);
  var rows=[];
  if(local.length){
    rows.push('<div class="sx-command-group">Navigation et actions</div>');
    local.forEach(function(cmd){
      var index=visible.indexOf(cmd);
      rows.push('<button type="button" class="sx-command-option" role="option" id="sx-cmd-'+index+'" data-command-index="'+index+'">'+icon(cmd.icon)+'<strong>'+esc(cmd.label)+'</strong><small>'+esc(cmd.meta)+'</small></button>');
    });
  }
  if(data.length){
    rows.push('<div class="sx-command-group">Résultats</div>');
    data.forEach(function(cmd){
      var index=visible.indexOf(cmd);
      rows.push('<button type="button" class="sx-command-option" role="option" id="sx-cmd-'+index+'" data-command-index="'+index+'">'+icon(iconByGroup[cmd.group]||'search')+'<strong>'+esc(cmd.label)+'</strong><small>'+esc(cmd.context||cmd.group)+'</small></button>');
    });
  }
  if(!rows.length)rows.push('<div class="sx-command-empty">Aucun résultat. Essayez « chantier », « devis » ou « document ».</div>');
  list.innerHTML=rows.join('');
  active=Math.min(active,Math.max(0,visible.length-1));
  paint();
}
function paint(){
  Array.prototype.forEach.call(list.querySelectorAll('.sx-command-option'),function(option,index){
    option.setAttribute('aria-selected',String(index===active));
    if(index===active)option.scrollIntoView({block:'nearest'});
  });
  var option=list.querySelector('.sx-command-option[aria-selected="true"]');
  if(option)input.setAttribute('aria-activedescendant',option.id);else input.removeAttribute('aria-activedescendant');
}
function run(index){
  var cmd=visible[index];
  if(!cmd)return;
  close();
  if(cmd.kind==='action'&&typeof globalThis[cmd.fn]==='function'){globalThis[cmd.fn]();return;}
  if(cmd.kind==='route'&&typeof navigate==='function'){navigate(cmd.route);return;}
  if(cmd.kind==='data'&&typeof navigate==='function'){navigate(cmd.route);}
}
async function loadResults(query){
  if(query.length<2){dataCommands=[];render();return;}
  var current=++requestId;
  try{
    if(typeof serverJson!=='function')return;
    var data=await serverJson('/api/search?q='+encodeURIComponent(query));
    if(current!==requestId)return;
    dataCommands=[];
    (data.groups||[]).forEach(function(group){
      (group.items||[]).slice(0,4).forEach(function(item){
        dataCommands.push({kind:'data',group:group.id,route:routeByGroup[group.id]||'home',label:item.label,context:item.context||group.label});
      });
    });
    render();
  }catch(error){dataCommands=[];render();}
}
function open(){
  if(!dialog)return;
  if(dialog.open){close();return;}
  commands=buildCommands();
  dataCommands=[];active=0;input.value='';render();
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  setTimeout(function(){input.focus();},20);
}
function close(){
  if(!dialog)return;
  if(dialog.open&&typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');
  input.value='';dataCommands=[];active=0;
}
function ensure(){
  if(dialog)return;
  if(!document.body)return;
  var searchHost=document.querySelector('.global-search');
  if(searchHost&&!searchHost.querySelector('.sx-search-kbd')){
    var hint=document.createElement('kbd');hint.className='sx-search-kbd';hint.textContent='Ctrl K';searchHost.append(hint);
  }
  dialog=document.createElement('dialog');dialog.id='sx-command-palette';dialog.className='sx-command';dialog.setAttribute('aria-label','Recherche et commandes');
  dialog.innerHTML='<div class="sx-command-input">'+icon('search')+'<input type="search" autocomplete="off" placeholder="Rechercher ou lancer une commande…" aria-label="Rechercher ou lancer une commande" role="combobox" aria-expanded="true" aria-controls="sx-command-list"><kbd>Échap</kbd></div><div class="sx-command-list" id="sx-command-list" role="listbox" aria-label="Commandes et résultats"></div>';
  document.body.append(dialog);
  input=dialog.querySelector('input');list=dialog.querySelector('.sx-command-list');
  dialog.addEventListener('click',function(event){if(event.target===dialog)close();});
  dialog.addEventListener('close',function(){dataCommands=[];});
  input.addEventListener('input',function(){
    active=0;render();clearTimeout(timer);
    var q=input.value.trim();
    timer=setTimeout(function(){loadResults(q);},180);
  });
  input.addEventListener('keydown',function(event){
    var count=list.querySelectorAll('.sx-command-option').length;
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(!count)return;active=(active+(event.key==='ArrowDown'?1:-1)+count)%count;paint();return;}
    if(event.key==='Enter'){event.preventDefault();run(active);}
  });
  list.addEventListener('click',function(event){
    var option=event.target.closest('.sx-command-option');if(!option)return;
    active=Number(option.dataset.commandIndex||0);run(active);
  });
  commands=buildCommands();
}
function boot(){ensure();if(!commands.length)commands=buildCommands();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
document.addEventListener('keydown',function(event){
  var key=String(event.key||'').toLocaleLowerCase('fr');
  if((event.ctrlKey||event.metaKey)&&key==='k'){event.preventDefault();open();return;}
  if(event.key==='Escape'&&dialog&&dialog.open){event.preventDefault();close();}
});
globalThis.openSocleCommand=open;
})();

