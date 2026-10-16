import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {id as batxlId,references as batxlReferences} from './manifest.mjs';

export const PACK_CODE='BATXL-IA3-PLANNING-PEOPLE';
export const PACK_VERSION=1;
export const DEFAULT_ORGANIZATION_ID='org-local-owner';

const CANONICAL_ROLES=new Set(['OWNER','TEAM_LEAD','WORKER','ACCOUNTING']);
const PERIOD_MIN='2026-09-01';
const PERIOD_MAX='2026-09-30';
const TARGET_DAYS=22;

function parseJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function compactDate(value){return String(value).replaceAll('-','')}
function weekdays(from,to){
  const out=[];
  for(let d=new Date(from+'T12:00:00Z'),end=new Date(to+'T12:00:00Z');d<=end;d.setUTCDate(d.getUTCDate()+1)){
    const day=d.getUTCDay();
    if(day!==0&&day!==6)out.push(d.toISOString().slice(0,10));
  }
  return out;
}
function addMinutes(clock,minutes){
  const [h,m]=String(clock).split(':').map(Number);
  const total=h*60+m+minutes;
  return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
function personName(person,index){
  return String(person?.name||person?.displayName||person?.fullName||('BatiNova '+String(index+1).padStart(2,'0'))).trim();
}
function splitName(name){
  const parts=String(name||'').trim().split(/\s+/).filter(Boolean);
  return {firstName:parts.shift()||'BatiNova',lastName:parts.join(' ')||'XL'};
}
function dbCount(database,sql,...args){return Number(database.prepare(sql).get(...args)?.count||0)}
function tableColumns(database,table){return new Set(database.prepare(`PRAGMA table_info(${table})`).all().map(row=>String(row.name)))}
function ensureRole(database,organizationId,code,stamp){
  const existing=database.prepare('SELECT id FROM roles WHERE organization_id=? AND code=?').get(organizationId,code);
  if(existing)return String(existing.id);
  const suffix=String(organizationId).replace(/^org-/,'')||'local';
  const id='role-'+code.toLowerCase().replaceAll('_','-')+'-'+suffix;
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,organizationId,code,code,stamp);
  return id;
}
function ensureRolePermissions(database,roleId,codes){
  for(const code of codes){
    if(!database.prepare('SELECT 1 ok FROM permissions WHERE code=?').get(code))continue;
    database.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(roleId,code);
  }
}
function ensureMember(database,{organizationId,userId,personId,name,email,roleId,stamp}){
  const {firstName,lastName}=splitName(name);
  database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,updated_at=excluded.updated_at')
    .run(userId,firstName,lastName,email,stamp,stamp);
  database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role_id=excluded.role_id,status=\'active\',updated_at=excluded.updated_at,person_id=excluded.person_id')
    .run('BATXL-MEMBER-'+userId.replace(/^BATXL-USER-/,''),organizationId,userId,roleId,'active',stamp,stamp,stamp,personId==null?null:String(personId));
}
function existingCanonicalUserForPerson(database,organizationId,personId,roleCode){
  const row=database.prepare("SELECT om.user_id,r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.person_id=? AND om.status='active' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId,String(personId));
  return row&&String(row.code)===String(roleCode)?String(row.user_id):null;
}
function ensureSimulationUser(database,{organizationId,person,roleCode,roleId,fallbackUserId,email,stamp,index}){
  const existing=existingCanonicalUserForPerson(database,organizationId,person.id,roleCode);
  if(existing)return existing;
  ensureMember(database,{organizationId,userId:fallbackUserId,personId:person.id,name:personName(person,index),email,roleId,stamp});
  return fallbackUserId;
}
function projectBySource(jobs,sourceId){
  return jobs.find(job=>String(job.sourceScenarioId||job.id)===String(sourceId))||null;
}
function teamLeadPerson(group){
  return group.find(person=>/Chef d[’']?équipe/i.test(String(person?.role||'')))||group[0]||null;
}

function buildEnv(database){
  return {DB:{
    prepare(sql){let values=[];return{
      _sql:sql,
      get _values(){return values},
      bind(...args){values=args;return this},
      async first(){return database.prepare(sql).get(...values)??null},
      async all(){return{results:database.prepare(sql).all(...values)}},
      async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
    }},
    async batch(statements){
      database.exec('BEGIN IMMEDIATE');
      try{
        const out=[];
        for(const statement of statements){
          const result=database.prepare(statement._sql).run(...statement._values);
          out.push({meta:{changes:Number(result.changes)}});
        }
        database.exec('COMMIT');
        return out;
      }catch(error){
        database.exec('ROLLBACK');
        throw error;
      }
    }
  }};
}
async function api(worker,database,organizationId,userId,method,path,payload){
  const headers={'oai-authenticated-user-id':userId,'x-socle-organization-id':organizationId,'origin':'https://socle.batinova-xl.local'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.batinova-xl.local'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),buildEnv(database));
  let body={};try{body=await response.json()}catch{}
  return {status:response.status,body};
}
function choosePeriod(database,organizationId,teamIds,personIds,state){
  const assignmentColumns=tableColumns(database,'field_assignments'),activeClause=assignmentColumns.has('status')?" AND status<>'cancelled'":'';
  const existingAssignments=database.prepare("SELECT assignment_date,team_id,people_json FROM field_assignments WHERE organization_id=? AND id NOT LIKE 'BATXL-%'"+activeClause).all(organizationId);
  const existingTime=database.prepare("SELECT work_date,people_json FROM time_entries WHERE organization_id=? AND id NOT LIKE 'BATXL-%' AND archived_at IS NULL").all(organizationId);
  const teamSet=new Set(teamIds.map(String)),personSet=new Set(personIds.map(String)),teamById=new Map((state?.teams||[]).map(team=>[String(team.id),team]));
  const blocked=new Set();
  for(const row of existingAssignments){
    const people=parseJson(row.people_json,[]).map(String);
    if(teamSet.has(String(row.team_id))||people.some(id=>personSet.has(id)))blocked.add(String(row.assignment_date));
  }
  for(const row of existingTime){
    const people=parseJson(row.people_json,[]).map(String);
    if(people.some(id=>personSet.has(id)))blocked.add(String(row.work_date));
  }
  for(const assignment of state?.assignments||[]){
    const teamId=String(assignment?.team||''),people=(assignment?.people||teamById.get(teamId)?.members||[]).map(String),date=String(assignment?.date||'');
    if(date&&(teamSet.has(teamId)||people.some(id=>personSet.has(id))))blocked.add(date);
  }
  const dates=weekdays(PERIOD_MIN,PERIOD_MAX);
  if(dates.length!==TARGET_DAYS)throw Error('BATXL IA3: calendrier septembre 2026 inattendu: '+dates.length+' jours ouvrés.');
  const conflicts=dates.filter(date=>blocked.has(date));
  if(conflicts.length)throw Error('BATXL IA3: septembre 2026 doit rester strict; conflits existants: '+conflicts.join(', '));
  return dates;
}
function scheduleProject(pool,dayIndex,teamIndex){
  let project=pool[Math.floor(dayIndex/5)%pool.length];
  if(dayIndex===8&&teamIndex===0)project=pool.at(-1);
  if(dayIndex===20&&teamIndex===2)project=pool[1%pool.length];
  return project;
}
function userForPerson(mapping,personId){
  const user=mapping.get(String(personId));
  if(!user)throw Error('BATXL IA3: aucun utilisateur actif pour la personne '+personId);
  return user;
}
function upsertSimulationRun(database,{organizationId,ownerId,summary}){
  const id='BATXL-RUN-IA3-PLANNING-PEOPLE-V1';
  const appliedAt=summary.period.to+'T18:00:00.000Z';
  database.prepare('INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json')
    .run(id,organizationId,PACK_CODE,PACK_VERSION,appliedAt,ownerId,JSON.stringify(summary));
}

export async function runPlanningPeoplePack({database,organizationId=DEFAULT_ORGANIZATION_ID,worker=null}={}){
  if(!database)throw Error('BATXL IA3: database obligatoire.');
  database.exec('PRAGMA foreign_keys=ON');
  const workspaceRow=database.prepare('SELECT payload,revision FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  if(!workspaceRow)throw Error('BATXL IA3: organization_workspace_state introuvable pour '+organizationId);
  const state=parseJson(workspaceRow.payload,{});
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw Error('BATXL IA3: la société active n’est pas BatiNova.');

  const people=(state.people||[]).filter(person=>!person?.inactiveAt).slice(0,25);
  const teams=(state.teams||[]).slice(0,4);
  const jobs=(state.jobs||[]).filter(job=>job&&job.id!==undefined&&job.id!==null);
  let stateChanged=false,addedProjects=0;
  if(people.length<25)throw Error('BATXL IA3: 25 personnes actives sont nécessaires, trouvées: '+people.length);
  if(teams.length<4)throw Error('BATXL IA3: 4 équipes principales sont nécessaires, trouvées: '+teams.length);
  const existingJobIds=new Set(jobs.map(job=>String(job.id)));
  for(let index=1;jobs.length<8;index++){
    const projectId=batxlId('project',index);
    if(existingJobIds.has(projectId))continue;
    const project={
      id:projectId,
      reference:batxlReferences.project(index),
      name:'BATXL · Chantier opérationnel '+String(index).padStart(2,'0'),
      client:'Client simulation BatiNova XL',
      town:['Namur','Charleroi','Dinant'][addedProjects%3],
      address:'Simulation BATXL — Belgique',
      type:['Rénovation toiture','Maçonnerie / enveloppe','Rénovation énergétique'][addedProjects%3],
      phase:'En cours',
      progress:[22,47,68][addedProjects%3],
      required:[],
      photos:[],
      notes:[],
      timeEntries:[],
      documents:[]
    };
    jobs.push(project);
    if(!Array.isArray(state.jobs))state.jobs=[];
    state.jobs.push(project);
    existingJobIds.add(projectId);
    addedProjects++;
    stateChanged=true;
  }

  const owner=database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId);
  if(!owner?.user_id)throw Error('BATXL IA3: OWNER actif introuvable.');
  const ownerId=String(owner.user_id);
  const stamp='2026-08-17T05:45:00.000Z';

  const roleIds={
    TEAM_LEAD:ensureRole(database,organizationId,'TEAM_LEAD',stamp),
    WORKER:ensureRole(database,organizationId,'WORKER',stamp),
    ACCOUNTING:ensureRole(database,organizationId,'ACCOUNTING',stamp)
  };
  ensureRolePermissions(database,roleIds.TEAM_LEAD,['workspace.view','projects.view.assigned','contacts.view.assigned','tasks.view.assigned','tasks.manage.project','tasks.update.assigned','tasks.comment.create','time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.correction.request','time_entries.correction.review','project_materials.create','project_execution.edit','project_notes.create','planning.assignments.manage','assets.view','fuel.create','asset_issues.create','documents.view.assigned','documents.secure.view','quotes.view','messages.view','messages.send']);
  ensureRolePermissions(database,roleIds.WORKER,['workspace.view','projects.view.assigned','contacts.view.assigned','tasks.view.assigned','tasks.update.assigned','tasks.comment.create','time_entries.view.own','time_entries.create.own','time_entries.correction.request','project_materials.create','project_notes.create','assets.view','fuel.create','asset_issues.create','documents.view.assigned','documents.secure.view','quotes.view','messages.view','messages.send']);
  ensureRolePermissions(database,roleIds.ACCOUNTING,['financial.dashboard.view','accounting.view','expenses.view','expenses.create','invoices.view','payments.create','credit_notes.create','supplier_allocations.view','supplier_allocations.create','supplier_allocations.cancel','purchase_orders.view','documents.secure.view','quotes.view','quotes.prices.view','messages.view']);

  const peopleById=new Map(people.map(person=>[String(person.id),person]));
  const permanentGroups=teams.map(team=>(team.members||[]).map(id=>peopleById.get(String(id))).filter(Boolean));
  const expectedGroupSizes=[5,5,4,5];
  for(let index=0;index<4;index++){
    if(permanentGroups[index].length!==expectedGroupSizes[index])throw Error('BATXL IA3: composition équipe autoritaire inattendue pour '+String(teams[index].name||index+1)+': '+permanentGroups[index].length);
  }
  const teamLeadPeople=permanentGroups.map(teamLeadPerson);
  if(teamLeadPeople.some(person=>!person))throw Error('BATXL IA3: chef d’équipe métier introuvable.');
  const leadNames=teamLeadPeople.map(person=>personName(person,0));
  const expectedLeadNames=['David Leclercq','Olivier Mathieu','Philippe André','Christophe Henry'];
  if(JSON.stringify(leadNames)!==JSON.stringify(expectedLeadNames))throw Error('BATXL IA3: chefs d’équipe autoritaires inattendus: '+JSON.stringify(leadNames));

  const reinforcementPerson=people.find(person=>personName(person,0)==='Sébastien Collard');
  const absentRoofPerson=people.find(person=>personName(person,0)==='Maxime Evrard');
  const accountingName=String(state.company?.accountant||'Comptable BatiNova XL').trim()||'Comptable BatiNova XL';
  const accountingEmail=String(state.company?.accountantEmail||'batxl.accounting@simulation.invalid').trim()||'batxl.accounting@simulation.invalid';
  if(!reinforcementPerson||!permanentGroups[3].some(person=>String(person.id)===String(reinforcementPerson.id)))throw Error('BATXL IA3: P24 Sébastien Collard doit rester membre de Rénovation / polyvalents.');
  if(!absentRoofPerson||!permanentGroups[1].some(person=>String(person.id)===String(absentRoofPerson.id)))throw Error('BATXL IA3: Maxime Evrard doit appartenir à Toiture / charpente.');
  const fieldPersonIds=permanentGroups.flat().map(person=>String(person.id));

  if(stateChanged){
    database.prepare('UPDATE organization_workspace_state SET payload=?,revision=?,updated_at=? WHERE organization_id=?')
      .run(JSON.stringify(state),Number(workspaceRow.revision||0)+1,stamp,organizationId);
  }

  const userByPerson=new Map();
  const teamLeadUsers=[];
  const teamWorkerUsers=[];
  let workerIndex=1,reusedUsers=0;
  for(let teamIndex=0;teamIndex<4;teamIndex++){
    const group=permanentGroups[teamIndex],leadPerson=teamLeadPeople[teamIndex];
    const leadFallback='BATXL-USER-TL-'+String(teamIndex+1).padStart(2,'0');
    const leadUser=ensureSimulationUser(database,{organizationId,person:leadPerson,roleCode:'TEAM_LEAD',roleId:roleIds.TEAM_LEAD,fallbackUserId:leadFallback,email:'batxl.teamlead.'+String(teamIndex+1).padStart(2,'0')+'@simulation.invalid',stamp,index:teamIndex});
    if(leadUser!==leadFallback)reusedUsers++;
    userByPerson.set(String(leadPerson.id),leadUser);
    teamLeadUsers.push(leadUser);
    const workers=[];
    for(const person of group){
      if(String(person.id)===String(leadPerson.id))continue;
      const fallback='BATXL-USER-W-'+String(workerIndex).padStart(2,'0');
      const userId=ensureSimulationUser(database,{organizationId,person,roleCode:'WORKER',roleId:roleIds.WORKER,fallbackUserId:fallback,email:'batxl.worker.'+String(workerIndex).padStart(2,'0')+'@simulation.invalid',stamp,index:workerIndex});
      if(userId!==fallback)reusedUsers++;
      workerIndex++;
      userByPerson.set(String(person.id),userId);
      workers.push(userId);
    }
    teamWorkerUsers.push(workers);
  }
  const accountingFallback='BATXL-USER-ACC-01';
  const existingStandaloneAccounting=database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='ACCOUNTING' AND om.person_id IS NULL ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId);
  const accountingUser=existingStandaloneAccounting?.user_id?String(existingStandaloneAccounting.user_id):accountingFallback;
  ensureMember(database,{organizationId,userId:accountingUser,personId:null,name:accountingName,email:accountingEmail,roleId:roleIds.ACCOUNTING,stamp});
  if(accountingUser!==accountingFallback)reusedUsers++;

  const teamIds=teams.map(team=>String(team.id));
  const dates=choosePeriod(database,organizationId,teamIds,fieldPersonIds,state);
  const projectPools=teams.map((_,teamIndex)=>[0,1,2].map(offset=>jobs[(teamIndex*3+offset)%jobs.length]));
  const assignmentSpecs=[];

  const eventCounts={urgency:0,replacement:0,absence:0,weather:0,shortIntervention:0,teamChange:0,subcontractor:0};
  const storyProjectByAssignment=new Map([
    ['2026-09-03|2','BATXL-PRJ-007'],
    ['2026-09-15|2','BATXL-PRJ-014'],
    ['2026-09-18|1','BATXL-PRJ-002'],
    ['2026-09-22|0','BATXL-PRJ-008'],
    ['2026-09-24|2','BATXL-PRJ-010']
  ]);

  for(let dayIndex=0;dayIndex<dates.length;dayIndex++){
    for(let teamIndex=0;teamIndex<4;teamIndex++){
      const date=dates[dayIndex],team=teams[teamIndex];
      if(date==='2026-09-09'&&teamIndex===0){eventCounts.weather++;continue}
      let peopleIds=permanentGroups[teamIndex].map(person=>String(person.id));
      let event='normal';
      const subcontractor='';
      if(date==='2026-09-07'&&teamIndex===1){
        peopleIds=peopleIds.filter(id=>id!==String(absentRoofPerson.id));
        if(!peopleIds.includes(String(reinforcementPerson.id)))peopleIds.push(String(reinforcementPerson.id));
        event='team_change_in';
        eventCounts.replacement++;eventCounts.absence++;eventCounts.teamChange++;
      }else if(date==='2026-09-07'&&teamIndex===3){
        peopleIds=peopleIds.filter(id=>id!==String(reinforcementPerson.id));
        event='team_change_out';
      }
      const sourceOverride=storyProjectByAssignment.get(date+'|'+teamIndex);
      const project=sourceOverride?projectBySource(jobs,sourceOverride):scheduleProject(projectPools[teamIndex],dayIndex,teamIndex);
      if(!project)throw Error('BATXL IA3: projet canonique introuvable pour '+String(sourceOverride||date+' équipe '+(teamIndex+1)));
      const id='BATXL-ASG-'+compactDate(date)+'-T'+String(teamIndex+1).padStart(2,'0');
      assignmentSpecs.push({id,date,teamIndex,teamId:String(team.id),projectId:String(project.id),peopleIds,event,subcontractor});
    }
  }

  // #119 — les affectations BATXL sont un snapshot de simulation déterministe.
  // Les lignes réelles/non-BATXL ont déjà bloqué choosePeriod(); seules les anciennes
  // lignes de CE pack peuvent être neutralisées ou réécrites ici.
  const expectedAssignmentIds=new Set(assignmentSpecs.map(item=>item.id)),assignmentColumns=tableColumns(database,'field_assignments'),hasPlanningColumns=['start_time','end_time','assignment_type','status','reason'].every(column=>assignmentColumns.has(column));
  const obsoleteBatxl=database.prepare("SELECT id FROM field_assignments WHERE organization_id=? AND id LIKE 'BATXL-ASG-%'"+(assignmentColumns.has('status')?" AND status<>'cancelled'":'')+" ORDER BY id").all(organizationId).filter(row=>!expectedAssignmentIds.has(String(row.id)));
  if(obsoleteBatxl.length&&!hasPlanningColumns)throw Error('BATXL IA3: schéma Planning 0034 requis pour neutraliser des affectations simulation obsolètes.');
  for(const row of obsoleteBatxl)database.prepare("UPDATE field_assignments SET status='cancelled',reason=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?").run('BATXL #119 · affectation simulation obsolète',ownerId,stamp,organizationId,String(row.id));
  for(const assignment of assignmentSpecs){
    const createdAt=assignment.date+'T05:45:00.000Z',values=[assignment.id,organizationId,assignment.date,assignment.teamId,assignment.projectId,JSON.stringify(assignment.peopleIds),null,batxlId('resourcePack',assignment.teamIndex+1),assignment.subcontractor,ownerId,createdAt,ownerId,createdAt];
    if(hasPlanningColumns)database.prepare(`INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at,start_time,end_time,assignment_type,status,reason)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,'07:00','16:00','team','planned','')
      ON CONFLICT(organization_id,id) DO UPDATE SET assignment_date=excluded.assignment_date,team_id=excluded.team_id,project_id=excluded.project_id,people_json=excluded.people_json,vehicle_id=excluded.vehicle_id,pack_id=excluded.pack_id,subcontractor=excluded.subcontractor,created_by=excluded.created_by,created_at=excluded.created_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at,start_time=excluded.start_time,end_time=excluded.end_time,assignment_type=excluded.assignment_type,status='planned',reason=''`).run(...values);
    else database.prepare(`INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(organization_id,id) DO UPDATE SET assignment_date=excluded.assignment_date,team_id=excluded.team_id,project_id=excluded.project_id,people_json=excluded.people_json,vehicle_id=excluded.vehicle_id,pack_id=excluded.pack_id,subcontractor=excluded.subcontractor,created_by=excluded.created_by,created_at=excluded.created_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).run(...values);
  }

  const accessByUser=new Map();
  for(const assignment of assignmentSpecs){
    for(const personId of assignment.peopleIds){
      const userId=userForPerson(userByPerson,personId);
      if(!accessByUser.has(userId))accessByUser.set(userId,new Set());
      accessByUser.get(userId).add(assignment.projectId);
    }
  }
  for(const [userId,projects] of accessByUser){
    for(const projectId of projects){
      database.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)')
        .run(organizationId,userId,projectId,ownerId,stamp);
    }
  }

  const timeEntries=[];
  for(const assignment of assignmentSpecs){
    for(let personIndex=0;personIndex<assignment.peopleIds.length;personIndex++){
      const personId=assignment.peopleIds[personIndex];
      const userId=userForPerson(userByPerson,personId);
      let arrival=addMinutes('07:15',personIndex%5*3);
      let departure='16:15';
      if(assignment.date===dates[4]&&assignment.teamIndex===0&&personIndex===2)arrival='08:10';
      if(assignment.date===dates[9]&&assignment.teamIndex===1&&personIndex===1)departure='14:30';
      if(assignment.event==='short')departure='12:30';
      const breakMinutes=45;
      const id='BATXL-TE-'+compactDate(assignment.date)+'-T'+String(assignment.teamIndex+1).padStart(2,'0')+'-P'+String(personIndex+1).padStart(2,'0');
      const note='BATXL-'+assignment.event.toUpperCase();
      const createdBy=teamLeadUsers[assignment.teamIndex]||ownerId;
      database.prepare('INSERT OR IGNORE INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id,organizationId,assignment.projectId,assignment.teamId,JSON.stringify([personId]),assignment.date,arrival,departure,breakMinutes,note,createdBy,assignment.date+'T05:50:00.000Z',createdBy,assignment.date+'T16:30:00.000Z');
      timeEntries.push({id,assignment,personId,userId,arrival,departure});
    }
  }

  const correctionSource=timeEntries.filter(entry=>entry.assignment.event!=='short').slice(7,16);
  const correctionStates=['approved','approved','approved','approved','rejected','rejected','rejected','pending','pending'];
  for(let index=0;index<correctionStates.length&&index<correctionSource.length;index++){
    const source=correctionSource[index],status=correctionStates[index],id='BATXL-COR-'+String(index+1).padStart(3,'0');
    const proposedArrival=addMinutes(source.arrival,index%2===0?-10:10);
    const proposedDeparture=source.departure;
    const reviewer=teamLeadUsers[source.assignment.teamIndex]||ownerId;
    if(status==='approved'){
      database.prepare('UPDATE time_entries SET arrival=?,updated_by=?,updated_at=? WHERE id=? AND organization_id=?')
        .run(proposedArrival,reviewer,source.assignment.date+'T17:00:00.000Z',source.id,organizationId);
    }
    database.prepare('INSERT OR IGNORE INTO time_entry_corrections(id,organization_id,time_entry_id,person_id,original_arrival,original_departure,proposed_arrival,proposed_departure,reason,status,requested_by,requested_at,reviewed_by,reviewed_at,result_entry_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,organizationId,source.id,source.personId,source.arrival,source.departure,proposedArrival,proposedDeparture,'BATXL correction pointage '+String(index+1),status,source.userId,source.assignment.date+'T16:40:00.000Z',status==='pending'?null:reviewer,status==='pending'?null:source.assignment.date+'T17:00:00.000Z',status==='approved'?source.id:null);
  }

  const taskProjectsByTeam=projectPools.map(pool=>pool.map(project=>String(project.id)));
  const taskMaterials=['Ardoises naturelles','Liteaux traités','Zinc 0,8 mm','Membrane EPDM','Isolation 120 mm','Fixations inox'];
  for(let index=0;index<80;index++){
    const number=index+1,teamIndex=index%4,leadUser=teamLeadUsers[teamIndex],workerPool=teamWorkerUsers[teamIndex],assignedTo=workerPool[index%workerPool.length]||leadUser;
    const projectId=taskProjectsByTeam[teamIndex][Math.floor(index/4)%taskProjectsByTeam[teamIndex].length];
    const priority=number%13===0?'urgent':number%5===0?'high':'normal';
    const status=number%11===0?'blocked':number%4===0?'done':number%3===0?'in_progress':'todo';
    const validated=status==='done'&&number%8===0;
    const checklist=[
      {id:'BATXL-CHK-'+String(number).padStart(3,'0')+'-01',label:'Préparation terminée',done:status==='done'},
      {id:'BATXL-CHK-'+String(number).padStart(3,'0')+'-02',label:'Contrôle qualité',done:validated},
      {id:'BATXL-CHK-'+String(number).padStart(3,'0')+'-03',label:'Zone sécurisée',done:status==='done'}
    ];
    if(status==='done'&&!validated)checklist[1].done=true;
    const materials=[
      {name:taskMaterials[index%taskMaterials.length],quantity:2+(index%7),unit:index%2?'pcs':'u'},
      {name:taskMaterials[(index+2)%taskMaterials.length],quantity:1+(index%4),unit:'u'}
    ];
    const id='BATXL-TASK-'+String(number).padStart(3,'0'),operationKey='BATXL-TASK-OP-'+String(number).padStart(3,'0');
    const dueDate=dates[(index*3)%dates.length];
    database.prepare('INSERT OR IGNORE INTO project_tasks(id,organization_id,project_id,title,description,status,priority,assigned_to,created_by,created_at,updated_at,completed_at,archived_at,due_at,checklist_json,materials_json,people_json,operation_key,task_kind,problem_category,photo_document_ids_json,validated_by,validated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,organizationId,projectId,'BATXL · Tâche chantier '+String(number).padStart(3,'0'),'Simulation BatiNova XL — contrôle opérationnel '+number,status,priority,assignedTo,leadUser,dueDate+'T06:00:00.000Z',dueDate+'T16:00:00.000Z',status==='done'?dueDate+'T15:30:00.000Z':null,null,dueDate+'T15:00:00.000Z',JSON.stringify(checklist),JSON.stringify(materials),JSON.stringify([assignedTo]),operationKey,'task',null,'[]',validated?leadUser:null,validated?dueDate+'T16:10:00.000Z':null);
  }

  const legacyRoleCount=dbCount(database,"SELECT COUNT(*) count FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.user_id LIKE 'BATXL-USER-%' AND r.code IN ('PROJECT_MANAGER','LOGISTICS')",organizationId);
  if(legacyRoleCount)throw Error('BATXL IA3: un rôle legacy a été attribué à un utilisateur de simulation.');

  const effectiveWorker=worker||(await import('../../../worker/index.js')).default;
  const workerProbe=teamWorkerUsers[0][0];
  const leadProbe=teamLeadUsers[0];
  const assignedProjects=[...accessByUser.get(workerProbe)];
  const leadProjects=[...accessByUser.get(leadProbe)];
  const blockedWorkerProject=jobs.map(job=>String(job.id)).find(id=>!accessByUser.get(workerProbe).has(id));
  const blockedLeadProject=jobs.map(job=>String(job.id)).find(id=>!accessByUser.get(leadProbe).has(id));
  if(!blockedWorkerProject||!blockedLeadProject)throw Error('BATXL IA3: périmètre de contrôle insuffisant, le profil de test voit tous les chantiers.');
  const workerAllowed=await api(effectiveWorker,database,organizationId,workerProbe,'GET','/api/projects/'+encodeURIComponent(assignedProjects[0]));
  const workerBlocked=await api(effectiveWorker,database,organizationId,workerProbe,'GET','/api/projects/'+encodeURIComponent(blockedWorkerProject));
  const leadAllowed=await api(effectiveWorker,database,organizationId,leadProbe,'GET','/api/projects/'+encodeURIComponent(leadProjects.at(-1)));
  const leadBlocked=await api(effectiveWorker,database,organizationId,leadProbe,'GET','/api/projects/'+encodeURIComponent(blockedLeadProject));
  const transferPersonId=String(reinforcementPerson.id),transferUser=userForPerson(userByPerson,transferPersonId),transferAssignment=assignmentSpecs.find(item=>item.event==='team_change_in'&&item.peopleIds.includes(transferPersonId));
  const transferBlockedProject=jobs.map(job=>String(job.id)).find(id=>!accessByUser.get(transferUser).has(id));
  if(!transferAssignment||!transferBlockedProject)throw Error('BATXL IA3: contrôle changement d’équipe incomplet.');
  const transferAllowed=await api(effectiveWorker,database,organizationId,transferUser,'GET','/api/projects/'+encodeURIComponent(transferAssignment.projectId));
  const transferBlocked=await api(effectiveWorker,database,organizationId,transferUser,'GET','/api/projects/'+encodeURIComponent(transferBlockedProject));
  if(workerAllowed.status!==200||workerBlocked.status!==403||leadAllowed.status!==200||leadBlocked.status!==403||transferAllowed.status!==200||transferBlocked.status!==403){
    throw Error('BATXL IA3: contrôle cross-project inattendu: '+JSON.stringify({workerAllowed:workerAllowed.status,workerBlocked:workerBlocked.status,leadAllowed:leadAllowed.status,leadBlocked:leadBlocked.status,transferAllowed:transferAllowed.status,transferBlocked:transferBlocked.status}));
  }

  const summary={
    pack:PACK_CODE,
    version:PACK_VERSION,
    period:{from:dates[0],to:dates.at(-1),workingDays:dates.length},
    people:{source:people.length,fieldPermanent:fieldPersonIds.length,floater:0,temporaryReinforcement:1,accounting:1,accountingPersonId:null,accountingUserId:accountingUser,reusedUsers,batxlUsers:dbCount(database,"SELECT COUNT(*) count FROM organization_members WHERE organization_id=? AND user_id LIKE 'BATXL-USER-%'",organizationId)},
    projects:{total:jobs.length,batxlAdded:addedProjects},
    teams:teams.map((team,index)=>({id:String(team.id),name:String(team.name||('Équipe '+(index+1))),permanentPeople:permanentGroups[index].length,assignments:assignmentSpecs.filter(item=>item.teamIndex===index).length})),
    assignments:dbCount(database,"SELECT COUNT(*) count FROM field_assignments WHERE organization_id=? AND id LIKE 'BATXL-ASG-%'"+(tableColumns(database,'field_assignments').has('status')?" AND status<>'cancelled'":''),organizationId),
    pointages:dbCount(database,"SELECT COUNT(*) count FROM time_entries WHERE organization_id=? AND id LIKE 'BATXL-TE-%'",organizationId),
    corrections:{
      total:dbCount(database,"SELECT COUNT(*) count FROM time_entry_corrections WHERE organization_id=? AND id LIKE 'BATXL-COR-%'",organizationId),
      approved:dbCount(database,"SELECT COUNT(*) count FROM time_entry_corrections WHERE organization_id=? AND id LIKE 'BATXL-COR-%' AND status='approved'",organizationId),
      rejected:dbCount(database,"SELECT COUNT(*) count FROM time_entry_corrections WHERE organization_id=? AND id LIKE 'BATXL-COR-%' AND status='rejected'",organizationId),
      pending:dbCount(database,"SELECT COUNT(*) count FROM time_entry_corrections WHERE organization_id=? AND id LIKE 'BATXL-COR-%' AND status='pending'",organizationId)
    },
    tasks:{
      total:dbCount(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-TASK-%'",organizationId),
      urgent:dbCount(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-TASK-%' AND priority='urgent'",organizationId),
      blocked:dbCount(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-TASK-%' AND status='blocked'",organizationId),
      done:dbCount(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-TASK-%' AND status='done'",organizationId),
      validated:dbCount(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-TASK-%' AND validated_at IS NOT NULL",organizationId)
    },
    events:eventCounts,
    projectAccess:{
      grants:[...accessByUser.values()].reduce((sum,set)=>sum+set.size,0),
      workerProbe:{userId:workerProbe,assignedProject:assignedProjects[0],blockedProject:blockedWorkerProject,allowedStatus:workerAllowed.status,blockedStatus:workerBlocked.status},
      teamLeadProbe:{userId:leadProbe,assignedProject:leadProjects.at(-1),blockedProject:blockedLeadProject,allowedStatus:leadAllowed.status,blockedStatus:leadBlocked.status},
      teamChangeProbe:{userId:transferUser,assignedProject:transferAssignment.projectId,blockedProject:transferBlockedProject,allowedStatus:transferAllowed.status,blockedStatus:transferBlocked.status}
    },
    breakMinutes:45,
    legacyRolesAssigned:legacyRoleCount
  };
  upsertSimulationRun(database,{organizationId,ownerId,summary});
  return summary;
}

function openLocalDatabase(){
  const here=dirname(fileURLToPath(import.meta.url));
  const root=resolve(here,'../../..');
  const dataDirectory=join(root,'data');
  mkdirSync(dataDirectory,{recursive:true});
  const database=new DatabaseSync(join(dataDirectory,'socle.sqlite'));
  database.exec('PRAGMA foreign_keys=ON');
  database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
  for(const name of readdirSync(join(root,'drizzle')).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    if(database.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
    database.exec('BEGIN');
    try{
      database.exec(readFileSync(join(root,'drizzle',name),'utf8'));
      database.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
      database.exec('COMMIT');
    }catch(error){
      database.exec('ROLLBACK');
      throw error;
    }
  }
  return database;
}

const direct=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(direct){
  const database=openLocalDatabase();
  const summary=await runPlanningPeoplePack({database});
  console.log('BATINOVA XL — IA3 planning/people pack appliqué.');
  console.log(JSON.stringify(summary,null,2));
}
