/* Dossiers de tâches — Tranche 1.
   Une seule mécanique : glisser une tâche sur un dossier, glisser un dossier
   par sa poignée. L'emplacement et l'ordre sont retenus par personne dans la
   préférence serveur dashboard/task-folders. Un bouton « Déplacer » donne le
   même résultat au clavier, et chaque changement peut être annulé. */
(function(){
'use strict';

var ENDPOINT='/api/me/preferences/dashboard/task-folders';
var DEFAULT_FOLDERS=[
  {id:'task-folder-priority',name:'Priorités'},
  {id:'task-folder-followup',name:'Suivi'},
  {id:'task-folder-admin',name:'Administratif'}
];
var state={status:'idle',key:'',folders:DEFAULT_FOLDERS.map(function(folder){return{id:folder.id,name:folder.name}}),assignments:{},saving:false,error:'',undo:null};
var filter='all';
var drag=null;
var revision=0;
var undoMessage='';
var undoTimer=0;

function cloneFolders(list){return (list||[]).map(function(folder){return{id:String(folder.id),name:String(folder.name)}})}
function snapshot(){return{folders:cloneFolders(state.folders),assignments:Object.assign({},state.assignments)}}
function restore(value){state.folders=cloneFolders(value.folders);state.assignments=Object.assign({},value.assignments)}
function folderById(id){return state.folders.find(function(folder){return folder.id===String(id)})||null}
function folderOf(taskId){return state.assignments[String(taskId)]||''}
function folderName(id){var folder=folderById(id);return folder?folder.name:''}
function alertState(){return globalThis.alertTab||'todo'}
function taskList(){try{return typeof reminders!=='undefined'&&Array.isArray(reminders)?reminders:[]}catch{return[]}}
function effectiveState(task){try{return typeof effectiveTaskState==='function'?effectiveTaskState(task):String(task.state||'todo')}catch{return String(task.state||'todo')}}
function normalized(value){
  var source=value&&typeof value==='object'?value:{},rawFolders=Array.isArray(source.folders)?source.folders:[],folders=[],seen={};
  rawFolders.slice(0,20).forEach(function(folder){
    var id=String(folder&&folder.id||'').trim(),name=String(folder&&folder.name||'').trim().slice(0,60);
    if(!id||!name||seen[id])return;seen[id]=true;folders.push({id:id,name:name});
  });
  var assignments={},allowed={};folders.forEach(function(folder){allowed[folder.id]=true});
  if(source.assignments&&typeof source.assignments==='object'&&!Array.isArray(source.assignments)){
    Object.keys(source.assignments).slice(0,400).forEach(function(taskId){
      var folderId=String(source.assignments[taskId]||'');
      if(allowed[folderId])assignments[String(taskId)]=folderId;
    });
  }
  return{folders:folders,assignments:assignments};
}
function value(){return{folders:cloneFolders(state.folders),assignments:Object.assign({},state.assignments)}}
function serverTasks(){try{return typeof serverProjectTasks!=='undefined'&&Array.isArray(serverProjectTasks)?serverProjectTasks:[]}catch{return[]}}
function allTasks(){
  var list=[];
  taskList().forEach(function(task){list.push({key:String(task.id),source:'reminder',title:String(task.title||'Tâche'),state:effectiveState(task),task:task})});
  serverTasks().forEach(function(task){list.push({key:'project:'+String(task.id),source:'project',title:String(task.title||'Tâche chantier'),state:task.status==='done'?'done':task.status==='blocked'?'problem':'todo',task:task})});
  return list;
}
function taskByKey(key){return allTasks().find(function(item){return item.key===String(key)})||null}
function countFor(folderId){return allTasks().filter(function(item){return folderOf(item.key)===folderId}).length}
function totalForView(){return allTasks().length}
function activeFilter(){return filter}
function chip(label,value,count,before,after){
  var active=filter===value?' is-active':'';
  return '<div class="task-folder-chip'+active+'" data-task-folder-chip="'+escapeAttr(value)+'">'+
    (before||'')+
    '<button type="button" class="task-folder-select" onclick="taskBoardFilter(\''+escapeJs(value)+'\')" '+(filter===value?'aria-current="true"':'')+'>'+
      '<span>'+escapeHtml(label)+'</span><b>'+count+'</b>'+
    '</button>'+
    (after||'')+
  '</div>';
}
function folderChip(folder){
  var grip='<span class="task-folder-grip" draggable="true" data-task-folder-drag="'+escapeAttr(folder.id)+'" role="button" tabindex="0" aria-label="Déplacer le dossier '+escapeAttr(folder.name)+'" title="Glisser pour déplacer">⠿</span>';
  var menu='<button type="button" class="task-folder-menu" onclick="taskFolderMenu(\''+escapeJs(folder.id)+'\')" aria-label="Options du dossier '+escapeAttr(folder.name)+'">⋯</button>';
  return chip(folder.name,folder.id,countFor(folder.id),grip,menu);
}
function barMarkup(){
  var undo=state.undo?'<div class="task-board-undo" role="status"><span>'+escapeHtml(state.undo.label||undoMessage||'Dossier mis à jour.')+'</span><button type="button" class="link" onclick="taskBoardUndoMove()">Annuler</button></div>':'';
  var error=state.error?'<p class="task-board-error" role="status">'+escapeHtml(state.error)+'</p>':'';
  var list='';
  list+=chip('Toutes','all',totalForView());
  list+=chip('Sans dossier','__inbox__',countFor(''));
  state.folders.forEach(function(folder){list+=folderChip(folder)});
  list+='<button type="button" class="btn task-folder-add" onclick="taskBoardFolderForm()">+ Dossier</button>';
  return '<section class="task-folders-bar" data-task-folders-bar aria-label="Dossiers de tâches">'+
    '<div class="task-folders-head"><div><p class="eyebrow">DOSSIERS DE TÂCHES</p><strong>Rangez vos tâches</strong><span>Déposez une tâche sur un dossier, ou utilisez le bouton Déplacer de chaque ligne.</span><span class="task-folders-mobile-hint">Touchez ⇢ sur une tâche pour la ranger.</span></div><button type="button" class="link" onclick="taskBoardClearFilter()">Tout afficher</button></div>'+
    '<div class="task-folders-list">'+list+'</div>'+undo+error+
  '</section>';
}
function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]})}
function escapeAttr(value){return escapeHtml(value)}
function escapeJs(value){return String(value==null?'':value).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}

function refreshBar(){
  var host=document.querySelector('[data-task-folders-bar]');
  if(host)host.outerHTML=barMarkup();
  enhanceRows();
}
function currentKey(){
  try{return String(typeof activeSocleOrganizationId!=='undefined'?activeSocleOrganizationId:'')+'/'+String(globalThis.socleCurrentAccess?.userId||'')}
  catch{return''}
}
function ensureLoaded(){
  var key=currentKey();
  if(key!==state.key){
    state.key=key;state.status='idle';state.folders=DEFAULT_FOLDERS.map(function(folder){return{id:folder.id,name:folder.name}});state.assignments={};state.undo=null;
  }
  if(state.status!=='idle')return;
  state.status='loading';
  if(typeof serverJson!=='function'){state.status='error';state.error='Dossiers non chargés : serveur indisponible.';refreshBar();return}
  var requestedKey=key;
  serverJson(ENDPOINT).then(function(data){
    if(currentKey()!==requestedKey)return;
    var preference=data&&data.preference,raw=preference&&preference.value;
    if(raw&&typeof raw==='object'&&Array.isArray(raw.folders)){
      var parsed=normalized(raw);state.folders=parsed.folders;state.assignments=parsed.assignments;
    }else{
      state.folders=DEFAULT_FOLDERS.map(function(folder){return{id:folder.id,name:folder.name}});
      state.assignments={};
    }
    state.status='ready';state.error='';refreshBar();
  }).catch(function(error){
    state.status='error';state.error='Dossiers non chargés : '+String(error&&error.message||'serveur indisponible')+'.';
    refreshBar();
  });
}
function persist(previous,label,options){
  options=options||{};
  var current=++revision;
  var payload={schemaVersion:1,value:value()};
  if(typeof serverJson!=='function'){restore(previous);refreshBar();toast('Dossiers non enregistrés : serveur indisponible.');return Promise.resolve(false)}
  return serverJson(ENDPOINT,{method:'PUT',body:JSON.stringify(payload)}).then(function(){
    if(current!==revision)return true;
    state.error='';
    if(options.undo!==false){
      state.undo={folders:cloneFolders(previous.folders),assignments:Object.assign({},previous.assignments),label:label,at:Date.now()};
      undoMessage=label;
      clearTimeout(undoTimer);
      undoTimer=setTimeout(function(){if(state.undo&&Date.now()-state.undo.at>=8000){state.undo=null;refreshBar()}},8200);
    }
    if(options.refresh!==false)refreshBar();
    return true;
  }).catch(function(error){
    if(current===revision){restore(previous);state.error='';refreshBar();toast(error&&error.message||'Déplacement refusé. Rien n’a changé.')}
    return false;
  });
}

function setupRow(row,key,title,textHost,folderHost,asTable){
  var handle=row.querySelector('.task-drag-handle');
  if(!handle){
    handle=document.createElement('span');
    handle.className='task-drag-handle';
    handle.draggable=true;
    handle.dataset.taskDrag=key;
    handle.setAttribute('role','button');
    handle.tabIndex=0;
    handle.setAttribute('aria-label','Déplacer '+title+' vers un dossier');
    handle.title='Glisser vers un dossier';
    handle.textContent='⠿';
    if(asTable){var cell=row.querySelector('.task-drag-cell');if(cell)cell.append(handle)}
    else row.insertBefore(handle,row.children[1]||null);
  }
  var folderId=folderOf(key),tag=null;
  if(textHost){
    tag=textHost.querySelector('.task-folder-tag');
    if(folderId){
      if(!tag){tag=document.createElement('span');tag.className='task-folder-tag';textHost.append(tag)}
      tag.textContent='📁 '+folderName(folderId);
    }else if(tag){tag.remove()}
  }else if(folderHost){
    folderHost.replaceChildren();
    if(folderId){tag=document.createElement('span');tag.className='task-folder-tag';tag.textContent='📁 '+folderName(folderId);folderHost.append(tag)}
  }
  var move=row.querySelector('.task-move');
  if(!move){
    move=document.createElement('button');
    move.type='button';move.className='btn task-move';
    move.setAttribute('aria-label','Déplacer '+title+' vers un dossier');
    move.title='Déplacer vers un dossier';
    move.innerHTML='<span class="task-move-label">Déplacer</span><span class="task-move-icon" aria-hidden="true">⇢</span>';
    move.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();taskBoardMoveDialog(key)});
    if(asTable&&folderHost)folderHost.append(move);else row.append(move);
  }else if(asTable&&folderHost&&move.parentElement!==folderHost)folderHost.append(move);
  row.hidden=filter!=='all'&&(filter==='__inbox__'?folderOf(key)!=='':folderOf(key)!==filter);
}
function enhanceRows(){
  var rows=document.querySelectorAll('.batch-task[data-task-id]');
  Array.prototype.forEach.call(rows,function(row){
    var key=String(row.dataset.taskId||'');
    var text=row.querySelector('.task-text');
    var title=text&&text.querySelector('strong')?text.querySelector('strong').textContent:'tâche';
    setupRow(row,key,title,text,null,false);
  });
  var serverRows=document.querySelectorAll('tr[data-task-source="project"][data-task-id]');
  Array.prototype.forEach.call(serverRows,function(row){
    var key='project:'+String(row.dataset.taskId||'');
    var strong=row.querySelector('strong');
    setupRow(row,key,strong?strong.textContent:'tâche chantier',null,row.querySelector('.task-folder-cell'),true);
  });
  applyFilterLabel(rows,serverRows);
}
function applyFilterLabel(rows,serverRows){
  var list=rows?Array.prototype.slice.call(rows).concat(Array.prototype.slice.call(serverRows||[])):document.querySelectorAll('.batch-task[data-task-id],tr[data-task-source="project"][data-task-id]');
  var visible=0;Array.prototype.forEach.call(list,function(row){if(!row.hidden)visible++});
  var subtle=document.querySelector('#main .section-heading .subtle');
  if(subtle&&/(tâche|élément)\(s\)/.test(subtle.textContent||'')){
    var label=filter==='all'?'cette vue':filter==='__inbox__'?'Sans dossier':folderName(filter)||'ce dossier';
    subtle.textContent=visible+' élément(s) dans '+label;
  }
  var panel=document.querySelector('.task-batch-list');
  if(!panel)return;
  var empty=panel.querySelector('.task-board-filter-empty');
  var batchRows=document.querySelectorAll('.batch-task[data-task-id]');
  var listEmpty=!batchRows.length;
  if(!empty){empty=document.createElement('div');empty.className='empty task-board-filter-empty';empty.hidden=true;panel.append(empty)}
  empty.textContent='Aucune tâche dans ce dossier pour cette vue.';
  empty.hidden=listEmpty||visible>0;
}

globalThis.taskBoardFilter=function(id){
  filter=String(id||'all');
  if(filter!=='all'&&filter!=='__inbox__'&&!folderById(filter))filter='all';
  refreshBar();
};
globalThis.taskBoardSnapshot=function(){
  return {folders:cloneFolders(state.folders),assignments:Object.assign({},state.assignments),tasks:allTasks().map(function(item){return{key:item.key,title:item.title,state:item.state}})};
};
globalThis.taskBoardClearFilter=function(){filter='all';refreshBar()};
globalThis.taskBoardFolderForm=function(id){
  var folder=id?folderById(id):null;
  if(typeof modal!=='function')return;
  modal(folder?'Renommer le dossier':'Nouveau dossier','<form onsubmit="taskBoardSaveFolder(event,\''+escapeJs(folder?folder.id:'')+'\')"><label>Nom du dossier<input name="name" required maxlength="60" value="'+escapeAttr(folder?folder.name:'')+'" placeholder="Ex. Administratif"></label><p class="help-line">Les tâches restent dans leur état actuel ; seul leur dossier change.</p><div class="modal-actions"><button type="button" class="btn" onclick="closeModal()">Annuler</button><button class="btn primary">'+(folder?'Renommer':'Créer le dossier')+'</button></div></form>');
};
globalThis.taskBoardSaveFolder=function(event,id){
  event.preventDefault();
  var form=event.target,name=String(new FormData(form).get('name')||'').trim().slice(0,60);
  if(!name)return;
  var previous=snapshot();
  if(id){
    var folder=folderById(id);if(!folder)return;
    folder.name=name;
    if(typeof closeModal==='function')closeModal();
    persist(previous,'Dossier renommé.');
  }else{
    if(state.folders.length>=20){toast('Vingt dossiers suffisent pour cette vue.');return}
    state.folders.push({id:'task-folder-'+crypto.randomUUID(),name:name});
    if(typeof closeModal==='function')closeModal();
    persist(previous,'Dossier créé.');
  }
};
globalThis.taskFolderMenu=function(id){
  var folder=folderById(id);if(!folder||typeof modal!=='function')return;
  modal('Dossier · '+folder.name,'<div class="task-folder-menu-list"><button class="btn" type="button" onclick="closeModal();taskBoardFolderForm(\''+escapeJs(folder.id)+'\')">Renommer</button><button class="btn" type="button" onclick="taskBoardMoveFolder(\''+escapeJs(folder.id)+'\',-1)">Déplacer à gauche</button><button class="btn" type="button" onclick="taskBoardMoveFolder(\''+escapeJs(folder.id)+'\',1)">Déplacer à droite</button><button class="btn" type="button" onclick="taskBoardDeleteFolder(\''+escapeJs(folder.id)+'\')">Supprimer le dossier</button></div><p class="help-line">Supprimer un dossier replace ses tâches dans « Sans dossier ».</p><div class="modal-actions"><button class="btn" type="button" onclick="closeModal()">Fermer</button></div>');
};
globalThis.taskBoardMoveFolder=function(id,delta){
  var index=state.folders.findIndex(function(folder){return folder.id===id});if(index<0)return;
  var target=index+Number(delta||0);if(target<0||target>=state.folders.length)return;
  var previous=snapshot(),moved=state.folders.splice(index,1)[0];state.folders.splice(target,0,moved);
  if(typeof closeModal==='function')closeModal();
  persist(previous,'Dossier déplacé.');
};
globalThis.taskBoardReorderFolder=function(id,targetId){
  var from=state.folders.findIndex(function(folder){return folder.id===id});if(from<0)return;
  var previous=snapshot();
  var moved=state.folders.splice(from,1)[0];
  var to=targetId?state.folders.findIndex(function(folder){return folder.id===targetId}):state.folders.length;
  if(to<0)to=state.folders.length;
  state.folders.splice(to,0,moved);
  persist(previous,'Dossier déplacé.');
};
globalThis.taskBoardDeleteFolder=function(id){
  var folder=folderById(id);if(!folder)return;
  modal('Supprimer le dossier','<p>Supprimer <strong>'+escapeHtml(folder.name)+'</strong> ? Ses tâches reviendront dans « Sans dossier ».</p><div class="modal-actions"><button class="btn" type="button" onclick="closeModal()">Annuler</button><button class="btn primary" type="button" onclick="taskBoardConfirmDeleteFolder(\''+escapeJs(id)+'\')">Supprimer</button></div>');
};
globalThis.taskBoardConfirmDeleteFolder=function(id){
  var folder=folderById(id);if(!folder)return;
  var previous=snapshot();
  state.folders=state.folders.filter(function(item){return item.id!==id});
  Object.keys(state.assignments).forEach(function(taskId){if(state.assignments[taskId]===id)delete state.assignments[taskId]});
  if(filter===id)filter='all';
  if(typeof closeModal==='function')closeModal();
  persist(previous,'Dossier supprimé.');
};
globalThis.taskBoardAssign=function(taskId,folderId){
  var id=String(taskId),target=String(folderId||'');
  if(target&&!folderById(target))return;
  var previous=snapshot();
  if(target)state.assignments[id]=target;else delete state.assignments[id];
  refreshBar();
  persist(previous,target?'Tâche rangée dans '+folderName(target)+'.':'Tâche remise dans Sans dossier.');
};
globalThis.taskBoardMoveDialog=function(taskId){
  var task=taskByKey(taskId);if(!task)return;
  var current=folderOf(task.key);
  var choices='<button class="btn'+(current===''?' primary':'')+'" type="button" onclick="closeModal();taskBoardAssign(\''+escapeJs(String(taskId))+'\',\'\')">Sans dossier</button>';
  state.folders.forEach(function(folder){
    choices+='<button class="btn'+(current===folder.id?' primary':'')+'" type="button" onclick="closeModal();taskBoardAssign(\''+escapeJs(String(taskId))+'\',\''+escapeJs(folder.id)+'\')">'+escapeHtml(folder.name)+'</button>';
  });
  modal('Déplacer · '+task.title,'<p class="help-line">Choisissez le dossier de destination. La tâche garde son état et sa date.</p><div class="task-board-move-list">'+choices+'</div><div class="modal-actions"><button class="btn" type="button" onclick="closeModal()">Annuler</button></div>');
};
globalThis.taskBoardUndoMove=function(){
  var undo=state.undo;if(!undo)return;
  state.undo=null;clearTimeout(undoTimer);
  var previous=snapshot();restore(undo);refreshBar();
  persist(previous,'Déplacement annulé.',{undo:false});
};

function dragCleanup(){
  Array.prototype.forEach.call(document.querySelectorAll('.is-dragging,.is-drop-target'),function(node){node.classList.remove('is-dragging','is-drop-target')});
  drag=null;
}
document.addEventListener('dragstart',function(event){
  var handle=event.target.closest&&event.target.closest('[data-task-drag]');
  if(handle){var row=handle.closest('.batch-task[data-task-id]');drag={type:'task',id:String(handle.dataset.taskDrag)};if(row)row.classList.add('is-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';try{event.dataTransfer.setData('text/plain','task:'+drag.id)}catch{}}return}
  var grip=event.target.closest&&event.target.closest('[data-task-folder-drag]');
  if(grip){drag={type:'folder',id:String(grip.dataset.taskFolderDrag)};var host=grip.closest('.task-folder-chip');if(host)host.classList.add('is-dragging');if(event.dataTransfer){event.dataTransfer.effectAllowed='move';try{event.dataTransfer.setData('text/plain','folder:'+drag.id)}catch{}}}
});
document.addEventListener('dragend',dragCleanup);
document.addEventListener('keydown',function(event){
  var taskHandle=event.target.closest&&event.target.closest('[data-task-drag]');
  if(taskHandle&&(event.key==='Enter'||event.key===' ')){event.preventDefault();taskBoardMoveDialog(taskHandle.dataset.taskDrag);return}
  var grip=event.target.closest&&event.target.closest('[data-task-folder-drag]');
  if(!grip)return;
  var id=String(grip.dataset.taskFolderDrag);
  if(event.key==='Enter'||event.key===' '){event.preventDefault();taskFolderMenu(id);return}
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();
  if(event.key==='Home'||event.key==='End'){
    var index=state.folders.findIndex(function(folder){return folder.id===id});
    if(index<0)return;
    var previous=snapshot(),moved=state.folders.splice(index,1)[0];
    state.folders.splice(event.key==='Home'?0:state.folders.length,0,moved);
    persist(previous,'Dossier déplacé.');
    return;
  }
  taskBoardMoveFolder(id,event.key==='ArrowLeft'?-1:1);
});
document.addEventListener('dragover',function(event){
  if(!drag)return;
  var chip=event.target.closest&&event.target.closest('[data-task-folder-chip]');
  if(!chip)return;
  if(drag.type==='folder'&&(chip.dataset.taskFolderChip===drag.id||chip.dataset.taskFolderChip==='all'))return;
  event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  Array.prototype.forEach.call(document.querySelectorAll('.is-drop-target'),function(node){node.classList.remove('is-drop-target')});
  chip.classList.add('is-drop-target');
});
document.addEventListener('dragleave',function(event){
  var chip=event.target.closest&&event.target.closest('[data-task-folder-chip]');
  if(chip&&!chip.contains(event.relatedTarget))chip.classList.remove('is-drop-target');
});
document.addEventListener('drop',function(event){
  if(!drag)return;
  var chip=event.target.closest&&event.target.closest('[data-task-folder-chip]');
  if(!chip)return;
  event.preventDefault();
  var target=chip.dataset.taskFolderChip||'';
  if(drag.type==='task'&&target!=='all')taskBoardAssign(drag.id,target==='__inbox__'?'':target);
  if(drag.type==='folder'&&target!=='all'&&target!==drag.id)taskBoardReorderFolder(drag.id,target==='__inbox__'?'':target);
  dragCleanup();
});

var actionsBeforeTaskBoard=typeof actions==='function'?actions:null;
if(actionsBeforeTaskBoard){
  actions=function(){
    var html=actionsBeforeTaskBoard.apply(this,arguments);
    if(String(html).indexOf('data-task-folders-bar')>=0)return html;
    var marker='<div class="section-heading">';
    var at=String(html).indexOf(marker);
    if(at<0)return html;
    var result=String(html).slice(0,at)+barMarkup()+String(html).slice(at);
    queueMicrotask(function(){ensureLoaded();enhanceRows()});
    return result;
  };
}
var previousRenderForTaskBoard=globalThis.render;
globalThis.render=function(){
  var result=previousRenderForTaskBoard?previousRenderForTaskBoard.apply(this,arguments):undefined;
  if(typeof view!=='undefined'&&view==='actions'){enhanceRows();ensureLoaded()}
  return result;
};
})();

(function () {
  var taskMenu = null;
  function closeTaskMenu() { if (taskMenu) { taskMenu.remove(); taskMenu = null; } }
  function taskItem(label, action) { var button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitem'); button.textContent = label; button.dataset.taskContextAction = action; return button; }
  function openTaskMenu(row, x, y) {
    closeTaskMenu();
    var source = row.dataset.taskSource === 'project' ? 'project' : 'reminder';
    var taskId = String(row.dataset.taskId || '');
    if (!taskId) return;
    var title = row.querySelector('strong') ? row.querySelector('strong').textContent : 'Tâche';
    var menu = document.createElement('div');
    menu.className = 'ia-job-context ia-task-context';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Actions de la tâche');
    var head = document.createElement('div');
    head.className = 'ia-job-context-title';
    head.textContent = title;
    var meta = document.createElement('small');
    meta.textContent = source === 'project' ? 'Tâche chantier' : 'Tâche / alerte';
    head.append(meta);
    menu.append(head, taskItem('Ouvrir', 'open'), taskItem('Déplacer vers un dossier…', 'move'), taskItem(source === 'project' ? 'Marquer terminée' : 'Marquer traitée', 'done'), taskItem('Copier le titre', 'copy'));
    menu.style.visibility = 'hidden';
    document.body.append(menu);
    menu.style.left = Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8)) + 'px';
    menu.style.visibility = 'visible';
    taskMenu = menu;
    menu.addEventListener('click', function (event) {
      var button = event.target.closest('[data-task-context-action]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      var action = button.dataset.taskContextAction;
      closeTaskMenu();
      if (action === 'open') {
        if (source === 'reminder' && typeof showReminder === 'function') showReminder(taskId);
        if (source === 'project' && typeof openTaskComments === 'function') openTaskComments(taskId);
      }
      if (action === 'move' && typeof taskBoardMoveDialog === 'function') taskBoardMoveDialog(source === 'project' ? 'project:' + taskId : taskId);
      if (action === 'done') {
        if (source === 'reminder' && typeof changeReminder === 'function') changeReminder(taskId, 'done');
        if (source === 'project' && typeof updateServerTask === 'function') updateServerTask(taskId, 'done');
      }
      if (action === 'copy') {
        var value = String(title);
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(value).then(function () { if (typeof toast === 'function') toast('Titre copié.'); }).catch(function () {});
      }
    });
  }
  document.addEventListener('contextmenu', function (event) {
    if (window.matchMedia && window.matchMedia('(pointer:coarse)').matches) return;
    var row = event.target.closest ? event.target.closest('#main .batch-task[data-task-id],#main tr[data-task-source="project"][data-task-id]') : null;
    if (!row) return;
    event.preventDefault();
    openTaskMenu(row, event.clientX, event.clientY);
  });
  document.addEventListener('pointerdown', function (event) { if (taskMenu && !taskMenu.contains(event.target)) closeTaskMenu(); }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeTaskMenu();
    if ((event.key === 'F10' && event.shiftKey) || event.key === 'ContextMenu') {
      var row = event.target.closest ? event.target.closest('#main .batch-task[data-task-id],#main tr[data-task-source="project"][data-task-id]') : null;
      if (!row) return;
      event.preventDefault();
      var box = row.getBoundingClientRect();
      openTaskMenu(row, box.left + 40, box.top + 20);
    }
  });
  window.addEventListener('scroll', closeTaskMenu, true);
})();
