import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const planning=readFileSync(new URL('../web/planning.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/planning.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
const integrity=readFileSync(new URL('../drizzle/0048_planning_integrity.sql',import.meta.url),'utf8');
const business=readFileSync(new URL('../web/business.js',import.meta.url),'utf8');
const style=readFileSync(new URL('../web/style.css',import.meta.url),'utf8');
const theme=readFileSync(new URL('../web/ia-a-ui.css',import.meta.url),'utf8');
const v3Theme=readFileSync(new URL('../web/v3.css',import.meta.url),'utf8');
new vm.Script(planning,{filename:'planning.js'});

let assertions=0;const ok=(value,message)=>{assert.ok(value,message);assertions++};
for(const token of ["iaBPlanningMode='week'","'day','week','month'","/api/planning?from=","/api/planning/replan","iaBOpenAssignment","iaBOpenAbsence","iaBOpenTeamLead","iaBOpenBlock","iaBOpenReplan","Afficher plus","Préparation","Planifié","En cours","Bloqué","Terminé","Archivé"])ok(planning.includes(token),'UI Planning contient '+token);
for(const token of ["iaBPlanningSection='calendar'",'>À préparer</button>','iaBPlanningFetchRange','iaBPrepareView','responsiblePersonId','dueDate','iaBResolveBlock','iaBConfirmAssignment','Résoudre un blocage ne déplace jamais une équipe'])ok(planning.includes(token),'préparation planning contient '+token);
for(const token of ['planningAssignmentConflict','planning_absence_conflict','planning_assignment_conflict','planningPersonBelongsToTeam','planningHistoryRoute','planning_operation_receipts'])ok(worker.includes(token)||integrity.includes(token),'serveur planning garantit '+token);
ok(planning.includes("planning-history")&&planning.includes('iaBHistoryMarkup'),'hub affiche l’historique audité côté serveur');
for(const tab of ['Vue générale','Planning','Équipe','Heures','Tâches','Problèmes','Photos','Documents','Devis','Factures','Achats','Matériel','Historique'])ok(planning.includes(tab),'hub contient '+tab);
ok(!/\b(?:SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\bfield_assignments\b/i.test(planning),'UI ne crée pas une source parallèle SQL');
ok(planning.includes("timeEntries")||planning.includes("timeRows"),'hub heures réutilise les données existantes');
ok(planning.includes("assignmentType:'reinforcement'")||planning.includes("reinforcement"),'renfort ponctuel supporté');
ok(index.includes('planning.css')&&index.includes('planning.js'),'assets Planning chargés');
ok(build.includes("'planning.css'")&&build.includes("'planning.js'"),'assets Planning inclus au build');
ok(css.includes('@media(max-width:600px)'),'responsive mobile');
ok(css.includes('.ia-b-prepare-card')&&css.includes('.ia-b-prepare-actions button{width:100%;min-height:46px}'),'cartes de préparation adaptées aux actions tactiles mobiles');
ok(css.includes('.ia-b-worker-day.is-today')&&css.includes('.ia-b-planning-history-row'),'styles du jour prioritaire et de l’historique');
ok(css.includes('.ia-b-week-wrap{overflow:auto}'),'semaine scrollable petit écran');
for(const route of ["/api/planning","/api/planning/replan","planning_absences","hr_team_leads","project_planning_blocks","planningAssignmentConflict","planningAbsenceConflict","planningReplanRoute"])ok(worker.includes(route),'backend contient '+route);
ok(worker.includes("if(policy.configured)return policy.has('ui.module.planning.view')")&&worker.includes("async function planningAudience(env,ctx)"),'planning personnalisé piloté par permission persistée et scope, sans dépendre du libellé ACCOUNTING');
ok(worker.includes("'responsiblePersonId','dueDate'")&&worker.includes("planningPersonExists(env,ctx,state,responsiblePersonId")&&worker.includes('due_date'),'serveur valide responsable tenant-scoped et échéance des blocages');
ok(worker.includes("ctx.roleCode==='WORKER'"),'scope WORKER spécifique');
ok(planning.includes('function iaBIsWorker()')&&planning.includes('function iaBWorkerWeekView()'),'vue de planning personnelle dédiée aux ouvriers');
ok(planning.includes('function iaBWorkerAssignmentCard(item)'),'carte de mission personnelle dédiée');
ok(planning.includes('iaBAddDays(from,6)'),'période de semaine complète du lundi au dimanche');
ok(planning.includes("String(access.roleCode||'')+preview+':'+iaBPlanningSection+':'+iaBPlanningMode"),'cache planning séparé par utilisateur, rôle, section et personne prévisualisée');
ok(planning.includes("sessionAssignment().profile==='Ouvrier'"),'aperçu patron du profil ouvrier utilise aussi le planning personnel');
ok(planning.includes("worker?'':iaBPlanningFiltersHtml()"),'filtres globaux cachés au WORKER');
ok(planning.includes("worker?'Mon planning'"),'titre personnel pour WORKER');
ok(css.includes('.ia-b-worker-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))'),'structure de base du planning WORKER présente');
ok(css.includes('.ia-b-worker-mission{')&&css.includes('var(--ia-shell,#293025)'),'cartes ouvriers à contraste apaisé sur le thème sombre');
ok(v3Theme.includes('.ia-b-week-board{grid-template-columns:repeat(var(--planning-visible-days,5),minmax(0,1fr));min-width:0;gap:8px}'),'vue semaine du patron suit les jours activés sans débordement forcé');
ok(v3Theme.includes('.ia-b-weekday-settings')&&planning.includes('Ajouter samedi')&&planning.includes('Ajouter dimanche'),'le patron peut activer séparément samedi et dimanche pour l’entreprise');

ok(theme.includes('body[data-ia-a-role] .ia-b-week-day{')&&theme.includes('background:var(--ia-surface);')&&theme.includes('var(--ia-text)'),'calendrier de gestion utilise des surfaces crème et un texte foncé');
ok(css.includes('@media(max-width:600px){.ia-b-worker-period')&&css.includes('.ia-b-worker-week{grid-template-columns:minmax(0,1fr);gap:9px'),'planning ouvrier lisible sur mobile sans débordement');
const helperStart=planning.indexOf('function iaBJobActionArgument');
const helperEnd=planning.indexOf('function iaBJobStatus',helperStart);
ok(helperStart>=0&&helperEnd>helperStart,'helpers ciblés des lignes chantier présents');
const jobs=[{id:'BATXL-PRJ-02000',reference:'BATXL-PRJ-02000',name:'Toiture test',client:'Client test',town:'Liège'},{id:1790270195166,name:'Chantier numérique'}];
const browserContext={jobs,openedJob:null,openedWorkspace:null,esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),iaBJob:id=>jobs.find(job=>String(job.id)===String(id)),iaBStatusLabel:status=>status,showJob:id=>{browserContext.openedJob=id},openJobWorkspace:id=>{browserContext.openedWorkspace=id},socleCurrentAccess:{roleCode:'WORKER',permissions:['quotes.view']},sessionAssignment:()=>({sensitive:{quotePrices:false,jobMargins:false}})};
vm.runInNewContext(planning.slice(helperStart,helperEnd),browserContext,{filename:'planning-job-helpers.js'});
const stringRow=browserContext.iaBJobRowMarkup(jobs[0],null,null,'En cours');
ok(stringRow.includes('type="button"')&&stringRow.includes('aria-label="Ouvrir le dossier chantier BATXL-PRJ-02000'), 'ligne chantier alphanumérique accessible au clavier');
const handler=stringRow.match(/onclick="([^"]+)"/)?.[1]?.replaceAll('&quot;','"').replaceAll('&#39;',"'");
ok(handler?.includes('iaBOpenJobDetails("BATXL-PRJ-02000")'),'identifiant BatiNova échappé comme chaîne JavaScript');
vm.runInNewContext(handler,browserContext);
ok(browserContext.openedJob==='BATXL-PRJ-02000','clic de ligne résout l’identifiant BatiNova exact');
const keyHandler=stringRow.match(/onkeydown="([^"]+)"/)?.[1]?.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll("\\'","'");
let keyboardClicks=0;browserContext.click=()=>{keyboardClicks++;vm.runInNewContext(handler,browserContext)};
browserContext.openedJob=null;browserContext.event={key:'Enter',defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};vm.runInNewContext('event.target=globalThis',browserContext);vm.runInNewContext(keyHandler,browserContext);
ok(browserContext.openedJob==='BATXL-PRJ-02000'&&browserContext.event.defaultPrevented&&keyboardClicks===1,'Entrée ouvre le chantier une seule fois');
browserContext.openedJob=null;browserContext.event={key:' ',defaultPrevented:false,preventDefault(){this.defaultPrevented=true}};vm.runInNewContext('event.target=globalThis',browserContext);vm.runInNewContext(keyHandler,browserContext);
ok(browserContext.openedJob==='BATXL-PRJ-02000'&&browserContext.event.defaultPrevented&&keyboardClicks===2,'Espace ouvre le chantier une seule fois');
const numericRow=browserContext.iaBJobRowMarkup(jobs[1],null,null,'Planifié');
vm.runInNewContext(numericRow.match(/onclick="([^"]+)"/)?.[1]?.replaceAll('&quot;','"').replaceAll('&#39;',"'"),browserContext);
ok(browserContext.openedJob===1790270195166,'identifiant numérique conservé sans conversion');
ok(!browserContext.iaBCanViewJobFinance(),'montant chantier masqué au WORKER sans permission financière');
browserContext.socleCurrentAccess={roleCode:'OWNER',permissions:[]};
ok(browserContext.iaBCanViewJobFinance(),'montant chantier permis à OWNER');
for(const label of ['Référence','Client','Adresse','Statut / phase','Équipe','Dates planifiées','Montant','Tâches / documents','Ouvrir le hub chantier'])ok(planning.includes(label),'fiche chantier contient '+label);
for(const token of ['grid-template-columns:minmax(148px,170px)','min-height:82px','.compact-job:focus-visible','color:var(--ia-paper-text)','.personnel-row:hover','people-table tbody tr:hover td','aria-label="Ouvrir le dossier de ${esc(p.name)}"'])ok(style.includes(token)||theme.includes(token)||business.includes(token),'interaction/contraste accessible contient '+token);
ok(!planning.includes('grid-template-columns:1fr!important'),'les lignes chantier ne sont plus empilées par le breakpoint planning');
ok(theme.includes('body[data-ia-a-role] dialog{')&&theme.includes('background:var(--ia-paper)')&&theme.includes('color:var(--ia-paper-text)'),'les modales accordent texte et fond au thème actif');
ok(theme.includes('body[data-ia-a-role] .data-table tbody tr:hover,')&&theme.includes('background:var(--ia-surface-soft)!important;'),'le survol des tableaux reste contrasté en thème sombre');

const calendarStart=planning.indexOf('function iaBDate('),calendarEnd=planning.indexOf('function iaBMinutes(',calendarStart);
const calendarContext={reference:'2026-10-04',iaBPlanningAnchor:'2026-10-04',iaBPlanningMode:'month',socleCurrentAccess:{roleCode:'WORKER'},iaBVisibleDaysState:{days:[1,2,3,4,5]},iaBAddDays:(date,days)=>{const value=new Date(String(date)+'T12:00:00');value.setDate(value.getDate()+days);return value.toISOString().slice(0,10)}};
vm.runInNewContext(planning.slice(calendarStart,calendarEnd),calendarContext,{filename:'planning-calendar-helpers.js'});
let range=vm.runInNewContext('iaBPlanningRange()',calendarContext);
ok(range.from==='2026-09-28'&&range.to==='2026-10-04','WORKER voit la semaine complète même si un mode mensuel était mémorisé');
const calendarDaysStart=planning.indexOf('function iaBWeekDays('),calendarDaysEnd=planning.indexOf('\nfunction iaBWeekdaySettingsHtml',calendarDaysStart);
vm.runInNewContext(planning.slice(calendarDaysStart,calendarDaysEnd),calendarContext,{filename:'planning-calendar-visible-days.js'});
let visibleDays=vm.runInNewContext('iaBWeekDays()',calendarContext);
ok(visibleDays.length===5&&visibleDays.map(date=>iaBDateNumber(date)).join(',')==='1,2,3,4,5','du lundi au vendredi sont affichés par défaut');
calendarContext.iaBVisibleDaysState={days:[1,2,3,4,5,6,0]};
visibleDays=vm.runInNewContext('iaBWeekDays()',calendarContext);
ok(visibleDays.length===7&&visibleDays.map(date=>iaBDateNumber(date)).join(',')==='1,2,3,4,5,6,0','samedi et dimanche apparaissent quand l’entreprise les active, dimanche inclus');
calendarContext.socleCurrentAccess={roleCode:'TEAM_LEAD'};calendarContext.iaBPlanningMode='week';
range=vm.runInNewContext('iaBPlanningRange()',calendarContext);
ok(range.from==='2026-09-28'&&range.to==='2026-10-04','TEAM_LEAD voit désormais sa semaine complète');

const workerViewStart=planning.indexOf('function iaBWorkerAssignmentCard('),workerViewEnd=planning.indexOf('function iaBMonthView(',workerViewStart);
const assignmentFilterStart=planning.indexOf('function iaBFilteredAssignments(){'),assignmentFilterEnd=planning.indexOf('\nfunction ',assignmentFilterStart+1);
const assignmentFilterContext={
  iaBPlanningState:{data:{assignments:[
    {id:'worker-active',people:['person-worker'],status:'planned'},
    {id:'worker-cancelled',people:['person-worker'],status:'cancelled'},
    {id:'other-cancelled',people:['person-other'],status:'cancelled'}
  ]}},
  iaBIsWorker:()=>true,iaBWorkerPersonId:()=> 'person-worker'
};
vm.runInNewContext(planning.slice(assignmentFilterStart,assignmentFilterEnd),assignmentFilterContext,{filename:'worker-assignment-filter.js'});
const filteredWorkerAssignments=vm.runInNewContext('iaBFilteredAssignments()',assignmentFilterContext);
ok(filteredWorkerAssignments.length===1&&filteredWorkerAssignments[0].id==='worker-active','filtre WORKER retire les affectations annulées et conserve ses missions actives');
const workerContext={
  reference:'2026-10-07',
  iaBPlanningRange:()=>({from:'2026-10-05',to:'2026-10-11'}),iaBVisibleDaysState:{days:[1,2,3,4,5]},
  iaBAddDays:(date,days)=>{const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10)},
  iaBDate:value=>new Date(value+'T12:00:00Z'),
  iaBFilteredAssignments:()=>[{id:'worker-own',date:'2026-10-06',job:'job-01',team:'team-01',people:['person-worker'],startTime:'07:00',endTime:'16:00',status:'planned'}],
  iaBJob:()=>({reference:'BAT-001',name:'Toiture Liège'}),iaBTeam:()=>({name:'Équipe Toiture'}),iaBPerson:()=>({name:'Alex Ouvrier',role:'Couvreur'}),
  iaBStatusLabel:()=> 'Planifiée',iaBAbsenceRows:()=>'',esc:value=>String(value),
};
function iaBDateNumber(date){return new Date(String(date)+'T12:00:00').getDay()}
const weekDaysStart=planning.indexOf('function iaBWeekDays('),weekDaysEnd=planning.indexOf('\nfunction iaBWeekdaySettingsHtml',weekDaysStart);
vm.runInNewContext(planning.slice(weekDaysStart,weekDaysEnd),workerContext,{filename:'planning-visible-days.js'});
vm.runInNewContext(planning.slice(workerViewStart,workerViewEnd),workerContext,{filename:'worker-planning-view.js'});
const workerMarkup=vm.runInNewContext('iaBWorkerWeekView()',workerContext);
const workerDates=[...workerMarkup.matchAll(/data-planning-date="([^"]+)"/g)].map(match=>match[1]);
ok(workerDates.join(',')==='2026-10-07,2026-10-05,2026-10-06,2026-10-08,2026-10-09','agenda WORKER met le jour actuel en premier et masque le week-end par défaut');
ok(workerMarkup.includes('Aujourd’hui'),'le jour actuel est identifié clairement');
ok(!workerMarkup.includes('samedi')&&!workerMarkup.includes('dimanche'),'agenda WORKER ne montre pas samedi ni dimanche par défaut');
workerContext.iaBVisibleDaysState={days:[1,2,3,4,5,6,0]};
const workerWeekendMarkup=vm.runInNewContext('iaBWorkerWeekView()',workerContext);
ok(workerWeekendMarkup.includes('samedi')&&workerWeekendMarkup.includes('dimanche'),'agenda WORKER reçoit les jours de week-end activés par le patron');
ok(workerMarkup.includes('BAT-001')&&workerMarkup.includes('Équipe Toiture · Couvreur')&&workerMarkup.includes('07:00–16:00'),'mission affiche chantier, équipe/qualification et horaire');
ok(workerMarkup.includes('Aucune mission prévue'),'journée sans affectation indiquée clairement');

const cardStart=planning.indexOf('function iaBAssignmentCard('),cardEnd=planning.indexOf('\nfunction iaBAbsencesFor',cardStart);
const cardContext={
  iaBPlanningState:{data:{breakMinutes:0}},
  iaBJob:()=>({name:'Réfection toiture'}),iaBTeam:()=>({name:'Équipe toiture'}),iaBLeadForTeam:()=>null,
  iaBAssignmentActual:()=>0,iaBMinutes:time=>Number(time.slice(0,2))*60+Number(time.slice(3)),
  iaBMinutesLabel:minutes=>String(minutes),iaBCanManage:()=>true,esc:value=>String(value)
};
vm.runInNewContext(planning.slice(cardStart,cardEnd),cardContext,{filename:'planning-assignment-card.js'});
const cancelledReason='BATXL #119 · affectation simulation obsolète';
const cancelledAssignment={id:'cancelled-1',job:'job-1',team:'team-1',date:'2026-10-05',startTime:'07:00',endTime:'16:00',people:['p1'],status:'cancelled',reason:cancelledReason};
const cancelledCard=cardContext.iaBAssignmentCard(cancelledAssignment);
ok(cancelledCard.includes('Annulée'),'une affectation annulée porte un statut compréhensible');
ok(!cancelledCard.includes('BATXL #119')&&!cancelledCard.includes('simulation obsolète'),'la carte ne révèle plus le marqueur technique de simulation');
ok(cancelledAssignment.reason===cancelledReason,'le motif historique source reste inchangé dans les données');
const businessReason='Retard de livraison confirmé';
const activeCard=cardContext.iaBAssignmentCard({id:'active-1',job:'job-1',team:'team-1',date:'2026-10-05',startTime:'07:00',endTime:'16:00',people:['p1'],status:'planned',reason:businessReason});
ok(activeCard.includes(businessReason),'un motif métier normal reste visible');
const groupedCard=cardContext.iaBAssignmentCard({id:'group-1',job:'job-1',team:'team-1',date:'2026-10-05',startTime:'07:00',endTime:'12:00',people:['p1'],status:'planned'},[
  {id:'group-1',startTime:'07:00',endTime:'12:00'},{id:'group-2',startTime:'13:00',endTime:'16:00'}
]);
ok(groupedCard.includes('Total du jour · prévu 480 · pointé 0 · écart -480')||groupedCard.includes('Total du jour · prévu 480 · pointage en attente'),'heures prévues et pointées sont comparées une fois par équipe, chantier et jour');
const prepareStart=planning.indexOf('function iaBPlanningDateLabel('),prepareEnd=planning.indexOf('\nplanning=function()',prepareStart);
const prepareContext={
  iaBPlanningState:{data:{blocks:[{id:'block-1',projectId:'job-1',startsAt:'2026-10-06T07:00',endsAt:'2026-10-06T16:00',type:'material',status:'active',responsiblePersonId:'person-1',dueDate:'2026-10-05',reason:'Livraison attendue'}],assignments:[]}},
  iaBPlanningFetchRange:()=>({from:'2026-10-05',to:'2026-11-15'}),
  iaBDate:value=>new Date(String(value)+'T12:00:00'),
  iaBJob:id=>({name:id==='job-1'?'Rénovation toiture':'Chantier'}),
  iaBPerson:id=>({name:id==='person-1'?'Alex Ouvrier':''}),iaBTeam:()=>({name:'Équipe toiture'}),
  iaBFilteredAssignments:()=>[
    {id:'pending-1',date:'2026-10-07',job:'job-1',team:'team-1',people:['person-1'],startTime:'07:00',endTime:'16:00',status:'planned'},
    {id:'blocked-1',date:'2026-10-08',job:'job-1',team:'team-1',people:['person-1'],startTime:'07:00',endTime:'16:00',status:'blocked'}
  ],esc:value=>String(value)
};
vm.runInNewContext(planning.slice(prepareStart,prepareEnd),prepareContext,{filename:'planning-lookahead.js'});
const prepareMarkup=vm.runInNewContext('iaBPrepareView()',prepareContext);
ok(prepareMarkup.includes('Livraison attendue')&&prepareMarkup.includes('Alex Ouvrier')&&prepareMarkup.includes('oct.'),'vue À préparer présente motif, responsable et échéance');
ok(prepareMarkup.includes('Confirmer l’affectation')&&prepareMarkup.includes('Affectation bloquée'),'affectations en attente clairement séparées des blocages');
ok(prepareMarkup.includes('iaBResolveBlock')&&prepareMarkup.includes('iaBOpenPlanningDay'),'actions de résolution et accès au jour explicites');
console.log('planning-ui-80: '+assertions+' assertions réussies');
