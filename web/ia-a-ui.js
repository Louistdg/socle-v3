(function(){
'use strict';

var IA_A_SUMMARY_LIMIT=5;
var IA_A_ROLE_LABELS={OWNER:'Direction',TEAM_LEAD:'Chef d’équipe',WORKER:'Ouvrier',ACCOUNTING:'Comptabilité'};

var IA_A_THEME_KEY='socle.theme';
var IA_A_THEMES=[
  {id:'olive',label:'Olive',swatches:['#202c26','#a2b784','#47554c']},
  {id:'forest',label:'Forêt',swatches:['#edf3ed','#557d5d','#d5e4d9']},
  {id:'slate',label:'Ardoise',swatches:['#172832','#8da8b5','#43545c']},
  {id:'night',label:'Bleu nuit',swatches:['#151e2c','#819bd1','#394964']},
  {id:'graphite',label:'Graphite',swatches:['#1c1e20','#acb6b6','#44494b']},
  {id:'earth',label:'Terre',swatches:['#f2ece5','#a16f4e','#e4d5c4']},
  {id:'moss',label:'Mousse',swatches:['#2a311d','#9bab68','#535f3e']},
  {id:'aubergine',label:'Aubergine',swatches:['#281b2b','#b99aba','#55445a']},
  {id:'high-contrast',label:'Contraste',swatches:['#ffffff','#344f18','#dde2d8']},
  {id:'chalk',label:'Craie',swatches:['#e1e8e5','#587c72','#ffffff']}
];
function iaAThemeId(){
  var stored='';try{stored=localStorage.getItem(IA_A_THEME_KEY)||''}catch{}
  return IA_A_THEMES.some(function(theme){return theme.id===stored})?stored:'moss';
}
function iaAApplyTheme(id,persist){
  var theme=IA_A_THEMES.find(function(item){return item.id===id})||IA_A_THEMES[0];
  document.body.dataset.socleTheme=theme.id;
  if(persist!==false){try{localStorage.setItem(IA_A_THEME_KEY,theme.id)}catch{}}
  var button=document.querySelector('#socleThemeButton');
  if(button)button.title='Thème : '+theme.label;
  document.querySelectorAll('#socleThemeMenu [data-theme]').forEach(function(choice){
    var active=choice.dataset.theme===theme.id;
    choice.classList.toggle('selected',active);
    choice.setAttribute('aria-checked',active?'true':'false');
  });
  return theme.id;
}
function iaARenderThemeMenu(){
  var menu=document.querySelector('#socleThemeMenu');
  if(!menu)return;
  menu.replaceChildren();
  IA_A_THEMES.forEach(function(theme){
    var choice=document.createElement('button');
    choice.type='button';choice.className='theme-choice';choice.dataset.theme=theme.id;choice.setAttribute('role','menuitemradio');
    var dots=document.createElement('span');dots.className='theme-swatches';dots.setAttribute('aria-hidden','true');
    theme.swatches.forEach(function(color){var dot=document.createElement('i');dot.style.background=color;dots.appendChild(dot)});
    var label=document.createElement('span');label.textContent=theme.label;
    choice.append(dots,label);
    choice.addEventListener('click',function(){iaAApplyTheme(theme.id,true);menu.hidden=true;var trigger=document.querySelector('#socleThemeButton');if(trigger){trigger.setAttribute('aria-expanded','false');trigger.focus()}});
    menu.appendChild(choice);
  });
  iaAApplyTheme(iaAThemeId(),false);
}
function iaAToggleThemeMenu(){
  var menu=document.querySelector('#socleThemeMenu'),button=document.querySelector('#socleThemeButton');if(!menu||!button)return;
  menu.hidden=!menu.hidden;button.setAttribute('aria-expanded',menu.hidden?'false':'true');
}
function iaAInitThemePicker(){
  var button=document.querySelector('#socleThemeButton'),menu=document.querySelector('#socleThemeMenu');if(!button||!menu)return;
  iaARenderThemeMenu();
  button.addEventListener('click',function(event){event.stopPropagation();iaAToggleThemeMenu()});
  document.addEventListener('click',function(event){if(!menu.hidden&&!event.target.closest('.socle-theme-picker')){menu.hidden=true;button.setAttribute('aria-expanded','false')}});
  document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!menu.hidden){menu.hidden=true;button.setAttribute('aria-expanded','false');button.focus()}});
}


function iaAEscape(value){
  if(typeof esc==='function')return esc(String(value==null?'':value));
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]});
}
function iaASafeArray(value){return Array.isArray(value)?value:[]}
function iaASliceSummary(items,max){
  var source=iaASafeArray(items),limit=Number.isFinite(max)&&max>=0?max:IA_A_SUMMARY_LIMIT;
  return{visible:source.slice(0,limit),hiddenCount:Math.max(0,source.length-limit),total:source.length,hasMore:source.length>limit};
}
function iaAActualAccess(){
  var access=globalThis.socleAuthenticatedAccess||globalThis.socleCurrentAccess;
  return access&&access.userId?access:null;
}
function iaAProfileRole(profile,serverRole){
  var role=String(serverRole||'');
  return ['OWNER','TEAM_LEAD','WORKER','ACCOUNTING'].indexOf(role)>=0?role:'PENDING';
}
function iaAPreviewRequested(){
  if(globalThis.socleAccessPreview)return true;
  var actual=iaAActualAccess();
  return Boolean(actual&&actual.roleCode==='OWNER'&&typeof sessionAccessKey==='string'&&sessionAccessKey!=='owner'&&sessionAccessKey!=='pending');
}
function iaAPreviewMember(){
  if(!iaAPreviewRequested()||typeof accessMembers!=='function')return null;
  return accessMembers().find(function(member){
    var role=String(member.serverRoleCode||'');
    return member.key===sessionAccessKey&&!member.owner&&member.serverUserId&&['TEAM_LEAD','WORKER','ACCOUNTING'].indexOf(role)>=0&&(!['TEAM_LEAD','WORKER'].includes(role)||member.id!=null);
  })||null;
}
function iaACurrentAccess(){
  var actual=iaAActualAccess();
  if(!actual)return null;
  if(!iaAPreviewRequested())return actual;
  var member=iaAPreviewMember();
  if(!member)return null;
  var assignment=typeof sessionAssignment==='function'?sessionAssignment():null;
  return{userId:String(member.serverUserId),personId:member.id==null?null:String(member.id),name:member.name||'',roleCode:iaAProfileRole(assignment&&assignment.profile,member.serverRoleCode),owner:false,scope:assignment&&assignment.scope||'',preview:true,actorUserId:String(actual.userId),organizationId:String(globalThis.socleCurrentOrganizationId||'')};
}
function iaACurrentPersonId(){
  var access=iaACurrentAccess();
  return access&&access.personId!=null?String(access.personId):'';
}
function iaARoleCode(){
  var access=iaACurrentAccess();
  if(!access)return'PENDING';
  if(['OWNER','TEAM_LEAD','WORKER','ACCOUNTING'].indexOf(access.roleCode)>=0)return access.roleCode;
  return access.owner===true?'OWNER':'PENDING';
}

var iaAHomeScopeState={key:'',status:'idle',data:null,error:''};
function iaAHomeWeekBounds(){
  var anchor=String(typeof reference!=='undefined'&&reference||typeof day!=='undefined'&&day||new Date().toISOString().slice(0,10)),start=new Date(anchor+'T12:00:00');
  if(Number.isNaN(start.getTime()))start=new Date();
  start.setDate(start.getDate()-((start.getDay()+6)%7));
  var end=new Date(start);end.setDate(start.getDate()+4);
  return{from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)};
}
function iaAHomeScopeKey(){
  var access=iaACurrentAccess()||{},bounds=iaAHomeWeekBounds();
  return[String(globalThis.socleCurrentOrganizationId||''),String(access.userId||''),String(access.personId||''),String(access.roleCode||''),bounds.from,bounds.to].join(':');
}
function iaAHomeViewAsUserId(){
  var actual=iaAActualAccess(),effective=iaACurrentAccess();
  return actual&&actual.roleCode==='OWNER'&&effective&&String(effective.userId)!==String(actual.userId)?String(effective.userId):'';
}
function iaAEnsureHomeScope(force){
  var role=iaARoleCode();
  if(role==='OWNER'||role==='ACCOUNTING'||typeof serverJson!=='function')return;
  var key=iaAHomeScopeKey(),state=iaAHomeScopeState;
  if(state.key!==key)iaAHomeScopeState={key:key,status:'idle',data:null,error:''};
  state=iaAHomeScopeState;
  if(!force&&state.status!=='idle')return;
  var bounds=iaAHomeWeekBounds(),viewAs=iaAHomeViewAsUserId(),query='from='+encodeURIComponent(bounds.from)+'&to='+encodeURIComponent(bounds.to)+(viewAs?'&view_as_user_id='+encodeURIComponent(viewAs):'');
  state.status='loading';state.error='';
  serverJson('/api/home-overview?'+query).then(function(data){
    if(iaAHomeScopeState.key!==key)return;
    var effective=iaACurrentAccess();
    if(!data||!data.access||!effective||String(data.access.userId)!==String(effective.userId))throw Error('Le serveur n’a pas confirmé l’identité effective de cet accueil.');
    iaAHomeScopeState.data=data;iaAHomeScopeState.status='ready';
  }).catch(function(error){
    if(iaAHomeScopeState.key!==key)return;
    iaAHomeScopeState.data=null;iaAHomeScopeState.status='error';iaAHomeScopeState.error=error&&error.message||'Accueil personnel indisponible.';
  }).finally(function(){if(iaAHomeScopeState.key===key&&typeof view!=='undefined'&&view==='home'&&typeof render==='function')render()});
}
function iaALocalHomeScopeData(){
  if(typeof serverJson==='function')return null;
  var access=iaACurrentAccess(),personId=iaACurrentPersonId();
  if(!access||!personId)return null;
  var currentAssignments=typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments.filter(function(item){return iaASafeArray(item.people).map(String).includes(String(personId))}):[];
  var projectIds=new Set(currentAssignments.map(function(item){return String(item.job)}));
  var projects=typeof jobs!=='undefined'&&Array.isArray(jobs)?jobs.filter(function(job){return projectIds.has(String(job.id))}).map(function(job){return{id:String(job.id),reference:String(job.reference||job.ref||''),name:String(job.name||''),town:String(job.town||''),phase:String(job.phase||job.status||'')}}):[];
  var obligations=[],person=iaACurrentPerson();
  if(typeof reminders!=='undefined'&&Array.isArray(reminders))reminders.filter(function(item){if(String(item.state||'todo')==='done')return false;var recipients=iaASafeArray(item.recipientIds).map(String);return(String(item.linkType||'')==='person'&&String(item.linkId||'')===String(personId))||recipients.includes(String(personId))}).forEach(function(item){obligations.push({id:String(item.id||''),title:String(item.title||'Action à traiter'),date:String(item.date||''),kind:String(item.kind||'Action'),state:String(item.state||'todo'),source:'reminder'})});
  iaASafeArray(person&&person.training).forEach(function(training,index){var label=typeof training==='object'?String(training.name||training.label||'Formation'):String(training);if(label)obligations.push({id:'training:'+personId+':'+index,title:'Formation · '+label,date:'',kind:'Formation',state:'todo',source:'training'})});
  return{access:access,preview:Boolean(access.preview),from:iaAHomeWeekBounds().from,to:iaAHomeWeekBounds().to,tasks:[],assignments:currentAssignments.map(function(item){return{id:String(item.id||''),date:String(item.date||''),teamId:item.team==null?null:String(item.team),projectId:String(item.job||''),people:iaASafeArray(item.people).map(String),startTime:item.startTime||'07:00',endTime:item.endTime||'16:00',status:item.status||'planned',reason:item.reason||''}}),absences:[],obligations:obligations,messages:[],projects:projects,widgetScopes:{tasks:'person',week:'person',obligations:'person',messages:'authorized',quickActions:'rbac'}};
}
function iaAHomeScopeData(){
  var local=iaALocalHomeScopeData();if(local)return local;
  var key=iaAHomeScopeKey();
  if(iaAHomeScopeState.key!==key||iaAHomeScopeState.status==='idle')iaAEnsureHomeScope(false);
  return iaAHomeScopeState.key===key&&iaAHomeScopeState.status==='ready'?iaAHomeScopeState.data:null;
}
function iaAHomeProject(data,id){
  return iaASafeArray(data&&data.projects).find(function(project){return String(project.id)===String(id)})||null;
}
function iaAHomeTodayAssignments(data){
  var current=String(typeof day!=='undefined'&&day||typeof reference!=='undefined'&&reference||'');
  return iaASafeArray(data&&data.assignments).filter(function(item){return String(item.date||'')===current&&String(item.status||'')!=='cancelled'});
}
function iaAHomeTaskItems(data){
  var items=iaASafeArray(data&&data.tasks).map(function(task){var project=iaAHomeProject(data,task.projectId);return{label:task.title||'Tâche',meta:[project&&project.name,task.dueAt].filter(Boolean).join(' · '),badge:task.priority==='urgent'?'Urgente':task.status==='in_progress'?'En cours':'À traiter',badgeClass:task.priority==='urgent'?'warn':'',action:iaAModuleVisible('actions')?'navigate(\'actions\')':''}});
  iaASafeArray(data&&data.obligations).forEach(function(item){items.push({label:item.title||'Obligation',meta:item.date||'',badge:item.kind||'À traiter',badgeClass:item.state==='late'?'warn':'',action:item.source==='training'||item.source==='permit'?(iaAModuleVisible('personal')?'navigate(\'personal\')':''):''})});
  return items;
}
function iaAPersonalWeekView(data){
  var range=iaAOwnerWeekRange(),personId=iaACurrentPersonId(),assignments=iaASafeArray(data&&data.assignments).filter(function(item){var people=iaASafeArray(item.people).map(String);return String(item.status||'')!=='cancelled'&&(!personId||!people.length||people.includes(String(personId)))}),absences=iaASafeArray(data&&data.absences),obligations=iaASafeArray(data&&data.obligations);
  return '<section class="ia-owner-week ia-person-week" aria-label="Votre calendrier personnel du lundi au vendredi"><header><div><p class="eyebrow">CALENDRIER</p><h2>Votre semaine</h2></div>'+(iaAModuleVisible('planning')?'<button class="link" type="button" onclick="navigate(\'planning\')">Ouvrir Planning</button>':'')+'</header><div class="ia-owner-week-days">'+range.map(function(date,index){
    var events=[];
    assignments.filter(function(item){return String(item.date)===date}).forEach(function(item){var project=iaAHomeProject(data,item.projectId);events.push({kind:'Chantier',title:project&&project.name||'Affectation chantier'})});
    absences.filter(function(item){return String(item.startsAt||'').slice(0,10)<=date&&String(item.endsAt||'').slice(0,10)>=date}).forEach(function(item){events.push({kind:'Absence',title:item.type||'Absence'})});
    obligations.filter(function(item){return String(item.date||'')===date}).forEach(function(item){events.push({kind:item.kind||'Obligation',title:item.title||'À traiter'})});
    var dayDate=new Date(date+'T12:00:00');
    return '<article class="ia-owner-week-day" data-date="'+date+'"><h3><span>'+['Lun.','Mar.','Mer.','Jeu.','Ven.'][index]+'</span><time>'+dayDate.toLocaleDateString('fr-BE',{day:'numeric',month:'short'})+'</time></h3><ul>'+(events.length?events.slice(0,3).map(function(item){return'<li><small>'+iaAEscape(item.kind)+'</small><strong>'+iaAEscape(item.title)+'</strong></li>'}).join(''):'<li class="is-empty">Rien de prévu</li>')+'</ul></article>';
  }).join('')+'</div></section>';
}
function iaAHomeLoadState(role){
  iaAEnsureHomeScope(false);
  if((role==='TEAM_LEAD'||role==='WORKER')&&typeof iaAWorkerWeatherTowns==='function')iaAWorkerWeatherTowns();
  var portals=(role==='TEAM_LEAD'||role==='WORKER')?iaAPersonalPortalsForOverview(role):'';
  if(iaAHomeScopeState.status==='error')return iaARoleHeading(role,role==='TEAM_LEAD'?'Votre journée d’équipe':'Votre chantier du jour','Les informations affichées ici respectent votre identité effective.')+iaAState('error','Accueil personnel indisponible',iaAHomeScopeState.error,'Réessayer','iaAEnsureHomeScope(true)')+portals;
  return iaARoleHeading(role,role==='TEAM_LEAD'?'Votre journée d’équipe':'Votre chantier du jour','Les informations affichées ici respectent votre identité effective.')+iaAState('loading','Chargement de votre accueil','Tâches, planning et obligations sont filtrés côté serveur pour votre compte.')+portals;
}

function iaAMoney(value){
  var amount=Number(value||0);
  if(typeof money==='function')return money(amount);
  return new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(amount);
}
function iaAState(kind,title,detail,actionLabel,action){
  var safeKind=['loading','empty','error','forbidden','success','stale'].indexOf(kind)>=0?kind:'empty';
  var icon={loading:'…',empty:'○',error:'!',forbidden:'×',success:'✓',stale:'↻'}[safeKind];
  return '<div class="ia-state ia-state-'+safeKind+'" role="'+(safeKind==='error'?'alert':'status')+'"><span class="ia-state-icon" aria-hidden="true">'+icon+'</span><div><strong>'+iaAEscape(title||'Aucune donnée')+'</strong><p>'+iaAEscape(detail||'')+'</p></div>'+(actionLabel&&action?'<button class="btn" type="button" onclick="'+action+'">'+iaAEscape(actionLabel)+'</button>':'')+'</div>';
}
function iaASummaryItem(item){
  var action=item&&item.action?item.action:'';
  var tag=action?'button':'div';
  var actionAttr=action?' type="button" onclick="'+action+'"':'';
  return '<'+tag+' class="ia-summary-row"'+actionAttr+'><span class="ia-summary-copy"><strong>'+iaAEscape(item&&item.label||'')+'</strong><small>'+iaAEscape(item&&item.meta||'')+'</small></span>'+(item&&item.badge?'<span class="badge '+iaAEscape(item.badgeClass||'')+'">'+iaAEscape(item.badge)+'</span>':'')+(action?'<span class="ia-row-arrow" aria-hidden="true">→</span>':'')+'</'+tag+'>';
}
function iaASummaryList(options){
  var opts=options||{},slice=iaASliceSummary(opts.items||[]);
  var emptyAction=opts.emptyAction||opts.moreAction||'',emptyLabel=opts.emptyActionLabel||(emptyAction?'Voir la rubrique':'');
  var body=slice.visible.length?slice.visible.map(opts.renderItem||iaASummaryItem).join(''):iaAState('empty',opts.emptyTitle||'Rien à signaler',opts.emptyDetail||'Aucun élément à traiter pour l’instant. Les nouveaux éléments apparaîtront ici.',emptyLabel,emptyAction);
  var more=slice.hasMore&&opts.moreAction?'<button class="ia-show-more" type="button" onclick="'+opts.moreAction+'">Afficher les '+slice.hiddenCount+' autres</button>':'';
  return '<section class="panel ia-summary"><div class="panel-head ia-summary-head"><div><p class="eyebrow">'+iaAEscape(opts.eyebrow||'APERÇU')+'</p><h2>'+iaAEscape(opts.title||'')+' <span class="count">'+slice.total+'</span></h2></div>'+(opts.actionLabel&&opts.action?'<button class="btn" type="button" onclick="'+opts.action+'">'+iaAEscape(opts.actionLabel)+'</button>':'')+'</div><div class="ia-summary-list">'+body+'</div>'+more+'</section>';
}
function iaACollectionModel(items,options){
  var opts=options||{},list=iaASafeArray(items).slice(),needle=String(opts.query||'').trim().toLocaleLowerCase('fr-BE');
  if(needle)list=list.filter(function(item){return String((opts.searchText?opts.searchText(item):JSON.stringify(item))||'').toLocaleLowerCase('fr-BE').indexOf(needle)>=0});
  if(typeof opts.filter==='function')list=list.filter(opts.filter);
  if(typeof opts.sort==='function')list.sort(opts.sort);
  return list;
}
function iaAListShell(options){
  var opts=options||{},count=Number(opts.count||0);
  var emptyDetail=opts.emptyDetail||(opts.primaryLabel?'Aucun élément n’est encore enregistré ici. Utilisez « '+opts.primaryLabel+' » ci-dessus pour créer le premier.':'Aucun élément n’est encore enregistré ici. Les éléments apparaîtront après leur ajout.');
  return '<section class="ia-list-shell"><header class="ia-list-head"><div><p class="eyebrow">'+iaAEscape(opts.eyebrow||'LISTE COMPLÈTE')+'</p><h1>'+iaAEscape(opts.title||'')+' <span class="count">'+count+'</span></h1></div>'+(opts.primaryLabel&&opts.primaryAction?'<button class="btn primary" type="button" onclick="'+opts.primaryAction+'">'+iaAEscape(opts.primaryLabel)+'</button>':'')+'</header><div class="ia-list-toolbar">'+(opts.searchId?'<label class="ia-search"><span class="sr-only">Rechercher</span><input id="'+iaAEscape(opts.searchId)+'" type="search" placeholder="'+iaAEscape(opts.searchPlaceholder||'Rechercher…')+'"></label>':'')+(opts.filtersHtml||'')+(opts.sortHtml||'')+'</div><div class="ia-list-body">'+(opts.bodyHtml||iaAState('empty',opts.emptyTitle||'Aucun élément',emptyDetail))+'</div></section>';
}
function iaAOpenTasks(){
  var source=typeof reminders!=='undefined'&&Array.isArray(reminders)?reminders:(typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks:[]);
  return source.filter(function(item){return String(item.state||'todo')!=='done'}).sort(function(a,b){return String(a.date||'').localeCompare(String(b.date||''))});
}
var fieldReports=[];
function iaAFieldReportsPublish(entries){var map={avancement:'progress','problème':'issue',probleme:'issue',livraison:'delivery','sécurité':'safety',securite:'safety'};fieldReports=iaASafeArray(entries).map(function(entry){var category=String(entry.category||'').trim().toLocaleLowerCase('fr');return{id:String(entry.id||''),jobId:String(entry.projectId||''),jobName:String(entry.projectName||''),type:map[category]||'progress',text:String(entry.text||''),author:String(entry.author||''),createdAt:String(entry.createdAt||'')}}).filter(function(report){return report.jobId});}
var iaAOwnerAgendaState={key:'',status:'idle',messages:[],tasks:[],fieldJournal:[],events:[],messageError:'',taskError:''};
function iaAOwnerAgendaKey(){var access=iaACurrentAccess()||{};return String(globalThis.socleCurrentOrganizationId||'')+':'+String(access.userId||'')}
function iaAEnsureOwnerAgenda(){
  if(iaARoleCode()!=='OWNER'||typeof serverJson!=='function')return;
  var key=iaAOwnerAgendaKey();
  if(iaAOwnerAgendaState.key!==key)iaAOwnerAgendaState={key:key,status:'idle',messages:[],tasks:[],fieldJournal:[],events:[],messageError:'',taskError:''};
  if(iaAOwnerAgendaState.status!=='idle')return;
  iaAOwnerAgendaState.status='loading';
  var canMessages=iaAModuleVisible('messages'),canTasks=iaAModuleVisible('actions')||iaARoleCode()==='OWNER';
  Promise.allSettled([canMessages?serverJson('/api/conversations'):Promise.resolve({conversations:[]}),canTasks?serverJson('/api/tasks'):Promise.resolve({tasks:[]})]).then(function(results){
    if(iaAOwnerAgendaState.key!==key)return;
    if(results[0].status==='fulfilled')iaAOwnerAgendaState.messages=iaASafeArray(results[0].value&&results[0].value.conversations).slice(0,3);else iaAOwnerAgendaState.messageError='Messages indisponibles.';
    if(results[1].status==='fulfilled')iaAOwnerAgendaState.tasks=iaASafeArray(results[1].value&&results[1].value.tasks).filter(function(task){return String(task.status||'todo')!=='done'}).slice(0,4);else iaAOwnerAgendaState.taskError='Tâches indisponibles.';
    if(results[1].status==='fulfilled')iaAOwnerAgendaState.fieldJournal=iaASafeArray(results[1].value&&results[1].value.fieldJournal);iaAFieldReportsPublish(iaAOwnerAgendaState.fieldJournal);
    iaAOwnerAgendaState.status='ready';
    if(typeof view!=='undefined'&&view==='home'&&iaARoleCode()==='OWNER'&&typeof render==='function')render();
  });
}
function iaAOwnerWeekRange(){
  var anchor=String(typeof reference!=='undefined'&&reference||typeof day!=='undefined'&&day||new Date().toISOString().slice(0,10)),start=new Date(anchor+'T12:00:00');
  if(Number.isNaN(start.getTime()))start=new Date();start.setDate(start.getDate()-(start.getDay()+6)%7);
  return Array.from({length:5},function(_,index){var date=new Date(start);date.setDate(start.getDate()+index);return date.toISOString().slice(0,10)});
}
function iaAOwnerWeekEvents(date){
  var events=[];
  try{if(typeof sharedCalendarEvents==='function')events=iaASafeArray(sharedCalendarEvents()).filter(function(item){return String(item.date||'')===date}).map(function(item){return{title:item.title||'Événement',kind:item.type||'Calendrier'}})}catch{}
  var remindersForDate=typeof reminders!=='undefined'?iaASafeArray(reminders).filter(function(item){return String(item.date||'')===date&&item.state!=='done'&&/rendez|réunion|reunion|meeting/i.test(String(item.kind||item.title||''))}).map(function(item){return{title:item.title||'Rendez-vous',kind:item.kind||'Rendez-vous'}}):[];
  var preview=iaAOwnerAgendaState.key===iaAOwnerAgendaKey()?iaASafeArray(iaAOwnerAgendaState.events).filter(function(item){return String(item.date||'')===date}):[];
  var all=events.concat(remindersForDate,preview),seen=new Set();
  return all.filter(function(item){var key=String(item.title||'')+'|'+String(item.kind||'');if(!item.title||seen.has(key))return false;seen.add(key);return true}).slice(0,3);
}
function iaAOwnerWeekView(){
  return '<section class="ia-owner-week" aria-label="Votre calendrier du lundi au vendredi"><header><div><p class="eyebrow">CALENDRIER</p><h2>Votre semaine</h2></div><button class="link" type="button" onclick="navigate(\'planning\')">Ouvrir Planning</button></header><div class="ia-owner-week-days">'+iaAOwnerWeekRange().map(function(date,index){var dayDate=new Date(date+'T12:00:00'),events=iaAOwnerWeekEvents(date);return '<article class="ia-owner-week-day" data-date="'+date+'"><h3><span>'+['Lun.','Mar.','Mer.','Jeu.','Ven.'][index]+'</span><time>'+dayDate.toLocaleDateString('fr-BE',{day:'numeric',month:'short'})+'</time></h3><ul>'+ (events.length?events.map(function(item){return '<li><small>'+iaAEscape(item.kind)+'</small><strong>'+iaAEscape(item.title)+'</strong></li>'}).join(''):'<li class="is-empty">Rien de prévu</li>')+'</ul></article>'}).join('')+'</div></section>';
}
function iaAOwnerMessagesPanel(){
  iaAEnsureOwnerAgenda();var state=iaAOwnerAgendaState,key=iaAOwnerAgendaKey();if(state.key!==key)state={status:'loading',messages:[]};
  var body=state.status==='loading'||state.status==='idle'?iaAState('loading','Chargement des messages','Les échanges récents de votre entreprise apparaîtront ici.'):
    state.messageError?iaAState('error','Messages indisponibles',state.messageError,'Réessayer','iaARetryOwnerAgenda()'):
    state.messages.length?state.messages.map(function(item){return '<button class="ia-owner-row" type="button" onclick="navigate(\'messages\')"><span><strong>'+iaAEscape(item.title||'Conversation')+'</strong><small>'+iaAEscape(item.last_message||'Ouvrir la conversation')+'</small></span><span aria-hidden="true">→</span></button>'}).join(''):iaAState('empty','Aucun message récent','Les nouveaux échanges de l’équipe apparaîtront ici.');
  return '<section class="ia-owner-panel ia-owner-messages"><header><div><p class="eyebrow">ÉQUIPE</p><h2>Messages récents</h2></div><button class="link" type="button" onclick="navigate(\'messages\')">Ouvrir les messages</button></header><div class="ia-owner-panel-body">'+body+'</div></section>';
}
function iaAOwnerTasksPanel(){
  var state=iaAOwnerAgendaState,key=iaAOwnerAgendaKey(),local=iaAOpenTasks(),remote=state.key===key?iaASafeArray(state.tasks):[],journal=state.key===key?iaASafeArray(state.fieldJournal):[];
  var rows=[],seen=new Set();
  journal.forEach(function(item){var id='field-journal:'+String(item.id||'');if(seen.has(id))return;seen.add(id);rows.push({title:String(item.category||'Problème')+' · '+String(item.projectName||'Chantier'),date:String(item.author||'Équipe')+' · '+new Date(item.createdAt).toLocaleString('fr-BE'),status:'À traiter',projectId:String(item.projectId||'')})});
  local.concat(remote).forEach(function(item){var title=String(item.title||item.label||'Tâche à traiter').trim(),id=String(item.id||title+'|'+String(item.date||item.dueDate||''));if(!title||seen.has(id))return;seen.add(id);rows.push({title:title,date:item.date||item.dueDate||item.due_date||'',status:item.state==='waiting'?'En attente':item.priority==='urgent'?'Urgente':'À traiter'})});
  var content=rows.length?rows.slice(0,4).map(function(item){var action=item.projectId?'fieldJournalOpenProject('+JSON.stringify(item.projectId)+')':'navigate(\'actions\')';return '<button class="ia-owner-row" type="button" onclick="'+action+'"><span><strong>'+iaAEscape(item.title)+'</strong><small>'+iaAEscape(item.date||'Sans échéance')+'</small></span><span class="ia-owner-task-state">'+iaAEscape(item.status)+'</span></button>'}).join(''):
    (state.status==='loading'||state.status==='idle'?iaAState('loading','Chargement des tâches','Les demandes et tâches ouvertes seront affichées ici.'):iaAState('empty','Rien à traiter','Aucune tâche ou demande ouverte.'));
  return '<section class="ia-owner-panel ia-owner-tasks"><header><div><p class="eyebrow">PRIORITÉS</p><h2>À traiter</h2></div><button class="link" type="button" onclick="navigate(\'actions\')">Toutes les actions</button></header><div class="ia-owner-panel-body">'+content+'</div></section>';
}
function iaARetryOwnerAgenda(){iaAOwnerAgendaState={key:'',status:'idle',messages:[],tasks:[],events:[],messageError:'',taskError:''};if(typeof render==='function')render()}
globalThis.iaARefreshOwnerAgenda=iaARetryOwnerAgenda;
function iaAActiveJobs(){
  return typeof jobs!=='undefined'&&Array.isArray(jobs)?jobs.filter(function(job){return['Terminé','Archivé'].indexOf(String(job.phase||job.status||''))<0}):[];
}
function iaATodayAssignments(){
  var current=typeof day!=='undefined'?String(day):'';
  return typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments.filter(function(item){return String(item.date||'')===current}):[];
}
function iaAJobForAssignment(assignment){
  return typeof jobs!=='undefined'&&Array.isArray(jobs)?jobs.find(function(job){return String(job.id)===String(assignment&&assignment.job)}):null;
}
function iaATeamForAssignment(assignment){
  return typeof teams!=='undefined'&&Array.isArray(teams)?teams.find(function(team){return String(team.id)===String(assignment&&assignment.team)}):null;
}
function iaACurrentPerson(){
  var id=iaACurrentPersonId();
  return typeof people!=='undefined'&&Array.isArray(people)?people.find(function(person){return String(person.id)===String(id)}):null;
}
function iaAAssignmentsForCurrentPerson(){
  var id=iaACurrentPersonId();
  if(!id)return[];
  var memberTeams=typeof teams!=='undefined'&&Array.isArray(teams)?teams.filter(function(team){return iaASafeArray(team.members).some(function(member){return String(member)===String(id)})}).map(function(team){return String(team.id)}):[];
  return iaATodayAssignments().filter(function(assignment){
    var assigned=iaASafeArray(assignment.people);
    return assigned.length?assigned.some(function(personId){return String(personId)===id}):memberTeams.indexOf(String(assignment.team))>=0;
  });
}
var iaAFinanceLoadScheduled=false;
async function iaALoadHomeFinance(){
  try{await loadServerFinance()}finally{
    iaAFinanceLoadScheduled=false;
    if(typeof view!=='undefined'&&view==='home'&&typeof render==='function')render();
  }
}
function iaAFinanceModel(){
  if(['OWNER','ACCOUNTING'].indexOf(iaARoleCode())<0||!iaAModuleVisible('accounting'))return{ready:false,state:'forbidden'};
  var state=typeof serverFinanceState==='undefined'?'unavailable':serverFinanceState;
  if(state==='idle'&&typeof loadServerFinance==='function'&&!iaAFinanceLoadScheduled){
    iaAFinanceLoadScheduled=true;queueMicrotask(iaALoadHomeFinance);
  }
  if(state!=='ready')return{ready:false,state:state};
  var invoices=typeof serverInvoices==='undefined'?[]:iaASafeArray(serverInvoices);
  var expenses=typeof serverExpenses==='undefined'?[]:iaASafeArray(serverExpenses);
  if(invoices.some(function(invoice){return !Number.isSafeInteger(invoice.totalCents)||!Number.isSafeInteger(invoice.remainingCents)}))return{ready:false,state:'error'};
  var unpaid=invoices.filter(function(invoice){return invoice.remainingCents>0});
  return{ready:true,invoices:invoices,expenses:expenses,unpaid:unpaid,
    billedCents:invoices.reduce(function(sum,invoice){return sum+invoice.totalCents},0),
    outstandingCents:unpaid.reduce(function(sum,invoice){return sum+invoice.remainingCents},0)};
}
function iaAFinanceState(model){
  if(model.state==='forbidden')return iaAState('forbidden','Accès financier indisponible','Votre accès actuel ne permet pas de consulter la comptabilité.');
  return model.state==='error'?iaAState('error','Données financières indisponibles','Ouvrez la comptabilité pour réessayer.', 'Ouvrir la comptabilité','navigate(\'accounting\')'):
    iaAState('loading','Chargement des données financières','Les montants apparaîtront après confirmation du serveur.');
}
function iaAKpis(items){
  return '<div class="ia-kpi-grid">'+items.map(function(item){return '<article class="ia-kpi"><small>'+iaAEscape(item.label)+'</small><strong>'+iaAEscape(item.value)+'</strong><span>'+iaAEscape(item.meta||'')+'</span></article>'}).join('')+'</div>';
}
function iaARoleHeading(role,title,subtitle){
  return '<header class="ia-role-head"><div><p class="eyebrow">'+iaAEscape(IA_A_ROLE_LABELS[role]||role)+'</p><h1>'+iaAEscape(title)+'</h1><p>'+iaAEscape(subtitle)+'</p></div><span class="ia-role-chip">'+iaAEscape(IA_A_ROLE_LABELS[role]||role)+'</span></header>';
}
var IA_A_ATTENTION_CATEGORIES=[
  {id:'hours',label:'Heures à valider',explanation:'Une demande de correction attend depuis plus de deux jours.',route:'timeEntries'},
  {id:'orders',label:'Commandes en retard',explanation:'La date prévue est passée et la commande n’est pas entièrement reçue.',route:'purchases'},
  {id:'invoices',label:'Factures fournisseurs',explanation:'Une facture liée à une commande attend son bon de livraison.',route:'accounting'},
  {id:'documents',label:'Documents de sous-traitance',explanation:'Les pièces attendues doivent être définies pour vérifier leur présence.',route:'documents'},
  {id:'silent',label:'Chantiers silencieux',explanation:'Aucun pointage ni relève depuis au moins huit jours.',route:'jobs'},
  {id:'reports',label:'Relèves de terrain',explanation:'Les problèmes et situations de sécurité signalés restent à consulter.',route:'jobs'}
];
function iaAAttentionDate(value){var date=new Date(value);return Number.isNaN(date.getTime())?null:date}
function iaAAttentionAge(value,now){var date=iaAAttentionDate(value);return date?Math.floor((now.getTime()-date.getTime())/86400000):null}
function iaAAttentionBuild(data){
  data=data||{};var now=iaAAttentionDate(data.checkedAt)||new Date(),today=String(data.today||now.toISOString().slice(0,10)),items=[],categories=[];
  function add(category,title,detail,age,tone,route){items.push({category:category,title:title,detail:detail,age:age,tone:tone,route:route||'home'})}
  var jobs=iaASafeArray(data.jobs),orders=iaASafeArray(data.purchaseOrders),invoices=iaASafeArray(data.invoices),entries=iaASafeArray(data.timeEntries);
  entries.forEach(function(entry){var correction=entry.correction||entry,age=iaAAttentionAge(correction.requestedAt||correction.createdAt,now);if(String(correction.status||'').toLowerCase()==='pending'&&age!==null&&age>2)add('hours','Une correction de pointage attend depuis '+age+' jours.',String(entry.projectName||entry.projectId||'Chantier à identifier'),age,'danger','timeEntries')});
  orders.forEach(function(order){var status=String(order.status||'').toLocaleLowerCase('fr'),active=['commandée','partiellement reçue','ordered','partially_received'].includes(status);if(!active)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(String(order.expectedDate||''))){add('orders','Je ne sais pas si cette commande est en retard.','Date de livraison prévue absente · '+String(order.number||order.id||'Commande'),null,'muted','purchases');return}if(String(order.expectedDate)>=today)return;var lines=iaASafeArray(order.lines),fullyReceived=lines.length>0&&lines.every(function(line){return Number(line.received||0)>=Number(line.quantity||0)});if(fullyReceived)return;var age=iaAAttentionAge(order.expectedDate+'T12:00:00',now),days=Math.max(1,age||1);add('orders','La commande '+String(order.number||order.id||'')+' est en retard depuis '+days+' jour'+(days===1?'':'s')+'.',String(order.supplierName||order.supplierId||'Fournisseur non précisé'),age,'danger','purchases')});
  if(data.invoicesReady===false)add('invoices','Je ne sais pas quelles factures nécessitent un bon de livraison.','Données des factures fournisseurs indisponibles',null,'muted','accounting');
  invoices.forEach(function(invoice){if(invoice.delivery_note_id||invoice.deliveryNoteId)return;var supplier=String(invoice.supplier_id||invoice.supplierId||invoice.supplier_name||invoice.supplier||'').trim(),matching=orders.find(function(order){return supplier&&String(order.supplierId||order.supplier_id||order.supplierName||'').trim()===supplier});var ref=String(invoice.supplier_reference||invoice.supplierReference||invoice.description||invoice.id||'Facture fournisseur');if(!matching)add('invoices','Facture à vérifier : aucune commande fournisseur associée.',ref,null,'muted','accounting');else add('invoices','Facture à rapprocher : bon de livraison manquant.',ref+' · '+String(matching.number||matching.id||''),null,'warn','accounting')});
  var subcontractors=iaASafeArray(data.subcontractors);if(subcontractors.length&&!data.subcontractorRequirementsAvailable) add('documents','Je ne sais pas quelles pièces manquent.','Liste des documents attendus par sous-traitant absente',null,'muted','documents');
  var silentUnknownJobs=[];jobs.forEach(function(job){var phase=String(job.phase||job.status||'').trim().toLocaleLowerCase('fr');if(job.archivedAt||['terminé','terminée','archivé','archivée','completed','archived'].includes(phase))return;var last='';iaASafeArray(job.timeEntries).forEach(function(entry){var value=String(entry.date||entry.workDate||'');if(value>last)last=value});if(data.fieldReportsAvailable)iaASafeArray(data.fieldReports).filter(function(report){return String(report.jobId)===String(job.id)}).forEach(function(report){var value=String(report.createdAt||'').slice(0,10);if(value>last)last=value});if(last&&last>=new Date(now.getTime()-8*86400000).toISOString().slice(0,10))return;if(!data.fieldReportsAvailable){silentUnknownJobs.push(String(job.name||job.reference||job.id||'Chantier'));return}if(!last){add('silent','Je ne sais pas si ce chantier est silencieux.',String(job.name||job.reference||'Chantier')+' · date du dernier pointage absente',null,'muted','jobs');return}var age=iaAAttentionAge(last+'T12:00:00',now);if(age!==null&&age>=8)add('silent','Le chantier '+String(job.name||job.reference||job.id)+' est silencieux depuis '+age+' jours.',last,age,'warn','jobs')});if(silentUnknownJobs.length)add('silent','Je ne sais pas si '+(silentUnknownJobs.length===1?'ce chantier est silencieux.':'ces '+silentUnknownJobs.length+' chantiers sont silencieux.'),'Relèves de terrain indisponibles · '+silentUnknownJobs.join(', '),null,'muted','jobs');
  if(data.fieldReportsAvailable)iaASafeArray(data.fieldReports).filter(function(report){return ['issue','safety'].includes(String(report.type||''))}).forEach(function(report){var job=jobs.find(function(candidate){return String(candidate.id)===String(report.jobId)}),label=report.type==='safety'?'Sécurité':'Problème';add('reports',label+' signalé'+(report.type==='safety'?'e':'')+' · '+String(job&&job.name||report.jobId||'Chantier'),String(report.text||'Observation sans détail'),null,'danger','jobs')});
  IA_A_ATTENTION_CATEGORIES.forEach(function(category){var categoryItems=items.filter(function(item){return item.category===category.id});categories.push({id:category.id,label:category.label,explanation:category.explanation,count:categoryItems.length,available:category.id!=='reports'||Boolean(data.fieldReportsAvailable)})});
  return{items:items,categories:categories,checkedAt:now.toLocaleString('fr-BE',{dateStyle:'short',timeStyle:'short'}),today:today};
}
function iaAAttentionWorkspaceData(){
  var reportsPresent=typeof fieldReports!=='undefined'&&Array.isArray(fieldReports),pending=[];
  if(typeof jobs!=='undefined')iaASafeArray(jobs).forEach(function(job){iaASafeArray(job.timeEntries).forEach(function(entry){iaASafeArray(entry.corrections).filter(function(correction){return String(correction.status||'').toLowerCase()==='pending'}).forEach(function(correction){pending.push({correction:correction,projectId:job.id,projectName:job.name})})})});
  var finance=typeof serverFinanceState!=='undefined'&&serverFinanceState==='ready';
  var financeAllowed=iaAModuleVisible('accounting');if(financeAllowed&&!finance&&typeof serverFinanceState!=='undefined'&&serverFinanceState==='idle'&&typeof loadServerFinance==='function')queueMicrotask(function(){if(typeof view!=='undefined'&&view==='home')loadServerFinance()});
  var subcontracts=typeof subcontractors!=='undefined'?iaASafeArray(subcontractors).slice():[];if(typeof contacts!=='undefined')iaASafeArray(contacts).filter(function(contact){return iaASafeArray(contact.roles).includes('Sous-traitant')}).forEach(function(contact){if(!subcontracts.some(function(item){return String(item.id)===String(contact.id)}))subcontracts.push(contact)});
  return{today:String(typeof reference!=='undefined'&&reference||new Date().toISOString().slice(0,10)),checkedAt:new Date(),jobs:typeof jobs!=='undefined'?jobs:[],timeEntries:pending,purchaseOrders:typeof purchaseOrders!=='undefined'?purchaseOrders:[],invoices:finance?iaASafeArray(typeof serverExpenses!=='undefined'?serverExpenses:[]):[],invoicesReady:finance,fieldReportsAvailable:reportsPresent,fieldReports:reportsPresent?fieldReports:[],subcontractors:subcontracts,subcontractorRequirementsAvailable:false};
}
var iaAAttentionFilter='all';
var iaAAttentionCurrentModel=null;
function iaAAttentionSetFilter(value){iaAAttentionFilter=value;var host=document.querySelector('.ia-attention');if(host&&iaAAttentionCurrentModel)host.outerHTML=iaAAttentionRender(iaAAttentionCurrentModel)}
function iaAAttentionRender(model){iaAAttentionCurrentModel=model;var items=model.items,visible=iaAAttentionFilter==='all'?items:items.filter(function(item){return item.category===iaAAttentionFilter}),categories=model.categories.filter(function(category){return category.available}),count=visible.length,heading=count===1?'1 chose à traiter':count+' choses à traiter';
  return '<section class="panel ia-attention" aria-labelledby="ia-attention-title"><header class="ia-attention-head"><div><p class="eyebrow">CENTRE DE CONTRÔLE</p><h2 id="ia-attention-title">'+heading+'</h2></div><label class="ia-attention-filter"><span>Type</span><select aria-label="Filtrer les alertes" onchange="iaAAttentionSetFilter(this.value)"><option value="all" '+(iaAAttentionFilter==='all'?'selected':'')+'>Toutes</option>'+categories.map(function(category){return'<option value="'+category.id+'" '+(iaAAttentionFilter===category.id?'selected':'')+'>'+iaAEscape(category.label)+'</option>'}).join('')+'</select></label></header><div class="ia-attention-guides">'+categories.map(function(category){return'<p><strong>'+iaAEscape(category.label)+'.</strong> '+iaAEscape(category.explanation)+(category.id==='reports'&&category.available&&category.count===0?'<small class="ia-attention-category-empty">Aucune relève à consulter.</small>':'')+'</p>'}).join('')+'</div>'+(visible.length?'<ul class="ia-attention-list">'+visible.map(function(item,index){return'<li class="ia-attention-row tone-'+iaAEscape(item.tone)+'"><span class="ia-attention-mark" aria-hidden="true"></span><span class="ia-attention-copy"><strong>'+iaAEscape(item.title)+'</strong><small>'+iaAEscape(item.detail)+(item.age!==null?' · depuis '+item.age+' jour'+(item.age===1?'':'s'):'')+'</small></span><button type="button" class="ia-attention-action" data-attention-index="'+index+'" onclick="navigate(\''+iaAEscape(item.route)+'\')">Ouvrir <span aria-hidden="true">→</span></button></li>'}).join('')+'</ul>':'<p class="ia-attention-empty">Rien à traiter selon les données disponibles.<small>Dernier contrôle : '+iaAEscape(model.checkedAt)+'</small></p>')+'</section>';
}
var iaAAttentionPositionObserver=null;
function iaAAttentionEnsurePosition(){var main=document.querySelector('#main');if(!main||typeof main.querySelector!=='function')return;var card=main.querySelector('.ia-attention'),intro=main.querySelector('.v3-intro');if(card&&intro&&intro.nextElementSibling!==card)intro.after(card)}
function iaAPersonalPortalsForOverview(){
  if(!iaAModuleVisible('personal')||typeof personalPortalLinks==='undefined'||!Array.isArray(personalPortalLinks))return '';
  var sources=personalPortalLinks.slice();
  if(typeof companyPortalLinks!=='undefined'&&Array.isArray(companyPortalLinks)&&typeof canFieldAction==='function'&&canFieldAction('viewProfitability'))sources=sources.concat(companyPortalLinks);
  var seen=new Set(),links=sources.filter(function(link){var url=String(link&&link.url||'');if(!link||!/^https:\/\//i.test(url)||seen.has(url))return false;seen.add(url);return true;});
  var priority=['My FGTB','MyCareer','Le Forem','MyMinfin','MyPension'];
  links.sort(function(a,b){var ai=priority.indexOf(a.name),bi=priority.indexOf(b.name);ai=ai<0?99:ai;bi=bi<0?99:bi;return ai-bi}).splice(6);
  if(!links.length)return '';
  return '<section class="ia-home-portals" aria-label="Portails officiels utiles"><div class="ia-home-portals-head"><div><p class="eyebrow">PORTAILS</p><h2>Accès officiels</h2></div><button class="link" type="button" onclick="navigate(\'personal\')">Tous les accès</button></div><nav class="ia-home-portal-links" aria-label="Portails officiels">'+links.map(function(link){var label=link.name==='CGSLB — accès/dossier en ligne'?'CGSLB':link.name==='Le Forem'?'Forem':link.name,target=String(link.url||'').toLowerCase();var brand=target.includes('abvv.be')?['fgtb','FGTB']:target.includes('mycareer.socialsecurity.be')?['career','MC']:target.includes('leforem.be')?['forem','F']:target.includes('myminfin')?['minfin','MIN']:target.includes('mypension.be')?['pension','P']:target.includes('macsc.be')||target.includes('lacsc.be')?['csc','CSC']:target.includes('aclvb')?['cgslb','C']:['service','↗'];return '<a data-portal="'+brand[0]+'" href="'+iaAEscape(link.url)+'" target="_blank" rel="noopener noreferrer"><span class="ia-home-portal-mark" aria-hidden="true">'+brand[1]+'</span><span class="ia-home-portal-label">'+iaAEscape(label)+'</span><span class="ia-home-portal-arrow" aria-hidden="true">↗</span><span class="sr-only">— ouvrir '+iaAEscape(link.name)+' dans un nouvel onglet</span></a>'}).join('')+'</nav></section>';
}
var iaAWorkerWeatherPlanning={key:'',loading:false,data:null,error:''};
function iaAWorkerWeatherPlanningKey(){var access=iaACurrentAccess()||{};return [String(globalThis.socleCurrentOrganizationId||''),String(access.userId||''),String(typeof day!=='undefined'&&day||typeof reference!=='undefined'&&reference||'')].join(':')}
function iaAWorkerWeatherTowns(){
  var role=iaARoleCode();if(role!=='WORKER'&&role!=='TEAM_LEAD')return[];
  var data=iaAHomeScopeData();if(!data)return[];
  var currentDate=String(typeof day!=='undefined'&&day||typeof reference!=='undefined'&&reference||''),personId=iaACurrentPersonId(),projects=iaASafeArray(data.projects),seen=new Set();
  return iaASafeArray(data.assignments).filter(function(item){
    var peopleList=iaASafeArray(item.people).map(String);
    return String(item.date||'')===currentDate&&item.status!=='cancelled'&&(!peopleList.length||!personId||peopleList.includes(String(personId)));
  }).map(function(item){
    var projectId=item.projectId!=null?item.projectId:item.job,project=projects.find(function(candidate){return String(candidate.id)===String(projectId)});
    return String(project&&project.town||'').trim();
  }).filter(function(town){if(!town||seen.has(town))return false;seen.add(town);return true}).slice(0,3);
}
function iaARetryWorkerWeatherPlanning(){
  iaAWorkerWeatherPlanning={key:'',loading:false,data:null,error:''};
  if(typeof iaAHomeScopeState!=='undefined')iaAHomeScopeState={key:'',status:'idle',data:null,error:''};
  if(typeof render==='function')render();
}
function iaAHomeWeatherTowns(){
  var role=iaARoleCode(),towns=[];
  if(role==='WORKER'||role==='TEAM_LEAD')towns=iaAWorkerWeatherTowns();
  else if(role==='OWNER'&&typeof assignments!=='undefined'&&typeof jobs!=='undefined'){
    var currentDate=String(typeof day!=='undefined'&&day||typeof reference!=='undefined'&&reference||''),seen=new Set();
    towns=assignments.filter(function(item){return String(item.date||'')===currentDate&&item.status!=='cancelled'}).map(function(item){var project=jobs.find(function(candidate){return String(candidate.id)===String(item.job)});return String(project&&project.town||'').trim()}).filter(function(town){if(!town||seen.has(town))return false;seen.add(town);return true}).slice(0,3);
    if(!towns.length&&Array.isArray(jobs)){var fallback=jobs.map(function(job){return String(job&&job.town||'').trim()}).find(Boolean);if(fallback)towns=[fallback]}
  }
  return towns;
}
function iaAOwnerWeatherSection(){
  if(iaAHomeWeatherTowns().length)return iaAWorkerWeatherSection();
  if(typeof personalWeatherCard!=='function')return '';
  if(typeof loadPersonalWeather==='function')queueMicrotask(function(){loadPersonalWeather()});
  return personalWeatherCard();
}
function iaAWorkerWeatherSection(){
  var towns=iaAHomeWeatherTowns();if(!towns.length)return iaAWorkerWeatherPlanning.error?'<section class="ia-home-weather" aria-label="Météo indisponible"><div class="ia-home-weather-head"><div><p class="eyebrow">POUR VOS MISSIONS</p><h2>Météo</h2></div><button class="link" type="button" onclick="iaARetryWorkerWeatherPlanning()">Réessayer</button></div><small>Les prévisions ne sont pas disponibles pour le moment.</small></section>':'';
  var cards=towns.map(function(town){var data=typeof weatherByTown!=='undefined'?weatherByTown[town]:null,daily=data&&data.daily;return daily?'<button class="ia-home-weather-card" type="button" aria-label="Prévisions météo détaillées sur 5 jours à '+iaAEscape(town)+'" title="Ouvrir les prévisions détaillées sur 5 jours" onclick="showTownWeather(\''+jsString(town)+'\')"><span class="ia-home-weather-icon" aria-hidden="true">'+(typeof weatherIcon==='function'?weatherIcon(daily.weather_code[0]):'☀️')+'</span><span><strong>'+iaAEscape(town)+'</strong><small>'+iaAEscape(typeof weatherLabel==='function'?weatherLabel(daily.weather_code[0]):'Aujourd’hui')+' · '+Math.round(daily.temperature_2m_max[0])+'° / '+Math.round(daily.temperature_2m_min[0])+'° · Vent '+Math.round(daily.wind_speed_10m_max&&daily.wind_speed_10m_max[0]||0)+' km/h · 5 jours ↗</small></span></button>':'<div class="ia-home-weather-card is-loading"><span class="ia-home-weather-icon" aria-hidden="true">…</span><span><strong>'+iaAEscape(town)+'</strong><small>Météo en cours de chargement</small></span></div>'}).join('');
  var missing=towns.filter(function(town){return !(typeof weatherByTown!=='undefined'&&weatherByTown[town]&&weatherByTown[town].daily)});
  if(missing.length&&!weatherLoading&&typeof loadJobWeather==='function')queueMicrotask(function(){loadJobWeather(false,missing)});
  return '<section class="ia-home-weather" aria-label="Météo de mes chantiers"><div class="ia-home-weather-head"><div><p class="eyebrow">POUR VOS MISSIONS</p><h2>Météo</h2></div><small>Aujourd’hui</small></div><div class="ia-home-weather-cards">'+cards+'</div></section>';
}
function iaAOwnerDashboard(){
  iaAEnsureOwnerAgenda();
  return iaARoleHeading('OWNER','Votre journée','Messages, demandes, rendez-vous et calendrier de la semaine.')+
    iaAAttentionRender(iaAAttentionBuild(iaAAttentionWorkspaceData()))+
    iaAOwnerWeatherSection()+
    '<div class="ia-owner-dashboard">'+iaAOwnerMessagesPanel()+iaAOwnerTasksPanel()+iaAOwnerWeekView()+'</div>'+
    '<section class="ia-quick-actions" aria-label="Actions rapides">'+(typeof canModuleAction==='function'&&canModuleAction('jobs','add')?'<button class="btn primary" type="button" onclick="navigate(\'jobs\')">Nouveau chantier</button>':'')+(typeof canModuleAction==='function'&&canModuleAction('quotes','add')?'<button class="btn" type="button" onclick="navigate(\'quotes\')">Nouveau devis</button>':'')+(iaAModuleVisible('people')?'<button class="btn" type="button" onclick="navigate(\'people\')">Personnel & équipes</button>':'')+'</section>'+iaAPersonalPortalsForOverview('OWNER');
}
function iaATeamLeadDashboard(){
  var data=iaAHomeScopeData();if(!data)return iaAHomeLoadState('TEAM_LEAD');
  var assignmentsToday=iaAHomeTodayAssignments(data),assignment=assignmentsToday[0],job=assignment?iaAHomeProject(data,assignment.projectId):null,taskItems=iaAHomeTaskItems(data),personName=data.access&&data.access.name||iaACurrentPerson()&&iaACurrentPerson().name||'—';
  var assignmentItems=assignmentsToday.map(function(item){var project=iaAHomeProject(data,item.projectId);return{label:project&&project.name||'Chantier',meta:[item.startTime,item.endTime].filter(Boolean).join(' → '),badge:'Aujourd’hui',action:iaAModuleVisible('jobs')?'navigate(\'jobs\')':''}});
  var quick=[['jobs','Chantier','primary'],['actions','Tâches',''],['documents','Documents',''],['fleet','Matériel','']].filter(function(item){return iaAModuleVisible(item[0])}).map(function(item){return'<button class="btn '+item[2]+'" type="button" onclick="navigate(\''+item[0]+'\')">'+item[1]+'</button>'}).join('');
  return iaARoleHeading('TEAM_LEAD','Votre journée d’équipe','Vos propres priorités, avec les informations d’équipe auxquelles votre profil donne réellement accès.')+
    iaAWorkerWeatherSection()+
    (job?'<section class="panel ia-today-card"><div><p class="eyebrow">AUJOURD’HUI</p><h2>'+iaAEscape(job.name||'Chantier')+'</h2><p>'+iaAEscape(job.town||'')+'</p></div><div><span class="badge green">'+iaAEscape(job.phase||'Planifié')+'</span></div>'+(iaAModuleVisible('jobs')?'<button class="btn primary" type="button" onclick="navigate(\'jobs\')">Ouvrir le chantier</button>':'')+'</section>':iaAState('empty','Aucun chantier pour aujourd’hui','Votre planning personnel ne contient pas d’affectation active.'))+
    iaAKpis([{label:'Affectations',value:String(assignmentsToday.length),meta:'aujourd’hui'},{label:'Tâches ouvertes',value:String(iaASafeArray(data.tasks).length),meta:'qui vous concernent'},{label:'Obligations',value:String(iaASafeArray(data.obligations).length),meta:'personnelles'},{label:'Chef',value:personName,meta:'identité effective'}])+
    '<div class="ia-dashboard-grid">'+
    iaASummaryList({eyebrow:'PLANNING',title:'Mes affectations',items:assignmentItems,moreAction:iaAModuleVisible('planning')?'navigate(\'planning\')':'',emptyTitle:'Aucune affectation',emptyDetail:'Aucune affectation personnelle aujourd’hui.'})+
    iaASummaryList({eyebrow:'TÂCHES',title:'Priorités',items:taskItems,moreAction:iaAModuleVisible('actions')?'navigate(\'actions\')':'',emptyTitle:'Aucune tâche prioritaire',emptyDetail:'Aucune tâche ou obligation personnelle ouverte.'})+
    (quick?'<section class="panel ia-action-panel"><div class="panel-head"><div><p class="eyebrow">TERRAIN</p><h2>Actions rapides</h2></div></div><div class="ia-action-grid">'+quick+'</div></section>':'')+
    '</div>'+iaAPersonalWeekView(data)+iaAPersonalPortalsForOverview('TEAM_LEAD');
}
function iaAWorkerDashboard(){
  var data=iaAHomeScopeData();if(!data)return iaAHomeLoadState('WORKER');
  var assignmentsToday=iaAHomeTodayAssignments(data),assignment=assignmentsToday[0],job=assignment?iaAHomeProject(data,assignment.projectId):null,taskItems=iaAHomeTaskItems(data),personName=data.access&&data.access.name||iaACurrentPerson()&&iaACurrentPerson().name||'';
  var actions=[];
  if(iaAModuleVisible('actions'))actions.push('<button type="button" onclick="navigate(\'actions\')"><strong>Mes tâches</strong><span>Voir ce qui est à faire</span></button>');
  if(iaAModuleVisible('jobs')){actions.push('<button type="button" onclick="navigate(\'jobs\')"><strong>Ajouter une photo</strong><span>Depuis le chantier</span></button>');actions.push('<button type="button" onclick="navigate(\'jobs\')"><strong>Signaler un problème</strong><span>Depuis le chantier</span></button>')}
  if(iaAModuleVisible('documents'))actions.push('<button type="button" onclick="navigate(\'documents\')"><strong>Documents</strong><span>Pièces utiles du chantier</span></button>');
  return iaARoleHeading('WORKER','Votre chantier du jour','Votre travail, votre planning et vos obligations — filtrés pour votre identité effective.')+
    iaAWorkerWeatherSection()+
    (job?'<section class="ia-worker-job"><div><p class="eyebrow">CHANTIER DU JOUR</p><h1>'+iaAEscape(job.name||job.reference||'Chantier')+'</h1><p>'+iaAEscape(job.town||'')+'</p><span>'+iaAEscape(personName)+'</span></div><span class="badge green">'+iaAEscape(job.phase||'En cours')+'</span>'+(iaAModuleVisible('jobs')?'<button class="btn primary ia-worker-primary" type="button" onclick="navigate(\'jobs\')">Ouvrir le chantier & le pointage</button>':'')+'</section>':iaAState('empty','Aucun chantier prévu aujourd’hui','Votre prochaine affectation personnelle apparaîtra ici.'))+
    (actions.length?'<section class="ia-worker-actions" aria-label="Actions terrain">'+actions.join('')+'</section>':'')+
    iaASummaryList({eyebrow:'PRIORITÉS',title:'À traiter',items:taskItems,moreAction:iaAModuleVisible('actions')?'navigate(\'actions\')':'',emptyTitle:'Rien à traiter',emptyDetail:'Aucune tâche ou obligation personnelle ouverte.'})+
    iaAPersonalWeekView(data)+iaAPersonalPortalsForOverview('WORKER');
}
function iaAAccountingDashboard(){
  var finance=iaAFinanceModel(),heading=iaARoleHeading('ACCOUNTING','Centre financier','Factures, paiements, échéances et documents financiers sans accès direction superflu.');
  if(!finance.ready)return heading+iaAFinanceState(finance);
  var unpaid=finance.unpaid,supplierBills=finance.expenses;
  var overdue=unpaid.filter(function(invoice){return invoice.dueDate&&typeof reference!=='undefined'&&String(invoice.dueDate)<String(reference)});
  var invoiceItems=overdue.concat(unpaid.filter(function(invoice){return overdue.indexOf(invoice)<0})).map(function(invoice){return{label:invoice.invoiceNumber||'Facture',meta:[invoice.client,invoice.dueDate].filter(Boolean).join(' · '),badge:typeof invoiceStatusLabel==='function'?invoiceStatusLabel(invoice.status):invoice.status||'À traiter',badgeClass:overdue.indexOf(invoice)>=0?'warn':'',action:'navigate(\'accounting\')'}});
  var supplierItems=supplierBills.map(function(bill){return{label:bill.description||bill.supplier_name||'Dépense',meta:bill.supplier_name||bill.expense_date||'',badge:bill.payment_status||'À traiter',action:'navigate(\'accounting\')'}});
  return heading+
    iaAKpis([{label:'Factures ouvertes',value:String(unpaid.length),meta:'clients'},{label:'Échues',value:String(overdue.length),meta:'à traiter en priorité'},{label:'À recevoir',value:iaAMoney(finance.outstandingCents/100),meta:'solde ouvert'},{label:'Dépenses',value:String(supplierBills.length),meta:'pièces suivies'}])+
    '<div class="ia-dashboard-grid">'+
    iaASummaryList({eyebrow:'FACTURES',title:'À traiter',items:invoiceItems,moreAction:'navigate(\'accounting\')',emptyTitle:'Aucune facture à traiter',emptyDetail:'Les factures ouvertes apparaîtront ici.'})+
    iaASummaryList({eyebrow:'DÉPENSES',title:'Pièces récentes',items:supplierItems,moreAction:'navigate(\'accounting\')',emptyTitle:'Aucune dépense',emptyDetail:'Aucune dépense disponible.'})+
    '<section class="panel ia-action-panel"><div class="panel-head"><div><p class="eyebrow">ACCÈS DIRECT</p><h2>Comptabilité</h2></div></div><div class="ia-action-grid"><button class="btn primary" type="button" onclick="navigate(\'accounting\')">Factures & paiements</button><button class="btn" type="button" onclick="navigate(\'documents\')">Documents financiers</button><button class="btn" type="button" onclick="navigate(\'company\')">Entreprise</button></div></section>'+
    '</div>';
}
function iaADashboardForRole(role){
  if(role==='OWNER')return iaAOwnerDashboard();
  if(role==='TEAM_LEAD')return iaATeamLeadDashboard();
  if(role==='ACCOUNTING')return iaAAccountingDashboard();
  if(role==='WORKER')return iaAWorkerDashboard();
  return iaAState('loading','Chargement de votre accès','Votre espace apparaîtra après identification par le serveur.');
}
function iaAModuleVisible(moduleKey){
  return typeof canViewModule==='function'?canViewModule(moduleKey):false;
}
function iaAEnsureHomeNav(){
  var nav=document.querySelector('#nav');
  if(!nav)return;
  var buttons=Array.from(nav.querySelectorAll('button'));
  var home=buttons.find(function(button){return button.dataset.module==='home'||button.hasAttribute('data-ia-a-home')});
  if(!home){
    home=document.createElement('button');
    home.type='button';
    home.textContent='Accueil';
    home.setAttribute('data-ia-a-home','');
    home.addEventListener('click',function(){navigate('home')});
    nav.prepend(home);
  }
  home.dataset.module='home';
  home.dataset.group='operations';
  home.hidden=iaARoleCode()==='PENDING';
  home.classList.toggle('active',typeof view!=='undefined'&&String(view)==='home');
  if(home.classList.contains('active'))home.setAttribute('aria-current','page');else home.removeAttribute('aria-current');
}
function iaAEnhanceNav(){
  var nav=document.querySelector('#nav');
  if(!nav||typeof tabs2==='undefined')return;
  var buttons=Array.from(nav.querySelectorAll('button'));
  buttons.forEach(function(button){
    var label=button.textContent.trim();
    var tab=tabs2.find(function(item){return String(item[1]||'').trim()===label});
    var module=tab&&tab[0]||button.dataset.module||'';
    button.dataset.module=module;
    button.dataset.group=['home','planning','people','jobs','fleet'].indexOf(module)>=0?'operations':['quotes','accounting'].indexOf(module)>=0?'finance':['actions','documents','messages','news'].indexOf(module)>=0?'support':'settings';
    button.hidden=!iaAModuleVisible(module);
    button.setAttribute('aria-label',label);
  });
  iaAEnsureHomeNav();
}
function iaAScrollPageToTop(){
  var behavior=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';
  window.scrollTo({top:0,behavior:behavior});
  var main=document.querySelector('#main');if(main)main.scrollTo({top:0,behavior:behavior});
  document.documentElement.scrollTop=0;document.body.scrollTop=0;
}
function iaAUpdateBackToTop(){
  var button=document.querySelector('#ia-back-to-top'),main=document.querySelector('#main');if(!button)return;
  var top=Math.max(window.scrollY||0,document.documentElement.scrollTop||0,document.body.scrollTop||0,main&&main.scrollTop||0);
  button.hidden=top<240;
}
function iaAEnsureBackToTop(){
  if(typeof document==='undefined'||!document.body||typeof document.createElement!=='function')return;
  var button=document.querySelector('#ia-back-to-top');
  if(!button){button=document.createElement('button');button.id='ia-back-to-top';button.className='ia-back-to-top';button.type='button';button.setAttribute('aria-label','Remonter en haut de la page');button.title='Remonter en haut';button.innerHTML='<span aria-hidden="true">↑</span>';button.hidden=true;button.addEventListener('click',iaAScrollPageToTop);document.body.appendChild(button)}
  if(!button.dataset.scrollWatch){button.dataset.scrollWatch='true';window.addEventListener('scroll',iaAUpdateBackToTop,{passive:true});document.addEventListener('scroll',iaAUpdateBackToTop,true);window.addEventListener('resize',iaAUpdateBackToTop,{passive:true})}
  iaAUpdateBackToTop();
}
function iaAResetScrollAfterPageChange(previousView){
  var nextView=typeof view==='undefined'?'':String(view);
  if(String(previousView||'')===nextView||typeof window==='undefined'||typeof requestAnimationFrame!=='function')return;
  requestAnimationFrame(function(){iaAScrollPageToTop();iaAUpdateBackToTop()});
}
function iaAEnhanceMobileTables(){
  var main=document.querySelector('#main');if(!main||typeof main.querySelectorAll!=='function')return;
  var wrappers=main.querySelectorAll('.finance-control-panel .data-table,.account-layout .data-table,.connected-accounting .data-table,.server-expenses .data-table,.job-progress-accounting .data-table,.payment-delays .data-table,.payroll-documents .data-table');
  wrappers.forEach(function(wrapper){
    var labels=Array.from(wrapper.querySelectorAll('thead th')).map(function(cell){return String(cell.textContent||'').trim()});
    wrapper.classList.add('ia-mobile-card-table');
    wrapper.querySelectorAll('tbody tr').forEach(function(row){Array.from(row.children).forEach(function(cell,index){if(cell.tagName==='TD'&&labels[index])cell.dataset.label=labels[index]})});
  });
}
function iaAEnsureScreenPurpose(){
  var main=document.querySelector('#main'),route=typeof view==='undefined'?'':String(view),entry=globalThis.SOCLE_NAVIGATION&&SOCLE_NAVIGATION.item(route);
  if(!main||typeof main.setAttribute!=='function'||typeof main.querySelector!=='function')return;
  if(entry&&entry.type==='INTERNAL_VIEW')entry=SOCLE_NAVIGATION.item(entry.parent)||entry;
  var purpose=entry&&String(entry.purpose||'').trim();
  if(!purpose){if(typeof main.removeAttribute==='function')main.removeAttribute('data-screen-purpose');main.querySelector('.ia-screen-purpose')?.remove();return}
  main.setAttribute('data-screen-purpose',purpose);
  var line=main.querySelector(':scope > .ia-screen-purpose');
  if(!line){line=document.createElement('p');line.className='ia-screen-purpose';main.prepend(line)}
  line.textContent=purpose;
}
function iaACommandNormalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-BE').trim()}
var iaACommandState={dialog:null,input:null,list:null,announcement:null,help:null,restore:null,items:[],active:0,query:''};
function iaACommandEnsure(){
  var state=iaACommandState;if(state.dialog||typeof document==='undefined'||typeof document.createElement!=='function'||typeof document.querySelector!=='function')return;
  var trigger=document.createElement('button');trigger.id='ia-command-trigger';trigger.type='button';trigger.className='ia-command-trigger';var compact=matchMedia('(max-width:640px)');trigger.textContent=compact.matches?'⌕':'Commandes';compact.addEventListener?.('change',function(event){trigger.textContent=event.matches?'⌕':'Commandes'});trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-label','Ouvrir les commandes et les raccourcis');
  var topbar=document.querySelector('.topbar');if(topbar)topbar.appendChild(trigger);
  var dialog=document.createElement('dialog');dialog.id='ia-command-dialog';dialog.className='ia-command-dialog';dialog.setAttribute('aria-labelledby','ia-command-title');
  dialog.innerHTML='<div class="ia-command-panel"><header class="ia-command-head"><h2 id="ia-command-title"></h2><button type="button" class="ia-command-close" aria-label="Fermer">Fermer</button></header><div class="ia-command-content"></div></div>';
  document.body.appendChild(dialog);state.dialog=dialog;state.input=null;state.list=null;state.announcement=null;state.help=null;
  trigger.addEventListener('click',function(){iaACommandOpen('commands')});
  dialog.querySelector('.ia-command-close').addEventListener('click',iaACommandClose);
  dialog.addEventListener('click',function(event){if(event.target===dialog)iaACommandClose()});
  dialog.addEventListener('keydown',function(event){if(event.target&&event.target.matches('.ia-command-job-search')&&(event.key==='Enter'||event.key===' ')){event.preventDefault();iaACommandSearchJobs()}});
  dialog.addEventListener('cancel',function(event){event.preventDefault();iaACommandClose()});
  document.addEventListener('keydown',function(event){
    var target=event.target,typing=target&&(/INPUT|TEXTAREA|SELECT/.test(target.tagName)||target.isContentEditable),key=String(event.key||'').toLowerCase();
    if(state.dialog.open){if(event.key==='Escape'){event.preventDefault();iaACommandClose();return}if(state.help)return;if(target===state.input){if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();iaACommandMove(event.key==='ArrowDown'?1:-1)}else if(event.key==='Enter'){event.preventDefault();iaACommandActivate()}}return}
    if((event.ctrlKey||event.metaKey)&&key==='k'){event.preventDefault();iaACommandOpen('commands');return}
    if(event.key==='?'&&!typing&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();iaACommandOpen('help')}
  });
}
function iaACommandOpen(mode){
  iaACommandEnsure();var state=iaACommandState,dialog=state.dialog,content=dialog.querySelector('.ia-command-content');state.restore=document.activeElement;
  dialog.querySelector('#ia-command-title').textContent=mode==='help'?'Raccourcis clavier':'Aller à une rubrique';
  if(mode==='help'){
    state.help=true;content.innerHTML='<p class="ia-command-help-intro">Utilisez ces touches depuis les écrans de l’application.</p><ul class="ia-command-help-list"><li><kbd>Ctrl</kbd> ou <kbd>⌘</kbd> + <kbd>K</kbd><span>Ouvrir les commandes</span></li><li><kbd>?</kbd><span>Afficher cette aide</span></li><li><kbd>↑</kbd> / <kbd>↓</kbd>, <kbd>Entrée</kbd>, <kbd>Échap</kbd><span>Parcourir, ouvrir et fermer</span></li></ul><button type="button" class="ia-command-help-close">Fermer l’aide</button>';
    content.querySelector('.ia-command-help-close').addEventListener('click',iaACommandClose);
  }else{
    state.help=false;content.innerHTML='<label class="ia-command-label" for="ia-command-search">Rechercher une rubrique</label><input id="ia-command-search" type="search" autocomplete="off" placeholder="Ex. pointages, equipe…" role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="ia-command-results" aria-activedescendant=""><p class="ia-command-count" role="status" aria-live="polite"></p><div id="ia-command-results" class="ia-command-results" role="listbox" aria-label="Rubriques"></div>';
    state.input=content.querySelector('#ia-command-search');state.list=content.querySelector('#ia-command-results');state.announcement=content.querySelector('.ia-command-count');
    state.input.addEventListener('input',function(){state.query=state.input.value;iaACommandRender()});state.input.addEventListener('keydown',function(event){if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();iaACommandMove(event.key==='ArrowDown'?1:-1)}else if(event.key==='Enter'){event.preventDefault();iaACommandActivate()}});
    iaACommandRender();
  }
  if(!dialog.open)dialog.showModal();if(mode!=='help')state.input.focus();else dialog.querySelector('.ia-command-help-close').focus();
}
function iaACommandRender(){
  var state=iaACommandState;if(!state.list)return;
  var needle=iaACommandNormalize(state.query),entries=globalThis.SOCLE_NAVIGATION?SOCLE_NAVIGATION.entries.filter(function(entry){return ['ROOT_MODULE','SUPPORT','SETTINGS'].includes(entry.type)&&(!entry.permission||typeof canViewModule!=='function'||canViewModule(entry.permission))}):[],items=entries.filter(function(entry){return entry.purpose&&(!needle||iaACommandNormalize(entry.label+' '+entry.purpose).includes(needle))}).map(function(entry){return{route:entry.route,label:entry.label,purpose:entry.purpose}});
  state.items=items;state.active=0;state.list.replaceChildren();
  items.forEach(function(item,index){var option=document.createElement('div');option.id='ia-command-option-'+index;option.className='ia-command-option';option.setAttribute('role','option');option.setAttribute('aria-selected',index===state.active?'true':'false');option.dataset.route=item.route;var label=document.createElement('strong'),purpose=document.createElement('span');label.textContent=item.label;purpose.textContent=item.purpose;option.append(label,purpose);option.addEventListener('click',function(){iaACommandChoose(item.route)});state.list.appendChild(option)});
  if(items.length){state.announcement.textContent=items.length+' rubrique'+(items.length>1?'s':'')+' ; '+items[0].label+' sélectionnée';state.input.setAttribute('aria-activedescendant','ia-command-option-0')}
  else{state.announcement.textContent='Aucune rubrique trouvée. Vous pouvez chercher dans les chantiers.';state.input.removeAttribute('aria-activedescendant');var empty=document.createElement('p');empty.className='ia-command-empty';empty.textContent='Aucune rubrique ne correspond à cette recherche.';var button=document.createElement('button');button.type='button';button.className='ia-command-job-search';button.textContent='Chercher dans les chantiers';button.addEventListener('click',iaACommandSearchJobs);state.list.append(empty,button)}
}
function iaACommandMove(delta){var state=iaACommandState;if(!state.items.length)return;state.active=(state.active+delta+state.items.length)%state.items.length;Array.from(state.list.querySelectorAll('[role="option"]')).forEach(function(option,index){var active=index===state.active;option.setAttribute('aria-selected',active?'true':'false');if(active){state.input.setAttribute('aria-activedescendant',option.id);state.announcement.textContent=state.items.length+' rubriques ; '+state.items[index].label+' sélectionnée'}})}
function iaACommandActivate(){var item=iaACommandState.items[iaACommandState.active];if(item)iaACommandChoose(item.route)}
function iaACommandChoose(route){iaACommandClose();if(typeof navigate==='function')navigate(route)}
function iaACommandSearchJobs(){var query=iaACommandState.query;iaACommandClose();if(typeof navigate==='function')navigate('jobs');requestAnimationFrame(function(){var field=document.querySelector('.ia-b-filters input');if(field){field.value=query;field.focus();if(typeof iaBSetJobFilter==='function')iaBSetJobFilter('q',query);else field.dispatchEvent(new Event('input',{bubbles:true}))}})}
function iaACommandClose(){var state=iaACommandState;if(!state.dialog||!state.dialog.open)return;state.dialog.close();state.help=false;if(state.restore&&state.restore.isConnected)state.restore.focus()}
function iaAEnhanceShell(){
  var role=iaARoleCode();
  document.body.dataset.iaARole=role;
  iaAEnhanceNav();
  iaAEnhanceMobileTables();
  var main=document.querySelector('#main');
  if(main)main.setAttribute('data-view',typeof view==='undefined'?'':String(view));
  if(main&&typeof MutationObserver==='function'&&!iaAAttentionPositionObserver){iaAAttentionPositionObserver=new MutationObserver(iaAAttentionEnsurePosition);iaAAttentionPositionObserver.observe(main,{childList:true,subtree:true})}
  iaAAttentionEnsurePosition();
  iaAEnsureScreenPurpose();
  iaACommandEnsure();
  var topbar=document.querySelector('.topbar');
  if(topbar)topbar.setAttribute('data-role-label',IA_A_ROLE_LABELS[role]||role);
  iaAEnsureBackToTop();
}

/* Compact drill-down UX: long operational lists stay short, every row opens useful detail. */
var IA_A_LIST_LIMIT=10;
var iaAExpandedLists={purchases:false,deliveries:false,stock:false,locations:false,assets:false,people:false,jobs:false};
function iaACompactItems(items,key,limit){
  var source=iaASafeArray(items),size=Number.isFinite(limit)?limit:IA_A_LIST_LIMIT,expanded=Boolean(iaAExpandedLists[key]);
  return{visible:expanded?source:source.slice(0,size),hidden:expanded?0:Math.max(0,source.length-size),total:source.length,expanded:expanded};
}
function iaAToggleCompactList(key){
  if(Object.prototype.hasOwnProperty.call(iaAExpandedLists,key)){iaAExpandedLists[key]=!iaAExpandedLists[key];if(typeof render==='function')render()}
}
function iaAResetCompactList(key){
  if(Object.prototype.hasOwnProperty.call(iaAExpandedLists,key))iaAExpandedLists[key]=false;
}
function iaACompactMore(key,model){
  if(!model||(!model.hidden&&!model.expanded))return'';
  return '<div class="ia-compact-footer"><button class="ia-list-more" type="button" onclick="iaAToggleCompactList(\''+key+'\')">'+(model.expanded?'Réduire la liste':'Afficher les '+model.hidden+' autres')+'</button><span>'+model.total+' élément(s)</span></div>';
}
function iaADate(value){
  if(!value)return'—';
  try{return typeof fullDate==='function'?fullDate(value):String(value)}catch{return String(value)}
}
function iaAMoneySafe(value){return typeof money==='function'?money(Number(value||0)):iaAMoney(Number(value||0))}
function iaAFormatQuantity(value){
  var quantity=Number(value||0);
  if(!Number.isFinite(quantity))return'0';
  return new Intl.NumberFormat('fr-BE',{maximumFractionDigits:3}).format(quantity);
}
function iaAFindByString(items,id){return iaASafeArray(items).find(function(item){return String(item&&item.id)===String(id)})||null}
function iaAOpenOnKey(event,action){if(event.key==='Enter'||event.key===' '){event.preventDefault();action()}}
function iaAPurchaseNet(order){
  if(Number.isFinite(Number(order&&order.netAmount)))return Number(order.netAmount);
  return iaASafeArray(order&&order.lines).reduce(function(sum,line){return sum+Number(line.quantity||0)*Number(line.unitPrice||0)},0);
}
function iaAPurchaseSupplier(order){
  return typeof contacts!=='undefined'&&Array.isArray(contacts)?contacts.find(function(contact){return String(contact.id)===String(order&&order.supplierId)}):null;
}
function iaAPurchaseJob(order){
  var id=order&&(order.job!=null?order.job:order.projectId);
  return typeof jobs!=='undefined'&&Array.isArray(jobs)?jobs.find(function(job){return String(job.id)===String(id)}):null;
}
function iaAShowPurchaseOrder(id){
  var order=typeof purchaseOrders!=='undefined'?iaAFindByString(purchaseOrders,id):null;if(!order||typeof modal!=='function')return;
  var supplier=iaAPurchaseSupplier(order),job=iaAPurchaseJob(order),lines=iaASafeArray(order.lines),received=lines.reduce(function(sum,line){return sum+Number(line.received||0)},0),ordered=lines.reduce(function(sum,line){return sum+Number(line.quantity||0)},0);
  var lineHtml=lines.length?'<div class="ia-detail-list">'+lines.map(function(line){var qty=Number(line.quantity||0),got=Number(line.received||0),remaining=Math.max(0,qty-got);return '<div class="ia-detail-line"><span><strong>'+iaAEscape(line.label||line.reference||'Article')+'</strong><small>'+iaAEscape(line.reference||'')+'</small></span><span><small>Commandé</small><b>'+iaAFormatQuantity(qty)+' '+iaAEscape(line.unit||'')+'</b></span><span><small>Reçu</small><b>'+iaAFormatQuantity(got)+' '+iaAEscape(line.unit||'')+'</b></span><span><small>Reste</small><b>'+iaAFormatQuantity(remaining)+' '+iaAEscape(line.unit||'')+'</b></span><span><small>Prix HTVA</small><b>'+iaAMoneySafe(Number(line.unitPrice||0))+'</b></span></div>'}).join('')+'</div>':iaAState('empty','Aucune ligne','Cette commande ne contient aucune ligne.');
  var canReceive=!['reçue','annulée','cancelled'].includes(String(order.status||'').toLocaleLowerCase('fr-BE'));
  modal('Commande · '+String(order.number||order.id),'<div class="ia-detail-grid"><div><small>Fournisseur</small><strong>'+iaAEscape(supplier&&(supplier.company||supplier.name)||'—')+'</strong></div><div><small>Chantier</small><strong>'+iaAEscape(job&&(job.reference||job.name)||'Dépôt / frais généraux')+'</strong></div><div><small>Date</small><strong>'+iaAEscape(iaADate(order.date))+'</strong></div><div><small>Prévue</small><strong>'+iaAEscape(iaADate(order.expectedDate))+'</strong></div><div><small>Statut</small><strong>'+iaAEscape(order.status||'—')+'</strong></div><div><small>Total HTVA</small><strong>'+iaAMoneySafe(iaAPurchaseNet(order))+'</strong></div></div><div class="ia-detail-summary"><strong>'+lines.length+' ligne(s)</strong><span>'+received+' reçu(s) sur '+ordered+' commandé(s)</span></div>'+lineHtml+'<div class="modal-actions">'+(canReceive?'<button class="btn primary" type="button" onclick="iaAReceivePurchase(\''+iaAEscape(String(order.id)).replace(/'/g,'&#39;')+'\')">Réceptionner</button>':'')+'</div>');
}
function iaAReceivePurchase(id){
  var order=typeof purchaseOrders!=='undefined'?iaAFindByString(purchaseOrders,id):null;if(!order||typeof deliveryNoteForm!=='function')return;
  if(typeof closeModal==='function')closeModal();deliveryNoteForm(order.id);
}
function iaAShowDeliveryNote(id){
  var note=typeof deliveryNotes!=='undefined'?iaAFindByString(deliveryNotes,id):null;if(!note||typeof modal!=='function')return;
  var order=typeof purchaseOrders!=='undefined'?iaAFindByString(purchaseOrders,note.orderId):null,supplier=order?iaAPurchaseSupplier(order):null,lines=iaASafeArray(note.lines);
  var rows=lines.length?'<div class="ia-detail-list">'+lines.map(function(line){return '<div class="ia-detail-line ia-detail-line-short"><span><strong>'+iaAEscape(line.label||line.reference||'Article')+'</strong><small>'+iaAEscape(line.condition||'')+'</small></span><span><small>Commandé</small><b>'+iaAFormatQuantity(line.ordered)+'</b></span><span><small>Reçu</small><b>'+iaAFormatQuantity(line.received)+'</b></span><span><small>Écart</small><b>'+iaAFormatQuantity(line.difference)+'</b></span></div>'}).join('')+'</div>':iaAState('empty','Aucune ligne','Aucun détail de réception.');
  modal('Livraison · '+String(note.number||note.id),'<div class="ia-detail-grid"><div><small>Commande</small><strong>'+iaAEscape(order&&order.number||'—')+'</strong></div><div><small>Fournisseur</small><strong>'+iaAEscape(supplier&&(supplier.company||supplier.name)||'—')+'</strong></div><div><small>Date</small><strong>'+iaAEscape(iaADate(note.date))+'</strong></div><div><small>Réceptionnaire</small><strong>'+iaAEscape(note.receiver||'—')+'</strong></div><div><small>Statut</small><strong>'+iaAEscape(note.status||'—')+'</strong></div><div><small>Pièce</small><strong>'+iaAEscape(note.fileName||'Aucun fichier référencé')+'</strong></div></div>'+rows+(note.comment?'<p class="notice">'+iaAEscape(note.comment)+'</p>':''));
}
function iaAShowStockItem(id){
  var item=typeof stockItems!=='undefined'?iaAFindByString(stockItems,id):null;if(!item||typeof modal!=='function')return;
  var balances=iaASafeArray(item.balances),moves=iaASafeArray(item.movements).slice().sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))}).slice(0,5),qty=Number(item.quantity||0),reserved=Number(item.reserved||0),minimum=Number(item.minimum||0);
  var balanceHtml=balances.length?'<div class="ia-detail-list">'+balances.map(function(balance){return '<div class="ia-detail-line ia-detail-line-short"><span><strong>'+iaAEscape(balance.location||balance.name||'Emplacement')+'</strong></span><span><small>Quantité</small><b>'+iaAFormatQuantity(balance.quantity)+' '+iaAEscape(item.unit||'')+'</b></span></div>'}).join('')+'</div>':'<p class="subtle">Aucune répartition détaillée.</p>';
  var moveHtml=moves.length?'<div class="ia-detail-list">'+moves.map(function(move){return '<div class="ia-detail-line ia-detail-line-short"><span><strong>'+iaAEscape(move.type||'Mouvement')+'</strong><small>'+iaAEscape(iaADate(move.date))+' · '+iaAEscape(move.reason||'')+'</small></span><span><small>Quantité</small><b>'+iaAFormatQuantity(move.quantity)+' '+iaAEscape(item.unit||'')+'</b></span></div>'}).join('')+'</div>':'<p class="subtle">Aucun mouvement récent disponible.</p>';
  modal(String(item.name||item.reference||'Stock'),'<div class="ia-detail-grid"><div><small>Référence</small><strong>'+iaAEscape(item.reference||'—')+'</strong></div><div><small>Fournisseur</small><strong>'+iaAEscape(item.supplier||'—')+'</strong></div><div><small>Stock total</small><strong>'+iaAFormatQuantity(qty)+' '+iaAEscape(item.unit||'')+'</strong></div><div><small>Réservé</small><strong>'+iaAFormatQuantity(reserved)+' '+iaAEscape(item.unit||'')+'</strong></div><div><small>Disponible</small><strong>'+iaAFormatQuantity(Math.max(0,qty-reserved))+' '+iaAEscape(item.unit||'')+'</strong></div><div><small>Minimum</small><strong>'+iaAFormatQuantity(minimum)+' '+iaAEscape(item.unit||'')+'</strong></div><div><small>Coût unitaire</small><strong>'+iaAMoneySafe(item.unitCost)+'</strong></div><div><small>Valeur HTVA</small><strong>'+iaAMoneySafe(qty*Number(item.unitCost||0))+'</strong></div></div><h3 class="detail-heading">Répartition</h3>'+balanceHtml+'<h3 class="detail-heading">Derniers mouvements</h3>'+moveHtml+'<div class="modal-actions"><button class="btn" type="button" onclick="iaAEditStock(\''+iaAEscape(String(item.id)).replace(/'/g,'&#39;')+'\')">Modifier</button><button class="btn primary" type="button" onclick="iaAMoveStock(\''+iaAEscape(String(item.id)).replace(/'/g,'&#39;')+'\')">Mouvement</button></div>');
}
function iaAEditStock(id){var item=typeof stockItems!=='undefined'?iaAFindByString(stockItems,id):null;if(!item||typeof stockForm!=='function')return;if(typeof closeModal==='function')closeModal();stockForm(item.id)}
function iaAMoveStock(id){var item=typeof stockItems!=='undefined'?iaAFindByString(stockItems,id):null;if(!item||typeof stockMovementForm!=='function')return;if(typeof closeModal==='function')closeModal();stockMovementForm(item.id)}
function iaAShowStockLocation(id){
  var location=typeof stockLocations!=='undefined'?iaAFindByString(stockLocations,id):null;if(!location||typeof modal!=='function')return;
  var related=typeof stockItems!=='undefined'?iaASafeArray(stockItems).filter(function(item){return iaASafeArray(item.balances).some(function(balance){return String(balance.locationId||balance.location||'')===String(location.id)||String(balance.location||'')===String(location.name||'')})}):[];
  var items=related.length?'<div class="ia-detail-list">'+related.slice(0,12).map(function(item){return '<button class="ia-detail-link" type="button" onclick="iaAShowStockItem(\''+iaAEscape(String(item.id)).replace(/'/g,'&#39;')+'\')"><span><strong>'+iaAEscape(item.name||item.reference)+'</strong><small>'+iaAEscape(item.reference||'')+'</small></span><span>Ouvrir →</span></button>'}).join('')+'</div>':'<p class="subtle">Aucune référence liée à cet emplacement.</p>';
  modal('Emplacement · '+String(location.name||location.id),'<div class="ia-detail-grid"><div><small>Type</small><strong>'+iaAEscape(location.type||'—')+'</strong></div><div><small>Statut</small><strong>'+iaAEscape(location.status||'—')+'</strong></div><div><small>Références liées</small><strong>'+related.length+'</strong></div></div>'+items+'<div class="modal-actions"><button class="btn primary" type="button" onclick="iaAEditStockLocation(\''+iaAEscape(String(location.id)).replace(/'/g,'&#39;')+'\')">Modifier</button></div>');
}
function iaAEditStockLocation(id){var location=typeof stockLocations!=='undefined'?iaAFindByString(stockLocations,id):null;if(!location||typeof stockLocationForm!=='function')return;if(typeof closeModal==='function')closeModal();stockLocationForm(location.id)}
function iaAAssetHealth(asset){
  var condition=String(asset&&asset.condition||''),issues=iaASafeArray(asset&&asset.issues),openIssue=issues.some(function(issue){return !['resolved','closed','done','traité','résolu'].includes(String(issue&&issue.status||'').toLocaleLowerCase('fr-BE'))}),problem=Boolean(asset&&asset.repairNote)||openIssue||(condition&&condition!=='En service');
  return{problem:problem,label:problem?'Problème':'OK',detail:problem?(asset&&asset.repairNote||condition||'Signalement ouvert'):'Aucun problème signalé'};
}
function iaAOpenAsset(id){var asset=typeof assets!=='undefined'?iaAFindByString(assets,id):null;if(asset&&typeof showAsset==='function')showAsset(asset.id)}
function iaAReportAssetIssue(id){
  var asset=typeof assets!=='undefined'?iaAFindByString(assets,id):null;if(!asset||typeof modal!=='function')return;
  modal('Signaler un problème · '+String(asset.name||''),'<form onsubmit="saveAssetIssue(event)"><input type="hidden" name="asset" value="'+iaAEscape(String(asset.id))+'"><label>Niveau<select name="severity"><option>À contrôler</option><option>À réparer</option><option>Hors service</option></select></label><label>Problème<textarea name="description" rows="4" required maxlength="1000" placeholder="Décrivez le problème constaté…"></textarea></label><div class="modal-actions"><button class="btn primary">Signaler</button></div></form>');
}
if(typeof showAsset==='function'){
  var iaAOriginalShowAsset=showAsset;
  showAsset=function(id){
    var result=iaAOriginalShowAsset(id),asset=typeof assets!=='undefined'?iaAFindByString(assets,id):null,root=document.querySelector('#modalbody .modal-inner');
    if(asset&&root&&!root.querySelector('[data-ia-asset-health]')){
      var health=iaAAssetHealth(asset),actions=root.querySelector('.modal-actions'),section=document.createElement('section');
      section.className='ia-asset-health';section.dataset.iaAssetHealth='';section.innerHTML='<div><span class="badge '+(health.problem?'warn':'green')+'">'+iaAEscape(health.label)+'</span><strong>'+iaAEscape(health.detail)+'</strong></div><button class="btn" type="button" onclick="iaAReportAssetIssue(\''+iaAEscape(String(asset.id)).replace(/'/g,'&#39;')+'\')">Signaler un problème</button>';
      (actions||root).insertAdjacentElement(actions?'beforebegin':'beforeend',section);
    }
    return result;
  };
}
if(typeof purchasesView==='function'){
  purchasesView=function(){
    var all=iaASafeArray(purchaseOrders).slice().sort(function(a,b){return String(b.date||b.number||'').localeCompare(String(a.date||a.number||''))}),late=all.filter(function(order){return['commandée','partiellement reçue'].includes(order.status)&&order.expectedDate&&order.expectedDate<reference}),model=iaACompactItems(all,'purchases',IA_A_LIST_LIMIT);
    var notes=iaASafeArray(deliveryNotes).slice().sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))}),noteModel=iaACompactItems(notes,'deliveries',6);
    var rows=model.visible.map(function(order){var supplier=iaAPurchaseSupplier(order),job=iaAPurchaseJob(order);return '<tr class="ia-click-row" tabindex="0" role="button" data-id="'+iaAEscape(order.id)+'" onclick="iaAShowPurchaseOrder(this.dataset.id)" onkeydown="iaAOpenOnKey(event,()=>iaAShowPurchaseOrder(this.dataset.id))"><td><strong>'+iaAEscape(order.number||order.id)+'</strong></td><td>'+iaAEscape(supplier&&(supplier.company||supplier.name)||'—')+'</td><td>'+iaAEscape(job&&(job.reference||job.name)||'Dépôt')+'</td><td>'+iaAEscape(iaADate(order.expectedDate))+'</td><td>'+iaAMoneySafe(iaAPurchaseNet(order))+'</td><td><span class="badge '+(order.status==='reçue'?'green':order.expectedDate&&order.expectedDate<reference?'red':'warn')+'">'+iaAEscape(order.status||'—')+'</span></td><td><span class="ia-row-open">Détail →</span></td></tr>'}).join('');
    var deliveryRows=noteModel.visible.map(function(note){var order=iaAFindByString(purchaseOrders,note.orderId);return '<button class="ia-compact-card" type="button" data-id="'+iaAEscape(note.id)+'" onclick="iaAShowDeliveryNote(this.dataset.id)"><span><strong>'+iaAEscape(note.number||note.id)+'</strong><small>'+iaAEscape(iaADate(note.date))+' · '+iaAEscape(order&&order.number||'')+'</small></span><span class="badge '+(note.status==='Reçue'?'green':'warn')+'">'+iaAEscape(note.status||'—')+'</span><span class="ia-row-open">Détail →</span></button>'}).join('');
    return heading('Achats','Commandes et livraisons : aperçu compact, détail au clic.',false)+'<div class="finance-grid"><div class="finance-box"><small>Commandes</small><strong>'+all.length+'</strong></div><div class="finance-box"><small>Livraisons</small><strong>'+notes.length+'</strong></div><div class="finance-box"><small>En retard</small><strong>'+late.length+'</strong></div></div><div class="section-heading"><h2>Commandes fournisseurs</h2><button class="btn primary" onclick="purchaseOrderForm()">+ Nouvelle commande</button></div><section class="panel data-table ia-compact-table"><table><thead><tr><th>Commande</th><th>Fournisseur</th><th>Chantier</th><th>Prévue</th><th>HTVA</th><th>Statut</th><th></th></tr></thead><tbody>'+ (rows||'<tr><td colspan="7" class="empty">Aucune commande fournisseur.</td></tr>') +'</tbody></table>'+iaACompactMore('purchases',model)+'</section><section class="panel ia-compact-panel"><div class="panel-head"><h2>Bons de livraison</h2></div><div class="ia-compact-card-list">'+(deliveryRows||'<div class="empty">Aucune livraison enregistrée.</div>')+'</div>'+iaACompactMore('deliveries',noteModel)+'</section>';
  };
}
if(typeof purchasesView==='function'){
  var purchasesViewTransmissionStatus=purchasesView;
  purchasesView=function(){return '<p class="notice"><strong>À savoir :</strong> les commandes sont enregistrées dans SOCLE. Elles ne sont pas envoyées au fournisseur depuis cette application.</p>'+purchasesViewTransmissionStatus()};
}
var showPurchaseOrderTransmissionStatus=iaAShowPurchaseOrder;
iaAShowPurchaseOrder=function(id){showPurchaseOrderTransmissionStatus(id);var root=document.querySelector('#modalbody .modal-inner');if(!root)return;var notice=document.createElement('p');notice.className='notice';notice.textContent='Commande enregistrée dans SOCLE · non transmise au fournisseur.';root.append(notice)};
if(typeof stockView==='function'){
  stockView=function(){
    var all=iaASafeArray(stockItems).slice().sort(function(a,b){var aw=Number(a.quantity||0)<=Number(a.minimum||0),bw=Number(b.quantity||0)<=Number(b.minimum||0);return aw===bw?String(a.name||'').localeCompare(String(b.name||''),'fr'):aw?-1:1}),model=iaACompactItems(all,'stock',IA_A_LIST_LIMIT),locations=iaASafeArray(stockLocations).slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''),'fr')}),locationModel=iaACompactItems(locations,'locations',6),total=all.reduce(function(sum,item){return sum+Number(item.quantity||0)*Number(item.unitCost||0)},0);
    var rows=model.visible.map(function(item){var low=Number(item.quantity||0)<=Number(item.minimum||0);return '<tr class="ia-click-row" tabindex="0" role="button" data-id="'+iaAEscape(item.id)+'" onclick="iaAShowStockItem(this.dataset.id)" onkeydown="iaAOpenOnKey(event,()=>iaAShowStockItem(this.dataset.id))"><td>'+iaAEscape(item.reference||'—')+'</td><td><strong>'+iaAEscape(item.name||'')+'</strong><small>'+iaAEscape(item.supplier||'')+'</small></td><td><strong>'+iaAFormatQuantity(item.quantity)+' '+iaAEscape(item.unit||'')+'</strong>'+(low?'<small class="ia-stock-warning">Sous minimum</small>':'')+'</td><td>'+iaASafeArray(item.balances).slice(0,2).map(function(balance){return iaAEscape(balance.location||'')+' : <strong>'+iaAFormatQuantity(balance.quantity)+'</strong>'}).join('<br>')+(iaASafeArray(item.balances).length>2?'<small>+'+(iaASafeArray(item.balances).length-2)+' emplacement(s)</small>':'')+'</td><td>'+iaAMoneySafe(Number(item.quantity||0)*Number(item.unitCost||0))+'</td><td><span class="ia-row-open">Détail →</span></td></tr>'}).join('');
    var locRows=locationModel.visible.map(function(location){return '<button class="ia-compact-card" type="button" data-id="'+iaAEscape(location.id)+'" onclick="iaAShowStockLocation(this.dataset.id)"><span><strong>'+iaAEscape(location.name||location.id)+'</strong><small>'+iaAEscape(location.type||'')+'</small></span><span class="badge '+(location.status==='active'?'green':'warn')+'">'+iaAEscape(location.status||'—')+'</span><span class="ia-row-open">Détail →</span></button>'}).join('');
    return heading('Stock','Stock multi-emplacement : résumé court, détail au clic.',false)+'<div class="finance-grid"><div class="finance-box"><small>Références</small><strong>'+all.length+'</strong></div><div class="finance-box"><small>Emplacements actifs</small><strong>'+locations.filter(function(location){return location.status==='active'}).length+'</strong></div><div class="finance-box"><small>Valeur HTVA</small><strong>'+iaAMoneySafe(total)+'</strong></div></div><div class="section-heading"><h2>Stock disponible</h2><span><button class="btn" onclick="stockLocationForm()">+ Emplacement</button> <button class="btn primary" onclick="stockForm()">+ Référence</button></span></div><section class="panel data-table ia-compact-table"><table><thead><tr><th>Référence</th><th>Désignation</th><th>Total</th><th>Répartition</th><th>Valeur</th><th></th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" class="empty">Aucun stock.</td></tr>')+'</tbody></table>'+iaACompactMore('stock',model)+'</section><section class="panel ia-compact-panel"><div class="panel-head"><h2>Emplacements</h2></div><div class="ia-compact-card-list">'+(locRows||'<div class="empty">Aucun emplacement.</div>')+'</div>'+iaACompactMore('locations',locationModel)+'</section>';
  };
}
if(typeof fleetView==='function'){
  fleetView=function(){
    var cats=[['vehicles','Véhicules'],['tools','Outillage'],['rentals','Locations'],['repairs','À réparer']],
        key=typeof assetCategory==='undefined'?'vehicles':assetCategory,
        base=typeof categoryAssets==='function'?categoryAssets(key):iaASafeArray(assets),
        list=typeof assetFilteredList==='function'?assetFilteredList(base):base,
        model=iaACompactItems(list,'assets',IA_A_LIST_LIMIT),
        label=(cats.find(function(item){return item[0]===key})||['',key])[1],
        activeFilters=typeof assetFilterCount==='function'?assetFilterCount():0;
    var rows=model.visible.map(function(asset){
      var health=iaAAssetHealth(asset),
          vehicle=asset.vehicle||{},
          secondary=key==='vehicles'?(vehicle.registration||asset.category||''):(asset.category||asset.reference||''),
          place=[asset.attached,asset.responsible].filter(Boolean).join(' · ');
      return '<button class="ia-asset-row" type="button" data-id="'+iaAEscape(asset.id)+'" onclick="iaAOpenAsset(this.dataset.id)"><span class="ia-asset-copy"><strong>'+iaAEscape(asset.name||'Bien')+'</strong><small>'+iaAEscape(secondary||'À renseigner')+'</small></span><span class="ia-asset-place"><small>Rattachement</small><b>'+iaAEscape(place||'À renseigner')+'</b></span><span><small>État</small><span class="badge '+(asset.condition==='En service'?'green':'warn')+'">'+iaAEscape(asset.condition||'À vérifier')+'</span></span><span><small>Suivi</small><span class="badge '+(health.problem?'warn':'green')+'">'+health.label+'</span></span><span class="ia-row-open">Détail →</span></button>';
    }).join('');
    var filterBar=typeof assetFilterBarHTML==='function'?assetFilterBarHTML():'';
    return heading('Biens & matériel','Un clic ouvre le dossier. Aucun mode de sélection : état et problèmes restent visibles.',false)
      +'<div class="asset-categories">'+cats.map(function(pair){var categoryKey=pair[0],categoryLabel=pair[1],count=typeof categoryAssets==='function'?categoryAssets(categoryKey).length:0;return '<button class="'+(categoryKey===key?'selected':'')+'" onclick="setAssetCategory(\''+categoryKey+'\')"><span>'+iaAEscape(categoryLabel)+'</span><strong>'+count+'</strong></button>'}).join('')+'</div>'
      +filterBar
      +(typeof assetFilterContextHTML==='function'?assetFilterContextHTML(label,list.length):'')
      +'<section class="panel ia-asset-list">'+(rows||'<div class="empty">Aucun bien ne correspond aux filtres.</div>')+iaACompactMore('assets',model)+'</section>'
      +'<p class="help-line">Cliquez sur un bien pour voir son dossier. Le badge « Problème » signale un état hors service, une réparation ou un signalement ouvert.</p>';
  };
}
globalThis.IA_A_LIST_LIMIT=IA_A_LIST_LIMIT;
globalThis.iaAToggleCompactList=iaAToggleCompactList;
globalThis.iaAResetCompactList=iaAResetCompactList;
globalThis.iaAOpenOnKey=iaAOpenOnKey;
globalThis.iaAShowPurchaseOrder=iaAShowPurchaseOrder;
globalThis.iaAShowDeliveryNote=iaAShowDeliveryNote;
globalThis.iaAReceivePurchase=iaAReceivePurchase;
globalThis.iaAShowStockItem=iaAShowStockItem;
globalThis.iaAEditStock=iaAEditStock;
globalThis.iaAMoveStock=iaAMoveStock;
globalThis.iaAShowStockLocation=iaAShowStockLocation;
globalThis.iaAEditStockLocation=iaAEditStockLocation;
globalThis.iaAAssetHealth=iaAAssetHealth;
globalThis.iaAOpenAsset=iaAOpenAsset;
globalThis.iaAReportAssetIssue=iaAReportAssetIssue;


/* Final interaction harmony: whole-row affordance + short Personnel/Chantiers lists. */
function iaAListFooter(key,total,limit){
  if(total<=limit)return null;
  var footer=document.createElement('div');
  footer.className='ia-dom-list-footer';
  footer.dataset.iaListKey=key;
  var button=document.createElement('button');
  button.type='button';
  button.className='ia-list-more';
  button.textContent=iaAExpandedLists[key]?'Réduire la liste':'Afficher les '+Math.max(0,total-limit)+' autres';
  button.setAttribute('aria-expanded',iaAExpandedLists[key]?'true':'false');
  button.addEventListener('click',function(){iaAExpandedLists[key]=!iaAExpandedLists[key];iaAEnhanceOperationalLists()});
  var count=document.createElement('span');
  count.textContent=total+' élément(s)';
  footer.append(button,count);
  return footer;
}
function iaAApplyRenderedListLimit(key,container,itemSelector,limit){
  if(!container)return;
  var previous=container.nextElementSibling;
  if(previous&&previous.classList&&previous.classList.contains('ia-dom-list-footer')&&previous.dataset.iaListKey===key)previous.remove();
  var items=Array.from(container.querySelectorAll(itemSelector)),expanded=Boolean(iaAExpandedLists[key]);
  items.forEach(function(item,index){item.hidden=!expanded&&index>=limit});
  var footer=iaAListFooter(key,items.length,limit);
  if(footer)container.insertAdjacentElement('afterend',footer);
}
function iaAEnhancePersonnelRows(){
  if(typeof document==='undefined'||typeof document.querySelectorAll!=='function')return;
  document.querySelectorAll('.people-table tbody tr').forEach(function(row){
    if(row.dataset.iaInteractiveRow==='true')return;
    row.dataset.iaInteractiveRow='true';
    row.tabIndex=0;
    var personButton=row.querySelector('.person-cell');
    row.addEventListener('click',function(event){
      if(event.target&&event.target.closest&&event.target.closest('button,a,input,select,textarea'))return;
      if(personButton)personButton.click();
    });
    row.addEventListener('keydown',function(event){
      if(event.target!==row)return;
      iaAOpenOnKey(event,function(){if(personButton)personButton.click()});
    });
  });
}
function iaAEnhanceOperationalLists(){
  if(typeof document==='undefined'||typeof document.querySelector!=='function')return;
  iaAEnhancePersonnelRows();
  var current=typeof view==='undefined'?'':String(view);
  if(current==='jobs'){
    var projects=document.querySelector('.project-list');
    iaAApplyRenderedListLimit('jobs',projects,'.project-row',10);
  }
  if(current==='people'&&(typeof peopleSection==='undefined'||peopleSection==='people')){
    var peopleTable=document.querySelector('.people-table');
    iaAApplyRenderedListLimit('people',peopleTable,'tbody tr',10);
  }
}
globalThis.iaAEnhanceOperationalLists=iaAEnhanceOperationalLists;

var iaAInitialHomePending=true,iaALastRenderedView='';
function iaAOpenRoleHome(role){
  if(typeof view!=='undefined')view='home';
  var nav=document.querySelector('#nav');
  if(nav&&typeof tabs2!=='undefined')nav.innerHTML=tabs2.filter(function(tab){return iaAModuleVisible(tab[0])}).map(function(tab){return '<button type="button"'+(tab[0]==='home'?' class="active" aria-current="page"':'')+' onclick="navigate(\''+tab[0]+'\')">'+iaAEscape(tab[1])+'</button>'}).join('');
  var main=document.querySelector('#main');
  if(main){main.innerHTML=iaADashboardForRole(role||iaARoleCode());if(typeof globalThis.applyAccessPreviewBanner==='function')globalThis.applyAccessPreviewBanner()}
  iaAEnhanceShell();
}
if(typeof tabs2!=='undefined'&&!tabs2.some(function(tab){return tab[0]==='home'}))tabs2.unshift(['home','Accueil']);
var iaAOriginalCanViewModule=typeof canViewModule==='function'?canViewModule:function(){return false};
canViewModule=function(target){return target==='home'?iaARoleCode()!=='PENDING':iaAOriginalCanViewModule(target)};
var iaAOriginalNavigate=typeof navigate==='function'?navigate:function(){};
navigate=function(target){
  var previousView=typeof view==='undefined'?'':String(view);
  iaAInitialHomePending=false;
  if(target==='home'){
    if(iaARoleCode()==='PENDING')return false;
    iaAOpenRoleHome();
    iaAResetScrollAfterPageChange(previousView);
    return;
  }
  var result=iaAOriginalNavigate(target);
  iaAResetScrollAfterPageChange(previousView);
  return result;
};
var iaAOriginalRender=typeof render==='function'?render:function(){};
render=function(){
  var previousView=typeof iaALastRenderedView==='undefined'?'':iaALastRenderedView;
  if(iaAInitialHomePending&&iaARoleCode()!=='PENDING'){
    iaAInitialHomePending=false;
    if(typeof view!=='undefined'&&(view==='planning'||view==='personal'))view='home';
  }
  var requestedView=typeof view==='undefined'?'':String(view);
  if(requestedView==='home'&&iaARoleCode()!=='PENDING'){
    iaAOpenRoleHome();
    if(previousView&&previousView!==requestedView)iaAResetScrollAfterPageChange(previousView);
    iaALastRenderedView=requestedView;return;
  }
  var result=iaAOriginalRender();
  iaAEnhanceShell();
  iaAEnhanceOperationalLists();
  iaALastRenderedView=requestedView;
  if(previousView&&previousView!==requestedView)iaAResetScrollAfterPageChange(previousView);
  return result;
};

globalThis.IA_A_SUMMARY_LIMIT=IA_A_SUMMARY_LIMIT;
globalThis.iaASliceSummary=iaASliceSummary;
globalThis.iaAState=iaAState;
globalThis.iaASummaryList=iaASummaryList;
globalThis.iaACollectionModel=iaACollectionModel;
globalThis.iaAListShell=iaAListShell;
globalThis.iaARoleCode=iaARoleCode;
globalThis.iaARetryWorkerWeatherPlanning=iaARetryWorkerWeatherPlanning;
globalThis.iaADashboardForRole=iaADashboardForRole;
globalThis.iaAFinanceModel=iaAFinanceModel;
globalThis.iaAAttentionBuild=iaAAttentionBuild;
globalThis.iaAAttentionRender=iaAAttentionRender;
globalThis.iaAAttentionSetFilter=iaAAttentionSetFilter;
/* La carte ne depend ni de la meteo ni d'un service externe : l'attente ne doit inclure que ce qu'elle affiche, sinon elle pend en integration continue ou le reseau est ferme. */
globalThis.iaAAttentionHomeReady=function(){return iaAOwnerAgendaState.status==='ready'&&(typeof serverFinanceState==='undefined'||!['idle','loading'].includes(serverFinanceState))};
globalThis.iaAApplyTheme=iaAApplyTheme;
globalThis.iaAThemeId=iaAThemeId;
globalThis.SOCLE_THEME_CATALOG=IA_A_THEMES;

var boot=function(){try{iaAInitThemePicker();iaAApplyTheme(iaAThemeId(),false);render()}catch(error){console.error('IA-A boot',error)}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
else if(typeof queueMicrotask==='function')queueMicrotask(boot);
else setTimeout(boot,0);
})();
