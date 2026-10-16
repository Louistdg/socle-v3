// Operational workflows: planned people, separate arrival/departure, and retained history.
// State can arrive before the final scripts have loaded on a fast local server.
window.addEventListener('DOMContentLoaded',()=>{if(storageReady)render()},{once:true});
const renderBeforeCurrentDay=render;
render=function(){const today=clockDate();if(reference!==today){if(day===reference)day=today;reference=today}return renderBeforeCurrentDay()};
window.addEventListener('focus',()=>{if(storageReady&&reference!==clockDate())render()});
function clockDate(){const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-')}
function clockTime(){return new Date().toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'})}
function clockActor(){return sessionPerson()?.name||company.manager||'Patron'}
function clockId(){return Math.max(Date.now(),...jobs.flatMap(j=>(j.timeEntries||[]).map(e=>Number(e.id)||0)))+1}
function clockError(message,id='fieldClockError'){const node=document.getElementById(id);if(node)node.textContent=message;else toast(message);return false}
function clockPeople(teamId,jobId,date=clockDate()){const quick=jobs.find(job=>job.quickIntervention&&String(job.id)===String(jobId));if(quick&&String(quick.teamId)===String(teamId))return (quick.people||[]).map(Number).filter(id=>getPerson(id)&&!getPerson(id).inactiveAt);const plan=assignments.find(a=>String(a.team)===String(teamId)&&String(a.job)===String(jobId)&&a.date===date);return (plan?.people||teams.find(t=>String(t.id)===String(teamId))?.members||[]).filter(id=>getPerson(id)&&!getPerson(id).inactiveAt)}
function legacyClockScope(teamId,jobId,date=clockDate()){
  const person=sessionPerson();return !person||canFieldAction('scheduleTeams')||(clockPeople(teamId,jobId,date).includes(person.id)&&personJobIds(person.id).has(jobId));
}
function legacyVisibleClockEntry(job,entry){return clockScope(entry.team,job.id,entry.date)}
openTodayEntries=function(){return jobs.flatMap(job=>(job.timeEntries||[]).filter(entry=>entry.date<=clockDate()&&!entry.departure&&visibleClockEntry(job,entry)).map(entry=>({job,entry,team:teams.find(t=>t.id===entry.team)})))};
fieldArrivalForm=function(){
  if(!requireField('logHours'))return;
  const active=activeJobsForPlanning().filter(job=>teams.some(team=>clockScope(team.id,job.id)));
  const allowedTeams=teams.filter(team=>active.some(job=>clockScope(team.id,job.id)));
  modal('Pointer l’arrivée',`<form onsubmit="saveFieldArrival(event)"><p class="notice">Choisissez l’équipe et le chantier. Les personnes prévues au planning seront reprises automatiquement.</p><div class="form-two"><label>Équipe<select name="team" required onchange="refreshArrivalPeople()"><option value="">Choisir mon équipe…</option>${allowedTeams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><label>Chantier<select name="job" required onchange="refreshArrivalPeople()"><option value="">Choisir le chantier…</option>${active.map(j=>`<option value="${j.id}">${esc(j.name)}</option>`).join('')}</select></label><label>Heure d’arrivée<input name="arrival" type="time" required value="${clockTime()}" onchange="refreshArrivalPeople()"></label></div><div id="arrivalPeople"></div><label>Remarque<input name="note" maxlength="250" placeholder="Retard, météo, matériel…"></label><p id="fieldClockError" class="form-error" role="alert"></p><p class="help-line">Pas de chantier enregistré ou intervention imprévue ?</p><div class="modal-actions"><button class="btn" type="button" onclick="quickInterventionForm()">Décrire une intervention</button><button class="btn primary">Confirmer l’arrivée</button></div></form>`);
};
function refreshArrivalPeople(){
  const form=document.querySelector('#modal form'),team=+form.elements.team.value,job=+form.elements.job.value;
  const ids=clockPeople(team,job);document.querySelector('#arrivalPeople').innerHTML=!team||!job?'':`<p class="form-section-title">Personnes présentes</p><p class="help-line">Décochez les absents. Une arrivée différente permet de noter un retard individuel.</p><div class="arrival-people">${ids.map(id=>`<div><label><input type="checkbox" name="present" value="${id}" checked>${esc(getPerson(id).name)}</label><label>Arrivée de ${esc(getPerson(id).name)}<input type="time" name="arrival-${id}" value="${form.elements.arrival.value}" required></label></div>`).join('')}</div>`;
}
saveFieldArrival=function(event){
  event.preventDefault();if(!requireField('logHours'))return;
  const f=new FormData(event.target),team=teams.find(t=>t.id===+f.get('team')),job=activeJobsForPlanning().find(j=>j.id===+f.get('job')),date=clockDate();
  if(!team||!job||!clockScope(team.id,job.id,date))return clockError('Choisissez votre équipe et un chantier autorisé.');
  const planned=clockPeople(team.id,job.id,date),ids=[...new Set(f.getAll('present').map(Number))];
  if(!ids.length||ids.some(id=>!planned.includes(id)))return clockError('Choisissez au moins une personne prévue.');
  const times=ids.map(id=>String(f.get('arrival-'+id)||f.get('arrival')||''));
  if(times.some(time=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))return clockError('Renseignez une heure d’arrivée valide.');
  const entries=jobs.flatMap(j=>j.timeEntries||[]);
  if(entries.some(e=>!e.departure&&(e.people||[]).some(id=>ids.includes(id))))return clockError('Une personne a déjà un pointage ouvert. Enregistrez son départ avant une nouvelle arrivée.');
  if(ids.some((id,i)=>entries.some(e=>e.date===date&&e.departure&&(e.people||[]).includes(id)&&e.departure>times[i])))return clockError('Cette arrivée chevauche un pointage déjà enregistré.');
  const groups=new Map();ids.forEach((id,i)=>groups.set(times[i],[...(groups.get(times[i])||[]),id]));
  job.timeEntries??=[];
  for(const [arrival,peopleIds] of groups){const at=new Date().toISOString();job.timeEntries.push({id:clockId(),team:team.id,people:peopleIds,date,arrival,departure:'',note:String(f.get('note')||'').trim(),corrections:[],history:[{action:'Arrivée',at,by:clockActor(),arrival,people:[...peopleIds]}],breakMinutes:Number(company.morningBreakMinutes||0)+Number(company.lunchBreakMinutes||0)});}
  closeModal();render();toast('Arrivée enregistrée. Le bouton de départ est disponible.');
};
fieldTimeForm=function(){
  if(!requireField('logHours'))return;
  const open=openTodayEntries();modal('Pointer le départ',`<p class="notice">Choisissez les personnes qui terminent. Un pointage oublié reste accessible les jours suivants.</p><div class="field-open-entries">${open.map(({job,entry,team})=>`<button onclick="teamClockOutForm(${job.id},${entry.id})"><span><strong>${esc(team?.name||'Équipe')} · ${fullDate(entry.date)}</strong><small>${esc(job.name)} · ${esc((entry.people||[]).map(id=>getPerson(id)?.name).filter(Boolean).join(', '))}</small><small>Arrivée à ${esc(entry.arrival)}</small></span><b>Pointer le départ</b></button>`).join('')||'<p>Aucun pointage ouvert.</p>'}</div><div class="modal-actions"><button class="btn" onclick="fieldArrivalForm()">Pointer une arrivée</button><button class="btn" onclick="timeCorrectionPicker()">Historique / correction</button></div>`);
};
teamClockOutForm=function(jobId,entryId){
  if(!requireField('logHours'))return;const job=jobs.find(j=>j.id===jobId),entry=job?.timeEntries.find(e=>e.id===entryId);
  if(!entry||entry.departure||!visibleClockEntry(job,entry))return denyAccess();
  modal('Pointer le départ',`<form onsubmit="saveTeamClockOut(event,${jobId},${entryId})"><p><strong>${esc(job.name)}</strong> · ${fullDate(entry.date)}</p><p>${esc(entry.people.map(id=>getPerson(id)?.name).filter(Boolean).join(', '))}</p><p>Arrivée : ${esc(entry.arrival)}</p>${entry.date!==clockDate()?'<p class="notice">Départ oublié : indiquez l’heure de départ de cette journée.</p>':''}<label>Heure de départ<input name="departure" type="time" required value="${entry.date===clockDate()?clockTime():'16:15'}"></label><label>Remarque<input name="note" maxlength="250"></label><p id="clockOutError" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn primary">Confirmer le départ</button></div></form>`);
};
saveTeamClockOut=function(event,jobId,entryId){
  event.preventDefault();if(!requireField('logHours'))return;const f=new FormData(event.target),job=jobs.find(j=>j.id===jobId),entry=job?.timeEntries.find(e=>e.id===entryId),departure=String(f.get('departure')||'');
  if(!entry||!visibleClockEntry(job,entry)||entry.departure)return denyAccess('Ce pointage est déjà terminé ou inaccessible.');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)||departure<=entry.arrival)return clockError('Le départ doit être postérieur à l’arrivée.','clockOutError');
  entry.departure=departure;entry.note=[entry.note,String(f.get('note')||'').trim()].filter(Boolean).join(' · ');entry.history??=[];entry.history.push({action:'Départ',at:new Date().toISOString(),by:clockActor(),departure});
  closeModal();render();toast('Départ enregistré. Les heures sont calculées et sauvegardées.');
};
const netMinutesBeforeField=netMinutes;
netMinutes=function(entry){if(entry.breakMinutes===undefined)return netMinutesBeforeField(entry);if(!entry.departure)return 0;const minute=t=>Number(t.split(':')[0])*60+Number(t.split(':')[1]);return Math.max(0,minute(entry.departure)-minute(entry.arrival)-entry.breakMinutes)};
allRecentTimeEntries=function(){return jobs.flatMap(job=>(job.timeEntries||[]).filter(e=>e.date<=clockDate()&&visibleClockEntry(job,e)).map(entry=>({job,entry,team:teams.find(t=>t.id===entry.team)}))).sort((a,b)=>b.entry.date.localeCompare(a.entry.date)||b.entry.id-a.entry.id)};
const timeRowsBeforeField=timeRows;
timeRows=function(job){return timeRowsBeforeField(job)+`<div class="clock-history">${(job.timeEntries||[]).filter(e=>visibleClockEntry(job,e)).slice().reverse().map(e=>`<article><strong>${fullDate(e.date)} · ${esc(e.people.map(id=>getPerson(id)?.name||'Ancien membre').join(', '))}</strong><p>${esc(e.arrival)} → ${esc(e.departure||'En cours')} · ${(netMinutes(e)/60).toFixed(2)} h par personne</p>${e.note?`<p>${esc(e.note)}</p>`:''}<small>${(e.history||[]).map(h=>`${esc(h.action)} · ${esc(h.by)} · ${esc(new Date(h.at).toLocaleString('fr-BE'))}`).join('<br>')}</small></article>`).join('')}</div>`};

// Planning must preserve historical participants, reject collisions and obey permissions.
const assignFormBeforeField=assignForm;
assignForm=function(id,date,teamId){if(!requireField('scheduleTeams'))return;if(date)day=date;assignFormBeforeField(id);const select=document.querySelector('#modal select[name="team"]');if(select){select.addEventListener('change',()=>{const ids=teams.find(t=>t.id===+select.value)?.members||[];document.querySelectorAll('#modal input[name="people"]').forEach(input=>input.checked=ids.includes(+input.value))});if(teamId){select.value=String(teamId);select.dispatchEvent(new Event('change'));}}};
saveWeeklyAssignment=function(event,id){
  event.preventDefault();if(!requireField('scheduleTeams'))return;const f=new FormData(event.target),existing=assignments.find(a=>a.id===id),date=f.get('date'),team=+f.get('team'),job=+f.get('job'),ids=[...new Set(f.getAll('people').map(Number))];
  if(!date||!teams.some(t=>t.id===team)||!activeJobsForPlanning().some(j=>j.id===job)||!ids.length||ids.some(pid=>!getPerson(pid)||getPerson(pid).inactiveAt))return toast('Choisissez une équipe, un chantier et des personnes disponibles.');
  if(assignments.some(a=>a.id!==id&&a.date===date&&!isArchivedJob(jobs.find(j=>j.id===a.job))&&(a.team===team||(a.people||teams.find(t=>t.id===a.team)?.members||[]).some(pid=>ids.includes(pid)))))return toast('Conflit : une équipe ou une personne est déjà affectée ce jour.');
  if(ids.some(pid=>{const p=getPerson(pid);return p.start>date||(p.end&&p.end<date)}))return toast('Une personne est hors période de contrat.');
  const at=new Date().toISOString(),a={...existing,id:id||Math.max(Date.now(),...assignments.map(a=>Number(a.id)||0))+1,date,team,job,people:ids,vehicle:existing?.vehicle||teams.find(t=>t.id===team)?.vehicle||0,pack:existing?.pack||0,history:[...(existing?.history||[]),{action:existing?'Modification':'Création',at,by:clockActor(),previous:existing?{date:existing.date,team:existing.team,job:existing.job,people:existing.people}:null}]};
  if(existing)Object.assign(existing,a);else assignments.push(a);day=date;closeModal();render();toast('Planning enregistré pour les personnes sélectionnées.');
};
const removeAssignmentBeforeField=removeAssignment;
removeAssignment=function(id){if(requireField('scheduleTeams'))return removeAssignmentBeforeField(id)};
personJobIds=function(personId){return new Set(assignments.filter(a=>(a.people||teams.find(t=>t.id===a.team)?.members||[]).includes(personId)).map(a=>a.job))};
narrowOperationalData=function(renderer,includePeople=false){
  const person=sessionPerson(),profile=sessionAssignment().profile;
  if(!person||['Patron','Administration & facturation','Gestionnaire de chantier','Comptable','Magasinier'].includes(profile))return renderer();
  const allJobs=jobs,allTeams=teams,allAssignments=assignments,allPeople=people;
  const scoped=allAssignments.filter(a=>(a.people||allTeams.find(t=>t.id===a.team)?.members||[]).includes(person.id)),teamIds=new Set(scoped.map(a=>a.team)),jobIds=new Set(scoped.map(a=>a.job)),personIds=new Set([person.id,...scoped.flatMap(a=>a.people||allTeams.find(t=>t.id===a.team)?.members||[])]);
  teams=allTeams.filter(t=>teamIds.has(t.id)||t.members.includes(person.id));jobs=allJobs.filter(j=>jobIds.has(j.id));assignments=scoped;if(includePeople)people=allPeople.filter(p=>personIds.has(p.id));
  try{return renderer()}finally{jobs=allJobs;teams=allTeams;assignments=allAssignments;people=allPeople}
};
enrichWeeklyPlanning=function(){const dates=weekDays(day);document.querySelectorAll('.week-row[data-team]').forEach(row=>{const team=teams.find(t=>t.id===+row.dataset.team);if(!team)return;row.querySelectorAll('.week-slot').forEach((cell,i)=>{const a=assignments.find(a=>a.team===team.id&&a.date===dates[i]&&!isArchivedJob(jobs.find(j=>j.id===a.job)));if(!a)return;cell.querySelectorAll('.slot-people,.slot-vehicle').forEach(n=>n.remove());cell.insertAdjacentHTML('beforeend',`<small class="slot-people">${esc((a.people||team.members).map(id=>getPerson(id)?.name?.split(' ')[0]).filter(Boolean).join(' · '))}</small><small class="slot-vehicle">${esc(fleet.find(v=>v.id===a.vehicle)?.name||'Véhicule à définir')}</small>`)});})};

// One recipient acknowledging an alert must not dismiss it for everyone else.
function alertRecipients(r){return r.recipientIds?.length?r.recipientIds:r.assigneeId?[r.assigneeId]:people.filter(p=>p.name===r.owner).map(p=>p.id)}
personalAlerts=function(person){return reminders.filter(r=>r.state!=='done'&&alertRecipients(r).includes(person.id)&&r.recipientProgress?.[person.id]?.state!=='done').sort((a,b)=>a.date.localeCompare(b.date))};
const changeReminderBeforeField=changeReminder;
changeReminder=function(id,state){const r=reminders.find(r=>r.id===id),person=sessionPerson();if(!r)return;if(!['todo','waiting','done'].includes(state))return;
  if(person&&!canFieldAction('manageAlerts')){if(!alertRecipients(r).includes(person.id))return denyAccess();r.recipientProgress??={};r.recipientProgress[person.id]={state,at:new Date().toISOString(),by:person.name};r.history??=[];r.history.push({action:state,at:new Date().toISOString(),by:person.name});if(alertRecipients(r).every(pid=>r.recipientProgress[pid]?.state==='done')){r.state='done';r.completedAt=new Date().toISOString()}closeModal();render();toast('Votre suivi est enregistré.');return;}
  if(!requireField('manageAlerts'))return;r.history??=[];r.history.push({action:state,at:new Date().toISOString(),by:clockActor()});if(state==='todo')r.recipientProgress={};return changeReminderBeforeField(id,state);
};
const showReminderBeforeField=showReminder;
showReminder=function(id){const r=reminders.find(r=>r.id===id),person=sessionPerson();if(!r)return;if(person&&!canFieldAction('manageAlerts')&&!alertRecipients(r).includes(person.id))return denyAccess();showReminderBeforeField(id);const root=document.querySelector('#modalbody .modal-inner');if(!canFieldAction('manageAlerts'))root.querySelector('button[onclick^="reminderForm"]')?.remove();root.insertAdjacentHTML('beforeend',`<section class="clock-history"><h3>Suivi des destinataires</h3>${alertRecipients(r).map(pid=>`<p>${esc(getPerson(pid)?.name||'Ancien membre')} · ${r.recipientProgress?.[pid]?.state==='done'?'Traité':r.recipientProgress?.[pid]?.state==='waiting'?'En attente':'À traiter'}</p>`).join('')}${(r.history||[]).map(h=>`<small>${esc(h.by)} · ${esc(h.action)} · ${esc(new Date(h.at).toLocaleString('fr-BE'))}</small>`).join('<br>')}</section>`)};

// Direct access to history remains available after all departures are closed.
const compactTerrainBeforeField=compactTerrainHome;
compactTerrainHome=function(){return compactTerrainBeforeField()+`<div class="clock-history-link"><button class="btn" onclick="timeCorrectionPicker()">Historique des pointages / correction</button></div>`};

timeCorrectionPicker=function(){if(!requireField('requestTimeCorrection'))return;modal('Historique des pointages',`<div class="correction-picker">${allRecentTimeEntries().map(({job,entry})=>`<button onclick="timeCorrectionForm(${job.id},${entry.id})"><span><strong>${fullDate(entry.date)} · ${esc(job.name)}</strong><small>${esc(entry.people.map(id=>getPerson(id)?.name||'Ancien membre').join(', '))}</small><small>${esc(entry.note||'')} · ${(netMinutes(entry)/60).toFixed(2)} h par personne</small></span><b>${esc(entry.arrival)} → ${esc(entry.departure||'En cours')}</b></button>`).join('')||'<p>Aucun pointage.</p>'}</div>`)};
const correctionFormBeforeField=timeCorrectionForm;
timeCorrectionForm=function(jobId,entryId){const job=jobs.find(j=>j.id===jobId),entry=job?.timeEntries.find(e=>e.id===entryId);if(!entry||!visibleClockEntry(job,entry))return denyAccess();correctionFormBeforeField(jobId,entryId);const form=document.querySelector('#modal form');if(!form)return;form.insertAdjacentHTML('afterbegin',`<label>Personne concernée<select name="person"><option value="0">Toutes les personnes de ce pointage</option>${entry.people.map(id=>`<option value="${id}">${esc(getPerson(id)?.name||'Ancien membre')}</option>`).join('')}</select></label>`);form.insertAdjacentHTML('beforeend','<p id="correctionError" class="form-error" role="alert"></p>')};
saveTimeCorrection=function(event,jobId,entryId){
  event.preventDefault();if(!requireField('requestTimeCorrection'))return;const f=new FormData(event.target),job=jobs.find(j=>j.id===jobId),entry=job?.timeEntries.find(e=>e.id===entryId);if(!entry||!visibleClockEntry(job,entry))return denyAccess();
  const arrival=f.get('arrival'),departure=f.get('departure'),reason=String(f.get('reason')||'').trim(),personId=+f.get('person');
  if(!reason||!arrival||(departure&&departure<=arrival)||(personId&&!entry.people.includes(personId)))return clockError('Renseignez un motif et des heures cohérentes.','correctionError');
  entry.corrections??=[];entry.corrections.push({id:Math.max(Date.now(),...entry.corrections.map(c=>c.id))+1,requestedAt:new Date().toISOString(),requestedBy:clockActor(),personId,original:{arrival:entry.arrival,departure:entry.departure},proposed:{arrival,departure},reason,status:'À valider'});closeModal();render();toast('Correction transmise au responsable. Les heures restent inchangées avant validation.');
};
approveTimeCorrection=function(jobId,entryId,correctionId,approved){
  if(!requireField('approveTimeCorrection'))return;const job=jobs.find(j=>j.id===jobId),entry=job?.timeEntries.find(e=>e.id===entryId),c=entry?.corrections?.find(c=>c.id===correctionId);if(!c||c.status!=='À valider')return;
  if(approved){
    if(entry.arrival!==c.original.arrival||entry.departure!==c.original.departure)return toast('Ce pointage a changé depuis la demande. Créez une nouvelle correction.');
    const ids=c.personId?[c.personId]:entry.people;
    if(c.personId&&!entry.people.includes(c.personId))return toast('Cette personne a déjà un pointage distinct.');
    if(jobs.some(j=>j.timeEntries.some(e=>e!==entry&&e.date===entry.date&&e.people.some(id=>ids.includes(id))&&e.arrival<(c.proposed.departure||'24:00')&&(e.departure||'24:00')>c.proposed.arrival)))return toast('La correction chevauche un autre pointage de cette personne.');
    if(c.personId&&entry.people.length>1){const split={...entry,id:clockId(),people:[c.personId],...c.proposed,corrections:[],history:[...(entry.history||[]),{action:'Correction individuelle : '+c.reason,at:new Date().toISOString(),by:clockActor(),original:c.original}]};entry.people=entry.people.filter(id=>id!==c.personId);job.timeEntries.push(split);c.resultEntryId=split.id;}else Object.assign(entry,c.proposed);
  }
  c.status=approved?'Acceptée':'Refusée';c.reviewedAt=new Date().toISOString();c.reviewedBy=clockActor();entry.history??=[];entry.history.push({action:'Correction '+c.status.toLowerCase()+' : '+c.reason,by:clockActor(),at:c.reviewedAt});closeModal();render();showJob(jobId);toast(approved?'Correction validée. Les totaux sont recalculés.':'Correction refusée.');
};
const personalViewBeforeField=personalView;
personalView=function(){return personalViewBeforeField()+(canViewModule('timeEntries')?`<section class="panel personal-time-history"><div class="panel-head"><div><p class="eyebrow">SUIVI PERSONNEL</p><h2>Mes pointages</h2></div><div><button class="btn" type="button" onclick="openPersonalTimeHistory()">Voir mes pointages</button> <button class="btn" type="button" onclick="timeCorrectionPicker()">Demander une correction</button></div></div><p class="subtle">Consultez votre historique semaine par semaine et vos totaux mensuels.</p></section>`:'')};

let personalClockAnchor=reference,personalClockState={key:'',loading:false,error:'',entries:[]};
function personalClockDate(value){return new Date(String(value)+'T12:00:00')}
function personalClockDateKey(value){return value.toISOString().slice(0,10)}
function personalClockWeekStart(value){const date=personalClockDate(value);date.setDate(date.getDate()-((date.getDay()+6)%7));return personalClockDateKey(date)}
function personalClockWeekEnd(value){const date=personalClockDate(personalClockWeekStart(value));date.setDate(date.getDate()+6);return personalClockDateKey(date)}
function personalClockBounds(value){const date=personalClockDate(value),monthStart=new Date(date.getFullYear(),date.getMonth(),1,12),monthEnd=new Date(date.getFullYear(),date.getMonth()+1,0,12),from=personalClockWeekStart(personalClockDateKey(monthStart)),to=personalClockWeekEnd(personalClockDateKey(monthEnd));return{monthStart:personalClockDateKey(monthStart),monthEnd:personalClockDateKey(monthEnd),from,to}}
function personalClockMinutes(entry){if(!entry.departure)return 0;const [ah,am]=String(entry.arrival||'00:00').split(':').map(Number),[dh,dm]=String(entry.departure||'00:00').split(':').map(Number);return Math.max(0,dh*60+dm-ah*60-am-Number(entry.breakMinutes||0))}
function personalClockTenant(){return String(globalThis.socleCurrentOrganizationId||document.body?.dataset?.organizationId||'')}
function personalClockKey(value){const bounds=personalClockBounds(value);return personalClockTenant()+':'+bounds.from+':'+bounds.to}
async function loadPersonalClockEntries(force=false){const key=personalClockKey(personalClockAnchor);if(personalClockState.loading||(!force&&personalClockState.key===key))return;const bounds=personalClockBounds(personalClockAnchor);personalClockState={key,loading:true,error:'',entries:[]};try{let cursor='',entries=[];do{const query=new URLSearchParams({from:bounds.from,to:bounds.to,limit:'250'});if(cursor)query.set('cursor',cursor);const page=await serverJson('/api/time-entries/mine?'+query.toString());entries.push(...(Array.isArray(page.entries)?page.entries:[]));cursor=page.nextCursor||''}while(cursor);personalClockState.entries=entries;personalClockState.error=''}catch(error){personalClockState.error=error.message||'Historique des pointages indisponible.'}finally{personalClockState.loading=false;if(view==='personal-time-history'&&typeof render==='function')render()}}
function openPersonalTimeHistory(){personalClockAnchor=reference;personalClockState.key='';view='personal-time-history';render()}
function personalClockSetAnchor(value){personalClockAnchor=value;render()}
function personalClockShiftWeek(delta){const date=personalClockDate(personalClockAnchor);date.setDate(date.getDate()+delta*7);personalClockAnchor=personalClockDateKey(date);render()}
function personalClockShiftMonth(delta){const date=personalClockDate(personalClockAnchor);date.setDate(1);date.setMonth(date.getMonth()+delta);personalClockAnchor=personalClockDateKey(date);render()}
function personalClockHistoryView(){const bounds=personalClockBounds(personalClockAnchor),key=personalClockKey(personalClockAnchor);if(personalClockState.key!==key&&!personalClockState.loading)queueMicrotask(()=>loadPersonalClockEntries());const entries=personalClockState.key===key?personalClockState.entries:[],monthEntries=entries.filter(entry=>entry.date>=bounds.monthStart&&entry.date<=bounds.monthEnd),monthMinutes=monthEntries.reduce((sum,entry)=>sum+personalClockMinutes(entry),0),days=new Set(monthEntries.map(entry=>entry.date)).size,weeks=new Map();for(const entry of monthEntries){const start=personalClockWeekStart(entry.date);if(!weeks.has(start))weeks.set(start,[]);weeks.get(start).push(entry)}const weekStart=personalClockWeekStart(personalClockAnchor),weekEnd=personalClockWeekEnd(personalClockAnchor),weekEntries=entries.filter(entry=>entry.date>=weekStart&&entry.date<=weekEnd).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.arrival).localeCompare(String(b.arrival))),weekMinutes=weekEntries.reduce((sum,entry)=>sum+personalClockMinutes(entry),0),label=new Intl.DateTimeFormat('fr-BE',{month:'long',year:'numeric'}).format(personalClockDate(personalClockAnchor));return heading('Mes pointages','Votre historique personnel, limité à vos propres enregistrements.',false)+'<div class="personal-clock-month-nav"><button class="btn" onclick="navigate(\'personal\')">← Mon espace</button><button class="btn" onclick="personalClockShiftMonth(-1)">Mois précédent</button><strong>'+esc(label)+'</strong><button class="btn" onclick="personalClockShiftMonth(1)">Mois suivant</button><button class="btn" onclick="personalClockSetAnchor(reference)">Aujourd’hui</button></div><section class="panel personal-clock-month"><div class="personal-clock-summary"><span>Jours pointés <strong>'+days+'</strong></span><span>Total du mois <strong>'+(monthMinutes/60).toFixed(2)+' h</strong></span></div><div class="personal-clock-weeks">'+[...weeks.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([start,items])=>'<button class="btn '+(start===weekStart?'selected':'')+'" onclick="personalClockSetAnchor(\''+start+'\')"><strong>Semaine du '+fullDate(start)+'</strong><span>'+((items.reduce((sum,entry)=>sum+personalClockMinutes(entry),0))/60).toFixed(2)+' h</span></button>').join('')+'</div></section><section class="panel"><div class="panel-head personal-clock-nav"><button class="btn" onclick="personalClockShiftWeek(-1)">← Semaine précédente</button><strong>'+fullDate(weekStart)+' – '+fullDate(weekEnd)+'</strong><button class="btn" onclick="personalClockShiftWeek(1)">Semaine suivante →</button></div>'+(personalClockState.loading?'<p class="subtle">Chargement de vos pointages…</p>':personalClockState.error?'<p class="notice">'+esc(personalClockState.error)+'</p>':weekEntries.length?weekEntries.map(entry=>{const project=(jobs||[]).find(job=>String(job.id)===String(entry.projectId));return '<article class="personal-clock-entry"><strong>'+fullDate(entry.date)+'</strong><span>'+esc(project?.name||'Chantier')+'</span><span>'+esc(entry.arrival)+' → '+esc(entry.departure||'En cours')+'<small>Pause : '+Number(entry.breakMinutes||0)+' min</small>'+ (entry.archivedAt?'<small>Historique archivé</small>':'') +'</span><strong>'+(personalClockMinutes(entry)/60).toFixed(2)+' h</strong></article>'}).join(''):'<p class="empty">Aucun pointage cette semaine.</p>')+'<p class="personal-clock-week-total">Total de la semaine : '+(weekMinutes/60).toFixed(2)+' h</p><div class="modal-actions"><button class="btn" onclick="timeCorrectionPicker()">Demander une correction</button></div></section>'}
const renderBeforePersonalClockHistory=render;
render=function(){if(view!=='personal-time-history')return renderBeforePersonalClockHistory();const nav=document.querySelector('#nav');if(nav)nav.innerHTML=tabs2.map(([key,label])=>`<button class="${key==='personal'?'active':''}" ${key==='personal'?'aria-current="page"':''} onclick="navigate('${key}')">${label}</button>`).join('');const main=document.querySelector('#main');if(main)main.innerHTML=personalClockHistoryView();scheduleSave()};

// Point 5 — the server is now the source of truth for time entries.
function currentTimeAccess(){return globalThis.socleCurrentAccess||null}
function hasServerTimePermission(code){const access=currentTimeAccess();return Boolean(access?.owner||(access?.permissions||[]).includes(code))}
function currentTimePersonId(){const access=currentTimeAccess();return access?.personId!==undefined&&access?.personId!==null?Number(access.personId):sessionPerson()?.id||null}
function projectAllowedByServer(jobId){const access=currentTimeAccess();if(!access||access.owner||(access.permissions||[]).includes('projects.view.all'))return true;if(jobs.some(job=>job.quickIntervention&&String(job.id)===String(jobId)))return true;return (access.projectIds||[]).map(String).includes(String(jobId))}
function clockScope(teamId,jobId,date=clockDate()){
  if(!projectAllowedByServer(jobId))return false;
  const access=currentTimeAccess(),personId=currentTimePersonId();
  if(access?.owner||hasServerTimePermission('time_entries.view.all'))return true;
  const planned=clockPeople(teamId,jobId,date).map(Number);
  if(hasServerTimePermission('time_entries.view.team')||hasServerTimePermission('time_entries.create.team'))return Boolean(personId&&teams.find(team=>team.id===Number(teamId))?.members?.map(Number).includes(personId));
  return Boolean(personId&&planned.includes(personId));
}
function clockSelectablePeople(teamId,jobId,date=clockDate()){
  const planned=clockPeople(Number(teamId),Number(jobId),date).map(Number),personId=currentTimePersonId();
  if(currentTimeAccess()?.owner||hasServerTimePermission('time_entries.view.all')||hasServerTimePermission('time_entries.create.team'))return planned;
  return personId&&planned.includes(personId)?[personId]:[];
}
function visibleClockEntry(job,entry){
  if(!job||!projectAllowedByServer(job.id))return false;
  if(currentTimeAccess()?.owner||hasServerTimePermission('time_entries.view.all'))return true;
  const personId=currentTimePersonId();
  if(hasServerTimePermission('time_entries.view.team'))return clockScope(entry.team,job.id,entry.date);
  return Boolean(personId&&(entry.people||[]).map(Number).includes(personId));
}
async function loadServerTimeEntries({renderAfter=true}={}){
  jobs.filter(job=>job.quickIntervention).forEach(job=>jobs.splice(jobs.indexOf(job),1));
  try{
    const data=await serverJson('/api/time-entries');
    jobs.forEach(job=>job.timeEntries=[]);
    for(const entry of data.entries||[]){const job=entry.intervention?ensureInterventionJob(entry.intervention):jobs.find(item=>String(item.id)===String(entry.projectId));if(job){job.timeEntries??=[];if(!job.timeEntries.some(item=>String(item.id)===String(entry.id)))job.timeEntries.push(entry)}}
  }catch(error){
    // A role without time-entry visibility must not receive legacy pointages from /api/state.
    jobs.forEach(job=>job.timeEntries=[]);
    if(!/autorisation|consulter les pointages/i.test(error.message||''))console.warn('SOCLE time entries',error);
  }
  if(renderAfter&&storageReady)render();
}
globalThis.loadServerTimeEntries=loadServerTimeEntries;

// Never persist server-backed time entries again through the owner-only legacy workspace route.
const workspaceSnapshotBeforeServerTime=workspaceSnapshot;
workspaceSnapshot=function(){const state=JSON.parse(workspaceSnapshotBeforeServerTime());state.jobs=(state.jobs||[]).filter(job=>!job.quickIntervention);for(const job of state.jobs)job.timeEntries=[];return JSON.stringify(state)};

refreshArrivalPeople=function(){
  const form=document.querySelector('#modal form'),team=Number(form?.elements.team?.value||0),job=Number(form?.elements.job?.value||0),ids=clockSelectablePeople(team,job);
  const target=document.querySelector('#arrivalPeople');if(!target)return;
  target.innerHTML=!team||!job?'':`<p class="form-section-title">Personnes présentes</p><p class="help-line">Décochez les absents. Une arrivée différente permet de noter un retard individuel.</p><div class="arrival-people">${ids.map(id=>`<div><label><input type="checkbox" name="present" value="${id}" checked>${esc(getPerson(id)?.name||'Membre')}</label><label>Arrivée de ${esc(getPerson(id)?.name||'Membre')}<input type="time" name="arrival-${id}" value="${form.elements.arrival.value}" required></label></div>`).join('')}</div>`;
};

saveFieldArrival=async function(event){
  event.preventDefault();if(!requireField('logHours'))return;
  const f=new FormData(event.target),team=teams.find(t=>t.id===Number(f.get('team'))),job=activeJobsForPlanning().find(j=>j.id===Number(f.get('job'))),date=clockDate();
  if(!team||!job||!clockScope(team.id,job.id,date))return clockError('Choisissez votre équipe et un chantier autorisé.');
  const planned=clockSelectablePeople(team.id,job.id,date),ids=[...new Set(f.getAll('present').map(Number))];
  if(!ids.length||ids.some(id=>!planned.includes(id)))return clockError('Choisissez au moins une personne autorisée et prévue.');
  const peoplePayload=ids.map(id=>({personId:String(id),arrival:String(f.get('arrival-'+id)||f.get('arrival')||'')}));
  if(peoplePayload.some(item=>!/^([01]\d|2[0-3]):[0-5]\d$/.test(item.arrival)))return clockError('Renseignez une heure d’arrivée valide.');
  const button=event.target.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;
  try{await serverJson('/api/time-entries/arrival',{method:'POST',body:JSON.stringify({projectId:String(job.id),teamId:String(team.id),date,people:peoplePayload,note:String(f.get('note')||'').trim()})});closeModal();await loadServerTimeEntries();toast('Arrivée enregistrée côté serveur. Le bouton de départ est disponible.')}catch(error){clockError(error.message||'Pointage refusé.');if(button)button.disabled=false}
};

fieldTimeForm=function(){
  if(!requireField('logHours'))return;
  const open=openTodayEntries();modal('Pointer le départ',`<p class="notice">Choisissez le pointage à terminer. Si plusieurs personnes partent à des heures différentes, vous pourrez sélectionner uniquement celles qui terminent.</p><div class="field-open-entries">${open.map(({job,entry,team})=>`<button onclick="teamClockOutForm('${jsString(job.id)}','${jsString(entry.id)}')"><span><strong>${esc(team?.name||'Équipe')} · ${fullDate(entry.date)}</strong><small>${esc(job.name)} · ${esc((entry.people||[]).map(id=>getPerson(Number(id))?.name).filter(Boolean).join(', '))}</small><small>Arrivée à ${esc(entry.arrival)}</small></span><b>Pointer le départ</b></button>`).join('')||'<p>Aucun pointage ouvert.</p>'}</div><div class="modal-actions"><button class="btn" onclick="fieldArrivalForm()">Pointer une arrivée</button><button class="btn" onclick="timeCorrectionPicker()">Historique / correction</button></div>`);
};
teamClockOutForm=function(jobId,entryId){
  if(!requireField('logHours'))return;const job=jobs.find(j=>String(j.id)===String(jobId)),entry=job?.timeEntries.find(e=>String(e.id)===String(entryId));
  if(!entry||entry.departure||!visibleClockEntry(job,entry))return denyAccess();
  const selectable=(entry.people||[]).map(Number).filter(id=>currentTimeAccess()?.owner||hasServerTimePermission('time_entries.create.team')||id===currentTimePersonId());
  modal('Pointer le départ',`<form onsubmit="saveTeamClockOut(event,'${jsString(job.id)}','${jsString(entry.id)}')"><p><strong>${esc(job.name)}</strong> · ${fullDate(entry.date)}</p><p>Arrivée : ${esc(entry.arrival)}</p>${entry.date!==clockDate()?'<p class="notice">Départ oublié : indiquez l’heure de départ de cette journée.</p>':''}<p class="form-section-title">Personnes qui terminent</p><div class="check-people compact-recipients">${selectable.map(id=>`<label><input type="checkbox" name="person" value="${id}" checked>${esc(getPerson(id)?.name||'Membre')}</label>`).join('')}</div><label>Heure de départ<input name="departure" type="time" required value="${entry.date===clockDate()?clockTime():'16:15'}"></label><label>Remarque<input name="note" maxlength="250"></label><p id="clockOutError" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn primary">Confirmer le départ</button></div></form>`);
};
saveTeamClockOut=async function(event,jobId,entryId){
  event.preventDefault();if(!requireField('logHours'))return;const f=new FormData(event.target),job=jobs.find(j=>String(j.id)===String(jobId)),entry=job?.timeEntries.find(e=>String(e.id)===String(entryId)),departure=String(f.get('departure')||''),personIds=[...new Set(f.getAll('person').map(String))];
  if(!entry||!visibleClockEntry(job,entry)||entry.departure)return denyAccess('Ce pointage est déjà terminé ou inaccessible.');
  if(!personIds.length)return clockError('Choisissez au moins une personne.','clockOutError');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)||departure<=entry.arrival)return clockError('Le départ doit être postérieur à l’arrivée.','clockOutError');
  const button=event.target.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;
  try{await serverJson('/api/time-entries/'+encodeURIComponent(entry.id)+'/departure',{method:'POST',body:JSON.stringify({departure,note:String(f.get('note')||'').trim(),personIds})});closeModal();await loadServerTimeEntries();toast('Départ enregistré côté serveur. Les heures sont recalculées.')}catch(error){clockError(error.message||'Départ refusé.','clockOutError');if(button)button.disabled=false}
};

allRecentTimeEntries=function(){return jobs.flatMap(job=>(job.timeEntries||[]).filter(e=>e.date<=clockDate()&&visibleClockEntry(job,e)).map(entry=>({job,entry,team:teams.find(t=>String(t.id)===String(entry.team))}))).sort((a,b)=>b.entry.date.localeCompare(a.entry.date)||String(b.entry.id).localeCompare(String(a.entry.id)))};
timeCorrectionPicker=function(){if(!requireField('requestTimeCorrection'))return;modal('Historique des pointages',`<div class="correction-picker">${allRecentTimeEntries().map(({job,entry})=>`<button onclick="timeCorrectionForm('${jsString(job.id)}','${jsString(entry.id)}')"><span><strong>${fullDate(entry.date)} · ${esc(job.name)}</strong><small>${esc(entry.people.map(id=>getPerson(Number(id))?.name||'Ancien membre').join(', '))}</small><small>${esc(entry.note||'')} · ${(netMinutes(entry)/60).toFixed(2)} h par personne</small></span><b>${esc(entry.arrival)} → ${esc(entry.departure||'En cours')}</b></button>`).join('')||'<p>Aucun pointage.</p>'}</div>`)};
timeCorrectionForm=function(jobId,entryId){
  if(!requireField('requestTimeCorrection'))return;const job=jobs.find(j=>String(j.id)===String(jobId)),entry=job?.timeEntries.find(e=>String(e.id)===String(entryId));if(!entry||!visibleClockEntry(job,entry))return denyAccess();
  const personId=currentTimePersonId(),canChoose=currentTimeAccess()?.owner||hasServerTimePermission('time_entries.view.team')||hasServerTimePermission('time_entries.view.all'),choices=(entry.people||[]).map(Number).filter(id=>canChoose||id===personId);
  modal('Demande de correction',`<form onsubmit="saveTimeCorrection(event,'${jsString(job.id)}','${jsString(entry.id)}')">${choices.length>1?`<label>Personne concernée<select name="person"><option value="0">Toutes les personnes de ce pointage</option>${choices.map(id=>`<option value="${id}">${esc(getPerson(id)?.name||'Ancien membre')}</option>`).join('')}</select></label>`:`<input type="hidden" name="person" value="${choices[0]||personId||0}">`}<div class="form-two"><label>Arrivée corrigée<input name="arrival" type="time" required value="${esc(entry.arrival)}"></label><label>Départ corrigé<input name="departure" type="time" value="${esc(entry.departure||'')}"></label></div><label>Pourquoi faut-il corriger ?<textarea name="reason" rows="4" required maxlength="500" placeholder="Pointé trop tôt, oubli de départ, mauvais chantier…"></textarea></label><p class="notice">L’heure originale restera dans l’historique. Une personne autorisée validera la correction.</p><p id="correctionError" class="form-error" role="alert"></p><div class="modal-actions"><button class="btn primary">Envoyer la demande</button></div></form>`);
};
saveTimeCorrection=async function(event,jobId,entryId){
  event.preventDefault();if(!requireField('requestTimeCorrection'))return;const f=new FormData(event.target),job=jobs.find(j=>String(j.id)===String(jobId)),entry=job?.timeEntries.find(e=>String(e.id)===String(entryId));if(!entry||!visibleClockEntry(job,entry))return denyAccess();
  const arrival=String(f.get('arrival')||''),departure=String(f.get('departure')||''),reason=String(f.get('reason')||'').trim(),personId=Number(f.get('person')||0);
  if(!reason||!arrival||(departure&&departure<=arrival)||(personId&&!entry.people.map(Number).includes(personId)))return clockError('Renseignez un motif et des heures cohérentes.','correctionError');
  const button=event.target.querySelector('button[type="submit"],button:not([type])');if(button)button.disabled=true;
  try{await serverJson('/api/time-entries/'+encodeURIComponent(entry.id)+'/corrections',{method:'POST',body:JSON.stringify({personId:personId?String(personId):null,arrival,departure:departure||null,reason})});closeModal();await loadServerTimeEntries();toast('Correction transmise au responsable. Les heures restent inchangées avant validation.')}catch(error){clockError(error.message||'Correction refusée.','correctionError');if(button)button.disabled=false}
};
approveTimeCorrection=async function(jobId,entryId,correctionId,approved){
  if(!requireField('approveTimeCorrection'))return;const job=jobs.find(j=>String(j.id)===String(jobId)),entry=job?.timeEntries.find(e=>String(e.id)===String(entryId)),correction=entry?.corrections?.find(item=>String(item.id)===String(correctionId));if(!correction||correction.status!=='À valider')return;
  try{await serverJson('/api/time-entry-corrections/'+encodeURIComponent(correction.id)+'/review',{method:'POST',body:JSON.stringify({approved:Boolean(approved)})});closeModal();await loadServerTimeEntries();if(view==='jobs')showJob(job.id);toast(approved?'Correction validée côté serveur.':'Correction refusée côté serveur.')}catch(error){toast(error.message||'Validation refusée.')}
};

// Historical pointage entry points now use the same server routes.
saveTeamClockIn=async function(event,jobId,teamId){
  event.preventDefault();if(!requireField('logHours'))return;const f=new FormData(event.target),peopleIds=clockSelectablePeople(teamId,jobId,reference);if(!peopleIds.length)return toast('Aucune personne autorisée à pointer.');
  try{await serverJson('/api/time-entries/arrival',{method:'POST',body:JSON.stringify({projectId:String(jobId),teamId:String(teamId),date:reference,people:peopleIds.map(personId=>({personId:String(personId),arrival:String(f.get('arrival')||'')})),note:String(f.get('note')||'').trim()})});closeModal();await loadServerTimeEntries();toast('Arrivée enregistrée côté serveur.')}catch(error){toast(error.message)}
};
saveQuickTime=async function(event){
  event.preventDefault();if(!requireField('logHours'))return;const f=new FormData(event.target),job=jobs.find(j=>j.id===Number(f.get('job'))),team=teams.find(t=>t.id===Number(f.get('team'))),date=String(f.get('date')||''),arrival=String(f.get('arrival')||''),departure=String(f.get('departure')||'');if(!job||!team)return;if(departure<=arrival)return clockError('L’heure de départ doit être postérieure à l’arrivée.','quickTimeError');
  const peopleIds=clockSelectablePeople(team.id,job.id,date);if(!peopleIds.length)return clockError('Aucune personne autorisée à pointer pour cette équipe.','quickTimeError');
  try{const result=await serverJson('/api/time-entries/arrival',{method:'POST',body:JSON.stringify({projectId:String(job.id),teamId:String(team.id),date,people:peopleIds.map(personId=>({personId:String(personId),arrival})),note:String(f.get('note')||'').trim()})});for(const id of result.ids||[])await serverJson('/api/time-entries/'+encodeURIComponent(id)+'/departure',{method:'POST',body:JSON.stringify({departure,personIds:peopleIds.map(String)})});closeModal();await loadServerTimeEntries();toast(`Heures enregistrées côté serveur pour ${peopleIds.length} personne(s).`)}catch(error){clockError(error.message||'Enregistrement refusé.','quickTimeError')}
};

// Older chantier/compact forms are kept for compatibility but now write through the server too.
saveArrival=async function(event,jobId){
  event.preventDefault();if(!requireField('logHours'))return;const f=new FormData(event.target),job=jobs.find(item=>String(item.id)===String(jobId)),team=teams.find(item=>item.id===Number(f.get('team'))),date=String(f.get('date')||'');if(!job||!team)return;
  const peopleIds=clockSelectablePeople(team.id,job.id,date);if(!peopleIds.length)return toast('Aucune personne autorisée à pointer pour cette équipe.');
  try{await serverJson('/api/time-entries/arrival',{method:'POST',body:JSON.stringify({projectId:String(job.id),teamId:String(team.id),date,people:peopleIds.map(personId=>({personId:String(personId),arrival:String(f.get('arrival')||'')})),note:String(f.get('note')||'').trim()})});closeModal();await loadServerTimeEntries();showJob(job.id);toast('Arrivée enregistrée côté serveur.')}catch(error){toast(error.message)}
};
saveDeparture=async function(event,jobId,entryId){
  event.preventDefault();if(!requireField('logHours'))return;const f=new FormData(event.target),job=jobs.find(item=>String(item.id)===String(jobId)),entry=job?.timeEntries.find(item=>String(item.id)===String(entryId));if(!entry||!visibleClockEntry(job,entry))return denyAccess();
  const personId=currentTimePersonId(),personIds=(entry.people||[]).map(Number).filter(id=>currentTimeAccess()?.owner||hasServerTimePermission('time_entries.create.team')||id===personId).map(String);if(!personIds.length)return toast('Aucune personne autorisée à clôturer.');
  try{await serverJson('/api/time-entries/'+encodeURIComponent(entry.id)+'/departure',{method:'POST',body:JSON.stringify({departure:String(f.get('departure')||''),note:String(f.get('note')||'').trim(),personIds})});closeModal();await loadServerTimeEntries();showJob(job.id);toast('Départ enregistré côté serveur.')}catch(error){toast(error.message)}
};
saveCompactArrival=async function(event){
  event.preventDefault();if(!requireField('logHours'))return;const f=new FormData(event.target),assignment=assignments.find(item=>item.id===Number(f.get('assignment'))),job=jobs.find(item=>item.id===assignment?.job),team=teams.find(item=>item.id===assignment?.team);if(!assignment||!job||!team)return;
  const peopleIds=clockSelectablePeople(team.id,job.id,reference);if(!peopleIds.length)return toast('Aucune personne autorisée à pointer.');
  try{await serverJson('/api/time-entries/arrival',{method:'POST',body:JSON.stringify({projectId:String(job.id),teamId:String(team.id),date:reference,people:peopleIds.map(personId=>({personId:String(personId),arrival:String(f.get('arrival')||'')})),note:String(f.get('note')||'').trim()})});closeModal();await loadServerTimeEntries();toast('Arrivée enregistrée côté serveur.')}catch(error){toast(error.message)}
};

// Dedicated, server-scoped entry point for finding pointages across the workspace.
if(!tabs2.some(([key])=>key==='timeEntries')){
  const planningIndex=tabs2.findIndex(([key])=>key==='planning');
  tabs2.splice(planningIndex<0?tabs2.length:planningIndex+1,0,['timeEntries','Pointages']);
}
const canViewModuleBeforeTimeEntries=canViewModule;
canViewModule=function(target){
  if(target==='timeEntries'||target==='personal-time-history'){
    const access=currentTimeAccess();
    return Boolean(sessionAccessKey==='owner'||(!access?.owner&&['time_entries.view.own','time_entries.view.team','time_entries.view.all'].some(hasServerTimePermission)));
  }
  return canViewModuleBeforeTimeEntries(target);
};
let timeEntriesAnchor=reference;
let timeEntriesPageState={key:'',entries:[],cursor:'',loading:false,error:'',report:null};
let timeEntryReportMode='team',timeEntryReportTeam='all',timeEntryReportPerson='all',timeEntryReportSettingsTenant='';
function loadTimeEntryReportSettings(){const tenant=personalClockTenant();if(timeEntryReportSettingsTenant===tenant)return;timeEntryReportSettingsTenant=tenant;timeEntryReportMode='team';timeEntryReportTeam='all';timeEntryReportPerson='all';try{const saved=JSON.parse(localStorage.getItem('socle.time-report.'+tenant)||'{}');if(saved.mode==='person'||saved.mode==='team')timeEntryReportMode=saved.mode;if(typeof saved.team==='string'&&saved.team)timeEntryReportTeam=saved.team;if(typeof saved.person==='string'&&saved.person)timeEntryReportPerson=saved.person}catch{}}
function saveTimeEntryReportSettings(){try{localStorage.setItem('socle.time-report.'+personalClockTenant(),JSON.stringify({mode:timeEntryReportMode,team:timeEntryReportTeam,person:timeEntryReportPerson}))}catch{}}
function setTimeEntryReportMode(value){if(value!=='person'&&value!=='team')return;timeEntryReportMode=value;timeEntryReportTeam='all';timeEntryReportPerson='all';saveTimeEntryReportSettings();render()}
function setTimeEntryReportTeam(value){timeEntryReportTeam=String(value||'all');saveTimeEntryReportSettings();render()}
function setTimeEntryReportPerson(value){timeEntryReportPerson=String(value||'all');saveTimeEntryReportSettings();render()}
function timeEntryOwnerBreakdown(report){
  loadTimeEntryReportSettings();
  const entries=report.entries||[],teamsById=new Map((teams||[]).map(team=>[String(team.id),team])),peopleById=new Map((report.people||[]).map(person=>[String(person.personId),person])),availableTeams=new Map(),availablePeople=report.people||[],hasIndividual=entries.some(entry=>!String(entry.team||'').trim());
  for(const entry of entries){const teamId=String(entry.team||'').trim();if(teamId)availableTeams.set(teamId,teamsById.get(teamId)?.name||'Équipe')}
  if(timeEntryReportTeam!=='all'&&timeEntryReportTeam!=='__individual__'&&!availableTeams.has(timeEntryReportTeam))timeEntryReportTeam='all';
  if(timeEntryReportPerson!=='all'&&!availablePeople.some(person=>String(person.personId)===timeEntryReportPerson))timeEntryReportPerson='all';
  const modeOptions='<option value="team" '+(timeEntryReportMode==='team'?'selected':'')+'>Par équipe</option><option value="person" '+(timeEntryReportMode==='person'?'selected':'')+'>Par personne</option>';
  const teamOptions='<option value="all">Toutes les équipes</option>'+[...availableTeams].sort((a,b)=>a[1].localeCompare(b[1],'fr')).map(([id,name])=>'<option value="'+esc(id)+'" '+(timeEntryReportTeam===id?'selected':'')+'>'+esc(name)+'</option>').join('')+(hasIndividual?'<option value="__individual__" '+(timeEntryReportTeam==='__individual__'?'selected':'')+'>Interventions individuelles</option>':'');
  const personOptions='<option value="all">Toutes les personnes</option>'+availablePeople.slice().sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(person=>'<option value="'+esc(person.personId)+'" '+(timeEntryReportPerson===String(person.personId)?'selected':'')+'>'+esc(person.name)+'</option>').join('');
  const controls='<div class="time-month-owner-controls"><label>Regrouper les heures<select aria-label="Regrouper les heures" onchange="setTimeEntryReportMode(this.value)">'+modeOptions+'</select></label>'+(timeEntryReportMode==='team'?'<label>Équipe affichée<select aria-label="Équipe affichée" onchange="setTimeEntryReportTeam(this.value)">'+teamOptions+'</select></label>':'<label>Personne affichée<select aria-label="Personne affichée" onchange="setTimeEntryReportPerson(this.value)">'+personOptions+'</select></label>')+'</div><p class="time-month-team-note">Par équipe, le total additionne les heures de chaque personne. Vous pouvez aussi isoler une personne ou une intervention individuelle.</p>';
  let peopleMarkup='';
  if(timeEntryReportMode==='person'){const selectedPeople=availablePeople.filter(person=>timeEntryReportPerson==='all'||String(person.personId)===timeEntryReportPerson);peopleMarkup=selectedPeople.length?'<div class="time-month-person-list">'+selectedPeople.map(person=>'<article><strong>'+esc(person.name)+'</strong><span>'+Number(person.hours||0).toFixed(2)+' h · '+Number(person.entries||0)+' pointage(s)</span><small>'+(person.projects||[]).map(project=>esc(project.projectName)+' · '+Number(project.hours||0).toFixed(2)+' h').join(' · ')+'</small></article>').join('')+'</div>':'<p class="empty">Aucun pointage terminé pour cette personne ce mois-ci.</p>'}
  else{
    const grouped=new Map();
    for(const entry of entries){if(!entry.departure)continue;const teamId=String(entry.team||'').trim(),groupId=teamId||'__individual__';if(timeEntryReportTeam!=='all'&&timeEntryReportTeam!==groupId)continue;if(!grouped.has(groupId))grouped.set(groupId,{id:groupId,name:teamId?(teamsById.get(teamId)?.name||availableTeams.get(teamId)||'Équipe'):'Interventions individuelles',minutes:0,entryIds:new Set(),people:new Map()});const group=grouped.get(groupId),minutes=personalClockMinutes(entry);group.entryIds.add(String(entry.id));for(const rawId of entry.people||[]){const id=String(rawId),person=peopleById.get(id),name=person?.name||getPerson(Number(id))?.name||getPerson(id)?.name||'Membre';if(!group.people.has(id))group.people.set(id,{name,minutes:0,entries:0});const member=group.people.get(id);member.minutes+=minutes;member.entries++;group.minutes+=minutes}}
    peopleMarkup=grouped.size?'<div class="time-month-team-list">'+[...grouped.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(group=>'<article><header><strong>'+esc(group.name)+'</strong><span>'+((group.minutes/60).toFixed(2))+' h cumulées · '+group.people.size+' personne(s) · '+group.entryIds.size+' pointage(s)</span></header><div>'+[...group.people.values()].sort((a,b)=>a.name.localeCompare(b.name,'fr')).map(person=>'<p><strong>'+esc(person.name)+'</strong><span>'+((person.minutes/60).toFixed(2))+' h · '+person.entries+' pointage(s)</span></p>').join('')+'</div></article>').join('')+'</div>':'<p class="empty">Aucun pointage terminé pour cette équipe ce mois-ci.</p>';
  }
  const projectsMarkup=report.projects?.length?'<div class="time-month-project-list">'+report.projects.map(project=>'<div><span>'+esc(project.projectName)+'</span><strong>'+Number(project.hours||0).toFixed(2)+' h</strong></div>').join('')+'</div>':'<p class="empty">Aucun chantier avec des heures terminées.</p>';
  return '<div class="time-month-breakdown"><section><h3>'+ (timeEntryReportMode==='team'?'Heures par équipe':'Heures par personne')+'</h3>'+controls+peopleMarkup+'</section><section><h3>Heures par chantier</h3>'+projectsMarkup+'</section></div>';
}
function timeEntriesPageKey(value){const bounds=personalClockBounds(value),access=currentTimeAccess()||{},permissions=(access.permissions||[]).filter(code=>/^time_entries\.|^projects\.view\./.test(code)).sort().join(','),projects=(access.projectIds||[]).map(String).sort().join(',');return personalClockTenant()+':'+String(globalThis.socleAccessPreview?.userId||access.userId||sessionAccessKey)+':'+String(access.roleCode||'')+':'+String(access.personId||currentTimePersonId()||'')+':'+permissions+':'+projects+':'+bounds.from+':'+bounds.to}
async function loadTimeEntriesPage(reset=false){
  const key=timeEntriesPageKey(timeEntriesAnchor),bounds=personalClockBounds(timeEntriesAnchor);
  if((timeEntriesPageState.loading&&timeEntriesPageState.key===key)||(!reset&&timeEntriesPageState.key===key&&timeEntriesPageState.report))return;
  timeEntriesPageState={key,entries:[],cursor:'',loading:true,error:'',report:null};
  try{
    const month=bounds.monthStart.slice(0,7),report=await serverJson('/api/time-entries/monthly?month='+encodeURIComponent(month));
    if(timeEntriesPageKey(timeEntriesAnchor)!==key)return;
    for(const entry of report.entries||[]){const job=entry.intervention?ensureInterventionJob(entry.intervention):jobs.find(item=>String(item.id)===String(entry.projectId));if(job){job.timeEntries??=[];if(!job.timeEntries.some(item=>String(item.id)===String(entry.id)))job.timeEntries.push(entry)}}
    timeEntriesPageState={key,entries:Array.isArray(report.entries)?report.entries:[],cursor:'',loading:false,error:'',report};
  }catch(error){if(timeEntriesPageState.key===key)timeEntriesPageState.error=error.message||'Les pointages ne sont pas disponibles.'}
  finally{if(timeEntriesPageState.key===key){timeEntriesPageState.loading=false;if(view==='timeEntries')render()}}
}
function shiftTimeEntriesMonth(delta){const date=personalClockDate(timeEntriesAnchor);date.setDate(1);date.setMonth(date.getMonth()+delta);timeEntriesAnchor=personalClockDateKey(date);timeEntriesPageState={key:'',entries:[],cursor:'',loading:false,error:'',report:null};render()}
async function archiveTimeEntriesMonth(){const report=timeEntriesPageState.report;if(!report?.canClose||report.closedAt)return;const missing=Number(report.summary?.plannedWithoutPunch||0),message=missing?`Il reste ${missing} journée(s) planifiée(s) sans pointage. Elles resteront « à vérifier », pas déclarées absentes. Confirmer quand même la sauvegarde et l’archivage du mois ?`:`Sauvegarder et archiver les pointages de ${report.month} ?`;if(!globalThis.confirm(message))return;try{await serverJson('/api/time-entries/monthly/close',{method:'POST',body:JSON.stringify({month:report.month,confirmMissingPunches:missing>0})});await loadTimeEntriesPage(true);toast('Mois sauvegardé. Les pointages restent consultables dans l’historique.')}catch(error){toast(error.message||'Archivage du mois impossible.')}}
function reviewTimeEntryCorrection(projectId,entryId,correctionId){
  if(!requireField('approveTimeCorrection'))return;
  const job=jobs.find(item=>String(item.id)===String(projectId)),entry=job?.timeEntries.find(item=>String(item.id)===String(entryId)),correction=entry?.corrections?.find(item=>String(item.id)===String(correctionId));
  if(!entry||!correction||correction.status!=='À valider')return;
  const person=correction.personId?getPerson(Number(correction.personId))?.name:'Toutes les personnes du pointage';
  modal('Correction de pointage',`<div class="correction-history"><article><strong>${fullDate(entry.date)} · ${esc(job.name)}</strong><p>${esc(person||'Personne concernée')}</p><p>Heures actuelles : ${esc(correction.original.arrival)} → ${esc(correction.original.departure||'—')}</p><p>Heures proposées : ${esc(correction.proposed.arrival)} → ${esc(correction.proposed.departure||'—')}</p><p>Motif : ${esc(correction.reason)}</p><p class="notice">La correction ne sera appliquée qu’après votre validation. La valeur d’origine restera dans l’historique.</p><div class="modal-actions"><button class="btn" type="button" onclick="approveTimeCorrection('${jsString(job.id)}','${jsString(entry.id)}','${jsString(correction.id)}',false)">Refuser</button><button class="btn primary" type="button" onclick="approveTimeCorrection('${jsString(job.id)}','${jsString(entry.id)}','${jsString(correction.id)}',true)">Valider la correction</button></div></article></div>`)
}
function timeEntriesView(){
  const key=timeEntriesPageKey(timeEntriesAnchor),bounds=personalClockBounds(timeEntriesAnchor);
  if(timeEntriesPageState.key!==key&&!timeEntriesPageState.loading)queueMicrotask(()=>loadTimeEntriesPage(true));
  const report=timeEntriesPageState.key===key?timeEntriesPageState.report:null,entries=timeEntriesPageState.key===key?timeEntriesPageState.entries:[],open=entries.filter(entry=>!entry.departure),summary=report?.summary||{},label=new Intl.DateTimeFormat('fr-BE',{month:'long',year:'numeric'}).format(personalClockDate(timeEntriesAnchor)),personNames=new Map((report?.people||[]).map(person=>[String(person.personId),person.name]));
  const role=currentTimeAccess()?.roleCode||'',title=report?.canClose?'Contrôle mensuel':role==='TEAM_LEAD'?'Pointages de mon équipe':role==='PROJECT_MANAGER'?'Pointages de mes chantiers':'Mes pointages',scopeLabel=report?.canClose?'BILAN ENTREPRISE':role==='TEAM_LEAD'?'BILAN ÉQUIPE':role==='PROJECT_MANAGER'?'BILAN CHANTIERS':'MES HEURES',scopeTitle=report?.canClose?'Bilan mensuel':role==='TEAM_LEAD'?'Bilan de mon équipe':role==='PROJECT_MANAGER'?'Bilan de mes chantiers':'Mes heures du mois';
  const rows=entries.map(entry=>{const job=jobs.find(item=>String(item.id)===String(entry.projectId)),team=teams.find(item=>String(item.id)===String(entry.team)),names=(entry.people||[]).map(id=>personNames.get(String(id))||getPerson(Number(id))?.name||getPerson(id)?.name||'Membre').join(', '),pendingCorrections=(entry.corrections||[]).filter(item=>item.status==='À valider'),pending=pendingCorrections.length>0,intervention=entry.intervention,archived=Boolean(entry.archivedAt),reviewAction=pending&&canFieldAction('approveTimeCorrection')?pendingCorrections.map(item=>`<button class="btn" onclick="reviewTimeEntryCorrection('${jsString(entry.projectId)}','${jsString(entry.id)}','${jsString(item.id)}')">Examiner la correction</button>`).join(''):'';return `<article class="personal-clock-entry time-entry-list-row"><strong>${fullDate(entry.date)}${archived?'<small class="time-entry-archive-label">Archivé · historique conservé</small>':''}</strong><span>${esc(job?.name||intervention?.title||'Intervention à rapprocher')}${intervention?`<small>${esc(intervention.client)} · ${esc(intervention.place)}</small><small>${esc(intervention.workNote||'')}</small>`:''}</span><span>${esc(team?.name||'Intervention')} · ${esc(names||'Personne')}</span><span>${esc(entry.arrival)} → ${esc(entry.departure||'En cours')}<small>${entry.departure?(personalClockMinutes(entry)/60).toFixed(2)+' h par personne · pause '+Number(entry.breakMinutes||0)+' min':'Départ à pointer'}${pending?' · Correction à valider':''}</small></span>${reviewAction||(!entry.departure&&canFieldAction('logHours')?`<button class="btn" onclick="teamClockOutForm('${jsString(entry.projectId)}','${jsString(entry.id)}')">Pointer le départ</button>`:canFieldAction('requestTimeCorrection')?`<button class="btn" onclick="timeCorrectionFormForEntry('${jsString(entry.projectId)}','${jsString(entry.id)}')">Signaler une erreur</button>`:'<span class="badge">'+(pending?'À valider':'Terminé')+'</span>')}</article>`}).join('');
  const actions=canFieldAction('logHours')?'<div class="personal-clock-month-nav"><button class="btn primary" onclick="fieldArrivalForm()">Pointer une arrivée</button><button class="btn" onclick="fieldTimeForm()">Pointer un départ</button></div>':'';
  const reportPanel=report?`<section class="panel time-month-report"><div class="panel-head"><div><p class="eyebrow">${scopeLabel}</p><h2>${scopeTitle}</h2><span>${report.closedAt?'Mois archivé · les responsables autorisés peuvent encore corriger les pointages.':'Calculé depuis les pointages terminés · les pauses sont déduites.'}</span></div><span class="badge ${report.closedAt?'green':'warn'}">${report.closedAt?'Archivé':'En cours'}</span></div><div class="time-month-stats"><div><span>Heures calculées</span><strong>${Number(summary.totalHours||0).toFixed(2)} h</strong></div><div><span>Pointages terminés</span><strong>${Number(summary.completedEntries||0)}</strong></div><div><span>À vérifier</span><strong>${Number(summary.plannedWithoutPunch||0)}</strong></div><div><span>Absences déclarées</span><strong>${Number(summary.declaredAbsences||0)}</strong></div><div><span>Départs en cours</span><strong>${Number(summary.openEntries||0)}</strong></div></div>${report.canClose?`<div class="time-month-actions"><button class="btn" onclick="loadTimeEntriesPage(true)">Recalculer les heures</button>${!report.closedAt?`<button class="btn primary" onclick="archiveTimeEntriesMonth()" ${summary.openEntries||summary.pendingCorrections?'disabled title="Terminez les départs ouverts et corrections en attente avant l’archivage."':''}>Sauvegarder et archiver le mois</button>`:''}</div>`:''}${report.canClose?timeEntryOwnerBreakdown(report):report.canClose||role==='PROJECT_MANAGER'||role==='TEAM_LEAD'?`<div class="time-month-breakdown"><div><h3>Heures par personne</h3>${report.people?.length?`<div class="time-month-person-list">${report.people.map(person=>`<article><strong>${esc(person.name)}</strong><span>${Number(person.hours||0).toFixed(2)} h · ${Number(person.entries||0)} pointage(s)</span><small>${(person.projects||[]).map(project=>`${esc(project.projectName)} · ${Number(project.hours||0).toFixed(2)} h`).join(' · ')}</small></article>`).join('')}</div>`:'<p class="empty">Aucun pointage terminé ce mois-ci.</p>'}</div><div><h3>Heures par chantier</h3>${report.projects?.length?`<div class="time-month-project-list">${report.projects.map(project=>`<div><span>${esc(project.projectName)}</span><strong>${Number(project.hours||0).toFixed(2)} h</strong></div>`).join('')}</div>`:'<p class="empty">Aucun chantier avec des heures terminées.</p>'}</div></div>`:''}${report.missingPunches?.length?`<div class="time-month-attention"><h3>À vérifier · pas automatiquement une absence</h3>${report.missingPunches.map(item=>`<p><strong>${esc(item.personName)}</strong> · ${fullDate(item.date)} · ${esc((item.projectNames||[]).join(', '))}</p>`).join('')}</div>`:''}${report.declaredAbsences?.length?`<div class="time-month-absences"><h3>Absences déclarées</h3>${report.declaredAbsences.map(item=>`<p><strong>${esc(item.personName)}</strong> · ${fullDate(item.startsAt.slice(0,10))}${item.endsAt.slice(0,10)!==item.startsAt.slice(0,10)?' → '+fullDate(item.endsAt.slice(0,10)):''} · ${esc(({absence:'Absence déclarée',leave:'Congé',sickness:'Absence maladie',training:'Formation',unavailable:'Indisponibilité',indisponibilité:'Indisponibilité'})[item.type]||item.type)}</p>`).join('')}</div>`:''}</section>`:'';
  return heading('Pointages',report?.canClose?'Calculez, vérifiez puis archivez les heures de l’entreprise.':'Retrouvez les heures enregistrées pour vous ou votre équipe.',false)+actions+`<div class="personal-clock-month-nav"><button class="btn" onclick="shiftTimeEntriesMonth(-1)">Mois précédent</button><strong>${esc(label)}</strong><button class="btn" onclick="shiftTimeEntriesMonth(1)">Mois suivant</button><button class="btn" onclick="timeEntriesAnchor=reference;timeEntriesPageState={key:'',entries:[],cursor:'',loading:false,error:'',report:null};render()">Ce mois-ci</button><button class="btn" onclick="loadTimeEntriesPage(true)">Actualiser</button></div>${reportPanel}<section class="panel time-month-history"><div class="panel-head"><div><h2>Historique</h2><span>Vos droits déterminent les personnes et chantiers affichés. Les interventions hors planning restent dans le relevé pour être rapprochées.</span></div></div>${timeEntriesPageState.loading?'<p class="subtle">Chargement des pointages…</p>':timeEntriesPageState.error?`<p class="notice" role="alert">${esc(timeEntriesPageState.error)}</p>`:rows||'<p class="empty">Aucun pointage pour cette période.</p>'}</section>`;
}
function timeCorrectionFormForEntry(projectId,entryId){const job=jobs.find(item=>String(item.id)===String(projectId)),entry=job?.timeEntries.find(item=>String(item.id)===String(entryId));if(!entry)return denyAccess('Ce pointage n’est plus disponible.');timeCorrectionForm(job.id,entry.id)}
const renderBeforeTimeEntries=render;
render=function(){if(view!=='timeEntries')return renderBeforeTimeEntries();if(!canViewModule('timeEntries')){view=canViewModule('home')?'home':'personal';return renderBeforeTimeEntries()}const nav=document.querySelector('#nav');if(nav)nav.innerHTML=tabs2.filter(([key])=>canViewModule(key)).map(([key,label])=>`<button class="${view===key?'active':''}" ${view===key?'aria-current="page"':''} onclick="navigate('${key}')">${label}</button>`).join('');const main=document.querySelector('#main');if(main)main.innerHTML=timeEntriesView();scheduleSave()};
