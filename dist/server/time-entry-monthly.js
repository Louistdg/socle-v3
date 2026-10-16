function monthRange(value){
  const month=String(value||'');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return null;
  const [year,monthNumber]=month.split('-').map(Number);
  if(year<1)return null;
  const lastDay=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
  return{month,from:`${month}-01`,to:`${month}-${String(lastDay).padStart(2,'0')}`};
}

function durationMinutes(entry){
  if(!entry.departure)return 0;
  const [startHour,startMinute]=String(entry.arrival||'').split(':').map(Number);
  const [endHour,endMinute]=String(entry.departure||'').split(':').map(Number);
  if([startHour,startMinute,endHour,endMinute].some(value=>!Number.isFinite(value)))return 0;
  return Math.max(0,endHour*60+endMinute-startHour*60-startMinute-Number(entry.break_minutes||0));
}

function roundedHours(minutes){return Math.round(minutes/60*100)/100}

function visibleByTeam(flags,state,personId,teamId,actorCanUseTeam){
  return Boolean(flags.viewTeam&&teamId&&actorCanUseTeam(flags,state,personId,teamId));
}

export async function timeEntriesMonthlyRoute(request,url,env,ctx,helpers){
  const{json,rows,timePermissionFlags,organizationWorkspaceState,ensureLegacyTimeEntriesImported,currentPersonId,canReadTimeEntry,timeEntryPeople,timeEntryJson,profileLabels,hasProjectScope,actorCanUseTeam,parseJson}=helpers;
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const range=monthRange(url.searchParams.get('month'));
  if(!range)return json({error:'Mois invalide. Format attendu : AAAA-MM.'},400);
  const flags=await timePermissionFlags(env,ctx);
  if(!flags.owner&&!flags.viewOwn&&!flags.viewTeam&&!flags.viewAll)return json({error:'Vous ne pouvez pas consulter les pointages.'},403);
  const personId=await currentPersonId(env,ctx);
  if(!flags.owner&&!flags.viewAll&&!personId)return json({error:'Personne liée requise pour consulter vos pointages.'},403);
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state)return json({month:range.month,closedAt:null,closedBy:'',canClose:false,canEdit:false,summary:{totalHours:0,completedEntries:0,openEntries:0,people:0,projects:0,plannedWithoutPunch:0,declaredAbsences:0,pendingCorrections:0},people:[],projects:[],missingPunches:[],declaredAbsences:[],entries:[]});
  await ensureLegacyTimeEntriesImported(env,ctx,state);
  const candidates=await rows(env.DB.prepare('SELECT * FROM time_entries WHERE organization_id=? AND work_date>=? AND work_date<=? ORDER BY work_date,arrival,created_at,id').bind(ctx.organizationId,range.from,range.to));
  const visible=[];
  for(const row of candidates)if(await canReadTimeEntry(env,ctx,state,flags,personId,row))visible.push(row);
  const labels=await profileLabels(env,ctx),corrections=[];
  if(visible.length){
    const ids=visible.map(row=>row.id),marks=ids.map(()=>'?').join(',');
    corrections.push(...await rows(env.DB.prepare(`SELECT * FROM time_entry_corrections WHERE organization_id=? AND (time_entry_id IN (${marks}) OR result_entry_id IN (${marks})) ORDER BY requested_at`).bind(ctx.organizationId,...ids,...ids)));
  }
  const correctionsByEntry=new Map();
  for(const correction of corrections)for(const key of [correction.time_entry_id,correction.result_entry_id].filter(Boolean)){
    if(!correctionsByEntry.has(key))correctionsByEntry.set(key,[]);
    if(!correctionsByEntry.get(key).some(item=>item.id===correction.id))correctionsByEntry.get(key).push(correction);
  }
  const peopleNames=new Map((state.people||[]).map(person=>[String(person.id),String(person.name||person.displayName||person.id)]));
  const hrPeople=await rows(env.DB.prepare('SELECT id,display_name FROM hr_people WHERE organization_id=?').bind(ctx.organizationId));
  for(const person of hrPeople)if(!peopleNames.has(String(person.id)))peopleNames.set(String(person.id),String(person.display_name||person.id));
  const projectsNames=new Map((state.jobs||[]).map(project=>[String(project.id),String(project.name||project.reference||project.id)]));
  const onlyOwn=!flags.owner&&!flags.viewAll&&!flags.viewTeam;
  const serialized=visible.map(row=>timeEntryJson(row,correctionsByEntry.get(row.id)||[],labels,onlyOwn?personId:null));
  const byPerson=new Map(),byProject=new Map();
  let totalMinutes=0,completedEntries=0,openEntries=0,pendingCorrections=0;
  for(const row of visible){
    const rowCorrections=correctionsByEntry.get(row.id)||[];
    pendingCorrections+=rowCorrections.filter(item=>item.status==='pending').length;
    const rowPeople=timeEntryPeople(row);
    for(const memberId of rowPeople){
      if(!byPerson.has(memberId))byPerson.set(memberId,{personId:memberId,name:peopleNames.get(memberId)||memberId,minutes:0,entries:0,projects:new Map()});
      byPerson.get(memberId).entries++;
    }
    if(!row.departure){openEntries++;continue}
    completedEntries++;
    const minutes=durationMinutes(row);
    totalMinutes+=minutes*rowPeople.length;
    const projectId=String(row.project_id),projectName=projectsNames.get(projectId)||'Intervention à rapprocher';
    if(!byProject.has(projectId))byProject.set(projectId,{projectId,projectName,minutes:0,people:new Set(),entries:0});
    const project=byProject.get(projectId);project.minutes+=minutes*rowPeople.length;project.entries++;
    for(const memberId of rowPeople){
      const person=byPerson.get(memberId);person.minutes+=minutes;
      if(!person.projects.has(projectId))person.projects.set(projectId,{projectId,projectName,minutes:0,entries:0});
      const personProject=person.projects.get(projectId);personProject.minutes+=minutes;personProject.entries++;
      project.people.add(memberId);
    }
  }
  const accessibleTeamIds=new Set();
  if(flags.owner||flags.viewAll)for(const team of state.teams||[])accessibleTeamIds.add(String(team.id));
  else if(flags.viewTeam)for(const team of state.teams||[])if(actorCanUseTeam(flags,state,personId,team.id))accessibleTeamIds.add(String(team.id));
  const visiblePeople=new Set(visible.flatMap(row=>timeEntryPeople(row)));
  if(personId)visiblePeople.add(String(personId));
  if(flags.owner)for(const person of state.people||[])visiblePeople.add(String(person.id));
  else for(const team of state.teams||[])if(accessibleTeamIds.has(String(team.id)))for(const member of team.members||[])visiblePeople.add(String(member));
  const assignments=await rows(env.DB.prepare("SELECT assignment_date,team_id,project_id,people_json FROM field_assignments WHERE organization_id=? AND assignment_date>=? AND assignment_date<=? AND status<>'cancelled' ORDER BY assignment_date,team_id,id").bind(ctx.organizationId,range.from,range.to));
  const scheduled=new Map();
  for(const assignment of assignments){
    if(!await hasProjectScope(env,ctx,assignment.project_id))continue;
    const teamVisible=flags.owner||flags.viewAll||visibleByTeam(flags,state,personId,assignment.team_id,actorCanUseTeam);
    for(const rawPersonId of parseJson(assignment.people_json,[])){
      const memberId=String(rawPersonId);
      const personVisible=flags.owner||flags.viewAll||teamVisible||Boolean(flags.viewOwn&&personId&&memberId===String(personId));
      if(!personVisible)continue;
      const key=`${memberId}|${assignment.assignment_date}`;
      if(!scheduled.has(key))scheduled.set(key,{personId:memberId,date:assignment.assignment_date,projects:new Set()});
      scheduled.get(key).projects.add(String(assignment.project_id));
      visiblePeople.add(memberId);
    }
  }
  const absencesRaw=visiblePeople.size?await rows(env.DB.prepare("SELECT id,person_id,absence_type,starts_at,ends_at,status FROM planning_absences WHERE organization_id=? AND status='approved' AND starts_at<? AND ends_at>=? ORDER BY starts_at,person_id").bind(ctx.organizationId,range.to+'T23:59:59.999',range.from+'T00:00')):[];
  const declaredAbsences=absencesRaw.filter(item=>visiblePeople.has(String(item.person_id))).map(item=>({id:item.id,personId:String(item.person_id),personName:peopleNames.get(String(item.person_id))||String(item.person_id),startsAt:item.starts_at,endsAt:item.ends_at,type:flags.owner||flags.viewAll||String(item.person_id)===String(personId)?item.absence_type:'indisponibilité'}));
  const absentOnDate=new Set();
  for(const absence of declaredAbsences){
    const start=absence.startsAt.slice(0,10)<range.from?range.from:absence.startsAt.slice(0,10),end=absence.endsAt.slice(0,10)>range.to?range.to:absence.endsAt.slice(0,10);
    for(let cursor=new Date(start+'T00:00:00Z');cursor<=new Date(end+'T00:00:00Z');cursor=new Date(cursor.getTime()+86400000))absentOnDate.add(`${absence.personId}|${cursor.toISOString().slice(0,10)}`);
  }
  const hasPunch=new Set();
  for(const row of visible)for(const memberId of timeEntryPeople(row))hasPunch.add(`${memberId}|${row.work_date}`);
  const missingPunches=[];
  for(const [key,planned] of scheduled){
    if(absentOnDate.has(key)||hasPunch.has(key))continue;
    missingPunches.push({personId:planned.personId,personName:peopleNames.get(planned.personId)||planned.personId,date:planned.date,projectIds:[...planned.projects],projectNames:[...planned.projects].map(projectId=>projectsNames.get(projectId)||'Chantier')});
  }
  const closure=await env.DB.prepare('SELECT closed_at,closed_by,archived_count FROM time_entry_month_closures WHERE organization_id=? AND month=?').bind(ctx.organizationId,range.month).first();
  const canClose=Boolean(flags.owner),canEdit=Boolean(flags.owner||flags.reviewCorrection);
  const report={
    month:range.month,closedAt:closure?.closed_at||null,closedBy:closure?.closed_by?(labels.get(closure.closed_by)||closure.closed_by):'',archivedEntries:Number(closure?.archived_count||0),canClose,canEdit,
    summary:{totalHours:roundedHours(totalMinutes),completedEntries,openEntries,people:byPerson.size,projects:byProject.size,plannedWithoutPunch:missingPunches.length,declaredAbsences:declaredAbsences.length,pendingCorrections},
    people:[...byPerson.values()].map(person=>({personId:person.personId,name:person.name,hours:roundedHours(person.minutes),entries:person.entries,projects:[...person.projects.values()].map(project=>({projectId:project.projectId,projectName:project.projectName,hours:roundedHours(project.minutes),entries:project.entries}))})).sort((a,b)=>a.name.localeCompare(b.name,'fr')),
    projects:[...byProject.values()].map(project=>({projectId:project.projectId,projectName:project.projectName,hours:roundedHours(project.minutes),entries:project.entries,people:project.people.size})).sort((a,b)=>a.projectName.localeCompare(b.projectName,'fr')),
    missingPunches,declaredAbsences,entries:serialized
  };
  return json(report);
}

export async function timeEntriesMonthlyCloseRoute(request,env,ctx,helpers){
  const{json,body,timePermissionFlags,organizationWorkspaceState,ensureLegacyTimeEntriesImported,rows,dbBatch,id,auditStatement,parseJson}=helpers;
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  const flags=await timePermissionFlags(env,ctx);
  if(!flags.owner)return json({error:'Seul le patron peut archiver les pointages du mois.'},403);
  if(ctx.preview)return json({error:'L’archivage est désactivé dans l’aperçu.'},403);
  const data=await body(request,10000),range=monthRange(data.month);
  if(!range)return json({error:'Mois invalide. Format attendu : AAAA-MM.'},400);
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:false});
  if(!state)return json({error:'Espace entreprise introuvable.'},404);
  await ensureLegacyTimeEntriesImported(env,ctx,state);
  const unresolved=await env.DB.prepare("SELECT COUNT(*) open_count FROM time_entries WHERE organization_id=? AND work_date>=? AND work_date<=? AND archived_at IS NULL AND departure IS NULL").bind(ctx.organizationId,range.from,range.to).first();
  const pending=await env.DB.prepare("SELECT COUNT(*) pending_count FROM time_entry_corrections c JOIN time_entries e ON e.id=c.time_entry_id AND e.organization_id=c.organization_id WHERE c.organization_id=? AND e.work_date>=? AND e.work_date<=? AND c.status='pending'").bind(ctx.organizationId,range.from,range.to).first();
  const openCount=Number(unresolved?.open_count||0),pendingCount=Number(pending?.pending_count||0);
  if(openCount||pendingCount)return json({error:'Traitez les départs ouverts et les corrections en attente avant d’archiver le mois.',openEntries:openCount,pendingCorrections:pendingCount},409);
  if(data.confirmMissingPunches!==true){
    const assignments=await rows(env.DB.prepare("SELECT assignment_date,people_json,project_id FROM field_assignments WHERE organization_id=? AND assignment_date>=? AND assignment_date<=? AND status<>'cancelled'").bind(ctx.organizationId,range.from,range.to));
    const actual=await rows(env.DB.prepare('SELECT work_date,people_json FROM time_entries WHERE organization_id=? AND work_date>=? AND work_date<=?').bind(ctx.organizationId,range.from,range.to));
    const punched=new Set(actual.flatMap(entry=>parseJson(entry.people_json,[]).map(personId=>`${String(personId)}|${entry.work_date}`))),scheduled=new Set(assignments.flatMap(item=>parseJson(item.people_json,[]).map(personId=>`${String(personId)}|${item.assignment_date}`)));
    const absenceRows=scheduled.size?await rows(env.DB.prepare("SELECT person_id,starts_at,ends_at FROM planning_absences WHERE organization_id=? AND status='approved' AND starts_at<? AND ends_at>=?").bind(ctx.organizationId,range.to+'T23:59:59.999',range.from+'T00:00')):[];
    const absent=new Set();
    for(const row of absenceRows){const first=row.starts_at.slice(0,10)<range.from?range.from:row.starts_at.slice(0,10),last=row.ends_at.slice(0,10)>range.to?range.to:row.ends_at.slice(0,10);for(let cursor=new Date(first+'T00:00:00Z');cursor<=new Date(last+'T00:00:00Z');cursor=new Date(cursor.getTime()+86400000))absent.add(`${String(row.person_id)}|${cursor.toISOString().slice(0,10)}`)}
    const missingCount=[...scheduled].filter(key=>!punched.has(key)&&!absent.has(key)).length;
    if(missingCount)return json({error:'Il reste des journées planifiées sans pointage. Vérifiez-les puis confirmez leur archivage.',plannedWithoutPunch:missingCount,confirmationRequired:true},409);
  }
  const stamp=new Date().toISOString(),closureId=`${ctx.organizationId}:${range.month}`;
  const statements=[
    env.DB.prepare("UPDATE time_entries SET archived_at=?,updated_by=?,updated_at=? WHERE organization_id=? AND work_date>=? AND work_date<=? AND archived_at IS NULL AND departure IS NOT NULL").bind(stamp,ctx.uid,stamp,ctx.organizationId,range.from,range.to),
    env.DB.prepare("INSERT INTO time_entry_month_closures(organization_id,month,closed_at,closed_by,archived_count) VALUES(?,?,?,?,(SELECT COUNT(*) FROM time_entries WHERE organization_id=? AND substr(work_date,1,7)=? AND archived_at IS NOT NULL)) ON CONFLICT(organization_id,month) DO UPDATE SET closed_at=excluded.closed_at,closed_by=excluded.closed_by,archived_count=excluded.archived_count").bind(ctx.organizationId,range.month,stamp,ctx.uid,ctx.organizationId,range.month),
    auditStatement(env,ctx,'time_entry.month_archived','time_entry_month',closureId,{month:range.month,confirmationMissingPunches:data.confirmMissingPunches===true})
  ];
  try{
    const result=await dbBatch(env,statements);
    const archivedEntries=Number(result?.[0]?.meta?.changes||0);
    const closure=await env.DB.prepare('SELECT closed_at,archived_count FROM time_entry_month_closures WHERE organization_id=? AND month=?').bind(ctx.organizationId,range.month).first();
    return json({month:range.month,closedAt:closure?.closed_at||stamp,archivedEntries:Number(closure?.archived_count||archivedEntries),newlyArchivedEntries:archivedEntries});
  }catch(error){
    if(String(error?.message||'').includes('time_entry_month_unresolved'))return json({error:'Le mois contient un départ ouvert ou une correction en attente. Aucun pointage n’a été archivé.'},409);
    throw error;
  }
}
