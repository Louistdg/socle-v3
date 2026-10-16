import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACK_CODE='BATXL-IA1-FIELD-OPERATIONS-STORIES';
export const PACK_VERSION=2;
export const DEFAULT_ORGANIZATION_ID='org-local-owner';

function parseJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function unique(values){return [...new Set(values.filter(Boolean).map(String))]}
function dateTime(date,time){return String(date)+'T'+String(time)+'.000Z'}
function count(database,sql,...args){return Number(database.prepare(sql).get(...args)?.count||0)}
function projectBySource(state,sourceProjectId){
  return (state.jobs||[]).find(project=>String(project.sourceScenarioId||project.id)===String(sourceProjectId))||null;
}
function canonicalSpec(state,spec){
  const project=projectBySource(state,spec.projectId);
  if(!project)throw new Error('BATXL terrain: chantier source introuvable: '+String(spec.projectId));
  return {...spec,sourceProjectId:String(spec.projectId),projectId:String(project.id)};
}

function ownerFor(database,organizationId){
  const row=database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId);
  if(!row?.user_id)throw new Error('BATXL terrain: OWNER actif introuvable.');
  return String(row.user_id);
}

function actorForProject(database,organizationId,projectId,ownerId){
  const row=database.prepare("SELECT om.user_id,r.code FROM project_access pa JOIN organization_members om ON om.organization_id=pa.organization_id AND om.user_id=pa.user_id AND om.status='active' JOIN roles r ON r.id=om.role_id WHERE pa.organization_id=? AND pa.project_id=? AND r.code IN ('WORKER','TEAM_LEAD') ORDER BY CASE r.code WHEN 'WORKER' THEN 0 ELSE 1 END,om.user_id LIMIT 1").get(organizationId,String(projectId));
  return row?.user_id?String(row.user_id):ownerId;
}

function leadForProject(database,organizationId,projectId,ownerId){
  const row=database.prepare("SELECT om.user_id FROM project_access pa JOIN organization_members om ON om.organization_id=pa.organization_id AND om.user_id=pa.user_id AND om.status='active' JOIN roles r ON r.id=om.role_id WHERE pa.organization_id=? AND pa.project_id=? AND r.code='TEAM_LEAD' ORDER BY om.user_id LIMIT 1").get(organizationId,String(projectId));
  return row?.user_id?String(row.user_id):ownerId;
}

function personIdForUser(database,organizationId,userId){
  const row=database.prepare('SELECT person_id FROM organization_members WHERE organization_id=? AND user_id=? AND status=\'active\' LIMIT 1').get(organizationId,String(userId));
  return row?.person_id===undefined||row?.person_id===null?null:String(row.person_id);
}

function photosForProject(database,organizationId,projectId,limit=2){
  try{
    return database.prepare("SELECT sd.id,sd.original_name FROM secure_documents sd JOIN document_relations dr ON dr.organization_id=sd.organization_id AND dr.document_id=sd.id WHERE sd.organization_id=? AND dr.relation_type='project' AND dr.relation_id=? AND sd.id LIKE 'BATXL-PHO-%' AND sd.archived_at IS NULL ORDER BY sd.id LIMIT ?").all(organizationId,String(projectId),Number(limit));
  }catch{
    return [];
  }
}

function audit(database,{id,organizationId,userId,action,entityType,entityId,newValues,createdAt}){
  database.prepare('INSERT OR IGNORE INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,NULL,?,?)')
    .run(id,organizationId,userId,action,entityType,entityId,JSON.stringify(newValues||{}),createdAt);
}

function upsertProblem(database,{organizationId,ownerId,index,spec}){
  const id='BATXL-FLD-PROB-'+String(index).padStart(3,'0');
  const reporter=actorForProject(database,organizationId,spec.projectId,ownerId);
  const lead=leadForProject(database,organizationId,spec.projectId,ownerId);
  const photos=spec.withPhoto?photosForProject(database,organizationId,spec.projectId,2):[];
  const photoIds=photos.map(item=>String(item.id));
  const people=unique([reporter,lead]);
  const createdAt=dateTime(spec.date,'07:35:00');
  const updatedAt=dateTime(spec.date,spec.status==='done'?'16:20:00':'15:10:00');
  const completedAt=spec.status==='done'?dateTime(spec.date,'15:45:00'):null;
  const validatedBy=spec.status==='done'?lead:null;
  const validatedAt=spec.status==='done'?dateTime(spec.date,'16:20:00'):null;
  const operationKey='BATXL-FLD-PROB-OP-'+String(index).padStart(3,'0');
  const checklist=[
    {id:'secure-zone',label:'Sécuriser ou baliser la zone',done:spec.status==='done'},
    {id:'inform-lead',label:'Informer le chef d’équipe',done:spec.status==='done'||spec.status==='in_progress'},
    {id:'close-action',label:'Tracer la résolution',done:spec.status==='done'}
  ];
  const materials=spec.materials||[];
  database.prepare("INSERT INTO project_tasks(id,organization_id,project_id,title,description,status,priority,assigned_to,created_by,created_at,updated_at,completed_at,due_at,checklist_json,materials_json,people_json,operation_key,task_kind,problem_category,photo_document_ids_json,validated_by,validated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,title=excluded.title,description=excluded.description,status=excluded.status,priority=excluded.priority,assigned_to=excluded.assigned_to,created_by=excluded.created_by,created_at=excluded.created_at,updated_at=excluded.updated_at,completed_at=excluded.completed_at,due_at=excluded.due_at,checklist_json=excluded.checklist_json,materials_json=excluded.materials_json,people_json=excluded.people_json,operation_key=excluded.operation_key,task_kind=excluded.task_kind,problem_category=excluded.problem_category,photo_document_ids_json=excluded.photo_document_ids_json,validated_by=excluded.validated_by,validated_at=excluded.validated_at,archived_at=NULL")
    .run(id,organizationId,spec.projectId,spec.title,spec.description,spec.status,spec.priority,lead,reporter,createdAt,updatedAt,completedAt,spec.dueAt,JSON.stringify(checklist),JSON.stringify(materials),JSON.stringify(people),operationKey,'problem',spec.category,JSON.stringify(photoIds),validatedBy,validatedAt);
  audit(database,{id:'BATXL-FLD-AUD-P-'+String(index).padStart(3,'0')+'-CREATE',organizationId,userId:reporter,action:'project_problem.reported',entityType:'project_task',entityId:id,newValues:{project_id:spec.projectId,category:spec.category,status:'todo',photo_document_ids:photoIds},createdAt});
  if(spec.status!=='todo')audit(database,{id:'BATXL-FLD-AUD-P-'+String(index).padStart(3,'0')+'-STATUS',organizationId,userId:lead,action:'task.status.changed',entityType:'project_task',entityId:id,newValues:{status:spec.status},createdAt:updatedAt});
  if(spec.status==='done')audit(database,{id:'BATXL-FLD-AUD-P-'+String(index).padStart(3,'0')+'-VALID',organizationId,userId:lead,action:'task.validated',entityType:'project_task',entityId:id,newValues:{validated_by:lead,validated_at:validatedAt},createdAt:validatedAt});
  if(spec.comment){
    const commentId='BATXL-FLD-CMT-'+String(index).padStart(3,'0');
    database.prepare('INSERT OR IGNORE INTO project_task_comments(id,task_id,organization_id,body,created_by,created_at) VALUES(?,?,?,?,?,?)')
      .run(commentId,id,organizationId,spec.comment,lead,dateTime(spec.date,'13:10:00'));
  }
  return {id,photoLinks:photoIds.length};
}

function upsertNote(database,{organizationId,ownerId,index,spec}){
  const id='BATXL-FLD-NOTE-'+String(index).padStart(3,'0');
  const author=actorForProject(database,organizationId,spec.projectId,ownerId);
  const photos=spec.withPhoto?photosForProject(database,organizationId,spec.projectId,1):[];
  const photoIds=photos.map(item=>String(item.id));
  const createdAt=dateTime(spec.date,spec.time||'14:20:00');
  const operationKey='BATXL-FLD-NOTE-OP-'+String(index).padStart(3,'0');
  database.prepare("INSERT INTO field_project_notes(id,organization_id,project_id,note_date,visibility,body,photo_name,author_person_id,created_by,created_at,operation_key,photo_document_ids_json,updated_by,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET project_id=excluded.project_id,note_date=excluded.note_date,visibility=excluded.visibility,body=excluded.body,photo_name=excluded.photo_name,author_person_id=excluded.author_person_id,created_by=excluded.created_by,created_at=excluded.created_at,operation_key=excluded.operation_key,photo_document_ids_json=excluded.photo_document_ids_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at,archived_at=NULL")
    .run(id,organizationId,spec.projectId,spec.date,spec.visibility,spec.body,photos[0]?.original_name||null,personIdForUser(database,organizationId,author),author,createdAt,operationKey,JSON.stringify(photoIds),author,createdAt);
  audit(database,{id:'BATXL-FLD-AUD-N-'+String(index).padStart(3,'0')+'-CREATE',organizationId,userId:author,action:'project_note.created',entityType:'field_project_note',entityId:id,newValues:{project_id:spec.projectId,visibility:spec.visibility,photo_document_ids:photoIds},createdAt});
  return {id,photoLinks:photoIds.length};
}

function fingerprint(database,organizationId){
  const tasks=database.prepare("SELECT id,project_id,title,description,status,priority,assigned_to,created_by,completed_at,due_at,checklist_json,materials_json,people_json,operation_key,problem_category,photo_document_ids_json,validated_by,validated_at FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' ORDER BY id").all(organizationId);
  const notes=database.prepare("SELECT id,project_id,note_date,visibility,body,photo_name,created_by,operation_key,photo_document_ids_json,archived_at FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%' ORDER BY id").all(organizationId);
  const comments=database.prepare("SELECT id,task_id,body,created_by,created_at FROM project_task_comments WHERE organization_id=? AND id LIKE 'BATXL-FLD-CMT-%' ORDER BY id").all(organizationId);
  return createHash('sha256').update(JSON.stringify({tasks,notes,comments})).digest('hex');
}

const PROBLEMS=[
  {storyIndex:3,projectId:'BATXL-PRJ-007',date:'2026-09-03',dueAt:'2026-09-05',category:'materials',priority:'high',status:'in_progress',withPhoto:true,title:'Signalement · Lames de bardage à compléter',description:'Le métrage disponible sur site ne couvre pas la dernière travée. Comptage réalisé avant demande de complément.',materials:[{name:'Lames Cedral',quantity:18,unit:'pièces'}]},
  {storyIndex:4,projectId:'BATXL-PRJ-012',date:'2026-09-09',dueAt:'2026-09-11',category:'technical',priority:'normal',status:'blocked',withPhoto:true,title:'Signalement · Accès cheminée impraticable',description:'Accès toiture suspendu après pluie et rafales. Reprise conditionnée au séchage et au contrôle du moyen d’accès.',comment:'Maintenir la tâche bloquée tant que l’accès n’est pas sécurisé.'},
  {storyIndex:5,projectId:'BATXL-PRJ-014',date:'2026-09-15',dueAt:'2026-09-16',category:'equipment',priority:'high',status:'in_progress',withPhoto:true,title:'Signalement · Nacelle de location indisponible',description:'Défaut hydraulique signalé sur la nacelle louée pendant la préparation de façade. Le loueur est contacté pour remplacement; l’équipe est redéployée sur une zone accessible.'},
  {storyIndex:6,projectId:'BATXL-PRJ-002',date:'2026-09-18',dueAt:'2026-09-18',category:'site_error',priority:'high',status:'done',withPhoto:false,title:'Signalement · Alignement liteaux à reprendre',description:'Écart d’alignement détecté avant couverture. Deux lignes déposées puis reposées avant validation.',comment:'Reprise terminée et contrôle visuel conforme.'},
  {storyIndex:7,projectId:'BATXL-PRJ-008',date:'2026-09-22',dueAt:'2026-09-24',category:'technical',priority:'normal',status:'in_progress',withPhoto:true,title:'Signalement · Détail linteau à confirmer',description:'Le détail d’appui au-dessus de la baie diffère du plan de principe. Pose suspendue localement jusqu’à confirmation technique.'},
  {storyIndex:8,projectId:'BATXL-PRJ-010',date:'2026-09-24',dueAt:'2026-09-25',category:'other',priority:'normal',status:'todo',withPhoto:false,title:'Signalement · Zone à libérer avant pose',description:'Une zone technique reste encombrée par un autre corps de métier. Intervention à replanifier dès libération.'}
];

const NOTES=[
  {storyIndex:4,projectId:'BATXL-PRJ-004',date:'2026-09-02',visibility:'Équipe et patron',withPhoto:true,body:'Pare-vapeur et première zone PIR terminés. Relevés laissés ouverts en attente du complément EPDM.'},
  {storyIndex:5,projectId:'BATXL-PRJ-006',date:'2026-09-07',visibility:'Équipe et patron',withPhoto:false,body:'Ancienne descente déposée. Mesures définitives prises avant façonnage du dernier raccord zinc.'},
  {storyIndex:6,projectId:'BATXL-PRJ-007',date:'2026-09-10',visibility:'Équipe et patron',withPhoto:true,body:'Sous-structure bardage contrôlée sur façade nord. Écart de fourniture noté pour la dernière travée.'},
  {storyIndex:7,projectId:'BATXL-PRJ-008',date:'2026-09-14',visibility:'Patron uniquement',withPhoto:false,body:'Réserver la fermeture de la baie principale jusqu’à validation du détail de linteau.'},
  {storyIndex:8,projectId:'BATXL-PRJ-010',date:'2026-09-17',visibility:'Équipe et patron',withPhoto:false,body:'Traçage des cloisons terminé. Une zone reste indisponible à cause du stockage du lot technique voisin.'},
  {storyIndex:9,projectId:'BATXL-PRJ-011',date:'2026-09-19',visibility:'Équipe et patron',withPhoto:true,body:'Réparation infiltration terminée. Ardoises et solin contrôlés après arrosage localisé.'},
  {storyIndex:10,projectId:'BATXL-PRJ-012',date:'2026-09-21',visibility:'Équipe et patron',withPhoto:true,body:'Accès cheminée maintenu fermé après météo défavorable. Photos prises avant remise en sécurité du matériel.'},
  {storyIndex:11,projectId:'BATXL-PRJ-013',date:'2026-09-23',visibility:'Équipe et patron',withPhoto:false,body:'Frein-vapeur raccordé sur la zone témoin. Percements techniques à traiter avant fermeture définitive.'},
  {storyIndex:12,projectId:'BATXL-PRJ-014',date:'2026-09-25',visibility:'Patron uniquement',withPhoto:true,body:'Zone façade réaffectée après indisponibilité de la nacelle louée. L’équipe poursuit sur le secteur accessible en attendant le remplacement fournisseur.'}
];

export function runFieldOperationsStoriesPack({database,organizationId=DEFAULT_ORGANIZATION_ID}={}){
  if(!database)throw new Error('BATXL terrain: database obligatoire.');
  database.exec('PRAGMA foreign_keys=ON');
  const workspace=database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  if(!workspace)throw new Error('BATXL terrain: organization_workspace_state introuvable.');
  const state=parseJson(workspace.payload,{});
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw new Error('BATXL terrain: société BatiNova attendue.');
  const required=unique([...PROBLEMS,...NOTES].map(item=>item.projectId));
  const missing=required.filter(sourceId=>!projectBySource(state,sourceId));
  if(missing.length)throw new Error('BATXL terrain: chantiers calibrés manquants: '+missing.join(', '));
  const problemSpecs=PROBLEMS.map(spec=>canonicalSpec(state,spec));
  const noteSpecs=NOTES.map(spec=>canonicalSpec(state,spec));
  for(const spec of [...problemSpecs,...noteSpecs])if(spec.projectId===spec.sourceProjectId||!/^BATXL-PRJ-02\d{3}$/.test(spec.projectId))throw new Error('BATXL terrain: mapping canonique invalide '+spec.sourceProjectId+' -> '+spec.projectId);

  const ownerId=ownerFor(database,organizationId);
  let photoLinks=0;
  for(const spec of problemSpecs)photoLinks+=upsertProblem(database,{organizationId,ownerId,index:spec.storyIndex,spec}).photoLinks;
  for(const spec of noteSpecs)photoLinks+=upsertNote(database,{organizationId,ownerId,index:spec.storyIndex,spec}).photoLinks;

  const problems=count(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' AND archived_at IS NULL",organizationId);
  const blockedProblems=count(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' AND status='blocked' AND archived_at IS NULL",organizationId);
  const doneProblems=count(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' AND status='done' AND archived_at IS NULL",organizationId);
  const notes=count(database,"SELECT COUNT(*) count FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%' AND archived_at IS NULL",organizationId);
  const comments=count(database,"SELECT COUNT(*) count FROM project_task_comments WHERE organization_id=? AND id LIKE 'BATXL-FLD-CMT-%' AND archived_at IS NULL",organizationId);
  const categories=database.prepare("SELECT problem_category category,COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' GROUP BY problem_category ORDER BY problem_category").all(organizationId);
  const projectsCovered=Number(database.prepare("SELECT COUNT(DISTINCT project_id) count FROM (SELECT project_id FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' UNION SELECT project_id FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%')").get(organizationId,organizationId)?.count||0);
  const notesWithPhotos=count(database,"SELECT COUNT(*) count FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%' AND photo_document_ids_json<>'[]' AND archived_at IS NULL",organizationId);
  const problemsWithPhotos=count(database,"SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' AND photo_document_ids_json<>'[]' AND archived_at IS NULL",organizationId);
  const sourceToCanonical=Object.fromEntries(required.map(sourceId=>[sourceId,String(projectBySource(state,sourceId).id)]));
  const rawProjectReferences=count(database,"SELECT COUNT(*) count FROM (SELECT project_id FROM project_tasks WHERE organization_id=? AND id LIKE 'BATXL-FLD-PROB-%' UNION ALL SELECT project_id FROM field_project_notes WHERE organization_id=? AND id LIKE 'BATXL-FLD-NOTE-%') WHERE project_id IN ("+required.map(()=>'?').join(',')+")",organizationId,organizationId,...required);
  if(rawProjectReferences!==0)throw new Error('BATXL terrain: références métier source persistées: '+rawProjectReferences);
  const summary={period:{from:'2026-09-01',to:'2026-09-30'},problems,blockedProblems,doneProblems,notes,comments,projectsCovered,photoLinks,notesWithPhotos,problemsWithPhotos,categories,sourceToCanonical,rawProjectReferences,fingerprint:fingerprint(database,organizationId)};
  database.prepare("INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json")
    .run('BATXL-RUN-FIELD-STORIES-V2',organizationId,PACK_CODE,PACK_VERSION,'2026-09-30T18:30:00.000Z',ownerId,JSON.stringify(summary));
  return summary;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const databasePath=process.env.BATXL_DB_PATH||'data/socle.sqlite';
  const database=new DatabaseSync(databasePath);
  try{
    const summary=runFieldOperationsStoriesPack({database,organizationId:process.env.BATXL_ORGANIZATION_ID||DEFAULT_ORGANIZATION_ID});
    console.log(JSON.stringify({pack:PACK_CODE,version:PACK_VERSION,summary},null,2));
  }finally{
    database.close();
  }
}
