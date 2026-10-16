import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/field-workflows.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const start=source.indexOf('let timeEntriesAnchor=reference;');
const end=source.indexOf('\nconst renderBeforeTimeEntries=',start);
assert.ok(start>=0&&end>start,'la vue de contrôle des pointages est présente');

let closed=false,activeRole='OWNER';
const calls=[];
const allReport=()=>({
  month:'2026-10',closedAt:closed?'2026-11-01T08:00:00.000Z':null,closedBy:closed?'Patron':'',archivedEntries:closed?2:0,
  canClose:true,canEdit:true,
  summary:{totalHours:9,completedEntries:2,openEntries:0,people:2,projects:2,plannedWithoutPunch:1,declaredAbsences:1,pendingCorrections:0},
  people:[
    {personId:'4',name:'Alex Ouvrier',hours:8,entries:1,projects:[{projectId:'job-a',projectName:'Chantier Alpha',hours:8,entries:1}]},
    {personId:'5',name:'Sam Autre',hours:1,entries:1,projects:[{projectId:'job-b',projectName:'Chantier Beta',hours:1,entries:1}]}
  ],
  projects:[
    {projectId:'job-a',projectName:'Chantier Alpha',hours:8,entries:1,people:1},
    {projectId:'job-b',projectName:'Chantier Beta',hours:1,entries:1,people:1}
  ],
  missingPunches:[{personId:'5',personName:'Sam Autre',date:'2026-10-03',projectNames:['Chantier Beta']}],
  declaredAbsences:[{personId:'4',personName:'Alex Ouvrier',startsAt:'2026-10-02T07:00',endsAt:'2026-10-02T16:00',type:'leave'}],
  entries:[
    {id:'one',projectId:'job-a',team:10,people:[4],date:'2026-10-01',arrival:'07:00',departure:'15:30',breakMinutes:30,note:'',archivedAt:closed?'2026-11-01T08:00:00.000Z':'',corrections:[]},
    {id:'two',projectId:'job-b',team:null,people:[5],date:'2026-10-02',arrival:'08:00',departure:'09:00',breakMinutes:0,note:'',archivedAt:'',intervention:{title:'Fuite robinet',client:'Client test',place:'Wavre',workNote:'Réparation rapide'},corrections:[]}
  ]
});
const report=()=>{
  const all=allReport();
  if(activeRole==='OWNER')return all;
  if(activeRole==='TEAM_LEAD')return{...all,canClose:false,summary:{...all.summary,totalHours:8,people:1,projects:1,plannedWithoutPunch:0},people:[all.people[0]],projects:[all.projects[0]],entries:all.entries.filter(entry=>entry.projectId==='job-a'),missingPunches:[]};
  if(activeRole==='PROJECT_MANAGER')return{...all,canClose:false};
  return{...all,canClose:false,summary:{...all.summary,totalHours:8,people:1,projects:1,plannedWithoutPunch:0,declaredAbsences:1},people:[all.people[0]],projects:[all.projects[0]],entries:all.entries.filter(entry=>entry.projectId==='job-a'),missingPunches:[]};
};

const sandbox={
  reference:'2026-10-12',view:'timeEntries',sessionAccessKey:'test',socleAccessPreview:null,
  document:{body:{dataset:{organizationId:'org-test'}}},
  currentTimeAccess:()=>({roleCode:activeRole,owner:activeRole==='OWNER',userId:activeRole.toLowerCase(),personId:activeRole==='OWNER'?'1':'4',permissions:activeRole==='OWNER'?['time_entries.view.all']:activeRole==='TEAM_LEAD'?['time_entries.view.team']:['time_entries.view.own'],projectIds:['job-a','job-b']}),
  currentTimePersonId:()=>1,personalClockTenant:()=>'org-test',
  personalClockBounds:()=>({from:'2026-10-01',to:'2026-10-31',monthStart:'2026-10-01',monthEnd:'2026-10-31'}),
  personalClockDate:value=>new Date(String(value).slice(0,7)+'-01T12:00:00'),
  personalClockDateKey:value=>new Date(value).toISOString().slice(0,10),
  personalClockMinutes:entry=>entry.departure?((Number(entry.departure.slice(0,2))*60+Number(entry.departure.slice(3,5)))-(Number(entry.arrival.slice(0,2))*60+Number(entry.arrival.slice(3,5)))-Number(entry.breakMinutes||0)):0,
  jobs:[{id:'job-a',name:'Chantier Alpha'},{id:'job-b',name:'Chantier Beta'}],teams:[{id:10,name:'Équipe A'}],
  getPerson:id=>({4:{name:'Alex Ouvrier'},5:{name:'Sam Autre'}}[id]),
  ensureInterventionJob:()=>null,canFieldAction:()=>false,heading:(title,subtitle)=>`<h1>${title}</h1><p>${subtitle}</p>`,
  esc:value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
  fullDate:value=>String(value),jsString:value=>String(value).replaceAll("'","\\'"),
  serverJson:async(path,options)=>{calls.push({path,options});if(options?.method==='POST'){closed=true;return{month:'2026-10',closedAt:'2026-11-01T08:00:00.000Z',archivedEntries:1}}return report()},
  confirm:()=>true,toast:()=>{},render:()=>{},scheduleSave:()=>{},queueMicrotask:()=>{},URLSearchParams,Intl,Date,Promise,Math,String,Number,Boolean,Array,Map,Set
};

vm.runInNewContext(source.slice(start,end),sandbox);
await vm.runInNewContext('loadTimeEntriesPage(true)',sandbox);
let html=vm.runInNewContext('timeEntriesView()',sandbox);
assert.ok(calls.some(call=>call.path==='/api/time-entries/monthly?month=2026-10'),'l’écran charge le bilan mensuel sécurisé');
assert.match(html,/BILAN ENTREPRISE/);
assert.match(html,/Bilan mensuel/);
assert.match(html,/9(?:,|\.)00? h/);
assert.match(html,/Sam Autre/);
assert.match(html,/Chantier Alpha/);
  assert.match(html,/Heures par équipe/,'le patron choisit le regroupement par équipe par défaut');
  assert.match(html,/Interventions individuelles/,'les dépannages sans équipe disposent de leur propre filtre');
  await vm.runInNewContext("setTimeEntryReportTeam('10')",sandbox);
  const teamHtml=vm.runInNewContext('timeEntriesView()',sandbox).split('<div class="time-month-breakdown">')[1]?.split('<div class="time-month-attention">')[0]||'';
  assert.match(teamHtml,/Équipe A/,'le patron peut filtrer une équipe');
  assert.doesNotMatch(teamHtml,/<strong>(?:Interventions individuelles|Sam Autre)<\/strong>/,'le filtre équipe retire les pointages sans équipe et les autres personnes du relevé');
  await vm.runInNewContext("setTimeEntryReportTeam('__individual__')",sandbox);
  const individualHtml=vm.runInNewContext('timeEntriesView()',sandbox).split('<div class="time-month-breakdown">')[1]?.split('<div class="time-month-attention">')[0]||'';
  assert.match(individualHtml,/Interventions individuelles/,'le patron peut isoler les interventions sans équipe');
  assert.match(individualHtml,/Sam Autre/,'la réparation individuelle reste attribuée à sa personne');
  await vm.runInNewContext("setTimeEntryReportMode('person')",sandbox);
  html=vm.runInNewContext('timeEntriesView()',sandbox);
  assert.match(html,/Heures par personne/,'le patron peut basculer vers le relevé par personne');
  assert.match(html,/Sam Autre/,'la vue par personne garde aussi les dépannages individuels');
  await vm.runInNewContext("setTimeEntryReportPerson('5')",sandbox);
  const personHtml=vm.runInNewContext('timeEntriesView()',sandbox).split('<div class="time-month-breakdown">')[1]?.split('<div class="time-month-attention">')[0]||'';
  assert.match(personHtml,/<strong>Sam Autre<\/strong>/,'le patron peut isoler un ouvrier précis');
  assert.doesNotMatch(personHtml,/<strong>Alex Ouvrier<\/strong>/,'le filtre personne retire les autres relevés');
assert.match(html,/À vérifier/);
assert.match(html,/Absences déclarées/);
assert.match(html,/Sauvegarder et archiver le mois/);
await vm.runInNewContext('archiveTimeEntriesMonth()',sandbox);
const closeCall=calls.find(call=>call.options?.method==='POST');
assert.ok(closeCall,'l’action patron archive au moyen de l’API');
assert.equal(closeCall.path,'/api/time-entries/monthly/close');
assert.deepEqual(JSON.parse(closeCall.options.body),{month:'2026-10',confirmMissingPunches:true});
await vm.runInNewContext('loadTimeEntriesPage(true)',sandbox);
html=vm.runInNewContext('timeEntriesView()',sandbox);
assert.match(html,/Mois archivé/);
assert.doesNotMatch(html,/Sauvegarder et archiver le mois/);

activeRole='TEAM_LEAD';
await vm.runInNewContext('loadTimeEntriesPage(true)',sandbox);
html=vm.runInNewContext('timeEntriesView()',sandbox);
assert.match(html,/BILAN ÉQUIPE/);
assert.match(html,/Bilan de mon équipe/);
assert.match(html,/Heures par personne/);
assert.doesNotMatch(html,/Sam Autre|Chantier Beta|Sauvegarder et archiver le mois/,'le chef d’équipe voit uniquement son équipe et ne peut pas clôturer l’entreprise');

activeRole='PROJECT_MANAGER';
await vm.runInNewContext('loadTimeEntriesPage(true)',sandbox);
html=vm.runInNewContext('timeEntriesView()',sandbox);
assert.match(html,/BILAN CHANTIERS/);
assert.match(html,/Bilan de mes chantiers/);
assert.match(html,/Chantier Beta/);
assert.doesNotMatch(html,/Sauvegarder et archiver le mois/,'le gestionnaire ne clôture pas le mois de l’entreprise');

activeRole='WORKER';
await vm.runInNewContext('loadTimeEntriesPage(true)',sandbox);
html=vm.runInNewContext('timeEntriesView()',sandbox);
assert.match(html,/MES HEURES/);
assert.match(html,/Mes heures du mois/);
assert.doesNotMatch(html,/Sam Autre|Chantier Beta|Heures par personne|Sauvegarder et archiver le mois/,'l’ouvrier voit son relevé sans les données des collègues');
console.log('time-entry-monthly-ui-20261012: patron, chef d’équipe, gestionnaire, ouvrier et archivage validés.');
