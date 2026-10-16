import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const PACK_CODE='BATXL-IA5-DOCUMENTS';
export const PACK_VERSION=1;
export const DEFAULT_ORGANIZATION_ID='org-local-owner';
export const TARGET_TOTAL=260;
export const TARGET_PHOTOS=190;
export const TARGET_DOCUMENTS=70;

const PDF_BYTES=new TextEncoder().encode('%PDF-1.4\n%BATXL\n%%EOF');
const JPEG_BYTES=new Uint8Array([0xff,0xd8,0xff,0xd9]);

function parseJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function pad(value){return String(value).padStart(5,'0')}
function docId(index){return 'BATXL-DOC-'+pad(26000+index-1)}
function photoId(index){return 'BATXL-PHO-'+pad(29000+index-1)}
function operationKey(domain,index){
  const ordinal=(domain==='photo'?29000:26000)+index-1;
  return 'BATXL-OP-'+domain.toUpperCase()+'-'+pad(ordinal)+'-UPSERT';
}
function relationId(documentId,index){return 'BATXL-REL-'+documentId.replace(/^BATXL-/,'')+'-'+String(index+1).padStart(2,'0')}
function auditId(documentId,action){return 'BATXL-AUD-'+action.toUpperCase()+'-'+documentId.replace(/^BATXL-/,'')}
function isoDate(index){const d=new Date(Date.UTC(2026,7,1+(index%55),8,0,0));return d.toISOString().slice(0,10)}
function isoStamp(index,hour=8){return isoDate(index)+'T'+String(hour).padStart(2,'0')+':00:00.000Z'}
function checksum(bytes){return createHash('sha256').update(bytes).digest('hex')}
function tableExists(database,name){return Boolean(database.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name=?").get(name))}
function idsFromTable(database,table,organizationId,extra='1=1'){
  if(!tableExists(database,table))return [];
  return database.prepare('SELECT id FROM '+table+' WHERE organization_id=? AND '+extra+' ORDER BY id').all(organizationId).map(row=>String(row.id));
}
function ensureRole(database,organizationId,code,stamp){
  const existing=database.prepare('SELECT id FROM roles WHERE organization_id=? AND code=? ORDER BY id LIMIT 1').get(organizationId,code);
  if(existing)return String(existing.id);
  const roleId='BATXL-DOC-ROLE-'+code;
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(roleId,organizationId,code,code,stamp);
  return roleId;
}
function ensurePermission(database,roleId,code){
  if(!database.prepare('SELECT 1 ok FROM permissions WHERE code=?').get(code))return;
  database.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(roleId,code);
}
function ensureProbeUser(database,{organizationId,userId,roleId,stamp,label}){
  database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,updated_at=excluded.updated_at')
    .run(userId,label,'BATXL',userId.toLowerCase()+'@simulation.invalid',stamp,stamp);
  database.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?, 'active',?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role_id=excluded.role_id,status='active',updated_at=excluded.updated_at")
    .run('BATXL-DOC-MEMBER-'+userId,organizationId,userId,roleId,stamp,stamp,stamp);
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
  let body;
  if(payload!==undefined){headers['content-type']='application/json';body=JSON.stringify(payload)}
  const response=await worker.fetch(new Request('https://socle.batinova-xl.local'+path,{method,headers,...(body!==undefined?{body}:{})}),buildEnv(database));
  let result={};try{result=await response.json()}catch{}
  return {status:response.status,body:result};
}
function chooseOwner(database,organizationId){
  const row=database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId);
  if(!row?.user_id)throw Error('BATXL IA5: OWNER actif introuvable.');
  return String(row.user_id);
}
function relationTarget(kind,index,context){
  const project=context.projects[index%context.projects.length];
  if(kind==='delivery'&&context.deliveries.length)return {type:'delivery',targetId:context.deliveries[index%context.deliveries.length]};
  if(kind==='quote'&&context.quotes.length)return {type:'quote',targetId:context.quotes[index%context.quotes.length]};
  if(kind==='expense'&&context.expenses.length)return {type:'expense',targetId:context.expenses[index%context.expenses.length]};
  if(kind==='supplier'&&context.suppliers.length)return {type:'supplier',targetId:context.suppliers[index%context.suppliers.length]};
  if(kind==='customer'&&context.customers.length)return {type:'customer',targetId:context.customers[index%context.customers.length]};
  if(kind==='person'&&context.people.length)return {type:'person',targetId:context.people[index%context.people.length]};
  if(kind==='asset'&&context.assets.length)return {type:'asset',targetId:context.assets[index%context.assets.length]};
  if(kind==='purchase_order'&&context.purchaseOrders.length)return {type:'purchase_order',targetId:context.purchaseOrders[index%context.purchaseOrders.length]};
  return {type:'project',targetId:project};
}
function upsertDocument(database,{organizationId,folderId,ownerId,id,bytes,contentType,originalName,title,description,category,reference,sensitivity,status,documentType,documentDate,origin,businessOwner,relations,archivedAt,archivedReason,idempotencyKey,createdAt}){
  const hash=checksum(bytes),storageKey='private/'+organizationId+'/'+id;
  database.prepare("INSERT OR IGNORE INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key,document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .run(id,organizationId,folderId,storageKey,originalName,contentType,bytes.byteLength,hash,sensitivity,status,ownerId,createdAt,createdAt,archivedAt,title,description,category,reference,idempotencyKey,documentType,documentDate,origin,businessOwner.type,businessOwner.targetId,'manual','not_requested',archivedReason||'');
  database.prepare("UPDATE secure_documents SET folder_id=?,storage_key=?,original_name=?,content_type=?,byte_size=?,checksum_sha256=?,sensitivity=?,status=?,uploaded_by=?,created_at=?,updated_at=?,archived_at=?,title=?,description=?,category=?,reference=?,idempotency_key=?,document_type=?,document_date=?,origin=?,business_owner_type=?,business_owner_id=?,classification_source='manual',ocr_status='not_requested',archived_reason=? WHERE organization_id=? AND id=?")
    .run(folderId,storageKey,originalName,contentType,bytes.byteLength,hash,sensitivity,status,ownerId,createdAt,createdAt,archivedAt,title,description,category,reference,idempotencyKey,documentType,documentDate,origin,businessOwner.type,businessOwner.targetId,archivedReason||'',organizationId,id);
  const actual=database.prepare('SELECT id FROM secure_documents WHERE organization_id=? AND id=? AND idempotency_key=?').get(organizationId,id,idempotencyKey);
  if(!actual)throw Error('BATXL IA5: collision id/idempotencyKey pour '+id);
  database.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?) ON CONFLICT(document_id) DO UPDATE SET content=excluded.content,created_at=excluded.created_at')
    .run(id,organizationId,bytes,createdAt);
  database.prepare('DELETE FROM document_relations WHERE organization_id=? AND document_id=?').run(organizationId,id);
  relations.forEach((relation,index)=>{
    database.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(relationId(id,index),organizationId,id,relation.type,relation.targetId,ownerId,createdAt);
  });
  database.prepare("INSERT OR IGNORE INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,NULL,?,?)")
    .run(auditId(id,'upload'),organizationId,ownerId,'document.uploaded','secure_document',id,JSON.stringify({title,document_type:documentType,relations}),createdAt);
  if(archivedAt){
    database.prepare("INSERT OR IGNORE INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,NULL,?,?)")
      .run(auditId(id,'archive'),organizationId,ownerId,'document.archived','secure_document',id,JSON.stringify({archived_at:archivedAt,reason:archivedReason||'Simulation BATXL'}),archivedAt);
  }
}
function logicalFingerprint(database,organizationId){
  const rows=database.prepare("SELECT id,storage_key,original_name,document_type,document_date,origin,business_owner_type,business_owner_id,sensitivity,status,archived_at,idempotency_key FROM secure_documents WHERE organization_id=? AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%') ORDER BY id").all(organizationId);
  const relations=database.prepare("SELECT document_id,relation_type,relation_id FROM document_relations WHERE organization_id=? AND (document_id LIKE 'BATXL-DOC-%' OR document_id LIKE 'BATXL-PHO-%') ORDER BY document_id,relation_type,relation_id").all(organizationId);
  return createHash('sha256').update(JSON.stringify({rows,relations})).digest('hex');
}
function upsertSimulationRun(database,{organizationId,ownerId,summary}){
  const runId='BATXL-RUN-IA5-DOCUMENTS-V1';
  database.prepare('INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json')
    .run(runId,organizationId,PACK_CODE,PACK_VERSION,'2026-09-29T18:45:00.000Z',ownerId,JSON.stringify(summary));
}
function adminSeries(){
  return [
    {type:'delivery_note',label:'Bon de livraison',count:10,relation:'delivery'},
    {type:'report',label:'PV de réception',count:8,relation:'project'},
    {type:'quote',label:'Devis',count:8,relation:'quote'},
    {type:'supplier_invoice',label:'Facture fournisseur',count:8,relation:'expense'},
    {type:'contract',label:'Contrat',count:6,relation:'customer'},
    {type:'certificate',label:'Attestation',count:6,relation:'person'},
    {type:'technical',label:'Dossier matériel',count:6,relation:'asset'},
    {type:'technical',label:'Maintenance véhicule',count:4,relation:'asset'},
    {type:'technical',label:'Plan simulé',count:4,relation:'project'},
    {type:'certificate',label:'Autorisation',count:4,relation:'project'},
    {type:'technical',label:'Document technique',count:6,relation:'project'}
  ];
}
async function withProbeDatabase(database,probe){
  const temporaryRoot=realpathSync(tmpdir());
  const directory=mkdtempSync(join(temporaryRoot,'socle-documents-probe-'));
  let probeDatabase;
  try{
    const path=join(directory,'socle.sqlite');
    // Les GET confidentiels sont audités : exécuter la sonde sur un snapshot
    // garde l'audit serveur actif sans ajouter de faux accès à la simulation.
    database.prepare('VACUUM INTO ?').run(path);
    probeDatabase=new DatabaseSync(path);
    probeDatabase.exec('PRAGMA foreign_keys=ON');
    return await probe(probeDatabase);
  }finally{
    probeDatabase?.close();
    const actualDirectory=realpathSync(directory);
    if(dirname(actualDirectory)!==temporaryRoot||!/^socle-documents-probe-[^\\/]+$/.test(basename(actualDirectory)))throw Error('BATXL IA5: nettoyage hors répertoire temporaire refusé.');
    rmSync(actualDirectory,{recursive:true,force:true});
  }
}
async function securityProbe(database,organizationId,worker,ownerId,projects){
  if(!worker||projects.length<2)return {executed:false,reason:'worker ou projets insuffisants'};
  const stamp='2026-09-29T18:40:00.000Z';
  const leadRole=ensureRole(database,organizationId,'TEAM_LEAD',stamp);
  const workerRole=ensureRole(database,organizationId,'WORKER',stamp);
  for(const roleId of [leadRole,workerRole]){
    ensurePermission(database,roleId,'projects.view.assigned');
    ensurePermission(database,roleId,'documents.secure.view');
  }
  const leadUser='BATXL-DOC-TL-USER',fieldUser='BATXL-DOC-W-USER';
  ensureProbeUser(database,{organizationId,userId:leadUser,roleId:leadRole,stamp,label:'Document Team Lead'});
  ensureProbeUser(database,{organizationId,userId:fieldUser,roleId:workerRole,stamp,label:'Document Worker'});
  const assigned=projects[0],blocked=projects[1];
  database.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(organizationId,leadUser,assigned,ownerId,stamp);
  database.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(organizationId,fieldUser,assigned,ownerId,stamp);
  const standard=database.prepare("SELECT d.id FROM secure_documents d JOIN document_relations r ON r.organization_id=d.organization_id AND r.document_id=d.id WHERE d.organization_id=? AND r.relation_type='project' AND r.relation_id=? AND d.sensitivity='standard' AND d.archived_at IS NULL AND (d.id LIKE 'BATXL-DOC-%' OR d.id LIKE 'BATXL-PHO-%') ORDER BY d.id LIMIT 1").get(organizationId,assigned);
  const confidential=database.prepare("SELECT d.id FROM secure_documents d JOIN document_relations r ON r.organization_id=d.organization_id AND r.document_id=d.id WHERE d.organization_id=? AND r.relation_type='project' AND r.relation_id=? AND d.sensitivity='confidential' AND d.archived_at IS NULL AND (d.id LIKE 'BATXL-DOC-%' OR d.id LIKE 'BATXL-PHO-%') ORDER BY d.id LIMIT 1").get(organizationId,assigned);
  const blockedDoc=database.prepare("SELECT d.id FROM secure_documents d JOIN document_relations r ON r.organization_id=d.organization_id AND r.document_id=d.id WHERE d.organization_id=? AND r.relation_type='project' AND r.relation_id=? AND d.sensitivity='standard' AND d.archived_at IS NULL AND (d.id LIKE 'BATXL-DOC-%' OR d.id LIKE 'BATXL-PHO-%') ORDER BY d.id LIMIT 1").get(organizationId,blocked);
  if(!standard?.id||!confidential?.id||!blockedDoc?.id)throw Error('BATXL IA5: documents de probe sécurité introuvables.');
  return withProbeDatabase(database,async probeDatabase=>{
  const auditCount=()=>Number(probeDatabase.prepare('SELECT COUNT(*) count FROM document_access_logs WHERE organization_id=?').get(organizationId).count);
  const auditBefore=auditCount();
  const ownerConfidential=await api(worker,probeDatabase,organizationId,ownerId,'GET','/api/documents/'+encodeURIComponent(confidential.id));
  const leadAssigned=await api(worker,probeDatabase,organizationId,leadUser,'GET','/api/documents/'+encodeURIComponent(standard.id));
  const leadBlocked=await api(worker,probeDatabase,organizationId,leadUser,'GET','/api/documents/'+encodeURIComponent(blockedDoc.id));
  const leadConfidential=await api(worker,probeDatabase,organizationId,leadUser,'GET','/api/documents/'+encodeURIComponent(confidential.id));
  const workerAssigned=await api(worker,probeDatabase,organizationId,fieldUser,'GET','/api/documents/'+encodeURIComponent(standard.id));
  const workerBlocked=await api(worker,probeDatabase,organizationId,fieldUser,'GET','/api/documents/'+encodeURIComponent(blockedDoc.id));
  const workerConfidential=await api(worker,probeDatabase,organizationId,fieldUser,'GET','/api/documents/'+encodeURIComponent(confidential.id));
  const search=await api(worker,probeDatabase,organizationId,ownerId,'GET','/api/documents?q=BATXL&limit=25');
  const page2=search.body?.nextCursor?await api(worker,probeDatabase,organizationId,ownerId,'GET','/api/documents?q=BATXL&limit=25&cursor='+encodeURIComponent(search.body.nextCursor)):null;
  const archived=await api(worker,probeDatabase,organizationId,ownerId,'GET','/api/documents?archived=archived&limit=25');
  const result={
    executed:true,
    confidentialAuditRecorded:auditCount()===auditBefore+1,
    assignedProject:assigned,
    blockedProject:blocked,
    ownerConfidential:ownerConfidential.status,
    teamLead:{assigned:leadAssigned.status,blocked:leadBlocked.status,confidential:leadConfidential.status},
    worker:{assigned:workerAssigned.status,blocked:workerBlocked.status,confidential:workerConfidential.status},
    search:{status:search.status,count:Array.isArray(search.body?.documents)?search.body.documents.length:0,nextCursor:Boolean(search.body?.nextCursor)},
    pagination:{secondPageStatus:page2?.status??null,secondPageCount:Array.isArray(page2?.body?.documents)?page2.body.documents.length:0},
    archive:{status:archived.status,count:Array.isArray(archived.body?.documents)?archived.body.documents.length:0}
  };
  if(!result.confidentialAuditRecorded||result.ownerConfidential!==200||result.teamLead.assigned!==200||result.teamLead.blocked!==404||result.teamLead.confidential!==404||result.worker.assigned!==200||result.worker.blocked!==404||result.worker.confidential!==404||result.search.status!==200||!result.search.nextCursor||result.pagination.secondPageStatus!==200||result.archive.status!==200||result.archive.count<1){
    throw Error('BATXL IA5: probe sécurité/recherche/pagination inattendu: '+JSON.stringify(result));
  }
  return result;
  });
}

export async function runDocumentsPack({database,organizationId=DEFAULT_ORGANIZATION_ID,worker=null}={}){
  if(!database)throw Error('BATXL IA5: database obligatoire.');
  database.exec('PRAGMA foreign_keys=ON');
  const workspace=database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  if(!workspace)throw Error('BATXL IA5: organization_workspace_state introuvable pour '+organizationId);
  const state=parseJson(workspace.payload,{});
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw Error('BATXL IA5: la société active n’est pas BatiNova.');
  const projects=(state.jobs||[]).filter(item=>item&&item.id!==undefined&&item.id!==null).map(item=>String(item.id));
  if(projects.length<2)throw Error('BATXL IA5: au moins 2 chantiers sont requis.');
  const people=(state.people||[]).filter(item=>item&&item.id!==undefined&&item.id!==null).map(item=>String(item.id));
  const assets=(state.assets||[]).filter(item=>item&&item.id!==undefined&&item.id!==null).map(item=>String(item.id));
  const quotes=(state.quotes||[]).filter(item=>item&&item.id!==undefined&&item.id!==null).map(item=>String(item.id));
  const suppliers=idsFromTable(database,'suppliers',organizationId,'archived_at IS NULL');
  const customers=idsFromTable(database,'customers',organizationId,'archived_at IS NULL');
  const expenses=idsFromTable(database,'expenses',organizationId,'archived_at IS NULL');
  const purchaseOrders=idsFromTable(database,'purchase_orders',organizationId,'archived_at IS NULL');
  const deliveries=idsFromTable(database,'field_delivery_notes',organizationId,'1=1');
  const context={projects,people,assets,quotes,suppliers,customers,expenses,purchaseOrders,deliveries};
  const ownerId=chooseOwner(database,organizationId);
  const stamp='2026-08-01T08:00:00.000Z';
  const folderId='BATXL-DOC-FOLDER-26000';
  database.prepare("INSERT OR IGNORE INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'BatiNova XL','company',NULL,'standard',?,?,?)")
    .run(folderId,organizationId,ownerId,stamp,stamp);

  let adminIndex=0;
  for(const series of adminSeries()){
    for(let offset=0;offset<series.count;offset++){
      adminIndex++;
      const id=docId(adminIndex),projectId=projects[(adminIndex-1)%projects.length];
      const preferred=relationTarget(series.relation,adminIndex-1,context);
      const relations=[{type:'project',targetId:projectId}];
      if(preferred.type!=='project'||preferred.targetId!==projectId)relations.push(preferred);
      const archived=adminIndex>TARGET_DOCUMENTS-4;
      const sensitivity=adminIndex%17===0?'restricted':adminIndex%7===0?'confidential':'standard';
      const date=isoDate(adminIndex),createdAt=isoStamp(adminIndex,8),archivedAt=archived?isoStamp(adminIndex,18):null;
      upsertDocument(database,{
        organizationId,folderId,ownerId,id,bytes:PDF_BYTES,contentType:'application/pdf',
        originalName:id.toLowerCase()+'.pdf',
        title:'BATXL · '+series.label+' '+String(offset+1).padStart(2,'0'),
        description:'Simulation BatiNova XL — '+series.label+' rattaché au registre documentaire transversal.',
        category:series.label,
        reference:'BATXL-REF-'+pad(26000+adminIndex-1),
        sensitivity,status:archived?'archived':'available',documentType:series.type,documentDate:date,
        origin:'generated',businessOwner:preferred,relations,archivedAt,archivedReason:archived?'BATXL archivage de démonstration':'',
        idempotencyKey:operationKey('document',adminIndex),createdAt
      });
    }
  }

  const phases=['Avant travaux','Pendant travaux','Réception','Problème chantier'];
  for(let index=1;index<=TARGET_PHOTOS;index++){
    const id=photoId(index),projectId=projects[(index-1)%projects.length],phase=phases[(index-1)%phases.length];
    const archived=index>TARGET_PHOTOS-2;
    const sensitivity=index<=projects.length?'confidential':index%37===0?'restricted':'standard';
    const date=isoDate(100+index),createdAt=isoStamp(100+index,10),archivedAt=archived?isoStamp(100+index,19):null;
    upsertDocument(database,{
      organizationId,folderId,ownerId,id,bytes:JPEG_BYTES,contentType:'image/jpeg',
      originalName:id.toLowerCase()+'.jpg',
      title:'BATXL · '+phase+' · Photo '+String(index).padStart(3,'0'),
      description:'Photo chantier simulée — '+phase+'.',
      category:'Photo chantier - '+phase,
      reference:'BATXL-PHOTO-'+pad(29000+index-1),
      sensitivity,status:archived?'archived':'available',documentType:'photo',documentDate:date,
      origin:'mobile_upload',businessOwner:{type:'project',targetId:projectId},relations:[{type:'project',targetId:projectId}],
      archivedAt,archivedReason:archived?'BATXL archivage photo de démonstration':'',
      idempotencyKey:operationKey('photo',index),createdAt
    });
  }

  const effectiveWorker=worker||(await import('../../../worker/index.js')).default;
  const security=await securityProbe(database,organizationId,effectiveWorker,ownerId,projects);
  const total=Number(database.prepare("SELECT COUNT(*) count FROM secure_documents WHERE organization_id=? AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%')").get(organizationId).count);
  const photos=Number(database.prepare("SELECT COUNT(*) count FROM secure_documents WHERE organization_id=? AND id LIKE 'BATXL-PHO-%'").get(organizationId).count);
  const docs=Number(database.prepare("SELECT COUNT(*) count FROM secure_documents WHERE organization_id=? AND id LIKE 'BATXL-DOC-%'").get(organizationId).count);
  const archived=Number(database.prepare("SELECT COUNT(*) count FROM secure_documents WHERE organization_id=? AND archived_at IS NOT NULL AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%')").get(organizationId).count);
  const confidential=Number(database.prepare("SELECT COUNT(*) count FROM secure_documents WHERE organization_id=? AND sensitivity IN ('confidential','restricted') AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%')").get(organizationId).count);
  const blobs=Number(database.prepare("SELECT COUNT(*) count FROM secure_document_blobs WHERE organization_id=? AND (document_id LIKE 'BATXL-DOC-%' OR document_id LIKE 'BATXL-PHO-%')").get(organizationId).count);
  const relations=Number(database.prepare("SELECT COUNT(*) count FROM document_relations WHERE organization_id=? AND (document_id LIKE 'BATXL-DOC-%' OR document_id LIKE 'BATXL-PHO-%')").get(organizationId).count);
  const publicStorage=Number(database.prepare("SELECT COUNT(*) count FROM secure_documents WHERE organization_id=? AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%') AND storage_key NOT LIKE 'private/%'").get(organizationId).count);
  const idempotencyKeys=Number(database.prepare("SELECT COUNT(DISTINCT idempotency_key) count FROM secure_documents WHERE organization_id=? AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%')").get(organizationId).count);
  const byType=Object.fromEntries(database.prepare("SELECT document_type type,COUNT(*) count FROM secure_documents WHERE organization_id=? AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%') GROUP BY document_type ORDER BY document_type").all(organizationId).map(row=>[String(row.type),Number(row.count)]));
  if(total!==TARGET_TOTAL||photos!==TARGET_PHOTOS||docs!==TARGET_DOCUMENTS||blobs!==TARGET_TOTAL||publicStorage!==0||idempotencyKeys!==TARGET_TOTAL)throw Error('BATXL IA5: volumes/intégrité documentaire inattendus: '+JSON.stringify({total,photos,docs,blobs,publicStorage,idempotencyKeys}));
  const summary={pack:PACK_CODE,version:PACK_VERSION,total,documents:docs,photos,archived,confidential,blobs,relations,publicStorage,idempotencyKeys,byType,security,fingerprint:logicalFingerprint(database,organizationId)};
  upsertSimulationRun(database,{organizationId,ownerId,summary});
  return summary;
}

function openLocalDatabase(){
  const here=dirname(fileURLToPath(import.meta.url));
  const root=resolve(here,'../../..');
  const dataDirectory=join(root,'data');
  mkdirSync(dataDirectory,{recursive:true});
  const databasePath=process.env.BATXL_DB_PATH?resolve(process.env.BATXL_DB_PATH):join(dataDirectory,'socle.sqlite');
  const database=new DatabaseSync(databasePath);
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
  const organizationId=process.env.BATXL_ORGANIZATION_ID||DEFAULT_ORGANIZATION_ID;
  const summary=await runDocumentsPack({database,organizationId});
  console.log('BATINOVA XL — IA5 documents pack appliqué.');
  console.log(JSON.stringify(summary,null,2));
}
