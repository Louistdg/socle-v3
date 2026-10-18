import {deliveryScanRoute,deliveryScanDocumentAccess} from './delivery-scans.js';
import {approvedContractChangesCents,projectedContractMarginCents} from './project-financial-revenue.js';
import {timeEntriesMonthlyRoute,timeEntriesMonthlyCloseRoute} from './time-entry-monthly.js';
import {BATINOVA_MANUAL_TEST_ORGANIZATION_ID as MANUAL_TEST_ORGANIZATION_ID,BATINOVA_MANUAL_TEST_INVITATIONS as MANUAL_TEST_INVITATIONS,batinovaWorkspaceRosterPeople,batinovaWorkspaceRosterPerson,batinovaWorkspaceTeamIds,manualTestInvitationTarget} from './batinova-invitation-roster.js';
const json=(data,status=200,extraHeaders={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...extraHeaders}});
// Legacy screens still render inline event attributes, including generated controls; removing script unsafe-inline before migrating them breaks normal UI interactions.
const now=()=>new Date().toISOString();
const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
const SOCLE_DEFAULT_TIME_ZONE='Europe/Brussels';
const SOCLE_V3_RAILWAY_PROJECT_ID='7a1eaac4-1d0d-469d-bab2-94dc4493c5e8';
function v3ManualInvitationsEnabled(env,organizationId){return env.SOCLE_V3_MANUAL_INVITATIONS==='1'&&env.RAILWAY_PROJECT_ID===SOCLE_V3_RAILWAY_PROJECT_ID&&Boolean(env.SOCLE_V3_MANUAL_ORGANIZATION_ID)&&String(organizationId)===String(env.SOCLE_V3_MANUAL_ORGANIZATION_ID)}
function socleBusinessTimeZone(state){
  const candidate=String(state?.company?.timeZone||state?.company?.timezone||SOCLE_DEFAULT_TIME_ZONE).trim()||SOCLE_DEFAULT_TIME_ZONE;
  try{new Intl.DateTimeFormat('en-CA',{timeZone:candidate}).format(new Date(0));return candidate}catch{return SOCLE_DEFAULT_TIME_ZONE}
}
function socleBusinessDate(state,instant=now()){
  const date=instant instanceof Date?instant:new Date(instant);
  if(Number.isNaN(date.getTime()))throw Object.assign(Error('Instant métier invalide.'),{status:500});
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:socleBusinessTimeZone(state),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),values={};
  for(const part of parts)if(part.type==='year'||part.type==='month'||part.type==='day')values[part.type]=part.value;
  return values.year+'-'+values.month+'-'+values.day;
}

export function validState(s){return s&&s.version===3&&s.company&&typeof s.company.name==='string'&&['people','teams','jobs','assignments','quotes','assets','tasks','dossiers','reminders'].every(k=>Array.isArray(s[k]))&&s.assets.every(a=>a&&typeof a.name==='string')&&s.reminders.every(a=>a&&typeof a.id==='string'&&['todo','validation','waiting','problem','done'].includes(a.state));}
async function rows(statement){const result=await statement.all();return result.results||result||[]}
// The hosted Sites gateway identifies a signed-in visitor by email, while the
// local development server provides a stable user id. Accept both identities so
// the same protected workspace loads in either environment.
function userId(request){return request.headers.get('oai-authenticated-user-id')||request.headers.get('oai-authenticated-user-email')}
function authenticatedEmail(request){return String(request.headers.get('oai-authenticated-user-email')||'').trim().toLowerCase()}
function sameOrigin(request,url){const origin=request.headers.get('origin');return !origin||origin===url.origin}
async function body(request,max=250000){if(!request.headers.get('content-type')?.startsWith('application/json'))throw Object.assign(Error('Format attendu : JSON.'),{status:415});const text=await request.text();if(text.length>max)throw Object.assign(Error('Requête trop volumineuse.'),{status:413});try{return JSON.parse(text)}catch{throw Object.assign(Error('Données illisibles.'),{status:400})}}

const canonicalRoleDefaults=[
  {code:'TEAM_LEAD',name:'Chef d’équipe',permissions:['workspace.view','projects.view.assigned','contacts.view.assigned','tasks.view.assigned','tasks.manage.project','tasks.update.assigned','tasks.comment.create','time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.correction.request','time_entries.correction.review','project_materials.create','project_execution.edit','project_notes.create','planning.assignments.manage','stock.consume.assigned','assets.view','fuel.create','asset_issues.create','documents.view.assigned','documents.secure.view','quotes.view','messages.view','messages.send']},
  {code:'WORKER',name:'Ouvrier',permissions:['workspace.view','projects.view.assigned','contacts.view.assigned','tasks.view.assigned','tasks.update.assigned','tasks.comment.create','time_entries.view.own','time_entries.create.own','time_entries.correction.request','project_materials.create','project_notes.create','stock.consume.assigned','assets.view','fuel.create','asset_issues.create','documents.view.assigned','documents.secure.view','quotes.view','messages.view','messages.send']},
  {code:'ACCOUNTING',name:'Comptable',permissions:['financial.dashboard.view','accounting.view','expenses.view','expenses.create','invoices.view','payments.create','credit_notes.create','supplier_allocations.view','supplier_allocations.create','supplier_allocations.cancel','purchase_orders.view','documents.secure.view','quotes.view','quotes.prices.view','customers.view','customers.create','customers.edit','suppliers.edit','bank.view','bank.manage','bank.reconcile','quote_amendments.view','quote_amendments.create','messages.view']}
];
function canonicalOrganizationRoleStatements(env,organizationId,ownerRoleId,roleIdFor,stamp,{ignoreConflicts=true}={}){
  const insert=ignoreConflicts?'INSERT OR IGNORE':'INSERT';
  const statements=[env.DB.prepare(`${insert} INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)`).bind(ownerRoleId,organizationId,'OWNER','Propriétaire',stamp)];
  for(const definition of canonicalRoleDefaults){
    const roleId=roleIdFor(definition);
    statements.push(env.DB.prepare(`${insert} INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)`).bind(roleId,organizationId,definition.code,definition.name,stamp));
    for(const permission of definition.permissions)statements.push(env.DB.prepare(`${insert} INTO role_permissions(role_id,permission_code) SELECT ?,code FROM permissions WHERE code=?`).bind(roleId,permission));
  }
  return statements;
}
async function bootstrap(env,uid){
  const stamp=now(),organizationId=`org-${uid}`,ownerRoleId=`role-owner-${uid}`,statements=[
    env.DB.prepare('INSERT OR IGNORE INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').bind(uid,'Propriétaire','Socle',stamp,stamp),
    env.DB.prepare('INSERT OR IGNORE INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(organizationId,'Mon entreprise','Mon entreprise','BE','EUR',stamp,stamp)
  ];
  statements.push(...canonicalOrganizationRoleStatements(env,organizationId,ownerRoleId,definition=>`role-${definition.code.toLowerCase().replaceAll('_','-')}-${uid}`,stamp));
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(`member-${uid}`,organizationId,uid,ownerRoleId,'active',stamp,stamp,stamp));
  await dbBatch(env,statements,{strict:false});
  return organizationId;
}
function organizationBootstrapAllowed(env){return ['1','true','yes','on'].includes(String(env?.SOCLE_ALLOW_BOOTSTRAP||'').trim().toLowerCase())}
async function invitationAcceptanceContext(request,env){
  const uid=userId(request);if(!uid)throw Object.assign(Error('Connexion requise.'),{status:401});
  const authenticated=authenticatedEmail(request),profile=await env.DB.prepare('SELECT email FROM profiles WHERE id=?').bind(uid).first();
  return {uid,organizationId:null,roleId:null,roleCode:null,email:authenticated||String(profile?.email||'').trim().toLowerCase()};
}
async function context(request,env){const uid=userId(request);if(!uid)throw Object.assign(Error('Connexion requise.'),{status:401});const requested=request.headers.get('x-socle-organization-id');let membership=requested?await env.DB.prepare("SELECT om.organization_id,om.role_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.user_id=? AND om.organization_id=? AND om.status='active'").bind(uid,requested).first():await env.DB.prepare("SELECT om.organization_id,om.role_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.user_id=? AND om.status='active' ORDER BY om.joined_at LIMIT 1").bind(uid).first();if(!membership&&!requested&&!request.headers.get('x-socle-access-preview-user-id')&&organizationBootstrapAllowed(env)){await bootstrap(env,uid);membership=await env.DB.prepare("SELECT om.organization_id,om.role_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.user_id=? AND om.status='active' ORDER BY om.joined_at LIMIT 1").bind(uid).first()}if(!membership)throw Object.assign(Error('Accès refusé à cette entreprise.'),{status:403});return {uid,organizationId:membership.organization_id,roleId:membership.role_id,roleCode:membership.role_code}}
async function accessPreviewContext(request,env,actorCtx){
  const targetUserId=String(request.headers.get('x-socle-access-preview-user-id')||'').trim();
  if(!targetUserId)return actorCtx;
  if(!['GET','HEAD'].includes(request.method))throw Object.assign(Error('Le mode test des accès est strictement en lecture seule.'),{status:403});
  if(actorCtx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut prévisualiser un accès.'),{status:403});
  const member=await env.DB.prepare("SELECT om.user_id,om.role_id,om.person_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.organization_id=? AND om.user_id=? AND om.status='active'").bind(actorCtx.organizationId,targetUserId).first();
  if(!member)throw Object.assign(Error('Ce compte ne possède pas d’adhésion active dans l’entreprise sélectionnée.'),{status:404});
  const roleCode=String(member.role_code||'');
  if(!['TEAM_LEAD','WORKER','ACCOUNTING'].includes(roleCode))throw Object.assign(Error('Le rôle serveur de ce compte ne peut pas être prévisualisé.'),{status:403});
  if(['TEAM_LEAD','WORKER'].includes(roleCode)&&!member.person_id)throw Object.assign(Error('Ce compte terrain n’est relié à aucune personne active du roster; son accès ne peut pas être prévisualisé fidèlement.'),{status:403});
  return{...actorCtx,uid:member.user_id,roleId:member.role_id,roleCode,preview:true,previewActorUid:actorCtx.uid};
}
async function accessPolicy(env,ctx){
  if(ctx._accessPolicy)return ctx._accessPolicy;
  const owner=ctx.roleCode==='OWNER';
  const permissionRows=owner?[]:await rows(env.DB.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').bind(ctx.roleId));
  const permissions=new Set(permissionRows.map(row=>row.permission_code));
  const settings=await env.DB.prepare('SELECT profile_name,scope FROM member_access_settings WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,ctx.uid).first();
  const configured=Boolean(settings||String(ctx.roleCode||'').startsWith('USER_')||[...permissions].some(code=>code.startsWith('ui.')));
  const scope=settings?.scope||(permissions.has('projects.view.all')?'Toute l’entreprise':permissions.has('projects.view.assigned')?'Ses chantiers uniquement':'Ses propres informations');
  const policy={owner,roleCode:ctx.roleCode,permissions,configured,scope,profileName:settings?.profile_name||null,has(permission){return owner||permissions.has(permission)}};
  ctx._accessPolicy=policy;
  return policy;
}
async function allowed(env,ctx,permission){return (await accessPolicy(env,ctx)).has(permission)}
const quotePriceRestrictedScopes=new Set(['Ses propres informations','Ses propres informations et chantiers','Ses chantiers uniquement']);
function quotePriceScopeAllows(scope){return !quotePriceRestrictedScopes.has(String(scope||''))}
async function quotePriceReadable(env,ctx){const policy=await accessPolicy(env,ctx);if(policy.owner)return true;if(policy.roleCode==='WORKER')return false;if(policy.roleCode==='ACCOUNTING')return policy.has('quotes.prices.view');if(!quotePriceScopeAllows(policy.scope))return false;return policy.has('quotes.prices.view')}
async function requireQuotePriceRead(env,ctx){if(!await quotePriceReadable(env,ctx))throw Object.assign(Error('Vous n’avez pas l’autorisation nécessaire.'),{status:403})}
async function profitabilityReadable(env,ctx){const policy=await accessPolicy(env,ctx);if(policy.owner)return true;if(policy.roleCode==='WORKER')return false;if(!quotePriceScopeAllows(policy.scope))return false;return policy.has('margins.view')}
async function requireProfitabilityRead(env,ctx){if(!await profitabilityReadable(env,ctx))throw Object.assign(Error('Vous n’avez pas l’autorisation nécessaire.'),{status:403})}
async function requirePermission(env,ctx,permission){if(!await allowed(env,ctx,permission))throw Object.assign(Error('Vous n’avez pas l’autorisation nécessaire.'),{status:403})}
async function audit(env,ctx,action,entityType,entityId,newValues,oldValues=null){await env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id('audit'),ctx.organizationId,ctx.uid,action,entityType,entityId,oldValues===null?null:JSON.stringify(oldValues),JSON.stringify(newValues),now()).run()}
function cents(value){const number=Number(value);if(!Number.isFinite(number)||number<0)throw Object.assign(Error('Montant invalide.'),{status:400});return Math.round(number*100)}

function auditStatement(env,ctx,action,entityType,entityId,newValues,oldValues=null){return env.DB.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id('audit'),ctx.organizationId,ctx.uid,action,entityType,entityId,oldValues===null?null:JSON.stringify(oldValues),JSON.stringify(newValues),now())}
async function dbBatch(env,statements,{strict=true}={}){if(typeof env.DB.batch==='function')return env.DB.batch(statements);if(strict)throw Object.assign(Error('Backend transactionnel requis pour cette opération.'),{status:503});const out=[];for(const statement of statements)out.push(await statement.run());return out}
function operationKey(data){const value=String(data?.operationKey||'').trim();if(!/^[A-Za-z0-9._:-]{8,160}$/.test(value))throw Object.assign(Error('Clé d’opération invalide ou manquante.'),{status:400});return value}
const USER_PREFERENCE_BODY_LIMIT=20*1024,USER_PREFERENCE_VALUE_LIMIT=16*1024;
const USER_PREFERENCE_SCHEMAS=Object.freeze({
  dashboard:Object.freeze({version:1,keys:new Set(['layout','widgets','density','canvas','job-tabs','jobs-order'])}),
  'quick-actions':Object.freeze({version:1,keys:new Set(['items'])}),
  'saved-views':Object.freeze({version:1,keys:new Set(['definitions'])}),
  resume:Object.freeze({version:1,keys:new Set(['context'])}),
});
const USER_PREFERENCE_FORBIDDEN_FIELDS=/^(?:user_?id|organization_?id|role|permissions?|scope|access|authorization|auth|token|secret|credential|membership|project_?access)$/i;
function userPreferenceDescriptor(namespace,key){
  const descriptor=USER_PREFERENCE_SCHEMAS[namespace];
  if(!descriptor||!descriptor.keys.has(key))throw Object.assign(Error('Espace ou clé de préférence inconnus.'),{status:400});
  return descriptor;
}
function validateUserPreferenceValue(value){
  const seen=new Set();let nodes=0;
  function visit(item,depth){
    if(depth>8||++nodes>1500)throw Object.assign(Error('Préférence trop complexe.'),{status:400});
    if(item===null||typeof item==='boolean'||typeof item==='number')return;
    if(typeof item==='string'){if(item.length>2048)throw Object.assign(Error('Texte de préférence trop long.'),{status:400});return;}
    if(typeof item!=='object')throw Object.assign(Error('Valeur de préférence invalide.'),{status:400});
    if(seen.has(item))throw Object.assign(Error('Valeur de préférence cyclique.'),{status:400});seen.add(item);
    if(Array.isArray(item)){if(item.length>200)throw Object.assign(Error('Liste de préférence trop longue.'),{status:400});for(const child of item)visit(child,depth+1);}
    else{const keys=Object.keys(item);if(keys.length>100)throw Object.assign(Error('Préférence trop complexe.'),{status:400});for(const key of keys){if(key.length>80||USER_PREFERENCE_FORBIDDEN_FIELDS.test(key))throw Object.assign(Error('Une préférence ne peut contenir de droit, identité ou secret.'),{status:400});visit(item[key],depth+1);}}
    seen.delete(item);
  }
  if(value===null||typeof value!=='object')throw Object.assign(Error('La préférence doit être un objet ou une liste JSON.'),{status:400});
  visit(value,0);
  const serialized=JSON.stringify(value),size=new TextEncoder().encode(serialized).length;
  if(size>USER_PREFERENCE_VALUE_LIMIT)throw Object.assign(Error('Préférence trop volumineuse.'),{status:413});
  return serialized;
}
async function requireUserPreferencePermission(env,ctx){
  const policy=await accessPolicy(env,ctx);
  // Reuse an existing application-entry permission. Preferences add no grant
  // and do not participate in authorization or resource-scope decisions.
  if(!(policy.owner||['workspace.view','accounting.view','ui.module.personal.view','ui.module.planning.view','planning.view'].some(permission=>policy.has(permission))))throw Object.assign(Error('Aucune autorisation active pour les préférences utilisateur.'),{status:403});
}
async function userPreferencesRoute(request,url,env,ctx,namespace,key){
  await requireUserPreferencePermission(env,ctx);
  if([...url.searchParams.keys()].length)throw Object.assign(Error('Paramètre de requête inattendu.'),{status:400});
  const org=ctx.organizationId,uid=ctx.uid,sharedPlanningDays=namespace==='planning'&&key==='visible-days';
  const present=row=>row?{namespace:row.namespace,key:row.preference_key,schemaVersion:Number(row.schema_version),value:JSON.parse(row.value_json),createdAt:row.created_at,updatedAt:row.updated_at}:null;
  if(sharedPlanningDays){
    if(request.method!=='GET'&&ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le patron peut régler les jours visibles du planning.'),{status:403});
    if(request.method==='GET'){
      const row=await env.DB.prepare("SELECT 'planning' AS namespace,preference_key,schema_version,value_json,created_at,updated_at FROM organization_preferences WHERE organization_id=? AND preference_key='planning-visible-days' AND schema_version=1").bind(org).first();
      return json({preference:present(row)});
    }
    if(request.method==='PUT'){
      const data=exactObject(await body(request,USER_PREFERENCE_BODY_LIMIT),['schemaVersion','value']);
      if(data.schemaVersion!==1)throw Object.assign(Error('Version de schéma de préférence inconnue.'),{status:400});
      const settings=exactObject(data.value,['days']),days=settings.days,allowedDays=new Set([0,1,2,3,4,5,6]);
      if(!Array.isArray(days)||days.length<5||days.length>7||days.some(day=>!Number.isInteger(day)||!allowedDays.has(day))||new Set(days).size!==days.length||[1,2,3,4,5].some(day=>!days.includes(day)))throw Object.assign(Error('Le planning doit conserver les jours ouvrés et ne peut ajouter que samedi ou dimanche.'),{status:400});
      const valueJson=validateUserPreferenceValue({days:[1,2,3,4,5,...[6,0].filter(day=>days.includes(day))]}),stamp=now();
      await env.DB.prepare("INSERT INTO organization_preferences(organization_id,preference_key,schema_version,value_json,created_at,updated_at,updated_by) VALUES(?,'planning-visible-days',1,?,?,?,?) ON CONFLICT(organization_id,preference_key,schema_version) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(org,valueJson,stamp,stamp,uid).run();
      const row=await env.DB.prepare("SELECT 'planning' AS namespace,preference_key,schema_version,value_json,created_at,updated_at FROM organization_preferences WHERE organization_id=? AND preference_key='planning-visible-days' AND schema_version=1").bind(org).first();
      return json({preference:present(row)});
    }
    if(request.method==='DELETE'){
      await env.DB.prepare("DELETE FROM organization_preferences WHERE organization_id=? AND preference_key='planning-visible-days'").bind(org).run();
      return new Response(null,{status:204,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
    }
    return json({error:'Méthode non autorisée.'},405);
  }
  const target=namespace===undefined?null:userPreferenceDescriptor(namespace,key);
  if(target===null){
    if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
    const stored=await rows(env.DB.prepare('SELECT namespace,preference_key,schema_version,value_json,created_at,updated_at FROM user_preferences WHERE organization_id=? AND user_id=? ORDER BY namespace,preference_key,schema_version').bind(org,uid));
    return json({preferences:stored.filter(row=>USER_PREFERENCE_SCHEMAS[row.namespace]?.version===Number(row.schema_version)).map(present)});
  }
  if(request.method==='GET'){
    const row=await env.DB.prepare('SELECT namespace,preference_key,schema_version,value_json,created_at,updated_at FROM user_preferences WHERE organization_id=? AND user_id=? AND namespace=? AND preference_key=? AND schema_version=?').bind(org,uid,namespace,key,target.version).first();
    return json({preference:present(row)});
  }
  if(request.method==='PUT'){
    const data=exactObject(await body(request,USER_PREFERENCE_BODY_LIMIT),['schemaVersion','value']);
    if(data.schemaVersion!==target.version)throw Object.assign(Error('Version de schéma de préférence inconnue.'),{status:400});
    const value=data.value;
    const valueJson=validateUserPreferenceValue(value),stamp=now();
    await env.DB.prepare('INSERT INTO user_preferences(organization_id,user_id,namespace,preference_key,schema_version,value_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,user_id,namespace,preference_key,schema_version) DO UPDATE SET value_json=excluded.value_json,updated_at=excluded.updated_at').bind(org,uid,namespace,key,target.version,valueJson,stamp,stamp).run();
    const row=await env.DB.prepare('SELECT namespace,preference_key,schema_version,value_json,created_at,updated_at FROM user_preferences WHERE organization_id=? AND user_id=? AND namespace=? AND preference_key=? AND schema_version=?').bind(org,uid,namespace,key,target.version).first();
    return json({preference:present(row)});
  }
  if(request.method==='DELETE'){
    await env.DB.prepare('DELETE FROM user_preferences WHERE organization_id=? AND user_id=? AND namespace=? AND preference_key=?').bind(org,uid,namespace,key).run();
    return new Response(null,{status:204,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  }
  return json({error:'Méthode non autorisée.'},405);
}
async function stockLocation(env,ctx,locationId,{active=true}={}){const row=await env.DB.prepare('SELECT * FROM stock_locations WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(locationId||'')).first();if(!row||active&&row.status!=='active')throw Object.assign(Error('Emplacement de stock introuvable dans cette entreprise.'),{status:404});return row}


async function auditLogRoutes(request,url,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Le journal d’activité est réservé au propriétaire.'),{status:403});
  const rawLimit=Number(url.searchParams.get('limit')||80),limit=Number.isInteger(rawLimit)?Math.max(1,Math.min(200,rawLimit)):80,entityType=String(url.searchParams.get('entity_type')||'').trim();
  let query="SELECT a.id,a.action,a.entity_type,a.entity_id,a.old_values,a.new_values,a.created_at,a.user_id,p.first_name,p.last_name,p.email FROM audit_logs a LEFT JOIN profiles p ON p.id=a.user_id WHERE a.organization_id=?",values=[ctx.organizationId];
  if(entityType){query+=' AND a.entity_type=?';values.push(entityType)}
  query+=' ORDER BY a.created_at DESC,a.id DESC LIMIT ?';values.push(limit);
  const events=await rows(env.DB.prepare(query).bind(...values));
  return json({events:events.map(event=>({id:event.id,action:event.action,entityType:event.entity_type,entityId:event.entity_id,actorId:event.user_id,actorName:[event.first_name,event.last_name].filter(Boolean).join(' ')||event.email||event.user_id,createdAt:event.created_at,oldValues:parseJson(event.old_values||'null',null),newValues:parseJson(event.new_values||'null',null)}))});
}

async function simulationRunRoutes(request,url,env,ctx){
  if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Les simulations produit sont réservées au propriétaire.'),{status:403});
  if(request.method==='GET'){
    const code=String(url.searchParams.get('script_code')||'').trim(),version=Number(url.searchParams.get('version')||0);
    let query='SELECT id,script_code,version,applied_at,applied_by,summary_json FROM simulation_runs WHERE organization_id=?',values=[ctx.organizationId];
    if(code){query+=' AND script_code=?';values.push(code)}if(version){query+=' AND version=?';values.push(version)}query+=' ORDER BY applied_at DESC';
    const runs=await rows(env.DB.prepare(query).bind(...values));return json({runs:runs.map(run=>({id:run.id,scriptCode:run.script_code,version:Number(run.version),appliedAt:run.applied_at,appliedBy:run.applied_by,summary:parseJson(run.summary_json,{})}))});
  }
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  const data=exactObject(await body(request,60000),['scriptCode','version','summary']),scriptCode=fieldText(data.scriptCode||'',120),version=Number(data.version),summary=data.summary&&typeof data.summary==='object'&&!Array.isArray(data.summary)?data.summary:{};
  if(!scriptCode||!Number.isInteger(version)||version<1)return json({error:'Référence de simulation invalide.'},400);
  const existing=await env.DB.prepare('SELECT * FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=?').bind(ctx.organizationId,scriptCode,version).first();
  if(existing)return json({run:{id:existing.id,scriptCode:existing.script_code,version:Number(existing.version),appliedAt:existing.applied_at,appliedBy:existing.applied_by,summary:parseJson(existing.summary_json,{})},replayed:true},200);
  const runId=id('simulation-run'),stamp=now();await dbBatch(env,[env.DB.prepare('INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?)').bind(runId,ctx.organizationId,scriptCode,version,stamp,ctx.uid,JSON.stringify(summary)),auditStatement(env,ctx,'simulation.applied','simulation_run',runId,{script_code:scriptCode,version,summary})]);
  return json({run:{id:runId,scriptCode,version,appliedAt:stamp,appliedBy:ctx.uid,summary}},201);
}

async function accountingSummary(request,env,ctx){await requirePermission(env,ctx,'financial.dashboard.view');const org=ctx.organizationId,today=now().slice(0,10);const invoices=await env.DB.prepare("SELECT COALESCE(SUM(MAX(total_cents-amount_paid_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=invoices.organization_id AND c.invoice_id=invoices.id),0),0)),0) receivable,COALESCE(SUM(CASE WHEN due_date<? AND status NOT IN ('paid','cancelled','credited','credit_due') THEN MAX(total_cents-amount_paid_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=invoices.organization_id AND c.invoice_id=invoices.id),0),0) ELSE 0 END),0) overdue,SUM(CASE WHEN due_date<? AND status NOT IN ('paid','cancelled','credited','credit_due') THEN 1 ELSE 0 END) overdue_count FROM invoices WHERE organization_id=? AND archived_at IS NULL AND status NOT IN ('paid','cancelled','credited','credit_due')").bind(today,today,org).first();const expenses=await env.DB.prepare("SELECT COALESCE(SUM(outstanding_cents),0) payable,COALESCE(SUM(CASE WHEN due_date<? AND outstanding_cents>0 THEN outstanding_cents ELSE 0 END),0) overdue,COALESCE(SUM(CASE WHEN due_date<? AND outstanding_cents>0 THEN 1 ELSE 0 END),0) overdue_count,COALESCE(SUM(total_cents),0) spent FROM (SELECT e.total_cents,e.due_date,MAX(e.total_cents-COALESCE(p.paid_cents,CASE WHEN e.payment_status='paid' THEN e.total_cents ELSE 0 END),0) outstanding_cents FROM expenses e LEFT JOIN (SELECT organization_id,expense_id,SUM(CASE WHEN status='active' THEN amount_cents ELSE 0 END) paid_cents FROM supplier_payments GROUP BY organization_id,expense_id) p ON p.organization_id=e.organization_id AND p.expense_id=e.id WHERE e.organization_id=? AND e.archived_at IS NULL)").bind(today,today,org).first();const reserves=await env.DB.prepare('SELECT COALESCE(SUM(amount_cents),0) total FROM financial_reserves WHERE organization_id=?').bind(org).first();const bank=await env.DB.prepare('SELECT COALESCE(SUM(current_balance_cents),0) total,COUNT(*) account_count FROM bank_accounts WHERE organization_id=? AND archived_at IS NULL').bind(org).first();const reconciliation=await env.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(CASE WHEN status='reconciled' THEN 1 ELSE 0 END),0) reconciled_count,COALESCE(SUM(CASE WHEN status='unreconciled' THEN 1 ELSE 0 END),0) unreconciled_count,COALESCE(SUM(CASE WHEN status='unreconciled' THEN ABS(amount_cents) ELSE 0 END),0) unreconciled_abs_cents FROM bank_transactions WHERE organization_id=?").bind(org).first();const hasBank=Number(bank?.account_count||0)>0,available=Number(bank?.total||0)-Number(reserves?.total||0)-Number(expenses?.payable||0);return json({currency:'EUR',amountsAreCents:true,bankBalance:Number(bank?.total||0),availableCash:available,clientsOwe:Number(invoices?.receivable||0),overdue:Number(invoices?.overdue||0),overdueCount:Number(invoices?.overdue_count||0),toPay:Number(expenses?.payable||0),supplierOverdue:Number(expenses?.overdue||0),supplierOverdueCount:Number(expenses?.overdue_count||0),spent:Number(expenses?.spent||0),reserves:Number(reserves?.total||0),bankTransactions:Number(reconciliation?.total||0),bankReconciled:Number(reconciliation?.reconciled_count||0),bankUnreconciled:Number(reconciliation?.unreconciled_count||0),bankUnreconciledAbsCents:Number(reconciliation?.unreconciled_abs_cents||0),quality:{complete:hasBank,missing:hasBank?[]:['Aucun compte bancaire renseigné']}})}

function exactObject(data,allowed){if(!data||typeof data!=='object'||Array.isArray(data))throw Object.assign(Error('Données invalides.'),{status:400});const extra=Object.keys(data).filter(key=>!allowed.includes(key));if(extra.length)throw Object.assign(Error('Propriété inattendue.'),{status:400});return data}
function integerCents(value){if(!Number.isSafeInteger(value)||value<=0)throw Object.assign(Error('Montant en centimes invalide.'),{status:400});return value}
function financialText(value,max=500){const text=String(value??'').trim();if(text.length>max)throw Object.assign(Error('Champ texte trop long.'),{status:400});return text}
function paymentMethod(value){const method=String(value||'').trim();if(!['bank_transfer','cash','card','direct_debit','cheque','other'].includes(method))throw Object.assign(Error('Moyen de paiement invalide.'),{status:400});return method}
async function ensureLegacyInvoicesImported(env,ctx){if(ctx.preview)return;
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return;
  const owner=await workspaceOwner(env,ctx.organizationId),createdBy=owner?.user_id||ctx.uid,stamp=now();
  for(const legacy of state?.accountingData?.customerInvoices||[]){
    const sourceId=String(legacy?.id??'').trim(),number=String(legacy?.ref||'').trim();if(!sourceId||!number)continue;
    const existing=await env.DB.prepare('SELECT id FROM invoices WHERE organization_id=? AND (legacy_source_id=? OR invoice_number=?) LIMIT 1').bind(ctx.organizationId,sourceId,number).first();if(existing)continue;
    const total=Math.max(0,Math.round(Number(legacy.amount||0)*100));if(!Number.isSafeInteger(total)||total<=0)continue;
    const vat=Math.max(0,Math.min(total,Math.round(Number(legacy.vatAmount||0)*100))),subtotal=legacy.netAmount==null?total-vat:Math.max(0,Math.round(Number(legacy.netAmount||0)*100)),issue=validIsoDate(legacy.date)?legacy.date:stamp.slice(0,10),due=validIsoDate(legacy.due)?legacy.due:issue,paidLegacy=legacy.status==='Payée'?total:Math.max(0,Math.min(total,Math.round(Number(legacy.amountPaid||0)*100))),status=paidLegacy>=total?'paid':paidLegacy>0?'partially_paid':'unpaid',invoiceId=`legacy-invoice-${sourceId.replace(/[^A-Za-z0-9_-]/g,'_')}`;
    await env.DB.prepare('INSERT OR IGNORE INTO invoices(id,organization_id,customer_id,project_id,quote_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at,legacy_project_id,legacy_source_id,legacy_paid_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(invoiceId,ctx.organizationId,null,null,null,number,'customer',status,issue,due,'EUR',subtotal,vat,total,paidLegacy,financialText(legacy.notes||'',2000),createdBy,stamp,stamp,legacy.job==null?null:String(legacy.job),sourceId,paidLegacy).run();
  }
}
async function invoiceById(env,ctx,invoiceId){return env.DB.prepare('SELECT * FROM invoices WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(String(invoiceId),ctx.organizationId).first()}
async function invoiceScope(env,ctx,invoice){if(!invoice)return false;if(invoice.legacy_project_id)await requireFinanceProjectScope(env,ctx,invoice.legacy_project_id);else if(invoice.project_id)await requireFinanceProjectScope(env,ctx,invoice.project_id);return true}
function invoiceFinancialPayload(invoice,payments=[],credits=[]){
  const creditTotal=credits.reduce((sum,row)=>sum+Number(row.amount_cents||0),0),paid=Number(invoice.amount_paid_cents||0),net=Math.max(0,Number(invoice.total_cents||0)-creditTotal),remaining=Math.max(0,net-paid),creditBalance=Math.max(0,paid-net);
  return{id:invoice.id,invoiceNumber:invoice.invoice_number,legacySourceId:invoice.legacy_source_id||null,projectId:invoice.legacy_project_id||invoice.project_id||null,status:invoice.status,issueDate:invoice.issue_date,dueDate:invoice.due_date,currency:invoice.currency,totalCents:Number(invoice.total_cents),paidCents:paid,creditNoteCents:creditTotal,netTotalCents:net,remainingCents:remaining,customerCreditCents:creditBalance,payments:payments.map(row=>({id:row.id,amountCents:Number(row.amount_cents),paymentDate:row.payment_date,paymentMethod:row.payment_method,reference:row.reference||'',note:row.note||'',createdBy:row.created_by,createdAt:row.created_at})),creditNotes:credits.map(row=>({id:row.id,amountCents:Number(row.amount_cents),creditDate:row.credit_date,reason:row.reason,reference:row.reference||'',note:row.note||'',createdBy:row.created_by,createdAt:row.created_at}))}
}
async function invoiceFinancialJson(env,ctx,invoice){
  const payments=await rows(env.DB.prepare('SELECT id,amount_cents,payment_date,payment_method,reference,note,created_by,created_at,idempotency_key FROM payments WHERE organization_id=? AND invoice_id=? ORDER BY created_at,id').bind(ctx.organizationId,invoice.id));
  const credits=await rows(env.DB.prepare('SELECT id,amount_cents,credit_date,reason,reference,note,created_by,created_at,idempotency_key FROM credit_notes WHERE organization_id=? AND invoice_id=? ORDER BY created_at,id').bind(ctx.organizationId,invoice.id));
  return invoiceFinancialPayload(invoice,payments,credits);
}
function groupInvoiceRows(rowsList){const map=new Map();for(const row of rowsList){const key=String(row.invoice_id),list=map.get(key)||[];list.push(row);map.set(key,list)}return map}
async function invoicesRoute(request,env,ctx){
  if(request.method==='POST'){
    await requirePermission(env,ctx,'invoices.create');
    const data=exactObject(await body(request,50000),['customerId','projectId','invoiceNumber','issueDate','dueDate','subtotalCents','vatAmountCents','notes']),projectId=data.projectId?String(data.projectId):null,customerId=data.customerId?String(data.customerId):null,invoiceNumber=financialText(data.invoiceNumber,120),issueDate=String(data.issueDate||''),dueDate=String(data.dueDate||''),subtotal=integerCents(data.subtotalCents),vat=Number(data.vatAmountCents||0),total=subtotal+vat,notes=financialText(data.notes||'',2000);
    if(!invoiceNumber||!validIsoDate(issueDate)||!validIsoDate(dueDate)||dueDate<issueDate||subtotal<=0||!Number.isSafeInteger(vat)||vat<0)return json({error:'Facture client invalide.'},400);
    if(projectId){const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state||!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);await requireProjectScope(env,ctx,projectId)}
    if(customerId&&!await env.DB.prepare('SELECT 1 ok FROM customers WHERE organization_id=? AND id=?').bind(ctx.organizationId,customerId).first())return json({error:'Client introuvable dans cette entreprise.'},404);
    const existing=await env.DB.prepare('SELECT * FROM invoices WHERE organization_id=? AND invoice_number=?').bind(ctx.organizationId,invoiceNumber).first();
    if(existing){if(String(existing.customer_id||'')!==String(customerId||'')||String(existing.legacy_project_id||existing.project_id||'')!==String(projectId||'')||existing.issue_date!==issueDate||existing.due_date!==dueDate||Number(existing.subtotal_cents)!==subtotal||Number(existing.vat_amount_cents)!==vat||String(existing.notes||'')!==notes)return json({error:'Ce numéro de facture existe déjà avec des données différentes.'},409);return json({invoice:await invoiceFinancialJson(env,ctx,existing),replayed:true},200)}
    const invoiceId=id('invoice'),stamp=now();await dbBatch(env,[env.DB.prepare('INSERT INTO invoices(id,organization_id,customer_id,project_id,quote_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at,legacy_project_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(invoiceId,ctx.organizationId,customerId,null,null,invoiceNumber,'standard','unpaid',issueDate,dueDate,'EUR',subtotal,vat,total,0,notes,ctx.uid,stamp,stamp,projectId),auditStatement(env,ctx,'invoice.created','invoice',invoiceId,{invoice_number:invoiceNumber,project_id:projectId,subtotal_cents:subtotal,vat_amount_cents:vat,total_cents:total})]);const created=await invoiceById(env,ctx,invoiceId);return json({invoice:await invoiceFinancialJson(env,ctx,created)},201)
  }
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'invoices.view');
  const candidates=await rows(env.DB.prepare('SELECT * FROM invoices WHERE organization_id=? AND archived_at IS NULL ORDER BY issue_date DESC,created_at DESC LIMIT 500').bind(ctx.organizationId));
  let projectScope=null;
  const tenantFinanceScope=await hasTenantFinanceScope(env,ctx);
  if(!tenantFinanceScope&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'projects.view.all')){
    projectScope=new Set();
    if(await allowed(env,ctx,'projects.view.assigned'))for(const grant of await rows(env.DB.prepare('SELECT project_id FROM project_access WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,ctx.uid)))projectScope.add(String(grant.project_id));
  }
  const visible=candidates.filter(invoice=>{const projectId=invoice.legacy_project_id||invoice.project_id;return !projectId||projectScope===null||projectScope.has(String(projectId))});
  const payments=await rows(env.DB.prepare("SELECT p.id,p.invoice_id,p.amount_cents,p.payment_date,p.payment_method,p.reference,p.note,p.created_by,p.created_at,p.idempotency_key FROM payments p JOIN (SELECT id FROM invoices WHERE organization_id=? AND archived_at IS NULL ORDER BY issue_date DESC,created_at DESC LIMIT 500) listed ON listed.id=p.invoice_id WHERE p.organization_id=? ORDER BY p.invoice_id,p.created_at,p.id").bind(ctx.organizationId,ctx.organizationId));
  const credits=await rows(env.DB.prepare("SELECT c.id,c.invoice_id,c.amount_cents,c.credit_date,c.reason,c.reference,c.note,c.created_by,c.created_at,c.idempotency_key FROM credit_notes c JOIN (SELECT id FROM invoices WHERE organization_id=? AND archived_at IS NULL ORDER BY issue_date DESC,created_at DESC LIMIT 500) listed ON listed.id=c.invoice_id WHERE c.organization_id=? ORDER BY c.invoice_id,c.created_at,c.id").bind(ctx.organizationId,ctx.organizationId));
  const paymentMap=groupInvoiceRows(payments),creditMap=groupInvoiceRows(credits);
  return json({invoices:visible.map(invoice=>invoiceFinancialPayload(invoice,paymentMap.get(String(invoice.id))||[],creditMap.get(String(invoice.id))||[]))})
}
async function invoiceDetailRoute(request,env,ctx,invoiceId){if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);await requirePermission(env,ctx,'invoices.view');const invoice=await invoiceById(env,ctx,invoiceId);if(!invoice)return json({error:'Facture introuvable.'},404);await invoiceScope(env,ctx,invoice);return json({invoice:await invoiceFinancialJson(env,ctx,invoice)})}
async function invoicePaymentsRoute(request,env,ctx,invoiceId){
  const invoice=await invoiceById(env,ctx,invoiceId);if(!invoice)return json({error:'Facture introuvable.'},404);await invoiceScope(env,ctx,invoice);
  if(request.method==='GET'){await requirePermission(env,ctx,'invoices.view');return json({payments:(await invoiceFinancialJson(env,ctx,invoice)).payments})}
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requirePermission(env,ctx,'payments.create');const data=exactObject(await body(request,30000),['amountCents','paymentDate','paymentMethod','reference','note','operationKey']),amount=integerCents(data.amountCents),date=String(data.paymentDate||'');if(!validIsoDate(date))return json({error:'Date de paiement invalide.'},400);const method=paymentMethod(data.paymentMethod),reference=financialText(data.reference,240),note=financialText(data.note,1000),key=operationKey(data),existing=await env.DB.prepare('SELECT * FROM payments WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(existing){if(existing.invoice_id!==invoice.id||Number(existing.amount_cents)!==amount||existing.payment_date!==date||existing.payment_method!==method||String(existing.reference||'')!==reference||String(existing.note||'')!==note)return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);return json({paymentId:existing.id,replayed:true,invoice:await invoiceFinancialJson(env,ctx,invoice)},200)}
  const paymentId=id('payment'),stamp=now(),insert=env.DB.prepare('INSERT INTO payments(id,organization_id,invoice_id,customer_id,amount_cents,payment_date,payment_method,reference,created_by,created_at,note,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(paymentId,ctx.organizationId,invoice.id,invoice.customer_id,amount,date,method,reference||null,ctx.uid,stamp,note,key),auditRow=auditStatement(env,ctx,'payment.created','payment',paymentId,{invoice_id:invoice.id,amount_cents:amount,payment_date:date,payment_method:method,reference});try{await dbBatch(env,[insert,auditRow])}catch(error){const replay=await env.DB.prepare('SELECT * FROM payments WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(replay&&replay.invoice_id===invoice.id&&Number(replay.amount_cents)===amount)return json({paymentId:replay.id,replayed:true,invoice:await invoiceFinancialJson(env,ctx,await invoiceById(env,ctx,invoice.id))},200);if(String(error?.message||'').includes('payment_overpayment'))return json({error:'Le paiement dépasse le restant dû.'},409);if(String(error?.message||'').includes('payment_'))return json({error:'Paiement refusé par les contrôles financiers.'},400);throw error}return json({paymentId,invoice:await invoiceFinancialJson(env,ctx,await invoiceById(env,ctx,invoice.id))},201)
}
async function invoiceCreditNotesRoute(request,env,ctx,invoiceId){
  const invoice=await invoiceById(env,ctx,invoiceId);if(!invoice)return json({error:'Facture introuvable.'},404);await invoiceScope(env,ctx,invoice);
  if(request.method==='GET'){await requirePermission(env,ctx,'invoices.view');return json({creditNotes:(await invoiceFinancialJson(env,ctx,invoice)).creditNotes})}
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requirePermission(env,ctx,'credit_notes.create');const data=exactObject(await body(request,30000),['amountCents','creditDate','reason','reference','note','operationKey']),amount=integerCents(data.amountCents),date=String(data.creditDate||''),reason=financialText(data.reason,500),reference=financialText(data.reference,240),note=financialText(data.note,1000),key=operationKey(data);if(!validIsoDate(date)||!reason)return json({error:'Date et motif de l’avoir sont obligatoires.'},400);const existing=await env.DB.prepare('SELECT * FROM credit_notes WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(existing){if(existing.invoice_id!==invoice.id||Number(existing.amount_cents)!==amount||existing.credit_date!==date||existing.reason!==reason||String(existing.reference||'')!==reference||String(existing.note||'')!==note)return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);return json({creditNoteId:existing.id,replayed:true,invoice:await invoiceFinancialJson(env,ctx,invoice)},200)}
  const creditId=id('credit-note'),stamp=now(),insert=env.DB.prepare('INSERT INTO credit_notes(id,organization_id,invoice_id,amount_cents,credit_date,reason,reference,note,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(creditId,ctx.organizationId,invoice.id,amount,date,reason,reference||null,note,key,ctx.uid,stamp),auditRow=auditStatement(env,ctx,'credit_note.created','credit_note',creditId,{invoice_id:invoice.id,amount_cents:amount,credit_date:date,reason,reference});try{await dbBatch(env,[insert,auditRow])}catch(error){const replay=await env.DB.prepare('SELECT * FROM credit_notes WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(replay&&replay.invoice_id===invoice.id&&Number(replay.amount_cents)===amount)return json({creditNoteId:replay.id,replayed:true,invoice:await invoiceFinancialJson(env,ctx,await invoiceById(env,ctx,invoice.id))},200);if(String(error?.message||'').includes('credit_note_excess'))return json({error:'Le montant de l’avoir dépasse le montant encore créditable de la facture.'},409);if(String(error?.message||'').includes('credit_note_'))return json({error:'Avoir refusé par les contrôles financiers.'},400);throw error}return json({creditNoteId:creditId,invoice:await invoiceFinancialJson(env,ctx,await invoiceById(env,ctx,invoice.id))},201)
}


async function supplierListRoute(request,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'expenses.view');
  return json({suppliers:await rows(env.DB.prepare('SELECT id,name,vat_number FROM suppliers WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 500').bind(ctx.organizationId))});
}
async function expenseById(env,ctx,expenseId){return env.DB.prepare('SELECT e.*,s.name supplier_name FROM expenses e LEFT JOIN suppliers s ON s.id=e.supplier_id AND s.organization_id=e.organization_id WHERE e.id=? AND e.organization_id=? AND e.archived_at IS NULL').bind(String(expenseId),ctx.organizationId).first()}
function supplierExpensePaymentState(expense,paidCents){
  const total=Math.max(0,Number(expense?.total_cents||0)),paid=Math.max(0,Math.min(total,Number(paidCents||0))),outstanding=Math.max(0,total-paid),baseStatus=total>0&&paid>=total?'paid':paid>0?'partial':'unpaid';
  const dueDate=String(expense?.due_date||''),today=new Date().toISOString().slice(0,10),overdue=outstanding>0&&/^\d{4}-\d{2}-\d{2}$/.test(dueDate)&&dueDate<today;
  return {paidCents:paid,outstandingCents:outstanding,baseStatus,paymentStatus:overdue?'overdue':baseStatus,overdue};
}
async function supplierPaymentTotals(env,ctx,expenseId){
  const row=await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN status='active' THEN amount_cents ELSE 0 END),0) paid_cents,MAX(CASE WHEN status='active' THEN payment_date ELSE NULL END) last_payment_date FROM supplier_payments WHERE organization_id=? AND expense_id=?").bind(ctx.organizationId,String(expenseId)).first();
  return {paidCents:Number(row?.paid_cents||0),lastPaymentDate:row?.last_payment_date||null};
}
async function syncSupplierExpensePaymentState(env,ctx,expenseId){
  const expense=await expenseById(env,ctx,expenseId);if(!expense)return null;
  const totals=await supplierPaymentTotals(env,ctx,expenseId),state=supplierExpensePaymentState(expense,totals.paidCents),stamp=now();
  await env.DB.prepare('UPDATE expenses SET payment_status=?,payment_date=?,updated_at=? WHERE organization_id=? AND id=?').bind(state.baseStatus,totals.lastPaymentDate,stamp,ctx.organizationId,String(expenseId)).run();
  return {...state,lastPaymentDate:totals.lastPaymentDate};
}
function supplierPaymentJson(row){return {id:row.id,expenseId:row.expense_id,amountCents:Number(row.amount_cents),paymentDate:row.payment_date,paymentMethod:row.payment_method,reference:row.reference||'',note:row.note||'',status:row.status,createdBy:row.created_by,createdAt:row.created_at,voidedBy:row.voided_by||null,voidedAt:row.voided_at||null,voidReason:row.void_reason||''}}
async function supplierPaymentsRoute(request,env,ctx,expenseId,paymentId=null){
  const expense=await expenseById(env,ctx,expenseId);if(!expense)return json({error:'Facture fournisseur introuvable.'},404);
  if(request.method==='GET'&&!paymentId){
    await requirePermission(env,ctx,'supplier_payments.view');
    const payments=await rows(env.DB.prepare('SELECT * FROM supplier_payments WHERE organization_id=? AND expense_id=? ORDER BY payment_date,created_at,id').bind(ctx.organizationId,expense.id)),totals=await supplierPaymentTotals(env,ctx,expense.id),state=supplierExpensePaymentState(expense,totals.paidCents);
    return json({payments:payments.map(supplierPaymentJson),summary:{...state,lastPaymentDate:totals.lastPaymentDate,dueDate:expense.due_date||null}});
  }
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'supplier_payments.manage');
  if(paymentId){
    const data=exactObject(await body(request,30000),['reason']),reason=financialText(data.reason||'',240);
    if(!reason)return json({error:'Motif d’annulation obligatoire.'},400);
    const existing=await env.DB.prepare('SELECT * FROM supplier_payments WHERE organization_id=? AND expense_id=? AND id=?').bind(ctx.organizationId,expense.id,String(paymentId)).first();
    if(!existing)return json({error:'Paiement fournisseur introuvable.'},404);
    if(existing.status==='voided')return json({payment:supplierPaymentJson(existing),replayed:true},200);
    const stamp=now(),auditId=id('audit'),auditOld=JSON.stringify({status:'active'}),auditNew=JSON.stringify({status:'voided',expense_id:expense.id,amount_cents:Number(existing.amount_cents),reason});
    const batch=await dbBatch(env,[
      env.DB.prepare("INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM supplier_payments WHERE organization_id=? AND expense_id=? AND id=? AND status='active')").bind(auditId,ctx.organizationId,ctx.uid,'supplier_payment.voided','supplier_payment',String(paymentId),auditOld,auditNew,stamp,ctx.organizationId,expense.id,String(paymentId)),
      env.DB.prepare("UPDATE supplier_payments SET status='voided',voided_by=?,voided_at=?,void_reason=? WHERE organization_id=? AND expense_id=? AND id=? AND status='active'").bind(ctx.uid,stamp,reason,ctx.organizationId,expense.id,String(paymentId))
    ]);
    const applied=Number(batch?.[1]?.meta?.changes||0)>0,state=await syncSupplierExpensePaymentState(env,ctx,expense.id),updated=await env.DB.prepare('SELECT * FROM supplier_payments WHERE organization_id=? AND expense_id=? AND id=?').bind(ctx.organizationId,expense.id,String(paymentId)).first();
    return json({payment:supplierPaymentJson(updated),summary:state,...(!applied?{replayed:true}:{})},200);
  }
  const data=exactObject(await body(request,40000),['amountCents','paymentDate','paymentMethod','reference','note','operationKey']),key=operationKey(data),amount=integerCents(data.amountCents),paymentDate=String(data.paymentDate||''),paymentMethod=financialText(data.paymentMethod||'bank_transfer',80),reference=financialText(data.reference||'',180),note=financialText(data.note||'',500);
  if(amount<=0||!validIsoDate(paymentDate)||!paymentMethod)return json({error:'Paiement fournisseur invalide.'},400);
  const replay=await env.DB.prepare('SELECT * FROM supplier_payments WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();
  if(replay){
    if(String(replay.expense_id)!==String(expense.id)||Number(replay.amount_cents)!==amount||replay.payment_date!==paymentDate||replay.payment_method!==paymentMethod||String(replay.reference||'')!==reference||String(replay.note||'')!==note)return json({error:'Cette clé d’opération a déjà été utilisée avec un paiement différent.'},409);
    const totals=await supplierPaymentTotals(env,ctx,expense.id);return json({payment:supplierPaymentJson(replay),summary:supplierExpensePaymentState(expense,totals.paidCents),replayed:true},200);
  }
  const paymentIdNew=id('supplier-payment'),stamp=now();
  try{
    await dbBatch(env,[
      env.DB.prepare("INSERT INTO supplier_payments(id,organization_id,expense_id,amount_cents,payment_date,payment_method,reference,note,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,'active',?,?)").bind(paymentIdNew,ctx.organizationId,expense.id,amount,paymentDate,paymentMethod,reference,note,key,ctx.uid,stamp),
      auditStatement(env,ctx,'supplier_payment.created','supplier_payment',paymentIdNew,{expense_id:expense.id,amount_cents:amount,payment_date:paymentDate,payment_method:paymentMethod,reference})
    ]);
  }catch(error){
    const message=String(error?.message||'');
    if(message.includes('supplier_payment_exceeds_outstanding'))return json({error:'Le paiement dépasse le solde restant de la facture fournisseur.'},409);
    if(message.includes('UNIQUE')){const existing=await env.DB.prepare('SELECT * FROM supplier_payments WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(existing){if(String(existing.expense_id)!==String(expense.id)||Number(existing.amount_cents)!==amount||existing.payment_date!==paymentDate||existing.payment_method!==paymentMethod||String(existing.reference||'')!==reference||String(existing.note||'')!==note)return json({error:'Cette clé d’opération a déjà été utilisée avec un paiement différent.'},409);const totals=await supplierPaymentTotals(env,ctx,expense.id);return json({payment:supplierPaymentJson(existing),summary:supplierExpensePaymentState(expense,totals.paidCents),replayed:true},200)}}
    throw error;
  }
  const state=await syncSupplierExpensePaymentState(env,ctx,expense.id),created=await env.DB.prepare('SELECT * FROM supplier_payments WHERE organization_id=? AND id=?').bind(ctx.organizationId,paymentIdNew).first();
  return json({payment:supplierPaymentJson(created),summary:state},201);
}

async function expenseAllocationSummary(env,ctx,expense){const row=await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN status='active' THEN amount_cents ELSE 0 END),0) allocated_cents,COUNT(CASE WHEN status='active' THEN 1 END) allocation_count FROM supplier_allocations WHERE organization_id=? AND expense_id=?").bind(ctx.organizationId,expense.id).first(),allocated=Number(row?.allocated_cents||0);return {allocatedCents:allocated,remainingCents:Math.max(0,Number(expense.subtotal_cents||0)-allocated),allocationCount:Number(row?.allocation_count||0)}}
async function expenseRoutes(request,env,ctx){
  if(request.method==='GET'){
    await requirePermission(env,ctx,'expenses.view');
    const canViewAllocations=ctx.roleCode==='OWNER'||await allowed(env,ctx,'supplier_allocations.view');
    const list=await rows(env.DB.prepare("SELECT e.id,e.supplier_id,s.name supplier_name,e.project_id,e.legacy_project_id,COALESCE(e.legacy_project_id,e.project_id) effective_project_id,e.purchase_order_id,e.delivery_note_id,e.category,e.description,e.expense_date,e.due_date,e.currency,e.subtotal_cents,e.vat_amount_cents,e.vat_rate_bps,e.total_cents,e.payment_status,e.payment_date,e.document_name,e.supplier_reference,e.created_by,e.created_at,COALESCE(a.allocated_cents,0) allocated_cents,COALESCE(a.allocation_count,0) allocation_count FROM expenses e LEFT JOIN suppliers s ON s.id=e.supplier_id AND s.organization_id=e.organization_id LEFT JOIN (SELECT organization_id,expense_id,SUM(CASE WHEN status='active' THEN amount_cents ELSE 0 END) allocated_cents,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) allocation_count FROM supplier_allocations GROUP BY organization_id,expense_id) a ON a.organization_id=e.organization_id AND a.expense_id=e.id WHERE e.organization_id=? AND e.archived_at IS NULL ORDER BY e.expense_date DESC,e.created_at DESC LIMIT 250").bind(ctx.organizationId)),expenses=[],allocationsByExpense=new Map(),paymentsByExpense=new Map();
    if(canViewAllocations&&list.length){const ids=list.map(item=>String(item.id)),marks=ids.map(()=>'?').join(','),allocationRows=await rows(env.DB.prepare(`SELECT expense_id,destination_type,destination_id,amount_cents,label,reference FROM supplier_allocations WHERE organization_id=? AND status='active' AND expense_id IN (${marks}) ORDER BY created_at,id`).bind(ctx.organizationId,...ids));for(const row of allocationRows){const key=String(row.expense_id),items=allocationsByExpense.get(key)||[];items.push({destinationType:row.destination_type,destinationId:row.destination_id,amountCents:Number(row.amount_cents),label:row.label,reference:row.reference});allocationsByExpense.set(key,items)}}
    if(list.length){const ids=list.map(item=>String(item.id)),marks=ids.map(()=>'?').join(','),paymentRows=await rows(env.DB.prepare(`SELECT expense_id,COALESCE(SUM(CASE WHEN status='active' THEN amount_cents ELSE 0 END),0) paid_cents,MAX(CASE WHEN status='active' THEN payment_date ELSE NULL END) last_payment_date FROM supplier_payments WHERE organization_id=? AND expense_id IN (${marks}) GROUP BY expense_id`).bind(ctx.organizationId,...ids));for(const row of paymentRows)paymentsByExpense.set(String(row.expense_id),{paidCents:Number(row.paid_cents||0),lastPaymentDate:row.last_payment_date||null})}
    for(const expense of list){
      const payment=paymentsByExpense.get(String(expense.id)),legacyPaid=!payment&&expense.payment_status==='paid'?Number(expense.total_cents||0):0,state=supplierExpensePaymentState(expense,payment?payment.paidCents:legacyPaid),{allocated_cents,allocation_count,effective_project_id,legacy_project_id,project_id,...rest}=expense,base={...rest,project_id:effective_project_id||null,payment_status:state.paymentStatus,payment_date:payment?.lastPaymentDate||expense.payment_date||null,paidCents:state.paidCents,outstandingCents:state.outstandingCents,overdue:state.overdue,vatRate:expense.vat_rate_bps===null||expense.vat_rate_bps===undefined?null:Number(expense.vat_rate_bps)/100};
      if(canViewAllocations){const allocated=Number(allocated_cents||0);expenses.push({...base,allocatedCents:allocated,remainingCents:Math.max(0,Number(expense.subtotal_cents||0)-allocated),allocationCount:Number(allocation_count||0),allocations:allocationsByExpense.get(String(expense.id))||[]})}else expenses.push(base);
    }
    return json({expenses});
  }
  if(request.method==='POST'){
    await requirePermission(env,ctx,'expenses.create');
    const data=exactObject(await body(request),['supplierId','supplierReference','projectId','purchaseOrderId','deliveryNoteId','category','description','expenseDate','dueDate','total','vatAmount','vatRate','paymentStatus','paymentDate','documentName','operationKey']),key=operationKey(data),expenseId=id('expense'),stamp=now(),total=cents(data.total),vat=cents(data.vatAmount||0),subtotal=total-vat,paymentStatus=String(data.paymentStatus||'unpaid'),paymentDate=data.paymentDate?String(data.paymentDate):null,dueDate=data.dueDate?String(data.dueDate):null,vatRate=data.vatRate===undefined||data.vatRate===null||data.vatRate===''?null:Number(data.vatRate),vatRateBps=vatRate===null?null:Math.round(vatRate*100);
    if(total<=0||!data.description?.trim()||!validIsoDate(String(data.expenseDate||''))||!financialText(data.category,120))throw Object.assign(Error('Description, date, catégorie et montant positif sont obligatoires.'),{status:400});
    if(vat>total)throw Object.assign(Error('La TVA ne peut pas dépasser le montant TVAC.'),{status:400});
    if(!['paid','unpaid'].includes(paymentStatus))throw Object.assign(Error('État de paiement invalide.'),{status:400});
    if(paymentDate&&!validIsoDate(paymentDate))return json({error:'Date de paiement invalide.'},400);
    if(paymentStatus==='paid'&&!paymentDate)return json({error:'Une facture fournisseur payée doit avoir une date de paiement.'},400);
    if(dueDate&&!validIsoDate(dueDate))return json({error:"Date d'échéance fournisseur invalide."},400);
    if(vatRate!==null&&!([0,6,12,21].includes(vatRate)))return json({error:'Taux de TVA invalide.'},400);
    if(vatRate!==null&&Math.abs(vat-Math.round(subtotal*vatRate/100))>1)return json({error:'Le montant de TVA ne correspond pas au taux indiqué.'},400);
    const supplierId=data.supplierId?String(data.supplierId):null,projectId=data.projectId?String(data.projectId):null,deliveryNoteId=data.deliveryNoteId?String(data.deliveryNoteId):null;let purchaseOrderId=data.purchaseOrderId?String(data.purchaseOrderId):null,relationalProjectId=null,legacyProjectId=null;
    if(supplierId&&!await env.DB.prepare('SELECT 1 ok FROM suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,supplierId).first())return json({error:'Fournisseur introuvable dans cette entreprise.'},404);
    let state=null;
    if(projectId||purchaseOrderId)state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
    if(purchaseOrderId&&!state)return json({error:'Espace entreprise introuvable.'},404);
    if(projectId){const legacy=state&&workspaceProject(state,projectId),relational=await env.DB.prepare('SELECT 1 ok FROM projects WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,projectId).first();if(!legacy&&!relational)return json({error:'Chantier introuvable dans cette entreprise.'},404);await requireFinanceProjectScope(env,ctx,projectId);if(legacy)legacyProjectId=projectId;else relationalProjectId=projectId}
    if(purchaseOrderId){const order=legacyPurchaseOrder(state,purchaseOrderId);if(!order)return json({error:'Commande fournisseur introuvable dans cette entreprise.'},404);const orderProject=order.job&&String(order.job)!=='0'?String(order.job):null;if(projectId&&orderProject&&orderProject!==projectId)return json({error:'La commande fournisseur n’appartient pas au chantier sélectionné.'},400)}
    if(deliveryNoteId){const delivery=await env.DB.prepare('SELECT id,order_id,project_id FROM field_delivery_notes WHERE organization_id=? AND id=?').bind(ctx.organizationId,deliveryNoteId).first();if(!delivery)return json({error:'Bon de livraison introuvable dans cette entreprise.'},404);if(!purchaseOrderId){purchaseOrderId=String(delivery.order_id);state=state||await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!legacyPurchaseOrder(state,purchaseOrderId))return json({error:'Commande liée au bon de livraison introuvable.'},404)}else if(String(delivery.order_id)!==purchaseOrderId)return json({error:'Le bon de livraison ne correspond pas à la commande sélectionnée.'},400);if(projectId&&delivery.project_id&&String(delivery.project_id)!==projectId)return json({error:'Le bon de livraison n’appartient pas au chantier sélectionné.'},400)}
    const description=financialText(data.description,240),category=financialText(data.category,120),supplierReference=financialText(data.supplierReference||'',180),documentName=financialText(data.documentName||'',255)||null,existing=await env.DB.prepare('SELECT * FROM expenses WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();
    if(existing){
      const baseMismatch=existing.supplier_id!==supplierId||String(existing.legacy_project_id||existing.project_id||'')!==String(projectId||'')||existing.category!==category||existing.description!==description||existing.expense_date!==String(data.expenseDate)||String(existing.due_date||'')!==String(dueDate||'')||Number(existing.total_cents)!==total||Number(existing.vat_amount_cents)!==vat||Number(existing.vat_rate_bps??-1)!==Number(vatRateBps??-1)||String(existing.document_name||'')!==String(documentName||'')||String(existing.supplier_reference||'')!==supplierReference;
      if(baseMismatch)return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);
      const existingOrder=String(existing.purchase_order_id||''),existingDelivery=String(existing.delivery_note_id||''),requestedOrder=String(purchaseOrderId||''),requestedDelivery=String(deliveryNoteId||'');
      if(existingOrder&&requestedOrder&&existingOrder!==requestedOrder||existingDelivery&&requestedDelivery&&existingDelivery!==requestedDelivery)return json({error:'Cette facture est déjà reliée à un autre document d’achat.'},409);
      const nextOrder=existingOrder||requestedOrder,nextDelivery=existingDelivery||requestedDelivery;
      if(nextOrder!==existingOrder||nextDelivery!==existingDelivery){
        await dbBatch(env,[env.DB.prepare('UPDATE expenses SET purchase_order_id=?,delivery_note_id=?,updated_at=? WHERE id=? AND organization_id=?').bind(nextOrder||null,nextDelivery||null,stamp,existing.id,ctx.organizationId),auditStatement(env,ctx,'expense.procurement_linked','expense',existing.id,{purchase_order_id:nextOrder||null,delivery_note_id:nextDelivery||null},{purchase_order_id:existing.purchase_order_id||null,delivery_note_id:existing.delivery_note_id||null})]);
        return json({id:existing.id,replayed:true,enriched:true},200);
      }
      return json({id:existing.id,replayed:true},200);
    }
    if(supplierId&&supplierReference){
      const duplicate=await env.DB.prepare("SELECT id FROM expenses WHERE organization_id=? AND supplier_id=? AND archived_at IS NULL AND lower(trim(supplier_reference))=lower(trim(?)) LIMIT 1").bind(ctx.organizationId,supplierId,supplierReference).first();
      if(duplicate)return json({error:'Une facture de ce fournisseur porte déjà cette référence.'},409);
    }
    const statements=[env.DB.prepare('INSERT INTO expenses(id,organization_id,supplier_id,project_id,legacy_project_id,purchase_order_id,delivery_note_id,category,description,expense_date,due_date,currency,subtotal_cents,vat_amount_cents,vat_rate_bps,total_cents,payment_status,payment_date,document_name,created_by,created_at,updated_at,supplier_reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(expenseId,ctx.organizationId,supplierId,relationalProjectId,legacyProjectId,purchaseOrderId,deliveryNoteId,category,description,String(data.expenseDate),dueDate,'EUR',subtotal,vat,vatRateBps,total,paymentStatus,paymentDate,documentName,ctx.uid,stamp,stamp,supplierReference,key),auditStatement(env,ctx,'expense.created','expense',expenseId,{total_cents:total,subtotal_cents:subtotal,vat_amount_cents:vat,vat_rate_bps:vatRateBps,supplier_id:supplierId,project_id:projectId,purchase_order_id:purchaseOrderId,delivery_note_id:deliveryNoteId,reference:supplierReference,due_date:dueDate})];
    if(paymentStatus==='paid')statements.push(env.DB.prepare("INSERT INTO supplier_payments(id,organization_id,expense_id,amount_cents,payment_date,payment_method,reference,note,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,'legacy',?,'Paiement déclaré à la création',?,'active',?,?)").bind(id('supplier-payment'),ctx.organizationId,expenseId,total,paymentDate,supplierReference,key+':initial-payment',ctx.uid,stamp));
    try{await dbBatch(env,statements)}catch(error){const replay=await env.DB.prepare('SELECT id FROM expenses WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(replay)return json({id:replay.id,replayed:true},200);throw error}
    return json({id:expenseId},201);
  }
  return json({error:'Méthode non autorisée.'},405);
}

const SUPPLIER_ALLOCATION_TYPES=new Set(['project','stock','vehicle','asset','overhead']);
async function supplierAllocationDestination(env,ctx,type,destinationId){
  if(!SUPPLIER_ALLOCATION_TYPES.has(type))throw Object.assign(Error('Destination de ventilation invalide.'),{status:400});
  if(type==='stock')return {id:null,label:'Stock'};
  if(type==='overhead')return {id:null,label:'Frais généraux'};
  const target=String(destinationId||'').trim();if(!target)throw Object.assign(Error('Destination obligatoire.'),{status:400});
  if(type==='project'){
    const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});const project=state&&workspaceProject(state,target);if(!project)throw Object.assign(Error('Chantier introuvable dans cette entreprise.'),{status:404});await requireFinanceProjectScope(env,ctx,target);return {id:target,label:financialText(project.name||project.reference||target,180)};
  }
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(state)await ensureLegacyFieldDataImported(env,ctx,state);const asset=await fieldAssetRow(env,ctx,target);if(!asset)throw Object.assign(Error(type==='vehicle'?'Véhicule introuvable dans cette entreprise.':'Matériel introuvable dans cette entreprise.'),{status:404});const payload=parseJson(asset.payload_json,{}),vehicle=payload.group==='vehicles';if(type==='vehicle'&&!vehicle)throw Object.assign(Error('La destination choisie n’est pas un véhicule.'),{status:400});if(type==='asset'&&vehicle)throw Object.assign(Error('Utilisez la destination véhicule pour ce bien.'),{status:400});return {id:target,label:financialText(payload.name||payload.reference||target,180)};
}
async function supplierAllocationJson(env,ctx,row){let destinationLabel=row.destination_type==='stock'?'Stock':row.destination_type==='overhead'?'Frais généraux':row.destination_id||'';if(row.destination_type==='project'){const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});destinationLabel=workspaceProject(state,row.destination_id)?.name||row.destination_id}else if(['vehicle','asset'].includes(row.destination_type)){const asset=await fieldAssetRow(env,ctx,row.destination_id);const payload=parseJson(asset?.payload_json||'{}',{});destinationLabel=payload.name||payload.reference||row.destination_id}return {id:row.id,expenseId:row.expense_id,destinationType:row.destination_type,destinationId:row.destination_id,destinationLabel,amountCents:Number(row.amount_cents),label:row.label,note:row.note,reference:row.reference,status:row.status,createdBy:row.created_by,createdAt:row.created_at,cancelledBy:row.cancelled_by||null,cancelledAt:row.cancelled_at||null,cancellationReason:row.cancellation_reason||''}}
async function supplierAllocationScope(env,ctx,rowsToCheck){for(const row of rowsToCheck)if(row.destination_type==='project')await requireFinanceProjectScope(env,ctx,row.destination_id)}
async function supplierAllocationsRoute(request,env,ctx,expenseId,allocationId=null){
  const expense=await expenseById(env,ctx,expenseId);if(!expense)return json({error:'Facture fournisseur ou dépense introuvable.'},404);
  if(request.method==='GET'&&!allocationId){
    await requirePermission(env,ctx,'supplier_allocations.view');const allocationRows=await rows(env.DB.prepare('SELECT * FROM supplier_allocations WHERE organization_id=? AND expense_id=? ORDER BY created_at,id').bind(ctx.organizationId,expense.id));await supplierAllocationScope(env,ctx,allocationRows);const summary=await expenseAllocationSummary(env,ctx,expense),allocations=[];for(const row of allocationRows)allocations.push(await supplierAllocationJson(env,ctx,row));return json({expense:{id:expense.id,supplierId:expense.supplier_id,supplierName:expense.supplier_name||'',reference:expense.supplier_reference||'',subtotalCents:Number(expense.subtotal_cents),vatCents:Number(expense.vat_amount_cents),totalCents:Number(expense.total_cents),...summary},allocations})
  }
  if(request.method==='POST'&&!allocationId){
    await requirePermission(env,ctx,'supplier_allocations.create');const data=exactObject(await body(request,60000),['destinationType','destinationId','amountCents','label','note','reference','operationKey']),key=operationKey(data),amount=integerCents(data.amountCents),type=String(data.destinationType||''),destination=await supplierAllocationDestination(env,ctx,type,data.destinationId),label=financialText(data.label||destination.label,180),note=financialText(data.note||'',1000),reference=financialText(data.reference||'',180);
    const replay=await env.DB.prepare('SELECT * FROM supplier_allocations WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(replay){if(replay.expense_id!==expense.id||replay.destination_type!==type||String(replay.destination_id||'')!==String(destination.id||'')||Number(replay.amount_cents)!==amount||replay.label!==label||replay.note!==note||replay.reference!==reference)return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);return json({allocation:await supplierAllocationJson(env,ctx,replay),summary:await expenseAllocationSummary(env,ctx,expense),replayed:true})}
    const allocationIdNew=id('allocation'),stamp=now();try{await dbBatch(env,[env.DB.prepare('INSERT INTO supplier_allocations(id,organization_id,expense_id,destination_type,destination_id,amount_cents,label,note,reference,idempotency_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(allocationIdNew,ctx.organizationId,expense.id,type,destination.id,amount,label,note,reference,key,'active',ctx.uid,stamp),auditStatement(env,ctx,'supplier_allocation.created','supplier_allocation',allocationIdNew,{expense_id:expense.id,destination_type:type,destination_id:destination.id,amount_cents:amount,reference})])}catch(error){const replayAfter=await env.DB.prepare('SELECT * FROM supplier_allocations WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(replayAfter)return json({allocation:await supplierAllocationJson(env,ctx,replayAfter),summary:await expenseAllocationSummary(env,ctx,expense),replayed:true});if(String(error?.message||'').includes('supplier_allocation_exceeds_remaining'))throw Object.assign(Error('La ventilation dépasse le montant HTVA restant à ventiler.'),{status:409});throw error}
    const created=await env.DB.prepare('SELECT * FROM supplier_allocations WHERE organization_id=? AND id=?').bind(ctx.organizationId,allocationIdNew).first();return json({allocation:await supplierAllocationJson(env,ctx,created),summary:await expenseAllocationSummary(env,ctx,expense)},201)
  }
  if(request.method==='POST'&&allocationId){
    await requirePermission(env,ctx,'supplier_allocations.cancel');const existing=await env.DB.prepare('SELECT * FROM supplier_allocations WHERE organization_id=? AND expense_id=? AND id=?').bind(ctx.organizationId,expense.id,String(allocationId)).first();if(!existing)return json({error:'Ventilation introuvable.'},404);if(existing.destination_type==='project')await requireFinanceProjectScope(env,ctx,existing.destination_id);if(existing.status==='cancelled')return json({allocation:await supplierAllocationJson(env,ctx,existing),summary:await expenseAllocationSummary(env,ctx,expense),replayed:true});const data=exactObject(await body(request,30000),['reason']),reason=financialText(data.reason||'',500);if(!reason)return json({error:'Le motif d’annulation est obligatoire.'},400);const stamp=now(),auditId=id('audit'),auditNew=JSON.stringify({expense_id:expense.id,amount_cents:Number(existing.amount_cents),destination_type:existing.destination_type,destination_id:existing.destination_id,reason}),auditOld=JSON.stringify({status:existing.status});let cancellationBatch;try{cancellationBatch=await dbBatch(env,[env.DB.prepare("INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM supplier_allocations WHERE organization_id=? AND expense_id=? AND id=? AND status='active')").bind(auditId,ctx.organizationId,ctx.uid,'supplier_allocation.cancelled','supplier_allocation',String(allocationId),auditOld,auditNew,stamp,ctx.organizationId,expense.id,String(allocationId)),env.DB.prepare("UPDATE supplier_allocations SET status='cancelled',cancelled_by=?,cancelled_at=?,cancellation_reason=? WHERE organization_id=? AND expense_id=? AND id=? AND status='active'").bind(ctx.uid,stamp,reason,ctx.organizationId,expense.id,String(allocationId))])}catch(error){if(String(error?.message||'').includes('supplier_allocation_has_active_matches'))return json({error:'Annulez d’abord les rapprochements actifs liés à cette ventilation.'},409);throw error}const cancellationApplied=Number(cancellationBatch?.[1]?.meta?.changes||0)>0;const updated=await env.DB.prepare('SELECT * FROM supplier_allocations WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(allocationId)).first();return json({allocation:await supplierAllocationJson(env,ctx,updated),summary:await expenseAllocationSummary(env,ctx,expense),...(!cancellationApplied?{replayed:true}:{})})
  }
  return json({error:'Méthode non autorisée.'},405)
}


function supplierInvoiceMatchJson(row){return {id:row.id,expenseId:row.expense_id,allocationId:row.allocation_id,projectId:row.project_id,orderId:row.order_id,orderLineId:row.order_line_id,deliveryNoteId:row.delivery_note_id,deliveryLineId:row.delivery_line_id,matchedCents:Number(row.matched_cents),matchedQuantityMilli:Number(row.matched_quantity_milli),operationKey:row.operation_key,status:row.status,createdBy:row.created_by,createdAt:row.created_at,updatedBy:row.updated_by,updatedAt:row.updated_at,voidedBy:row.voided_by||null,voidedAt:row.voided_at||null}}
function supplierInvoiceMatchReplayMatches(row,data){return row.expense_id===data.expenseId&&row.allocation_id===data.allocationId&&row.project_id===data.projectId&&row.order_id===data.orderId&&row.order_line_id===data.orderLineId&&row.delivery_note_id===data.deliveryNoteId&&row.delivery_line_id===data.deliveryLineId&&Number(row.matched_cents)===data.matchedCents&&Number(row.matched_quantity_milli)===data.matchedQuantityMilli}
async function supplierInvoiceMatchesRoute(request,env,ctx,expenseId,matchId=null){
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'supplier_invoice_matches.manage');
  const expense=await expenseById(env,ctx,expenseId);if(!expense)return json({error:'Facture fournisseur introuvable.'},404);

  if(matchId){
    const existing=await env.DB.prepare('SELECT * FROM supplier_invoice_matches WHERE organization_id=? AND expense_id=? AND id=?').bind(ctx.organizationId,expense.id,String(matchId)).first();
    if(!existing)return json({error:'Rapprochement fournisseur introuvable.'},404);
    await requireFinanceProjectScope(env,ctx,existing.project_id);
    if(existing.status==='voided')return json({match:supplierInvoiceMatchJson(existing),replayed:true,status:'voided'},200);
    const stamp=now(),auditId=id('audit'),auditOld=JSON.stringify({status:'active'}),auditNew=JSON.stringify({status:'voided',expense_id:expense.id,allocation_id:existing.allocation_id,project_id:existing.project_id,order_id:existing.order_id,order_line_id:existing.order_line_id,delivery_note_id:existing.delivery_note_id,delivery_line_id:existing.delivery_line_id,matched_cents:Number(existing.matched_cents),matched_quantity_milli:Number(existing.matched_quantity_milli)});
    const voidBatch=await dbBatch(env,[
      env.DB.prepare("INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM supplier_invoice_matches WHERE organization_id=? AND expense_id=? AND id=? AND status='active')").bind(auditId,ctx.organizationId,ctx.uid,'supplier_invoice_match.voided','supplier_invoice_match',String(matchId),auditOld,auditNew,stamp,ctx.organizationId,expense.id,String(matchId)),
      env.DB.prepare("UPDATE supplier_invoice_matches SET status='voided',updated_by=?,updated_at=?,voided_by=?,voided_at=? WHERE organization_id=? AND expense_id=? AND id=? AND status='active'").bind(ctx.uid,stamp,ctx.uid,stamp,ctx.organizationId,expense.id,String(matchId))
    ]);
    const applied=Number(voidBatch?.[1]?.meta?.changes||0)>0,updated=await env.DB.prepare('SELECT * FROM supplier_invoice_matches WHERE organization_id=? AND expense_id=? AND id=?').bind(ctx.organizationId,expense.id,String(matchId)).first();
    return json({match:supplierInvoiceMatchJson(updated),status:updated.status,...(!applied?{replayed:true}:{})},200);
  }

  const data=exactObject(await body(request,60000),['allocationId','projectId','orderId','orderLineId','deliveryNoteId','deliveryLineId','matchedCents','matchedQuantityMilli','operationKey']),key=operationKey(data),allocationId=String(data.allocationId||''),projectId=String(data.projectId||''),orderId=String(data.orderId||''),orderLineId=String(data.orderLineId||''),deliveryNoteId=String(data.deliveryNoteId||''),deliveryLineId=String(data.deliveryLineId||''),matchedCents=integerCents(data.matchedCents),matchedQuantityMilli=Number(data.matchedQuantityMilli);
  if(!allocationId||!projectId||!orderId||!orderLineId||!deliveryNoteId||!deliveryLineId||!Number.isSafeInteger(matchedQuantityMilli)||matchedQuantityMilli<=0)return json({error:'Données de rapprochement invalides.'},400);
  const replay=await env.DB.prepare('SELECT * FROM supplier_invoice_matches WHERE organization_id=? AND operation_key=?').bind(ctx.organizationId,key).first();
  if(replay){
    await requireFinanceProjectScope(env,ctx,replay.project_id);
    const expected={expenseId:expense.id,allocationId,projectId,orderId,orderLineId,deliveryNoteId,deliveryLineId,matchedCents,matchedQuantityMilli};
    if(!supplierInvoiceMatchReplayMatches(replay,expected))return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);
    return json({match:supplierInvoiceMatchJson(replay),replayed:true,status:replay.status},200);
  }

  const allocation=await env.DB.prepare('SELECT * FROM supplier_allocations WHERE organization_id=? AND expense_id=? AND id=?').bind(ctx.organizationId,expense.id,allocationId).first();
  if(!allocation)return json({error:'Ventilation fournisseur introuvable.'},404);
  if(allocation.status!=='active')return json({error:'La ventilation fournisseur n’est plus active.'},409);
  if(allocation.destination_type!=='project'||String(allocation.destination_id||'')!==projectId)return json({error:'Le rapprochement doit utiliser la même destination chantier que la ventilation.'},400);
  await requireFinanceProjectScope(env,ctx,projectId);

  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({error:'Espace entreprise introuvable.'},404);
  const order=legacyPurchaseOrder(state,orderId);if(!order)return json({error:'Commande fournisseur introuvable dans cette entreprise.'},404);
  if(String(order.job||'')!==projectId)return json({error:'La commande fournisseur n’appartient pas au chantier.'},400);
  const orderLine=(order.lines||[]).find(line=>String(line.id)===orderLineId);if(!orderLine)return json({error:'La ligne de commande n’appartient pas à cette commande.'},400);

  const delivery=await env.DB.prepare("SELECT dl.id,dl.order_line_id,dl.received,dl.condition,dn.id delivery_note_id,dn.order_id,dn.project_id,dn.status FROM field_delivery_lines dl JOIN field_delivery_notes dn ON dn.id=dl.delivery_note_id AND dn.organization_id=dl.organization_id WHERE dl.organization_id=? AND dl.id=? AND dn.id=?").bind(ctx.organizationId,deliveryLineId,deliveryNoteId).first();
  if(!delivery)return json({error:'Ligne de livraison introuvable dans cette entreprise.'},404);
  if(String(delivery.order_id)!==orderId||String(delivery.order_line_id)!==orderLineId)return json({error:'La ligne de livraison ne correspond pas à la commande sélectionnée.'},400);
  if(delivery.project_id&&String(delivery.project_id)!==projectId)return json({error:'Le bon de livraison n’appartient pas au chantier.'},400);
  if(!['Reçue','Avec réserve'].includes(String(delivery.status||'')))return json({error:'Le bon de livraison n’est pas dans un état rapprochable.'},409);
  const acceptedReceivedMilli=delivery.condition==='Refusé'?0:Math.round(Number(delivery.received||0)*1000);
  if(delivery.condition==='Refusé'||acceptedReceivedMilli<=0)return json({error:'Une ligne refusée ne peut pas être rapprochée.'},409);
  if(matchedQuantityMilli>acceptedReceivedMilli)return json({error:'La quantité rapprochée dépasse la quantité reçue acceptée.'},409);

  const newMatchId=id('supplier-match'),stamp=now(),insert=env.DB.prepare("INSERT INTO supplier_invoice_matches(id,organization_id,expense_id,allocation_id,project_id,order_id,order_line_id,delivery_note_id,delivery_line_id,matched_cents,matched_quantity_milli,operation_key,status,created_by,created_at,updated_by,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,? WHERE EXISTS (SELECT 1 FROM supplier_allocations a WHERE a.id=? AND a.organization_id=? AND a.expense_id=? AND a.status='active' AND a.destination_type='project' AND a.destination_id=? AND ? <= a.amount_cents-COALESCE((SELECT SUM(m.matched_cents) FROM supplier_invoice_matches m WHERE m.organization_id=a.organization_id AND m.allocation_id=a.id AND m.status='active'),0)) AND EXISTS (SELECT 1 FROM field_delivery_lines dl JOIN field_delivery_notes dn ON dn.id=dl.delivery_note_id AND dn.organization_id=dl.organization_id WHERE dl.id=? AND dl.organization_id=? AND dn.id=? AND dn.order_id=? AND dl.order_line_id=? AND dn.status IN ('Reçue','Avec réserve') AND ? <= (CASE WHEN dl.condition='Refusé' THEN 0 ELSE CAST(ROUND(dl.received*1000) AS INTEGER) END)-COALESCE((SELECT SUM(m2.matched_quantity_milli) FROM supplier_invoice_matches m2 WHERE m2.organization_id=dl.organization_id AND m2.delivery_line_id=dl.id AND m2.status='active'),0))").bind(newMatchId,ctx.organizationId,expense.id,allocationId,projectId,orderId,orderLineId,deliveryNoteId,deliveryLineId,matchedCents,matchedQuantityMilli,key,ctx.uid,stamp,ctx.uid,stamp,allocationId,ctx.organizationId,expense.id,projectId,matchedCents,deliveryLineId,ctx.organizationId,deliveryNoteId,orderId,orderLineId,matchedQuantityMilli);
  const auditId=id('audit'),auditNew=JSON.stringify({expense_id:expense.id,allocation_id:allocationId,project_id:projectId,order_id:orderId,order_line_id:orderLineId,delivery_note_id:deliveryNoteId,delivery_line_id:deliveryLineId,matched_cents:matchedCents,matched_quantity_milli:matchedQuantityMilli,operation_key:key});
  let batch;
  try{
    batch=await dbBatch(env,[insert,env.DB.prepare("INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,old_values,new_values,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM supplier_invoice_matches WHERE organization_id=? AND id=? AND status='active')").bind(auditId,ctx.organizationId,ctx.uid,'supplier_invoice_match.created','supplier_invoice_match',newMatchId,null,auditNew,stamp,ctx.organizationId,newMatchId)]);
  }catch(error){
    const replayAfter=await env.DB.prepare('SELECT * FROM supplier_invoice_matches WHERE organization_id=? AND operation_key=?').bind(ctx.organizationId,key).first();
    if(replayAfter){
      await requireFinanceProjectScope(env,ctx,replayAfter.project_id);
      const expected={expenseId:expense.id,allocationId,projectId,orderId,orderLineId,deliveryNoteId,deliveryLineId,matchedCents,matchedQuantityMilli};
      if(!supplierInvoiceMatchReplayMatches(replayAfter,expected))return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);
      return json({match:supplierInvoiceMatchJson(replayAfter),replayed:true,status:replayAfter.status},200);
    }
    throw error;
  }
  if(Number(batch?.[0]?.meta?.changes||0)===0){
    const currentAllocation=await env.DB.prepare('SELECT status,amount_cents FROM supplier_allocations WHERE organization_id=? AND expense_id=? AND id=?').bind(ctx.organizationId,expense.id,allocationId).first();
    if(!currentAllocation||currentAllocation.status!=='active')return json({error:'La ventilation fournisseur n’est plus active.'},409);
    const amountUsed=await env.DB.prepare("SELECT COALESCE(SUM(matched_cents),0) used FROM supplier_invoice_matches WHERE organization_id=? AND allocation_id=? AND status='active'").bind(ctx.organizationId,allocationId).first();
    if(Number(amountUsed?.used||0)+matchedCents>Number(currentAllocation.amount_cents))return json({error:'Le montant rapproché dépasse le montant disponible de la ventilation.'},409);
    const quantityUsed=await env.DB.prepare("SELECT COALESCE(SUM(matched_quantity_milli),0) used FROM supplier_invoice_matches WHERE organization_id=? AND delivery_line_id=? AND status='active'").bind(ctx.organizationId,deliveryLineId).first();
    if(Number(quantityUsed?.used||0)+matchedQuantityMilli>acceptedReceivedMilli)return json({error:'La quantité rapprochée dépasse la quantité reçue acceptée.'},409);
    return json({error:'Rapprochement refusé par les contrôles de cohérence.'},409);
  }
  const created=await env.DB.prepare('SELECT * FROM supplier_invoice_matches WHERE organization_id=? AND id=?').bind(ctx.organizationId,newMatchId).first();
  return json({match:supplierInvoiceMatchJson(created),status:created.status},201);
}


function validIsoDate(value){const text=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;const [y,m,d]=text.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,d));return date.getUTCFullYear()===y&&date.getUTCMonth()===m-1&&date.getUTCDate()===d}
function validClockTime(value){return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''))}
function legacyPersonValue(value){const text=String(value);return /^\d+$/.test(text)&&Number.isSafeInteger(Number(text))?Number(text):text}
function timeEntryPeople(row){try{const parsed=JSON.parse(row?.people_json||'[]');return Array.isArray(parsed)?[...new Set(parsed.map(String))]:[]}catch{return[]}}
function workspaceProject(state,projectId){return (state?.jobs||[]).find(job=>String(job.id)===String(projectId))||null}
function workspaceTeam(state,teamId){return (state?.teams||[]).find(team=>String(team.id)===String(teamId))||null}
function workspacePlannedPeople(state,projectId,teamId,date){const assignment=(state?.assignments||[]).find(item=>String(item.job)===String(projectId)&&String(item.team)===String(teamId)&&String(item.date)===String(date)),team=workspaceTeam(state,teamId);return [...new Set((assignment?.people||team?.members||[]).map(String))]}
function workspaceBreakMinutes(state){return Math.max(0,Number(state?.company?.morningBreakMinutes||0)+Number(state?.company?.lunchBreakMinutes||0))}
async function organizationWorkspaceRow(env,organizationId,{readOnly=false}={}){
  let row=await env.DB.prepare('SELECT payload,revision,source_user_id,updated_at FROM organization_workspace_state WHERE organization_id=?').bind(organizationId).first();
  if(row)return row;
  const owner=await workspaceOwner(env,organizationId);if(!owner)return null;
  const legacy=await env.DB.prepare('SELECT payload,revision,updated_at FROM workspace_state WHERE user_id=?').bind(owner.user_id).first();if(!legacy)return null;if(readOnly)return legacy;
  const stamp=legacy.updated_at||now();
  await env.DB.prepare('INSERT OR IGNORE INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(organizationId,legacy.payload,legacy.revision,owner.user_id,stamp,stamp).run();
  return env.DB.prepare('SELECT payload,revision,source_user_id,updated_at FROM organization_workspace_state WHERE organization_id=?').bind(organizationId).first();
}
async function organizationWorkspaceState(env,organizationId,options={}){const row=await organizationWorkspaceRow(env,organizationId,options);if(!row)return null;try{return JSON.parse(row.payload)}catch{return null}}
async function currentPersonId(env,ctx){const row=await env.DB.prepare("SELECT person_id FROM organization_members WHERE organization_id=? AND user_id=? AND status='active' LIMIT 1").bind(ctx.organizationId,ctx.uid).first();return row?.person_id?String(row.person_id):null}
async function userIdForPerson(env,organizationId,personId){const row=await env.DB.prepare("SELECT user_id FROM organization_members WHERE organization_id=? AND person_id=? AND status='active' LIMIT 1").bind(organizationId,String(personId)).first();return row?.user_id||null}
async function hasProjectScope(env,ctx,projectId){try{await requireProjectScope(env,ctx,projectId);return true}catch(error){if(error?.status===403)return false;throw error}}
async function timePermissionFlags(env,ctx){if(ctx.roleCode==='OWNER')return{owner:true,viewOwn:true,createOwn:true,viewTeam:true,createTeam:true,viewAll:true,requestCorrection:true,reviewCorrection:true};const [viewOwn,createOwn,viewTeam,createTeam,viewAll,requestCorrection,reviewCorrection]=await Promise.all(['time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.view.all','time_entries.correction.request','time_entries.correction.review'].map(permission=>allowed(env,ctx,permission)));return{owner:false,viewOwn,createOwn,viewTeam,createTeam,viewAll,requestCorrection,reviewCorrection}}
function actorCanUseTeam(flags,state,personId,teamId){if(flags.owner||flags.viewAll)return true;if(!personId)return false;const team=workspaceTeam(state,teamId);return Boolean(team&&(team.members||[]).map(String).includes(String(personId)))}
async function canReadTimeEntry(env,ctx,state,flags,personId,row){if(!await hasProjectScope(env,ctx,row.project_id))return false;if(flags.owner||flags.viewAll)return true;const people=timeEntryPeople(row);if(flags.viewTeam&&actorCanUseTeam(flags,state,personId,row.team_id))return true;return Boolean(flags.viewOwn&&personId&&people.includes(String(personId)))}
function correctionStatusLabel(status){return status==='approved'?'Acceptée':status==='rejected'?'Refusée':'À valider'}
async function profileLabels(env,ctx){const members=await rows(env.DB.prepare("SELECT p.id,p.first_name,p.last_name,p.email FROM organization_members om JOIN profiles p ON p.id=om.user_id WHERE om.organization_id=? AND om.status='active'").bind(ctx.organizationId));return new Map(members.map(member=>[member.id,[member.first_name,member.last_name].filter(Boolean).join(' ')||member.email||member.id]))}
function timeEntryJson(row,corrections=[],labels=new Map(),visiblePersonId=null){const allPeople=timeEntryPeople(row),people=visiblePersonId?allPeople.filter(person=>person===String(visiblePersonId)):allPeople,allowedCorrection=correction=>!visiblePersonId||!correction.person_id||String(correction.person_id)===String(visiblePersonId);const correctionRows=corrections.filter(allowedCorrection).map(correction=>({id:correction.id,requestedAt:correction.requested_at,requestedBy:labels.get(correction.requested_by)||correction.requested_by,personId:correction.person_id?legacyPersonValue(correction.person_id):0,original:{arrival:correction.original_arrival,departure:correction.original_departure||''},proposed:{arrival:correction.proposed_arrival,departure:correction.proposed_departure||''},reason:correction.reason,status:correctionStatusLabel(correction.status),reviewedAt:correction.reviewed_at||'',reviewedBy:correction.reviewed_by?(labels.get(correction.reviewed_by)||correction.reviewed_by):'',resultEntryId:correction.result_entry_id||''}));const history=[{action:'Arrivée',at:row.created_at,by:labels.get(row.created_by)||row.created_by,arrival:row.arrival,people:people.map(legacyPersonValue)}];if(row.departure)history.push({action:'Départ',at:row.updated_at,by:labels.get(row.updated_by)||row.updated_by,departure:row.departure});for(const correction of correctionRows)if(correction.reviewedAt)history.push({action:`Correction ${correction.status.toLowerCase()} : ${correction.reason}`,at:correction.reviewedAt,by:correction.reviewedBy});return{id:row.id,projectId:String(row.project_id),team:legacyPersonValue(row.team_id||''),people:people.map(legacyPersonValue),date:row.work_date,arrival:row.arrival,departure:row.departure||'',breakMinutes:Number(row.break_minutes||0),note:row.note||'',archivedAt:row.archived_at||'',corrections:correctionRows,history,serverBacked:true}}
async function ensureLegacyTimeEntriesImported(env,ctx,state){if(ctx.preview)return;const done=await env.DB.prepare('SELECT 1 ok FROM time_entry_imports WHERE organization_id=?').bind(ctx.organizationId).first();if(done)return;const owner=await workspaceOwner(env,ctx.organizationId),createdBy=owner?.user_id||ctx.uid,stamp=now();let imported=0;for(const job of state?.jobs||[]){for(let index=0;index<(job.timeEntries||[]).length;index++){const entry=job.timeEntries[index],date=String(entry?.date||''),arrival=String(entry?.arrival||''),departure=entry?.departure?String(entry.departure):null,people=Array.isArray(entry?.people)?[...new Set(entry.people.map(String))]:[];if(!validIsoDate(date)||!validClockTime(arrival)||(departure&&!validClockTime(departure))||!people.length)continue;const legacyPart=String(entry.id??index).replace(/[^A-Za-z0-9_-]/g,'_'),entryId=`legacy-${String(job.id).replace(/[^A-Za-z0-9_-]/g,'_')}-${legacyPart}`;const result=await env.DB.prepare('INSERT OR IGNORE INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(entryId,ctx.organizationId,String(job.id),entry.team===undefined||entry.team===null?null:String(entry.team),JSON.stringify(people),date,arrival,departure,Math.max(0,Number(entry.breakMinutes??workspaceBreakMinutes(state))||0),String(entry.note||'').slice(0,1000),createdBy,entry.history?.[0]?.at||stamp,createdBy,entry.history?.at(-1)?.at||stamp).run();if(result.meta.changes)imported++;for(let cIndex=0;cIndex<(entry.corrections||[]).length;cIndex++){const correction=entry.corrections[cIndex],proposedArrival=String(correction?.proposed?.arrival||''),proposedDeparture=correction?.proposed?.departure?String(correction.proposed.departure):null;if(!validClockTime(proposedArrival)||(proposedDeparture&&!validClockTime(proposedDeparture)))continue;const correctionId=`legacy-correction-${legacyPart}-${cIndex}-${String(job.id).replace(/[^A-Za-z0-9_-]/g,'_')}`,status=correction.status==='Acceptée'?'approved':correction.status==='Refusée'?'rejected':'pending';await env.DB.prepare('INSERT OR IGNORE INTO time_entry_corrections(id,organization_id,time_entry_id,person_id,original_arrival,original_departure,proposed_arrival,proposed_departure,reason,status,requested_by,requested_at,reviewed_by,reviewed_at,result_entry_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(correctionId,ctx.organizationId,entryId,correction.personId?String(correction.personId):null,String(correction?.original?.arrival||arrival),correction?.original?.departure?String(correction.original.departure):departure,proposedArrival,proposedDeparture,String(correction.reason||'Correction importée').slice(0,500),status,createdBy,correction.requestedAt||stamp,status==='pending'?null:createdBy,correction.reviewedAt||null,correction.resultEntryId?String(correction.resultEntryId):null).run()}}}await env.DB.prepare('INSERT INTO time_entry_imports(organization_id,imported_at,imported_count) VALUES(?,?,?)').bind(ctx.organizationId,stamp,imported).run();if(imported)await audit(env,ctx,'time_entries.legacy_imported','organization',ctx.organizationId,{count:imported})}
function timeEntryCursorEncode(row){return [row.work_date,row.arrival,row.created_at,row.id].map(value=>encodeURIComponent(String(value??''))).join('~')}
function timeEntryCursorDecode(value){if(!value)return null;try{const parts=String(value).split('~').map(part=>decodeURIComponent(part));if(parts.length!==4||!validIsoDate(parts[0])||!validClockTime(parts[1])||!parts[2]||!parts[3])throw Error('invalid');return parts}catch{throw Object.assign(Error('Curseur de pointage invalide.'),{status:400})}}
async function timeEntriesList(request,url,env,ctx,forceOwn=false){if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({entries:[],nextCursor:null,limit:0});const flags=await timePermissionFlags(env,ctx);if(!flags.viewOwn&&!flags.viewTeam&&!flags.viewAll&&!flags.owner)throw Object.assign(Error('Vous ne pouvez pas consulter les pointages.'),{status:403});const personId=await currentPersonId(env,ctx),projectFilter=url.searchParams.get('project_id'),from=url.searchParams.get('from'),to=url.searchParams.get('to'),rawLimit=Number(url.searchParams.get('limit')||100),limit=Number.isInteger(rawLimit)?Math.max(1,Math.min(250,rawLimit)):100,cursor=timeEntryCursorDecode(url.searchParams.get('cursor'));if(forceOwn&&!personId)throw Object.assign(Error('Personne liée requise pour consulter vos pointages.'),{status:403});if(projectFilter)await requireProjectScope(env,ctx,projectFilter);if(from&&!validIsoDate(from)||to&&!validIsoDate(to))return json({error:'Période de pointage invalide.'},400);const includeArchived=forceOwn||url.searchParams.get('include_archived')==='1';let query='SELECT * FROM time_entries WHERE organization_id=?'+(includeArchived?'':' AND archived_at IS NULL'),values=[ctx.organizationId];if(forceOwn){query+=' AND EXISTS (SELECT 1 FROM json_each(time_entries.people_json) WHERE CAST(json_each.value AS TEXT)=?)';values.push(personId)}if(projectFilter){query+=' AND project_id=?';values.push(String(projectFilter))}if(from){query+=' AND work_date>=?';values.push(from)}if(to){query+=' AND work_date<=?';values.push(to)}if(cursor){const [workDate,arrival,createdAt,entryId]=cursor;query+=' AND (work_date<? OR (work_date=? AND arrival<?) OR (work_date=? AND arrival=? AND created_at<?) OR (work_date=? AND arrival=? AND created_at=? AND id<?))';values.push(workDate,workDate,arrival,workDate,arrival,createdAt,workDate,arrival,createdAt,entryId)}query+=' ORDER BY work_date DESC,arrival DESC,created_at DESC,id DESC LIMIT ?';values.push(limit+1);const candidates=await rows(env.DB.prepare(query).bind(...values)),pageCandidates=candidates.slice(0,limit),hasMore=candidates.length>limit,nextCursor=hasMore&&pageCandidates.length?timeEntryCursorEncode(pageCandidates[pageCandidates.length-1]):null,visible=[];for(const row of pageCandidates)if(await canReadTimeEntry(env,ctx,state,flags,personId,row))visible.push(row);let corrections=[];if(visible.length){const ids=visible.map(row=>row.id),marks=ids.map(()=>'?').join(',');corrections=await rows(env.DB.prepare(`SELECT * FROM time_entry_corrections WHERE organization_id=? AND (time_entry_id IN (${marks}) OR result_entry_id IN (${marks})) ORDER BY requested_at`).bind(ctx.organizationId,...ids,...ids))}const byEntry=new Map();for(const correction of corrections){for(const key of [correction.time_entry_id,correction.result_entry_id].filter(Boolean)){if(!byEntry.has(key))byEntry.set(key,[]);if(!byEntry.get(key).some(item=>item.id===correction.id))byEntry.get(key).push(correction)}}const labels=await profileLabels(env,ctx),ownOnly=forceOwn||(!flags.owner&&!flags.viewAll&&!flags.viewTeam);return json({entries:visible.map(row=>timeEntryJson(row,byEntry.get(row.id)||[],labels,ownOnly?personId:null)),nextCursor,limit})}
async function timeArrivalRoute(request,env,ctx){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);const flags=await timePermissionFlags(env,ctx);if(!flags.owner&&!flags.createOwn&&!flags.createTeam)throw Object.assign(Error('Vous ne pouvez pas encoder de pointage.'),{status:403});const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({error:'Espace entreprise introuvable.'},404);await ensureLegacyTimeEntriesImported(env,ctx,state);const data=await body(request,80000),projectId=String(data.projectId||''),teamId=String(data.teamId||''),date=String(data.date||''),note=String(data.note||'').trim();if(!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);const team=workspaceTeam(state,teamId);if(!team)return json({error:'Équipe introuvable dans cette entreprise.'},404);await requireProjectScope(env,ctx,projectId);if(!validIsoDate(date)||note.length>250)return json({error:'Date ou remarque de pointage invalide.'},400);const rawPeople=Array.isArray(data.people)?data.people:[],requested=[];for(const item of rawPeople){const personId=String(typeof item==='object'&&item?item.personId:item),arrival=String(typeof item==='object'&&item?(item.arrival||data.arrival||''):(data.arrival||''));if(!personId||!validClockTime(arrival))return json({error:'Personne ou heure d’arrivée invalide.'},400);if(!requested.some(entry=>entry.personId===personId))requested.push({personId,arrival})}if(!requested.length)return json({error:'Choisissez au moins une personne à pointer.'},400);const planned=await fieldPlannedPeople(env,ctx,state,projectId,teamId,date);if(requested.some(entry=>!planned.includes(entry.personId)))return json({error:'Une personne sélectionnée n’est pas prévue dans cette équipe pour ce chantier.'},400);const actorPersonId=await currentPersonId(env,ctx);if(!flags.owner&&!flags.viewAll){if(flags.createTeam){if(!actorCanUseTeam(flags,state,actorPersonId,teamId))return json({error:'Vous ne pouvez pointer que votre propre équipe.'},403)}else if(!flags.createOwn||!actorPersonId||requested.length!==1||requested[0].personId!==actorPersonId)return json({error:'Vous ne pouvez pointer que vos propres heures.'},403)}const existing=await rows(env.DB.prepare('SELECT id,people_json,work_date,arrival,departure FROM time_entries WHERE organization_id=? AND archived_at IS NULL').bind(ctx.organizationId));for(const person of requested){for(const entry of existing){if(!timeEntryPeople(entry).includes(person.personId))continue;if(!entry.departure)return json({error:'Une personne possède déjà un pointage ouvert.'},409);if(entry.work_date===date&&entry.departure>person.arrival)return json({error:'Cette arrivée chevauche un pointage déjà enregistré.'},409)}}const groups=new Map();for(const person of requested){if(!groups.has(person.arrival))groups.set(person.arrival,[]);groups.get(person.arrival).push(person.personId)}const createdIds=[],stamp=now(),breakMinutes=workspaceBreakMinutes(state),statements=[];for(const [arrival,people] of groups){const entryId=id('time-entry');createdIds.push(entryId);statements.push(env.DB.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(entryId,ctx.organizationId,projectId,teamId,JSON.stringify(people),date,arrival,null,breakMinutes,note,ctx.uid,stamp,ctx.uid,stamp),auditStatement(env,ctx,'time_entry.arrival','time_entry',entryId,{project_id:projectId,team_id:teamId,people,work_date:date,arrival,break_minutes:breakMinutes}))}await dbBatch(env,statements);return json({ids:createdIds},201)}
async function timeDepartureRoute(request,env,ctx,entryId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);const entry=await env.DB.prepare('SELECT * FROM time_entries WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(entryId,ctx.organizationId).first();if(!entry)return json({error:'Pointage introuvable.'},404);if(entry.departure)return json({error:'Ce pointage est déjà terminé.'},409);const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),flags=await timePermissionFlags(env,ctx),actorPersonId=await currentPersonId(env,ctx);if(!state||!await hasProjectScope(env,ctx,entry.project_id))return json({error:'Pointage inaccessible.'},404);const people=timeEntryPeople(entry),data=await body(request,30000),departure=String(data.departure||''),note=String(data.note||'').trim(),requested=[...new Set((Array.isArray(data.personIds)&&data.personIds.length?data.personIds:people).map(String))];if(!validClockTime(departure)||departure<=entry.arrival||note.length>250||!requested.length||requested.some(person=>!people.includes(person)))return json({error:'Départ ou personnes invalides.'},400);if(!flags.owner&&!flags.viewAll){if(flags.createTeam){if(!actorCanUseTeam(flags,state,actorPersonId,entry.team_id))return json({error:'Vous ne pouvez terminer que les pointages de votre équipe.'},403)}else if(!flags.createOwn||!actorPersonId||requested.length!==1||requested[0]!==actorPersonId)return json({error:'Vous ne pouvez terminer que votre propre pointage.'},403)}const stamp=now(),combinedNote=[entry.note,note].filter(Boolean).join(' · '),remaining=people.filter(person=>!requested.includes(person));let closedId=entry.id;if(remaining.length){await env.DB.prepare('UPDATE time_entries SET people_json=?,updated_by=?,updated_at=? WHERE id=? AND organization_id=?').bind(JSON.stringify(remaining),ctx.uid,stamp,entry.id,ctx.organizationId).run();closedId=id('time-entry');await env.DB.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(closedId,ctx.organizationId,entry.project_id,entry.team_id,JSON.stringify(requested),entry.work_date,entry.arrival,departure,Number(entry.break_minutes||0),combinedNote,entry.created_by,entry.created_at,ctx.uid,stamp).run()}else await env.DB.prepare('UPDATE time_entries SET departure=?,note=?,updated_by=?,updated_at=? WHERE id=? AND organization_id=?').bind(departure,combinedNote,ctx.uid,stamp,entry.id,ctx.organizationId).run();await audit(env,ctx,remaining.length?'time_entry.departure.partial':'time_entry.departure','time_entry',closedId,{source_entry_id:entry.id,people:requested,departure,note:note||null});return json({id:closedId,split:Boolean(remaining.length)},200)}
async function timeCorrectionRequestRoute(request,env,ctx,entryId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);const flags=await timePermissionFlags(env,ctx);if(!flags.owner&&!flags.requestCorrection)throw Object.assign(Error('Vous ne pouvez pas demander de correction.'),{status:403});const entry=await env.DB.prepare('SELECT * FROM time_entries WHERE id=? AND organization_id=?').bind(entryId,ctx.organizationId).first();if(!entry)return json({error:'Pointage introuvable.'},404);const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),personId=await currentPersonId(env,ctx);if(!state||!await canReadTimeEntry(env,ctx,state,flags,personId,entry))return json({error:'Pointage inaccessible.'},404);const data=await body(request,30000),arrival=String(data.arrival||''),departure=data.departure?String(data.departure):null,reason=String(data.reason||'').trim(),target=data.personId?String(data.personId):null,people=timeEntryPeople(entry);if(!validClockTime(arrival)||(departure&&(!validClockTime(departure)||departure<=arrival))||!reason||reason.length>500||(target&&!people.includes(target)))return json({error:'Correction invalide.'},400);if(!flags.owner&&!flags.viewAll&&!flags.viewTeam){if(!personId||!people.includes(personId))return json({error:'Pointage inaccessible.'},404);if(target&&target!==personId)return json({error:'Vous ne pouvez corriger que votre propre pointage.'},403);if(!target&&people.length>1)return json({error:'Choisissez votre propre personne pour cette correction.'},400)}if(arrival===entry.arrival&&(departure||'')===(entry.departure||''))return json({error:'La correction proposée ne modifie aucune heure.'},400);const correctionId=id('time-correction'),stamp=now();await env.DB.prepare('INSERT INTO time_entry_corrections(id,organization_id,time_entry_id,person_id,original_arrival,original_departure,proposed_arrival,proposed_departure,reason,status,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(correctionId,ctx.organizationId,entry.id,target,entry.arrival,entry.departure,arrival,departure,reason,'pending',ctx.uid,stamp).run();await audit(env,ctx,'time_entry.correction_requested','time_entry_correction',correctionId,{time_entry_id:entry.id,person_id:target,proposed_arrival:arrival,proposed_departure:departure,reason});return json({id:correctionId,status:'pending'},201)}
function intervalsOverlap(startA,endA,startB,endB){return startA<endB&&endA>startB}
async function timeCorrectionReviewRoute(request,env,ctx,correctionId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);const flags=await timePermissionFlags(env,ctx);if(!flags.owner&&!flags.reviewCorrection)throw Object.assign(Error('Vous ne pouvez pas valider les corrections.'),{status:403});const correction=await env.DB.prepare('SELECT * FROM time_entry_corrections WHERE id=? AND organization_id=?').bind(correctionId,ctx.organizationId).first();if(!correction)return json({error:'Correction introuvable.'},404);if(correction.status!=='pending')return json({error:'Cette correction a déjà été traitée.'},409);const entry=await env.DB.prepare('SELECT * FROM time_entries WHERE id=? AND organization_id=?').bind(correction.time_entry_id,ctx.organizationId).first();if(!entry||!await hasProjectScope(env,ctx,entry.project_id))return json({error:'Pointage inaccessible.'},404);const data=await body(request,10000);if(typeof data.approved!=='boolean')return json({error:'Décision de correction invalide.'},400);const stamp=now(),people=timeEntryPeople(entry);let resultEntryId=null;if(data.approved){if(entry.arrival!==correction.original_arrival||(entry.departure||null)!==(correction.original_departure||null))return json({error:'Le pointage a changé depuis cette demande. Créez une nouvelle correction.'},409);const targetPeople=correction.person_id?[String(correction.person_id)]:people;if(targetPeople.some(person=>!people.includes(person)))return json({error:'La personne ne fait plus partie de ce pointage.'},409);const proposedEnd=correction.proposed_departure||'24:00',others=await rows(env.DB.prepare('SELECT id,people_json,work_date,arrival,departure FROM time_entries WHERE organization_id=? AND id<>?').bind(ctx.organizationId,entry.id));for(const other of others){if(other.work_date!==entry.work_date||!timeEntryPeople(other).some(person=>targetPeople.includes(person)))continue;if(intervalsOverlap(correction.proposed_arrival,proposedEnd,other.arrival,other.departure||'24:00'))return json({error:'La correction chevauche un autre pointage de cette personne.'},409)}if(correction.person_id&&people.length>1){const remaining=people.filter(person=>person!==String(correction.person_id));await env.DB.prepare('UPDATE time_entries SET people_json=?,updated_by=?,updated_at=? WHERE id=? AND organization_id=?').bind(JSON.stringify(remaining),ctx.uid,stamp,entry.id,ctx.organizationId).run();resultEntryId=id('time-entry');await env.DB.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(resultEntryId,ctx.organizationId,entry.project_id,entry.team_id,JSON.stringify([String(correction.person_id)]),entry.work_date,correction.proposed_arrival,correction.proposed_departure,Number(entry.break_minutes||0),entry.note,entry.created_by,entry.created_at,ctx.uid,stamp,entry.archived_at||null).run()}else{resultEntryId=entry.id;await env.DB.prepare('UPDATE time_entries SET arrival=?,departure=?,updated_by=?,updated_at=? WHERE id=? AND organization_id=?').bind(correction.proposed_arrival,correction.proposed_departure,ctx.uid,stamp,entry.id,ctx.organizationId).run()}}await env.DB.prepare('UPDATE time_entry_corrections SET status=?,reviewed_by=?,reviewed_at=?,result_entry_id=? WHERE id=? AND organization_id=?').bind(data.approved?'approved':'rejected',ctx.uid,stamp,resultEntryId,correction.id,ctx.organizationId).run();await audit(env,ctx,data.approved?'time_entry.correction_approved':'time_entry.correction_rejected','time_entry_correction',correction.id,{time_entry_id:entry.id,result_entry_id:resultEntryId,person_id:correction.person_id});return json({id:correction.id,status:data.approved?'approved':'rejected',resultEntryId},200)}
async function conversationParticipant(env,conversationId,userId){return Boolean(await env.DB.prepare('SELECT 1 ok FROM conversation_participants WHERE conversation_id=? AND user_id=?').bind(conversationId,userId).first())}
async function conversationCanAccess(env,ctx,conversation,state,actorPersonId=null){if(conversation.kind==='company')return true;if(conversation.kind==='direct')return conversationParticipant(env,conversation.id,ctx.uid);if(conversation.kind==='project'){const projectId=conversation.scope_project_id||conversation.project_id;return Boolean(projectId&&await hasProjectScope(env,ctx,projectId))}if(conversation.kind==='team'){const explicit=await conversationParticipant(env,conversation.id,ctx.uid),team=workspaceTeam(state,conversation.team_id),member=actorPersonId&&team&&(team.members||[]).map(String).includes(String(actorPersonId));if(!explicit&&ctx.roleCode!=='OWNER'&&!member)return false;const projectId=conversation.scope_project_id||conversation.project_id;if(projectId&&!await hasProjectScope(env,ctx,projectId))return false;return ctx.roleCode==='OWNER'||explicit||Boolean(member)}return false}
async function resolveConversationParticipants(env,ctx,data){const ids=new Set(Array.isArray(data.participantIds)?data.participantIds.map(String):[]);for(const personId of Array.isArray(data.participantPersonIds)?data.participantPersonIds:[]){const user=await userIdForPerson(env,ctx.organizationId,personId);if(!user)throw Object.assign(Error('Une personne sélectionnée ne possède pas de compte actif.'),{status:400});ids.add(user)}ids.add(ctx.uid);for(const userId of ids){const member=await env.DB.prepare("SELECT 1 ok FROM organization_members WHERE organization_id=? AND user_id=? AND status='active'").bind(ctx.organizationId,userId).first();if(!member)throw Object.assign(Error('Un participant n’appartient pas à cette entreprise.'),{status:400})}return[...ids]}

function fieldText(value,max=240){const text=String(value??'').trim();if(text.length>max)throw Object.assign(Error('Texte trop long.'),{status:400});return text}
function fieldNumber(value,{min=0,max=1e12}={}){const number=Number(value);if(!Number.isFinite(number)||number<min||number>max)throw Object.assign(Error('Valeur numérique invalide.'),{status:400});return number}
function parseJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
async function currentProfileLabel(env,ctx){const row=await env.DB.prepare('SELECT first_name,last_name,email FROM profiles WHERE id=?').bind(ctx.uid).first();return [row?.first_name,row?.last_name].filter(Boolean).join(' ')||row?.email||ctx.uid}
async function ensureLegacyFieldDataImported(env,ctx,state){if(ctx.preview)return;
  const done=await env.DB.prepare('SELECT 1 ok FROM field_data_imports WHERE organization_id=?').bind(ctx.organizationId).first();if(done)return;
  const owner=await workspaceOwner(env,ctx.organizationId),createdBy=owner?.user_id||ctx.uid,stamp=now();
  let legacyAssignmentsImported=0,legacyAssignmentsSkippedConflict=0;
  for(const assignment of state?.assignments||[]){
    const assignmentId=String(assignment.id),projectId=String(assignment.job||''),teamId=String(assignment.team||''),date=String(assignment.date||''),people=[...new Set((assignment.people||workspaceTeam(state,teamId)?.members||[]).map(String))];
    if(!assignmentId||!projectId||!teamId||!validIsoDate(date)||!people.length)continue;
    const startTime=planningClock(assignment.startTime||'07:00','07:00'),endTime=planningClock(assignment.endTime||'16:00','16:00');
    if(planningClockMinutes(endTime)<=planningClockMinutes(startTime))continue;
    const conflict=await planningAssignmentConflict(env,ctx,{assignmentId,date,startTime,endTime,teamId,people});
    if(conflict){legacyAssignmentsSkippedConflict++;continue}
    const inserted=await env.DB.prepare('INSERT OR IGNORE INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at,start_time,end_time) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(assignmentId,ctx.organizationId,date,teamId,projectId,JSON.stringify(people),assignment.vehicle?String(assignment.vehicle):null,assignment.pack?String(assignment.pack):null,String(assignment.subcontractor||''),createdBy,stamp,createdBy,stamp,startTime,endTime).run();
    legacyAssignmentsImported+=Number(inserted?.meta?.changes||0);
  }
  for(const asset of state?.assets||[]){const assetId=String(asset.id),payload=structuredClone(asset||{}),fuelEntries=Array.isArray(payload.fuelEntries)?payload.fuelEntries:[];delete payload.fuelEntries;await env.DB.prepare('INSERT OR IGNORE INTO field_assets(id,organization_id,payload_json,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)').bind(assetId,ctx.organizationId,JSON.stringify(payload),createdBy,stamp,createdBy,stamp).run();for(let index=0;index<fuelEntries.length;index++){const entry=fuelEntries[index],entryId=`legacy-fuel-${assetId.replace(/[^A-Za-z0-9_-]/g,'_')}-${String(entry.id??index).replace(/[^A-Za-z0-9_-]/g,'_')}`,date=String(entry.date||'');if(!validIsoDate(date))continue;const odometer=Number(entry.odometer),liters=Number(entry.liters),total=Number(entry.total);if(!Number.isFinite(odometer)||odometer<0||!Number.isFinite(liters)||liters<=0||!Number.isFinite(total)||total<0)continue;await env.DB.prepare('INSERT OR IGNORE INTO field_fuel_entries(id,organization_id,asset_id,work_date,odometer,liters,total_cents,driver_name,pump_name,receipt_name,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(entryId,ctx.organizationId,assetId,date,odometer,liters,Math.round(total*100),String(entry.driver||'Historique'),entry.pumpName||null,entry.receiptName||null,createdBy,stamp).run()}}
  for(const job of state?.jobs||[]){const projectId=String(job.id);for(let index=0;index<(job.materials||[]).length;index++){const material=job.materials[index],materialId=`legacy-material-${projectId.replace(/[^A-Za-z0-9_-]/g,'_')}-${String(material.id??index).replace(/[^A-Za-z0-9_-]/g,'_')}`;await env.DB.prepare('INSERT OR IGNORE INTO field_project_materials(id,organization_id,project_id,name,quantity,unit,delivered,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(materialId,ctx.organizationId,projectId,String(material.name||'Matériau'),Math.max(0,Number(material.qty||0)),String(material.unit||'unité'),Math.max(0,Number(material.delivered||0)),createdBy,stamp,createdBy,stamp).run()}await env.DB.prepare('INSERT OR IGNORE INTO field_project_execution(organization_id,project_id,lines_json,updated_by,updated_at) VALUES(?,?,?,?,?)').bind(ctx.organizationId,projectId,JSON.stringify(Array.isArray(job.execution)?job.execution:[]),createdBy,stamp).run();for(let index=0;index<(job.notes||[]).length;index++){const note=job.notes[index],noteId=`legacy-note-${projectId.replace(/[^A-Za-z0-9_-]/g,'_')}-${String(note.id??index).replace(/[^A-Za-z0-9_-]/g,'_')}`,date=validIsoDate(note.date)?note.date:stamp.slice(0,10);await env.DB.prepare('INSERT OR IGNORE INTO field_project_notes(id,organization_id,project_id,note_date,visibility,body,photo_name,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(noteId,ctx.organizationId,projectId,date,String(note.visibility||'Équipe et patron'),String(note.text||'').slice(0,4000),note.photoName||null,createdBy,stamp).run()}}
  for(const item of state?.stockItems||[]){const itemId=String(item.id),quantity=Math.max(0,Number(item.quantity||0)),reserved=Math.max(0,Number(item.reserved||0)),unitCost=Math.max(0,Math.round(Number(item.unitCost||0)*100));await env.DB.prepare('INSERT OR IGNORE INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(itemId,ctx.organizationId,String(item.reference||''),String(item.name||'Article'),quantity,reserved,String(item.unit||'unité'),unitCost,Math.max(0,Number(item.minimum||0)),String(item.supplier||''),String(item.location||''),createdBy,stamp,createdBy,stamp).run();for(let index=0;index<(item.movements||[]).length;index++){const movement=item.movements[index],movementId=`legacy-stock-${itemId.replace(/[^A-Za-z0-9_-]/g,'_')}-${String(movement.id??index).replace(/[^A-Za-z0-9_-]/g,'_')}`;await env.DB.prepare('INSERT OR IGNORE INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,origin,destination,project_id,reason,unit_cost_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(movementId,ctx.organizationId,itemId,validIsoDate(movement.date)?movement.date:stamp.slice(0,10),String(movement.type||'historique'),Math.max(0,Number(movement.quantity||0)),String(movement.origin||''),String(movement.destination||''),movement.job?String(movement.job):null,String(movement.reason||'Historique'),Math.max(0,Math.round(Number(movement.unitCost??item.unitCost??0)*100)),createdBy,stamp).run()}}
  await env.DB.prepare("INSERT OR IGNORE INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) SELECT 'legacy-' || hex(organization_id || ':' || CASE WHEN trim(location)='' THEN '__unknown__' ELSE trim(location) END),organization_id,CASE WHEN trim(location)='' THEN 'Emplacement historique non précisé' ELSE trim(location) END,CASE WHEN trim(location)='' THEN 'unknown' ELSE 'legacy' END,'active',created_by,created_at,updated_by,updated_at FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL").bind(ctx.organizationId).run();
  await env.DB.prepare("INSERT OR IGNORE INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at) SELECT organization_id,id,'legacy-' || hex(organization_id || ':' || CASE WHEN trim(location)='' THEN '__unknown__' ELSE trim(location) END),quantity,updated_at FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL").bind(ctx.organizationId).run();
  for(let index=0;index<(state?.deliveryNotes||[]).length;index++){const note=state.deliveryNotes[index],noteId=`legacy-delivery-${String(note.id??index).replace(/[^A-Za-z0-9_-]/g,'_')}`;await env.DB.prepare('INSERT OR IGNORE INTO field_delivery_notes(id,organization_id,order_id,supplier_id,project_id,number,delivery_date,receiver_name,comment,file_name,status,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(noteId,ctx.organizationId,String(note.orderId||''),note.supplierId?String(note.supplierId):null,note.job?String(note.job):null,String(note.number||'BL historique'),validIsoDate(note.date)?note.date:stamp.slice(0,10),String(note.receiver||'Historique'),String(note.comment||''),note.fileName||null,String(note.status||'Reçue'),createdBy,stamp).run();for(let lineIndex=0;lineIndex<(note.lines||[]).length;lineIndex++){const line=note.lines[lineIndex],lineId=`${noteId}-line-${lineIndex}`;await env.DB.prepare('INSERT OR IGNORE INTO field_delivery_lines(id,organization_id,delivery_note_id,order_line_id,reference,label,ordered,received,condition,difference,stock_item_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(lineId,ctx.organizationId,noteId,String(line.orderLineId||lineIndex),String(line.reference||''),String(line.label||'Article'),Math.max(0,Number(line.ordered||0)),Math.max(0,Number(line.received||0)),String(line.condition||'Conforme'),Number(line.difference||0),null).run()}}
  await env.DB.prepare('INSERT INTO field_data_imports(organization_id,imported_at) VALUES(?,?)').bind(ctx.organizationId,stamp).run();await audit(env,ctx,'field_data.legacy_imported','organization',ctx.organizationId,{assignments_imported:legacyAssignmentsImported,assignments_skipped_conflict:legacyAssignmentsSkippedConflict,assets:(state?.assets||[]).length,stock_items:(state?.stockItems||[]).length,projects:(state?.jobs||[]).length,deliveries:(state?.deliveryNotes||[]).length});
}
async function fieldPlannedPeople(env,ctx,state,projectId,teamId,date){await ensureLegacyFieldDataImported(env,ctx,state);const row=await env.DB.prepare('SELECT people_json FROM field_assignments WHERE organization_id=? AND project_id=? AND team_id=? AND assignment_date=? ORDER BY updated_at DESC LIMIT 1').bind(ctx.organizationId,String(projectId),String(teamId),String(date)).first();if(row){const people=parseJson(row.people_json,[]);if(Array.isArray(people)&&people.length)return [...new Set(people.map(String))]}return workspacePlannedPeople(state,projectId,teamId,date)}

function planningClock(value,fallback){
  const clock=String(value||fallback||'').trim();
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock))throw Object.assign(Error('Heure de planning invalide.'),{status:400});
  return clock;
}
function planningClockMinutes(value){const [h,m]=String(value).split(':').map(Number);return h*60+m}
function planningIntervalOverlap(aStart,aEnd,bStart,bEnd){return planningClockMinutes(aStart)<planningClockMinutes(bEnd)&&planningClockMinutes(bStart)<planningClockMinutes(aEnd)}
function planningDateTime(value){
  const text=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(text)||!validIsoDate(text.slice(0,10)))throw Object.assign(Error('Date/heure de planning invalide.'),{status:400});
  return text;
}
async function planningReadable(env,ctx){
  const policy=await accessPolicy(env,ctx);
  if(policy.owner)return true;
  if(policy.configured)return policy.has('ui.module.planning.view');
  return policy.has('workspace.view')||policy.has('projects.view.all')||policy.has('projects.view.assigned');
}
async function planningAudience(env,ctx){
  const policy=await accessPolicy(env,ctx);
  if(policy.owner)return 'all';
  if(policy.configured){
    if(['Ses propres informations','Ses propres informations et chantiers'].includes(policy.scope))return 'own';
    if(policy.scope==='Son équipe et ses chantiers')return 'team';
    return 'scope';
  }
  if(ctx.roleCode==='WORKER')return 'own';
  if(ctx.roleCode==='TEAM_LEAD')return 'team';
  return 'scope';
}
async function planningVisibleProjectIds(env,ctx,state){
  const ids=[];
  for(const job of state?.jobs||[])if(await hasProjectScope(env,ctx,String(job.id)))ids.push(String(job.id));
  return ids;
}
async function planningScopedTeamIds(env,ctx,state,from,to,assignmentRows,personId,audience){
  if(audience==='all')return new Set((state?.teams||[]).map(team=>String(team.id)));
  if(audience==='own')return new Set(assignmentRows.filter(row=>parseJson(row.people_json,[]).map(String).includes(String(personId))).map(row=>String(row.team_id||'')).filter(Boolean));
  if(audience!=='team')return new Set();
  const ids=new Set();
  for(const team of state?.teams||[])if((team.members||[]).map(String).includes(String(personId)))ids.add(String(team.id));
  const [members,leads]=await Promise.all([
    rows(env.DB.prepare('SELECT team_id FROM hr_team_members WHERE organization_id=? AND person_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)').bind(ctx.organizationId,String(personId),to,from)),
    rows(env.DB.prepare('SELECT team_id FROM hr_team_leads WHERE organization_id=? AND person_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)').bind(ctx.organizationId,String(personId),to,from))
  ]);
  for(const row of [...members,...leads])if(row.team_id)ids.add(String(row.team_id));
  return ids;
}
function planningSafePerson(person){return{id:legacyPersonValue(person.id),name:String(person.name||person.displayName||person.role||person.id),role:String(person.role||person.roleTitle||'')};}
async function planningPersonExists(env,ctx,state,personId,date=''){
  const legacy=(state?.people||[]).find(person=>String(person.id)===String(personId));
  if(legacy){
    if(legacy.inactiveAt)return false;
    if(date&&((legacy.start&&legacy.start>date)||(legacy.end&&legacy.end<date)))return false;
    return true;
  }
  const row=await env.DB.prepare('SELECT active FROM hr_people WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(personId)).first();
  return Boolean(row&&Number(row.active)!==0);
}
async function planningTeamExists(env,ctx,state,teamId){
  if(workspaceTeam(state,teamId))return true;
  return Boolean(await env.DB.prepare('SELECT 1 ok FROM hr_teams WHERE organization_id=? AND id=? AND active=1').bind(ctx.organizationId,String(teamId)).first());
}
async function planningPersonBelongsToTeam(env,ctx,state,personId,teamId,date){
  const activeMembership=await env.DB.prepare('SELECT 1 ok FROM hr_team_members WHERE organization_id=? AND team_id=? AND person_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) LIMIT 1').bind(ctx.organizationId,String(teamId),String(personId),String(date),String(date)).first();
  if(activeMembership)return true;
  const hasRelationalMembership=await env.DB.prepare('SELECT 1 ok FROM hr_team_members WHERE organization_id=? AND team_id=? LIMIT 1').bind(ctx.organizationId,String(teamId)).first();
  if(hasRelationalMembership)return false;
  return Boolean((workspaceTeam(state,teamId)?.members||[]).map(String).includes(String(personId)));
}
function planningAssignmentSnapshot(row){
  return{date:row.assignment_date,team_id:row.team_id,project_id:row.project_id,people:parseJson(row.people_json,[]).map(String),vehicle_id:row.vehicle_id||null,pack_id:row.pack_id||null,subcontractor:row.subcontractor||'',start_time:row.start_time||'07:00',end_time:row.end_time||'16:00',assignment_type:row.assignment_type||'team',status:row.status||'planned',reason:row.reason||''};
}
async function planningRequestHash(value){return sha256Hex(new TextEncoder().encode(JSON.stringify(value)))}
async function planningReceipt(env,ctx,key,kind,requestHash){
  const row=await env.DB.prepare('SELECT actor_user_id,operation_kind,request_hash,response_json FROM planning_operation_receipts WHERE organization_id=? AND operation_key=?').bind(ctx.organizationId,key).first();
  if(!row)return null;
  if(String(row.actor_user_id)!==String(ctx.uid)||row.operation_kind!==kind||row.request_hash!==requestHash)return{response:json({error:'Cette clé d’opération a déjà été utilisée avec d’autres informations.'},409)};
  return{payload:parseJson(row.response_json,{})};
}
function planningReceiptStatement(env,ctx,key,kind,requestHash,payload,stamp=now()){
  return env.DB.prepare('INSERT INTO planning_operation_receipts(organization_id,operation_key,actor_user_id,operation_kind,request_hash,response_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(ctx.organizationId,key,ctx.uid,kind,requestHash,JSON.stringify(payload),stamp);
}
async function planningAbsenceConflict(env,ctx,people,date,startTime,endTime){
  if(!people.length)return null;
  const start=date+'T'+startTime,end=date+'T'+endTime,marks=people.map(()=>'?').join(',');
  const conflicts=await rows(env.DB.prepare(`SELECT id,person_id,absence_type,starts_at,ends_at FROM planning_absences WHERE organization_id=? AND person_id IN (${marks}) AND status='approved' AND starts_at<? AND ends_at>? ORDER BY starts_at LIMIT 20`).bind(ctx.organizationId,...people,end,start));
  return conflicts[0]||null;
}
async function planningAssignmentConflict(env,ctx,{assignmentId,date,startTime,endTime,teamId,people}){
  const rowsForDay=await rows(env.DB.prepare("SELECT id,team_id,people_json,start_time,end_time,status FROM field_assignments WHERE organization_id=? AND assignment_date=? AND status<>'cancelled'").bind(ctx.organizationId,date));
  for(const row of rowsForDay){
    if(assignmentId&&String(row.id)===String(assignmentId))continue;
    const rowStart=planningClock(row.start_time||'07:00','07:00'),rowEnd=planningClock(row.end_time||'16:00','16:00');
    if(!planningIntervalOverlap(startTime,endTime,rowStart,rowEnd))continue;
    const assigned=parseJson(row.people_json,[]).map(String);
    if(String(row.team_id)===String(teamId)||assigned.some(personId=>people.includes(personId)))return row;
  }
  return null;
}
function planningAssignmentJson(row){
  return {
    id:legacyPersonValue(row.id),date:row.assignment_date,team:legacyPersonValue(row.team_id),job:legacyPersonValue(row.project_id),
    people:parseJson(row.people_json,[]).map(legacyPersonValue),vehicle:row.vehicle_id?legacyPersonValue(row.vehicle_id):0,
    pack:row.pack_id?legacyPersonValue(row.pack_id):0,subcontractor:row.subcontractor||'',startTime:row.start_time||'07:00',
    endTime:row.end_time||'16:00',assignmentType:row.assignment_type||'team',status:row.status||'planned',reason:row.reason||'',serverBacked:true
  };
}
async function planningRoute(request,url,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  if(!await planningReadable(env,ctx))return json({error:'Accès au planning non autorisé.'},403);
  const linkedPersonId=await currentPersonId(env,ctx),personId=String(linkedPersonId||''),audience=await planningAudience(env,ctx),policy=await accessPolicy(env,ctx);
  if((audience==='own'||audience==='team')&&!personId)return json({error:'Personne liée requise pour consulter le planning.'},403);
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state)return json({assignments:[],absences:[],teams:[],teamLeads:[],blocks:[],actuals:[],projects:[],people:[]});
  await ensureLegacyFieldDataImported(env,ctx,state);
  const from=String(url.searchParams.get('from')||now().slice(0,10)),to=String(url.searchParams.get('to')||from);
  if(!validIsoDate(from)||!validIsoDate(to)||to<from)return json({error:'Période planning invalide.'},400);
  const assignmentStatusFilter=audience==='own'?" AND status<>'cancelled'":'';
  const assignmentRows=await rows(env.DB.prepare('SELECT * FROM field_assignments WHERE organization_id=? AND assignment_date>=? AND assignment_date<=?'+assignmentStatusFilter+' ORDER BY assignment_date,start_time,team_id,id').bind(ctx.organizationId,from,to));
  const visibleProjects=await planningVisibleProjectIds(env,ctx,state),visibleSet=new Set(visibleProjects),teamIds=await planningScopedTeamIds(env,ctx,state,from,to,assignmentRows,linkedPersonId,audience);
  let scopedRows=assignmentRows.filter(row=>visibleSet.has(String(row.project_id)));
  if(audience==='own')scopedRows=scopedRows.filter(row=>parseJson(row.people_json,[]).map(String).includes(personId));
  else if(audience==='team')scopedRows=scopedRows.filter(row=>teamIds.has(String(row.team_id||'')));
  let assignments=scopedRows.map(planningAssignmentJson);
  if(audience==='own')assignments=assignments.map(item=>({...item,people:[legacyPersonValue(personId)],reason:''}));
  const scopedProjectIds=new Set(policy.owner?visibleProjects:scopedRows.map(row=>String(row.project_id)));
  const absenceRows=await rows(env.DB.prepare("SELECT * FROM planning_absences WHERE organization_id=? AND status<>'cancelled' AND starts_at<? AND ends_at>? ORDER BY starts_at,person_id").bind(ctx.organizationId,to+'T23:59',from+'T00:00'));
  const assignedPeople=new Set(scopedRows.flatMap(row=>parseJson(row.people_json,[]).map(String)));
  const teamPeople=new Set([String(linkedPersonId||''),...assignedPeople]);
  if(audience==='team')for(const team of state.teams||[])if(teamIds.has(String(team.id)))for(const member of team.members||[])teamPeople.add(String(member));
  const absences=absenceRows.filter(row=>policy.owner||(audience==='own'?String(row.person_id)===personId:audience==='team'&&teamPeople.has(String(row.person_id)))).map(row=>({id:row.id,personId:legacyPersonValue(row.person_id),type:audience==='team'&&!policy.owner&&row.absence_type==='sickness'?'unavailable':row.absence_type,startsAt:row.starts_at,endsAt:row.ends_at,status:row.status,...(policy.owner?{reason:row.reason||''}:{})}));
  const relationalTeams=await rows(env.DB.prepare('SELECT id,name,active FROM hr_teams WHERE organization_id=? AND active=1 ORDER BY name,id').bind(ctx.organizationId));
  const allTeams=relationalTeams.length?relationalTeams.map(row=>({id:legacyPersonValue(row.id),name:row.name})):(state.teams||[]).map(team=>({id:team.id,name:team.name}));
  const allowedTeamIds=policy.owner?new Set(allTeams.map(team=>String(team.id))):teamIds;
  const teams=allTeams.filter(team=>allowedTeamIds.has(String(team.id)));
  const leadRows=await rows(env.DB.prepare('SELECT id,team_id,person_id,starts_on,ends_on,temporary FROM hr_team_leads WHERE organization_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?) ORDER BY team_id,temporary DESC,starts_on DESC').bind(ctx.organizationId,to,from));
  const teamLeads=audience==='own'?[]:leadRows.filter(row=>policy.owner||allowedTeamIds.has(String(row.team_id))).map(row=>({id:row.id,teamId:legacyPersonValue(row.team_id),personId:legacyPersonValue(row.person_id),startsOn:row.starts_on,endsOn:row.ends_on||null,temporary:Boolean(row.temporary)}));
  const blockRows=await rows(env.DB.prepare("SELECT * FROM project_planning_blocks WHERE organization_id=? AND status<>'cancelled' AND starts_at<? AND ends_at>? ORDER BY starts_at,project_id").bind(ctx.organizationId,to+'T23:59',from+'T00:00'));
  const blocks=blockRows.filter(row=>scopedProjectIds.has(String(row.project_id))).map(row=>({id:row.id,projectId:legacyPersonValue(row.project_id),startsAt:row.starts_at,endsAt:row.ends_at,type:row.block_type,status:row.status,...((policy.owner||audience==='team')?{dueDate:row.due_date||''}:{}),...((policy.owner||(audience==='team'&&teamPeople.has(String(row.responsible_person_id||''))))?{responsiblePersonId:legacyPersonValue(row.responsible_person_id),reason:row.reason||''}:{})}));
  const actualRows=await rows(env.DB.prepare("SELECT id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes FROM time_entries WHERE organization_id=? AND work_date>=? AND work_date<=? AND archived_at IS NULL AND departure IS NOT NULL ORDER BY work_date,arrival,id").bind(ctx.organizationId,from,to));
  const actuals=[];
  for(const row of actualRows){
    if(!scopedProjectIds.has(String(row.project_id)))continue;
    const people=parseJson(row.people_json,[]).map(String);
    if(audience==='own'&&!people.includes(personId))continue;
    if(audience==='team'&&!teamIds.has(String(row.team_id||'')))continue;
    const arrival=planningClock(row.arrival,'00:00'),departure=planningClock(row.departure,'00:00'),minutes=Math.max(0,planningClockMinutes(departure)-planningClockMinutes(arrival)-Number(row.break_minutes||0));
    actuals.push({id:row.id,projectId:legacyPersonValue(row.project_id),teamId:row.team_id?legacyPersonValue(row.team_id):null,people:(audience==='own'?[personId]:people).map(legacyPersonValue),date:row.work_date,arrival,departure,breakMinutes:Number(row.break_minutes||0),minutes});
  }
  const projectRows=(state.jobs||[]).filter(job=>scopedProjectIds.has(String(job.id))).map(job=>({id:legacyPersonValue(job.id),reference:job.reference||job.ref||'',name:String(job.name||''),client:String(job.client||''),town:String(job.town||''),phase:String(job.phase||''),status:String(job.status||'')}));
  const allowedPersonIds=policy.owner?null:audience==='own'?new Set([personId]):new Set([...teamPeople,...teamLeads.map(row=>String(row.personId))]);
  const people=(state.people||[]).filter(person=>!allowedPersonIds||allowedPersonIds.has(String(person.id))).map(planningSafePerson);
  return json({from,to,assignments,absences,teams,teamLeads,blocks,actuals,projects:projectRows,people});
}
async function planningHistoryRoute(request,env,ctx,projectId){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'planning.assignments.manage');
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state||!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);
  await requireProjectScope(env,ctx,projectId);
  const events=await rows(env.DB.prepare("SELECT a.id,a.action,a.entity_type,a.entity_id,a.old_values,a.new_values,a.created_at,a.user_id,p.first_name,p.last_name,p.email FROM audit_logs a LEFT JOIN profiles p ON p.id=a.user_id WHERE a.organization_id=? AND a.entity_type IN ('assignment','planning_block') AND (json_extract(CASE WHEN json_valid(a.new_values) THEN a.new_values ELSE '{}' END,'$.project_id')=? OR json_extract(CASE WHEN json_valid(a.old_values) THEN a.old_values ELSE '{}' END,'$.project_id')=?) ORDER BY a.created_at DESC,a.id DESC LIMIT 100").bind(ctx.organizationId,String(projectId),String(projectId)));
  return json({projectId:String(projectId),events:events.map(event=>({id:event.id,action:event.action,entityType:event.entity_type,entityId:event.entity_id,actorName:[event.first_name,event.last_name].filter(Boolean).join(' ')||event.email||'Utilisateur',createdAt:event.created_at,oldValues:parseJson(event.old_values||'null',null),newValues:parseJson(event.new_values||'null',null)}))});
}

function planningShiftDate(date,days){
  const d=new Date(String(date)+'T12:00:00Z');
  if(Number.isNaN(d.getTime()))throw Object.assign(Error('Date de replanification invalide.'),{status:400});
  d.setUTCDate(d.getUTCDate()+Number(days||0));
  return d.toISOString().slice(0,10);
}
async function planningReplanRoute(request,env,ctx){
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'planning.assignments.manage');
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state)return json({error:'Espace entreprise introuvable.'},404);
  await ensureLegacyFieldDataImported(env,ctx,state);
  const data=exactObject(await body(request,50000),['scope','assignmentId','date','from','to','teamId','projectId','shiftDays','targetProjectId','targetTeamId','reason','operationKey']);
  const scope=String(data.scope||''),allowedScopes=new Set(['assignment','day','team','range','project']);
  if(!allowedScopes.has(scope))return json({error:'Périmètre de replanification invalide.'},400);
  const shiftDays=Number(data.shiftDays||0);
  if(!Number.isInteger(shiftDays)||Math.abs(shiftDays)>365)return json({error:'Décalage de jours invalide.'},400);
  const targetProjectId=data.targetProjectId?String(data.targetProjectId):'',targetTeamId=data.targetTeamId?String(data.targetTeamId):'',reason=fieldText(data.reason||'',500),opKey=operationKey(data),requestHash=await planningRequestHash({scope,assignmentId:String(data.assignmentId||''),date:String(data.date||''),from:String(data.from||''),to:String(data.to||''),teamId:String(data.teamId||''),projectId:String(data.projectId||''),shiftDays,targetProjectId,targetTeamId,reason});
  if(!shiftDays&&!targetProjectId&&!targetTeamId)return json({error:'Aucune modification de replanification demandée.'},400);
  const clauses=['organization_id=?'],params=[ctx.organizationId];
  if(scope==='assignment'){
    if(!data.assignmentId)return json({error:'Affectation requise.'},400);
    clauses.push('id=?');params.push(String(data.assignmentId));
  }else if(scope==='day'){
    const date=String(data.date||'');if(!validIsoDate(date))return json({error:'Date requise.'},400);
    clauses.push('assignment_date=?');params.push(date);
  }else if(scope==='team'){
    const teamId=String(data.teamId||'');if(!teamId)return json({error:'Équipe requise.'},400);
    clauses.push('team_id=?');params.push(teamId);
    if(data.from||data.to){
      const from=String(data.from||data.to||''),to=String(data.to||data.from||'');
      if(!validIsoDate(from)||!validIsoDate(to)||to<from)return json({error:'Période invalide.'},400);
      clauses.push('assignment_date>=?','assignment_date<=?');params.push(from,to);
    }
  }else if(scope==='range'){
    const from=String(data.from||''),to=String(data.to||'');
    if(!validIsoDate(from)||!validIsoDate(to)||to<from)return json({error:'Période requise.'},400);
    clauses.push('assignment_date>=?','assignment_date<=?');params.push(from,to);
  }else if(scope==='project'){
    const projectId=String(data.projectId||'');if(!projectId)return json({error:'Chantier requis.'},400);
    clauses.push('project_id=?');params.push(projectId);
    if(data.from||data.to){
      const from=String(data.from||data.to||''),to=String(data.to||data.from||'');
      if(!validIsoDate(from)||!validIsoDate(to)||to<from)return json({error:'Période invalide.'},400);
      clauses.push('assignment_date>=?','assignment_date<=?');params.push(from,to);
    }
  }
  const prior=await planningReceipt(env,ctx,opKey,'replan',requestHash);
  if(prior?.response)return prior.response;
  if(prior){for(const projectId of prior.payload?.projectIds||[])await requireProjectScope(env,ctx,projectId);return json({ok:true,count:Number(prior.payload?.count||0),ids:prior.payload?.ids||[],scope,replayed:true},200)}
  const selected=await rows(env.DB.prepare('SELECT * FROM field_assignments WHERE '+clauses.join(' AND ')+' ORDER BY assignment_date,start_time,id').bind(...params));
  if(!selected.length)return json({error:'Aucune affectation à replanifier.'},404);
  const selectedIds=new Set(selected.map(row=>String(row.id)));
  if(targetProjectId){
    if(!workspaceProject(state,targetProjectId))return json({error:'Chantier cible introuvable.'},404);
    await requireProjectScope(env,ctx,targetProjectId);
  }
  if(targetTeamId&&!await planningTeamExists(env,ctx,state,targetTeamId))return json({error:'Équipe cible introuvable.'},404);
  const all=await rows(env.DB.prepare("SELECT * FROM field_assignments WHERE organization_id=? AND status<>'cancelled'").bind(ctx.organizationId));
  const proposed=[];
  for(const row of selected){
    await requireProjectScope(env,ctx,row.project_id);
    const projectId=targetProjectId||String(row.project_id),teamId=targetTeamId||String(row.team_id),date=planningShiftDate(row.assignment_date,shiftDays),people=parseJson(row.people_json,[]).map(String),startTime=planningClock(row.start_time||'07:00','07:00'),endTime=planningClock(row.end_time||'16:00','16:00');
    if(!workspaceProject(state,projectId))return json({error:'Chantier cible introuvable.'},404);
    await requireProjectScope(env,ctx,projectId);
    if(!await planningTeamExists(env,ctx,state,teamId))return json({error:'Équipe cible introuvable.'},404);
    for(const personId of people)if(!await planningPersonExists(env,ctx,state,personId,date))return json({error:'Une personne est inactive sur la nouvelle date.'},409);
    if(targetTeamId&&targetTeamId!==String(row.team_id)&&(row.assignment_type||'team')==='team')for(const personId of people)if(!await planningPersonBelongsToTeam(env,ctx,state,personId,teamId,date))return json({error:'Replanification impossible : une personne ne fait pas partie de l’équipe cible à cette date.'},409);
    const absence=await planningAbsenceConflict(env,ctx,people,date,startTime,endTime);
    if(absence)return json({error:'Replanification impossible : indisponibilité.',conflict:{type:'absence',id:absence.id,personId:absence.person_id}},409);
    proposed.push({row,projectId,teamId,date,people,startTime,endTime});
  }
  const occupied=all.filter(row=>!selectedIds.has(String(row.id))).map(row=>({id:String(row.id),date:row.assignment_date,teamId:String(row.team_id),people:parseJson(row.people_json,[]).map(String),startTime:planningClock(row.start_time||'07:00','07:00'),endTime:planningClock(row.end_time||'16:00','16:00')}));
  const accepted=[];
  for(const item of proposed){
    const collision=[...occupied,...accepted].find(other=>other.date===item.date&&planningIntervalOverlap(item.startTime,item.endTime,other.startTime,other.endTime)&&(other.teamId===item.teamId||other.people.some(personId=>item.people.includes(personId))));
    if(collision)return json({error:'Replanification impossible : conflit d’affectation.',conflict:{type:'assignment',id:collision.id}},409);
    accepted.push({id:String(item.row.id),date:item.date,teamId:item.teamId,people:item.people,startTime:item.startTime,endTime:item.endTime});
  }
  const stamp=now(),ids=proposed.map(item=>String(item.row.id)),projectIds=[...new Set(proposed.flatMap(item=>[String(item.row.project_id),String(item.projectId)]))];
  const statements=proposed.map(item=>env.DB.prepare('UPDATE field_assignments SET assignment_date=?,project_id=?,team_id=?,reason=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(item.date,item.projectId,item.teamId,reason||item.row.reason||'',ctx.uid,stamp,ctx.organizationId,String(item.row.id)));
  for(const item of proposed){
    statements.push(auditStatement(env,ctx,'planning.replanned','assignment',String(item.row.id),{date:item.date,project_id:item.projectId,team_id:item.teamId,people:parseJson(item.row.people_json,[]),reason:reason||item.row.reason||''},{date:item.row.assignment_date,project_id:item.row.project_id,team_id:item.row.team_id,people:parseJson(item.row.people_json,[]),reason:item.row.reason||''}));
  }
  statements.push(planningReceiptStatement(env,ctx,opKey,'replan',requestHash,{count:proposed.length,ids,projectIds},stamp));
  try{await dbBatch(env,statements)}catch(error){
    const replay=await planningReceipt(env,ctx,opKey,'replan',requestHash);
    if(replay?.response)return replay.response;
    if(replay){for(const projectId of replay.payload?.projectIds||[])await requireProjectScope(env,ctx,projectId);return json({ok:true,count:Number(replay.payload?.count||0),ids:replay.payload?.ids||[],scope,replayed:true},200)}
    if(String(error?.message||'').includes('planning_assignment_conflict'))return json({error:'Replanification impossible : conflit d’affectation.',conflict:{type:'assignment'}},409);
    if(String(error?.message||'').includes('planning_absence_conflict'))return json({error:'Replanification impossible : indisponibilité.',conflict:{type:'absence'}},409);
    throw error;
  }
  return json({ok:true,count:proposed.length,ids,scope});
}

async function planningAbsenceRoute(request,env,ctx,absenceId=null){
  await requirePermission(env,ctx,'planning.assignments.manage');
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(request.method==='DELETE'&&absenceId){
    const existing=await env.DB.prepare('SELECT * FROM planning_absences WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(absenceId)).first();
    if(!existing)return json({error:'Indisponibilité introuvable.'},404);
    if(existing.status==='cancelled')return json({ok:true,status:'cancelled',replayed:true});
    const stamp=now();await dbBatch(env,[env.DB.prepare("UPDATE planning_absences SET status='cancelled',updated_by=?,updated_at=? WHERE organization_id=? AND id=?").bind(ctx.uid,stamp,ctx.organizationId,String(absenceId)),auditStatement(env,ctx,'planning.absence.cancelled','planning_absence',String(absenceId),{status:'cancelled',person_id:existing.person_id,starts_at:existing.starts_at,ends_at:existing.ends_at},{status:existing.status,person_id:existing.person_id,starts_at:existing.starts_at,ends_at:existing.ends_at})]);return json({ok:true});
  }
  if(!['POST','PUT'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
  if(request.method==='PUT'&&!absenceId)return json({error:'Indisponibilité manquante.'},400);
  const data=exactObject(await body(request,30000),['personId','type','startsAt','endsAt','status','reason']),personId=String(data.personId||''),type=String(data.type||'absence'),startsAt=planningDateTime(data.startsAt),endsAt=planningDateTime(data.endsAt),status=String(data.status||'approved'),reason=fieldText(data.reason||'',500);
  if(!['absence','leave','sickness','training','unavailable'].includes(type)||!['pending','approved','cancelled'].includes(status)||endsAt<=startsAt)return json({error:'Indisponibilité invalide.'},400);
  if(!await planningPersonExists(env,ctx,state,personId,startsAt.slice(0,10)))return json({error:'Personne introuvable ou inactive.'},404);
  const newId=absenceId?String(absenceId):id('planning-absence'),stamp=now(),existing=absenceId?await env.DB.prepare('SELECT * FROM planning_absences WHERE organization_id=? AND id=?').bind(ctx.organizationId,newId).first():null;
  if(absenceId&&!existing)return json({error:'Indisponibilité introuvable.'},404);
  const write=existing?env.DB.prepare('UPDATE planning_absences SET person_id=?,absence_type=?,starts_at=?,ends_at=?,status=?,reason=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(personId,type,startsAt,endsAt,status,reason,ctx.uid,stamp,ctx.organizationId,newId):env.DB.prepare('INSERT INTO planning_absences(organization_id,id,person_id,absence_type,starts_at,ends_at,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(ctx.organizationId,newId,personId,type,startsAt,endsAt,status,reason,ctx.uid,stamp,ctx.uid,stamp);
  await dbBatch(env,[write,auditStatement(env,ctx,existing?'planning.absence.updated':'planning.absence.created','planning_absence',newId,{person_id:personId,type,starts_at:startsAt,ends_at:endsAt,status,reason},existing?{person_id:existing.person_id,type:existing.absence_type,starts_at:existing.starts_at,ends_at:existing.ends_at,status:existing.status,reason:existing.reason||''}:null)]);
  return json({id:newId},existing?200:201);
}
async function planningBlockRoute(request,env,ctx,blockId=null){
  await requirePermission(env,ctx,'planning.assignments.manage');
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(request.method==='DELETE'&&blockId){
    const existing=await env.DB.prepare('SELECT * FROM project_planning_blocks WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(blockId)).first();
    if(!existing)return json({error:'Blocage chantier introuvable.'},404);
    await requireProjectScope(env,ctx,existing.project_id);if(existing.status==='cancelled')return json({ok:true,status:'cancelled',replayed:true});const stamp=now();await dbBatch(env,[env.DB.prepare("UPDATE project_planning_blocks SET status='cancelled',updated_by=?,updated_at=? WHERE organization_id=? AND id=?").bind(ctx.uid,stamp,ctx.organizationId,String(blockId)),auditStatement(env,ctx,'planning.block.cancelled','planning_block',String(blockId),{project_id:existing.project_id,status:'cancelled'},{project_id:existing.project_id,status:existing.status})]);return json({ok:true});
  }
  if(!['POST','PUT'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
  if(request.method==='PUT'&&!blockId)return json({error:'Blocage chantier manquant.'},400);
  const data=exactObject(await body(request,30000),['projectId','startsAt','endsAt','type','status','reason','responsiblePersonId','dueDate']),newId=blockId?String(blockId):id('planning-block'),existing=blockId?await env.DB.prepare('SELECT * FROM project_planning_blocks WHERE organization_id=? AND id=?').bind(ctx.organizationId,newId).first():null;
  if(blockId&&!existing)return json({error:'Blocage chantier introuvable.'},404);
  if(existing)await requireProjectScope(env,ctx,existing.project_id);
  const projectId=String(data.projectId??existing?.project_id??''),startsAt=planningDateTime(data.startsAt??existing?.starts_at),endsAt=planningDateTime(data.endsAt??existing?.ends_at),type=String(data.type??existing?.block_type??'other'),status=String(data.status??existing?.status??'active'),reason=fieldText(data.reason??existing?.reason??'',500),responsiblePersonId=String(data.responsiblePersonId??existing?.responsible_person_id??''),dueDate=String(data.dueDate??existing?.due_date??'');
  if(!state||!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);
  await requireProjectScope(env,ctx,projectId);
  if(!['weather','client','material','architect','technical','other'].includes(type)||!['active','resolved','cancelled'].includes(status)||endsAt<=startsAt||(dueDate&&!validIsoDate(dueDate)))return json({error:'Blocage chantier invalide.'},400);
  if(responsiblePersonId&&!await planningPersonExists(env,ctx,state,responsiblePersonId,startsAt.slice(0,10)))return json({error:'Responsable introuvable ou inactif dans cette entreprise.'},404);
  const stamp=now();
  const write=existing?env.DB.prepare('UPDATE project_planning_blocks SET project_id=?,starts_at=?,ends_at=?,block_type=?,status=?,reason=?,responsible_person_id=?,due_date=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(projectId,startsAt,endsAt,type,status,reason,responsiblePersonId,dueDate,ctx.uid,stamp,ctx.organizationId,newId):env.DB.prepare('INSERT INTO project_planning_blocks(organization_id,id,project_id,starts_at,ends_at,block_type,status,reason,responsible_person_id,due_date,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(ctx.organizationId,newId,projectId,startsAt,endsAt,type,status,reason,responsiblePersonId,dueDate,ctx.uid,stamp,ctx.uid,stamp);
  await dbBatch(env,[write,auditStatement(env,ctx,existing?'planning.block.updated':'planning.block.created','planning_block',newId,{project_id:projectId,starts_at:startsAt,ends_at:endsAt,type,status,reason,responsible_person_id:responsiblePersonId,due_date:dueDate},existing?{project_id:existing.project_id,starts_at:existing.starts_at,ends_at:existing.ends_at,type:existing.block_type,status:existing.status,reason:existing.reason||'',responsible_person_id:existing.responsible_person_id||'',due_date:existing.due_date||''}:null)]);
  return json({id:newId},existing?200:201);
}
async function teamLeadRoute(request,env,ctx,teamId,leadId=null){
  await requirePermission(env,ctx,'planning.assignments.manage');
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!await planningTeamExists(env,ctx,state,teamId))return json({error:'Équipe introuvable dans cette entreprise.'},404);
  if(request.method==='DELETE'&&leadId){
    const existing=await env.DB.prepare('SELECT * FROM hr_team_leads WHERE organization_id=? AND id=? AND team_id=?').bind(ctx.organizationId,String(leadId),String(teamId)).first();
    if(!existing)return json({error:'Chef d’équipe introuvable.'},404);
    const stamp=now();await env.DB.prepare('UPDATE hr_team_leads SET ends_on=COALESCE(ends_on,?),updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(stamp.slice(0,10),ctx.uid,stamp,ctx.organizationId,String(leadId)).run();
    await audit(env,ctx,'planning.team_lead.ended','hr_team_lead',String(leadId),{team_id:String(teamId),ends_on:stamp.slice(0,10)},{person_id:existing.person_id,starts_on:existing.starts_on,ends_on:existing.ends_on});return json({ok:true});
  }
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  const data=exactObject(await body(request,30000),['personId','startsOn','endsOn','temporary']),personId=String(data.personId||''),startsOn=String(data.startsOn||now().slice(0,10)),endsOn=data.endsOn?String(data.endsOn):null,temporary=Boolean(data.temporary);
  if(!validIsoDate(startsOn)||(endsOn&&(!validIsoDate(endsOn)||endsOn<startsOn)))return json({error:'Période du chef d’équipe invalide.'},400);
  if(!await planningPersonExists(env,ctx,state,personId,startsOn))return json({error:'Personne introuvable ou inactive.'},404);
  const newId=id('team-lead'),stamp=now();await env.DB.prepare('INSERT INTO hr_team_leads(organization_id,id,team_id,person_id,starts_on,ends_on,temporary,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(ctx.organizationId,newId,String(teamId),personId,startsOn,endsOn,temporary?1:0,ctx.uid,stamp,ctx.uid,stamp).run();
  await audit(env,ctx,'planning.team_lead.created','hr_team_lead',newId,{team_id:String(teamId),person_id:personId,starts_on:startsOn,ends_on:endsOn,temporary});
  return json({id:newId},201);
}

async function assignmentRoute(request,env,ctx,assignmentId=null){
  await requirePermission(env,ctx,'planning.assignments.manage');
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state)return json({error:'Espace entreprise introuvable.'},404);
  await ensureLegacyFieldDataImported(env,ctx,state);
  if(request.method==='DELETE'&&assignmentId){
    const existing=await env.DB.prepare('SELECT * FROM field_assignments WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(assignmentId)).first();
    if(!existing)return json({error:'Affectation introuvable dans cette entreprise.'},404);
    await requireProjectScope(env,ctx,existing.project_id);
    if(existing.status==='cancelled')return json({ok:true,status:'cancelled',replayed:true});
    const stamp=now(),old=planningAssignmentSnapshot(existing),next={...old,status:'cancelled'};
    await dbBatch(env,[env.DB.prepare("UPDATE field_assignments SET status='cancelled',updated_by=?,updated_at=? WHERE organization_id=? AND id=?").bind(ctx.uid,stamp,ctx.organizationId,String(assignmentId)),auditStatement(env,ctx,'assignment.cancelled','assignment',String(assignmentId),next,old)]);
    return json({ok:true,status:'cancelled'});
  }
  if(!['POST','PUT'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
  if(request.method==='PUT'&&!assignmentId)return json({error:'Affectation manquante.'},400);
  const data=await body(request,50000),projectId=String(data.projectId||''),teamId=String(data.teamId||''),date=String(data.date||''),people=[...new Set((Array.isArray(data.people)?data.people:[]).map(String))];
  if(!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);
  if(!await planningTeamExists(env,ctx,state,teamId))return json({error:'Équipe introuvable dans cette entreprise.'},404);
  await requireProjectScope(env,ctx,projectId);
  if(!validIsoDate(date)||!people.length)return json({error:'Affectation invalide.'},400);
  for(const personId of people)if(!await planningPersonExists(env,ctx,state,personId,date))return json({error:'Une personne est indisponible ou n’appartient pas à cette entreprise.'},400);
  let existing=null;if(assignmentId){existing=await env.DB.prepare('SELECT * FROM field_assignments WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(assignmentId)).first();if(!existing)return json({error:'Affectation introuvable dans cette entreprise.'},404);await requireProjectScope(env,ctx,existing.project_id)}
  const startTime=planningClock(data.startTime||existing?.start_time||'07:00','07:00'),endTime=planningClock(data.endTime||existing?.end_time||'16:00','16:00');
  if(planningClockMinutes(endTime)<=planningClockMinutes(startTime))return json({error:'L’heure de fin doit être après l’heure de début.'},400);
  const assignmentType=String(data.assignmentType||existing?.assignment_type||'team'),status=String(data.status||existing?.status||'planned'),reason=fieldText(data.reason??existing?.reason??'',500);
  if(!['team','reinforcement','individual'].includes(assignmentType)||!['planned','confirmed','blocked','cancelled'].includes(status))return json({error:'Type ou statut de planning invalide.'},400);
  const vehicleId=data.vehicleId?String(data.vehicleId):null,packId=data.packId?String(data.packId):null,subcontractor=fieldText(data.subcontractor||existing?.subcontractor||'',160),next={date,team_id:teamId,project_id:projectId,people,vehicle_id:vehicleId,pack_id:packId,subcontractor,start_time:startTime,end_time:endTime,assignment_type:assignmentType,status,reason};
  const opKey=request.method==='POST'&&data.operationKey?operationKey(data):null,requestHash=opKey?await planningRequestHash(next):null;
  if(opKey){const receipt=await planningReceipt(env,ctx,opKey,'assignment',requestHash);if(receipt?.response)return receipt.response;if(receipt){const replay=await env.DB.prepare('SELECT * FROM field_assignments WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(receipt.payload?.id||'')).first();if(!replay)return json({error:'Le résultat de cette opération est introuvable.'},409);return json({id:replay.id,assignment:planningAssignmentJson(replay),replayed:true},200)}}
  if(status!=='cancelled'&&assignmentType==='team')for(const personId of people)if(!await planningPersonBelongsToTeam(env,ctx,state,personId,teamId,date))return json({error:'Une personne affectée ne fait pas partie de cette équipe à cette date.'},400);
  if(status!=='cancelled'){
    const absence=await planningAbsenceConflict(env,ctx,people,date,startTime,endTime);
    if(absence)return json({error:'Conflit : une personne est indisponible sur ce créneau.',conflict:{type:'absence',id:absence.id,personId:absence.person_id}},409);
    const overlap=await planningAssignmentConflict(env,ctx,{assignmentId,date,startTime,endTime,teamId,people});
    if(overlap)return json({error:'Conflit : une équipe ou une personne est déjà affectée sur ce créneau.',conflict:{type:'assignment',id:overlap.id}},409);
  }
  let newId=assignmentId?String(assignmentId):String(Date.now());if(!assignmentId)while(await env.DB.prepare('SELECT 1 ok FROM field_assignments WHERE organization_id=? AND id=?').bind(ctx.organizationId,newId).first())newId=String(Number(newId)+1);
  const stamp=now(),write=existing
    ?env.DB.prepare('UPDATE field_assignments SET assignment_date=?,team_id=?,project_id=?,people_json=?,vehicle_id=?,pack_id=?,subcontractor=?,start_time=?,end_time=?,assignment_type=?,status=?,reason=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(date,teamId,projectId,JSON.stringify(people),vehicleId,packId,subcontractor,startTime,endTime,assignmentType,status,reason,ctx.uid,stamp,ctx.organizationId,newId)
    :env.DB.prepare('INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,start_time,end_time,assignment_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(newId,ctx.organizationId,date,teamId,projectId,JSON.stringify(people),vehicleId,packId,subcontractor,startTime,endTime,assignmentType,status,reason,ctx.uid,stamp,ctx.uid,stamp);
  const old=existing?planningAssignmentSnapshot(existing):null,statements=[write,auditStatement(env,ctx,existing?'assignment.updated':'assignment.created','assignment',newId,next,old)];
  if(opKey)statements.push(planningReceiptStatement(env,ctx,opKey,'assignment',requestHash,{id:newId},stamp));
  try{await dbBatch(env,statements)}catch(error){
    if(opKey){const receipt=await planningReceipt(env,ctx,opKey,'assignment',requestHash);if(receipt?.response)return receipt.response;if(receipt){const replay=await env.DB.prepare('SELECT * FROM field_assignments WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(receipt.payload?.id||'')).first();if(replay)return json({id:replay.id,assignment:planningAssignmentJson(replay),replayed:true},200)}}
    if(String(error?.message||'').includes('planning_assignment_conflict'))return json({error:'Conflit : une équipe ou une personne est déjà affectée sur ce créneau.',conflict:{type:'assignment'}},409);
    if(String(error?.message||'').includes('planning_absence_conflict'))return json({error:'Conflit : une personne est indisponible sur ce créneau.',conflict:{type:'absence'}},409);
    throw error;
  }
  return json({id:newId,assignment:{id:newId,...next}},existing?200:201);
}

async function fieldAssetRow(env,ctx,assetId){return env.DB.prepare('SELECT * FROM field_assets WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(assetId)).first()}
function cleanAssetPayload(data,existing={}){const source=data&&typeof data==='object'?data:{},payload=structuredClone(existing||{}),allowed=['name','group','category','mode','condition','provider','reference','start','end','responsible','attached','contents','repairNote','customType','customCategory','customMode','customCondition'];for(const key of allowed)if(source[key]!==undefined)payload[key]=typeof source[key]==='boolean'?source[key]:fieldText(source[key],key==='contents'||key==='repairNote'?800:140);if(source.monthly!==undefined)payload.monthly=fieldNumber(source.monthly,{min:0,max:1e9});if(source.vehicle!==undefined){const vehicle=source.vehicle&&typeof source.vehicle==='object'?source.vehicle:{};payload.vehicle={...(payload.vehicle||{})};for(const key of ['registration','model','fuel','firstRegistration','inspection','insurer','policy','insuranceEnd'])if(vehicle[key]!==undefined)payload.vehicle[key]=fieldText(vehicle[key],160);if(vehicle.mileage!==undefined)payload.vehicle.mileage=fieldNumber(vehicle.mileage,{min:0,max:1e8})}if(!fieldText(payload.name||'',100))throw Object.assign(Error('Le nom du matériel est obligatoire.'),{status:400});payload.history=Array.isArray(existing?.history)?existing.history:[];payload.docs=Array.isArray(existing?.docs)?existing.docs:[];delete payload.fuelEntries;return payload}
async function fieldAssetsRoute(request,env,ctx,assetId=null){const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({error:'Espace entreprise introuvable.'},404);await ensureLegacyFieldDataImported(env,ctx,state);if(request.method==='POST'&&!assetId){await requirePermission(env,ctx,'assets.manage');const data=await body(request,80000),stamp=now();let numeric=Date.now();while(await env.DB.prepare('SELECT 1 ok FROM field_assets WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(numeric)).first())numeric++;const payload=cleanAssetPayload(data,{}),newId=String(numeric);payload.id=numeric;await env.DB.prepare('INSERT INTO field_assets(id,organization_id,payload_json,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)').bind(newId,ctx.organizationId,JSON.stringify(payload),ctx.uid,stamp,ctx.uid,stamp).run();await audit(env,ctx,'asset.created','asset',newId,{name:payload.name,group:payload.group||''});return json({id:newId,asset:payload},201)}if(request.method==='PATCH'&&assetId){await requirePermission(env,ctx,'assets.manage');const row=await fieldAssetRow(env,ctx,assetId);if(!row)return json({error:'Matériel introuvable dans cette entreprise.'},404);const old=parseJson(row.payload_json,{}),payload=cleanAssetPayload(await body(request,80000),old),stamp=now();payload.id=old.id??legacyPersonValue(assetId);await env.DB.prepare('UPDATE field_assets SET payload_json=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(JSON.stringify(payload),ctx.uid,stamp,ctx.organizationId,String(assetId)).run();await audit(env,ctx,'asset.updated','asset',String(assetId),{name:payload.name,condition:payload.condition||'',attached:payload.attached||''},{name:old.name,condition:old.condition||'',attached:old.attached||''});return json({asset:payload})}return json({error:'Méthode non autorisée.'},405)}
async function fuelRoute(request,env,ctx,assetId){
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'fuel.create');
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state)return json({error:'Espace entreprise introuvable.'},404);
  await ensureLegacyFieldDataImported(env,ctx,state);
  const asset=await fieldAssetRow(env,ctx,assetId);
  if(!asset)return json({error:'Véhicule introuvable dans cette entreprise.'},404);
  const payload=parseJson(asset.payload_json,{});
  if(payload.group!=='vehicles')return json({error:'Le plein doit être lié à un véhicule.'},400);
  let data,file=null;
  if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
    const length=Number(request.headers.get('content-length')||0);
    if(length>DOCUMENT_MAX_BYTES+100000)throw Object.assign(Error('Fichier trop volumineux.'),{status:413});
    let form;try{form=await request.formData()}catch{throw Object.assign(Error('Formulaire de plein illisible.'),{status:400})}
    data=Object.fromEntries(['date','odometer','liters','total','operationKey'].map(key=>[key,form.get(key)]));
    file=form.get('receipt');if(!file||typeof file.arrayBuffer!=='function'||file.size<=0)file=null;
  }else data=await body(request,40000);
  const date=String(data.date||''),odometer=fieldNumber(data.odometer,{min:0,max:1e8}),liters=fieldNumber(data.liters,{min:0.001,max:1e6}),totalCents=cents(data.total),opKey=data.operationKey?operationKey({operationKey:data.operationKey}):null;
  if(!validIsoDate(date))return json({error:'Date de carburant invalide.'},400);
  const previous=await env.DB.prepare('SELECT MAX(odometer) max_odometer FROM field_fuel_entries WHERE organization_id=? AND asset_id=?').bind(ctx.organizationId,String(assetId)).first();
  const priorOdometer=Math.max(Number(previous?.max_odometer||0),Number(payload.vehicle?.mileage||0));
  if(priorOdometer>odometer)return json({error:`Le kilométrage doit être au moins égal au dernier relevé (${priorOdometer.toLocaleString('fr-BE')} km).`},400);
  let receipt=null;
  if(file){
    if(file.size>DOCUMENT_MAX_BYTES)throw Object.assign(Error('Ticket trop volumineux.'),{status:413});
    const bytes=await file.arrayBuffer(),checksum=await sha256Hex(bytes),name=safeOriginalName(file.name),detected=detectedDocumentMime(bytes),declared=String(file.type||'').toLowerCase();
    if(!detected||!detected.startsWith('image/')||!DOCUMENT_MIME_TYPES.has(detected)||declared&&declared!==detected||!documentExtensionMatches(name,detected))throw Object.assign(Error('Le ticket doit être une photo JPG, PNG ou WEBP valide.'),{status:415});
    receipt={bytes,checksum,name,detected,size:file.size};
  }
  if(opKey){const replay=await env.DB.prepare('SELECT id,asset_id,work_date,odometer,liters,total_cents,receipt_document_id FROM field_fuel_entries WHERE organization_id=? AND operation_key=?').bind(ctx.organizationId,opKey).first();if(replay){if(String(replay.asset_id)!==String(assetId)||replay.work_date!==date||Number(replay.odometer)!==odometer||Number(replay.liters)!==liters||Number(replay.total_cents)!==totalCents||Boolean(replay.receipt_document_id)!==Boolean(receipt))return json({error:'Cette clé de saisie a déjà été utilisée avec d’autres valeurs.'},409);if(receipt){const stored=await env.DB.prepare('SELECT checksum_sha256,original_name FROM secure_documents WHERE organization_id=? AND id=?').bind(ctx.organizationId,replay.receipt_document_id).first();if(!stored||stored.checksum_sha256!==receipt.checksum||stored.original_name!==receipt.name)return json({error:'Cette clé de saisie a déjà été utilisée avec un autre ticket.'},409)}return json({id:replay.id,replayed:true},200)}}
  const personId=await currentPersonId(env,ctx),driver=await currentProfileLabel(env,ctx),entryId=id('fuel'),stamp=now(),receiptDocumentId=receipt?id('document'):null;
  payload.vehicle={...(payload.vehicle||{}),mileage:Math.max(Number(payload.vehicle?.mileage||0),odometer)};
  const statements=[
    env.DB.prepare('INSERT INTO field_fuel_entries(id,organization_id,asset_id,work_date,odometer,liters,total_cents,driver_person_id,driver_name,pump_name,receipt_name,created_by,created_at,receipt_document_id,operation_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(entryId,ctx.organizationId,String(assetId),date,odometer,liters,totalCents,personId,driver,null,receipt?.name||null,ctx.uid,stamp,receiptDocumentId,opKey),
    env.DB.prepare('UPDATE field_assets SET payload_json=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(JSON.stringify(payload),ctx.uid,stamp,ctx.organizationId,String(assetId)),
    auditStatement(env,ctx,'fuel.created','fuel_entry',entryId,{asset_id:String(assetId),work_date:date,odometer,liters,total_cents:totalCents,driver_person_id:personId,receipt_attached:Boolean(receipt)})
  ];
  if(receipt){
    const folderId=await ensureDocumentRootFolder(env,ctx),storageKey=`private/${ctx.organizationId}/${receiptDocumentId}`,title=`Ticket carburant · ${payload.name||'Véhicule'} · ${date}`;
    statements.push(
      env.DB.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key,document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,?,?,?,?,'available',?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(receiptDocumentId,ctx.organizationId,folderId,storageKey,receipt.name,receipt.detected,receipt.size,receipt.checksum,'confidential',ctx.uid,stamp,stamp,title,'Ticket de plein · accès limité au personnel autorisé','Carburant','',opKey?`fuel-${opKey}`:null,'fuel_receipt',date,'mobile_upload','asset',String(assetId),'manual','not_requested',''),
      env.DB.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').bind(receiptDocumentId,ctx.organizationId,new Uint8Array(receipt.bytes),stamp),
      env.DB.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(id('document-relation'),ctx.organizationId,receiptDocumentId,'asset',String(assetId),ctx.uid,stamp),
      auditStatement(env,ctx,'fuel.receipt.uploaded','secure_document',receiptDocumentId,{asset_id:String(assetId),fuel_entry_id:entryId,checksum_sha256:receipt.checksum,byte_size:receipt.size})
    );
  }
  await dbBatch(env,statements);
  return json({id:entryId,receiptAttached:Boolean(receipt)},201);
}
async function assetIssueRoute(request,env,ctx,assetId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requirePermission(env,ctx,'asset_issues.create');const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({error:'Espace entreprise introuvable.'},404);await ensureLegacyFieldDataImported(env,ctx,state);const asset=await fieldAssetRow(env,ctx,assetId);if(!asset)return json({error:'Matériel introuvable dans cette entreprise.'},404);const data=await body(request,30000),severity=String(data.severity||''),description=fieldText(data.description||'',600);if(!['À contrôler','Réparation nécessaire','Immobilisé'].includes(severity)||!description)return json({error:'Signalement matériel invalide.'},400);const issueId=id('asset-issue'),stamp=now(),personId=await currentPersonId(env,ctx);await dbBatch(env,[env.DB.prepare('INSERT INTO field_asset_issues(id,organization_id,asset_id,severity,description,reporter_person_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(issueId,ctx.organizationId,String(assetId),severity,description,personId,ctx.uid,stamp),auditStatement(env,ctx,'asset_issue.created','asset_issue',issueId,{asset_id:String(assetId),severity,reporter_person_id:personId})]);return json({id:issueId},201)}
async function projectMaterialRoute(request,env,ctx,projectId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requirePermission(env,ctx,'project_materials.create');await requireProjectScope(env,ctx,projectId);const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);await ensureLegacyFieldDataImported(env,ctx,state);const data=await body(request,30000),name=fieldText(data.name||'',160),quantity=fieldNumber(data.quantity,{min:0.001,max:1e9}),unit=fieldText(data.unit||'',60),delivered=fieldNumber(data.delivered||0,{min:0,max:1e9});if(!name||!unit||delivered>quantity)return json({error:'Matériau invalide.'},400);const materialId=id('material'),stamp=now();await env.DB.prepare('INSERT INTO field_project_materials(id,organization_id,project_id,name,quantity,unit,delivered,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(materialId,ctx.organizationId,String(projectId),name,quantity,unit,delivered,ctx.uid,stamp,ctx.uid,stamp).run();await audit(env,ctx,'project_material.created','project_material',materialId,{project_id:String(projectId),name,quantity,unit,delivered});return json({id:materialId},201)}
async function projectExecutionRoute(request,env,ctx,projectId){if(request.method!=='PUT')return json({error:'Méthode non autorisée.'},405);await requirePermission(env,ctx,'project_execution.edit');await requireProjectScope(env,ctx,projectId);const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);await ensureLegacyFieldDataImported(env,ctx,state);const data=await body(request,50000),lines=Array.isArray(data.lines)?data.lines.map(line=>fieldText(line,300)).filter(Boolean):[];if(lines.length>300)return json({error:'Fiche d’exécution trop longue.'},400);const stamp=now(),old=await env.DB.prepare('SELECT lines_json FROM field_project_execution WHERE organization_id=? AND project_id=?').bind(ctx.organizationId,String(projectId)).first();await env.DB.prepare('INSERT INTO field_project_execution(organization_id,project_id,lines_json,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,project_id) DO UPDATE SET lines_json=excluded.lines_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(ctx.organizationId,String(projectId),JSON.stringify(lines),ctx.uid,stamp).run();await audit(env,ctx,'project_execution.updated','project',String(projectId),{lines},old?{lines:parseJson(old.lines_json,[])}:null);return json({lines})}
async function fieldPhotoDocumentIds(env,ctx,projectId,value){
  const ids=[...new Set((Array.isArray(value)?value:[]).map(item=>String(item||'').trim()).filter(Boolean))];
  if(ids.length>12)throw Object.assign(Error("Maximum 12 photos par élément terrain."),{status:400});
  for(const documentId of ids){
    const document=await secureDocument(env,ctx,documentId);
    if(!document||!String(document.content_type||'').startsWith('image/'))throw Object.assign(Error("Photo terrain introuvable."),{status:400});
    const relations=await documentRelations(env,ctx,documentId);
    if(!relations.some(relation=>relation.relation_type==='project'&&String(relation.relation_id)===String(projectId)))throw Object.assign(Error("La photo n’est pas liée à ce chantier."),{status:400});
    if(!await canAccessSecureDocument(env,ctx,document,relations))throw Object.assign(Error("Photo terrain inaccessible."),{status:404});
  }
  return ids;
}
function optionalOperationKey(data){
  const value=String(data?.operationKey||'').trim();
  if(!value)return null;
  if(!/^[A-Za-z0-9._:-]{8,160}$/.test(value))throw Object.assign(Error("Clé d’opération invalide."),{status:400});
  return value;
}
async function fieldPhotoUploadRoute(request,env,ctx,projectId){
  if(request.method!=='POST')return json({error:"Méthode non autorisée."},405);
  await requirePermission(env,ctx,'project_notes.create');
  await requirePermission(env,ctx,'documents.secure.view');
  await requireProjectScope(env,ctx,projectId);
  await resolveHubProject(env,ctx,projectId);
  const length=Number(request.headers.get('content-length')||0);
  if(length>DOCUMENT_MAX_BYTES+100000)throw Object.assign(Error("Fichier trop volumineux."),{status:413});
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw Object.assign(Error("Format attendu : multipart/form-data."),{status:415});
  let form;try{form=await request.formData()}catch{throw Object.assign(Error("Photo illisible."),{status:400})}
  const photo=form.get('file');
  if(!photo||typeof photo.arrayBuffer!=='function'||photo.size<=0||photo.size>DOCUMENT_MAX_BYTES)throw Object.assign(Error("Photo invalide."),{status:400});
  const key=operationKey({operationKey:form.get('operationKey')}),bytes=await photo.arrayBuffer(),checksum=await sha256Hex(bytes),name=safeOriginalName(photo.name);
  const existing=await env.DB.prepare('SELECT * FROM secure_documents WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();
  if(existing){
    if(existing.checksum_sha256!==checksum||Number(existing.byte_size)!==photo.size||existing.original_name!==name)return json({error:"Cette clé d’opération a déjà été utilisée avec une autre photo."},409);
    const relations=await documentRelations(env,ctx,existing.id);
    if(!relations.some(relation=>relation.relation_type==='project'&&String(relation.relation_id)===String(projectId)))return json({error:"Cette photo rejouée appartient à un autre contexte."},409);
    return json({document:documentJson(existing,relations),replayed:true});
  }
  const detected=detectedDocumentMime(bytes),declared=String(photo.type||'').toLowerCase();
  if(!detected||!detected.startsWith('image/')||!DOCUMENT_MIME_TYPES.has(detected)||declared&&declared!==detected||!documentExtensionMatches(photo.name,detected))throw Object.assign(Error("Format de photo refusé ou incohérent."),{status:415});
  const documentId=id('document'),relationId=id('document-relation'),folderId=await ensureDocumentRootFolder(env,ctx),stamp=now(),storageKey='private/'+ctx.organizationId+'/'+documentId,title=documentText(form.get('title')||name,180)||name;
  await dbBatch(env,[
    env.DB.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,'available',?,?,?,NULL,?,?,?,?,?)").bind(documentId,ctx.organizationId,folderId,storageKey,name,detected,photo.size,checksum,'standard',ctx.uid,stamp,stamp,title,'Photo terrain','other','',key),
    env.DB.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').bind(documentId,ctx.organizationId,new Uint8Array(bytes),stamp),
    env.DB.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(relationId,ctx.organizationId,documentId,'project',String(projectId),ctx.uid,stamp),
    auditStatement(env,ctx,'field_photo.uploaded','secure_document',documentId,{project_id:String(projectId),checksum_sha256:checksum,byte_size:photo.size})
  ]);
  const document=await secureDocument(env,ctx,documentId),relations=await documentRelations(env,ctx,documentId);
  return json({document:documentJson(document,relations)},201);
}
async function projectNoteRoute(request,env,ctx,projectId,noteId=null){
  await requireProjectScope(env,ctx,projectId);
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!workspaceProject(state,projectId)&&!await env.DB.prepare('SELECT 1 ok FROM projects WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(projectId)).first())return json({error:"Chantier introuvable dans cette entreprise."},404);
  await ensureLegacyFieldDataImported(env,ctx,state||{});
  if(request.method==='GET'&&!noteId){
    const list=await rows(env.DB.prepare("SELECT n.*,p.first_name,p.last_name FROM field_project_notes n LEFT JOIN profiles p ON p.id=n.created_by WHERE n.organization_id=? AND n.project_id=? AND n.archived_at IS NULL AND (?='OWNER' OR n.visibility<>'Patron uniquement') ORDER BY n.created_at DESC,n.id DESC LIMIT 250").bind(ctx.organizationId,String(projectId),ctx.roleCode));
    return json({notes:list.map(row=>({id:row.id,projectId:String(row.project_id),date:row.note_date,category:row.category||'Avancement',visibility:row.visibility,text:row.body,photoName:row.photo_name||'',photoDocumentIds:parseJson(row.photo_document_ids_json||'[]',[]),authorPersonId:row.author_person_id||null,createdBy:row.created_by,author:[row.first_name,row.last_name].filter(Boolean).join(' ')||row.created_by,createdAt:row.created_at,updatedAt:row.updated_at||row.created_at}))});
  }
  if(request.method==='POST'&&!noteId){
    await requirePermission(env,ctx,'project_notes.create');
    const data=await body(request,50000),visibility=String(data.visibility||'Équipe et patron'),category=String(data.category||'Avancement'),text=fieldText(data.text||'',4000),photoIds=await fieldPhotoDocumentIds(env,ctx,projectId,data.photoDocumentIds),key=optionalOperationKey(data);
    if(!['Avancement','Problème','Livraison','Sécurité'].includes(category))return json({error:"Type de relève invalide."},400);
    if(!['Équipe et patron','Patron uniquement'].includes(visibility)||(!text&&!photoIds.length))return json({error:"Remarque chantier invalide."},400);
    if(ctx.roleCode!=='OWNER'&&visibility==='Patron uniquement')return json({error:"Seul le propriétaire peut créer une remarque privée patron."},403);
    const replayMatchesNote=replay=>String(replay.project_id)===String(projectId)&&replay.body===text&&String(replay.visibility||'')===String(visibility||'')&&String(replay.category||'Avancement')===category&&JSON.stringify(parseJson(replay.photo_document_ids_json||'[]',[]))===JSON.stringify(photoIds);
    if(key){
      const replay=await env.DB.prepare('SELECT * FROM field_project_notes WHERE organization_id=? AND created_by=? AND operation_key=?').bind(ctx.organizationId,ctx.uid,key).first();
      if(replay){
        if(!replayMatchesNote(replay))return json({error:"Cette clé d’opération a déjà servi pour une autre remarque."},409);
        return json({id:replay.id,replayed:true});
      }
    }
    let photoName=fieldText(data.photoName||'',255);
    if(!photoName&&photoIds[0]){const photo=await secureDocument(env,ctx,photoIds[0]);photoName=fieldText(photo?.original_name||'',255)}
    const idNote=id('project-note'),stamp=now(),personId=await currentPersonId(env,ctx);
    const statements=[
      env.DB.prepare('INSERT INTO field_project_notes(id,organization_id,project_id,note_date,visibility,body,photo_name,author_person_id,created_by,created_at,operation_key,photo_document_ids_json,updated_by,updated_at,archived_at,category) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?)').bind(idNote,ctx.organizationId,String(projectId),stamp.slice(0,10),visibility,text,photoName||null,personId,ctx.uid,stamp,key,JSON.stringify(photoIds),ctx.uid,stamp,category),
      auditStatement(env,ctx,'project_note.created','project_note',idNote,{project_id:String(projectId),visibility,category,photo_document_ids:photoIds,author_person_id:personId})
    ];
    try{await dbBatch(env,statements)}catch(error){
      if(key){const replay=await env.DB.prepare('SELECT * FROM field_project_notes WHERE organization_id=? AND created_by=? AND operation_key=?').bind(ctx.organizationId,ctx.uid,key).first();if(replay){if(replayMatchesNote(replay))return json({id:replay.id,replayed:true});return json({error:"Cette clé d’opération a déjà servi pour une autre remarque."},409)}}
      throw error;
    }
    return json({id:idNote},201);
  }
  const note=noteId?await env.DB.prepare('SELECT * FROM field_project_notes WHERE organization_id=? AND project_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(projectId),String(noteId)).first():null;
  if(noteId&&!note)return json({error:"Remarque introuvable."},404);
  const manages=ctx.roleCode==='OWNER'||await canManageProjectTasks(env,ctx),owns=note&&String(note.created_by)===String(ctx.uid);
  if(request.method==='PATCH'&&note){
    if(!manages&&!owns)return json({error:"Vous ne pouvez pas modifier cette remarque."},403);
    const data=await body(request,50000),visibility=data.visibility===undefined?note.visibility:String(data.visibility),text=data.text===undefined?note.body:fieldText(data.text,4000),photoIds=data.photoDocumentIds===undefined?parseJson(note.photo_document_ids_json||'[]',[]):await fieldPhotoDocumentIds(env,ctx,projectId,data.photoDocumentIds);
    if(!['Équipe et patron','Patron uniquement'].includes(visibility)||(!text&&!photoIds.length))return json({error:"Remarque chantier invalide."},400);
    if(ctx.roleCode!=='OWNER'&&visibility==='Patron uniquement')return json({error:"Seul le propriétaire peut rendre une remarque privée patron."},403);
    const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE field_project_notes SET visibility=?,body=?,photo_document_ids_json=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(visibility,text,JSON.stringify(photoIds),ctx.uid,stamp,ctx.organizationId,note.id),auditStatement(env,ctx,'project_note.updated','project_note',note.id,{visibility,photo_document_ids:photoIds},{visibility:note.visibility,photo_document_ids:parseJson(note.photo_document_ids_json||'[]',[])})]);return json({id:note.id});
  }
  if(request.method==='DELETE'&&note){
    if(!manages&&!owns)return json({error:"Vous ne pouvez pas supprimer cette remarque."},403);
    const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE field_project_notes SET archived_at=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(stamp,ctx.uid,stamp,ctx.organizationId,note.id),auditStatement(env,ctx,'project_note.archived','project_note',note.id,{project_id:String(projectId)})]);return json({archived:true,id:note.id});
  }
  return json({error:"Méthode non autorisée."},405);
}


function stockCatalogNormalize(value){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-BE').replace(/[^a-z0-9]+/g,' ').trim();
}
function stockCatalogAliases(value){
  const input=Array.isArray(value)?value:String(value??'').split(/[,\n]/),result=[],seen=new Set();
  for(const raw of input){
    const alias=fieldText(raw||'',100);if(!alias)continue;
    const key=stockCatalogNormalize(alias);if(!key||seen.has(key))continue;
    seen.add(key);result.push(alias);
    if(result.length>20)throw Object.assign(Error('Trop d’alias pour cet article.'),{status:400});
  }
  return result;
}
function stockBarcodeCheckDigitValid(value){
  const raw=String(value||'');
  if(!/^\d+$/.test(raw)||![8,12,13,14].includes(raw.length))return false;
  const body=raw.slice(0,-1),expected=Number(raw.at(-1));let sum=0,weight=3;
  for(let index=body.length-1;index>=0;index--){sum+=Number(body[index])*weight;weight=weight===3?1:3}
  return ((10-(sum%10))%10)===expected;
}
function stockBarcodeNormalize(value,symbology=''){
  const rawValue=fieldText(value??'',160).trim();
  if(!rawValue)throw Object.assign(Error('Code-barres obligatoire.'),{status:400});
  const format=String(symbology||'unknown').trim().toLowerCase().replace(/-/g,'_')||'unknown';
  const privateFormat=['code_128','code_39','qr_code','data_matrix'].includes(format);
  const gtinFormat=['ean_8','ean_13','upc_a','itf','itf_14','gtin'].includes(format);
  const gtinShape=/^\d+$/.test(rawValue)&&[8,12,13,14].includes(rawValue.length);
  if(!privateFormat&&(gtinFormat||gtinShape)){
    if(!gtinShape||!stockBarcodeCheckDigitValid(rawValue)){
      if(format==='legacy')return{rawValue,normalizedKey:'raw:'+rawValue,symbology:format,identifierKind:'private',gtin14:null};
      throw Object.assign(Error('GTIN invalide : contrôle du chiffre de contrôle échoué.'),{status:400});
    }
    const gtin14=rawValue.padStart(14,'0');
    return{rawValue,normalizedKey:'gtin:'+gtin14,symbology:format,identifierKind:'gtin',gtin14};
  }
  return{rawValue,normalizedKey:'raw:'+rawValue,symbology:format,identifierKind:'private',gtin14:null};
}
async function stockBarcodeConflict(env,ctx,identity,itemId=''){
  const existing=await env.DB.prepare("SELECT id,stock_item_id FROM stock_item_barcodes WHERE organization_id=? AND normalized_key=? AND status='active' AND archived_at IS NULL LIMIT 1").bind(ctx.organizationId,identity.normalizedKey).first();
  if(existing&&String(existing.stock_item_id)!==String(itemId||''))throw Object.assign(Error('Ce code-barres identifie déjà un autre article de cette entreprise.'),{status:409});
  return existing||null;
}
async function stockBarcodeItemPayload(env,ctx,itemId,{terrain=false}={}){
  const row=await env.DB.prepare("SELECT i.id,i.name,i.reference,i.unit,i.quantity,i.minimum,i.unit_cost_cents,i.category_id,i.subcategory_id,c.name category_name,s.name subcategory_name FROM field_stock_items i LEFT JOIN stock_categories c ON c.organization_id=i.organization_id AND c.id=i.category_id LEFT JOIN stock_categories s ON s.organization_id=i.organization_id AND s.id=i.subcategory_id WHERE i.organization_id=? AND i.id=? AND i.archived_at IS NULL").bind(ctx.organizationId,String(itemId)).first();
  if(!row)return null;
  const balances=await rows(env.DB.prepare("SELECT b.quantity,l.id location_id,l.name location_name,l.type location_type FROM stock_balances b JOIN stock_locations l ON l.organization_id=b.organization_id AND l.id=b.location_id WHERE b.organization_id=? AND b.stock_item_id=? AND l.status='active' "+(terrain?"AND l.type='warehouse' ":"")+"ORDER BY l.name,l.id").bind(ctx.organizationId,String(itemId)));
  const item={id:String(row.id),name:row.name,reference:row.reference||'',unit:row.unit,quantity:Number(row.quantity||0),minimum:Number(row.minimum||0),category:{id:row.category_id||null,name:row.category_name||''},subcategory:{id:row.subcategory_id||null,name:row.subcategory_name||''},balances:balances.map(balance=>({quantity:Number(balance.quantity||0),location:{id:String(balance.location_id),name:balance.location_name,type:balance.location_type}}))};
  if(!terrain&&await stockCatalogCanFinancial(env,ctx))item.unitCost=Number(row.unit_cost_cents||0)/100;
  return item;
}
async function stockBarcodeLookupRoute(request,url,env,ctx,projectId=null){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const terrain=projectId!==null;
  if(terrain)await requireStockConsumeContext(env,ctx,String(projectId));
  else await requirePermission(env,ctx,'stock.view');
  const identity=stockBarcodeNormalize(String(url.searchParams.get('value')||''),String(url.searchParams.get('symbology')||'unknown'));
  const link=await env.DB.prepare("SELECT id,stock_item_id,raw_value,symbology,identifier_kind,gtin14,is_primary FROM stock_item_barcodes WHERE organization_id=? AND normalized_key=? AND status='active' AND archived_at IS NULL LIMIT 1").bind(ctx.organizationId,identity.normalizedKey).first();
  if(!link)return json({error:'Code-barres inconnu.'},404);
  const item=await stockBarcodeItemPayload(env,ctx,link.stock_item_id,{terrain});
  if(!item)return json({error:'Code-barres inconnu.'},404);
  return json({barcode:{id:link.id,rawValue:link.raw_value,symbology:link.symbology,identifierKind:link.identifier_kind,gtin14:link.gtin14||null,isPrimary:Boolean(link.is_primary)},item});
}
async function stockBarcodeManageRoute(request,env,ctx,itemId,barcodeId=null){
  await requirePermission(env,ctx,'stock.items.manage');
  const item=await env.DB.prepare("SELECT id,barcode FROM field_stock_items WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,String(itemId)).first();
  if(!item)return json({error:'Article de stock introuvable dans cette entreprise.'},404);
  if(request.method==='GET'&&!barcodeId){
    const list=await rows(env.DB.prepare("SELECT id,raw_value,normalized_key,symbology,identifier_kind,gtin14,is_primary,status,source,created_by,created_at,updated_by,updated_at,archived_at FROM stock_item_barcodes WHERE organization_id=? AND stock_item_id=? ORDER BY status='active' DESC,is_primary DESC,created_at,id").bind(ctx.organizationId,String(itemId)));
    return json({barcodes:list.map(row=>({id:row.id,rawValue:row.raw_value,normalizedKey:row.normalized_key,symbology:row.symbology,identifierKind:row.identifier_kind,gtin14:row.gtin14||null,isPrimary:Boolean(row.is_primary),status:row.status,source:row.source,createdBy:row.created_by,createdAt:row.created_at,updatedBy:row.updated_by,updatedAt:row.updated_at,archivedAt:row.archived_at||null}))});
  }
  if(request.method==='POST'&&!barcodeId){
    const data=exactObject(await body(request,30000),['value','symbology','isPrimary']),identity=stockBarcodeNormalize(data.value,data.symbology),existing=await stockBarcodeConflict(env,ctx,identity,String(itemId)),stamp=now(),requestedPrimary=data.isPrimary===true;
    if(existing){
      const current=await env.DB.prepare("SELECT id,is_primary FROM stock_item_barcodes WHERE organization_id=? AND id=? AND stock_item_id=?").bind(ctx.organizationId,existing.id,String(itemId)).first();
      if(requestedPrimary&&!current.is_primary)await dbBatch(env,[env.DB.prepare("UPDATE stock_item_barcodes SET is_primary=0,updated_by=?,updated_at=? WHERE organization_id=? AND stock_item_id=? AND status='active' AND archived_at IS NULL").bind(ctx.uid,stamp,ctx.organizationId,String(itemId)),env.DB.prepare("UPDATE stock_item_barcodes SET is_primary=1,updated_by=?,updated_at=? WHERE organization_id=? AND id=?").bind(ctx.uid,stamp,ctx.organizationId,existing.id),auditStatement(env,ctx,'stock_barcode.primary_changed','stock_item',String(itemId),{barcode_id:existing.id,normalized_key:identity.normalizedKey})]);
      return json({id:existing.id,replayed:true},200);
    }
    const inactive=await env.DB.prepare("SELECT id FROM stock_item_barcodes WHERE organization_id=? AND stock_item_id=? AND normalized_key=? AND status='inactive' ORDER BY updated_at DESC LIMIT 1").bind(ctx.organizationId,String(itemId),identity.normalizedKey).first();
    const primary=await env.DB.prepare("SELECT id FROM stock_item_barcodes WHERE organization_id=? AND stock_item_id=? AND status='active' AND archived_at IS NULL AND is_primary=1 LIMIT 1").bind(ctx.organizationId,String(itemId)).first(),makePrimary=requestedPrimary||!primary,barcodeNewId=inactive?.id||id('stock-barcode'),statements=[];
    if(makePrimary)statements.push(env.DB.prepare("UPDATE stock_item_barcodes SET is_primary=0,updated_by=?,updated_at=? WHERE organization_id=? AND stock_item_id=? AND status='active' AND archived_at IS NULL").bind(ctx.uid,stamp,ctx.organizationId,String(itemId)));
    if(inactive)statements.push(env.DB.prepare("UPDATE stock_item_barcodes SET raw_value=?,symbology=?,identifier_kind=?,gtin14=?,is_primary=?,status='active',source='manual',updated_by=?,updated_at=?,archived_at=NULL WHERE organization_id=? AND id=? AND stock_item_id=?").bind(identity.rawValue,identity.symbology,identity.identifierKind,identity.gtin14,makePrimary?1:0,ctx.uid,stamp,ctx.organizationId,barcodeNewId,String(itemId)));
    else statements.push(env.DB.prepare("INSERT INTO stock_item_barcodes(id,organization_id,stock_item_id,raw_value,normalized_key,symbology,identifier_kind,gtin14,is_primary,status,source,created_by,created_at,updated_by,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,?,'active','manual',?,?,?,?,NULL)").bind(barcodeNewId,ctx.organizationId,String(itemId),identity.rawValue,identity.normalizedKey,identity.symbology,identity.identifierKind,identity.gtin14,makePrimary?1:0,ctx.uid,stamp,ctx.uid,stamp));
    statements.push(auditStatement(env,ctx,inactive?'stock_barcode.reactivated':'stock_barcode.created','stock_item',String(itemId),{barcode_id:barcodeNewId,normalized_key:identity.normalizedKey,symbology:identity.symbology,is_primary:makePrimary}));
    await dbBatch(env,statements);return json({id:barcodeNewId,replayed:false,isPrimary:makePrimary},inactive?200:201);
  }
  if(request.method==='PATCH'&&barcodeId){
    const row=await env.DB.prepare("SELECT * FROM stock_item_barcodes WHERE organization_id=? AND stock_item_id=? AND id=?").bind(ctx.organizationId,String(itemId),String(barcodeId)).first();
    if(!row)return json({error:'Code-barres introuvable pour cet article.'},404);
    const data=exactObject(await body(request,20000),['status','isPrimary']),status=data.status===undefined?row.status:String(data.status),wantPrimary=data.isPrimary===undefined?Boolean(row.is_primary):data.isPrimary===true;
    if(!['active','inactive'].includes(status))return json({error:'Statut de code-barres invalide.'},400);
    if(status==='inactive'&&wantPrimary)return json({error:'Un code-barres inactif ne peut pas être principal.'},400);
    if(status==='active'){
      const conflict=await env.DB.prepare("SELECT id,stock_item_id FROM stock_item_barcodes WHERE organization_id=? AND normalized_key=? AND status='active' AND archived_at IS NULL AND id<>? LIMIT 1").bind(ctx.organizationId,row.normalized_key,String(barcodeId)).first();
      if(conflict&&String(conflict.stock_item_id)!==String(itemId))return json({error:'Ce code-barres identifie déjà un autre article de cette entreprise.'},409);
    }
    const stamp=now(),statements=[];
    if(status==='active'&&wantPrimary)statements.push(env.DB.prepare("UPDATE stock_item_barcodes SET is_primary=0,updated_by=?,updated_at=? WHERE organization_id=? AND stock_item_id=? AND id<>? AND status='active' AND archived_at IS NULL").bind(ctx.uid,stamp,ctx.organizationId,String(itemId),String(barcodeId)));
    statements.push(env.DB.prepare("UPDATE stock_item_barcodes SET status=?,is_primary=?,archived_at=?,updated_by=?,updated_at=? WHERE organization_id=? AND stock_item_id=? AND id=?").bind(status,status==='active'&&wantPrimary?1:0,status==='inactive'?stamp:null,ctx.uid,stamp,ctx.organizationId,String(itemId),String(barcodeId)));
    if(status==='inactive'&&row.is_primary){
      const replacement=await env.DB.prepare("SELECT id FROM stock_item_barcodes WHERE organization_id=? AND stock_item_id=? AND id<>? AND status='active' AND archived_at IS NULL ORDER BY created_at,id LIMIT 1").bind(ctx.organizationId,String(itemId),String(barcodeId)).first();
      if(replacement)statements.push(env.DB.prepare("UPDATE stock_item_barcodes SET is_primary=1,updated_by=?,updated_at=? WHERE organization_id=? AND id=?").bind(ctx.uid,stamp,ctx.organizationId,replacement.id));
    }
    statements.push(auditStatement(env,ctx,'stock_barcode.updated','stock_item',String(itemId),{barcode_id:String(barcodeId),status,is_primary:status==='active'&&wantPrimary},{status:row.status,is_primary:Boolean(row.is_primary)}));
    await dbBatch(env,statements);return json({id:String(barcodeId),status});
  }
  return json({error:'Méthode non autorisée.'},405);
}

async function stockCatalogCanFinancial(env,ctx){
  return ctx.roleCode==='OWNER'||await profitabilityReadable(env,ctx)||await allowed(env,ctx,'accounting.view');
}
async function stockCatalogSelection(env,ctx,categoryId,subcategoryId){
  const category=categoryId?String(categoryId):null,subcategory=subcategoryId?String(subcategoryId):null;
  if(!category&&subcategory)throw Object.assign(Error('Choisissez d’abord une catégorie.'),{status:400});
  if(!category)return{categoryId:null,subcategoryId:null};
  const parent=await env.DB.prepare('SELECT id,parent_id,status FROM stock_categories WHERE organization_id=? AND id=?').bind(ctx.organizationId,category).first();
  if(!parent||parent.parent_id!==null)throw Object.assign(Error('Catégorie de stock introuvable dans cette entreprise.'),{status:404});
  if(subcategory){
    const child=await env.DB.prepare('SELECT id,parent_id,status FROM stock_categories WHERE organization_id=? AND id=?').bind(ctx.organizationId,subcategory).first();
    if(!child||String(child.parent_id)!==category)throw Object.assign(Error('Sous-catégorie de stock introuvable dans cette entreprise.'),{status:404});
  }
  return{categoryId:category,subcategoryId:subcategory};
}
async function stockCatalogRoute(request,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'stock.view');
  const categories=await rows(env.DB.prepare('SELECT id,parent_id,name,status,sort_order FROM stock_categories WHERE organization_id=? ORDER BY parent_id IS NOT NULL,parent_id,sort_order,name').bind(ctx.organizationId));
  const metadata=await rows(env.DB.prepare('SELECT id,category_id,subcategory_id,supplier_reference,barcode,aliases_json FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL ORDER BY name,id').bind(ctx.organizationId));
  const manageItems=ctx.roleCode==='OWNER'||await allowed(env,ctx,'stock.items.manage');
  const manageCategories=ctx.roleCode==='OWNER'||await allowed(env,ctx,'stock.categories.manage');
  const manageLocations=ctx.roleCode==='OWNER'||await allowed(env,ctx,'stock.locations.manage');
  const moveStock=ctx.roleCode==='OWNER'||await allowed(env,ctx,'stock.move');
  const viewCosts=await stockCatalogCanFinancial(env,ctx);
  return json({
    organizationId:ctx.organizationId,
    categories:categories.map(row=>({id:row.id,parentId:row.parent_id||null,name:row.name,status:row.status,sortOrder:Number(row.sort_order||0)})),
    items:metadata.map(row=>({id:row.id,categoryId:row.category_id||null,subcategoryId:row.subcategory_id||null,supplierReference:row.supplier_reference||'',barcode:row.barcode||'',aliases:parseJson(row.aliases_json||'[]',[])})),
    capabilities:{manageItems,manageCategories,manageLocations,moveStock,viewCosts}
  });
}
async function stockCategoryRoute(request,env,ctx,categoryId=null){
  await requirePermission(env,ctx,'stock.categories.manage');
  const duplicate=async(parentId,key,excludeId='')=>{
    if(parentId)return env.DB.prepare('SELECT id FROM stock_categories WHERE organization_id=? AND parent_id=? AND normalized_name=? AND id<>? LIMIT 1').bind(ctx.organizationId,parentId,key,excludeId).first();
    return env.DB.prepare('SELECT id FROM stock_categories WHERE organization_id=? AND parent_id IS NULL AND normalized_name=? AND id<>? LIMIT 1').bind(ctx.organizationId,key,excludeId).first();
  };
  if(request.method==='POST'&&!categoryId){
    const data=exactObject(await body(request,30000),['name','parentId','sortOrder']),name=fieldText(data.name||'',120),key=stockCatalogNormalize(name),parentId=data.parentId?String(data.parentId):null,sortOrder=Number(data.sortOrder??0);
    if(!name||!key||!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>9999)return json({error:'Catégorie de stock invalide.'},400);
    if(parentId){
      const parent=await env.DB.prepare('SELECT id,parent_id,status FROM stock_categories WHERE organization_id=? AND id=?').bind(ctx.organizationId,parentId).first();
      if(!parent||parent.parent_id!==null)return json({error:'Catégorie parente introuvable.'},404);
      if(parent.status!=='active')return json({error:'Réactivez la catégorie parente avant d’ajouter une sous-catégorie.'},409);
    }
    if(await duplicate(parentId,key))return json({error:'Une catégorie de ce nom existe déjà à ce niveau.'},409);
    const newId=id('stock-category'),stamp=now();
    try{await dbBatch(env,[env.DB.prepare('INSERT INTO stock_categories(id,organization_id,parent_id,name,normalized_name,status,sort_order,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(newId,ctx.organizationId,parentId,name,key,'active',sortOrder,ctx.uid,stamp,ctx.uid,stamp),auditStatement(env,ctx,'stock_category.created','stock_category',newId,{name,parent_id:parentId,sort_order:sortOrder})]);}
    catch(error){if(String(error?.message||'').includes('UNIQUE'))return json({error:'Une catégorie de ce nom existe déjà à ce niveau.'},409);throw error}
    return json({id:newId},201);
  }
  if(request.method==='PATCH'&&categoryId){
    const row=await env.DB.prepare('SELECT * FROM stock_categories WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(categoryId)).first();
    if(!row)return json({error:'Catégorie de stock introuvable.'},404);
    const data=exactObject(await body(request,30000),['name','status','sortOrder']),name=fieldText(data.name??row.name,120),key=stockCatalogNormalize(name),status=String(data.status??row.status),sortOrder=Number(data.sortOrder??row.sort_order);
    if(!name||!key||!['active','inactive'].includes(status)||!Number.isInteger(sortOrder)||sortOrder<0||sortOrder>9999)return json({error:'Catégorie de stock invalide.'},400);
    if(status==='active'&&row.parent_id){
      const parent=await env.DB.prepare('SELECT status FROM stock_categories WHERE organization_id=? AND id=? AND parent_id IS NULL').bind(ctx.organizationId,String(row.parent_id)).first();
      if(!parent)return json({error:'Catégorie parente introuvable.'},404);
      if(parent.status!=='active')return json({error:'Réactivez la catégorie parente avant cette sous-catégorie.'},409);
    }
    if(status==='inactive'&&!row.parent_id){
      const activeChild=await env.DB.prepare("SELECT 1 ok FROM stock_categories WHERE organization_id=? AND parent_id=? AND status='active' LIMIT 1").bind(ctx.organizationId,String(categoryId)).first();
      if(activeChild)return json({error:'Désactivez d’abord les sous-catégories actives.'},409);
    }
    if(await duplicate(row.parent_id||null,key,String(categoryId)))return json({error:'Une catégorie de ce nom existe déjà à ce niveau.'},409);
    const stamp=now();
    try{await dbBatch(env,[env.DB.prepare('UPDATE stock_categories SET name=?,normalized_name=?,status=?,sort_order=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(name,key,status,sortOrder,ctx.uid,stamp,ctx.organizationId,String(categoryId)),auditStatement(env,ctx,'stock_category.updated','stock_category',String(categoryId),{name,status,sort_order:sortOrder},{name:row.name,status:row.status,sort_order:Number(row.sort_order||0)})]);}
    catch(error){if(String(error?.message||'').includes('UNIQUE'))return json({error:'Une catégorie de ce nom existe déjà à ce niveau.'},409);throw error}
    return json({id:String(categoryId)});
  }
  return json({error:'Méthode non autorisée.'},405);
}

async function stockLocationRoutes(request,env,ctx,locationId=null){
  if(request.method==='GET'&&!locationId){await requirePermission(env,ctx,'stock.view');return json({locations:await rows(env.DB.prepare("SELECT id,name,type,status,created_by,created_at,updated_by,updated_at FROM stock_locations WHERE organization_id=? ORDER BY status='active' DESC,name").bind(ctx.organizationId))})}
  if(request.method==='POST'&&!locationId){await requirePermission(env,ctx,'stock.locations.manage');const data=await body(request,30000),name=fieldText(data.name||'',160),type=String(data.type||'internal');if(!name||!['warehouse','vehicle','project','internal'].includes(type))return json({error:'Emplacement de stock invalide.'},400);const newId=id('stock-location'),stamp=now();try{await dbBatch(env,[env.DB.prepare('INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(newId,ctx.organizationId,name,type,'active',ctx.uid,stamp,ctx.uid,stamp),auditStatement(env,ctx,'stock_location.created','stock_location',newId,{name,type,status:'active'})])}catch(error){if(String(error?.message||'').includes('UNIQUE'))return json({error:'Un emplacement de ce nom existe déjà.'},409);throw error}return json({id:newId},201)}
  if(request.method==='PATCH'&&locationId){await requirePermission(env,ctx,'stock.locations.manage');const row=await stockLocation(env,ctx,locationId,{active:false}),data=await body(request,30000),name=fieldText(data.name??row.name,160),type=String(data.type??row.type),status=String(data.status??row.status);if(!name||!['warehouse','vehicle','project','internal','legacy','unknown'].includes(type)||!['active','inactive'].includes(status))return json({error:'Emplacement de stock invalide.'},400);if(status==='inactive'){const balance=await env.DB.prepare('SELECT COALESCE(SUM(quantity),0) quantity FROM stock_balances WHERE organization_id=? AND location_id=?').bind(ctx.organizationId,String(locationId)).first();if(Number(balance?.quantity||0)>0)return json({error:'Impossible de désactiver un emplacement contenant encore du stock.'},409)}const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE stock_locations SET name=?,type=?,status=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(name,type,status,ctx.uid,stamp,ctx.organizationId,String(locationId)),auditStatement(env,ctx,'stock_location.updated','stock_location',String(locationId),{name,type,status},{name:row.name,type:row.type,status:row.status})]);return json({id:String(locationId)})}
  return json({error:'Méthode non autorisée.'},405)
}
async function stockItemRoute(request,env,ctx,itemId=null){
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({error:'Espace entreprise introuvable.'},404);
  await ensureLegacyFieldDataImported(env,ctx,state);
  if(request.method==='POST'&&!itemId){
    await requirePermission(env,ctx,'stock.items.manage');
    const data=await body(request,60000),name=fieldText(data.name||'',160),reference=fieldText(data.reference||'',100),quantity=fieldNumber(data.quantity||0,{min:0,max:1e12}),unit=fieldText(data.unit||'unité',60),minimum=fieldNumber(data.minimum||0,{min:0,max:1e12}),locationId=data.locationId?String(data.locationId):null,supplier=fieldText(data.supplier||'',160),supplierReference=fieldText(data.supplierReference||'',160),barcode=fieldText(data.barcode||'',80),barcodeIdentity=barcode?stockBarcodeNormalize(barcode,'legacy'):null,aliases=stockCatalogAliases(data.aliases),selection=await stockCatalogSelection(env,ctx,data.categoryId?String(data.categoryId):null,data.subcategoryId?String(data.subcategoryId):null),canFinancial=await stockCatalogCanFinancial(env,ctx);
    if(!name)return json({error:'Désignation de stock obligatoire.'},400);if(barcodeIdentity)await stockBarcodeConflict(env,ctx,barcodeIdentity);
    if(data.unitCost!==undefined&&!canFinancial)return json({error:'Vous ne pouvez pas modifier le coût unitaire.'},403);
    const unitCost=canFinancial?cents(data.unitCost||0):0;
    if(quantity>0&&!locationId)return json({error:'Un emplacement est obligatoire pour le stock initial.'},400);
    if(locationId)await stockLocation(env,ctx,locationId);
    const newId=id('stock'),stamp=now(),statements=[env.DB.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at,category_id,subcategory_id,supplier_reference,barcode,aliases_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(newId,ctx.organizationId,reference,name,0,0,unit,unitCost,minimum,supplier,'',ctx.uid,stamp,ctx.uid,stamp,selection.categoryId,selection.subcategoryId,supplierReference,barcodeIdentity?barcodeIdentity.rawValue:'',JSON.stringify(aliases)),auditStatement(env,ctx,'stock_item.created','stock_item',newId,{name,reference,quantity,unit,minimum,location_id:locationId,category_id:selection.categoryId,subcategory_id:selection.subcategoryId,supplier_reference:supplierReference,barcode:barcodeIdentity?barcodeIdentity.rawValue:'',aliases})];
    if(barcodeIdentity){const barcodeId=id('stock-barcode');statements.push(env.DB.prepare("INSERT INTO stock_item_barcodes(id,organization_id,stock_item_id,raw_value,normalized_key,symbology,identifier_kind,gtin14,is_primary,status,source,created_by,created_at,updated_by,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,1,'active','catalog',?,?,?,?,NULL)").bind(barcodeId,ctx.organizationId,newId,barcodeIdentity.rawValue,barcodeIdentity.normalizedKey,barcodeIdentity.symbology,barcodeIdentity.identifierKind,barcodeIdentity.gtin14,ctx.uid,stamp,ctx.uid,stamp),auditStatement(env,ctx,'stock_barcode.created','stock_item',newId,{barcode_id:barcodeId,normalized_key:barcodeIdentity.normalizedKey,is_primary:true,source:'catalog'}))}
    if(quantity>0){const movementId=id('stock-movement'),key=operationKey(data);statements.push(env.DB.prepare('INSERT INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,origin,destination,project_id,reason,unit_cost_cents,created_by,created_at,source_location_id,destination_location_id,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(movementId,ctx.organizationId,newId,stamp.slice(0,10),'entrée',quantity,'','',null,'Stock initial',unitCost,ctx.uid,stamp,null,locationId,'stock-initial',key),auditStatement(env,ctx,'stock_movement.created','stock_movement',movementId,{stock_item_id:newId,type:'entrée',quantity,destination_location_id:locationId}))}
    await dbBatch(env,statements);return json({id:newId},201);
  }
  if(request.method==='PATCH'&&itemId){
    await requirePermission(env,ctx,'stock.items.manage');
    const row=await env.DB.prepare('SELECT * FROM field_stock_items WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(itemId)).first();
    if(!row)return json({error:'Article de stock introuvable dans cette entreprise.'},404);
    const data=await body(request,60000);if(data.quantity!==undefined&&Math.abs(Number(data.quantity)-Number(row.quantity))>1e-9)return json({error:'La quantité se modifie uniquement par un mouvement de stock.'},400);
    const name=fieldText(data.name??row.name,160),reference=fieldText(data.reference??row.reference,100),unit=fieldText(data.unit??row.unit,60),minimum=fieldNumber(data.minimum??row.minimum,{min:0,max:1e12}),supplier=fieldText(data.supplier??row.supplier,160),supplierReference=fieldText(data.supplierReference??row.supplier_reference,160),barcodeProvided=data.barcode!==undefined,barcode=fieldText(data.barcode??row.barcode,80),barcodeIdentity=barcodeProvided&&barcode?stockBarcodeNormalize(barcode,'legacy'):null,aliases=data.aliases===undefined?parseJson(row.aliases_json||'[]',[]):stockCatalogAliases(data.aliases),categoryId=data.categoryId===undefined?(row.category_id||null):(data.categoryId?String(data.categoryId):null),subcategoryId=data.subcategoryId===undefined?(row.subcategory_id||null):(data.subcategoryId?String(data.subcategoryId):null),selection=await stockCatalogSelection(env,ctx,categoryId,subcategoryId),canFinancial=await stockCatalogCanFinancial(env,ctx);
    if(!name)return json({error:'Désignation de stock obligatoire.'},400);if(barcodeIdentity)await stockBarcodeConflict(env,ctx,barcodeIdentity,String(itemId));
    if(data.unitCost!==undefined&&!canFinancial)return json({error:'Vous ne pouvez pas modifier le coût unitaire.'},403);
    const unitCost=data.unitCost===undefined?Number(row.unit_cost_cents||0):cents(data.unitCost),stamp=now(),statements=[env.DB.prepare('UPDATE field_stock_items SET reference=?,name=?,unit=?,unit_cost_cents=?,minimum=?,supplier=?,category_id=?,subcategory_id=?,supplier_reference=?,barcode=?,aliases_json=?,updated_by=?,updated_at=? WHERE organization_id=? AND id=?').bind(reference,name,unit,unitCost,minimum,supplier,selection.categoryId,selection.subcategoryId,supplierReference,barcodeProvided?(barcodeIdentity?barcodeIdentity.rawValue:''):row.barcode,JSON.stringify(aliases),ctx.uid,stamp,ctx.organizationId,String(itemId)),auditStatement(env,ctx,'stock_item.updated','stock_item',String(itemId),{name,reference,unit,minimum,category_id:selection.categoryId,subcategory_id:selection.subcategoryId,supplier_reference:supplierReference,barcode:barcodeProvided?(barcodeIdentity?barcodeIdentity.rawValue:''):row.barcode,aliases},{name:row.name,reference:row.reference||'',unit:row.unit,minimum:Number(row.minimum||0),category_id:row.category_id||null,subcategory_id:row.subcategory_id||null,supplier_reference:row.supplier_reference||'',barcode:row.barcode||'',aliases:parseJson(row.aliases_json||'[]',[])})];
    if(barcodeProvided){
      statements.push(env.DB.prepare("UPDATE stock_item_barcodes SET is_primary=0,updated_by=?,updated_at=? WHERE organization_id=? AND stock_item_id=? AND status='active' AND archived_at IS NULL AND is_primary=1").bind(ctx.uid,stamp,ctx.organizationId,String(itemId)));
      if(barcodeIdentity){
        const existingBarcode=await env.DB.prepare("SELECT id FROM stock_item_barcodes WHERE organization_id=? AND stock_item_id=? AND normalized_key=? ORDER BY status='active' DESC,updated_at DESC LIMIT 1").bind(ctx.organizationId,String(itemId),barcodeIdentity.normalizedKey).first(),barcodeId=existingBarcode?.id||id('stock-barcode');
        if(existingBarcode)statements.push(env.DB.prepare("UPDATE stock_item_barcodes SET raw_value=?,symbology=?,identifier_kind=?,gtin14=?,is_primary=1,status='active',source='catalog',archived_at=NULL,updated_by=?,updated_at=? WHERE organization_id=? AND id=?").bind(barcodeIdentity.rawValue,barcodeIdentity.symbology,barcodeIdentity.identifierKind,barcodeIdentity.gtin14,ctx.uid,stamp,ctx.organizationId,barcodeId));
        else statements.push(env.DB.prepare("INSERT INTO stock_item_barcodes(id,organization_id,stock_item_id,raw_value,normalized_key,symbology,identifier_kind,gtin14,is_primary,status,source,created_by,created_at,updated_by,updated_at,archived_at) VALUES(?,?,?,?,?,?,?,?,1,'active','catalog',?,?,?,?,NULL)").bind(barcodeId,ctx.organizationId,String(itemId),barcodeIdentity.rawValue,barcodeIdentity.normalizedKey,barcodeIdentity.symbology,barcodeIdentity.identifierKind,barcodeIdentity.gtin14,ctx.uid,stamp,ctx.uid,stamp));
        statements.push(auditStatement(env,ctx,'stock_barcode.primary_changed','stock_item',String(itemId),{barcode_id:barcodeId,normalized_key:barcodeIdentity.normalizedKey,source:'catalog'}));
      }else statements.push(auditStatement(env,ctx,'stock_barcode.primary_cleared','stock_item',String(itemId),{}));
    }
    await dbBatch(env,statements);
    return json({id:String(itemId)});
  }
  return json({error:'Méthode non autorisée.'},405);
}
function stockMovementReplayMatches(row,input){
  return String(row.stock_item_id)===String(input.itemId)
    && row.movement_date===input.date
    && row.movement_type===input.type
    && Number(row.quantity)===Number(input.quantity)
    && String(row.project_id||'')===String(input.projectId||'')
    && String(row.reason||'')===String(input.reason||'')
    && String(row.reference||'')===String(input.reference||'')
    && String(row.source_location_id||'')===String(input.sourceId||'')
    && String(row.destination_location_id||'')===String(input.destinationId||'');
}
async function executeStockMovement(env,ctx,input){
  const state=input.state||await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state)throw Object.assign(Error('Espace entreprise introuvable.'),{status:404});
  await ensureLegacyFieldDataImported(env,ctx,state);
  const itemId=String(input.itemId||''),item=await env.DB.prepare('SELECT * FROM field_stock_items WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,itemId).first();
  if(!item)throw Object.assign(Error('Référence de stock introuvable dans cette entreprise.'),{status:404});
  const type=String(input.type||''),quantity=fieldNumber(input.quantity,{min:0.001,max:1e12}),date=String(input.date||''),projectId=input.projectId?String(input.projectId):null,reason=fieldText(input.reason||'',500),reference=fieldText(input.reference||'',160),key=operationKey(input),sourceId=input.sourceLocationId?String(input.sourceLocationId):null,destinationId=input.destinationLocationId?String(input.destinationLocationId):null,allowedTypes=['entrée','sortie chantier','transfert','retour chantier','perte','casse','ajustement positif','ajustement négatif'];
  if(!allowedTypes.includes(type)||!validIsoDate(date)||!reason)throw Object.assign(Error('Mouvement de stock invalide.'),{status:400});
  if(sourceId)await stockLocation(env,ctx,sourceId);
  if(destinationId)await stockLocation(env,ctx,destinationId);
  if(type==='entrée'&&!destinationId||['sortie chantier','perte','casse','ajustement négatif'].includes(type)&&!sourceId||type==='transfert'&&(!sourceId||!destinationId)||type==='retour chantier'&&(!sourceId||!destinationId))throw Object.assign(Error('Emplacement source ou destination manquant pour ce mouvement.'),{status:400});
  if(sourceId&&destinationId&&sourceId===destinationId)throw Object.assign(Error('La source et la destination doivent être différentes.'),{status:400});
  if(projectId){if(!workspaceProject(state,projectId))throw Object.assign(Error('Chantier introuvable dans cette entreprise.'),{status:404});await requireProjectScope(env,ctx,projectId)}
  if(['sortie chantier','retour chantier'].includes(type)&&!projectId)throw Object.assign(Error('Ce mouvement doit viser un chantier autorisé.'),{status:400});
  const replay=await env.DB.prepare('SELECT id,stock_item_id,movement_date,movement_type,quantity,project_id,reason,reference,source_location_id,destination_location_id FROM field_stock_movements WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();
  if(replay){
    if(!stockMovementReplayMatches(replay,{itemId,date,type,quantity,projectId,reason,reference,sourceId,destinationId}))throw Object.assign(Error('Cette clé d’opération a déjà été utilisée avec un mouvement différent.'),{status:409});
    const total=await env.DB.prepare('SELECT quantity FROM field_stock_items WHERE organization_id=? AND id=?').bind(ctx.organizationId,itemId).first();
    return{status:200,id:replay.id,replayed:true,quantity:Number(total?.quantity||0),date};
  }
  const movementId=id('stock-movement'),stamp=now(),movement=env.DB.prepare('INSERT INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,origin,destination,project_id,reason,unit_cost_cents,created_by,created_at,source_location_id,destination_location_id,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(movementId,ctx.organizationId,itemId,date,type,quantity,'','',projectId,reason,Number(item.unit_cost_cents||0),ctx.uid,stamp,sourceId,destinationId,reference,key);
  try{
    await dbBatch(env,[movement,auditStatement(env,ctx,'stock_movement.created','stock_movement',movementId,{stock_item_id:itemId,type,quantity,source_location_id:sourceId,destination_location_id:destinationId,project_id:projectId,reference})]);
  }catch(error){
    const message=String(error?.message||'');
    if(message.includes('stock_insufficient'))throw Object.assign(Error('Stock insuffisant dans l’emplacement source.'),{status:409});
    if(message.includes('idempotency')||message.includes('UNIQUE')){
      const existing=await env.DB.prepare('SELECT id,stock_item_id,movement_date,movement_type,quantity,project_id,reason,reference,source_location_id,destination_location_id FROM field_stock_movements WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();
      if(existing){
        if(!stockMovementReplayMatches(existing,{itemId,date,type,quantity,projectId,reason,reference,sourceId,destinationId}))throw Object.assign(Error('Cette clé d’opération a déjà été utilisée avec un mouvement différent.'),{status:409});
        const total=await env.DB.prepare('SELECT quantity FROM field_stock_items WHERE organization_id=? AND id=?').bind(ctx.organizationId,itemId).first();
        return{status:200,id:existing.id,replayed:true,quantity:Number(total?.quantity||0),date};
      }
    }
    if(message.includes('stock_'))throw Object.assign(Error('Mouvement de stock refusé par les contrôles de cohérence.'),{status:409});
    throw error;
  }
  const total=await env.DB.prepare('SELECT quantity FROM field_stock_items WHERE organization_id=? AND id=?').bind(ctx.organizationId,itemId).first();
  return{status:201,id:movementId,replayed:false,quantity:Number(total?.quantity||0),date};
}

async function stockMovementRoute(request,env,ctx,itemId){
  if(request.method==='GET'){
    await requirePermission(env,ctx,'stock.view');
    const item=await env.DB.prepare('SELECT id FROM field_stock_items WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(itemId)).first();
    if(!item)return json({error:'Référence de stock introuvable dans cette entreprise.'},404);
    return json({movements:await rows(env.DB.prepare('SELECT id,movement_date,movement_type,quantity,source_location_id,destination_location_id,project_id,reference,reason,unit_cost_cents,created_by,created_at FROM field_stock_movements WHERE organization_id=? AND stock_item_id=? ORDER BY created_at DESC').bind(ctx.organizationId,String(itemId)))});
  }
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'stock.move');
  const data=await body(request,40000),result=await executeStockMovement(env,ctx,{itemId,type:data.type,quantity:data.quantity,date:data.date,projectId:data.projectId,reason:data.reason,reference:data.reference,operationKey:data.operationKey,sourceLocationId:data.sourceLocationId,destinationLocationId:data.destinationLocationId});
  return json(result.replayed?{id:result.id,replayed:true}:{id:result.id,quantity:result.quantity},result.status);
}

async function requireStockConsumeContext(env,ctx,projectId,stateOverride=null,dateOverride=null){
  await requirePermission(env,ctx,'stock.consume.assigned');
  const state=stateOverride||await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(!state||!workspaceProject(state,projectId))throw Object.assign(Error('Chantier introuvable dans cette entreprise.'),{status:404});
  await ensureLegacyFieldDataImported(env,ctx,state);
  const date=dateOverride||socleBusinessDate(state);
  if(ctx.roleCode==='OWNER')return{state,date,personId:await currentPersonId(env,ctx)};
  await requireProjectScope(env,ctx,projectId);
  const personId=await currentPersonId(env,ctx);
  if(!personId)throw Object.assign(Error('Personne liée requise pour prendre du stock.'),{status:403});
  const assignmentRows=await rows(env.DB.prepare("SELECT id,team_id,people_json,status FROM field_assignments WHERE organization_id=? AND project_id=? AND assignment_date=? AND status<>'cancelled' ORDER BY created_at,id").bind(ctx.organizationId,String(projectId),date));
  const ownAssignments=assignmentRows.filter(row=>parseJson(row.people_json||'[]',[]).map(String).includes(String(personId)));
  let assigned=ownAssignments.length>0;
  if(ctx.roleCode==='TEAM_LEAD'){
    const teamIds=await planningScopedTeamIds(env,ctx,state,date,date,assignmentRows,String(personId),'team');
    assigned=ownAssignments.some(row=>teamIds.has(String(row.team_id||'')));
  }
  if(!assigned)throw Object.assign(Error('Aucune affectation active du jour ne vous autorise à prendre du stock pour ce chantier.'),{status:403});
  return{state,date,personId};
}
async function canStockConsumeProject(env,ctx,projectId,state,date){
  try{await requireStockConsumeContext(env,ctx,projectId,state,date);return true}catch(error){if(error?.status===403||error?.status===404)return false;throw error}
}
async function stockConsumeRoute(request,url,env,ctx,projectId,optionsOnly=false){
  const consume=await requireStockConsumeContext(env,ctx,String(projectId));
  await ensureLegacyFieldDataImported(env,ctx,consume.state);
  if(optionsOnly){
    if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
    const query=String(url.searchParams.get('q')||'').trim();
    if(query.length>120)return json({error:'Recherche trop longue.'},400);
    const optionRows=await rows(env.DB.prepare("SELECT i.id stock_item_id,i.name,i.reference,i.unit,b.quantity available,l.id location_id,l.name location_name,l.type location_type FROM field_stock_items i JOIN stock_balances b ON b.organization_id=i.organization_id AND b.stock_item_id=i.id JOIN stock_locations l ON l.organization_id=b.organization_id AND l.id=b.location_id WHERE i.organization_id=? AND i.archived_at IS NULL AND l.status='active' AND l.type='warehouse' AND (?='' OR instr(lower(i.name),lower(?))>0 OR instr(lower(COALESCE(i.reference,'')),lower(?))>0) ORDER BY i.name,i.reference,l.name LIMIT 50").bind(ctx.organizationId,query,query,query));
    return json({date:consume.date,projectId:String(projectId),options:optionRows.map(row=>({id:String(row.stock_item_id),name:row.name,reference:row.reference||'',unit:row.unit,available:Number(row.available||0),location:{id:String(row.location_id),name:row.location_name,type:row.location_type}}))});
  }
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  const data=exactObject(await body(request,30000),['stockItemId','sourceLocationId','quantity','note','operationKey']),sourceLocationId=String(data.sourceLocationId||''),stockItemId=String(data.stockItemId||''),note=fieldText(data.note||'',500);
  if(!stockItemId||!sourceLocationId)return json({error:'Article et entrepôt requis.'},400);
  const source=await stockLocation(env,ctx,sourceLocationId);
  if(source.type!=='warehouse')return json({error:'Ce flux terrain accepte uniquement un entrepôt actif.'},400);
  const result=await executeStockMovement(env,ctx,{state:consume.state,itemId:stockItemId,type:'sortie chantier',quantity:data.quantity,date:consume.date,projectId:String(projectId),reason:note||'Prise de stock terrain',reference:'TERRAIN',operationKey:data.operationKey,sourceLocationId,destinationLocationId:null});
  return json({id:result.id,stockItemId,sourceLocationId,quantity:Number(data.quantity),date:consume.date,replayed:result.replayed},result.status);
}

function purchaseOrderFingerprint(order){return JSON.stringify({number:String(order.number||''),supplierId:String(order.supplierId||''),date:String(order.date||''),expectedDate:String(order.expectedDate||''),job:String(order.job||0),requester:String(order.requester||''),status:String(order.status||''),lines:(order.lines||[]).map(line=>({reference:String(line.reference||''),label:String(line.label||''),quantity:Number(line.quantity||0),unit:String(line.unit||''),unitPrice:Number(line.unitPrice||0),vatRate:Number(line.vatRate||0)}))})}
async function purchaseOrderRoutes(request,env,ctx){
  const row=await organizationWorkspaceRow(env,ctx.organizationId,{readOnly:ctx.preview});if(!row)return json({error:'Espace entreprise introuvable.'},404);
  const state=JSON.parse(row.payload),orders=Array.isArray(state.purchaseOrders)?state.purchaseOrders:[];
  if(request.method==='GET'){
    await requirePermission(env,ctx,'purchase_orders.view');
    const tenantFinanceScope=await hasTenantFinanceScope(env,ctx),visible=[];for(const order of orders){const projectId=order.job&&Number(order.job)!==0?String(order.job):null;if(!projectId||tenantFinanceScope||await hasProjectScope(env,ctx,projectId))visible.push(order)}
    return json({orders:visible});
  }
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'purchase_orders.manage');
  const data=exactObject(await body(request,100000),['number','supplierId','date','expectedDate','projectId','requester','status','lines','operationKey']),key=operationKey(data),number=fieldText(data.number||'',120),supplierId=String(data.supplierId||''),date=String(data.date||''),expectedDate=String(data.expectedDate||''),projectId=data.projectId&&String(data.projectId)!=='0'?String(data.projectId):null,requester=fieldText(data.requester||'',160),status=String(data.status||'commandée');
  if(!number||!supplierId||!validIsoDate(date)||(expectedDate&&!validIsoDate(expectedDate))||(expectedDate&&expectedDate<date)||!requester||!['brouillon','commandée'].includes(status))return json({error:'Commande fournisseur invalide.'},400);
  const supplier=(state.contacts||[]).find(contact=>String(contact.id)===supplierId&&(contact.roles||[]).some(role=>['Fournisseur','Sous-traitant'].includes(role)));if(!supplier)return json({error:'Fournisseur introuvable dans cette entreprise.'},404);
  if(projectId){if(!workspaceProject(state,projectId))return json({error:'Chantier introuvable dans cette entreprise.'},404);await requireProjectScope(env,ctx,projectId)}
  const inputLines=Array.isArray(data.lines)?data.lines:[],lines=[];for(const input of inputLines){const reference=fieldText(input?.reference||'',120),label=fieldText(input?.label||'',240),quantity=fieldNumber(input?.quantity,{min:0.001,max:1e9}),unit=fieldText(input?.unit||'unité',60),unitPrice=Number(input?.unitPrice),vatRate=Number(input?.vatRate);if(!label||!Number.isFinite(unitPrice)||unitPrice<0||![0,6,12,21].includes(vatRate))return json({error:'Une ligne de commande est invalide.'},400);const unitPriceCents=Math.round(unitPrice*100),netCents=Math.round(quantity*unitPriceCents),vatCents=Math.round(netCents*vatRate/100);lines.push({id:id('purchase-line'),reference,label,quantity,received:0,unit,unitPrice:unitPriceCents/100,unitPriceCents,vatRate,netCents,vatCents,totalCents:netCents+vatCents})}
  if(!lines.length)return json({error:'Ajoutez au moins une ligne à la commande.'},400);
  const candidate={number,supplierId,date,expectedDate,job:projectId?legacyPersonValue(projectId):0,requester,status,lines,operationKey:key};
  const replay=orders.find(order=>String(order.operationKey||'')===key||String(order.number||'')===number);
  if(replay){if(purchaseOrderFingerprint(replay)!==purchaseOrderFingerprint(candidate))return json({error:'Cette commande existe déjà avec des données différentes.'},409);return json({order:replay,replayed:true},200)}
  const netCents=lines.reduce((sum,line)=>sum+Number(line.netCents||0),0),vatCents=lines.reduce((sum,line)=>sum+Number(line.vatCents||0),0),totalCents=netCents+vatCents,order={id:id('purchase-order'),...candidate,netCents,vatCents,totalCents,netAmount:netCents/100,vatAmount:vatCents/100,totalAmount:totalCents/100,createdAt:now(),externalTransmission:'Bloquée — simulation'};
  state.purchaseOrders=[...orders,order];
  const stamp=now(),result=await env.DB.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,source_user_id=?,updated_at=? WHERE organization_id=? AND revision=?').bind(JSON.stringify(state),ctx.uid,stamp,ctx.organizationId,row.revision).run();
  if(!result.meta.changes)return json({error:'Le dossier a changé pendant la création de la commande. Rechargez puis réessayez.'},409);
  await audit(env,ctx,'purchase_order.created','purchase_order',String(order.id),{number:order.number,supplier_id:supplierId,project_id:projectId,net_cents:order.netCents,vat_cents:order.vatCents,total_cents:order.totalCents,operation_key:key});
  return json({order},201);
}
function legacyPurchaseOrder(state,orderId){return (state?.purchaseOrders||[]).find(order=>String(order.id)===String(orderId))||null}
async function purchaseOrderCancelRoute(request,env,ctx,orderId){
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'purchase_orders.manage');
  const row=await organizationWorkspaceRow(env,ctx.organizationId,{readOnly:ctx.preview});if(!row)return json({error:'Espace entreprise introuvable.'},404);
  const state=JSON.parse(row.payload),orders=Array.isArray(state.purchaseOrders)?state.purchaseOrders:[],index=orders.findIndex(order=>String(order.id)===String(orderId));
  if(index<0)return json({error:'Commande fournisseur introuvable dans cette entreprise.'},404);
  const order=orders[index],projectId=order.job&&Number(order.job)!==0?String(order.job):null;if(projectId)await requireProjectScope(env,ctx,projectId);
  const data=exactObject(await body(request,30000),['reason']),reason=fieldText(data.reason||'',300);if(!reason)return json({error:'Motif d’annulation obligatoire.'},400);
  if(order.status==='annulée')return json({order,replayed:true},200);
  const delivery=await env.DB.prepare('SELECT 1 ok FROM field_delivery_notes WHERE organization_id=? AND order_id=? LIMIT 1').bind(ctx.organizationId,String(orderId)).first();
  if(delivery)return json({error:'Une commande déjà réceptionnée ne peut pas être annulée.'},409);
  const stamp=now(),updated={...order,status:'annulée',cancelledAt:stamp,cancelledBy:ctx.uid,cancellationReason:reason,externalTransmission:'Annulée — aucune transmission'};
  state.purchaseOrders=orders.map((item,i)=>i===index?updated:item);
  const result=await env.DB.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,source_user_id=?,updated_at=? WHERE organization_id=? AND revision=?').bind(JSON.stringify(state),ctx.uid,stamp,ctx.organizationId,row.revision).run();
  if(!result.meta.changes)return json({error:'Le dossier a changé pendant l’annulation. Rechargez puis réessayez.'},409);
  await audit(env,ctx,'purchase_order.cancelled','purchase_order',String(orderId),{reason,project_id:projectId,status:'annulée'},{status:order.status});
  return json({order:updated},200);
}

async function deliveryRoute(request,env,ctx,orderId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requirePermission(env,ctx,'deliveries.receive');const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({error:'Espace entreprise introuvable.'},404);await ensureLegacyFieldDataImported(env,ctx,state);const order=legacyPurchaseOrder(state,orderId);if(!order)return json({error:'Commande fournisseur introuvable dans cette entreprise.'},404);if(order.status==='annulée')return json({error:'Cette commande fournisseur est annulée.'},409);const projectId=order.job?String(order.job):null;if(projectId){if(!workspaceProject(state,projectId))return json({error:'Chantier de la commande introuvable.'},404);await requireProjectScope(env,ctx,projectId)}const data=await body(request,100000),number=fieldText(data.number||'',120),date=String(data.date||''),comment=fieldText(data.comment||'',2000),fileName=fieldText(data.fileName||'',255),inputLines=Array.isArray(data.lines)?data.lines:[],key=operationKey(data),locationId=data.locationId?String(data.locationId):null;const replay=await env.DB.prepare('SELECT id FROM field_delivery_notes WHERE organization_id=? AND order_id=? AND idempotency_key=?').bind(ctx.organizationId,String(orderId),key).first();if(replay)return json({id:replay.id,replayed:true},200);if(!number||!validIsoDate(date)||!inputLines.length)return json({error:'Livraison incomplète.'},400);if(inputLines.some(line=>Boolean(line.stock))){if(!locationId)return json({error:'Choisissez un emplacement pour les articles entrés en stock.'},400);await stockLocation(env,ctx,locationId)}const receivedTotals=await rows(env.DB.prepare('SELECT dl.order_line_id,SUM(dl.received) received FROM field_delivery_lines dl JOIN field_delivery_notes dn ON dn.id=dl.delivery_note_id WHERE dl.organization_id=? AND dn.order_id=? GROUP BY dl.order_line_id').bind(ctx.organizationId,String(orderId))),receivedMap=new Map(receivedTotals.map(row=>[String(row.order_line_id),Number(row.received||0)])),clean=[];for(const input of inputLines){const line=(order.lines||[]).find(item=>String(item.id)===String(input.orderLineId));if(!line)return json({error:'Une ligne de livraison n’appartient pas à cette commande.'},400);const quantity=fieldNumber(input.received,{min:0.001,max:1e12}),already=receivedMap.get(String(line.id))||0;if(already+quantity>Number(line.quantity)+1e-9)return json({error:'La quantité reçue dépasse la quantité commandée.'},409);const condition=String(input.condition||'Conforme');if(!['Conforme','Article abîmé','Refusé','Erreur de quantité','Reliquat'].includes(condition))return json({error:'État de livraison invalide.'},400);clean.push({line,quantity,condition,stock:Boolean(input.stock)})}const noteId=id('delivery'),stamp=now(),personId=await currentPersonId(env,ctx),receiver=await currentProfileLabel(env,ctx),status=clean.some(item=>item.condition!=='Conforme')?'Avec réserve':'Reçue',statements=[env.DB.prepare('INSERT INTO field_delivery_notes(id,organization_id,order_id,supplier_id,project_id,number,delivery_date,receiver_person_id,receiver_name,comment,file_name,status,created_by,created_at,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(noteId,ctx.organizationId,String(orderId),order.supplierId?String(order.supplierId):null,projectId,number,date,personId,receiver,comment,fileName||null,status,ctx.uid,stamp,key)],planned=new Map();for(const item of clean){let stockItemId=null,stock=null;if(item.stock&&item.condition!=='Refusé'){const stockKey=String(item.line.reference||'').trim()?`ref:${String(item.line.reference).trim()}`:`name:${String(item.line.label||'').trim().toLocaleLowerCase('fr')}`;stock=planned.get(stockKey)||await env.DB.prepare('SELECT * FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL AND ((reference<>\'\' AND reference=?) OR lower(name)=lower(?)) ORDER BY CASE WHEN reference=? THEN 0 ELSE 1 END LIMIT 1').bind(ctx.organizationId,String(item.line.reference||''),String(item.line.label||''),String(item.line.reference||'')).first();if(!stock){stockItemId=id('stock');stock={id:stockItemId,unit_cost_cents:Math.max(0,Math.round(Number(item.line.unitPrice||0)*100))};planned.set(stockKey,stock);statements.push(env.DB.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(stockItemId,ctx.organizationId,String(item.line.reference||''),String(item.line.label||'Article'),0,0,String(item.line.unit||'unité'),stock.unit_cost_cents,0,String(order.supplierId||''),'',ctx.uid,stamp,ctx.uid,stamp))}else stockItemId=stock.id;const movementId=id('stock-movement');statements.push(env.DB.prepare('INSERT INTO field_stock_movements(id,organization_id,stock_item_id,movement_date,movement_type,quantity,origin,destination,project_id,reason,unit_cost_cents,created_by,created_at,source_location_id,destination_location_id,reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(movementId,ctx.organizationId,stockItemId,date,'entrée',item.quantity,String(order.supplierId||''),'',projectId,`Livraison ${number}`,Number(stock.unit_cost_cents||0),ctx.uid,stamp,null,locationId,number,`${key}:${String(item.line.id)}`),auditStatement(env,ctx,'stock_movement.created','stock_movement',movementId,{stock_item_id:stockItemId,type:'entrée',quantity:item.quantity,destination_location_id:locationId,project_id:projectId,reference:number}))}const already=receivedMap.get(String(item.line.id))||0,difference=Number(item.line.quantity)-already-item.quantity;statements.push(env.DB.prepare('INSERT INTO field_delivery_lines(id,organization_id,delivery_note_id,order_line_id,reference,label,ordered,received,condition,difference,stock_item_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id('delivery-line'),ctx.organizationId,noteId,String(item.line.id),String(item.line.reference||''),String(item.line.label||''),Number(item.line.quantity||0),item.quantity,item.condition,difference,stockItemId))}statements.push(auditStatement(env,ctx,'delivery.received','delivery_note',noteId,{order_id:String(orderId),project_id:projectId,location_id:locationId,lines:clean.map(item=>({order_line_id:String(item.line.id),received:item.quantity,condition:item.condition,stock:item.stock}))}));try{await dbBatch(env,statements)}catch(error){const message=String(error?.message||'');if(message.includes('idempotency')||message.includes('UNIQUE')){const existing=await env.DB.prepare('SELECT id FROM field_delivery_notes WHERE organization_id=? AND order_id=? AND idempotency_key=?').bind(ctx.organizationId,String(orderId),key).first();if(existing)return json({id:existing.id,replayed:true},200)}throw error}return json({id:noteId,status},201)}

async function fieldDataRoute(request,env,ctx){if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return json({assets:[],stockItems:[],stockLocations:[],projects:{},assignments:[],deliveryNotes:[],deliveryReceipts:[]});const canAssets=ctx.roleCode==='OWNER'||await allowed(env,ctx,'assets.view'),canStock=ctx.roleCode==='OWNER'||await allowed(env,ctx,'stock.view'),canDeliveries=ctx.roleCode==='OWNER'||await allowed(env,ctx,'deliveries.view'),canFinancial=ctx.roleCode==='OWNER'||await profitabilityReadable(env,ctx)||await allowed(env,ctx,'accounting.view');const visibleProjects=[];for(const job of state.jobs||[])if(await hasProjectScope(env,ctx,String(job.id)))visibleProjects.push(String(job.id));const projects={};for(const projectId of visibleProjects)projects[projectId]={materials:[],execution:[],notes:[]};const projectBatchSize=200;for(let offset=0;offset<visibleProjects.length;offset+=projectBatchSize){const projectIds=visibleProjects.slice(offset,offset+projectBatchSize),marks=projectIds.map(()=>'?').join(','),materials=await rows(env.DB.prepare(`SELECT id,project_id,name,quantity,unit,delivered FROM field_project_materials WHERE organization_id=? AND project_id IN (${marks}) ORDER BY project_id,created_at`).bind(ctx.organizationId,...projectIds)),executions=await rows(env.DB.prepare(`SELECT project_id,lines_json FROM field_project_execution WHERE organization_id=? AND project_id IN (${marks})`).bind(ctx.organizationId,...projectIds)),notes=await rows(env.DB.prepare(`SELECT n.id,n.project_id,n.note_date,n.visibility,n.body,n.photo_name,n.photo_document_ids_json,n.author_person_id,n.created_by,n.created_at,n.updated_at,p.first_name,p.last_name FROM field_project_notes n LEFT JOIN profiles p ON p.id=n.created_by WHERE n.organization_id=? AND n.project_id IN (${marks}) AND n.archived_at IS NULL AND (?='OWNER' OR n.visibility<>'Patron uniquement') ORDER BY n.project_id,n.created_at`).bind(ctx.organizationId,...projectIds,ctx.roleCode));for(const row of materials){const project=projects[String(row.project_id)];if(project)project.materials.push({id:row.id,name:row.name,qty:Number(row.quantity),unit:row.unit,delivered:Number(row.delivered),serverBacked:true})}for(const row of executions){const project=projects[String(row.project_id)];if(project)project.execution=parseJson(row.lines_json||'[]',[])}for(const row of notes){const project=projects[String(row.project_id)];if(project)project.notes.push({id:row.id,date:row.note_date,author:[row.first_name,row.last_name].filter(Boolean).join(' ')||row.created_by,visibility:row.visibility,text:row.body,photoName:row.photo_name||'',photoDocumentIds:parseJson(row.photo_document_ids_json||'[]',[]),photoUrl:'',updatedAt:row.updated_at||row.created_at,serverBacked:true})}}
  let assets=[];if(canAssets){const assetRows=await rows(env.DB.prepare('SELECT id,payload_json FROM field_assets WHERE organization_id=? AND archived_at IS NULL ORDER BY created_at,id').bind(ctx.organizationId)),fuel=await rows(env.DB.prepare('SELECT * FROM field_fuel_entries WHERE organization_id=? ORDER BY work_date,created_at').bind(ctx.organizationId)),issues=await rows(env.DB.prepare('SELECT * FROM field_asset_issues WHERE organization_id=? ORDER BY created_at').bind(ctx.organizationId));assets=assetRows.map(row=>{let payload=parseJson(row.payload_json,{});if(!canFinancial)payload=stripAssetFinancials(payload);payload.fuelEntries=fuel.filter(entry=>String(entry.asset_id)===String(row.id)).map(entry=>({id:entry.id,date:entry.work_date,odometer:Number(entry.odometer),liters:Number(entry.liters),...(canFinancial?{total:Number(entry.total_cents)/100}:{}),driver:entry.driver_name,pumpName:entry.pump_name||'',receiptName:entry.receipt_document_id?entry.receipt_name||'Ticket joint':'',receiptAttached:Boolean(entry.receipt_document_id),pumpUrl:'',receiptUrl:'',serverBacked:true}));payload.issues=issues.filter(issue=>String(issue.asset_id)===String(row.id)).map(issue=>({id:issue.id,severity:issue.severity,description:issue.description,status:'open',createdAt:issue.created_at}));payload.history=Array.isArray(payload.history)?payload.history:[];for(const issue of issues.filter(item=>String(item.asset_id)===String(row.id)))payload.history.push({date:String(issue.created_at).slice(0,10),text:`Signalement terrain · ${issue.severity} : ${issue.description}`,serverBacked:true});return payload})}
  let stockItems=[],stockLocations=[];if(canStock){stockLocations=await rows(env.DB.prepare('SELECT id,name,type,status FROM stock_locations WHERE organization_id=? ORDER BY name').bind(ctx.organizationId));const itemRows=await rows(env.DB.prepare('SELECT * FROM field_stock_items WHERE organization_id=? AND archived_at IS NULL ORDER BY name').bind(ctx.organizationId)),movements=await rows(env.DB.prepare('SELECT * FROM field_stock_movements WHERE organization_id=? ORDER BY created_at').bind(ctx.organizationId)),balances=await rows(env.DB.prepare('SELECT stock_item_id,location_id,quantity FROM stock_balances WHERE organization_id=? ORDER BY location_id').bind(ctx.organizationId)),locationNames=new Map(stockLocations.map(location=>[String(location.id),location.name]));stockItems=itemRows.map(row=>{const itemBalances=balances.filter(balance=>String(balance.stock_item_id)===String(row.id)).map(balance=>({locationId:balance.location_id,location:locationNames.get(String(balance.location_id))||'',quantity:Number(balance.quantity)}));return{id:row.id,reference:row.reference||'',name:row.name,quantity:itemBalances.reduce((sum,balance)=>sum+balance.quantity,0),available:itemBalances.reduce((sum,balance)=>sum+balance.quantity,0)-Number(row.reserved||0),reserved:Number(row.reserved||0),unit:row.unit,...(canFinancial?{unitCost:Number(row.unit_cost_cents)/100}:{}),minimum:Number(row.minimum),supplier:row.supplier||'',location:itemBalances.length===1?itemBalances[0].location:'Multi-emplacement',balances:itemBalances,movements:movements.filter(m=>String(m.stock_item_id)===String(row.id)).map(m=>({id:m.id,date:m.movement_date,type:m.movement_type,quantity:Number(m.quantity),sourceLocationId:m.source_location_id||null,destinationLocationId:m.destination_location_id||null,origin:m.source_location_id?locationNames.get(String(m.source_location_id))||'':m.origin||'',destination:m.destination_location_id?locationNames.get(String(m.destination_location_id))||'':m.destination||'',job:m.project_id?legacyPersonValue(m.project_id):0,user:m.created_by,reference:m.reference||'',reason:m.reason,...(canFinancial?{unitCost:Number(m.unit_cost_cents)/100}:{}),serverBacked:true})),serverBacked:true}})}
  const assignmentRows=await rows(env.DB.prepare('SELECT * FROM field_assignments WHERE organization_id=? ORDER BY assignment_date,start_time,created_at').bind(ctx.organizationId)),assignments=assignmentRows.filter(row=>visibleProjects.includes(String(row.project_id))).map(planningAssignmentJson);
  let deliveryNotes=[],deliveryReceipts=[];if(canDeliveries){const notes=await rows(env.DB.prepare('SELECT * FROM field_delivery_notes WHERE organization_id=? ORDER BY delivery_date,created_at').bind(ctx.organizationId)),lines=await rows(env.DB.prepare('SELECT * FROM field_delivery_lines WHERE organization_id=?').bind(ctx.organizationId));deliveryNotes=notes.filter(note=>!note.project_id||visibleProjects.includes(String(note.project_id))).map(note=>({id:note.id,number:note.number,supplierId:note.supplier_id||'',orderId:note.order_id,job:note.project_id?legacyPersonValue(note.project_id):0,date:note.delivery_date,receiver:note.receiver_name,lines:lines.filter(line=>line.delivery_note_id===note.id).map(line=>({orderLineId:line.order_line_id,reference:line.reference||'',label:line.label,ordered:Number(line.ordered),received:Number(line.received),condition:line.condition,difference:Number(line.difference)})),comment:note.comment||'',fileName:note.file_name||'',status:note.status,serverBacked:true}));const totals=new Map();for(const note of deliveryNotes)for(const line of note.lines){const key=`${note.orderId}::${line.orderLineId}`;totals.set(key,(totals.get(key)||0)+Number(line.received||0))}deliveryReceipts=[...totals].map(([key,received])=>{const [orderId,orderLineId]=key.split('::');return{orderId,orderLineId,received}})}return json({assets,stockItems,stockLocations,projects,assignments,deliveryNotes,deliveryReceipts})}

async function conversationRoutes(request,env,ctx){
  if(request.method==='GET'){
    await requirePermission(env,ctx,'messages.view');const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),actorPersonId=await currentPersonId(env,ctx);
    const candidates=await rows(env.DB.prepare("SELECT c.id,c.kind,c.title,COALESCE(c.scope_project_id,c.project_id) project_id,c.team_id,c.updated_at,(SELECT body FROM messages m WHERE m.conversation_id=c.id AND m.archived_at IS NULL ORDER BY m.created_at DESC LIMIT 1) last_message,(SELECT created_at FROM messages m WHERE m.conversation_id=c.id AND m.archived_at IS NULL ORDER BY m.created_at DESC LIMIT 1) last_message_at FROM conversations c WHERE c.organization_id=? AND c.archived_at IS NULL ORDER BY COALESCE(last_message_at,c.updated_at) DESC LIMIT 500").bind(ctx.organizationId)),list=[];
    for(const conversation of candidates)if(await conversationCanAccess(env,ctx,conversation,state,actorPersonId))list.push(conversation);return json({conversations:list});
  }
  if(request.method==='POST'){
    await requirePermission(env,ctx,'messages.manage');const data=await body(request,80000),title=String(data.title||'').trim(),kind=String(data.kind||''),projectId=data.projectId?String(data.projectId):null,teamId=data.teamId?String(data.teamId):null,state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
    if(!['direct','team','project','company'].includes(kind)||!title||title.length>120)return json({error:'Conversation invalide.'},400);
    if(kind==='project'){if(!projectId||!workspaceProject(state,projectId))return json({error:'Choisissez un chantier valide.'},400);await requireProjectScope(env,ctx,projectId)}
    if(kind==='team'){if(!teamId||!workspaceTeam(state,teamId))return json({error:'Choisissez une équipe valide.'},400);if(projectId){if(!workspaceProject(state,projectId))return json({error:'Chantier lié invalide.'},400);await requireProjectScope(env,ctx,projectId)}}
    const participants=await resolveConversationParticipants(env,ctx,data);if(kind==='direct'&&participants.length<2)return json({error:'Choisissez au moins une autre personne pour une conversation privée.'},400);
    if(kind==='project'||kind==='team'&&projectId)for(const participantId of participants)if(participantId!==ctx.uid&&!await assigneeCanAccessProject(env,ctx.organizationId,participantId,projectId))return json({error:'Un participant n’a pas accès à ce chantier.'},400);
    const conversationId=id('conversation'),stamp=now();await env.DB.prepare('INSERT INTO conversations(id,organization_id,kind,title,project_id,team_id,scope_project_id,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(conversationId,ctx.organizationId,kind,title,null,kind==='team'?teamId:null,kind==='project'||kind==='team'?projectId:null,ctx.uid,stamp,stamp).run();
    for(const participantId of participants)await env.DB.prepare('INSERT OR IGNORE INTO conversation_participants(conversation_id,user_id,joined_at) VALUES(?,?,?)').bind(conversationId,participantId,stamp).run();await audit(env,ctx,'conversation.created','conversation',conversationId,{kind,title,project_id:kind==='project'||kind==='team'?projectId:null,team_id:kind==='team'?teamId:null,participant_count:participants.length});return json({id:conversationId},201);
  }
  return json({error:'Méthode non autorisée.'},405)
}
async function messageRoutes(request,url,env,ctx){
  await requirePermission(env,ctx,request.method==='POST'?'messages.send':'messages.view');const conversationId=url.searchParams.get('conversation_id');if(!conversationId)return json({error:'Conversation manquante.'},400);
  const conversation=await env.DB.prepare('SELECT id,kind,project_id,scope_project_id,team_id FROM conversations WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(conversationId,ctx.organizationId).first(),state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),actorPersonId=await currentPersonId(env,ctx);if(!conversation||!await conversationCanAccess(env,ctx,conversation,state,actorPersonId))return json({error:'Conversation inaccessible.'},404);
  if(request.method==='GET')return json({messages:await rows(env.DB.prepare('SELECT m.id,m.sender_id,p.first_name,p.last_name,m.body,m.created_at,m.edited_at FROM messages m JOIN profiles p ON p.id=m.sender_id WHERE m.organization_id=? AND m.conversation_id=? AND m.archived_at IS NULL ORDER BY m.created_at ASC LIMIT 500').bind(ctx.organizationId,conversationId))});
  if(request.method==='POST'){const data=await body(request,50000),text=String(data.body||'').trim();if(!text||text.length>4000)return json({error:'Le message doit contenir entre 1 et 4 000 caractères.'},400);const messageId=id('message'),stamp=now();await env.DB.prepare('INSERT INTO messages(id,organization_id,conversation_id,sender_id,body,created_at) VALUES(?,?,?,?,?,?)').bind(messageId,ctx.organizationId,conversationId,ctx.uid,text,stamp).run();await env.DB.prepare('UPDATE conversations SET updated_at=? WHERE id=? AND organization_id=?').bind(stamp,conversationId,ctx.organizationId).run();await audit(env,ctx,'message.created','message',messageId,{conversation_id:conversationId,length:text.length});return json({id:messageId,createdAt:stamp},201)}
  return json({error:'Méthode non autorisée.'},405)
}

async function partnerGrantRoutes(request,env,ctx){if(request.method==='GET'){await requirePermission(env,ctx,'partners.view');return json({grants:await rows(env.DB.prepare('SELECT id,partner_name,partner_email,partner_type,contact_name,status,scopes_json,created_at,updated_at FROM partner_grants WHERE client_organization_id=? ORDER BY created_at DESC LIMIT 250').bind(ctx.organizationId))})}if(request.method==='POST'){await requirePermission(env,ctx,'partners.manage');const data=await body(request),name=String(data.partnerName||'').trim(),email=String(data.partnerEmail||'').trim(),type=String(data.partnerType||'').trim(),scopes=Array.isArray(data.scopes)?[...new Set(data.scopes.map(String))]:[];if(!name||!email||!type||!scopes.length||name.length>140||email.length>254)return json({error:'Mandat partenaire incomplet.'},400);const grantId=id('partner-grant'),stamp=now();await env.DB.prepare('INSERT INTO partner_grants(id,client_organization_id,partner_name,partner_email,partner_type,status,scopes_json,invited_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(grantId,ctx.organizationId,name,email,type,'draft',JSON.stringify(scopes),ctx.uid,stamp,stamp).run();await audit(env,ctx,'partner_grant.created','partner_grant',grantId,{partner_type:type,scopes});return json({id:grantId,status:'draft'},201)}return json({error:'Méthode non autorisée.'},405)}

async function partnerGrantDetailRoute(request,env,ctx,grantId){
  await requirePermission(env,ctx,'partners.manage');const grant=await env.DB.prepare('SELECT * FROM partner_grants WHERE id=? AND client_organization_id=?').bind(grantId,ctx.organizationId).first();if(!grant)return json({error:'Mandat partenaire introuvable.'},404);
  if(request.method==='PATCH'){const data=exactObject(await body(request),['partnerName','partnerEmail','partnerType','contactName','scopes']),name=String(data.partnerName??grant.partner_name).trim(),email=String(data.partnerEmail??grant.partner_email).trim().toLowerCase(),type=String(data.partnerType??grant.partner_type).trim(),contact=String(data.contactName??grant.contact_name??'').trim(),scopes=data.scopes===undefined?parseJson(grant.scopes_json,[]):[...new Set((Array.isArray(data.scopes)?data.scopes:[]).map(String))];if(!name||!email||!type||!scopes.length)return json({error:'Mandat partenaire incomplet.'},400);const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE partner_grants SET partner_name=?,partner_email=?,partner_type=?,contact_name=?,scopes_json=?,updated_at=? WHERE id=? AND client_organization_id=?').bind(name,email,type,contact,JSON.stringify(scopes),stamp,grantId,ctx.organizationId),auditStatement(env,ctx,'partner_grant.updated','partner_grant',grantId,{partner_name:name,partner_email:email,partner_type:type,scopes},{partner_name:grant.partner_name,partner_email:grant.partner_email,partner_type:grant.partner_type,scopes:parseJson(grant.scopes_json,[])})]);return json({id:grantId,status:grant.status})}
  if(request.method==='DELETE'){if(grant.status==='revoked')return json({id:grantId,status:'revoked',replayed:true});const stamp=now();await dbBatch(env,[env.DB.prepare("UPDATE partner_grants SET status='revoked',revoked_at=?,updated_at=? WHERE id=? AND client_organization_id=? AND status<>'revoked'").bind(stamp,stamp,grantId,ctx.organizationId),auditStatement(env,ctx,'partner_grant.revoked','partner_grant',grantId,{status:'revoked'},{status:grant.status})]);return json({id:grantId,status:'revoked'})}
  return json({error:'Méthode non autorisée.'},405)
}
async function partnerRequestRoutes(request,env,ctx){if(request.method==='GET'){await requirePermission(env,ctx,'partner_requests.view');return json({requests:await rows(env.DB.prepare('SELECT id,partner_grant_id,context_type,context_id,title,note,due_date,status,created_at,updated_at FROM partner_requests WHERE client_organization_id=? ORDER BY CASE status WHEN \'open\' THEN 0 ELSE 1 END,due_date,created_at DESC LIMIT 250').bind(ctx.organizationId))})}if(request.method==='POST'){await requirePermission(env,ctx,'partner_requests.manage');const data=await body(request),grant=await env.DB.prepare("SELECT id FROM partner_grants WHERE id=? AND client_organization_id=? AND status='active'").bind(data.partnerGrantId,ctx.organizationId).first(),title=String(data.title||'').trim(),context=['expense','invoice','bank_transaction','worker','payroll','document','project','other'].includes(data.contextType)?data.contextType:'other';if(!grant||!title||title.length>200)return json({error:'Demande partenaire invalide ou mandat inactif.'},400);const requestId=id('partner-request'),stamp=now();await env.DB.prepare('INSERT INTO partner_requests(id,client_organization_id,partner_grant_id,context_type,context_id,title,note,due_date,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(requestId,ctx.organizationId,grant.id,context,String(data.contextId||'').trim()||null,title,String(data.note||'').trim().slice(0,2000),data.dueDate||null,'open',ctx.uid,stamp,stamp).run();await audit(env,ctx,'partner_request.created','partner_request',requestId,{context_type:context,partner_grant_id:grant.id});return json({id:requestId,status:'open'},201)}return json({error:'Méthode non autorisée.'},405)}

async function acceptPartnerGrant(request,env,ctx,grantId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);const grant=await env.DB.prepare("SELECT id,client_organization_id,partner_email,status FROM partner_grants WHERE id=? AND status IN ('draft','invited')").bind(grantId).first(),profile=await env.DB.prepare('SELECT email FROM profiles WHERE id=?').bind(ctx.uid).first(),actorEmail=authenticatedEmail(request)||String(profile?.email||'').trim().toLowerCase();if(!grant||!actorEmail||String(grant.partner_email).toLowerCase()!==actorEmail)return json({error:'Invitation partenaire introuvable ou non autorisée.'},404);const stamp=now();await env.DB.prepare("UPDATE partner_grants SET partner_organization_id=?,status='active',accepted_by=?,accepted_at=?,updated_at=? WHERE id=? AND status IN ('draft','invited')").bind(ctx.organizationId,ctx.uid,stamp,stamp,grant.id).run();await audit(env,{...ctx,organizationId:grant.client_organization_id},'partner_grant.accepted','partner_grant',grant.id,{partner_organization_id:ctx.organizationId});return json({id:grant.id,status:'active'},200)}
async function partnerPortfolio(request,env,ctx){if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);return json({companies:await rows(env.DB.prepare("SELECT pg.id grant_id,o.id organization_id,o.name,o.legal_name,pg.partner_type,pg.scopes_json,pg.updated_at FROM partner_grants pg JOIN organizations o ON o.id=pg.client_organization_id WHERE pg.partner_organization_id=? AND pg.status='active' ORDER BY o.name LIMIT 500").bind(ctx.organizationId))})}

async function requireProjectScope(env,ctx,projectId){
  if(ctx.roleCode==='OWNER'||await allowed(env,ctx,'projects.view.all'))return;
  if(!await allowed(env,ctx,'projects.view.assigned'))throw Object.assign(Error('Vous ne pouvez pas accéder à ce chantier.'),{status:403});
  const grant=await env.DB.prepare('SELECT 1 ok FROM project_access WHERE organization_id=? AND user_id=? AND project_id=?').bind(ctx.organizationId,ctx.uid,String(projectId)).first();
  if(!grant)throw Object.assign(Error('Vous ne pouvez pas accéder à ce chantier.'),{status:403});
}
function searchFold(value){return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr')}
function searchItem({id,label,context,href,match}){return{id:String(id),label:String(label||'').slice(0,180),context:String(context||'').slice(0,180),href,match}}
async function globalSearchRoute(request,url,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const query=String(url.searchParams.get('q')||'').trim();
  if(query.length<2||query.length>80)return json({error:'La recherche doit contenir de 2 à 80 caractères.'},400);
  const started=Date.now(),needle=searchFold(query),like=`%${query.replace(/[\\%_]/g,'\\$&')}%`,groups=[
    {id:'projects',label:'Chantiers',items:[]},{id:'contacts',label:'Contacts',items:[]},{id:'people',label:'Personnes',items:[]},
    {id:'quotes',label:'Devis',items:[]},{id:'invoices',label:'Factures',items:[]},{id:'documents',label:'Documents',items:[]}
  ];
  const add=(group,item)=>{if(!item)return;const value=searchFold([item.label,item.context].join(' '));if(!value.includes(needle))return;item.match=searchFold(item.label).startsWith(needle)?0:1;groups[group].items.push(item)};
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(state){const scoped=ctx.roleCode==='OWNER'?state:await scopedLegacyState(env,ctx,state);
    for(const project of scoped.jobs||[])add(0,searchItem({id:project.id,label:project.name||project.title,context:`Chantier · ${project.status||'en cours'}`,href:`/projects/${encodeURIComponent(project.id)}`,match:0}));
    for(const contact of scoped.contacts||[])add(1,searchItem({id:contact.id,label:contact.company||contact.name||[contact.firstName,contact.lastName].filter(Boolean).join(' '),context:contact.roles?.join(' · ')||contact.email||'Contact',href:`/contacts/${encodeURIComponent(contact.id)}`,match:0}));
    for(const person of scoped.people||[])add(2,searchItem({id:person.id,label:person.name||[person.firstName,person.lastName].filter(Boolean).join(' '),context:person.role||person.position||'Personne',href:`/people/${encodeURIComponent(person.id)}`,match:0}));
    if(ctx.roleCode==='OWNER'||await allowed(env,ctx,'quotes.view')){
      for(const quote of scoped.quotes||[])add(3,searchItem({id:quote.id,label:quote.reference||quote.number||quote.name||'Devis',context:`Devis · ${quote.status||'à traiter'}`,href:`/quotes/${encodeURIComponent(quote.id)}`,match:0}));
      const serverQuotes=await rows(env.DB.prepare("SELECT id,project_id,reference,title,status FROM quotes_server WHERE organization_id=? AND archived_at IS NULL AND (reference LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\') ORDER BY issue_date DESC,created_at DESC LIMIT 120").bind(ctx.organizationId,like,like));
      for(const quote of serverQuotes){try{await requireProjectScope(env,ctx,quote.project_id)}catch{continue}add(3,searchItem({id:quote.id,label:quote.reference||quote.title,context:`Devis · ${quote.status||'à traiter'}`,href:`/quotes/${encodeURIComponent(quote.id)}`,match:0}))}
    }
  }
  if(ctx.roleCode==='OWNER'||await allowed(env,ctx,'invoices.view')){
    const candidates=await rows(env.DB.prepare("SELECT id,invoice_number,status,issue_date,project_id,legacy_project_id FROM invoices WHERE organization_id=? AND archived_at IS NULL AND (invoice_number LIKE ? ESCAPE '\\' OR status LIKE ? ESCAPE '\\') ORDER BY issue_date DESC,created_at DESC LIMIT 120").bind(ctx.organizationId,like,like));
    for(const invoice of candidates){try{await invoiceScope(env,ctx,invoice)}catch{continue}add(4,searchItem({id:invoice.id,label:invoice.invoice_number,context:`Facture · ${invoice.status||invoice.issue_date||''}`,href:`/invoices/${encodeURIComponent(invoice.id)}`,match:0}))}
  }
  if(ctx.roleCode==='OWNER'||await allowed(env,ctx,'documents.secure.view')){
    const candidates=await rows(env.DB.prepare("SELECT id,original_name,title,category,status,sensitivity,created_at FROM secure_documents WHERE organization_id=? AND archived_at IS NULL AND (title LIKE ? ESCAPE '\\' OR original_name LIKE ? ESCAPE '\\' OR reference LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT 120").bind(ctx.organizationId,like,like,like));
    for(const document of candidates){const relations=await documentRelations(env,ctx,document.id);if(!await canAccessSecureDocument(env,ctx,document,relations))continue;add(5,searchItem({id:document.id,label:document.title||document.original_name,context:`Document · ${document.category||'fichier'}`,href:`/documents/${encodeURIComponent(document.id)}`,match:0}))}
  }
  for(const group of groups){group.items.sort((a,b)=>a.match-b.match||a.label.localeCompare(b.label,'fr'));group.items=group.items.slice(0,6)}
  let total=groups.reduce((sum,group)=>sum+group.items.length,0);while(total>30){const group=[...groups].reverse().find(item=>item.items.length);group.items.pop();total--}
  return json({groups,took:Date.now()-started});
}
async function hasTenantFinanceScope(env,ctx){
  const policy=await accessPolicy(env,ctx);
  if(policy.owner||!policy.has('accounting.view'))return false;
  if(ctx.roleCode==='ACCOUNTING')return true;
  return policy.configured&&['Toute l’entreprise','Comptabilité et pièces administratives'].includes(policy.scope);
}
async function requireFinanceProjectScope(env,ctx,projectId){
  if(await hasTenantFinanceScope(env,ctx))return;
  await requireProjectScope(env,ctx,projectId);
}
async function assigneeCanAccessProject(env,organizationId,userId,projectId){
  const member=await env.DB.prepare("SELECT om.role_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.organization_id=? AND om.user_id=? AND om.status='active'").bind(organizationId,userId).first();
  if(!member)return false;
  if(member.role_code==='OWNER'||await env.DB.prepare("SELECT 1 ok FROM role_permissions WHERE role_id=? AND permission_code='projects.view.all'").bind(member.role_id).first())return true;
  return Boolean(await env.DB.prepare('SELECT 1 ok FROM project_access WHERE organization_id=? AND user_id=? AND project_id=?').bind(organizationId,userId,String(projectId)).first());
}
function taskChecklist(value){
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>60)throw Object.assign(Error("Checklist invalide."),{status:400});
  return value.map((item,index)=>{
    const source=item&&typeof item==='object'?item:{label:item},label=String(source.label||'').trim().slice(0,240);
    if(!label)throw Object.assign(Error("Élément de checklist invalide."),{status:400});
    return{id:String(source.id||('check-'+index)).replace(/[^A-Za-z0-9._:-]/g,'_').slice(0,120),label,done:Boolean(source.done)};
  });
}
function taskMaterials(value){
  if(value===undefined||value===null)return [];
  if(!Array.isArray(value)||value.length>60)throw Object.assign(Error("Liste de matériaux invalide."),{status:400});
  return value.map(item=>{
    const source=item&&typeof item==='object'?item:{name:item},name=String(source.name||source.label||'').trim().slice(0,200),quantity=source.quantity===undefined||source.quantity===null||source.quantity===''?null:Number(source.quantity),unit=String(source.unit||'').trim().slice(0,60);
    if(!name||quantity!==null&&(!Number.isFinite(quantity)||quantity<0))throw Object.assign(Error("Matériau de tâche invalide."),{status:400});
    return{name,quantity,unit};
  });
}
function taskPeople(value){return [...new Set(parseJson(typeof value==='string'?value:JSON.stringify(Array.isArray(value)?value:[]),[]).map(item=>String(item||'').trim()).filter(Boolean))].slice(0,60)}
function taskPhotos(value){return [...new Set(parseJson(typeof value==='string'?value:JSON.stringify(Array.isArray(value)?value:[]),[]).map(item=>String(item||'').trim()).filter(Boolean))].slice(0,12)}
function taskDueAt(value){if(value===undefined||value===null||value==='')return null;const raw=String(value).trim();if(validIsoDate(raw))return raw;const iso=safeIsoTimestamp(raw);if(!iso)throw Object.assign(Error("Échéance invalide."),{status:400});return iso}
async function taskById(env,ctx,taskId){return env.DB.prepare('SELECT id,organization_id,project_id,title,description,status,priority,assigned_to,created_by,created_at,updated_at,completed_at,due_at,checklist_json,materials_json,people_json,operation_key,task_kind,problem_category,photo_document_ids_json,validated_by,validated_at FROM project_tasks WHERE id=? AND organization_id=? AND archived_at IS NULL').bind(taskId,ctx.organizationId).first()}
async function canManageProjectTasks(env,ctx){return ctx.roleCode==='OWNER'||allowed(env,ctx,'tasks.manage.project')}
function taskJson(task){return {id:task.id,projectId:String(task.project_id),title:task.title,description:task.description,status:task.status,priority:task.priority,assignedTo:task.assigned_to||null,people:taskPeople(task.people_json),dueAt:task.due_at||null,checklist:parseJson(task.checklist_json||'[]',[]),materials:parseJson(task.materials_json||'[]',[]),kind:task.task_kind||'task',problemCategory:task.problem_category||null,photoDocumentIds:taskPhotos(task.photo_document_ids_json),validatedBy:task.validated_by||null,validatedAt:task.validated_at||null,createdBy:task.created_by,createdAt:task.created_at,updatedAt:task.updated_at,completedAt:task.completed_at}}
function taskIsParticipant(task,uid){return String(task.assigned_to||'')===String(uid)||String(task.created_by||'')===String(uid)||taskPeople(task.people_json).includes(String(uid))}
async function validateTaskPeople(env,ctx,projectId,assignedTo,people){
  const ids=[...new Set([assignedTo,...people].filter(Boolean).map(String))];
  for(const userId of ids)if(!await assigneeCanAccessProject(env,ctx.organizationId,userId,projectId))throw Object.assign(Error("Une personne concernée n’a pas accès à ce chantier."),{status:400});
}
function workerChecklistUpdate(existing,value){
  const current=Array.isArray(existing)?existing:[],next=taskChecklist(value);
  if(current.length!==next.length)throw Object.assign(Error("Vous ne pouvez pas modifier la structure de la checklist."),{status:403});
  const byId=new Map(next.map(item=>[String(item.id),item]));
  return current.map(item=>{const updated=byId.get(String(item.id));if(!updated||updated.label!==item.label)throw Object.assign(Error("Vous ne pouvez modifier que l’état de la checklist."),{status:403});return{...item,done:Boolean(updated.done)}});
}
async function createTaskRecord(env,ctx,projectId,data,{kind='task',category=null,allowReporter=false}={}){
  const title=String(data.title||'').trim(),description=String(data.description||'').trim(),priority=['low','normal','high','urgent'].includes(data.priority)?data.priority:'normal',assignedTo=String(data.assignedTo||'').trim()||null,people=taskPeople(data.people),dueAt=taskDueAt(data.dueAt),checklist=taskChecklist(data.checklist),materials=taskMaterials(data.materials),photoIds=await fieldPhotoDocumentIds(env,ctx,projectId,data.photoDocumentIds),key=optionalOperationKey(data),taskPeopleValue=allowReporter?[...new Set([ctx.uid,...people])]:people;
  if(!title||title.length>240||description.length>4000)return{error:json({error:"Titre ou description invalide."},400)};
  await validateTaskPeople(env,ctx,projectId,assignedTo,people);
  const replayMatchesTask=replay=>String(replay.project_id)===String(projectId)&&replay.title===title&&replay.description===description&&replay.priority===priority&&String(replay.assigned_to||'')===String(assignedTo||'')&&JSON.stringify(taskPeople(replay.people_json))===JSON.stringify(taskPeopleValue)&&String(replay.due_at||'')===String(dueAt||'')&&JSON.stringify(parseJson(replay.checklist_json||'[]',[]))===JSON.stringify(checklist)&&JSON.stringify(parseJson(replay.materials_json||'[]',[]))===JSON.stringify(materials)&&String(replay.task_kind||'task')===String(kind)&&String(replay.problem_category||'')===String(category||'')&&JSON.stringify(taskPhotos(replay.photo_document_ids_json))===JSON.stringify(photoIds);
  if(key){
    const replay=await env.DB.prepare('SELECT * FROM project_tasks WHERE organization_id=? AND created_by=? AND operation_key=?').bind(ctx.organizationId,ctx.uid,key).first();
    if(replay){
      if(!replayMatchesTask(replay))return{error:json({error:"Cette clé d’opération a déjà servi pour une autre tâche."},409)};
      return{task:replay,replayed:true};
    }
  }
  const taskId=id('task'),stamp=now();
  const statements=[env.DB.prepare('INSERT INTO project_tasks(id,organization_id,project_id,title,description,status,priority,assigned_to,created_by,created_at,updated_at,due_at,checklist_json,materials_json,people_json,operation_key,task_kind,problem_category,photo_document_ids_json,validated_by,validated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)').bind(taskId,ctx.organizationId,String(projectId),title,description,'todo',priority,assignedTo,ctx.uid,stamp,stamp,dueAt,JSON.stringify(checklist),JSON.stringify(materials),JSON.stringify(taskPeopleValue),key,kind,category,JSON.stringify(photoIds)),auditStatement(env,ctx,kind==='problem'?'project_problem.reported':'task.created','project_task',taskId,{project_id:String(projectId),title,priority,assigned_to:assignedTo,people:taskPeopleValue,due_at:dueAt,kind,category,photo_document_ids:photoIds})];
  try{await dbBatch(env,statements)}catch(error){
    if(key){const replay=await env.DB.prepare('SELECT * FROM project_tasks WHERE organization_id=? AND created_by=? AND operation_key=?').bind(ctx.organizationId,ctx.uid,key).first();if(replay){if(replayMatchesTask(replay))return{task:replay,replayed:true};return{error:json({error:"Cette clé d’opération a déjà servi pour une autre tâche."},409)}}}
    throw error;
  }
  return{task:await taskById(env,ctx,taskId),replayed:false};
}
async function projectProblemRoute(request,env,ctx,projectId){
  if(request.method!=='POST')return json({error:"Méthode non autorisée."},405);
  await requirePermission(env,ctx,'project_notes.create');await requireProjectScope(env,ctx,projectId);
  const categories=new Map([['equipment','Matériel cassé'],['materials','Manque de matériaux'],['safety','Problème de sécurité'],['site_error','Erreur chantier'],['technical','Problème technique'],['other','Autre']]),category=String((await request.clone().json().catch(()=>({}))).category||'');
  const data=await body(request,60000);
  if(!categories.has(String(data.category||'')))return json({error:"Catégorie de problème invalide."},400);
  const cat=String(data.category),comment=String(data.comment||data.description||'').trim();
  if(!comment||comment.length>4000)return json({error:"Commentaire de problème obligatoire."},400);
  const priority=cat==='safety'?'urgent':['equipment','materials','site_error'].includes(cat)?'high':'normal';
  const result=await createTaskRecord(env,ctx,projectId,{...data,title:'Signalement · '+categories.get(cat),description:comment,priority,people:[ctx.uid]}, {kind:'problem',category:cat,allowReporter:true});
  if(result.error)return result.error;
  return json({problem:taskJson(result.task),replayed:result.replayed},result.replayed?200:201);
}
async function taskRoutes(request,url,env,ctx,projectId=null,taskId=null){
  if(projectId===null&&taskId===null){
    if(request.method!=='GET')return json({error:"Méthode non autorisée."},405);
    const manages=await canManageProjectTasks(env,ctx),views=ctx.roleCode==='OWNER'||await allowed(env,ctx,'tasks.view.assigned');
    if(!manages&&!views)throw Object.assign(Error("Vous ne pouvez pas consulter les tâches chantier."),{status:403});
    const candidates=await rows(env.DB.prepare("SELECT * FROM project_tasks WHERE organization_id=? AND archived_at IS NULL ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,updated_at DESC").bind(ctx.organizationId)),visible=[];
    for(const task of candidates){if(!manages&&!taskIsParticipant(task,ctx.uid))continue;if(!await hasProjectScope(env,ctx,task.project_id))continue;visible.push(task)}
    const labels=await profileLabels(env,ctx),fieldJournal=[];
    if(ctx.roleCode==='OWNER'){
      const entries=await rows(env.DB.prepare("SELECT n.id,n.project_id,n.category,n.body,n.created_by,n.created_at,p.first_name,p.last_name FROM field_project_notes n LEFT JOIN profiles p ON p.id=n.created_by WHERE n.organization_id=? AND n.archived_at IS NULL AND n.category IN ('Problème','Sécurité') ORDER BY n.created_at DESC,n.id DESC LIMIT 50").bind(ctx.organizationId));
      const workspace=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
      for(const entry of entries){if(!await hasProjectScope(env,ctx,entry.project_id))continue;const project=workspaceProject(workspace,entry.project_id);fieldJournal.push({id:String(entry.id),projectId:String(entry.project_id),projectName:String(project?.name||project?.reference||entry.project_id),category:String(entry.category),text:String(entry.body||''),author:[entry.first_name,entry.last_name].filter(Boolean).join(' ')||String(entry.created_by),createdAt:String(entry.created_at),source:'field-journal'});}
    }
    return json({tasks:visible.map(task=>({...taskJson(task),assignedToName:task.assigned_to?(labels.get(task.assigned_to)||task.assigned_to):'',createdByName:labels.get(task.created_by)||task.created_by})),fieldJournal});
  }
  if(projectId!==null){
    await requireProjectScope(env,ctx,projectId);
    const manages=await canManageProjectTasks(env,ctx),views=ctx.roleCode==='OWNER'||await allowed(env,ctx,'tasks.view.assigned');
    if(!manages&&!views)throw Object.assign(Error("Vous ne pouvez pas consulter les tâches de ce chantier."),{status:403});
    if(request.method==='GET'){
      const candidates=await rows(env.DB.prepare("SELECT * FROM project_tasks WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,updated_at DESC").bind(ctx.organizationId,String(projectId)));
      return json({tasks:candidates.filter(task=>manages||taskIsParticipant(task,ctx.uid)).map(taskJson)});
    }
    if(request.method==='POST'){
      if(!manages)throw Object.assign(Error("Vous ne pouvez pas créer une tâche sur ce chantier."),{status:403});
      const data=await body(request,70000),result=await createTaskRecord(env,ctx,projectId,data);
      if(result.error)return result.error;
      return json({task:taskJson(result.task),replayed:result.replayed},result.replayed?200:201);
    }
    return json({error:"Méthode non autorisée."},405);
  }
  const task=await taskById(env,ctx,taskId);if(!task)return json({error:"Tâche introuvable."},404);await requireProjectScope(env,ctx,task.project_id);const manages=await canManageProjectTasks(env,ctx),participant=taskIsParticipant(task,ctx.uid),isAssignee=String(task.assigned_to||'')===String(ctx.uid);
  if(url.pathname.endsWith('/comments')){
    if(!manages&&!participant)throw Object.assign(Error("Vous ne pouvez pas consulter ou commenter cette tâche."),{status:403});
    if(request.method==='GET'){const comments=await rows(env.DB.prepare('SELECT c.id,c.body,c.created_by,c.created_at,p.first_name,p.last_name FROM project_task_comments c JOIN profiles p ON p.id=c.created_by WHERE c.organization_id=? AND c.task_id=? AND c.archived_at IS NULL ORDER BY c.created_at ASC').bind(ctx.organizationId,task.id));return json({comments:comments.map(comment=>({id:comment.id,body:comment.body,createdBy:comment.created_by,createdAt:comment.created_at,author:[comment.first_name,comment.last_name].filter(Boolean).join(' ')||comment.created_by}))})}
    if(request.method==='POST'){if(ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'tasks.comment.create'))throw Object.assign(Error("Vous ne pouvez pas commenter cette tâche."),{status:403});const data=await body(request,20000),text=String(data.body||'').trim();if(!text||text.length>4000)return json({error:"Commentaire invalide."},400);const commentId=id('task-comment'),stamp=now();await dbBatch(env,[env.DB.prepare('INSERT INTO project_task_comments(id,task_id,organization_id,body,created_by,created_at) VALUES(?,?,?,?,?,?)').bind(commentId,task.id,ctx.organizationId,text,ctx.uid,stamp),auditStatement(env,ctx,'task.comment.created','project_task_comment',commentId,{taskId:task.id,body:text})]);return json({id:commentId,createdAt:stamp},201)}
    return json({error:"Méthode non autorisée."},405);
  }
  if(url.pathname.endsWith('/validate')){
    if(request.method!=='POST')return json({error:"Méthode non autorisée."},405);
    if(!manages)return json({error:"Vous ne pouvez pas valider cette tâche."},403);
    if(task.status!=='done')return json({error:"La tâche doit être terminée avant validation."},409);
    const checklist=parseJson(task.checklist_json||'[]',[]);
    if(checklist.some(item=>!item.done))return json({error:"La checklist doit être terminée avant validation."},409);
    if(task.validated_at)return json({task:taskJson(task),replayed:true});
    const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE project_tasks SET validated_by=?,validated_at=?,updated_at=? WHERE id=? AND organization_id=?').bind(ctx.uid,stamp,stamp,task.id,ctx.organizationId),auditStatement(env,ctx,'task.validated','project_task',task.id,{validated_by:ctx.uid,validated_at:stamp})]);return json({task:taskJson(await taskById(env,ctx,task.id))});
  }
  if(url.pathname.endsWith('/history')){
    if(request.method!=='GET')return json({error:"Méthode non autorisée."},405);
    if(!manages&&!participant)return json({error:"Vous ne pouvez pas consulter cet historique."},403);
    const changes=await rows(env.DB.prepare("SELECT id,action,user_id,old_values,new_values,created_at FROM audit_logs WHERE organization_id=? AND entity_type='project_task' AND entity_id=? ORDER BY created_at ASC,id ASC").bind(ctx.organizationId,task.id)),comments=await rows(env.DB.prepare("SELECT id,body,created_by,created_at FROM project_task_comments WHERE organization_id=? AND task_id=? AND archived_at IS NULL ORDER BY created_at ASC,id ASC").bind(ctx.organizationId,task.id));
    const events=[...changes.map(item=>({id:item.id,type:item.action,actorId:item.user_id,at:item.created_at,oldValues:parseJson(item.old_values||'null',null),newValues:parseJson(item.new_values||'null',null)})),...comments.map(item=>({id:item.id,type:'task.comment',actorId:item.created_by,at:item.created_at,body:item.body}))].sort((a,b)=>String(a.at).localeCompare(String(b.at))||String(a.id).localeCompare(String(b.id)));
    return json({taskId:task.id,events});
  }
  if(request.method==='GET'){if(!manages&&!participant)throw Object.assign(Error("Vous ne pouvez pas consulter cette tâche."),{status:403});return json({task:taskJson(task)})}
  if(request.method==='PATCH'){
    const data=await body(request,70000),old=taskJson(task),requested=Object.keys(data||{}),workerUpdate=!manages;
    let checklist=parseJson(task.checklist_json||'[]',[]);
    if(workerUpdate){
      if(!isAssignee||!await allowed(env,ctx,'tasks.update.assigned'))throw Object.assign(Error("Vous ne pouvez pas modifier cette tâche."),{status:403});
      if(requested.some(key=>!['status','checklist'].includes(key)))return json({error:"Vous pouvez uniquement mettre à jour le statut et la checklist de votre tâche."},403);
      if(data.status!==undefined){const transitions={todo:['in_progress','blocked'],in_progress:['blocked','done'],blocked:['in_progress'],done:[]};if(!transitions[task.status].includes(data.status))return json({error:"Transition de statut non autorisée."},400)}
      if(data.checklist!==undefined)checklist=workerChecklistUpdate(checklist,data.checklist);
    }else if(data.checklist!==undefined)checklist=taskChecklist(data.checklist);
    const title=manages&&data.title!==undefined?String(data.title).trim():task.title,description=manages&&data.description!==undefined?String(data.description).trim():task.description,priority=manages&&data.priority!==undefined?data.priority:task.priority,status=data.status!==undefined?data.status:task.status,assignedTo=manages&&data.assignedTo!==undefined?(String(data.assignedTo||'').trim()||null):task.assigned_to,people=manages&&data.people!==undefined?taskPeople(data.people):taskPeople(task.people_json),dueAt=manages&&data.dueAt!==undefined?taskDueAt(data.dueAt):task.due_at,materials=manages&&data.materials!==undefined?taskMaterials(data.materials):parseJson(task.materials_json||'[]',[]),photoIds=manages&&data.photoDocumentIds!==undefined?await fieldPhotoDocumentIds(env,ctx,task.project_id,data.photoDocumentIds):taskPhotos(task.photo_document_ids_json);
    if(!title||title.length>240||description.length>4000||!['low','normal','high','urgent'].includes(priority)||!['todo','in_progress','blocked','done'].includes(status))return json({error:"Mise à jour invalide."},400);
    await validateTaskPeople(env,ctx,task.project_id,assignedTo,people);
    const stamp=now(),completed=status==='done'?(task.completed_at||stamp):null,clearValidation=requested.length>0;
    await env.DB.prepare('UPDATE project_tasks SET title=?,description=?,status=?,priority=?,assigned_to=?,people_json=?,due_at=?,checklist_json=?,materials_json=?,photo_document_ids_json=?,updated_at=?,completed_at=?,validated_by=?,validated_at=? WHERE id=? AND organization_id=?').bind(title,description,status,priority,assignedTo,JSON.stringify(people),dueAt,JSON.stringify(checklist),JSON.stringify(materials),JSON.stringify(photoIds),stamp,completed,clearValidation?null:task.validated_by,clearValidation?null:task.validated_at,task.id,ctx.organizationId).run();const updated=await taskById(env,ctx,task.id);await audit(env,ctx,'task.updated','project_task',task.id,taskJson(updated),old);return json({task:taskJson(updated)});
  }
  return json({error:"Méthode non autorisée."},405);
}
async function fieldPortalRoute(request,url,env,ctx,projectId){
  if(request.method!=='GET')return json({error:"Méthode non autorisée."},405);
  const resolved=await resolveHubProject(env,ctx,projectId),state=resolved.state||await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview})||{},date=String(url.searchParams.get('date')||socleBusinessDate(state));
  if(!validIsoDate(date))return json({error:"Date terrain invalide."},400);
  const [planningManage,taskManage,taskView,noteCreate,assetView,assetIssue,quoteView,documentView]=await Promise.all(['planning.assignments.manage','tasks.manage.project','tasks.view.assigned','project_notes.create','assets.view','asset_issues.create','quotes.view','documents.secure.view'].map(permission=>allowed(env,ctx,permission))),quotePrices=await quotePriceReadable(env,ctx);
  const canConsumeStock=await canStockConsumeProject(env,ctx,String(projectId),state,socleBusinessDate(state));
  const flags=await timePermissionFlags(env,ctx),personId=await currentPersonId(env,ctx),audience=await planningAudience(env,ctx),memberRows=await rows(env.DB.prepare("SELECT om.user_id,om.person_id,p.first_name,p.last_name,p.email FROM organization_members om JOIN profiles p ON p.id=om.user_id WHERE om.organization_id=? AND om.status='active'").bind(ctx.organizationId)),memberByPerson=new Map(memberRows.filter(row=>row.person_id).map(row=>[String(row.person_id),row])),memberByUser=new Map(memberRows.map(row=>[String(row.user_id),row]));
  const assignmentRows=await rows(env.DB.prepare("SELECT * FROM field_assignments WHERE organization_id=? AND project_id=? AND assignment_date=? ORDER BY created_at,id").bind(ctx.organizationId,String(projectId),date)),canSeeTeam=ctx.roleCode==='OWNER'||planningManage||audience==='team'||audience==='all'||flags.viewTeam||flags.viewAll,visibleAssignments=assignmentRows.filter(row=>canSeeTeam||personId&&parseJson(row.people_json||'[]',[]).map(String).includes(String(personId)));
  const assignments=visibleAssignments.map(row=>({id:row.id,date:row.assignment_date,teamId:row.team_id||null,teamName:workspaceTeam(state,row.team_id)?.name||row.team_id||'',people:audience==='own'&&!flags.createTeam?parseJson(row.people_json||'[]',[]).map(String).filter(id=>id===String(personId)):parseJson(row.people_json||'[]',[]).map(String),vehicleId:row.vehicle_id||null,packId:row.pack_id||null,subcontractor:row.subcontractor||''}));
  const personIds=[...new Set(assignments.flatMap(item=>item.people))],hrNames=personIds.length?await rows(env.DB.prepare(`SELECT id,display_name FROM hr_people WHERE organization_id=? AND id IN (${personIds.map(()=>'?').join(',')})`).bind(ctx.organizationId,...personIds)):[],personNames=new Map(hrNames.map(person=>[String(person.id),String(person.display_name||person.id)]));for(const person of state.people||[]){const key=String(person.id),name=String(person.name||person.displayName||'').trim();if(name&&!personNames.has(key))personNames.set(key,name)}const teamMembers=personIds.map(idPerson=>{const member=memberByPerson.get(String(idPerson));return{personId:String(idPerson),userId:member?.user_id||null,name:member?[member.first_name,member.last_name].filter(Boolean).join(' ')||member.email||member.user_id:personNames.get(String(idPerson))||String(idPerson)}});

  const entryRows=await rows(env.DB.prepare("SELECT * FROM time_entries WHERE organization_id=? AND project_id=? AND work_date=? AND archived_at IS NULL ORDER BY arrival,created_at,id").bind(ctx.organizationId,String(projectId),date)),visibleEntries=[];
  for(const row of entryRows)if(await canReadTimeEntry(env,ctx,state,flags,personId,row))visibleEntries.push(row);
  const labels=await profileLabels(env,ctx),ownOnly=!flags.owner&&!flags.viewAll&&!flags.viewTeam,timeEntries=visibleEntries.map(row=>timeEntryJson(row,[],labels,ownOnly?personId:null)),openForCurrentUser=visibleEntries.find(row=>!row.departure&&personId&&timeEntryPeople(row).includes(String(personId)));

  const allTasks=await rows(env.DB.prepare("SELECT * FROM project_tasks WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,updated_at DESC").bind(ctx.organizationId,String(projectId))),canManageTasks=ctx.roleCode==='OWNER'||taskManage,visibleTasks=allTasks.filter(task=>canManageTasks||taskIsParticipant(task,ctx.uid)).map(taskJson),problems=visibleTasks.filter(task=>task.kind==='problem');

  const notes=await rows(env.DB.prepare("SELECT n.*,p.first_name,p.last_name FROM field_project_notes n LEFT JOIN profiles p ON p.id=n.created_by WHERE n.organization_id=? AND n.project_id=? AND n.archived_at IS NULL AND (?='OWNER' OR n.visibility<>'Patron uniquement') ORDER BY n.created_at DESC,n.id DESC LIMIT 80").bind(ctx.organizationId,String(projectId),ctx.roleCode));
  const noteItems=notes.map(row=>({id:row.id,date:row.note_date,visibility:row.visibility,text:row.body,photoName:row.photo_name||'',photoDocumentIds:parseJson(row.photo_document_ids_json||'[]',[]),author:[row.first_name,row.last_name].filter(Boolean).join(' ')||row.created_by,createdAt:row.created_at,canEdit:ctx.roleCode==='OWNER'||canManageTasks||String(row.created_by)===String(ctx.uid)}));

  const materials=(await rows(env.DB.prepare("SELECT id,name,quantity,unit,delivered FROM field_project_materials WHERE organization_id=? AND project_id=? ORDER BY created_at,id").bind(ctx.organizationId,String(projectId)))).map(row=>({id:row.id,name:row.name,quantity:Number(row.quantity),unit:row.unit,delivered:Number(row.delivered)})),executionRow=await env.DB.prepare('SELECT lines_json,updated_at FROM field_project_execution WHERE organization_id=? AND project_id=?').bind(ctx.organizationId,String(projectId)).first();

  let assets=[];if(ctx.roleCode==='OWNER'||assetView){
    const selected=new Set(assignments.flatMap(item=>[item.vehicleId,item.packId]).filter(Boolean).map(String)),assetRows=await rows(env.DB.prepare("SELECT id,payload_json FROM field_assets WHERE organization_id=? AND archived_at IS NULL ORDER BY created_at,id").bind(ctx.organizationId)),issueRows=await rows(env.DB.prepare("SELECT id,asset_id,severity,description,created_at,created_by FROM field_asset_issues WHERE organization_id=? ORDER BY created_at DESC,id DESC").bind(ctx.organizationId));
    for(const row of assetRows){let payload=parseJson(row.payload_json,{});const attached=String(payload.attached||payload.projectId||'');if(!selected.has(String(row.id))&&![String(projectId),String(resolved.legacy?.reference||''),String(resolved.legacy?.name||'')].filter(Boolean).includes(attached))continue;payload=stripAssetFinancials(payload);assets.push({id:String(row.id),name:payload.name||payload.label||String(row.id),group:payload.group||'',condition:payload.condition||'',attached:payload.attached||'',vehicle:payload.vehicle||null,issues:issueRows.filter(issue=>String(issue.asset_id)===String(row.id)).slice(0,10).map(issue=>({id:issue.id,severity:issue.severity,description:issue.description,createdAt:issue.created_at}))})}
  }

  let documents={items:[],pageInfo:{limit:0,hasMore:false,nextCursor:null,moreEndpoint:null}},photos={items:[],pageInfo:{limit:0,hasMore:false,nextCursor:null,moreEndpoint:null}};
  if(ctx.roleCode==='OWNER'||documentView){const linked=await projectHubDocuments(env,ctx,projectId,20);documents=linked.documents;photos=linked.photos}

  let quotes=[];if(ctx.roleCode==='OWNER'||quoteView){
    const rowsQuotes=await rows(env.DB.prepare("SELECT * FROM quotes_server WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY issue_date DESC,created_at DESC,id").bind(ctx.organizationId,String(projectId)));
    quotes=rowsQuotes.map(row=>{const payload=quotePayload(row);return ctx.roleCode==='OWNER'||quotePrices?payload:stripQuotePrices(payload)});
  }

  const notifications=[];
  for(const task of visibleTasks){if(task.status==='blocked')notifications.push({type:'task_blocked',level:'warning',title:'Tâche bloquée',text:task.title,taskId:task.id});else if(task.status!=='done'&&['urgent','high'].includes(task.priority))notifications.push({type:'task_priority',level:task.priority==='urgent'?'urgent':'warning',title:task.priority==='urgent'?'Tâche urgente':'Tâche prioritaire',text:task.title,taskId:task.id});if(canManageTasks&&task.status==='done'&&!task.validatedAt)notifications.push({type:'task_validation',level:'info',title:'Validation nécessaire',text:task.title,taskId:task.id})}

  return json({
    schemaVersion:1,generatedAt:now(),date,project:projectHubIdentity(resolved,projectId),
    currentUser:{userId:ctx.uid,personId,role:ctx.roleCode,name:memberByUser.get(String(ctx.uid))?[memberByUser.get(String(ctx.uid)).first_name,memberByUser.get(String(ctx.uid)).last_name].filter(Boolean).join(' '):ctx.uid},
    capabilities:{manageTasks:canManageTasks,viewTasks:canManageTasks||taskView,consumeStock:canConsumeStock,updateAssignedTasks:ctx.roleCode==='OWNER'||await allowed(env,ctx,'tasks.update.assigned'),createNotes:ctx.roleCode==='OWNER'||noteCreate,uploadFieldPhotos:(ctx.roleCode==='OWNER'||noteCreate)&&(ctx.roleCode==='OWNER'||documentView),reportProblems:ctx.roleCode==='OWNER'||noteCreate,viewAssets:ctx.roleCode==='OWNER'||assetView,reportAssetIssues:ctx.roleCode==='OWNER'||assetIssue,viewQuotes:ctx.roleCode==='OWNER'||quoteView,viewQuotePrices:ctx.roleCode==='OWNER'||quotePrices,clockOwn:flags.owner||flags.createOwn,clockTeam:flags.owner||flags.createTeam,viewTeamTime:flags.owner||flags.viewTeam||flags.viewAll},
    team:{assignments,members:teamMembers},
    time:{entries:timeEntries.map(row=>({id:row.id,projectId:row.projectId,teamId:row.team,date:row.date,arrival:row.arrival,departure:row.departure,people:(row.people||[]).map(value=>String(value))})),openForCurrentUser:openForCurrentUser?{id:openForCurrentUser.id,teamId:openForCurrentUser.team_id||null,arrival:openForCurrentUser.arrival,date:openForCurrentUser.work_date}:null,breakMinutes:Number(openForCurrentUser?.break_minutes||workspaceBreakMinutes(state)||0)},
    tasks:visibleTasks,problems,notes:noteItems,materials,execution:{lines:parseJson(executionRow?.lines_json||'[]',[]),updatedAt:executionRow?.updated_at||null},assets,documents,photos,quotes,notifications
  });
}

async function projectCostControlRoute(request,env,ctx,projectId){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const forecast=await computeProjectFinancialForecast(env,ctx,projectId),externalCategories=['MATERIALS','SUBCONTRACTING','EQUIPMENT','OTHER','UNCLASSIFIED'],externalCostCents=externalCategories.reduce((sum,key)=>sum+Number(forecast.categories[key]?.costToDateCents||0),0),externalCatCents=externalCategories.reduce((sum,key)=>sum+Number(forecast.categories[key]?.catCents||0),0);
  return json({
    schemaVersion:1,
    source:'financial-forecast-v1',
    generatedAt:forecast.generatedAt,
    projectId:String(projectId),
    labour:{hours:Number(forecast.realized.labourMinutes||0)/60,actualCostCents:forecast.categories.LABOUR.costToDateCents,plannedCostCents:forecast.categories.LABOUR.budgetCents,remainingPlannedCostCents:forecast.categories.LABOUR.radCents},
    procurement:{orderedCents:forecast.procurement.orderedCents,receivedCents:forecast.procurement.receivedCents,invoicedCents:forecast.realized.supplierInvoicedHtCents,receivedNotInvoicedCents:forecast.procurement.receivedNotInvoicedCents,outstandingOrderCents:forecast.procurement.remainingOrderCents,costToDateCents:externalCostCents,exposureCents:externalCatCents,paidCents:forecast.realized.supplierPaidHtEquivalentCents,unpaidCents:forecast.realized.supplierOutstandingHtEquivalentCents,stockConsumedCents:forecast.realized.stockConsumedCents,pendingDeliveryOrders:forecast.procurement.pendingDeliveryOrders,supplierPriceVarianceCents:forecast.procurement.supplierPriceVarianceCents,supplierInvoiceMatchingPendingCents:forecast.procurement.supplierInvoiceMatchingPendingCents},
    costControl:{totalCostToDateCents:forecast.totals.costToDateCents,remainingCommitmentCents:forecast.totals.remainingCommitmentCents,radCents:forecast.totals.radCents,costAtCompletionCents:forecast.totals.catCents,projectedMarginCents:forecast.totals.projectedMarginCents,antiDoubleCounting:true,rule:'Source canonique: /api/projects/:id/financial-forecast'},
    client:{soldHtCents:forecast.realized.soldHtCents,invoicedHtCents:forecast.realized.invoicedHtCents,paidTotalCents:forecast.realized.collectedTtcCents,outstandingTotalCents:forecast.realized.clientOutstandingTtcCents,remainingToInvoiceHtCents:forecast.realized.remainingToInvoiceHtCents},
    profitability:{grossMarginHtCents:forecast.realized.grossMarginHtCents,grossMarginBasisPoints:forecast.realized.grossMarginBasisPoints},
    alerts:forecast.alerts,
    quality:{canonical:true,confidence:forecast.quality.confidence,reasons:forecast.quality.reasons}
  });
}


const FINANCIAL_CATEGORIES=['LABOUR','MATERIALS','SUBCONTRACTING','EQUIPMENT','OTHER'];
function nullableNonNegativeInteger(value,label){
  if(value===null||value===undefined||value==='')return null;
  const number=Number(value);
  if(!Number.isSafeInteger(number)||number<0)throw Object.assign(Error(label+' invalide.'),{status:400});
  return number;
}
function strictExpenseCategory(value){
  const key=String(value||'').trim().toLocaleLowerCase('fr').replace(/[’']/g,"'").replace(/\s+/g,' ');
  const map=new Map([
    ['labour','LABOUR'],['labor','LABOUR'],["main d'oeuvre",'LABOUR'],['main d’œuvre','LABOUR'],
    ['materials','MATERIALS'],['material','MATERIALS'],['matériaux','MATERIALS'],['materiaux','MATERIALS'],
    ['subcontracting','SUBCONTRACTING'],['sous-traitance','SUBCONTRACTING'],['sous traitance','SUBCONTRACTING'],
    ['equipment','EQUIPMENT'],['équipement','EQUIPMENT'],['equipement','EQUIPMENT'],['location matériel','EQUIPMENT'],['location materiel','EQUIPMENT'],
    ['other','OTHER'],['autre','OTHER']
  ]);
  return map.get(key)||'UNCLASSIFIED';
}
async function resolveFinancialProject(env,ctx,projectId){
  await requireFinanceProjectScope(env,ctx,projectId);
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),legacy=state&&workspaceProject(state,projectId);
  const relational=await env.DB.prepare('SELECT id,name,reference,status,street,postal_code,city,country,start_date,expected_end_date,actual_end_date,customer_id,created_at,updated_at FROM projects WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(projectId)).first();
  if(!legacy&&!relational)throw Object.assign(Error('Chantier introuvable.'),{status:404});
  return {source:legacy?'legacy':'relational',state,legacy:legacy||null,relational:relational||null};
}
async function activeFinancialBaseline(env,ctx,projectId){
  const row=await env.DB.prepare("SELECT * FROM project_financial_baselines WHERE organization_id=? AND project_id=? AND status='active' ORDER BY version DESC LIMIT 1").bind(ctx.organizationId,String(projectId)).first();
  if(!row)return null;
  const budgetRows=await rows(env.DB.prepare('SELECT category,budget_cents FROM project_cost_budgets WHERE baseline_id=? ORDER BY category').bind(row.id));
  const budgets=Object.fromEntries(FINANCIAL_CATEGORIES.map(category=>[category,null]));
  for(const budget of budgetRows)if(FINANCIAL_CATEGORIES.includes(budget.category))budgets[budget.category]=budget.budget_cents===null?null:Number(budget.budget_cents);
  return {row,budgets};
}
function financialBaselineJson(baseline){
  if(!baseline)return null;
  const row=baseline.row;
  return {id:row.id,projectId:row.project_id,version:Number(row.version),status:row.status,plannedMinutes:row.planned_minutes===null?null:Number(row.planned_minutes),hourlyCostCents:row.hourly_cost_cents===null?null:Number(row.hourly_cost_cents),progressBasisPoints:row.progress_basis_points===null?null:Number(row.progress_basis_points),budgets:{...baseline.budgets},createdBy:row.created_by,createdAt:row.created_at,updatedBy:row.updated_by,updatedAt:row.updated_at};
}
async function writeFinancialBaseline(env,ctx,projectId,input){
  const plannedMinutes=nullableNonNegativeInteger(input.plannedMinutes,'Minutes planifiées'),hourlyCostCents=nullableNonNegativeInteger(input.hourlyCostCents,'Coût horaire'),progressBasisPoints=nullableNonNegativeInteger(input.progressBasisPoints,'Avancement'),budgetsInput=input.budgets&&typeof input.budgets==='object'&&!Array.isArray(input.budgets)?input.budgets:{};
  if(progressBasisPoints!==null&&progressBasisPoints>10000)throw Object.assign(Error('Avancement invalide.'),{status:400});
  const extra=Object.keys(budgetsInput).filter(key=>!FINANCIAL_CATEGORIES.includes(key));if(extra.length)throw Object.assign(Error('Catégorie budgétaire invalide.'),{status:400});
  const budgets={};for(const category of FINANCIAL_CATEGORIES)budgets[category]=nullableNonNegativeInteger(Object.prototype.hasOwnProperty.call(budgetsInput,category)?budgetsInput[category]:null,'Budget '+category);
  const previous=await activeFinancialBaseline(env,ctx,projectId),nextVersion=previous?Number(previous.row.version)+1:1,baselineId=id('financial-baseline'),stamp=now(),statements=[];
  if(previous)statements.push(env.DB.prepare("UPDATE project_financial_baselines SET status='superseded',updated_by=?,updated_at=? WHERE id=? AND organization_id=? AND status='active'").bind(ctx.uid,stamp,previous.row.id,ctx.organizationId));
  statements.push(env.DB.prepare("INSERT INTO project_financial_baselines(id,organization_id,project_id,version,status,planned_minutes,hourly_cost_cents,progress_basis_points,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?, 'active',?,?,?,?,?,?,?)").bind(baselineId,ctx.organizationId,String(projectId),nextVersion,plannedMinutes,hourlyCostCents,progressBasisPoints,ctx.uid,stamp,ctx.uid,stamp));
  for(const category of FINANCIAL_CATEGORIES)statements.push(env.DB.prepare('INSERT INTO project_cost_budgets(baseline_id,category,budget_cents) VALUES(?,?,?)').bind(baselineId,category,budgets[category]));
  statements.push(auditStatement(env,ctx,'financial_baseline.created','project_financial_baseline',baselineId,{project_id:String(projectId),version:nextVersion,planned_minutes:plannedMinutes,hourly_cost_cents:hourlyCostCents,progress_basis_points:progressBasisPoints,budgets}));
  await dbBatch(env,statements);return activeFinancialBaseline(env,ctx,projectId);
}
function legacyFinanceCents(finance,key){
  if(!finance||!Object.prototype.hasOwnProperty.call(finance,key))return null;
  const value=Number(finance[key]);return Number.isFinite(value)&&value>=0?Math.round(value*100):null;
}
async function projectFinancialBaselineRoute(request,env,ctx,projectId,bootstrapMode=false){
  await requireProfitabilityRead(env,ctx);
  const project=await resolveFinancialProject(env,ctx,projectId);
  if(request.method==='GET'&&!bootstrapMode)return json({schemaVersion:1,generatedAt:now(),projectId:String(projectId),baseline:financialBaselineJson(await activeFinancialBaseline(env,ctx,projectId))});
  if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut modifier la baseline financière.'),{status:403});
  if(bootstrapMode){
    if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
    const existing=await activeFinancialBaseline(env,ctx,projectId);if(existing)return json({schemaVersion:1,generatedAt:now(),projectId:String(projectId),baseline:financialBaselineJson(existing),replayed:true},200);
    const finance=project.legacy?.finance||{},plannedHours=Object.prototype.hasOwnProperty.call(finance,'plannedHours')?Number(finance.plannedHours):NaN,hourly=Object.prototype.hasOwnProperty.call(finance,'hourlyCost')?Number(finance.hourlyCost):NaN,plannedMinutes=Number.isFinite(plannedHours)&&plannedHours>=0?Math.round(plannedHours*60):null,hourlyCostCents=Number.isFinite(hourly)&&hourly>=0?Math.round(hourly*100):null,progress=Number(project.legacy?.progress),progressBasisPoints=Number.isFinite(progress)&&progress>=0&&progress<=100?Math.round(progress*100):null;
    const labourBudget=plannedMinutes!==null&&hourlyCostCents!==null?Math.round(plannedMinutes*hourlyCostCents/60):null;
    const baseline=await writeFinancialBaseline(env,ctx,projectId,{plannedMinutes,hourlyCostCents,progressBasisPoints,budgets:{LABOUR:labourBudget,MATERIALS:legacyFinanceCents(finance,'materialsBudget'),SUBCONTRACTING:legacyFinanceCents(finance,'subcontractingBudget'),EQUIPMENT:null,OTHER:legacyFinanceCents(finance,'otherBudget')}});
    return json({schemaVersion:1,generatedAt:now(),projectId:String(projectId),baseline:financialBaselineJson(baseline)},201);
  }
  if(request.method!=='PUT')return json({error:'Méthode non autorisée.'},405);
  const data=exactObject(await body(request,50000),['plannedMinutes','hourlyCostCents','progressBasisPoints','budgets']),baseline=await writeFinancialBaseline(env,ctx,projectId,data);
  return json({schemaVersion:1,generatedAt:now(),projectId:String(projectId),baseline:financialBaselineJson(baseline)});
}
function quoteLinesHtCents(lines){return Math.round((Array.isArray(lines)?lines:[]).reduce((sum,line)=>sum+Math.max(0,Number(line.qty||0))*Math.max(0,Number(line.price||0)),0)*100)}
async function acceptedContractRevenueCents(env,ctx,projectId,state){
  const server=await rows(env.DB.prepare("SELECT lines_json FROM quotes_server WHERE organization_id=? AND project_id=? AND archived_at IS NULL AND status='accepted'").bind(ctx.organizationId,String(projectId)));
  if(server.length)return server.reduce((sum,row)=>sum+quoteLinesHtCents(parseJson(row.lines_json,[])),0);
  const accepted=(state?.quotes||[]).filter(quote=>String(quote.job)===String(projectId)&&['accepté','accepted'].includes(String(quote.status||'').trim().toLocaleLowerCase('fr')));
  return accepted.reduce((sum,quote)=>sum+quoteLinesHtCents(quote.lines),0);
}
function emptyFinancialCategory(){return {budgetCents:null,costToDateCents:0,remainingCommitmentCents:0,radCents:null,catCents:null}}
function sumOrNull(items,key){let total=0;for(const item of items){if(item[key]===null||item[key]===undefined)return null;total+=Number(item[key])}return total}
async function computeProjectFinancialForecast(env,ctx,projectId){
  await requireProfitabilityRead(env,ctx);
  const resolved=await resolveFinancialProject(env,ctx,projectId),baseline=await activeFinancialBaseline(env,ctx,projectId),categories=Object.fromEntries([...FINANCIAL_CATEGORIES,'UNCLASSIFIED'].map(category=>[category,emptyFinancialCategory()]));
  if(baseline)for(const category of FINANCIAL_CATEGORIES)categories[category].budgetCents=baseline.budgets[category];

  const acceptedQuotesCents=await acceptedContractRevenueCents(env,ctx,projectId,resolved.state),approvedChangesCents=approvedContractChangesCents(resolved.legacy),totalContractCents=acceptedQuotesCents+approvedChangesCents;
  const clockMinutes=value=>{const [h,m]=String(value||'').split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:0};
  const timeRows=await rows(env.DB.prepare("SELECT people_json,arrival,departure,break_minutes FROM time_entries WHERE organization_id=? AND project_id=? AND archived_at IS NULL AND departure IS NOT NULL").bind(ctx.organizationId,String(projectId)));
  let actualMinutes=0;for(const entry of timeRows){const people=timeEntryPeople(entry).length||1;actualMinutes+=Math.max(0,clockMinutes(entry.departure)-clockMinutes(entry.arrival)-Number(entry.break_minutes||0))*people}
  const pendingCorrectionRow=await env.DB.prepare("SELECT COUNT(*) count FROM time_entry_corrections c JOIN time_entries t ON t.id=c.time_entry_id AND t.organization_id=c.organization_id WHERE c.organization_id=? AND t.project_id=? AND t.archived_at IS NULL AND c.status='pending'").bind(ctx.organizationId,String(projectId)).first(),pendingTimeCorrections=Number(pendingCorrectionRow?.count||0);
  const hourlyCostCents=baseline?.row?.hourly_cost_cents===null||baseline?.row?.hourly_cost_cents===undefined?null:Number(baseline.row.hourly_cost_cents);
  categories.LABOUR.costToDateCents=hourlyCostCents===null?null:Math.round(actualMinutes*hourlyCostCents/60);

  const allocations=await rows(env.DB.prepare("SELECT a.amount_cents,e.category FROM supplier_allocations a JOIN expenses e ON e.id=a.expense_id AND e.organization_id=a.organization_id WHERE a.organization_id=? AND a.status='active' AND a.destination_type='project' AND a.destination_id=? AND e.archived_at IS NULL").bind(ctx.organizationId,String(projectId)));
  for(const allocation of allocations){const category=strictExpenseCategory(allocation.category);if(categories[category].costToDateCents===null)categories[category].costToDateCents=0;categories[category].costToDateCents+=Number(allocation.amount_cents||0)}

  const stockCostRow=await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN m.movement_type='sortie chantier' THEN m.quantity*m.unit_cost_cents WHEN m.movement_type='retour chantier' THEN -m.quantity*m.unit_cost_cents ELSE 0 END),0) amount_cents FROM field_stock_movements m WHERE m.organization_id=? AND m.project_id=? AND m.movement_type IN ('sortie chantier','retour chantier') AND NOT EXISTS (SELECT 1 FROM supplier_allocations a JOIN expenses e ON e.id=a.expense_id AND e.organization_id=a.organization_id JOIN field_delivery_notes n ON n.organization_id=e.organization_id AND (n.id=e.delivery_note_id OR n.order_id=e.purchase_order_id) JOIN field_delivery_lines l ON l.organization_id=n.organization_id AND l.delivery_note_id=n.id WHERE a.organization_id=m.organization_id AND a.status='active' AND a.destination_type='project' AND a.destination_id=m.project_id AND e.archived_at IS NULL AND l.stock_item_id=m.stock_item_id)").bind(ctx.organizationId,String(projectId)).first();
  const stockConsumedCents=Math.max(0,Math.round(Number(stockCostRow?.amount_cents||0)));
  categories.MATERIALS.costToDateCents=Number(categories.MATERIALS.costToDateCents||0)+stockConsumedCents;

  const orders=(resolved.state?.purchaseOrders||[]).filter(order=>String(order.job||'')===String(projectId)&&!['brouillon','annulée'].includes(order.status)),orderIds=new Set(orders.map(order=>String(order.id))),linesByOrderLine=new Map(),orderTotals=new Map(orders.map(order=>[String(order.id),{orderedCents:0,receivedCents:0,matchedExpectedCents:0,matchedActualCents:0,priceVarianceCents:0,pendingDelivery:false}]));
  for(const order of orders)for(const line of order.lines||[]){const quantity=Number(line.quantity||0),unitPrice=Number(line.unitPrice||0);linesByOrderLine.set(String(line.id),{orderId:String(order.id),quantity,unitPrice});const total=orderTotals.get(String(order.id));total.orderedCents+=Math.round(Math.max(0,quantity)*Math.max(0,unitPrice)*100)}
  const receivedMilli=new Map();
  if(orderIds.size){const deliveries=await rows(env.DB.prepare("SELECT n.order_id,l.order_line_id,l.received,l.condition FROM field_delivery_lines l JOIN field_delivery_notes n ON n.id=l.delivery_note_id AND n.organization_id=l.organization_id WHERE l.organization_id=?").bind(ctx.organizationId));for(const row of deliveries){if(!orderIds.has(String(row.order_id))||row.condition==='Refusé')continue;const key=String(row.order_line_id);receivedMilli.set(key,(receivedMilli.get(key)||0)+Math.round(Number(row.received||0)*1000))}}
  const invoicedByOrderCents=new Map();
  if(orderIds.size){const invoiceRows=await rows(env.DB.prepare("SELECT COALESCE(e.purchase_order_id,n.order_id) order_id,SUM(a.amount_cents) amount_cents FROM supplier_allocations a JOIN expenses e ON e.id=a.expense_id AND e.organization_id=a.organization_id LEFT JOIN field_delivery_notes n ON n.id=e.delivery_note_id AND n.organization_id=e.organization_id WHERE a.organization_id=? AND a.status='active' AND e.archived_at IS NULL AND COALESCE(e.purchase_order_id,n.order_id) IS NOT NULL GROUP BY COALESCE(e.purchase_order_id,n.order_id)").bind(ctx.organizationId));for(const row of invoiceRows)if(orderIds.has(String(row.order_id)))invoicedByOrderCents.set(String(row.order_id),Number(row.amount_cents||0))}
  const matchedByOrderLine=new Map();
  if(orderIds.size){const matchRows=await rows(env.DB.prepare("SELECT order_id,order_line_id,SUM(matched_cents) matched_cents,SUM(matched_quantity_milli) matched_quantity_milli FROM supplier_invoice_matches WHERE organization_id=? AND status='active' GROUP BY order_id,order_line_id").bind(ctx.organizationId));for(const row of matchRows)if(orderIds.has(String(row.order_id)))matchedByOrderLine.set(String(row.order_line_id),{matchedCents:Number(row.matched_cents||0),matchedQuantityMilli:Number(row.matched_quantity_milli||0)})}
  for(const [lineId,line] of linesByOrderLine){const received=Number(receivedMilli.get(lineId)||0),ordered=Math.max(0,Math.round(line.quantity*1000)),accepted=Math.min(ordered,received),orderTotal=orderTotals.get(line.orderId),matched=matchedByOrderLine.get(lineId);orderTotal.receivedCents+=Math.round(accepted/1000*Math.max(0,line.unitPrice)*100);if(accepted<ordered)orderTotal.pendingDelivery=true;if(matched?.matchedQuantityMilli>0){const matchedQuantityMilli=Math.min(accepted,matched.matchedQuantityMilli),matchedActualCents=Math.round(matched.matchedCents*matchedQuantityMilli/matched.matchedQuantityMilli),matchedExpectedCents=Math.round(matchedQuantityMilli/1000*Math.max(0,line.unitPrice)*100);orderTotal.matchedExpectedCents+=matchedExpectedCents;orderTotal.matchedActualCents+=matchedActualCents;orderTotal.priceVarianceCents+=Math.abs(matchedActualCents-matchedExpectedCents)}}
  let orderedPurchaseCents=0,receivedPurchaseCents=0,invoicedPurchaseCents=0,receivedNotInvoicedCents=0,remainingPurchaseOrderCents=0,pendingDeliveryOrders=0,supplierPriceVarianceCents=0,supplierInvoiceMatchingPendingCents=0;
  for(const [orderId,total] of orderTotals){const rawInvoiced=Math.max(0,Number(invoicedByOrderCents.get(orderId)||0)),invoiced=Math.min(total.orderedCents,rawInvoiced),uninvoicedInvoice=Math.max(0,rawInvoiced-total.matchedActualCents),uninvoicedReceived=Math.max(0,total.receivedCents-total.matchedExpectedCents-uninvoicedInvoice),remaining=Math.max(0,total.orderedCents-Math.max(total.receivedCents,invoiced));orderedPurchaseCents+=total.orderedCents;receivedPurchaseCents+=total.receivedCents;invoicedPurchaseCents+=rawInvoiced;receivedNotInvoicedCents+=uninvoicedReceived;remainingPurchaseOrderCents+=remaining;supplierPriceVarianceCents+=total.priceVarianceCents;supplierInvoiceMatchingPendingCents+=uninvoicedInvoice;if(total.pendingDelivery)pendingDeliveryOrders++;categories.UNCLASSIFIED.costToDateCents+=uninvoicedReceived;categories.UNCLASSIFIED.remainingCommitmentCents+=remaining}

  let labourRadStatus='UNKNOWN';
  if(categories.LABOUR.costToDateCents!==null&&baseline){
    const plannedMinutes=baseline.row.planned_minutes===null?null:Number(baseline.row.planned_minutes),progressBasisPoints=baseline.row.progress_basis_points===null?null:Number(baseline.row.progress_basis_points);
    if(plannedMinutes!==null&&hourlyCostCents!==null){const plannedCost=Math.round(plannedMinutes*hourlyCostCents/60);categories.LABOUR.radCents=Math.max(0,plannedCost-Number(categories.LABOUR.costToDateCents||0)-Number(categories.LABOUR.remainingCommitmentCents||0));labourRadStatus='PLANNED_HOURS'}
    else if(progressBasisPoints!==null&&progressBasisPoints>0){const estimatedCat=Math.round(Number(categories.LABOUR.costToDateCents||0)*10000/progressBasisPoints);categories.LABOUR.radCents=Math.max(0,estimatedCat-Number(categories.LABOUR.costToDateCents||0));labourRadStatus='PHYSICAL_PROGRESS'}
  }
  for(const category of ['MATERIALS','SUBCONTRACTING','EQUIPMENT','OTHER']){const item=categories[category];item.radCents=item.budgetCents===null?null:Math.max(0,Number(item.budgetCents)-Number(item.costToDateCents||0)-Number(item.remainingCommitmentCents||0))}
  categories.UNCLASSIFIED.radCents=0;
  for(const category of [...FINANCIAL_CATEGORIES,'UNCLASSIFIED']){const item=categories[category];item.catCents=item.costToDateCents===null||item.remainingCommitmentCents===null||item.radCents===null?null:Number(item.costToDateCents)+Number(item.remainingCommitmentCents)+Number(item.radCents)}
  categories.LABOUR.labourRadStatus=labourRadStatus;

  const core=FINANCIAL_CATEGORIES.map(category=>categories[category]),unclassified=categories.UNCLASSIFIED,unclassifiedCents=Number(unclassified.costToDateCents||0)+Number(unclassified.remainingCommitmentCents||0),costToDateCore=sumOrNull(core,'costToDateCents'),commitmentCore=sumOrNull(core,'remainingCommitmentCents'),radCore=sumOrNull(core,'radCents'),catCore=sumOrNull(core,'catCents');
  const totalCostToDateCents=costToDateCore===null?null:costToDateCore+Number(unclassified.costToDateCents||0),remainingCommitmentCents=commitmentCore===null?null:commitmentCore+Number(unclassified.remainingCommitmentCents||0),radCents=radCore,catCents=catCore===null?null:catCore+Number(unclassified.catCents||0),projectedMarginCents=projectedContractMarginCents(totalContractCents,catCents);
  const invoiceRows=await rows(env.DB.prepare("SELECT id,subtotal_cents,total_cents,amount_paid_cents FROM invoices WHERE organization_id=? AND archived_at IS NULL AND COALESCE(legacy_project_id,project_id)=? AND status NOT IN ('cancelled')").bind(ctx.organizationId,String(projectId))),invoiceIds=invoiceRows.map(row=>String(row.id)),creditByInvoice=new Map();
  if(invoiceIds.length){const marks=invoiceIds.map(()=>'?').join(','),credits=await rows(env.DB.prepare(`SELECT invoice_id,COALESCE(SUM(amount_cents),0) amount FROM credit_notes WHERE organization_id=? AND invoice_id IN (${marks}) GROUP BY invoice_id`).bind(ctx.organizationId,...invoiceIds));for(const credit of credits)creditByInvoice.set(String(credit.invoice_id),Number(credit.amount||0))}
  let clientInvoicedHtCents=0,clientCollectedTtcCents=0,clientOutstandingTtcCents=0;
  for(const invoice of invoiceRows){const total=Number(invoice.total_cents||0),paid=Number(invoice.amount_paid_cents||0),credit=Number(creditByInvoice.get(String(invoice.id))||0);clientInvoicedHtCents+=Number(invoice.subtotal_cents||0);clientCollectedTtcCents+=paid;clientOutstandingTtcCents+=Math.max(0,total-credit-paid)}

  const projectExpenseRows=await rows(env.DB.prepare("SELECT e.id,e.subtotal_cents,e.total_cents,e.payment_status,COALESCE(e.legacy_project_id,e.project_id) effective_project_id,COALESCE(a.project_allocated_cents,0) project_allocated_cents,COALESCE(a.allocation_count,0) allocation_count FROM expenses e LEFT JOIN (SELECT organization_id,expense_id,SUM(CASE WHEN status='active' AND destination_type='project' AND destination_id=? THEN amount_cents ELSE 0 END) project_allocated_cents,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) allocation_count FROM supplier_allocations GROUP BY organization_id,expense_id) a ON a.organization_id=e.organization_id AND a.expense_id=e.id WHERE e.organization_id=? AND e.archived_at IS NULL").bind(String(projectId),ctx.organizationId)),projectExpenseIds=projectExpenseRows.map(row=>String(row.id)),supplierPaidByExpense=new Map();
  if(projectExpenseIds.length){const marks=projectExpenseIds.map(()=>'?').join(','),paymentRows=await rows(env.DB.prepare(`SELECT expense_id,COALESCE(SUM(CASE WHEN status='active' THEN amount_cents ELSE 0 END),0) paid_cents FROM supplier_payments WHERE organization_id=? AND expense_id IN (${marks}) GROUP BY expense_id`).bind(ctx.organizationId,...projectExpenseIds));for(const payment of paymentRows)supplierPaidByExpense.set(String(payment.expense_id),Number(payment.paid_cents||0))}
  let supplierInvoicedHtCents=0,supplierPaidHtEquivalentCents=0,supplierOutstandingHtEquivalentCents=0;
  for(const expense of projectExpenseRows){const allocated=Number(expense.project_allocated_cents||0),allocationCount=Number(expense.allocation_count||0),fallback=!allocationCount&&String(expense.effective_project_id||'')===String(projectId)?Number(expense.subtotal_cents||0):0,cost=allocated||fallback;if(!cost)continue;const total=Math.max(0,Number(expense.total_cents||0)),rawPaid=supplierPaidByExpense.has(String(expense.id))?Number(supplierPaidByExpense.get(String(expense.id))):expense.payment_status==='paid'?total:0,ratio=total>0?Math.min(1,Math.max(0,rawPaid/total)):0,paidHt=Math.min(cost,Math.round(cost*ratio));supplierInvoicedHtCents+=cost;supplierPaidHtEquivalentCents+=paidHt;supplierOutstandingHtEquivalentCents+=Math.max(0,cost-paidHt)}
  const grossMarginHtCents=totalCostToDateCents===null?null:totalContractCents-totalCostToDateCents,grossMarginBasisPoints=grossMarginHtCents===null||totalContractCents<=0?null:Math.round(grossMarginHtCents*10000/totalContractCents),remainingToInvoiceHtCents=Math.max(0,totalContractCents-clientInvoicedHtCents);
  const realized={soldHtCents:totalContractCents,invoicedHtCents:clientInvoicedHtCents,collectedTtcCents:clientCollectedTtcCents,clientOutstandingTtcCents,costHtCents:totalCostToDateCents,grossMarginHtCents,grossMarginBasisPoints,remainingToInvoiceHtCents,labourMinutes:actualMinutes,supplierInvoicedHtCents,supplierPaidHtEquivalentCents,supplierOutstandingHtEquivalentCents,stockConsumedCents};

  const projectStatus=String(resolved.relational?.status||resolved.legacy?.status||resolved.legacy?.phase||'').trim().toLocaleLowerCase('fr'),projectClosed=Boolean(resolved.relational?.actual_end_date||resolved.legacy?.actualEndDate||resolved.legacy?.actual_end_date||['closed','complete','completed','finished','terminé','terminée','clôturé','clôturée','cloturé','cloturée','achevé','achevée'].includes(projectStatus));
  const plannedMinutesForQuality=baseline?.row?.planned_minutes===null||baseline?.row?.planned_minutes===undefined?null:Number(baseline.row.planned_minutes),missingClosedProjectTime=projectClosed&&actualMinutes===0&&(plannedMinutesForQuality===null||plannedMinutesForQuality>0);
  const reasons=[];if(!baseline)reasons.push('BASELINE_MISSING');if(categories.LABOUR.costToDateCents===null)reasons.push('LABOUR_HOURLY_COST_MISSING');for(const category of ['MATERIALS','SUBCONTRACTING','EQUIPMENT','OTHER'])if(categories[category].budgetCents===null)reasons.push('BUDGET_'+category+'_MISSING');if(labourRadStatus==='UNKNOWN')reasons.push('LABOUR_RAD_UNKNOWN');if(unclassifiedCents>0)reasons.push('UNCLASSIFIED_COSTS');if(pendingDeliveryOrders>0)reasons.push('SUPPLIER_DELIVERIES_PENDING');if(supplierPriceVarianceCents>0)reasons.push('SUPPLIER_PRICE_VARIANCE');if(supplierInvoiceMatchingPendingCents>0)reasons.push('SUPPLIER_INVOICE_MATCHING_INCOMPLETE');if(pendingTimeCorrections>0)reasons.push('TIME_CORRECTIONS_PENDING');if(missingClosedProjectTime)reasons.push('LABOUR_TIME_ENTRIES_MISSING');
  const critical=catCents===null||projectedMarginCents===null,confidence=critical?'LOW':reasons.length?'MEDIUM':'HIGH';
  return {schemaVersion:1,generatedAt:now(),projectId:String(projectId),revenue:{acceptedQuotesCents,approvedChangesCents,totalContractCents},realized,categories,totals:{costToDateCents:totalCostToDateCents,remainingCommitmentCents,radCents,catCents,projectedMarginCents},procurement:{orderedCents:orderedPurchaseCents,receivedCents:receivedPurchaseCents,invoicedCents:invoicedPurchaseCents,receivedNotInvoicedCents,pendingDeliveryOrders,remainingOrderCents:remainingPurchaseOrderCents,supplierPriceVarianceCents,supplierInvoiceMatchingPendingCents},alerts:{pendingTimeCorrections},quality:{confidence,reasons:[...new Set(reasons)],unclassifiedCents,stockConsumedCents},baseline:financialBaselineJson(baseline)};
}
async function projectFinancialForecastRoute(request,env,ctx,projectId){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  return json(await computeProjectFinancialForecast(env,ctx,projectId));
}


function hubLimit(url){
  const raw=url.searchParams.get('limit');if(raw===null||raw==='')return 20;
  const value=Number(raw);if(!Number.isInteger(value)||value<1)throw Object.assign(Error('Limite Hub invalide.'),{status:400});
  return Math.min(50,value);
}
function hubPage(items,limit,moreEndpoint=null){const page=items.slice(0,limit);return {items:page,pageInfo:{limit,hasMore:items.length>limit,nextCursor:null,moreEndpoint}}}
function safeIsoTimestamp(value){if(!value)return null;const time=Date.parse(String(value));return Number.isFinite(time)?new Date(time).toISOString():null}
function plainTimelineText(value,max=180){return String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
function timelineCursorEncode(event){
  const bytes=new TextEncoder().encode(JSON.stringify([event.occurredAt,event.id]));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function timelineCursorDecode(value){
  if(!value)return null;
  try{let raw=String(value).replace(/-/g,'+').replace(/_/g,'/');while(raw.length%4)raw+='=';const binary=atob(raw),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0)),parsed=JSON.parse(new TextDecoder().decode(bytes));if(!Array.isArray(parsed)||parsed.length!==2||!safeIsoTimestamp(parsed[0])||!String(parsed[1]||''))throw Error('invalid');return {occurredAt:safeIsoTimestamp(parsed[0]),id:String(parsed[1])}}catch{throw Object.assign(Error('Curseur Timeline invalide.'),{status:400})}
}
function timelineLimit(url){const raw=url.searchParams.get('limit');if(raw===null||raw==='')return 50;const value=Number(raw);if(!Number.isInteger(value)||value<1)throw Object.assign(Error('Limite Timeline invalide.'),{status:400});return Math.min(100,value)}
async function hubProjectCapabilities(env,ctx){
  const [
    quoteView,invoiceView,purchaseView,deliveryView,expenseView,allocationView,
    planningManage,taskAssigned,documentView,financialView,sensitiveHr,workspaceView
  ]=await Promise.all([
    'quotes.view','invoices.view','purchase_orders.view','deliveries.view','expenses.view','supplier_allocations.view',
    'planning.assignments.manage','tasks.view.assigned','documents.secure.view','margins.view','hr.sensitive.view','workspace.view'
  ].map(permission=>allowed(env,ctx,permission))),quotePrices=await quotePriceReadable(env,ctx);
  const financialData=ctx.roleCode==='OWNER'||await allowed(env,ctx,'accounting.view')||financialView,timeFlags=await timePermissionFlags(env,ctx),taskManage=await canManageProjectTasks(env,ctx),timeView=timeFlags.owner||timeFlags.viewOwn||timeFlags.viewTeam||timeFlags.viewAll;
  return {
    capabilities:{
      viewCommercial:Boolean(quoteView&&invoiceView),
      viewProcurement:Boolean(purchaseView&&deliveryView&&expenseView&&allocationView),
      viewLabour:Boolean(timeView&&(ctx.roleCode==='OWNER'||planningManage)),
      viewTasks:Boolean(taskManage||taskAssigned),
      viewDocuments:Boolean(documentView),
      viewFinancial:Boolean(financialView),
      viewSensitiveHr:Boolean(sensitiveHr)
    },
    rights:{quoteView,invoiceView,quotePrices,purchaseView,deliveryView,expenseView,allocationView,planningManage,taskAssigned,documentView,financialView,financialData,sensitiveHr,workspaceView,timeFlags,taskManage}
  };
}
async function resolveHubProject(env,ctx,projectId){
  await requireProjectScope(env,ctx,projectId);
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),legacy=state&&workspaceProject(state,projectId);
  const relational=await env.DB.prepare('SELECT p.*,c.id customer_id_join,c.company_name,c.first_name,c.last_name FROM projects p LEFT JOIN customers c ON c.id=p.customer_id AND c.organization_id=p.organization_id WHERE p.organization_id=? AND p.id=? AND p.archived_at IS NULL').bind(ctx.organizationId,String(projectId)).first();
  if(!legacy&&!relational)throw Object.assign(Error('Chantier introuvable.'),{status:404});
  return {source:legacy?'legacy':'relational',state,legacy:legacy||null,relational:relational||null};
}
function projectHubIdentity(resolved,projectId){
  if(resolved.source==='legacy'){
    const p=resolved.legacy,progress=Number(p?.progress),clientName=String(p?.client||'').trim()||null;
    return {id:String(projectId),source:'legacy',name:String(p?.name||''),reference:p?.reference==null?null:String(p.reference),phase:p?.phase==null?null:String(p.phase),status:p?.status==null?null:String(p.status),client:{id:null,name:clientName},address:{street:p?.address==null?null:String(p.address),postalCode:p?.postalCode==null?null:String(p.postalCode),city:p?.town==null?null:String(p.town),country:p?.country==null?null:String(p.country)},startDate:p?.startDate||null,endDate:p?.endDate||null,progressBasisPoints:Number.isFinite(progress)&&progress>=0&&progress<=100?Math.round(progress*100):null};
  }
  const p=resolved.relational,clientName=p.company_name||[p.first_name,p.last_name].filter(Boolean).join(' ')||null;
  return {id:String(projectId),source:'relational',name:p.name,reference:p.reference||null,phase:null,status:p.status||null,client:{id:p.customer_id_join||null,name:clientName},address:{street:p.street||null,postalCode:p.postal_code||null,city:p.city||null,country:p.country||null},startDate:p.start_date||null,endDate:p.actual_end_date||p.expected_end_date||null,progressBasisPoints:null};
}
function quoteHtCentsFromPayload(lines){return quoteLinesHtCents(lines)}
async function projectHubCommercial(env,ctx,resolved,projectId,rights,limit){
  const serverQuotes=await rows(env.DB.prepare("SELECT id,reference,status,title,issue_date,valid_until,lines_json FROM quotes_server WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY issue_date DESC,created_at DESC,id").bind(ctx.organizationId,String(projectId))),quoteItems=[],seenQuotes=new Set();
  for(const row of serverQuotes){seenQuotes.add(String(row.reference||row.id));quoteItems.push({id:row.id,reference:row.reference||null,status:row.status||null,title:row.title||null,issueDate:row.issue_date||null,validUntil:row.valid_until||null,amountHtCents:rights.quotePrices?quoteHtCentsFromPayload(parseJson(row.lines_json,[])):null})}
  if(resolved.source==='legacy')for(const quote of resolved.state?.quotes||[]){if(String(quote.job)!==String(projectId))continue;const key=String(quote.ref||quote.id);if(seenQuotes.has(key))continue;quoteItems.push({id:String(quote.id),reference:quote.ref||null,status:quote.status||null,title:quote.title||null,issueDate:quote.date||null,validUntil:quote.validUntil||null,amountHtCents:rights.quotePrices?quoteHtCentsFromPayload(quote.lines):null})}
  const invoiceRows=await rows(env.DB.prepare("SELECT id,invoice_number,status,issue_date,due_date,subtotal_cents,total_cents,amount_paid_cents FROM invoices WHERE organization_id=? AND archived_at IS NULL AND COALESCE(legacy_project_id,project_id)=? ORDER BY issue_date DESC,created_at DESC,id").bind(ctx.organizationId,String(projectId))),invoiceItems=invoiceRows.map(row=>({id:row.id,number:row.invoice_number,status:row.status,issueDate:row.issue_date,dueDate:row.due_date,...(rights.financialData?{amountHtCents:Number(row.subtotal_cents),amountTtcCents:Number(row.total_cents),paymentStatus:Number(row.amount_paid_cents)>=Number(row.total_cents)?'paid':Number(row.amount_paid_cents)>0?'partial':row.status}:{})}));
  if(resolved.source==='legacy'){const seen=new Set(invoiceItems.map(item=>String(item.number)));for(const invoice of resolved.state?.accountingData?.customerInvoices||[]){if(String(invoice.job)!==String(projectId)||seen.has(String(invoice.ref||invoice.id)))continue;invoiceItems.push({id:String(invoice.id),number:invoice.ref||null,status:invoice.status||null,issueDate:invoice.date||null,dueDate:invoice.due||null,...(rights.financialData?{amountHtCents:null,amountTtcCents:Number.isFinite(Number(invoice.amount))?Math.round(Number(invoice.amount)*100):null,paymentStatus:invoice.status==='Payée'?'paid':invoice.status||null}:{})})}}
  quoteItems.sort((a,b)=>String(b.issueDate||'').localeCompare(String(a.issueDate||''))||String(a.id).localeCompare(String(b.id)));invoiceItems.sort((a,b)=>String(b.issueDate||'').localeCompare(String(a.issueDate||''))||String(a.id).localeCompare(String(b.id)));
  return {section:{quotes:hubPage(quoteItems,limit,'/api/quotes'),clientInvoices:hubPage(invoiceItems,limit,'/api/invoices')},counts:{quotesCount:quoteItems.length,clientInvoicesCount:invoiceItems.length}};
}
async function projectHubProcurement(env,ctx,resolved,projectId,rights,limit){
  const orders=(resolved.state?.purchaseOrders||[]).filter(order=>String(order.job||'')===String(projectId)).map(order=>({id:String(order.id),reference:order.number||null,supplierId:order.supplierId==null?null:String(order.supplierId),supplierName:(resolved.state?.contacts||[]).find(contact=>String(contact.id)===String(order.supplierId))?.company||(resolved.state?.contacts||[]).find(contact=>String(contact.id)===String(order.supplierId))?.name||null,status:order.status||null,orderDate:order.date||null,expectedDate:order.expectedDate||null})).sort((a,b)=>String(b.orderDate||'').localeCompare(String(a.orderDate||''))||a.id.localeCompare(b.id));
  const orderProject=new Map((resolved.state?.purchaseOrders||[]).map(order=>[String(order.id),String(order.job||'')]));
  const deliveryRows=await rows(env.DB.prepare("SELECT id,order_id,supplier_id,project_id,number,delivery_date,status,created_at FROM field_delivery_notes WHERE organization_id=? ORDER BY delivery_date DESC,created_at DESC,id").bind(ctx.organizationId)),deliveries=deliveryRows.filter(row=>String(row.project_id||orderProject.get(String(row.order_id))||'')===String(projectId)).map(row=>({id:row.id,number:row.number||null,purchaseOrderId:row.order_id||null,supplierId:row.supplier_id||null,deliveryDate:row.delivery_date||null,status:row.status||null}));
  const expenseRows=await rows(env.DB.prepare("SELECT DISTINCT e.id,e.supplier_id,s.name supplier_name,e.supplier_reference,e.expense_date,e.category,e.payment_status,e.subtotal_cents,e.created_at FROM expenses e LEFT JOIN suppliers s ON s.id=e.supplier_id AND s.organization_id=e.organization_id LEFT JOIN supplier_allocations a ON a.organization_id=e.organization_id AND a.expense_id=e.id AND a.status='active' AND a.destination_type='project' WHERE e.organization_id=? AND e.archived_at IS NULL AND (COALESCE(e.legacy_project_id,e.project_id)=? OR a.destination_id=?) ORDER BY e.expense_date DESC,e.created_at DESC,e.id").bind(ctx.organizationId,String(projectId),String(projectId))),supplierExpenses=expenseRows.map(row=>({id:row.id,supplierId:row.supplier_id||null,supplierName:row.supplier_name||null,supplierReference:row.supplier_reference||null,expenseDate:row.expense_date||null,category:row.category||null,paymentStatus:row.payment_status||null,...(rights.financialData?{subtotalCents:Number(row.subtotal_cents)}:{})}));
  return {section:{purchaseOrders:hubPage(orders,limit,'/api/purchase-orders'),deliveries:hubPage(deliveries,limit,null),supplierExpenses:hubPage(supplierExpenses,limit,'/api/expenses')},counts:{purchaseOrdersCount:orders.length,deliveriesCount:deliveries.length,supplierExpensesCount:supplierExpenses.length}};
}
async function projectHubLabour(env,ctx,resolved,projectId,rights,limit){
  const flags=rights.timeFlags,personId=await currentPersonId(env,ctx),entryRows=await rows(env.DB.prepare("SELECT * FROM time_entries WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY work_date DESC,arrival DESC,created_at DESC,id DESC LIMIT 1000").bind(ctx.organizationId,String(projectId))),visibleEntries=[];
  for(const row of entryRows)if(await canReadTimeEntry(env,ctx,resolved.state||{},flags,personId,row))visibleEntries.push(row);
  const timeItems=visibleEntries.map(row=>({id:row.id,date:row.work_date,teamId:row.team_id||null,arrival:row.arrival,departure:row.departure||null,breakMinutes:Number(row.break_minutes||0),peopleCount:timeEntryPeople(row).length}));
  const assignmentRows=await rows(env.DB.prepare("SELECT id,assignment_date,team_id FROM field_assignments WHERE organization_id=? AND project_id=? ORDER BY assignment_date DESC,updated_at DESC,id LIMIT 1000").bind(ctx.organizationId,String(projectId))),assignments=assignmentRows.map(row=>({id:row.id,date:row.assignment_date,teamId:row.team_id||null}));
  const teamIds=new Set([...assignmentRows.map(row=>String(row.team_id||'')),...visibleEntries.map(row=>String(row.team_id||''))].filter(Boolean)),teams=[];
  for(const teamId of teamIds){const team=workspaceTeam(resolved.state,teamId);teams.push({id:teamId,name:team?.name||teamId})}
  teams.sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  return {section:{teams:hubPage(teams,limit,null),assignments:hubPage(assignments,limit,null),timeEntries:hubPage(timeItems,limit,'/api/time-entries?project_id='+encodeURIComponent(projectId))},count:timeItems.length};
}
async function hubProjectTasks(env,ctx,projectId,rights,limit){
  const query=rights.taskManage?"SELECT id,title,status,priority,due_at,assigned_to,completed_at,updated_at FROM project_tasks WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY updated_at DESC,id":"SELECT id,title,status,priority,due_at,assigned_to,completed_at,updated_at FROM project_tasks WHERE organization_id=? AND project_id=? AND assigned_to=? AND archived_at IS NULL ORDER BY updated_at DESC,id";
  let taskRows;try{taskRows=await rows(env.DB.prepare(query).bind(...(rights.taskManage?[ctx.organizationId,String(projectId)]:[ctx.organizationId,String(projectId),ctx.uid])))}catch(error){if(String(error?.message||'').includes('due_at')){const fallback=rights.taskManage?"SELECT id,title,status,priority,assigned_to,completed_at,updated_at FROM project_tasks WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY updated_at DESC,id":"SELECT id,title,status,priority,assigned_to,completed_at,updated_at FROM project_tasks WHERE organization_id=? AND project_id=? AND assigned_to=? AND archived_at IS NULL ORDER BY updated_at DESC,id";taskRows=await rows(env.DB.prepare(fallback).bind(...(rights.taskManage?[ctx.organizationId,String(projectId)]:[ctx.organizationId,String(projectId),ctx.uid])))}else throw error}
  const items=taskRows.map(row=>({id:row.id,title:row.title,status:row.status,priority:row.priority,dueAt:row.due_at||null,assignedTo:rights.sensitiveHr?(row.assigned_to||null):null,completedAt:row.completed_at||null})),open=items.filter(item=>item.status!=='done').length;
  return {section:hubPage(items,limit,'/api/projects/'+encodeURIComponent(projectId)+'/tasks'),openCount:open};
}
async function projectHubDocuments(env,ctx,projectId,limit){
  const linked=await rows(env.DB.prepare("SELECT d.id,d.title,d.original_name,d.category,d.content_type,d.sensitivity,d.created_at,d.updated_at,d.archived_at FROM secure_documents d JOIN document_relations r ON r.document_id=d.id AND r.organization_id=d.organization_id WHERE d.organization_id=? AND r.relation_type='project' AND r.relation_id=? AND d.archived_at IS NULL ORDER BY d.created_at DESC,d.id LIMIT 1000").bind(ctx.organizationId,String(projectId))),visible=[];
  for(const row of linked){const relations=await documentRelations(env,ctx,row.id);if(await canAccessSecureDocument(env,ctx,row,relations))visible.push(row)}
  const documents=visible.map(row=>({id:row.id,title:row.title||row.original_name||'',category:row.category||'other',contentType:row.content_type||null,sensitivity:row.sensitivity||'standard',createdAt:row.created_at})),photos=visible.filter(row=>String(row.content_type||'').startsWith('image/')).map(row=>({id:row.id,name:row.original_name||row.title||'',createdAt:row.created_at,source:'secure_documents'}));
  const more='/api/documents?relation_type=project&relation_id='+encodeURIComponent(projectId);
  return {documents:hubPage(documents,limit,more),photos:hubPage(photos,limit,more),documentsCount:documents.length,photosCount:photos.length};
}
async function projectHubRoute(request,url,env,ctx,projectId){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const resolved=await resolveHubProject(env,ctx,projectId),limit=hubLimit(url),{capabilities,rights}=await hubProjectCapabilities(env,ctx),summary={quotesCount:null,clientInvoicesCount:null,supplierExpensesCount:null,purchaseOrdersCount:null,deliveriesCount:null,timeEntriesCount:null,openTasksCount:null,documentsCount:null,photosCount:null};
  let commercial=null,procurement=null,labour=null,tasks=null,documents=null,photos=null;
  if(capabilities.viewCommercial){const data=await projectHubCommercial(env,ctx,resolved,projectId,rights,limit);commercial=data.section;summary.quotesCount=data.counts.quotesCount;summary.clientInvoicesCount=data.counts.clientInvoicesCount}
  if(capabilities.viewProcurement){const data=await projectHubProcurement(env,ctx,resolved,projectId,rights,limit);procurement=data.section;summary.purchaseOrdersCount=data.counts.purchaseOrdersCount;summary.deliveriesCount=data.counts.deliveriesCount;summary.supplierExpensesCount=data.counts.supplierExpensesCount}
  if(capabilities.viewLabour){const data=await projectHubLabour(env,ctx,resolved,projectId,rights,limit);labour=data.section;summary.timeEntriesCount=data.count}
  if(capabilities.viewTasks){const data=await hubProjectTasks(env,ctx,projectId,rights,limit);tasks=data.section;summary.openTasksCount=data.openCount}
  if(capabilities.viewDocuments){const data=await projectHubDocuments(env,ctx,projectId,limit);documents=data.documents;photos=data.photos;summary.documentsCount=data.documentsCount;summary.photosCount=data.photosCount}
  return json({schemaVersion:1,generatedAt:now(),projectId:String(projectId),identity:projectHubIdentity(resolved,projectId),capabilities,summary,commercial,procurement,labour,tasks,documents,photos});
}
function timelineEvent({id,type,occurredAt,title,description='',entityType,entityId,actorId=null,metadata={}}){const stamp=safeIsoTimestamp(occurredAt);if(!stamp)return null;return {id:String(id),type,occurredAt:stamp,title:plainTimelineText(title,120),description:plainTimelineText(description,220),entityType:String(entityType),entityId:String(entityId),actorId:actorId||null,metadata}}
async function projectTimelineEvents(env,ctx,resolved,projectId,rights){
  const events=[],actor=value=>rights.sensitiveHr&&value?String(value):null,push=value=>{if(value)events.push(value)};
  if(rights.quoteView){
    const list=await rows(env.DB.prepare("SELECT id,reference,title,created_at,created_by FROM quotes_server WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 1000").bind(ctx.organizationId,String(projectId)));
    for(const row of list)push(timelineEvent({id:'quote:'+row.id+':created',type:'QUOTE_CREATED',occurredAt:row.created_at,title:'Devis créé',description:row.reference||row.title||'',entityType:'quote',entityId:row.id,actorId:actor(row.created_by),metadata:{reference:row.reference||null}}));
  }
  if(rights.purchaseView){
    const auditRows=await rows(env.DB.prepare("SELECT id,entity_id,new_values,created_at,user_id FROM audit_logs WHERE organization_id=? AND action='purchase_order.created' ORDER BY created_at DESC LIMIT 1000").bind(ctx.organizationId));
    for(const row of auditRows){const data=parseJson(row.new_values||'{}',{});if(String(data.project_id||'')!==String(projectId))continue;push(timelineEvent({id:'purchase_order:'+row.entity_id+':created',type:'PURCHASE_ORDER_CREATED',occurredAt:row.created_at,title:'Commande fournisseur créée',description:data.number||'',entityType:'purchase_order',entityId:row.entity_id,actorId:actor(row.user_id),metadata:{reference:data.number||null}}))}
  }
  if(rights.deliveryView){
    const list=await rows(env.DB.prepare("SELECT id,order_id,project_id,number,created_at,created_by FROM field_delivery_notes WHERE organization_id=? AND project_id=? ORDER BY created_at DESC,id LIMIT 1000").bind(ctx.organizationId,String(projectId)));
    for(const row of list)push(timelineEvent({id:'delivery:'+row.id+':received',type:'DELIVERY_RECEIVED',occurredAt:row.created_at,title:'Livraison reçue',description:row.number||'',entityType:'delivery',entityId:row.id,actorId:actor(row.created_by),metadata:{number:row.number||null,purchaseOrderId:row.order_id||null}}));
  }
  if(rights.expenseView){
    const list=await rows(env.DB.prepare("SELECT DISTINCT e.id,e.supplier_reference,e.created_at,e.created_by FROM expenses e LEFT JOIN supplier_allocations a ON a.organization_id=e.organization_id AND a.expense_id=e.id AND a.status='active' AND a.destination_type='project' WHERE e.organization_id=? AND e.archived_at IS NULL AND (COALESCE(e.legacy_project_id,e.project_id)=? OR a.destination_id=?) ORDER BY e.created_at DESC,e.id LIMIT 1000").bind(ctx.organizationId,String(projectId),String(projectId)));
    for(const row of list)push(timelineEvent({id:'expense:'+row.id+':created',type:'SUPPLIER_INVOICE_CREATED',occurredAt:row.created_at,title:'Facture fournisseur créée',description:row.supplier_reference||'',entityType:'expense',entityId:row.id,actorId:actor(row.created_by),metadata:{supplierReference:row.supplier_reference||null}}));
  }
  if(rights.allocationView){
    const list=await rows(env.DB.prepare("SELECT id,expense_id,amount_cents,created_at,created_by,status,cancelled_at,cancelled_by FROM supplier_allocations WHERE organization_id=? AND destination_type='project' AND destination_id=? ORDER BY created_at DESC,id LIMIT 1000").bind(ctx.organizationId,String(projectId)));
    for(const row of list){push(timelineEvent({id:'supplier_allocation:'+row.id+':created',type:'SUPPLIER_ALLOCATION_CREATED',occurredAt:row.created_at,title:'Ventilation fournisseur créée',description:'',entityType:'supplier_allocation',entityId:row.id,actorId:actor(row.created_by),metadata:{expenseId:row.expense_id}}));if(row.cancelled_at)push(timelineEvent({id:'supplier_allocation:'+row.id+':cancelled',type:'SUPPLIER_ALLOCATION_CANCELLED',occurredAt:row.cancelled_at,title:'Ventilation fournisseur annulée',description:'',entityType:'supplier_allocation',entityId:row.id,actorId:actor(row.cancelled_by),metadata:{expenseId:row.expense_id}}))}
  }
  if(rights.invoiceView){
    const list=await rows(env.DB.prepare("SELECT id,invoice_number,created_at,created_by,status FROM invoices WHERE organization_id=? AND archived_at IS NULL AND COALESCE(legacy_project_id,project_id)=? ORDER BY created_at DESC,id LIMIT 1000").bind(ctx.organizationId,String(projectId)));
    for(const row of list)push(timelineEvent({id:'invoice:'+row.id+':created',type:'CLIENT_INVOICE_CREATED',occurredAt:row.created_at,title:'Facture client créée',description:row.invoice_number||'',entityType:'invoice',entityId:row.id,actorId:actor(row.created_by),metadata:{number:row.invoice_number||null}}));
    const paid=await rows(env.DB.prepare("SELECT i.id,i.invoice_number,MAX(p.created_at) paid_at FROM invoices i JOIN payments p ON p.invoice_id=i.id AND p.organization_id=i.organization_id WHERE i.organization_id=? AND i.archived_at IS NULL AND COALESCE(i.legacy_project_id,i.project_id)=? AND i.status='paid' GROUP BY i.id,i.invoice_number ORDER BY paid_at DESC LIMIT 1000").bind(ctx.organizationId,String(projectId)));
    for(const row of paid)push(timelineEvent({id:'invoice:'+row.id+':paid',type:'CLIENT_INVOICE_PAID',occurredAt:row.paid_at,title:'Facture client payée',description:row.invoice_number||'',entityType:'invoice',entityId:row.id,actorId:null,metadata:{number:row.invoice_number||null}}));
  }
  const flags=rights.timeFlags,personId=await currentPersonId(env,ctx),timeRowsAll=await rows(env.DB.prepare("SELECT * FROM time_entries WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY created_at DESC,id LIMIT 1000").bind(ctx.organizationId,String(projectId)));
  for(const row of timeRowsAll){if(!await canReadTimeEntry(env,ctx,resolved.state||{},flags,personId,row))continue;push(timelineEvent({id:'time_entry:'+row.id+':started',type:'TIME_ENTRY_STARTED',occurredAt:row.created_at,title:'Pointage démarré',description:row.work_date||'',entityType:'time_entry',entityId:row.id,actorId:actor(row.created_by),metadata:{date:row.work_date,teamId:row.team_id||null}}));if(row.departure)push(timelineEvent({id:'time_entry:'+row.id+':completed',type:'TIME_ENTRY_COMPLETED',occurredAt:row.updated_at,title:'Pointage terminé',description:row.work_date||'',entityType:'time_entry',entityId:row.id,actorId:actor(row.updated_by),metadata:{date:row.work_date,teamId:row.team_id||null}}))}
  if(rights.taskManage||rights.taskAssigned){
    const query=rights.taskManage?"SELECT id,title,status,assigned_to,created_at,created_by,completed_at,updated_at FROM project_tasks WHERE organization_id=? AND project_id=? AND archived_at IS NULL ORDER BY created_at DESC,id LIMIT 1000":"SELECT id,title,status,assigned_to,created_at,created_by,completed_at,updated_at FROM project_tasks WHERE organization_id=? AND project_id=? AND assigned_to=? AND archived_at IS NULL ORDER BY created_at DESC,id LIMIT 1000",list=await rows(env.DB.prepare(query).bind(...(rights.taskManage?[ctx.organizationId,String(projectId)]:[ctx.organizationId,String(projectId),ctx.uid])));
    for(const row of list){push(timelineEvent({id:'task:'+row.id+':created',type:'TASK_CREATED',occurredAt:row.created_at,title:'Tâche créée',description:row.title||'',entityType:'task',entityId:row.id,actorId:actor(row.created_by),metadata:{status:row.status}}));if(row.completed_at)push(timelineEvent({id:'task:'+row.id+':completed',type:'TASK_COMPLETED',occurredAt:row.completed_at,title:'Tâche terminée',description:row.title||'',entityType:'task',entityId:row.id,actorId:actor(row.assigned_to),metadata:{status:row.status}}))}
  }
  if(rights.documentView){
    const linked=await rows(env.DB.prepare("SELECT d.id,d.title,d.original_name,d.content_type,d.sensitivity,d.created_at,d.uploaded_by FROM secure_documents d JOIN document_relations r ON r.document_id=d.id AND r.organization_id=d.organization_id WHERE d.organization_id=? AND r.relation_type='project' AND r.relation_id=? AND d.archived_at IS NULL ORDER BY d.created_at DESC,d.id LIMIT 1000").bind(ctx.organizationId,String(projectId)));
    for(const row of linked){const relations=await documentRelations(env,ctx,row.id);if(!await canAccessSecureDocument(env,ctx,row,relations))continue;push(timelineEvent({id:'document:'+row.id+':added',type:'DOCUMENT_ADDED',occurredAt:row.created_at,title:'Document ajouté',description:row.title||row.original_name||'',entityType:'document',entityId:row.id,actorId:actor(row.uploaded_by),metadata:{contentType:row.content_type||null}}))}
  }
  if(rights.workspaceView){
    const notes=await rows(env.DB.prepare("SELECT id,visibility,created_at,created_by FROM field_project_notes WHERE organization_id=? AND project_id=? ORDER BY created_at DESC,id LIMIT 1000").bind(ctx.organizationId,String(projectId)));
    for(const row of notes){if(row.visibility==='Patron uniquement'&&ctx.roleCode!=='OWNER')continue;push(timelineEvent({id:'project_note:'+row.id+':added',type:'PROJECT_NOTE_ADDED',occurredAt:row.created_at,title:'Remarque chantier ajoutée',description:'',entityType:'project_note',entityId:row.id,actorId:actor(row.created_by),metadata:{visibility:row.visibility||null}}))}
  }
  return events;
}
async function projectTimelineRoute(request,url,env,ctx,projectId){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const resolved=await resolveHubProject(env,ctx,projectId),limit=timelineLimit(url),cursor=timelineCursorDecode(url.searchParams.get('cursor')),{rights}=await hubProjectCapabilities(env,ctx),events=await projectTimelineEvents(env,ctx,resolved,projectId,rights);
  events.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)||a.id.localeCompare(b.id));
  const filtered=cursor?events.filter(event=>event.occurredAt<cursor.occurredAt||(event.occurredAt===cursor.occurredAt&&event.id>cursor.id)):events,page=filtered.slice(0,limit),hasMore=filtered.length>limit,nextCursor=hasMore&&page.length?timelineCursorEncode(page[page.length-1]):null;
  return json({schemaVersion:1,generatedAt:now(),projectId:String(projectId),events:page,pageInfo:{limit,hasMore,nextCursor}});
}

async function projectRoute(request,env,ctx,projectId){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const [allProjects,assignedProjects]=await Promise.all([allowed(env,ctx,'projects.view.all'),allowed(env,ctx,'projects.view.assigned')]);
  if(!allProjects&&!assignedProjects)throw Object.assign(Error('Vous ne pouvez pas consulter ce chantier.'),{status:403});
  if(!allProjects){
    const grant=await env.DB.prepare('SELECT 1 ok FROM project_access WHERE organization_id=? AND user_id=? AND project_id=?').bind(ctx.organizationId,ctx.uid,String(projectId)).first();
    if(!grant)throw Object.assign(Error('Vous ne pouvez pas consulter ce chantier.'),{status:403});
  }
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  const project=(state?.jobs||[]).find(job=>String(job.id)===String(projectId));
  if(!project)return json({error:'Chantier introuvable.'},404);
  const canSeeMargins=await allowed(env,ctx,'margins.view');
  return json({project:canSeeMargins?project:omit(project,['finance','contractAmount','currentContractAmount','contractAmendments'])});
}


// D1 rows/BLOBs are limited to 2,000,000 bytes. Keep headroom for row overhead until private object storage is introduced.
const DOCUMENT_MAX_BYTES=1800000;
const DOCUMENT_MIME_TYPES=new Set(['application/pdf','image/jpeg','image/png','image/webp','audio/webm','audio/mp4']);
const DOCUMENT_RELATION_TYPES=new Set(['customer','supplier','person','project','quote','invoice','expense','payment','purchase_order','delivery','asset']);
const DOCUMENT_OWNER_TYPES=new Set(['organization',...DOCUMENT_RELATION_TYPES]);
const DOCUMENT_ORIGINS=new Set(['manual_upload','mobile_upload','email_import','generated','scanner','migration','legacy','other']);
const DOCUMENT_CLIENT_ORIGINS=new Set(['manual_upload','mobile_upload','email_import','scanner','other']);
function documentText(value,max=500){const text=String(value??'').trim();if(text.length>max)throw Object.assign(Error('Champ documentaire trop long.'),{status:400});return text}
function documentSensitivity(value){const sensitivity=String(value||'standard');if(!['standard','confidential','restricted'].includes(sensitivity))throw Object.assign(Error('Confidentialité documentaire invalide.'),{status:400});return sensitivity}
function documentCategory(value){const category=documentText(value||'other',80)||'other';if(!/^[\p{L}\p{N} _./&'()-]{1,80}$/u.test(category))throw Object.assign(Error('Catégorie documentaire invalide.'),{status:400});return category}
function documentType(value){const type=String(value||'other').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(type))throw Object.assign(Error('Type documentaire invalide.'),{status:400});return type}
function documentDate(value){const date=String(value||'').trim();if(!date)return null;if(!validIsoDate(date))throw Object.assign(Error('Date documentaire invalide.'),{status:400});return date}
function documentOrigin(value,{client=false}={}){const origin=String(value||'manual_upload').trim(),allowedOrigins=client?DOCUMENT_CLIENT_ORIGINS:DOCUMENT_ORIGINS;if(!allowedOrigins.has(origin))throw Object.assign(Error('Origine documentaire invalide.'),{status:400});return origin}
function safeOriginalName(value){const name=String(value||'document').replace(/[\\/\0-\x1f\x7f]/g,'_').replace(/\.\.+/g,'.').trim().slice(0,180);return name||'document'}
function documentExtensionMatches(name,mime){const lower=String(name||'').toLowerCase(),allowed={'application/pdf':['.pdf'],'image/jpeg':['.jpg','.jpeg'],'image/png':['.png'],'image/webp':['.webp'],'audio/webm':['.webm'],'audio/mp4':['.m4a','.mp4']}[mime]||[];return allowed.some(extension=>lower.endsWith(extension))}
async function sha256Hex(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')}
function detectedDocumentMime(bytes){const b=new Uint8Array(bytes);if(b.length>=5&&b[0]===0x25&&b[1]===0x50&&b[2]===0x44&&b[3]===0x46&&b[4]===0x2d)return'application/pdf';if(b.length>=3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return'image/jpeg';if(b.length>=8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47&&b[4]===0x0d&&b[5]===0x0a&&b[6]===0x1a&&b[7]===0x0a)return'image/png';if(b.length>=12&&String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP')return'image/webp';if(b.length>=4&&b[0]===0x1a&&b[1]===0x45&&b[2]===0xdf&&b[3]===0xa3)return'audio/webm';if(b.length>=12&&String.fromCharCode(...b.slice(4,8))==='ftyp')return'audio/mp4';return''}
async function ensureDocumentRootFolder(env,ctx){const folderId=`documents-root-${ctx.organizationId}`,stamp=now();await env.DB.prepare("INSERT OR IGNORE INTO document_folders(id,organization_id,parent_id,name,context_type,context_id,sensitivity,created_by,created_at,updated_at) VALUES(?,?,NULL,'Documents','company',NULL,'standard',?,?,?)").bind(folderId,ctx.organizationId,ctx.uid,stamp,stamp).run();return folderId}
async function documentRelations(env,ctx,documentId){const standard=await rows(env.DB.prepare('SELECT id,relation_type,relation_id,created_by,created_at FROM document_relations WHERE organization_id=? AND document_id=? ORDER BY created_at,id').bind(ctx.organizationId,documentId)),visitRows=await rows(env.DB.prepare("SELECT visit_id,created_by,created_at FROM quote_site_visit_document_relations WHERE organization_id=? AND document_id=?").bind(ctx.organizationId,documentId));return [...standard,...visitRows.map(row=>({id:`quote-visit:${row.visit_id}:${documentId}`,relation_type:'quote_visit',relation_id:row.visit_id,created_by:row.created_by,created_at:row.created_at}))]}
async function secureDocument(env,ctx,documentId,{includeArchived=true}={}){const row=await env.DB.prepare(`SELECT id,organization_id,folder_id,storage_key,original_name,title,description,category,reference,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason FROM secure_documents WHERE organization_id=? AND id=?${includeArchived?'':' AND archived_at IS NULL'}`).bind(ctx.organizationId,String(documentId||'')).first();return row||null}
async function relationExists(env,ctx,type,targetId){
  if(!DOCUMENT_RELATION_TYPES.has(type))throw Object.assign(Error('Type de relation documentaire non autorisé.'),{status:400});
  const target=String(targetId||'').trim();if(!target||target.length>200)throw Object.assign(Error('Ressource liée invalide.'),{status:400});
  if(type==='quote_visit'){const visit=await env.DB.prepare('SELECT quote_id FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,target).first();if(!visit)throw Object.assign(Error('Dossier de visite introuvable.'),{status:404});await requirePermission(env,ctx,'quotes.view');if(visit.quote_id){const quote=await env.DB.prepare('SELECT project_id FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,visit.quote_id).first();if(!quote)throw Object.assign(Error('Devis introuvable.'),{status:404});if(quote.project_id)await requireFinanceProjectScope(env,ctx,quote.project_id)}return}
  if(type==='project'){const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),legacy=Boolean((state?.jobs||[]).some(item=>String(item.id)===target)),row=await env.DB.prepare('SELECT 1 ok FROM projects WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,target).first();if(!legacy&&!row)throw Object.assign(Error('Ressource liée introuvable.'),{status:404});await requireProjectScope(env,ctx,target);return}
  if(type==='person'||type==='quote'||type==='purchase_order'||type==='asset'){
    const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),collection=type==='person'?state?.people:type==='quote'?state?.quotes:type==='purchase_order'?state?.purchaseOrders:state?.assets;
    let exists=Boolean((collection||[]).some(item=>String(item.id)===target));
    if(type==='quote'){const serverQuote=await env.DB.prepare('SELECT project_id FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,target).first();if(serverQuote){exists=true;if(serverQuote.project_id)await requireProjectScope(env,ctx,serverQuote.project_id)}if(ctx.roleCode!=='OWNER'){await requirePermission(env,ctx,'quotes.view');await requireQuotePriceRead(env,ctx)}}
    if(type==='asset'&&!exists)exists=Boolean(await env.DB.prepare('SELECT 1 ok FROM field_assets WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,target).first());
    if(!exists)throw Object.assign(Error('Ressource liée introuvable.'),{status:404});
    if(type==='person'&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'hr.sensitive.view'))throw Object.assign(Error('Vous ne pouvez pas lier un document à ce dossier personnel.'),{status:403});
    return;
  }
  const tables={customer:['customers','archived_at IS NULL'],supplier:['suppliers','archived_at IS NULL'],invoice:['invoices','archived_at IS NULL'],expense:['expenses','archived_at IS NULL'],payment:['payments','1=1'],delivery:['field_delivery_notes','1=1']},config=tables[type];
  if(!config)throw Object.assign(Error('Type de relation documentaire non pris en charge.'),{status:400});
  const row=await env.DB.prepare(`SELECT 1 ok FROM ${config[0]} WHERE organization_id=? AND id=? AND ${config[1]}`).bind(ctx.organizationId,target).first();if(!row)throw Object.assign(Error('Ressource liée introuvable.'),{status:404});
  if(['invoice','expense','payment'].includes(type)&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'accounting.view'))throw Object.assign(Error('Vous ne pouvez pas lier ce document à une donnée comptable.'),{status:403});
}
async function documentBusinessOwner(env,ctx,typeValue,idValue){const type=String(typeValue||'organization').trim();if(!DOCUMENT_OWNER_TYPES.has(type))throw Object.assign(Error('Propriétaire métier documentaire invalide.'),{status:400});if(type==='organization'){const target=String(idValue||ctx.organizationId).trim();if(target!==ctx.organizationId)throw Object.assign(Error('Ressource liée introuvable.'),{status:404});return {type,targetId:ctx.organizationId}}const targetId=String(idValue||'').trim();if(!targetId||targetId.length>200)throw Object.assign(Error('Propriétaire métier documentaire incomplet.'),{status:400});await relationExists(env,ctx,type,targetId);return {type,targetId}}
async function canAccessSecureDocument(env,ctx,document,relations=null){
  const scanAccess=await deliveryScanDocumentAccess(env,ctx,document.id,deliveryScanHooks());
  if(scanAccess===false)return false;
  if(ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'documents.secure.view'))return false;
  if(document.sensitivity!=='standard'&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'documents.secure.confidential'))return false;
  const links=relations||await documentRelations(env,ctx,document.id);
  const visitDocuments=await rows(env.DB.prepare('SELECT visit_id FROM quote_site_visit_document_relations WHERE organization_id=? AND document_id=?').bind(ctx.organizationId,document.id));
  if(visitDocuments.length){if(ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'quotes.view'))return false;for(const link of visitDocuments){const visit=await env.DB.prepare('SELECT quote_id FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,link.visit_id).first();if(!visit)return false;if(visit.quote_id){const quote=await env.DB.prepare('SELECT project_id FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,visit.quote_id).first();if(!quote)return false;if(quote.project_id&&!await hasProjectScope(env,ctx,quote.project_id))return false}}}
  const accounting=await hasTenantFinanceScope(env,ctx);
  const financeLinked=links.some(relation=>['invoice','expense','payment'].includes(relation.relation_type))||
    links.some(relation=>relation.relation_type==='purchase_order')&&await allowed(env,ctx,'purchase_orders.view')||
    links.some(relation=>relation.relation_type==='quote')&&await allowed(env,ctx,'quotes.view')&&await quotePriceReadable(env,ctx)||
    links.some(relation=>relation.relation_type==='quote_visit')&&await allowed(env,ctx,'quotes.view');
  if(accounting&&!financeLinked)return false;
  for(const relation of links){
    if(relation.relation_type==='quote_visit'&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'quotes.view'))return false;
    if(relation.relation_type==='project'&&!accounting&&!await hasProjectScope(env,ctx,relation.relation_id))return false;
    if(relation.relation_type==='person'&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'hr.sensitive.view'))return false;
    if(['invoice','expense','payment'].includes(relation.relation_type)&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'accounting.view'))return false;
    if(relation.relation_type==='quote'&&ctx.roleCode!=='OWNER'&&(!await allowed(env,ctx,'quotes.view')||!await quotePriceReadable(env,ctx)))return false;
  }
  return true;
}
async function requireDocumentView(env,ctx,document,relations=null){if(!await canAccessSecureDocument(env,ctx,document,relations))throw Object.assign(Error('Document introuvable.'),{status:404})}
async function requireDocumentManage(env,ctx){await requirePermission(env,ctx,'documents.secure.manage')}
function documentJson(document,relations=[]){return {id:document.id,originalName:document.original_name,title:document.title||document.original_name,description:document.description||'',category:document.category||'other',documentType:document.document_type||'other',documentDate:document.document_date||null,origin:document.origin||'legacy',ownerType:document.business_owner_type||'organization',ownerId:document.business_owner_id||document.organization_id,classificationSource:document.classification_source||'manual',ocrStatus:document.ocr_status||'not_requested',reference:document.reference||'',contentType:document.content_type,byteSize:Number(document.byte_size||0),checksumSha256:document.checksum_sha256||'',sensitivity:document.sensitivity,status:document.status,uploadedBy:document.uploaded_by,createdAt:document.created_at,updatedAt:document.updated_at,archivedAt:document.archived_at||null,archivedReason:document.archived_reason||'',relations:relations.map(relation=>({id:relation.id,type:relation.relation_type,targetId:relation.relation_id,createdAt:relation.created_at}))}}
function documentCursorSortDate(document){return String(document.document_date||document.created_at||'').slice(0,10)}
function documentCursorEncode(document){return [documentCursorSortDate(document),document.created_at,document.id].map(value=>encodeURIComponent(String(value??''))).join('~')}
function documentCursorDecode(value){if(!value)return null;try{const parts=String(value).split('~').map(part=>decodeURIComponent(part));if(parts.length!==3||!validIsoDate(parts[0])||!parts[1]||!parts[2])throw Error('invalid');return parts}catch{throw Object.assign(Error('Curseur documentaire invalide.'),{status:400})}}
async function documentListRoute(request,url,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  if(ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'documents.secure.view'))throw Object.assign(Error('Vous ne pouvez pas consulter les documents.'),{status:403});
  const relationType=String(url.searchParams.get('relation_type')||'').trim(),relationId=String(url.searchParams.get('relation_id')||'').trim(),query=documentText(url.searchParams.get('q')||'',120).toLowerCase();
  const typeFilter=url.searchParams.get('document_type')?documentType(url.searchParams.get('document_type')):'',originFilter=url.searchParams.get('origin')?documentOrigin(url.searchParams.get('origin')):'',ownerType=String(url.searchParams.get('owner_type')||'').trim(),ownerId=documentText(url.searchParams.get('owner_id')||'',200),uploadedBy=documentText(url.searchParams.get('uploaded_by')||'',200);
  const sensitivity=url.searchParams.get('sensitivity')?documentSensitivity(url.searchParams.get('sensitivity')):'',dateFrom=documentDate(url.searchParams.get('date_from')||''),dateTo=documentDate(url.searchParams.get('date_to')||''),archiveMode=String(url.searchParams.get('archived')||'active');
  const rawLimitParam=url.searchParams.get('limit'),rawLimit=rawLimitParam===null?250:Number(rawLimitParam);
  if(!Number.isInteger(rawLimit)||rawLimit<1||rawLimit>250)return json({error:'Limite documentaire invalide.'},400);
  const limit=rawLimit,cursor=documentCursorDecode(url.searchParams.get('cursor'));
  if(relationId&&!relationType)return json({error:'Filtre documentaire invalide.'},400);
  if(relationType&&!DOCUMENT_RELATION_TYPES.has(relationType))return json({error:'Filtre documentaire invalide.'},400);
  if(ownerId&&!ownerType)return json({error:'Filtre propriétaire invalide.'},400);
  if(ownerType&&!DOCUMENT_OWNER_TYPES.has(ownerType))return json({error:'Filtre propriétaire invalide.'},400);
  if(dateFrom&&dateTo&&dateFrom>dateTo)return json({error:'Plage de dates documentaire invalide.'},400);
  if(!['active','archived','all'].includes(archiveMode))return json({error:'Filtre archivage invalide.'},400);
  if(archiveMode!=='active')await requireDocumentManage(env,ctx);
  const where=['d.organization_id=?'],values=[ctx.organizationId];
  if(archiveMode==='active')where.push('d.archived_at IS NULL');else if(archiveMode==='archived')where.push('d.archived_at IS NOT NULL');
  if(relationType){let sql='EXISTS (SELECT 1 FROM document_relations rf WHERE rf.organization_id=d.organization_id AND rf.document_id=d.id AND rf.relation_type=?';values.push(relationType);if(relationId){sql+=' AND rf.relation_id=?';values.push(relationId)}where.push(sql+')')}
  if(typeFilter){where.push('d.document_type=?');values.push(typeFilter)}
  if(originFilter){where.push('d.origin=?');values.push(originFilter)}
  if(ownerType){where.push('d.business_owner_type=?');values.push(ownerType)}
  if(ownerId){where.push('d.business_owner_id=?');values.push(ownerId)}
  if(uploadedBy){where.push('d.uploaded_by=?');values.push(uploadedBy)}
  if(sensitivity){where.push('d.sensitivity=?');values.push(sensitivity)}
  if(dateFrom){where.push('d.document_date>=?');values.push(dateFrom)}
  if(dateTo){where.push('d.document_date<=?');values.push(dateTo)}
  if(query){const like=`%${query}%`;where.push("(LOWER(d.title) LIKE ? OR LOWER(d.original_name) LIKE ? OR LOWER(d.description) LIKE ? OR LOWER(d.category) LIKE ? OR LOWER(d.reference) LIKE ? OR EXISTS (SELECT 1 FROM document_relations rq WHERE rq.organization_id=d.organization_id AND rq.document_id=d.id AND LOWER(rq.relation_type||' '||rq.relation_id) LIKE ?))");values.push(like,like,like,like,like,like)}
  const visible=[],scanSize=Math.max(50,Math.min(250,limit*4));let scanCursor=cursor,exhausted=false;
  while(visible.length<limit+1&&!exhausted){
    const scanWhere=[...where],scanValues=[...values];
    if(scanCursor){const [sortDate,createdAt,documentId]=scanCursor;scanWhere.push("(COALESCE(d.document_date,substr(d.created_at,1,10))<? OR (COALESCE(d.document_date,substr(d.created_at,1,10))=? AND d.created_at<?) OR (COALESCE(d.document_date,substr(d.created_at,1,10))=? AND d.created_at=? AND d.id>?))");scanValues.push(sortDate,sortDate,createdAt,sortDate,createdAt,documentId)}
    scanValues.push(scanSize);
    const candidates=await rows(env.DB.prepare(`SELECT d.* FROM secure_documents d WHERE ${scanWhere.join(' AND ')} ORDER BY COALESCE(d.document_date,substr(d.created_at,1,10)) DESC,d.created_at DESC,d.id ASC LIMIT ?`).bind(...scanValues));
    if(!candidates.length){exhausted=true;break}
    for(const document of candidates){
      const relations=await documentRelations(env,ctx,document.id);
      if(await canAccessSecureDocument(env,ctx,document,relations))visible.push({document,relations});
      scanCursor=[documentCursorSortDate(document),document.created_at,document.id];
      if(visible.length>=limit+1)break;
    }
    if(candidates.length<scanSize)exhausted=true;
  }
  const page=visible.slice(0,limit),nextCursor=visible.length>limit&&page.length?documentCursorEncode(page[page.length-1].document):null;
  return json({documents:page.map(item=>documentJson(item.document,item.relations)),nextCursor,limit,filters:{relationType:relationType||null,relationId:relationId||null,documentType:typeFilter||null,origin:originFilter||null,ownerType:ownerType||null,ownerId:ownerId||null,dateFrom,dateTo,archived:archiveMode}})
}
async function documentUploadRoute(request,env,ctx,{expenseIntake=false}={}){
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  if(expenseIntake){await requirePermission(env,ctx,'expenses.create');await requirePermission(env,ctx,'accounting.view')}
  else await requireDocumentManage(env,ctx);
  const length=Number(request.headers.get('content-length')||0);if(length>DOCUMENT_MAX_BYTES+100000)throw Object.assign(Error('Fichier trop volumineux.'),{status:413});
  if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw Object.assign(Error('Format attendu : multipart/form-data.'),{status:415});
  let form;try{form=await request.formData()}catch{throw Object.assign(Error('Import de fichier illisible.'),{status:400})}
  const file=form.get('file');if(!file||typeof file.arrayBuffer!=='function')throw Object.assign(Error('Fichier obligatoire.'),{status:400});if(file.size<=0||file.size>DOCUMENT_MAX_BYTES)throw Object.assign(Error('Taille de fichier invalide.'),{status:file.size>DOCUMENT_MAX_BYTES?413:400});
  const key=operationKey({operationKey:form.get('operationKey')}),bytes=await file.arrayBuffer(),checksum=await sha256Hex(bytes),detected=detectedDocumentMime(bytes),declared=String(file.type||'').toLowerCase();
  if(!detected||!DOCUMENT_MIME_TYPES.has(detected)||declared&&declared!==detected||!documentExtensionMatches(file.name,detected))throw Object.assign(Error('Type ou extension de fichier refusé ou incohérent.'),{status:415});
  const originalName=safeOriginalName(file.name),title=documentText(form.get('title')||originalName,180)||originalName,description=documentText(form.get('description')||'',2000),category=documentCategory(form.get('category')||'other'),reference=documentText(form.get('reference')||'',180),sensitivity=documentSensitivity(form.get('sensitivity')||'standard'),type=documentType(form.get('documentType')||'other'),date=documentDate(form.get('documentDate')||''),origin=documentOrigin(form.get('origin')||'manual_upload',{client:true});
  if(sensitivity!=='standard'&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'documents.secure.confidential'))throw Object.assign(Error('Vous ne pouvez pas créer un document confidentiel.'),{status:403});
  const ownerType=String(form.get('ownerType')||'organization').trim();if(!DOCUMENT_OWNER_TYPES.has(ownerType))throw Object.assign(Error('Propriétaire métier documentaire invalide.'),{status:400});
  const ownerTargetId=ownerType==='organization'?(String(form.get('ownerId')||ctx.organizationId).trim()||ctx.organizationId):String(form.get('ownerId')||'').trim();
  if(ownerType==='organization'&&ownerTargetId!==ctx.organizationId)throw Object.assign(Error('Ressource liée introuvable.'),{status:404});
  if(ownerType!=='organization'&&(!ownerTargetId||ownerTargetId.length>200))throw Object.assign(Error('Propriétaire métier documentaire incomplet.'),{status:400});
  let requested=[];try{requested=JSON.parse(String(form.get('relations')||'[]'))}catch{throw Object.assign(Error('Relations documentaires illisibles.'),{status:400})}
  if(!Array.isArray(requested)||requested.length>30)throw Object.assign(Error('Relations documentaires invalides.'),{status:400});
  const normalized=[],seen=new Set();for(const item of requested){exactObject(item,['type','targetId']);const relationType=String(item.type||''),targetId=String(item.targetId||'').trim();if(!DOCUMENT_RELATION_TYPES.has(relationType)||!targetId||targetId.length>200)throw Object.assign(Error('Ressource liée invalide.'),{status:400});const signature=`${relationType}:${targetId}`;if(seen.has(signature))continue;seen.add(signature);normalized.push({type:relationType,targetId})}
  if(ownerType!=='organization'){const signature=`${ownerType}:${ownerTargetId}`;if(!seen.has(signature)){seen.add(signature);normalized.push({type:ownerType,targetId:ownerTargetId})}}
  const relationSignatures=list=>list.map(relation=>`${relation.relation_type??relation.type}:${relation.relation_id??relation.targetId}`).sort().join('\n');
  const uploadMatches=(document,relations)=>Boolean(document)
    &&document.checksum_sha256===checksum
    &&Number(document.byte_size)===file.size
    &&document.original_name===originalName
    &&document.content_type===detected
    &&String(document.title||document.original_name)===title
    &&String(document.description||'')===description
    &&String(document.category||'other')===category
    &&String(document.reference||'')===reference
    &&String(document.sensitivity||'standard')===sensitivity
    &&String(document.document_type||'other')===type
    &&String(document.document_date||'')===String(date||'')
    &&String(document.origin||'legacy')===origin
    &&String(document.business_owner_type||'organization')===ownerType
    &&String(document.business_owner_id||document.organization_id)===ownerTargetId
    &&relationSignatures(relations)===relationSignatures(normalized);
  const existing=await env.DB.prepare('SELECT id FROM secure_documents WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();
  if(existing){const document=await secureDocument(env,ctx,existing.id),relations=await documentRelations(env,ctx,existing.id);await requireDocumentView(env,ctx,document,relations);if(!uploadMatches(document,relations))return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);return json({document:documentJson(document,relations),replayed:true})}
  if(expenseIntake&&(ownerType!=='organization'||sensitivity!=='standard'||!['supplier_invoice','receipt'].includes(type)||normalized.length!==1||normalized[0].type!=='expense'))throw Object.assign(Error('Une pièce de dépense doit être standard et liée à une seule dépense.'),{status:400});
  const owner=await documentBusinessOwner(env,ctx,ownerType,ownerTargetId);for(const relation of normalized)await relationExists(env,ctx,relation.type,relation.targetId);
  const documentId=id('document'),folderId=await ensureDocumentRootFolder(env,ctx),stamp=now(),storageKey=`private/${ctx.organizationId}/${documentId}`,statements=[
    env.DB.prepare('INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key,document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(documentId,ctx.organizationId,folderId,storageKey,originalName,detected,file.size,checksum,sensitivity,'available',ctx.uid,stamp,stamp,null,title,description,category,reference,key,type,date,origin,owner.type,owner.targetId,'manual','not_requested',''),
    env.DB.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').bind(documentId,ctx.organizationId,new Uint8Array(bytes),stamp)
  ];
  for(const relation of normalized)statements.push(env.DB.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(id('document-relation'),ctx.organizationId,documentId,relation.type,relation.targetId,ctx.uid,stamp));
  statements.push(auditStatement(env,ctx,'document.uploaded','secure_document',documentId,{title,description,category,reference,document_type:type,document_date:date,origin,business_owner_type:owner.type,business_owner_id:owner.targetId,sensitivity,byte_size:file.size,checksum_sha256:checksum,original_name:originalName,content_type:detected,relations:normalized}));
  try{await dbBatch(env,statements)}catch(error){const replay=await env.DB.prepare('SELECT id FROM secure_documents WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(replay){const document=await secureDocument(env,ctx,replay.id),relations=await documentRelations(env,ctx,replay.id);await requireDocumentView(env,ctx,document,relations);if(!uploadMatches(document,relations))return json({error:'Cette clé d’opération a déjà été utilisée avec des données différentes.'},409);return json({document:documentJson(document,relations),replayed:true})}throw error}
  const document=await secureDocument(env,ctx,documentId),relations=await documentRelations(env,ctx,documentId);return json({document:documentJson(document,relations)},201)
}
async function documentMetadataRoute(request,env,ctx,documentId){
  const document=await secureDocument(env,ctx,documentId);if(!document)return json({error:'Document introuvable.'},404);const relations=await documentRelations(env,ctx,documentId);
  if(request.method==='GET'){await requireDocumentView(env,ctx,document,relations);if(document.sensitivity!=='standard')await env.DB.prepare("INSERT INTO document_access_logs(id,organization_id,document_id,user_id,action,created_at) VALUES(?,?,?,?, 'viewed',?)").bind(id('document-access'),ctx.organizationId,documentId,ctx.uid,now()).run();return json({document:documentJson(document,relations)})}
  if(request.method==='PATCH'){
    await requireDocumentManage(env,ctx);await requireDocumentView(env,ctx,document,relations);
    const data=exactObject(await body(request,50000),['title','description','category','reference','sensitivity','documentType','documentDate','ownerType','ownerId']),title=data.title===undefined?document.title:documentText(data.title,180),description=data.description===undefined?document.description:documentText(data.description,2000),category=data.category===undefined?document.category:documentCategory(data.category),reference=data.reference===undefined?document.reference:documentText(data.reference,180),sensitivity=data.sensitivity===undefined?document.sensitivity:documentSensitivity(data.sensitivity),type=data.documentType===undefined?(document.document_type||'other'):documentType(data.documentType),date=data.documentDate===undefined?(document.document_date||null):documentDate(data.documentDate),origin=document.origin||'legacy';
    if(!title)return json({error:'Titre obligatoire.'},400);if(sensitivity!=='standard'&&ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'documents.secure.confidential'))throw Object.assign(Error('Vous ne pouvez pas classer ce document comme confidentiel.'),{status:403});
    const owner=await documentBusinessOwner(env,ctx,data.ownerType===undefined?(document.business_owner_type||'organization'):data.ownerType,data.ownerId===undefined?(document.business_owner_id||ctx.organizationId):data.ownerId),stamp=now(),old={title:document.title,description:document.description,category:document.category,reference:document.reference,sensitivity:document.sensitivity,documentType:document.document_type||'other',documentDate:document.document_date||null,origin:document.origin||'legacy',ownerType:document.business_owner_type||'organization',ownerId:document.business_owner_id||document.organization_id},next={title,description,category,reference,sensitivity,documentType:type,documentDate:date,origin,ownerType:owner.type,ownerId:owner.targetId},statements=[
      env.DB.prepare('UPDATE secure_documents SET title=?,description=?,category=?,reference=?,sensitivity=?,document_type=?,document_date=?,origin=?,business_owner_type=?,business_owner_id=?,updated_at=? WHERE organization_id=? AND id=?').bind(title,description,category,reference,sensitivity,type,date,origin,owner.type,owner.targetId,stamp,ctx.organizationId,documentId)
    ];
    if(owner.type!=='organization'&&!relations.some(relation=>relation.relation_type===owner.type&&String(relation.relation_id)===String(owner.targetId))){const relationId=id('document-relation');statements.push(env.DB.prepare('INSERT OR IGNORE INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(relationId,ctx.organizationId,documentId,owner.type,owner.targetId,ctx.uid,stamp));statements.push(auditStatement(env,ctx,'document.relation.added','secure_document',documentId,{relation_id:relationId,type:owner.type,targetId:owner.targetId,primary_owner:true}))}
    statements.push(auditStatement(env,ctx,'document.metadata.updated','secure_document',documentId,next,old));await dbBatch(env,statements);const updated=await secureDocument(env,ctx,documentId),updatedRelations=await documentRelations(env,ctx,documentId);return json({document:documentJson(updated,updatedRelations)})
  }
  return json({error:'Méthode non autorisée.'},405)
}
async function documentContentRoute(request,env,ctx,documentId,download=false){if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);const document=await secureDocument(env,ctx,documentId,{includeArchived:false});if(!document)return json({error:'Document introuvable.'},404);const relations=await documentRelations(env,ctx,documentId);await requireDocumentView(env,ctx,document,relations);const blob=await env.DB.prepare('SELECT content FROM secure_document_blobs WHERE organization_id=? AND document_id=?').bind(ctx.organizationId,documentId).first();if(!blob||blob.content==null)return json({error:'Fichier indisponible.'},404);await env.DB.prepare("INSERT INTO document_access_logs(id,organization_id,document_id,user_id,action,created_at) VALUES(?,?,?,?,?,?)").bind(id('document-access'),ctx.organizationId,documentId,ctx.uid,download?'downloaded':'viewed',now()).run();let content=blob.content;if(content?.buffer instanceof ArrayBuffer&&!(content instanceof ArrayBuffer))content=new Uint8Array(content.buffer,content.byteOffset||0,content.byteLength||content.length);const encoded=encodeURIComponent(document.original_name||'document');return new Response(content,{status:200,headers:{'content-type':document.content_type,'content-length':String(document.byte_size),'content-disposition':`${download?'attachment':'inline'}; filename*=UTF-8''${encoded}`,'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",'referrer-policy':'no-referrer'}})}
async function documentRelationsRoute(request,env,ctx,documentId,relationId=null){const document=await secureDocument(env,ctx,documentId,{includeArchived:false});if(!document)return json({error:'Document introuvable.'},404);const existingRelations=await documentRelations(env,ctx,documentId);if(request.method==='GET'&&!relationId){await requireDocumentView(env,ctx,document,existingRelations);return json({relations:documentJson(document,existingRelations).relations})}await requireDocumentManage(env,ctx);await requireDocumentView(env,ctx,document,existingRelations);if(request.method==='POST'&&!relationId){const data=exactObject(await body(request,20000),['type','targetId']),type=String(data.type||''),targetId=String(data.targetId||'').trim();await relationExists(env,ctx,type,targetId);const existing=await env.DB.prepare('SELECT id,relation_type,relation_id,created_at FROM document_relations WHERE organization_id=? AND document_id=? AND relation_type=? AND relation_id=?').bind(ctx.organizationId,documentId,type,targetId).first();if(existing)return json({relation:{id:existing.id,type:existing.relation_type,targetId:existing.relation_id,createdAt:existing.created_at},replayed:true});const relation=id('document-relation'),stamp=now();try{await dbBatch(env,[env.DB.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(relation,ctx.organizationId,documentId,type,targetId,ctx.uid,stamp),auditStatement(env,ctx,'document.relation.added','secure_document',documentId,{relation_id:relation,type,targetId})])}catch(error){const replay=await env.DB.prepare('SELECT id,relation_type,relation_id,created_at FROM document_relations WHERE organization_id=? AND document_id=? AND relation_type=? AND relation_id=?').bind(ctx.organizationId,documentId,type,targetId).first();if(replay)return json({relation:{id:replay.id,type:replay.relation_type,targetId:replay.relation_id,createdAt:replay.created_at},replayed:true});throw error}return json({relation:{id:relation,type,targetId,createdAt:stamp}},201)}if(request.method==='DELETE'&&relationId){const relation=await env.DB.prepare('SELECT id,relation_type,relation_id FROM document_relations WHERE organization_id=? AND document_id=? AND id=?').bind(ctx.organizationId,documentId,relationId).first();if(!relation)return json({error:'Relation introuvable.'},404);if(document.business_owner_type!=='organization'&&relation.relation_type===document.business_owner_type&&String(relation.relation_id)===String(document.business_owner_id))return json({error:'La relation propriétaire doit être remplacée avant d’être retirée.'},409);await dbBatch(env,[env.DB.prepare('DELETE FROM document_relations WHERE organization_id=? AND document_id=? AND id=?').bind(ctx.organizationId,documentId,relationId),auditStatement(env,ctx,'document.relation.removed','secure_document',documentId,{relation_id:relation.id,type:relation.relation_type,targetId:relation.relation_id})]);return json({removed:true,documentId})}return json({error:'Méthode non autorisée.'},405)}
async function documentHistoryRoute(request,env,ctx,documentId){if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);const document=await secureDocument(env,ctx,documentId);if(!document)return json({error:'Document introuvable.'},404);const relations=await documentRelations(env,ctx,documentId);await requireDocumentView(env,ctx,document,relations);const audits=await rows(env.DB.prepare("SELECT id,user_id,action,old_values,new_values,created_at FROM audit_logs WHERE organization_id=? AND entity_type='secure_document' AND entity_id=? ORDER BY created_at DESC,id DESC LIMIT 200").bind(ctx.organizationId,documentId)),access=await rows(env.DB.prepare('SELECT id,user_id,action,created_at FROM document_access_logs WHERE organization_id=? AND document_id=? ORDER BY created_at DESC,id DESC LIMIT 200').bind(ctx.organizationId,documentId)),history=[...audits.map(row=>({id:row.id,kind:'change',action:row.action,userId:row.user_id,oldValues:parseJson(row.old_values,null),newValues:parseJson(row.new_values,null),createdAt:row.created_at})),...access.map(row=>({id:row.id,kind:'access',action:'document.'+row.action,userId:row.user_id,oldValues:null,newValues:null,createdAt:row.created_at}))].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||String(b.id).localeCompare(String(a.id))).slice(0,200);return json({documentId,history})}
async function documentArchiveRoute(request,env,ctx,documentId){if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requireDocumentManage(env,ctx);const document=await secureDocument(env,ctx,documentId);if(!document)return json({error:'Document introuvable.'},404);const relations=await documentRelations(env,ctx,documentId);await requireDocumentView(env,ctx,document,relations);let reason='';if(request.headers.get('content-type')?.includes('application/json')){const data=exactObject(await body(request,5000),['reason']);reason=documentText(data.reason||'',500)}if(document.archived_at)return json({archived:true,replayed:true,archivedAt:document.archived_at,reason:document.archived_reason||''});const stamp=now();await dbBatch(env,[env.DB.prepare("UPDATE secure_documents SET status='archived',archived_at=?,archived_reason=?,updated_at=? WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(stamp,reason,stamp,ctx.organizationId,documentId),auditStatement(env,ctx,'document.archived','secure_document',documentId,{archived_at:stamp,reason})]);return json({archived:true,archivedAt:stamp,reason})}
const accessUiModuleKeys=['planning','personal','jobs','messages','people','quotes','gallery','fleet','accounting','actions','documents','company','permissions'];
const accessUiActions=['view','add','edit'];
const accessUiSensitiveKeys=['quotePrices','jobMargins','payroll','privateDocuments','manageAccess','paySlips'];
const accessUiFieldKeys=['logHours','requestTimeCorrection','approveTimeCorrection','scheduleTeams','manageTeams','logFuel','reportAssetIssue','manageAssets','manageAlerts','manageSharedCalendar','managePeople','removePeople','paymentReminders','markPayments','uploadPaySlips','consumeStock','viewProfitability'];
const accessAllProjectScopes=new Set(['Toute l’entreprise','Tous les chantiers','Comptabilité et pièces administratives','Matériel et besoins du terrain']);
const accessAssignedProjectScopes=new Set(['Ses chantiers uniquement','Son équipe et ses chantiers','Ses propres informations et chantiers']);
const accessAllowedScopes=new Set([...accessAllProjectScopes,...accessAssignedProjectScopes,'Ses propres informations']);
function accessProfileForRole(code,name){if(code==='OWNER')return 'Patron';if(code==='TEAM_LEAD')return 'Chef d’équipe';if(code==='WORKER')return 'Ouvrier';if(code==='ACCOUNTING')return 'Comptable';return name||'Ouvrier'}
function accessHex(value){return Array.from(new TextEncoder().encode(String(value)),byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,160)}
async function canViewAccess(env,ctx){return ctx.roleCode==='OWNER'||await allowed(env,ctx,'permissions.view')||await allowed(env,ctx,'permissions.manage')}
async function canManageAccess(env,ctx){return ctx.roleCode==='OWNER'||await allowed(env,ctx,'permissions.manage')}
async function organizationWorkspaceProjectIds(env,organizationId){const state=await organizationWorkspaceState(env,organizationId);return new Set((state?.jobs||[]).map(job=>String(job.id)))}
function validateAccessAssignment(data){
  const profileName=String(data?.profileName||'').trim(),scope=String(data?.scope||'').trim();
  if(!profileName||profileName.length>100||!scope||scope.length>120||!accessAllowedScopes.has(scope))throw Object.assign(Error('Profil ou périmètre invalide.'),{status:400});
  const modules=data?.modules&&typeof data.modules==='object'?data.modules:{},sensitive=data?.sensitive&&typeof data.sensitive==='object'?data.sensitive:{},fieldActions=data?.fieldActions&&typeof data.fieldActions==='object'?data.fieldActions:{};
  const cleanModules={};for(const key of accessUiModuleKeys){const source=modules[key]&&typeof modules[key]==='object'?modules[key]:{};cleanModules[key]={view:Boolean(source.view),add:Boolean(source.add),edit:Boolean(source.edit)};if(!cleanModules[key].view){cleanModules[key].add=false;cleanModules[key].edit=false}}
  const cleanSensitive={};for(const key of accessUiSensitiveKeys)cleanSensitive[key]=Boolean(sensitive[key]);
  const cleanFieldActions={};for(const key of accessUiFieldKeys)cleanFieldActions[key]=Boolean(fieldActions[key]);
  const projectIds=[...new Set((Array.isArray(data?.projectIds)?data.projectIds:[]).map(value=>String(value)).filter(Boolean))];if(projectIds.length>500)throw Object.assign(Error('Trop de chantiers sélectionnés.'),{status:400});
  return {profileName,scope,modules:cleanModules,sensitive:cleanSensitive,fieldActions:cleanFieldActions,projectIds};
}
function accessPermissionSet(assignment,callerIsOwner){
  const result=new Set();
  for(const [moduleKey,actions] of Object.entries(assignment.modules))for(const action of accessUiActions)if(actions[action])result.add(`ui.module.${moduleKey}.${action}`);
  for(const [key,value] of Object.entries(assignment.sensitive))if(value&&!(key==='quotePrices'&&!quotePriceScopeAllows(assignment.scope)))result.add(`ui.sensitive.${key}`);
  for(const [key,value] of Object.entries(assignment.fieldActions))if(value)result.add(`ui.field.${key}`);
  if(Object.values(assignment.modules).some(item=>item.view))result.add('workspace.view');
  const jobsVisible=Boolean(assignment.modules.jobs.view||assignment.modules.planning.view||assignment.modules.fleet.view);
  if(jobsVisible&&accessAllProjectScopes.has(assignment.scope))result.add('projects.view.all');
  else if(jobsVisible&&accessAssignedProjectScopes.has(assignment.scope))result.add('projects.view.assigned');
  if(assignment.modules.jobs.view)result.add('contacts.view.assigned');
  if(assignment.modules.accounting.view){result.add('accounting.view');result.add('financial.dashboard.view');result.add('expenses.view');result.add('invoices.view');result.add('supplier_allocations.view');result.add('purchase_orders.view')}
  if(assignment.modules.accounting.add||assignment.modules.accounting.edit){result.add('expenses.create');result.add('invoices.create');result.add('payments.create');result.add('credit_notes.create');result.add('supplier_allocations.create');result.add('purchase_orders.manage')}if(assignment.modules.accounting.edit)result.add('supplier_allocations.cancel');
  if(assignment.fieldActions.markPayments)result.add('payments.create');
  if(assignment.modules.messages.view)result.add('messages.view');
  if(assignment.modules.messages.add)result.add('messages.send');
  if(assignment.modules.messages.edit)result.add('messages.manage');
  if(assignment.modules.fleet.view){result.add('assets.view');result.add('stock.view');result.add('deliveries.view');result.add('purchase_orders.view')}
  if(assignment.modules.fleet.add||assignment.modules.fleet.edit||assignment.fieldActions.manageAssets){result.add('assets.manage');result.add('stock.items.manage');result.add('stock.move');result.add('deliveries.receive');result.add('purchase_orders.manage')}
  if(assignment.fieldActions.logFuel)result.add('fuel.create');
  if(assignment.fieldActions.scheduleTeams)result.add('planning.assignments.manage');
  if(assignment.fieldActions.reportAssetIssue)result.add('asset_issues.create');
  if(assignment.fieldActions.consumeStock)result.add('stock.consume.assigned');
  if(assignment.modules.jobs.add){result.add('project_materials.create');result.add('project_notes.create')}
  if(assignment.modules.jobs.edit)result.add('project_execution.edit');
  if(assignment.modules.documents.view){result.add('documents.view.assigned');result.add('documents.secure.view')}
  if(assignment.modules.documents.add||assignment.modules.documents.edit)result.add('documents.secure.manage');
  if(assignment.modules.actions.view)result.add('tasks.view.assigned');
  if(assignment.modules.actions.add||assignment.modules.actions.edit){result.add('tasks.comment.create');result.add('tasks.manage.project')}
  if(assignment.modules.actions.edit)result.add('tasks.update.assigned');
  if(assignment.fieldActions.logHours){
    result.add('time_entries.view.own');result.add('time_entries.create.own');
    if(assignment.scope==='Son équipe et ses chantiers'){result.add('time_entries.view.team');result.add('time_entries.create.team')}
    if(['Toute l’entreprise','Tous les chantiers'].includes(assignment.scope)){result.add('time_entries.view.team');result.add('time_entries.create.team');result.add('time_entries.view.all')}
  }
  if(assignment.fieldActions.requestTimeCorrection)result.add('time_entries.correction.request');
  if(assignment.fieldActions.approveTimeCorrection)result.add('time_entries.correction.review');
  if(assignment.sensitive.quotePrices&&quotePriceScopeAllows(assignment.scope))result.add('quotes.prices.view');
  if(assignment.sensitive.jobMargins||assignment.fieldActions.viewProfitability)result.add('margins.view');
  if(assignment.sensitive.payroll||assignment.sensitive.paySlips||assignment.sensitive.privateDocuments)result.add('hr.sensitive.view');if(assignment.sensitive.privateDocuments)result.add('documents.secure.confidential');
  if(assignment.modules.accounting.view&&assignment.sensitive.privateDocuments)result.add('bank.view');
  if(assignment.modules.company.view&&assignment.sensitive.privateDocuments)result.add('company.settings.view');
  if(assignment.modules.permissions.view)result.add('permissions.view');
  if(callerIsOwner&&(assignment.modules.permissions.add||assignment.modules.permissions.edit||assignment.sensitive.manageAccess))result.add('permissions.manage');
  return result;
}
function memberPersonalRolePlan(env,ctx,member,profileName){
  const hex=accessHex(member.user_id),roleId=`role-user-${ctx.organizationId}-${hex}`,roleCode=`USER_${hex}`,stamp=now();
  return {roleId,statements:[
    env.DB.prepare('INSERT OR IGNORE INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').bind(roleId,ctx.organizationId,roleCode,profileName,stamp),
    env.DB.prepare('UPDATE roles SET name=? WHERE id=? AND organization_id=?').bind(profileName,roleId,ctx.organizationId),
    env.DB.prepare('UPDATE organization_members SET role_id=?,updated_at=? WHERE organization_id=? AND user_id=?').bind(roleId,stamp,ctx.organizationId,member.user_id)
  ]};
}
async function accessControlList(env,ctx){
  if(!await canViewAccess(env,ctx))throw Object.assign(Error('Vous ne pouvez pas consulter les droits d’accès.'),{status:403});
  const members=await rows(env.DB.prepare("SELECT om.user_id,om.role_id,r.code role_code,r.name role_name,p.first_name,p.last_name,p.email,om.person_id FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id JOIN profiles p ON p.id=om.user_id WHERE om.organization_id=? AND om.status='active' ORDER BY CASE WHEN r.code='OWNER' THEN 0 ELSE 1 END,p.first_name,p.last_name").bind(ctx.organizationId));
  const output=[];for(const member of members){const permissions=(await rows(env.DB.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').bind(member.role_id))).map(row=>row.permission_code),projectIds=(await rows(env.DB.prepare('SELECT project_id FROM project_access WHERE organization_id=? AND user_id=? ORDER BY project_id').bind(ctx.organizationId,member.user_id))).map(row=>String(row.project_id)),settings=await env.DB.prepare('SELECT profile_name,scope FROM member_access_settings WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,member.user_id).first(),uiConfigured=Boolean(settings||permissions.some(code=>code.startsWith('ui.')));output.push({userId:member.user_id,personId:member.person_id||null,name:[member.first_name,member.last_name].filter(Boolean).join(' ')||member.email||member.user_id,email:member.email||'',roleCode:member.role_code,owner:member.role_code==='OWNER',profileName:settings?.profile_name||accessProfileForRole(member.role_code,member.role_name),scope:settings?.scope||(permissions.includes('projects.view.all')?'Toute l’entreprise':permissions.includes('projects.view.assigned')?'Ses chantiers uniquement':'Ses propres informations'),permissions,projectIds,configured:uiConfigured})}
  return output;
}
async function currentAccessSnapshot(env,ctx){
  const member=await env.DB.prepare("SELECT om.user_id,om.role_id,r.code role_code,r.name role_name,p.first_name,p.last_name,p.email,om.person_id FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id JOIN profiles p ON p.id=om.user_id WHERE om.organization_id=? AND om.user_id=? AND om.status='active'").bind(ctx.organizationId,ctx.uid).first();
  if(!member)return null;
  const policy=await accessPolicy(env,ctx),permissions=[...policy.permissions].sort();
  const projectIds=(await rows(env.DB.prepare('SELECT project_id FROM project_access WHERE organization_id=? AND user_id=? ORDER BY project_id').bind(ctx.organizationId,member.user_id))).map(row=>String(row.project_id));
  return {userId:member.user_id,personId:member.person_id||null,name:[member.first_name,member.last_name].filter(Boolean).join(' ')||member.email||member.user_id,email:member.email||'',roleCode:member.role_code,owner:policy.owner,profileName:policy.profileName||accessProfileForRole(member.role_code,member.role_name),scope:policy.scope,permissions,projectIds,configured:policy.configured};
}
function homeOverviewRole(access){
  const role=String(access?.roleCode||'');
  if(['OWNER','TEAM_LEAD','WORKER','ACCOUNTING'].includes(role))return role;
  return access?.owner===true?'OWNER':'PENDING';
}
async function homeOverviewEffectiveContext(env,ctx,viewAsUserId){
  if(ctx.preview)return{ctx,preview:true,actorUserId:ctx.previewActorUid||ctx.uid};
  const target=String(viewAsUserId||'').trim();
  if(!target||target===String(ctx.uid))return{ctx,preview:false,actorUserId:ctx.uid};
  if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut tester la visibilité d’un autre utilisateur.'),{status:403});
  const member=await env.DB.prepare("SELECT om.user_id,om.role_id,om.person_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.organization_id=? AND om.user_id=? AND om.status='active'").bind(ctx.organizationId,target).first();
  if(!member)throw Object.assign(Error('Utilisateur à prévisualiser introuvable dans cette entreprise.'),{status:404});
  const roleCode=String(member.role_code||'');
  if(!['OWNER','TEAM_LEAD','WORKER','ACCOUNTING'].includes(roleCode))throw Object.assign(Error('Le rôle serveur de cet utilisateur ne permet pas une prévisualisation fiable.'),{status:403});
  if(['TEAM_LEAD','WORKER'].includes(roleCode)&&!member.person_id)throw Object.assign(Error('Ce profil terrain n’est relié à aucune personne du roster.'),{status:403});
  return{ctx:{...ctx,uid:member.user_id,roleId:member.role_id,roleCode},preview:true,actorUserId:ctx.uid};
}
function homeOverviewDateRange(url){
  const today=now().slice(0,10),from=String(url.searchParams.get('from')||today),to=String(url.searchParams.get('to')||from);
  if(!validIsoDate(from)||!validIsoDate(to)||to<from)throw Object.assign(Error('Période d’accueil invalide.'),{status:400});
  const days=Math.floor((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/86400000)+1;
  if(!Number.isFinite(days)||days<1||days>31)throw Object.assign(Error('La période d’accueil est limitée à 31 jours.'),{status:400});
  return{from,to};
}
function homeOverviewAssignment(row){
  return{id:String(row.id),date:String(row.assignment_date),teamId:row.team_id?String(row.team_id):null,projectId:String(row.project_id),people:parseJson(row.people_json,[]).map(String),startTime:row.start_time||'07:00',endTime:row.end_time||'16:00',status:row.status||'planned',reason:row.reason||''};
}
function homeOverviewReminder(item){
  return{id:String(item.id||''),title:String(item.title||'Action à traiter'),date:String(item.date||''),kind:String(item.kind||'Action'),state:String(item.state||'todo'),source:'reminder'};
}
async function homeOverviewRoute(request,url,env,actorCtx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const effective=await homeOverviewEffectiveContext(env,actorCtx,url.searchParams.get('view_as_user_id'));
  const ctx=effective.ctx,{from,to}=homeOverviewDateRange(url),access=await currentAccessSnapshot(env,ctx);
  if(!access)return json({error:'Accès effectif introuvable.'},404);
  const policy=await accessPolicy(env,ctx),role=homeOverviewRole(access),state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  if(role==='PENDING')return json({error:'Le rôle serveur effectif est indisponible.'},403);
  if(!state)return json({access:{...access,roleCode:role},preview:effective.preview,from,to,tasks:[],assignments:[],absences:[],obligations:[],messages:[],projects:[],fieldJournal:[],widgetScopes:{tasks:role==='OWNER'?'organization':'person',week:role==='OWNER'?'organization':'person',obligations:role==='OWNER'?'organization':'person',messages:'authorized',quickActions:'rbac'}});
  if(!ctx.preview)await ensureLegacyFieldDataImported(env,ctx,state);
  const linkedPersonId=await currentPersonId(env,ctx),personId=String(linkedPersonId||'');
  if(['TEAM_LEAD','WORKER'].includes(role)&&!personId)return json({error:'Ce profil terrain n’est relié à aucune personne du roster.'},403);

  const canTasks=policy.owner||policy.has('tasks.view.assigned')||policy.has('tasks.manage.project');
  const taskRows=canTasks?await rows(env.DB.prepare("SELECT * FROM project_tasks WHERE organization_id=? AND archived_at IS NULL AND status<>'done' ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,due_at,updated_at DESC LIMIT 500").bind(ctx.organizationId)):[];
  const tasks=[];
  for(const task of taskRows){
    if(!policy.owner&&!taskIsParticipant(task,ctx.uid))continue;
    if(!await hasProjectScope(env,ctx,task.project_id))continue;
    tasks.push(task);
    if(tasks.length>=12)break;
  }

  const assignmentRows=await rows(env.DB.prepare("SELECT * FROM field_assignments WHERE organization_id=? AND assignment_date>=? AND assignment_date<=? AND status<>'cancelled' ORDER BY assignment_date,start_time,team_id,id").bind(ctx.organizationId,from,to));
  const assignments=[];
  for(const row of assignmentRows){
    if(!await hasProjectScope(env,ctx,row.project_id))continue;
    const people=parseJson(row.people_json,[]).map(String);
    if(!policy.owner&&!people.includes(personId))continue;
    assignments.push(homeOverviewAssignment(row));
  }

  const absenceRows=await rows(env.DB.prepare("SELECT id,person_id,absence_type,starts_at,ends_at,status FROM planning_absences WHERE organization_id=? AND status<>'cancelled' AND starts_at<? AND ends_at>? ORDER BY starts_at,person_id").bind(ctx.organizationId,to+'T23:59',from+'T00:00'));
  const absences=absenceRows.filter(row=>policy.owner||String(row.person_id)===personId).map(row=>({id:String(row.id),personId:String(row.person_id),type:String(row.absence_type||'Absence'),startsAt:row.starts_at,endsAt:row.ends_at,status:row.status}));

  const rawReminders=Array.isArray(state.reminders)?state.reminders:[],obligations=[];
  if(policy.owner){
    for(const item of rawReminders)if(String(item.state||'todo')!=='done')obligations.push(homeOverviewReminder(item));
  }else{
    for(const item of rawReminders){
      if(String(item.state||'todo')==='done')continue;
      const recipients=Array.isArray(item.recipientIds)?item.recipientIds.map(String):[];
      const direct=String(item.linkType||'')==='person'&&String(item.linkId||'')===personId;
      if(direct||recipients.includes(personId))obligations.push(homeOverviewReminder(item));
    }
    const person=(state.people||[]).find(item=>String(item.id)===personId);
    for(let index=0;index<(Array.isArray(person?.training)?person.training:[]).length;index++){
      const training=person.training[index],label=typeof training==='object'?String(training.name||training.label||'Formation'):String(training);
      if(label)obligations.push({id:'training:'+personId+':'+index,title:'Formation · '+label,date:'',kind:'Formation',state:'todo',source:'training'});
    }
    for(let index=0;index<(Array.isArray(person?.hr?.permits)?person.hr.permits:[]).length;index++){
      const permit=person.hr.permits[index],label=String(permit?.name||'Habilitation'),expires=String(permit?.expires||'');
      obligations.push({id:'permit:'+personId+':'+index,title:label,date:expires,kind:'Permis / habilitation',state:expires&&expires<now().slice(0,10)?'late':'todo',source:'permit'});
    }
  }

  let messages=[];
  if(policy.owner||policy.has('messages.view')){
    const actorPersonId=linkedPersonId,stateForMessages=state;
    const candidates=await rows(env.DB.prepare("SELECT c.id,c.kind,c.title,COALESCE(c.scope_project_id,c.project_id) project_id,c.team_id,c.updated_at,(SELECT body FROM messages m WHERE m.conversation_id=c.id AND m.archived_at IS NULL ORDER BY m.created_at DESC LIMIT 1) last_message,(SELECT created_at FROM messages m WHERE m.conversation_id=c.id AND m.archived_at IS NULL ORDER BY m.created_at DESC LIMIT 1) last_message_at FROM conversations c WHERE c.organization_id=? AND c.archived_at IS NULL ORDER BY COALESCE(last_message_at,c.updated_at) DESC LIMIT 50").bind(ctx.organizationId));
    for(const conversation of candidates){
      if(await conversationCanAccess(env,ctx,conversation,stateForMessages,actorPersonId))messages.push(conversation);
      if(messages.length>=3)break;
    }
  }

  const projectIds=new Set([...tasks.map(task=>String(task.project_id)),...assignments.map(item=>String(item.projectId))]);
  const projects=(state.jobs||[]).filter(job=>policy.owner?projectIds.has(String(job.id))||assignments.some(item=>String(item.projectId)===String(job.id)):projectIds.has(String(job.id))).map(job=>({id:String(job.id),reference:String(job.reference||job.ref||''),name:String(job.name||''),town:String(job.town||''),phase:String(job.phase||job.status||'')}));

  const labels=await profileLabels(env,ctx);
  const fieldJournal=[];
  if(policy.owner){
    const journalRows=await rows(env.DB.prepare("SELECT n.id,n.project_id,n.category,n.body,n.created_by,n.created_at,p.first_name,p.last_name FROM field_project_notes n LEFT JOIN profiles p ON p.id=n.created_by WHERE n.organization_id=? AND n.archived_at IS NULL AND n.category IN ('Problème','Sécurité') ORDER BY n.created_at DESC,n.id DESC LIMIT 50").bind(ctx.organizationId));
    for(const row of journalRows){
      if(!await hasProjectScope(env,ctx,row.project_id))continue;
      const project=workspaceProject(state,row.project_id);
      fieldJournal.push({id:String(row.id),projectId:String(row.project_id),projectName:String(project?.name||project?.reference||row.project_id),category:String(row.category),text:String(row.body||''),author:[row.first_name,row.last_name].filter(Boolean).join(' ')||String(row.created_by),createdAt:String(row.created_at)});
    }
  }
  return json({
    access:{...access,roleCode:role},
    preview:effective.preview,
    previewedBy:effective.preview?effective.actorUserId:null,
    from,to,
    tasks:tasks.map(task=>({...taskJson(task),assignedToName:task.assigned_to?(labels.get(task.assigned_to)||task.assigned_to):'',createdByName:labels.get(task.created_by)||task.created_by})),
    assignments,absences,obligations:obligations.slice(0,24),messages,projects,fieldJournal,
    widgetScopes:{tasks:policy.owner?'organization':'person',week:policy.owner?'organization':'person',obligations:policy.owner?'organization':'person',messages:'authorized',quickActions:'rbac'}
  });
}

async function accessControlRoutes(request,url,env,ctx,targetUserId=null){
  if(request.method==='GET'&&!targetUserId)return json({members:await accessControlList(env,ctx)});
  if(request.method!=='PUT'||!targetUserId)return json({error:'Méthode non autorisée.'},405);
  if(!await canManageAccess(env,ctx))throw Object.assign(Error('Vous ne pouvez pas modifier les droits d’accès.'),{status:403});
  if(ctx.roleCode!=='OWNER'&&String(targetUserId)===String(ctx.uid))throw Object.assign(Error('Vous ne pouvez pas augmenter vos propres droits.'),{status:403});
  const member=await env.DB.prepare("SELECT om.user_id,om.role_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.organization_id=? AND om.user_id=? AND om.status='active'").bind(ctx.organizationId,targetUserId).first();
  if(!member)return json({error:'Utilisateur introuvable dans cette entreprise.'},404);if(member.role_code==='OWNER')return json({error:'Les droits du propriétaire sont verrouillés.'},403);
  const assignment=validateAccessAssignment(await body(request,120000));
  if(ctx.roleCode!=='OWNER'&&assignment.sensitive.manageAccess)return json({error:'Seul le propriétaire peut déléguer la gestion des accès.'},403);
  const validProjects=await organizationWorkspaceProjectIds(env,ctx.organizationId);if(assignment.projectIds.some(projectId=>!validProjects.has(projectId)))return json({error:'Un chantier sélectionné n’appartient pas à cette entreprise.'},400);
  const oldPermissions=(await rows(env.DB.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').bind(member.role_id))).map(row=>row.permission_code),oldProjects=(await rows(env.DB.prepare('SELECT project_id FROM project_access WHERE organization_id=? AND user_id=? ORDER BY project_id').bind(ctx.organizationId,targetUserId))).map(row=>String(row.project_id));
  const rolePlan=memberPersonalRolePlan(env,ctx,member,assignment.profileName),roleId=rolePlan.roleId,permissionSet=accessPermissionSet(assignment,ctx.roleCode==='OWNER');
  if(ctx.roleCode!=='OWNER'){
    const callerPermissions=new Set((await rows(env.DB.prepare('SELECT permission_code FROM role_permissions WHERE role_id=?').bind(ctx.roleId))).map(row=>row.permission_code));
    const elevated=[...permissionSet].find(permission=>!callerPermissions.has(permission));
    if(elevated)return json({error:'Vous ne pouvez pas accorder des droits que vous ne possédez pas.'},403);
  }
  const stamp=now(),statements=[...rolePlan.statements,env.DB.prepare('DELETE FROM role_permissions WHERE role_id=?').bind(roleId)];
  for(const permission of permissionSet)statements.push(env.DB.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').bind(roleId,permission));
  statements.push(env.DB.prepare('INSERT INTO member_access_settings(organization_id,user_id,profile_name,scope,updated_by,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET profile_name=excluded.profile_name,scope=excluded.scope,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(ctx.organizationId,targetUserId,assignment.profileName,assignment.scope,ctx.uid,stamp));
  statements.push(env.DB.prepare('DELETE FROM project_access WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,targetUserId));
  if(permissionSet.has('projects.view.assigned'))for(const projectId of assignment.projectIds)statements.push(env.DB.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').bind(ctx.organizationId,targetUserId,projectId,ctx.uid,stamp));
  statements.push(auditStatement(env,ctx,'access.updated','organization_member',targetUserId,{profile:assignment.profileName,scope:assignment.scope,permissions:[...permissionSet].sort(),project_ids:permissionSet.has('projects.view.assigned')?assignment.projectIds:[]},{permissions:oldPermissions,project_ids:oldProjects}));
  await dbBatch(env,statements);
  return json({ok:true,members:await accessControlList(env,ctx)});
}


const canonicalManagedRoleCodes=new Set(['TEAM_LEAD','WORKER','ACCOUNTING']);
async function memberRoutes(request,env,ctx,targetUserId){
  if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut modifier ou révoquer un membre.'),{status:403});
  const member=await env.DB.prepare("SELECT om.user_id,om.role_id,om.status,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.organization_id=? AND om.user_id=? AND om.status='active'").bind(ctx.organizationId,String(targetUserId)).first();
  if(!member)return json({error:'Utilisateur introuvable dans cette entreprise.'},404);
  if(member.role_code==='OWNER')return json({error:'Les accès OWNER sont verrouillés.'},403);
  if(request.method==='PATCH'){
    const data=exactObject(await body(request,10000),['roleId']),roleId=String(data.roleId||'').trim();
    if(!roleId)return json({error:'Rôle obligatoire.'},400);
    const role=await env.DB.prepare('SELECT id,code,name FROM roles WHERE id=? AND organization_id=?').bind(roleId,ctx.organizationId).first();
    if(!role)return json({error:'Rôle introuvable dans cette entreprise.'},404);
    if(role.code==='OWNER')return json({error:'La promotion OWNER passe par le parcours propriétaire dédié et ne peut pas être appliquée ici.'},403);
    if(!canonicalManagedRoleCodes.has(role.code))return json({error:'Rôle non canonique. Utilisez TEAM_LEAD, WORKER ou ACCOUNTING.'},400);
    if(member.role_id===role.id)return json({userId:String(targetUserId),status:'active',roleId:role.id,roleCode:role.code});
    const stamp=now();
    await dbBatch(env,[
      env.DB.prepare("UPDATE organization_members SET role_id=?,updated_at=? WHERE organization_id=? AND user_id=? AND status='active'").bind(role.id,stamp,ctx.organizationId,String(targetUserId)),
      env.DB.prepare('DELETE FROM member_access_settings WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,String(targetUserId)),
      auditStatement(env,ctx,'member.role_changed','organization_member',String(targetUserId),{role_id:role.id,role_code:role.code},{role_id:member.role_id,role_code:member.role_code})
    ]);
    return json({userId:String(targetUserId),status:'active',roleId:role.id,roleCode:role.code});
  }
  if(request.method==='DELETE'){
    const stamp=now();
    await dbBatch(env,[
      env.DB.prepare("UPDATE organization_members SET status='disabled',updated_at=? WHERE organization_id=? AND user_id=? AND status='active'").bind(stamp,ctx.organizationId,String(targetUserId)),
      env.DB.prepare('DELETE FROM project_access WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,String(targetUserId)),
      env.DB.prepare('DELETE FROM member_access_settings WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,String(targetUserId)),
      auditStatement(env,ctx,'member.revoked','organization_member',String(targetUserId),{status:'disabled'},{status:'active',role_id:member.role_id,role_code:member.role_code})
    ]);
    return json({userId:String(targetUserId),status:'disabled'});
  }
  return json({error:'Méthode non autorisée.'},405);
}


async function rolesRoute(request,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  if(ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'permissions.view'))throw Object.assign(Error('Vous ne pouvez pas consulter les rôles.'),{status:403});
  const roleRows=await rows(env.DB.prepare("SELECT id,code,name FROM roles WHERE organization_id=? AND code IN ('OWNER','TEAM_LEAD','WORKER','ACCOUNTING') ORDER BY CASE code WHEN 'OWNER' THEN 0 WHEN 'TEAM_LEAD' THEN 1 WHEN 'WORKER' THEN 2 WHEN 'ACCOUNTING' THEN 3 ELSE 9 END").bind(ctx.organizationId));
  const roles=[];for(const role of roleRows){const permissions=(await rows(env.DB.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').bind(role.id))).map(row=>row.permission_code);roles.push({id:role.id,code:role.code,name:role.name,permissions})}
  return json({roles});
}


async function organizationsRoute(request,env,ctx){
  if(request.method==='POST'){
    if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul un propriétaire peut créer une entreprise.'),{status:403});
    let data;try{data=await body(request,20000)}catch(error){return json({error:error.message},error.status||400)}
    if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>key!=='name')||typeof data.name!=='string')return json({error:'Seul le nom de l’entreprise est accepté.'},400);
    const name=data.name.trim();
    if(!name||name.length>160||/[\u0000-\u001f\u007f]/.test(name))return json({error:'Le nom de l’entreprise est invalide.'},400);
    const requiredPermissions=[...new Set(canonicalRoleDefaults.flatMap(role=>role.permissions))];
    const availablePermissions=await rows(env.DB.prepare(`SELECT code FROM permissions WHERE code IN (${requiredPermissions.map(()=>'?').join(',')})`).bind(...requiredPermissions));
    if(availablePermissions.length!==requiredPermissions.length)throw Object.assign(Error('Les permissions canoniques ne sont pas disponibles.'),{status:503});
    const organizationId=id('org'),ownerRoleId=id('role'),ownerMemberId=id('member'),stamp=now();
    const statements=[
      env.DB.prepare('INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)').bind(organizationId,name,stamp,stamp),
      ...canonicalOrganizationRoleStatements(env,organizationId,ownerRoleId,()=>id('role'),stamp,{ignoreConflicts:false}),
      env.DB.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,'active',?,?,?)").bind(ownerMemberId,organizationId,ctx.uid,ownerRoleId,stamp,stamp,stamp),
      auditStatement(env,{...ctx,organizationId},'organization.created','organization',organizationId,{name})
    ];
    await dbBatch(env,statements,{strict:true});
    const organization=await env.DB.prepare('SELECT id,name,legal_name,country,currency,created_at FROM organizations WHERE id=?').bind(organizationId).first();
    return json({organization},201);
  }
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  const organizations=await rows(env.DB.prepare("SELECT o.id,o.name,o.legal_name,o.country,o.currency,o.created_at,r.code role_code,om.person_id FROM organization_members om JOIN organizations o ON o.id=om.organization_id JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.user_id=? AND om.status='active' ORDER BY COALESCE(om.joined_at,om.created_at),o.name").bind(ctx.uid));
  return json({activeOrganizationId:ctx.organizationId,organizations});
}
async function invitationRosterRoute(request,env,ctx){
  if(request.method!=='GET')return json({error:'Méthode non autorisée.'},405);
  if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut consulter le roster d’invitation.'),{status:403});
  const organization=await env.DB.prepare('SELECT id,name FROM organizations WHERE id=?').bind(ctx.organizationId).first();
  if(!organization)return json({error:'Entreprise introuvable.'},404);
  const relationalRows=await rows(env.DB.prepare('SELECT id,display_name,role_title,active FROM hr_people WHERE organization_id=? ORDER BY display_name,id').bind(ctx.organizationId));
  let source=relationalRows.length?'hr_people':'none';
  let roster=relationalRows.filter(person=>Number(person.active)===1).map(person=>({id:String(person.id),name:String(person.display_name||'').trim(),role:String(person.role_title||'').trim(),active:true})).filter(person=>person.id&&person.name);
  if(!relationalRows.length&&ctx.organizationId===MANUAL_TEST_ORGANIZATION_ID){
    const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
    roster=batinovaWorkspaceRosterPeople(state);
    source='workspace_state';
  }
  const linked=new Set((await rows(env.DB.prepare("SELECT person_id FROM organization_members WHERE organization_id=? AND status='active' AND person_id IS NOT NULL").bind(ctx.organizationId))).map(row=>String(row.person_id)));
  const pending=new Set((await rows(env.DB.prepare("SELECT person_id FROM organization_invitations WHERE organization_id=? AND status='pending' AND expires_at>? AND person_id IS NOT NULL").bind(ctx.organizationId,now()))).map(row=>String(row.person_id)));
  const people=roster.filter(person=>!linked.has(person.id)&&!pending.has(person.id));
  return json({organizationId:ctx.organizationId,organizationName:String(organization.name||''),source,rosterCount:roster.length,eligibleCount:people.length,people});
}
async function ensureInvitableRole(env,ctx,role){
  if(ctx.roleCode==='OWNER')return;
  if(role.code==='OWNER')throw Object.assign(Error('Seul le propriétaire peut inviter un autre propriétaire.'),{status:403});
  const elevated=await env.DB.prepare('SELECT rp.permission_code FROM role_permissions rp LEFT JOIN role_permissions mine ON mine.role_id=? AND mine.permission_code=rp.permission_code WHERE rp.role_id=? AND mine.permission_code IS NULL LIMIT 1').bind(ctx.roleId,role.id).first();
  if(elevated)throw Object.assign(Error('Vous ne pouvez pas attribuer des droits que vous ne possédez pas.'),{status:403});
}
async function invitationRosterPerson(env,invitation,roleCode){
  const personId=String(invitation.person_id||'');if(!personId)return null;
  const person=await env.DB.prepare('SELECT display_name,role_title,active FROM hr_people WHERE organization_id=? AND id=?').bind(invitation.organization_id,personId).first();
  if(person)return Number(person.active)===1?person:null;
  if(String(invitation.organization_id||'')!==MANUAL_TEST_ORGANIZATION_ID)return null;
  const state=await organizationWorkspaceState(env,invitation.organization_id);
  return batinovaWorkspaceRosterPerson(state,personId);
}
async function invitationProjectScope(env,invitation,roleCode){
  if(roleCode==='ACCOUNTING')return [];
  const personId=String(invitation.person_id||'');if(!personId)return [];
  const permissions=new Set((await rows(env.DB.prepare('SELECT rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.organization_id=? AND r.id=?').bind(invitation.organization_id,invitation.role_id))).map(row=>String(row.permission_code)));
  if(!permissions.has('projects.view.assigned'))return [];
  const state=await organizationWorkspaceState(env,invitation.organization_id),today=now().slice(0,10),teamIds=new Set();
  if(roleCode==='TEAM_LEAD'){
    for(const row of await rows(env.DB.prepare('SELECT team_id FROM hr_team_leads WHERE organization_id=? AND person_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)').bind(invitation.organization_id,personId,today,today)))teamIds.add(String(row.team_id));
    if(!teamIds.size){
      const person=await env.DB.prepare('SELECT role_title FROM hr_people WHERE organization_id=? AND id=? AND active=1').bind(invitation.organization_id,personId).first();
      if(/chef/i.test(String(person?.role_title||'')))for(const row of await rows(env.DB.prepare('SELECT tm.team_id FROM hr_team_members tm JOIN hr_teams t ON t.organization_id=tm.organization_id AND t.id=tm.team_id WHERE tm.organization_id=? AND tm.person_id=? AND (tm.starts_on IS NULL OR tm.starts_on<=?) AND (tm.ends_on IS NULL OR tm.ends_on>=?) AND t.active=1').bind(invitation.organization_id,personId,today,today)))teamIds.add(String(row.team_id));
    }
    if(!teamIds.size&&String(invitation.organization_id||'')===MANUAL_TEST_ORGANIZATION_ID)for(const teamId of batinovaWorkspaceTeamIds(state,personId,roleCode))teamIds.add(teamId);
    if(!teamIds.size)throw Object.assign(Error('Le chef d’équipe doit être rattaché à une équipe active avant son activation.'),{status:409});
  }
  const validProjects=new Set((state?.jobs||[]).map(project=>String(project.id))),assignments=await rows(env.DB.prepare("SELECT project_id,team_id,people_json FROM field_assignments WHERE organization_id=? AND status<>'cancelled'").bind(invitation.organization_id)),projectIds=new Set();
  for(const assignment of assignments){
    let includesPerson=false;try{const people=JSON.parse(assignment.people_json||'[]');includesPerson=Array.isArray(people)&&people.some(value=>String(value)===personId)}catch{}
    const inScope=roleCode==='TEAM_LEAD'?teamIds.has(String(assignment.team_id)):includesPerson;
    if(inScope&&validProjects.has(String(assignment.project_id)))projectIds.add(String(assignment.project_id));
  }
  return [...projectIds].sort();
}
async function invitationRoutes(request,env,ctx,invitationId=null){
  if(request.method==='GET'&&!invitationId){
    if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut consulter les invitations.'),{status:403});
    const v3Manual=v3ManualInvitationsEnabled(env,ctx.organizationId);
    return json({invitations:await rows(env.DB.prepare("SELECT i.id,i.email,i.person_id,i.role_id,r.code role_code,r.name role_name,i.status,i.expires_at,i.created_at,i.accepted_at,i.revoked_at FROM organization_invitations i JOIN roles r ON r.id=i.role_id AND r.organization_id=i.organization_id WHERE i.organization_id=? ORDER BY i.created_at DESC LIMIT 250").bind(ctx.organizationId)),emailDeliveryEnabled:typeof env.sendInvitationEmail==='function',manualTestEnabled:(env.SOCLE_INVITATION_TEST_MODE==='1'&&ctx.organizationId===MANUAL_TEST_ORGANIZATION_ID)||v3Manual,manualTestWorkerOnly:v3Manual});
  }
  if(request.method==='POST'&&!invitationId){
    if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut inviter un membre.'),{status:403});
    const data=exactObject(await body(request),['email','personId','roleId','expiresInDays','deliveryMode']);
    const email=String(data.email||'').trim().toLowerCase(),personId=String(data.personId||'').trim()||null,roleId=String(data.roleId||'').trim(),deliveryMode=String(data.deliveryMode||'email'),rawDays=data.expiresInDays===undefined?7:Number(data.expiresInDays);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!roleId||!Number.isFinite(rawDays)||!Number.isInteger(rawDays)||rawDays<1||rawDays>30)return json({error:'Invitation invalide.'},400);
    if(!['email','manual-test'].includes(deliveryMode))return json({error:'Mode de remise invalide.'},400);
    const manualTestTarget=deliveryMode==='manual-test'&&Object.hasOwn(MANUAL_TEST_INVITATIONS,email)?MANUAL_TEST_INVITATIONS[email]:null;
    if(deliveryMode==='manual-test'){
      const v3Test=v3ManualInvitationsEnabled(env,ctx.organizationId);
      if(env.SOCLE_INVITATION_TEST_MODE!=='1'&&!v3Test)return json({error:'Le mode d’invitation de test est désactivé.'},403);
      if(ctx.organizationId!==MANUAL_TEST_ORGANIZATION_ID&&!v3Test)return json({error:'Le mode de test est limité à BatiNova.'},403);
      if(v3Test&&ctx.organizationId!==MANUAL_TEST_ORGANIZATION_ID){if(!email.endsWith('@socle-v3.test'))return json({error:'Le mode V3 exige une adresse @socle-v3.test.'},400)}
      else if(email.endsWith('@socle.test')&&!manualTestTarget)return json({error:'Cette adresse historique de test n’est pas autorisée.'},400);
    }
    const role=await env.DB.prepare('SELECT id,code,name FROM roles WHERE id=? AND organization_id=?').bind(roleId,ctx.organizationId).first();
    if(!role)return json({error:'Rôle introuvable dans cette entreprise.'},404);
    if(!['TEAM_LEAD','WORKER','ACCOUNTING'].includes(String(role.code)))return json({error:'Seuls les rôles TEAM_LEAD, WORKER et ACCOUNTING peuvent être invités.'},400);
    if(deliveryMode==='manual-test'&&v3ManualInvitationsEnabled(env,ctx.organizationId)&&ctx.organizationId!==MANUAL_TEST_ORGANIZATION_ID&&String(role.code)!=='WORKER')return json({error:'Le mode V3 autorise uniquement les invitations Ouvrier.'},403);
    if(deliveryMode==='manual-test'&&manualTestTarget&&(String(role.code)!==manualTestTarget.roleCode||personId!==manualTestTarget.personId))return json({error:'Le rôle et le rattachement de cette adresse historique de test sont prédéfinis et ne correspondent pas à la demande.'},400);
    let invitationPerson=null;
    if(personId){
      const linked=await env.DB.prepare("SELECT 1 ok FROM organization_members WHERE organization_id=? AND person_id=? AND status='active'").bind(ctx.organizationId,personId).first();
      if(linked)return json({error:'Cette personne est déjà liée à un compte actif.'},409);
      invitationPerson=await invitationRosterPerson(env,{organization_id:ctx.organizationId,email,person_id:personId,role_code:String(role.code)},String(role.code));
      if(!invitationPerson)return json({error:'La personne sélectionnée ne fait pas partie du roster actif de cette entreprise.'},400);
      const pendingPerson=await env.DB.prepare("SELECT 1 ok FROM organization_invitations WHERE organization_id=? AND person_id=? AND status='pending' AND expires_at>? LIMIT 1").bind(ctx.organizationId,personId,now()).first();
      if(pendingPerson)return json({error:'Une invitation active existe déjà pour cette personne.'},409);
    }
    const existingMember=await env.DB.prepare("SELECT 1 ok FROM organization_members om JOIN profiles p ON p.id=om.user_id WHERE om.organization_id=? AND lower(p.email)=? AND om.status IN ('active','invited') LIMIT 1").bind(ctx.organizationId,email).first();
    if(existingMember)return json({error:'Cette adresse est déjà liée à un membre de l’entreprise.'},409);
    const pending=await env.DB.prepare("SELECT 1 ok FROM organization_invitations WHERE organization_id=? AND lower(email)=? AND status='pending' AND expires_at>? LIMIT 1").bind(ctx.organizationId,email,now()).first();
    if(pending)return json({error:'Une invitation active existe déjà pour cette adresse.'},409);
    if(deliveryMode==='email'&&typeof env.sendInvitationEmail!=='function')return json({error:'L’envoi des invitations n’est pas configuré.'},503);
    await ensureInvitableRole(env,ctx,role);
    const rawToken=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await sha256Hex(new TextEncoder().encode(rawToken)),invitation=id('invitation'),stamp=now(),expires=new Date(Date.now()+rawDays*86400000).toISOString();
    const org=await env.DB.prepare('SELECT name FROM organizations WHERE id=?').bind(ctx.organizationId).first(),person=invitationPerson;
    const batinovaWorkspaceRosterAllowed=ctx.organizationId===MANUAL_TEST_ORGANIZATION_ID;
    const insert=env.DB.prepare("INSERT INTO organization_invitations(id,organization_id,email,person_id,role_id,token_hash,status,expires_at,invited_by,created_at) SELECT ?,?,?,?,?,?,'pending',?,?,? WHERE EXISTS(SELECT 1 FROM roles r WHERE r.id=? AND r.organization_id=? AND r.code IN ('TEAM_LEAD','WORKER','ACCOUNTING')) AND (? IS NULL OR EXISTS(SELECT 1 FROM hr_people p WHERE p.organization_id=? AND p.id=? AND p.active=1) OR (?=1 AND EXISTS(SELECT 1 FROM organization_workspace_state ws,json_each(CASE WHEN json_valid(ws.payload) THEN ws.payload ELSE '{}' END,'$.people') roster WHERE ws.organization_id=? AND CAST(json_extract(roster.value,'$.id') AS TEXT)=? AND COALESCE(json_extract(roster.value,'$.active'),1)<>0 AND lower(COALESCE(json_extract(roster.value,'$.status'),'')) NOT IN ('inactive','archived','deleted')))) AND NOT EXISTS(SELECT 1 FROM organization_members om JOIN profiles p ON p.id=om.user_id WHERE om.organization_id=? AND lower(p.email)=? AND om.status IN ('active','invited')) AND NOT EXISTS(SELECT 1 FROM organization_invitations i WHERE i.organization_id=? AND lower(i.email)=? AND i.status='pending' AND i.expires_at>?) AND NOT EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=? AND om.person_id=? AND om.status='active') AND NOT EXISTS(SELECT 1 FROM organization_invitations i WHERE i.organization_id=? AND i.person_id=? AND i.status='pending' AND i.expires_at>?)").bind(invitation,ctx.organizationId,email,personId,roleId,tokenHash,expires,ctx.uid,stamp,roleId,ctx.organizationId,personId,ctx.organizationId,personId,batinovaWorkspaceRosterAllowed?1:0,ctx.organizationId,personId,ctx.organizationId,email,ctx.organizationId,email,stamp,ctx.organizationId,personId,ctx.organizationId,personId,stamp);
    const audit=env.DB.prepare("INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,new_values,created_at) SELECT ?,?,?,?,'organization_invitation',?,?,? WHERE EXISTS(SELECT 1 FROM organization_invitations WHERE id=? AND status='pending' AND token_hash=?)").bind(id('audit'),ctx.organizationId,ctx.uid,'member.invited',invitation,JSON.stringify({email,person_id:personId,role_id:roleId,expires_at:expires,delivery_mode:deliveryMode}),stamp,invitation,tokenHash);
    const created=await dbBatch(env,[insert,audit]);
    if(Number(created?.[0]?.meta?.changes)!==1)return json({error:'Une invitation identique vient d’être créée, ou les données de roster ont changé.'},409);
    if(deliveryMode==='manual-test')return json({id:invitation,expiresAt:expires,deliveryMode,activationPath:`/invite/activate#${encodeURIComponent(rawToken)}`},201,{'referrer-policy':'no-referrer'});
    try{
      await env.sendInvitationEmail({to:email,token:rawToken,expiresAt:expires,organizationName:String(org?.name||''),roleName:String(role.name||role.code),personName:String(person?.display_name||'')});
    }catch{
      await dbBatch(env,[env.DB.prepare("UPDATE organization_invitations SET status='revoked',revoked_at=? WHERE id=? AND status='pending'").bind(now(),invitation),auditStatement(env,ctx,'member.invitation_delivery_failed','organization_invitation',invitation,{delivery:'failed'})]);
      return json({error:'L’e-mail d’invitation n’a pas pu être envoyé. Aucune invitation active ne subsiste.'},503);
    }
    return json({id:invitation,expiresAt:expires,deliveryMode},201);
  }
  if(request.method==='DELETE'&&invitationId){
    if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut révoquer une invitation.'),{status:403});
    const existing=await env.DB.prepare('SELECT id,status FROM organization_invitations WHERE id=? AND organization_id=?').bind(invitationId,ctx.organizationId).first();
    if(!existing)return json({error:'Invitation introuvable.'},404);
    if(existing.status!=='pending')return json({error:'Cette invitation n’est plus révocable.'},409);
    const stamp=now();
    await dbBatch(env,[env.DB.prepare("UPDATE organization_invitations SET status='revoked',revoked_at=? WHERE id=? AND organization_id=? AND status='pending'").bind(stamp,invitationId,ctx.organizationId),auditStatement(env,ctx,'member.invitation_revoked','organization_invitation',invitationId,{revoked_at:stamp})]);
    return json({id:invitationId,status:'revoked'});
  }
  return json({error:'Méthode non autorisée.'},405);
}
async function acceptInvitationRoute(request,env,ctx){
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);
  const data=exactObject(await body(request),['token']),raw=String(data.token||'');
  if(raw.length<20)return json({error:'Invitation invalide.'},400);
  const tokenHash=await sha256Hex(new TextEncoder().encode(raw)),invitation=await env.DB.prepare("SELECT i.*,r.code role_code FROM organization_invitations i JOIN roles r ON r.id=i.role_id AND r.organization_id=i.organization_id WHERE i.token_hash=? AND i.status='pending'").bind(tokenHash).first();
  if(!invitation)return json({error:'Invitation introuvable ou déjà utilisée.'},404);
  if(invitation.expires_at<=now()){
    await env.DB.prepare("UPDATE organization_invitations SET status='expired' WHERE id=? AND status='pending'").bind(invitation.id).run();
    return json({error:'Invitation expirée.'},410);
  }
  if(!['TEAM_LEAD','WORKER','ACCOUNTING'].includes(String(invitation.role_code)))return json({error:'Ce rôle ne peut pas être attribué par invitation.'},403);
  const email=String(ctx.email||authenticatedEmail(request)||'').trim().toLowerCase();
  if(!email||email!==String(invitation.email).toLowerCase())return json({error:'Cette invitation appartient à une autre adresse.'},403);
  const profile=await env.DB.prepare('SELECT id,email,identity_kind FROM profiles WHERE id=?').bind(ctx.uid).first();
  if(profile&&String(profile.identity_kind||'account')!=='account')return json({error:'Un profil de provenance ne peut pas être activé comme compte.'},403);
  const emailOwners=await rows(env.DB.prepare('SELECT id,identity_kind FROM profiles WHERE lower(email)=?').bind(email));
  if(emailOwners.some(owner=>String(owner.id)!==String(ctx.uid)))return json({error:'Cette adresse est déjà rattachée à un autre compte SOCLE.'},409);
  if(profile?.email&&String(profile.email).trim().toLowerCase()!==email)return json({error:'L’adresse du compte ne correspond pas à l’invitation.'},403);
  const existingMember=await env.DB.prepare('SELECT status FROM organization_members WHERE organization_id=? AND user_id=?').bind(invitation.organization_id,ctx.uid).first();
  if(existingMember)return json({error:'Ce compte possède déjà une adhésion dans cette entreprise. Une invitation ne peut pas modifier ou réactiver un rôle.'},409);
  let invitationPerson=null;
  if(invitation.person_id){
    invitationPerson=await invitationRosterPerson(env,invitation,String(invitation.role_code));
    if(!invitationPerson)return json({error:'La personne liée à cette invitation n’est plus dans le roster actif.'},409);
    const linked=await env.DB.prepare("SELECT 1 ok FROM organization_members WHERE organization_id=? AND person_id=? AND status='active' LIMIT 1").bind(invitation.organization_id,invitation.person_id).first();
    if(linked)return json({error:'Cette personne est déjà liée à un compte actif.'},409);
  }
  const projectIds=await invitationProjectScope(env,invitation,String(invitation.role_code)),person=invitationPerson,parts=String(person?.display_name||'').trim().split(/\s+/).filter(Boolean),firstName=parts.shift()||'',lastName=parts.join(' '),stamp=now(),memberId=id('member');
  // The existing inviter FK lets the claim win atomically; the invitee is assigned after their profile exists in this same batch.
  const acceptedWhere="EXISTS(SELECT 1 FROM organization_invitations i WHERE i.id=? AND i.status='accepted' AND i.accepted_by=? AND i.accepted_at=?)";
  const batinovaWorkspaceRosterAllowed=String(invitation.organization_id||'')===MANUAL_TEST_ORGANIZATION_ID;
  const claim=env.DB.prepare("UPDATE organization_invitations SET status='accepted',accepted_by=?,accepted_at=? WHERE id=? AND organization_id=? AND lower(email)=? AND status='pending' AND expires_at>? AND EXISTS(SELECT 1 FROM roles r WHERE r.id=organization_invitations.role_id AND r.organization_id=organization_invitations.organization_id AND r.code IN ('TEAM_LEAD','WORKER','ACCOUNTING')) AND (person_id IS NULL OR EXISTS(SELECT 1 FROM hr_people p WHERE p.organization_id=organization_invitations.organization_id AND p.id=organization_invitations.person_id AND p.active=1) OR (?=1 AND EXISTS(SELECT 1 FROM organization_workspace_state ws,json_each(CASE WHEN json_valid(ws.payload) THEN ws.payload ELSE '{}' END,'$.people') roster WHERE ws.organization_id=organization_invitations.organization_id AND CAST(json_extract(roster.value,'$.id') AS TEXT)=organization_invitations.person_id AND COALESCE(json_extract(roster.value,'$.active'),1)<>0 AND lower(COALESCE(json_extract(roster.value,'$.status'),'')) NOT IN ('inactive','archived','deleted')))) AND NOT EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=organization_invitations.organization_id AND om.user_id=?) AND NOT EXISTS(SELECT 1 FROM profiles p WHERE lower(p.email)=? AND p.id<>?) AND (person_id IS NULL OR NOT EXISTS(SELECT 1 FROM organization_members om WHERE om.organization_id=organization_invitations.organization_id AND om.person_id=organization_invitations.person_id AND om.status='active'))").bind(invitation.invited_by,stamp,invitation.id,invitation.organization_id,email,stamp,batinovaWorkspaceRosterAllowed?1:0,ctx.uid,email,ctx.uid);
  const profileInsert=env.DB.prepare(`INSERT OR IGNORE INTO profiles(id,first_name,last_name,email,created_at,updated_at) SELECT ?,?,?,?,?,? WHERE ${acceptedWhere}`).bind(ctx.uid,firstName,lastName,email,stamp,stamp,invitation.id,invitation.invited_by,stamp);
  const memberInsert=env.DB.prepare(`INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) SELECT ?,i.organization_id,?,?, 'active',?,?,?,i.person_id FROM organization_invitations i WHERE i.id=? AND ${acceptedWhere}`).bind(memberId,ctx.uid,invitation.role_id,stamp,stamp,stamp,invitation.id,invitation.id,invitation.invited_by,stamp);
  const statements=[claim,profileInsert,memberInsert];
  for(const projectId of projectIds)statements.push(env.DB.prepare(`INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) SELECT ?,?,?,?,? WHERE ${acceptedWhere}`).bind(invitation.organization_id,ctx.uid,projectId,invitation.invited_by,stamp,invitation.id,invitation.invited_by,stamp));
  statements.push(env.DB.prepare(`INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,new_values,created_at) SELECT ?,?,?,?,'organization_invitation',?,?,? WHERE ${acceptedWhere}`).bind(id('audit'),invitation.organization_id,ctx.uid,'member.invitation_accepted',invitation.id,JSON.stringify({user_id:ctx.uid,person_id:invitation.person_id||null,project_ids:projectIds}),stamp,invitation.id,invitation.invited_by,stamp));
  statements.push(env.DB.prepare("UPDATE organization_invitations SET accepted_by=? WHERE id=? AND status='accepted' AND accepted_by=? AND accepted_at=?").bind(ctx.uid,invitation.id,invitation.invited_by,stamp));
  const accepted=await dbBatch(env,statements);
  if(Number(accepted?.[0]?.meta?.changes)!==1)return json({error:'Cette invitation a expiré, a déjà été utilisée ou ses données ont changé.'},409);
  return json({organizationId:invitation.organization_id,activeOrganizationId:invitation.organization_id,roleId:invitation.role_id,personId:invitation.person_id||null,projectIds,status:'active'});
}
async function hrCanViewRecords(env,ctx){return ctx.roleCode==='OWNER'||await allowed(env,ctx,'hr.records.view')||await allowed(env,ctx,'hr.records.manage')}
async function hrCanManageRecords(env,ctx){return ctx.roleCode==='OWNER'||await allowed(env,ctx,'hr.records.manage')}
async function hrCanViewDirectory(env,ctx){return await hrCanViewRecords(env,ctx)||await allowed(env,ctx,'planning.assignments.manage')}
async function hrCanViewTeams(env,ctx){return await hrCanViewDirectory(env,ctx)}
async function hrCanManageTeams(env,ctx){return await hrCanManageRecords(env,ctx)||await allowed(env,ctx,'planning.assignments.manage')}
async function requireHrRecords(env,ctx,manage=false){if(!(manage?await hrCanManageRecords(env,ctx):await hrCanViewRecords(env,ctx)))throw Object.assign(Error('Vous ne pouvez pas accéder aux dossiers RH.'),{status:403})}
async function requireHrDirectory(env,ctx){if(!await hrCanViewDirectory(env,ctx))throw Object.assign(Error('Vous ne pouvez pas consulter l’annuaire du personnel.'),{status:403})}
async function requireHrTeams(env,ctx,manage=false){if(!(manage?await hrCanManageTeams(env,ctx):await hrCanViewTeams(env,ctx)))throw Object.assign(Error('Vous ne pouvez pas accéder aux équipes RH.'),{status:403})}
function hrDate(value){const text=String(value??'').trim();if(!text)return null;if(!validIsoDate(text))throw Object.assign(Error('Date RH invalide.'),{status:400});return text}
function hrBoolean(value,fallback=true){if(value===undefined)return fallback;if(typeof value!=='boolean')throw Object.assign(Error('Valeur booléenne RH invalide.'),{status:400});return value}
function legacyHrText(value,max){return String(value??'').trim().slice(0,max)}
function hrOptionalNumber(value,{min=0,max=168}={}){if(value===null||value===undefined||value==='')return null;return fieldNumber(value,{min,max})}
function hrOptionalCents(value){if(value===null||value===undefined||value==='')return null;if(!Number.isSafeInteger(value)||value<0)throw Object.assign(Error('Montant RH invalide.'),{status:400});return value}
function hrPersonJson(row){return{id:row.id,displayName:row.display_name,roleTitle:row.role_title||'',category:row.category||'Ouvrier',active:Boolean(row.active),source:row.source||'server',createdAt:row.created_at,updatedAt:row.updated_at}}
function hrEmploymentJson(row){return{id:row.id,personId:row.person_id,startsOn:row.starts_on||null,endsOn:row.ends_on||null,contractType:row.contract_type||'',weeklyHours:row.weekly_hours===null||row.weekly_hours===undefined?null:Number(row.weekly_hours),grossHourlyCents:row.gross_hourly_cents===null||row.gross_hourly_cents===undefined?null:Number(row.gross_hourly_cents),tradeName:row.trade_name||'',createdAt:row.created_at,updatedAt:row.updated_at}}
function hrTeamJson(row,members=[]){return{id:row.id,name:row.name,active:Boolean(row.active),source:row.source||'server',memberIds:members,createdAt:row.created_at,updatedAt:row.updated_at}}
async function ensureLegacyHrImported(env,ctx,state=null,{includeEmployment=true}={}){if(ctx.preview)return {replayed:true,imported:0,previewSkipped:true};
  const domain=includeEmployment?'hr':'hr_directory',existing=includeEmployment?await env.DB.prepare("SELECT 1 ok FROM legacy_domain_imports WHERE organization_id=? AND domain='hr'").bind(ctx.organizationId).first():await env.DB.prepare("SELECT 1 ok FROM legacy_domain_imports WHERE organization_id=? AND domain IN ('hr','hr_directory') LIMIT 1").bind(ctx.organizationId).first();if(existing)return {replayed:true,imported:0};
  state=state||await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});if(!state)return {replayed:false,imported:0,missingState:true};
  const stamp=now(),legacyPeople=Array.isArray(state.people)?state.people:[],legacyTeams=Array.isArray(state.teams)?state.teams:[],existingPeople=new Set((await rows(env.DB.prepare('SELECT id FROM hr_people WHERE organization_id=?').bind(ctx.organizationId))).map(row=>String(row.id))),employmentPeople=new Set((await rows(env.DB.prepare('SELECT person_id FROM employment_records WHERE organization_id=?').bind(ctx.organizationId))).map(row=>String(row.person_id))),existingTeamRows=await rows(env.DB.prepare('SELECT id,name FROM hr_teams WHERE organization_id=?').bind(ctx.organizationId)),existingTeams=new Set(existingTeamRows.map(row=>String(row.id))),teamByName=new Map(existingTeamRows.map(row=>[String(row.name||'').trim(),String(row.id)])),existingMembershipRows=await rows(env.DB.prepare('SELECT team_id,person_id FROM hr_team_members WHERE organization_id=? AND ends_on IS NULL').bind(ctx.organizationId)),existingMemberships=new Set(existingMembershipRows.map(row=>String(row.team_id)+'|'+String(row.person_id))),knownPeople=new Set(existingPeople),statements=[],imported={people:0,employment:0,teams:0,members:0};
  for(const person of legacyPeople){
    const personId=String(person?.id??'').trim(),displayName=legacyHrText(person?.name,160);if(!personId||!displayName)continue;
    knownPeople.add(personId);
    if(!existingPeople.has(personId)){statements.push(env.DB.prepare("INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,?, 'workspace_state',?,?)").bind(ctx.organizationId,personId,displayName,legacyHrText(person?.role,120),legacyHrText(person?.category||'Ouvrier',80)||'Ouvrier',person?.active===false?0:1,stamp,stamp));imported.people++}
    const startsOn=validIsoDate(String(person?.start||''))?String(person.start):null,contractType=legacyHrText(person?.contract,80),tradeName=legacyHrText(person?.trade,120),weeklyHours=person?.weeklyHours===undefined||person?.weeklyHours===null?null:Number(person.weeklyHours),grossHourlyCents=Number.isSafeInteger(person?.grossHourlyCents)?person.grossHourlyCents:null;
    const hasEmployment=Boolean(startsOn||contractType||tradeName||Number.isFinite(weeklyHours)||grossHourlyCents!==null);
    if(includeEmployment&&hasEmployment&&!employmentPeople.has(personId)){
      const safeWeekly=Number.isFinite(weeklyHours)&&weeklyHours>=0&&weeklyHours<=168?weeklyHours:null,safeGross=grossHourlyCents!==null&&grossHourlyCents>=0?grossHourlyCents:null;
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO employment_records(organization_id,id,person_id,starts_on,contract_type,weekly_hours,gross_hourly_cents,trade_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(ctx.organizationId,`legacy-employment-${personId}`,personId,startsOn,contractType||null,safeWeekly,safeGross,tradeName||null,stamp,stamp));imported.employment++;
    }
  }
  for(const team of legacyTeams){
    const legacyTeamId=String(team?.id??'').trim(),name=legacyHrText(team?.name,160);if(!legacyTeamId||!name)continue;
    let teamId=legacyTeamId;
    if(!existingTeams.has(legacyTeamId)){
      const sameNameId=teamByName.get(name);
      if(sameNameId)teamId=sameNameId;
      else{statements.push(env.DB.prepare("INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,?,?,1,'workspace_state',?,?)").bind(ctx.organizationId,legacyTeamId,name,stamp,stamp));existingTeams.add(legacyTeamId);teamByName.set(name,legacyTeamId);imported.teams++}
    }
    for(const rawPersonId of [...new Set((Array.isArray(team?.members)?team.members:[]).map(String))]){
      if(!knownPeople.has(rawPersonId))continue;
      const membershipKey=teamId+'|'+rawPersonId;if(existingMemberships.has(membershipKey))continue;
      statements.push(env.DB.prepare('INSERT OR IGNORE INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,NULL,NULL,?,?)').bind(ctx.organizationId,`legacy-team-${teamId}-person-${rawPersonId}`,teamId,rawPersonId,stamp,stamp));existingMemberships.add(membershipKey);imported.members++;
    }
  }
  const count=Object.values(imported).reduce((sum,value)=>sum+value,0);
  statements.push(env.DB.prepare('INSERT OR IGNORE INTO legacy_domain_imports(organization_id,domain,imported_at,imported_count) VALUES(?,?,?,?)').bind(ctx.organizationId,domain,stamp,count));
  statements.push(auditStatement(env,ctx,includeEmployment?'hr.legacy_imported':'hr.directory_legacy_imported','organization',ctx.organizationId,imported));
  await dbBatch(env,statements);
  return {replayed:false,imported:count,details:imported};
}
async function hrPeopleRoute(request,env,ctx,personId=null){
  if(request.method==='GET')await requireHrDirectory(env,ctx);else await requireHrRecords(env,ctx,true);await ensureLegacyHrImported(env,ctx,null,{includeEmployment:request.method!=='GET'||await hrCanViewRecords(env,ctx)});
  if(request.method==='GET'){
    if(personId){const row=await env.DB.prepare('SELECT * FROM hr_people WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(personId)).first();if(!row)return json({error:'Personne RH introuvable.'},404);return json({person:hrPersonJson(row)})}
    const list=await rows(env.DB.prepare('SELECT * FROM hr_people WHERE organization_id=? ORDER BY active DESC,display_name,id LIMIT 1000').bind(ctx.organizationId));return json({people:list.map(hrPersonJson)});
  }
  if(request.method==='POST'&&!personId){
    const data=exactObject(await body(request),['displayName','roleTitle','category','active']),displayName=fieldText(data.displayName,160),roleTitle=fieldText(data.roleTitle||'',120),category=fieldText(data.category||'Ouvrier',80)||'Ouvrier';if(!displayName)return json({error:'Nom de la personne obligatoire.'},400);const personId=id('hr-person'),stamp=now(),active=hrBoolean(data.active,true)?1:0;await dbBatch(env,[env.DB.prepare("INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,?, 'server',?,?)").bind(ctx.organizationId,personId,displayName,roleTitle,category,active,stamp,stamp),auditStatement(env,ctx,'hr.person.created','hr_person',personId,{display_name:displayName,role_title:roleTitle,category,active:Boolean(active)})]);return json({person:hrPersonJson(await env.DB.prepare('SELECT * FROM hr_people WHERE organization_id=? AND id=?').bind(ctx.organizationId,personId).first())},201);
  }
  if(request.method==='PATCH'&&personId){
    const old=await env.DB.prepare('SELECT * FROM hr_people WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(personId)).first();if(!old)return json({error:'Personne RH introuvable.'},404);const data=exactObject(await body(request),['displayName','roleTitle','category','active']),displayName=data.displayName===undefined?old.display_name:fieldText(data.displayName,160),roleTitle=data.roleTitle===undefined?old.role_title:fieldText(data.roleTitle,120),category=data.category===undefined?old.category:fieldText(data.category,80),active=hrBoolean(data.active,Boolean(old.active))?1:0;if(!displayName||!category)return json({error:'Données RH invalides.'},400);const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE hr_people SET display_name=?,role_title=?,category=?,active=?,source=?,updated_at=? WHERE organization_id=? AND id=?').bind(displayName,roleTitle,category,active,'server',stamp,ctx.organizationId,String(personId)),auditStatement(env,ctx,'hr.person.updated','hr_person',String(personId),{display_name:displayName,role_title:roleTitle,category,active:Boolean(active)},hrPersonJson(old))]);return json({person:hrPersonJson(await env.DB.prepare('SELECT * FROM hr_people WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(personId)).first())});
  }
  return json({error:'Méthode non autorisée.'},405);
}
async function hrEmploymentRoute(request,env,ctx,personId,recordId=null){
  await requireHrRecords(env,ctx,request.method!=='GET');await ensureLegacyHrImported(env,ctx,null,{includeEmployment:true});const person=await env.DB.prepare('SELECT id FROM hr_people WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(personId)).first();if(!person)return json({error:'Personne RH introuvable.'},404);
  if(request.method==='GET'){
    if(recordId){const row=await env.DB.prepare('SELECT * FROM employment_records WHERE organization_id=? AND person_id=? AND id=?').bind(ctx.organizationId,String(personId),String(recordId)).first();if(!row)return json({error:'Contrat RH introuvable.'},404);return json({employment:hrEmploymentJson(row)})}
    const list=await rows(env.DB.prepare('SELECT * FROM employment_records WHERE organization_id=? AND person_id=? ORDER BY COALESCE(starts_on,\'0000-00-00\') DESC,created_at DESC').bind(ctx.organizationId,String(personId)));return json({employmentRecords:list.map(hrEmploymentJson)});
  }
  const old=recordId?await env.DB.prepare('SELECT * FROM employment_records WHERE organization_id=? AND person_id=? AND id=?').bind(ctx.organizationId,String(personId),String(recordId)).first():null;if(recordId&&!old)return json({error:'Contrat RH introuvable.'},404);if(!['POST','PATCH'].includes(request.method)||request.method==='POST'&&recordId)return json({error:'Méthode non autorisée.'},405);
  const data=exactObject(await body(request),['startsOn','endsOn','contractType','weeklyHours','grossHourlyCents','tradeName']),startsOn=data.startsOn===undefined?(old?.starts_on||null):hrDate(data.startsOn),endsOn=data.endsOn===undefined?(old?.ends_on||null):hrDate(data.endsOn),contractType=data.contractType===undefined?(old?.contract_type||''):fieldText(data.contractType,80),weeklyHours=data.weeklyHours===undefined?(old?.weekly_hours??null):hrOptionalNumber(data.weeklyHours),grossHourlyCents=data.grossHourlyCents===undefined?(old?.gross_hourly_cents??null):hrOptionalCents(data.grossHourlyCents),tradeName=data.tradeName===undefined?(old?.trade_name||''):fieldText(data.tradeName,120);if(startsOn&&endsOn&&endsOn<startsOn)return json({error:'La fin du contrat ne peut pas précéder son début.'},400);if(!startsOn&&!endsOn&&!contractType&&weeklyHours===null&&grossHourlyCents===null&&!tradeName)return json({error:'Le dossier contractuel est vide.'},400);const stamp=now(),employmentId=recordId?String(recordId):id('employment'),newValues={person_id:String(personId),starts_on:startsOn,ends_on:endsOn,contract_type:contractType,weekly_hours:weeklyHours,gross_hourly_cents:grossHourlyCents,trade_name:tradeName};
  if(request.method==='POST')await dbBatch(env,[env.DB.prepare('INSERT INTO employment_records(organization_id,id,person_id,starts_on,ends_on,contract_type,weekly_hours,gross_hourly_cents,trade_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(ctx.organizationId,employmentId,String(personId),startsOn,endsOn,contractType||null,weeklyHours,grossHourlyCents,tradeName||null,stamp,stamp),auditStatement(env,ctx,'hr.employment.created','employment_record',employmentId,newValues)]);
  else await dbBatch(env,[env.DB.prepare('UPDATE employment_records SET starts_on=?,ends_on=?,contract_type=?,weekly_hours=?,gross_hourly_cents=?,trade_name=?,updated_at=? WHERE organization_id=? AND person_id=? AND id=?').bind(startsOn,endsOn,contractType||null,weeklyHours,grossHourlyCents,tradeName||null,stamp,ctx.organizationId,String(personId),employmentId),auditStatement(env,ctx,'hr.employment.updated','employment_record',employmentId,newValues,hrEmploymentJson(old))]);
  return json({employment:hrEmploymentJson(await env.DB.prepare('SELECT * FROM employment_records WHERE organization_id=? AND person_id=? AND id=?').bind(ctx.organizationId,String(personId),employmentId).first())},request.method==='POST'?201:200);
}
async function hrTeamsRoute(request,env,ctx,teamId=null){
  await requireHrTeams(env,ctx,request.method!=='GET');await ensureLegacyHrImported(env,ctx,null,{includeEmployment:await hrCanViewRecords(env,ctx)});
  if(request.method==='GET'){
    const list=teamId?[await env.DB.prepare('SELECT * FROM hr_teams WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(teamId)).first()].filter(Boolean):await rows(env.DB.prepare('SELECT * FROM hr_teams WHERE organization_id=? ORDER BY active DESC,name,id LIMIT 500').bind(ctx.organizationId));if(teamId&&!list.length)return json({error:'Équipe RH introuvable.'},404);const memberships=await rows(env.DB.prepare("SELECT team_id,person_id FROM hr_team_members WHERE organization_id=? AND (starts_on IS NULL OR starts_on<=?) AND ends_on IS NULL ORDER BY team_id,person_id").bind(ctx.organizationId,now().slice(0,10))),map=new Map();for(const member of memberships){const key=String(member.team_id),values=map.get(key)||[];values.push(String(member.person_id));map.set(key,values)}const output=list.map(row=>hrTeamJson(row,map.get(String(row.id))||[]));return json(teamId?{team:output[0]}:{teams:output});
  }
  if(request.method==='POST'&&!teamId){const data=exactObject(await body(request),['name','active']),name=fieldText(data.name,160);if(!name)return json({error:'Nom de l’équipe obligatoire.'},400);const teamId=id('hr-team'),stamp=now(),active=hrBoolean(data.active,true)?1:0;try{await dbBatch(env,[env.DB.prepare("INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,?,?,?, 'server',?,?)").bind(ctx.organizationId,teamId,name,active,stamp,stamp),auditStatement(env,ctx,'hr.team.created','hr_team',teamId,{name,active:Boolean(active)})])}catch(error){if(String(error?.message||'').includes('UNIQUE'))return json({error:'Une équipe porte déjà ce nom.'},409);throw error}return json({team:hrTeamJson(await env.DB.prepare('SELECT * FROM hr_teams WHERE organization_id=? AND id=?').bind(ctx.organizationId,teamId).first(),[])},201)}
  if(request.method==='PATCH'&&teamId){const old=await env.DB.prepare('SELECT * FROM hr_teams WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(teamId)).first();if(!old)return json({error:'Équipe RH introuvable.'},404);const data=exactObject(await body(request),['name','active']),name=data.name===undefined?old.name:fieldText(data.name,160),active=hrBoolean(data.active,Boolean(old.active))?1:0;if(!name)return json({error:'Nom de l’équipe obligatoire.'},400);const stamp=now();try{await dbBatch(env,[env.DB.prepare("UPDATE hr_teams SET name=?,active=?,source='server',updated_at=? WHERE organization_id=? AND id=?").bind(name,active,stamp,ctx.organizationId,String(teamId)),auditStatement(env,ctx,'hr.team.updated','hr_team',String(teamId),{name,active:Boolean(active)},hrTeamJson(old,[]))])}catch(error){if(String(error?.message||'').includes('UNIQUE'))return json({error:'Une équipe porte déjà ce nom.'},409);throw error}return json({team:hrTeamJson(await env.DB.prepare('SELECT * FROM hr_teams WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(teamId)).first(),[])})}
  return json({error:'Méthode non autorisée.'},405);
}
async function hrTeamMembersRoute(request,env,ctx,teamId){
  if(request.method!=='PUT')return json({error:'Méthode non autorisée.'},405);await requireHrTeams(env,ctx,true);await ensureLegacyHrImported(env,ctx,null,{includeEmployment:await hrCanViewRecords(env,ctx)});const team=await env.DB.prepare('SELECT id FROM hr_teams WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(teamId)).first();if(!team)return json({error:'Équipe RH introuvable.'},404);const data=exactObject(await body(request),['memberIds']),memberIds=[...new Set((Array.isArray(data.memberIds)?data.memberIds:[]).map(value=>String(value).trim()).filter(Boolean))];if(memberIds.length>500)return json({error:'Trop de membres dans cette équipe.'},400);const known=new Set((await rows(env.DB.prepare('SELECT id FROM hr_people WHERE organization_id=? AND active=1').bind(ctx.organizationId))).map(row=>String(row.id)));if(memberIds.some(personId=>!known.has(personId)))return json({error:'Un membre n’appartient pas aux personnes RH actives de cette entreprise.'},400);const open=await rows(env.DB.prepare('SELECT id,person_id FROM hr_team_members WHERE organization_id=? AND team_id=? AND ends_on IS NULL').bind(ctx.organizationId,String(teamId))),current=new Set(open.map(row=>String(row.person_id))),wanted=new Set(memberIds),today=now().slice(0,10),stamp=now(),statements=[];for(const row of open)if(!wanted.has(String(row.person_id)))statements.push(env.DB.prepare('UPDATE hr_team_members SET ends_on=?,updated_at=? WHERE organization_id=? AND id=?').bind(today,stamp,ctx.organizationId,row.id));for(const personId of memberIds)if(!current.has(personId)){statements.push(env.DB.prepare('UPDATE hr_team_members SET ends_on=NULL,updated_at=? WHERE organization_id=? AND team_id=? AND person_id=? AND starts_on=?').bind(stamp,ctx.organizationId,String(teamId),personId,today));statements.push(env.DB.prepare('INSERT OR IGNORE INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,ends_on,created_at,updated_at) VALUES(?,?,?,?,?,NULL,?,?)').bind(ctx.organizationId,id('hr-team-member'),String(teamId),personId,today,stamp,stamp));}statements.push(auditStatement(env,ctx,'hr.team.members_updated','hr_team',String(teamId),{member_ids:memberIds},{member_ids:[...current]}));await dbBatch(env,statements);return json({teamId:String(teamId),memberIds});
}
async function legacyUpgradeRoute(request,env,ctx){
  if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Seul le propriétaire peut lancer la migration héritée.'),{status:403});const data=exactObject(await body(request),['domains']),domains=Array.isArray(data.domains)?data.domains:['invoices','time_entries','field_data','hr'],state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview}),done=[];if(!state)return json({domains:[],message:'Aucun état historique à migrer.'});for(const domain of domains){if(!['invoices','time_entries','field_data','hr'].includes(domain))continue;const existing=await env.DB.prepare('SELECT 1 ok FROM legacy_domain_imports WHERE organization_id=? AND domain=?').bind(ctx.organizationId,domain).first();if(existing){done.push({domain,replayed:true});continue}if(domain==='invoices')await ensureLegacyInvoicesImported(env,ctx);if(domain==='time_entries')await ensureLegacyTimeEntriesImported(env,ctx,state);if(domain==='field_data')await ensureLegacyFieldDataImported(env,ctx,state);if(domain==='hr'){const result=await ensureLegacyHrImported(env,ctx,state,{includeEmployment:true});done.push({domain,replayed:Boolean(result.replayed),imported:Number(result.imported||0)});continue}await env.DB.prepare('INSERT OR IGNORE INTO legacy_domain_imports(organization_id,domain,imported_at,imported_count) VALUES(?,?,?,0)').bind(ctx.organizationId,domain,now()).run();done.push({domain,replayed:false})}return json({domains:done})
}
function quotePayload(row){
  return {
    id:row.id,
    projectId:row.project_id||null,
    customerId:row.customer_id||null,
    reference:row.reference,
    status:row.status,
    title:row.title,
    client:row.client_name,
    clientAddress:row.client_address,
    date:row.issue_date,
    validUntil:row.valid_until,
    deposit:Number(row.deposit_percent||0),
    paymentTerms:row.payment_terms,
    notes:row.notes,
    exclusions:row.exclusions,
    lines:parseJson(row.lines_json,[]),
    createdAt:row.created_at,
    updatedAt:row.updated_at
  };
}
function quoteCustomerProjection(row){
  const client=String(row?.company_name||[row?.first_name,row?.last_name].filter(Boolean).join(' ')||row?.id||'').trim();
  const locality=[row?.postal_code,row?.city].filter(Boolean).join(' ').trim();
  const clientAddress=[row?.street,locality].filter(Boolean).join(', ').trim();
  return {client,clientAddress};
}
async function quoteCanonicalCustomer(env,ctx,customerId){
  if(!customerId)return null;
  return env.DB.prepare("SELECT id,company_name,first_name,last_name,street,postal_code,city FROM customers WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,String(customerId)).first();
}
async function requireQuoteProject(env,ctx,projectId){
  if(!projectId)return;
  await requireProjectScope(env,ctx,String(projectId));
  const state=await organizationWorkspaceState(env,ctx.organizationId,{readOnly:ctx.preview});
  const legacy=Boolean(state&&workspaceProject(state,String(projectId)));
  const relational=await env.DB.prepare("SELECT 1 ok FROM projects WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,String(projectId)).first();
  if(!legacy&&!relational)throw Object.assign(Error('Chantier introuvable.'),{status:404});
}
function quoteMutationMatches(row,next){
  return String(row.project_id||'')===String(next.projectId||'')
    &&String(row.customer_id||'')===String(next.customerId||'')
    &&String(row.reference||'')===String(next.reference||'')
    &&String(row.status||'')===String(next.status||'')
    &&String(row.title||'')===String(next.title||'')
    &&String(row.client_name||'')===String(next.client||'')
    &&String(row.client_address||'')===String(next.clientAddress||'')
    &&String(row.issue_date||'')===String(next.date||'')
    &&String(row.valid_until||'')===String(next.validUntil||'')
    &&Number(row.deposit_percent||0)===Number(next.deposit||0)
    &&String(row.payment_terms||'')===String(next.paymentTerms||'')
    &&String(row.notes||'')===String(next.notes||'')
    &&String(row.exclusions||'')===String(next.exclusions||'')
    &&JSON.stringify(parseJson(row.lines_json,[]))===JSON.stringify(next.lines||[]);
}
function acceptedQuoteProjectStatement(env,ctx,projectId,customerId,quoteTotalCents,stamp){
  return env.DB.prepare("UPDATE projects SET customer_id=COALESCE(?,customer_id),quoted_amount_cents=?+COALESCE((SELECT SUM(total_cents) FROM quote_amendments WHERE organization_id=? AND project_id=? AND status='accepted' AND archived_at IS NULL),0),updated_at=? WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(customerId,quoteTotalCents,ctx.organizationId,projectId,stamp,ctx.organizationId,projectId);
}
async function quoteRoutes(request,env,ctx,quoteId=null){
  if(request.method==='GET'){
    await requirePermission(env,ctx,'quotes.view');
    const canSeePrices=await quotePriceReadable(env,ctx);
    if(quoteId){
      const row=await env.DB.prepare("SELECT * FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,String(quoteId)).first();
      if(!row)return json({error:'Devis introuvable.'},404);
      if(row.project_id)await requireFinanceProjectScope(env,ctx,row.project_id);
      const payload=quotePayload(row);
      return json({quote:canSeePrices?payload:stripQuotePrices(payload)});
    }
    const list=await rows(env.DB.prepare("SELECT * FROM quotes_server WHERE organization_id=? AND archived_at IS NULL ORDER BY issue_date DESC,created_at DESC LIMIT 500").bind(ctx.organizationId)),visible=[];
    for(const row of list){
      try{
        if(row.project_id)await requireFinanceProjectScope(env,ctx,row.project_id);
        const payload=quotePayload(row);
        visible.push(canSeePrices?payload:stripQuotePrices(payload));
      }catch(error){if(error?.status!==403)throw error}
    }
    return json({quotes:visible});
  }
  if(!['POST','PUT'].includes(request.method))return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,request.method==='POST'?'quotes.create':'quotes.edit');

  const data=exactObject(await body(request,100000),['projectId','customerId','reference','status','title','client','clientAddress','date','validUntil','deposit','paymentTerms','notes','exclusions','lines']);
  const old=request.method==='PUT'
    ?await env.DB.prepare("SELECT * FROM quotes_server WHERE id=? AND organization_id=? AND archived_at IS NULL").bind(String(quoteId||''),ctx.organizationId).first()
    :null;
  if(request.method==='PUT'&&!old)return json({error:'Devis introuvable.'},404);
  if(old?.project_id)await requireProjectScope(env,ctx,old.project_id);

  const hasProject=Object.prototype.hasOwnProperty.call(data,'projectId');
  const hasCustomer=Object.prototype.hasOwnProperty.call(data,'customerId');
  const projectId=hasProject?(data.projectId?String(data.projectId).trim():null):(old?.project_id||null);
  const customerId=hasCustomer?(data.customerId?String(data.customerId).trim():null):(old?.customer_id||null);
  if(projectId)await requireQuoteProject(env,ctx,projectId);
  else await requirePermission(env,ctx,'customers.view');

  const customer=await quoteCanonicalCustomer(env,ctx,customerId);
  if(customerId&&!customer)return json({error:'Client introuvable dans cette entreprise.'},404);
  if(!projectId&&!customerId)return json({error:'Un devis pré-chantier doit être lié à un client.'},400);

  const title=String(data.title||'').trim();
  let client=String(data.client===undefined?(old?.client_name||''):data.client||'').trim();
  let clientAddress=String(data.clientAddress===undefined?(old?.client_address||''):data.clientAddress||'').trim().slice(0,300);
  if(customer){
    const projection=quoteCustomerProjection(customer);
    if(!projectId||!client)client=projection.client;
    if(!clientAddress)clientAddress=projection.clientAddress;
  }
  const date=String(data.date||''),validUntil=String(data.validUntil||''),lines=Array.isArray(data.lines)?data.lines:[];
  if(!title||!client||!validIsoDate(date)||!validIsoDate(validUntil)||validUntil<date||!lines.length)return json({error:'Devis incomplet ou dates invalides.'},400);

  const normalized=lines.map(line=>({
    label:String(line.label||'').trim().slice(0,240),
    description:String(line.description||'').trim().slice(0,1000),
    qty:Number(line.qty||0),
    unit:String(line.unit||'forfait').slice(0,60),
    price:Number(line.price||0),
    vat:Number(line.vat||0)
  }));
  if(normalized.some(line=>!line.label||!Number.isFinite(line.qty)||line.qty<=0||!Number.isFinite(line.price)||line.price<0||![0,6,12,21].includes(line.vat)))return json({error:'Lignes de devis invalides.'},400);

  const stamp=now(),deposit=Math.min(100,Math.max(0,Math.round(Number(data.deposit||0))));
  const reference=String(data.reference||old?.reference||('DEV-'+date.slice(0,4)+'-'+crypto.randomUUID().slice(0,8))).trim().slice(0,80);
  const status=['draft','sent','accepted','rejected','expired'].includes(data.status)?data.status:(old?.status||'draft');
  const paymentTerms=String(data.paymentTerms||'').slice(0,500),notes=String(data.notes||'').slice(0,2000),exclusions=String(data.exclusions||'').slice(0,2000);
  const quoteTotalCents=Math.round(normalized.reduce((sum,line)=>sum+(line.qty*line.price)+(line.qty*line.price*(line.vat/100)),0)*100);
  const next={projectId,customerId,reference,status,title,client,clientAddress,date,validUntil,deposit,paymentTerms,notes,exclusions,lines:normalized};

  if(request.method==='POST'){
    const qid=id('quote'),statements=[
      env.DB.prepare("INSERT INTO quotes_server(id,organization_id,project_id,customer_id,reference,status,title,client_name,client_address,issue_date,valid_until,deposit_percent,payment_terms,notes,exclusions,lines_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(qid,ctx.organizationId,projectId,customerId,reference,status,title,client,clientAddress,date,validUntil,deposit,paymentTerms,notes,exclusions,JSON.stringify(normalized),ctx.uid,stamp,stamp),
      auditStatement(env,ctx,'quote.created','quote',qid,{project_id:projectId,customer_id:customerId,reference,status,preproject:!projectId})
    ];
    if(status==='accepted'){
      statements.push(auditStatement(env,ctx,'quote.accepted','quote',qid,{project_id:projectId,customer_id:customerId,reference,preproject:!projectId}));
      if(projectId)statements.push(acceptedQuoteProjectStatement(env,ctx,projectId,customerId,quoteTotalCents,stamp));
    }
    await dbBatch(env,statements);
    return json({quote:quotePayload(await env.DB.prepare("SELECT * FROM quotes_server WHERE id=? AND organization_id=?").bind(qid,ctx.organizationId).first())},201);
  }

  if(quoteMutationMatches(old,next)){
    return json({quote:quotePayload(old),replayed:true},200);
  }

  const statements=[
    env.DB.prepare("UPDATE quotes_server SET project_id=?,customer_id=?,reference=?,status=?,title=?,client_name=?,client_address=?,issue_date=?,valid_until=?,deposit_percent=?,payment_terms=?,notes=?,exclusions=?,lines_json=?,updated_at=? WHERE id=? AND organization_id=?").bind(projectId,customerId,reference,status,title,client,clientAddress,date,validUntil,deposit,paymentTerms,notes,exclusions,JSON.stringify(normalized),stamp,String(quoteId),ctx.organizationId),
    auditStatement(env,ctx,'quote.updated','quote',String(quoteId),{project_id:projectId,customer_id:customerId,reference,status,preproject:!projectId},quotePayload(old))
  ];
  if(old.status!=='accepted'&&status==='accepted'){
    statements.push(auditStatement(env,ctx,'quote.accepted','quote',String(quoteId),{project_id:projectId,customer_id:customerId,reference,preproject:!projectId}));
  }
  if(status==='accepted'&&projectId)statements.push(acceptedQuoteProjectStatement(env,ctx,projectId,customerId,quoteTotalCents,stamp));
  await dbBatch(env,statements);
  return json({quote:quotePayload(await env.DB.prepare("SELECT * FROM quotes_server WHERE id=? AND organization_id=?").bind(String(quoteId),ctx.organizationId).first())});
}

async function requireQuoteVisitWrite(env,ctx){if(ctx.roleCode!=='OWNER'&&!await allowed(env,ctx,'quotes.create')&&!await allowed(env,ctx,'quotes.edit'))throw Object.assign(Error('Vous ne pouvez pas modifier les relevés de visite.'),{status:403})}
async function quoteVisitPayload(env,ctx,row){const documents=await rows(env.DB.prepare('SELECT v.document_id,v.kind,v.created_at,d.original_name,d.content_type,d.byte_size FROM quote_site_visit_documents v JOIN secure_documents d ON d.organization_id=v.organization_id AND d.id=v.document_id WHERE v.organization_id=? AND v.visit_id=? AND d.archived_at IS NULL ORDER BY v.created_at,v.document_id').bind(ctx.organizationId,row.id));return{id:row.id,customerId:row.customer_id||null,place:row.place,contact:row.contact||'',notes:row.notes||'',quoteId:row.quote_id||null,createdAt:row.created_at,updatedAt:row.updated_at,operationKey:row.operation_key,documents:documents.map(item=>({id:item.document_id,kind:item.kind,name:item.original_name,contentType:item.content_type,byteSize:Number(item.byte_size||0),createdAt:item.created_at}))}}
async function quoteVisitRoutes(request,env,ctx,visitId=null,action=''){
if(request.method==='GET'){
    await requirePermission(env,ctx,'quotes.view');
    if(visitId){const row=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,visitId).first();if(!row)return json({error:'Dossier de visite introuvable.'},404);if(row.quote_id){const quote=await env.DB.prepare('SELECT project_id FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,row.quote_id).first();if(quote?.project_id)await requireFinanceProjectScope(env,ctx,quote.project_id)}return json({visit:await quoteVisitPayload(env,ctx,row)})}
    const list=await rows(env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? ORDER BY created_at DESC,id DESC LIMIT 300').bind(ctx.organizationId)),visible=[];for(const row of list){try{if(row.quote_id){const quote=await env.DB.prepare('SELECT project_id FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,row.quote_id).first();if(quote?.project_id)await requireFinanceProjectScope(env,ctx,quote.project_id)}visible.push(await quoteVisitPayload(env,ctx,row))}catch(error){if(error?.status!==403)throw error}}return json({visits:visible});
  }
  if(action==='quote'){
    if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requireQuoteVisitWrite(env,ctx);
    const visit=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,visitId).first();if(!visit)return json({error:'Dossier de visite introuvable.'},404);
    const data=exactObject(await body(request,10000),['quoteId']),quoteId=String(data.quoteId||'').trim();if(!quoteId)return json({error:'Devis de destination obligatoire.'},400);
    const quote=await env.DB.prepare('SELECT id,project_id FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,quoteId).first();if(!quote)return json({error:'Devis introuvable dans cette entreprise.'},404);if(quote.project_id)await requireFinanceProjectScope(env,ctx,quote.project_id);
    if(visit.quote_id&&String(visit.quote_id)!==quoteId)return json({error:'Ce relevé est déjà rattaché à un autre devis.'},409);if(String(visit.quote_id)===quoteId)return json({linked:true,replayed:true,quoteId},200);
    const docs=await rows(env.DB.prepare('SELECT document_id FROM quote_site_visit_documents WHERE organization_id=? AND visit_id=?').bind(ctx.organizationId,visitId)),stamp=now(),statements=[env.DB.prepare('UPDATE quote_site_visits SET quote_id=?,updated_at=? WHERE organization_id=? AND id=? AND quote_id IS NULL').bind(quoteId,stamp,ctx.organizationId,visitId)];
    for(const item of docs)statements.push(auditStatement(env,ctx,'quote_visit.document_linked','secure_document',item.document_id,{quote_id:quoteId,visit_id:String(visitId)}));statements.push(auditStatement(env,ctx,'quote_visit.linked','quote_site_visit',visitId,{quote_id:quoteId}));await dbBatch(env,statements);return json({linked:true,quoteId});
  }
  if(visitId&&action==='attachments'){
    if(request.method!=='POST')return json({error:'Méthode non autorisée.'},405);await requireQuoteVisitWrite(env,ctx);const visit=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,visitId).first();if(!visit)return json({error:'Dossier de visite introuvable.'},404);
    if(!request.headers.get('content-type')?.startsWith('multipart/form-data'))throw Object.assign(Error('Format attendu : multipart/form-data.'),{status:415});if(Number(request.headers.get('content-length')||0)>9_000_000)throw Object.assign(Error('Les pièces jointes dépassent la taille autorisée.'),{status:413});let form;try{form=await request.formData()}catch{throw Object.assign(Error('Pièces jointes illisibles.'),{status:400})}
    const key=operationKey({operationKey:form.get('operationKey')}),files=[];for(const file of form.getAll('photos'))if(file&&typeof file.arrayBuffer==='function'&&file.size>0)files.push({file,kind:'photo'});for(const file of form.getAll('sketches'))if(file&&typeof file.arrayBuffer==='function'&&file.size>0)files.push({file,kind:'sketch'});for(const file of form.getAll('voice'))if(file&&typeof file.arrayBuffer==='function'&&file.size>0)files.push({file,kind:'voice'});if(!files.length)return json({visit:await quoteVisitPayload(env,ctx,visit)});if(files.length>12)throw Object.assign(Error('Maximum 12 pièces par envoi.'),{status:400});
    const folderId=await ensureDocumentRootFolder(env,ctx),added=[];let index=0;
    for(const item of files){const file=item.file;if(file.size>DOCUMENT_MAX_BYTES)throw Object.assign(Error('Chaque fichier doit rester sous 1,8 Mo.'),{status:413});const bytes=await file.arrayBuffer(),checksum=await sha256Hex(bytes),name=safeOriginalName(file.name),detected=detectedDocumentMime(bytes),declared=String(file.type||'').toLowerCase().split(';')[0];if(!detected||!DOCUMENT_MIME_TYPES.has(detected)||declared&&declared!==detected||!documentExtensionMatches(name,detected)||item.kind==='voice'&&!detected.startsWith('audio/')||item.kind!=='voice'&&!detected.startsWith('image/'))throw Object.assign(Error('Un fichier ne correspond pas à son type ou son extension.'),{status:415});const operation=`${key}:${index++}`,existing=await env.DB.prepare('SELECT id,checksum_sha256,original_name,idempotency_key FROM secure_documents WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,operation).first();if(existing){if(existing.checksum_sha256!==checksum||existing.original_name!==name)return json({error:'Cette clé a déjà servi pour un autre fichier.'},409);const linked=await env.DB.prepare('SELECT 1 ok FROM quote_site_visit_documents WHERE organization_id=? AND visit_id=? AND document_id=?').bind(ctx.organizationId,visitId,existing.id).first();if(linked){added.push({id:existing.id,kind:item.kind});continue}if(Number((await env.DB.prepare('SELECT COUNT(*) total FROM quote_site_visit_documents WHERE organization_id=? AND visit_id=?').bind(ctx.organizationId,visitId).first())?.total||0)>=12)throw Object.assign(Error('Cette visite a atteint la limite de 12 pièces.'),{status:400});const stamp=now();await dbBatch(env,[env.DB.prepare('INSERT INTO quote_site_visit_documents(organization_id,visit_id,document_id,kind,created_at) VALUES(?,?,?,?,?)').bind(ctx.organizationId,visitId,existing.id,item.kind,stamp),env.DB.prepare('INSERT INTO quote_site_visit_document_relations(organization_id,visit_id,document_id,created_by,created_at) VALUES(?,?,?,?,?)').bind(ctx.organizationId,visitId,existing.id,ctx.uid,stamp),auditStatement(env,ctx,'quote_visit.attachment.linked','secure_document',existing.id,{visit_id:String(visitId),kind:item.kind})]);added.push({id:existing.id,kind:item.kind});continue}
      const documentId=id('document'),relationId=id('document-relation'),stamp=now(),title=`${item.kind==='voice'?'Note vocale':item.kind==='sketch'?'Croquis':'Photo'} · ${visit.place}`,documentType=item.kind==='voice'?'quote_visit_audio':item.kind==='sketch'?'quote_visit_sketch':'quote_visit_photo',storageKey=`private/${ctx.organizationId}/${documentId}`,statements=[env.DB.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,checksum_sha256,sensitivity,status,uploaded_by,created_at,updated_at,archived_at,title,description,category,reference,idempotency_key,document_type,document_date,origin,business_owner_type,business_owner_id,classification_source,ocr_status,archived_reason) VALUES(?,?,?,?,?,?,?,?,?,'available',?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(documentId,ctx.organizationId,folderId,storageKey,name,detected,file.size,checksum,'standard',ctx.uid,stamp,stamp,title,'Visite avant devis','Relevé de visite','',operation,documentType,stamp.slice(0,10),'mobile_upload','organization',ctx.organizationId,'manual','not_requested',''),env.DB.prepare('INSERT INTO secure_document_blobs(document_id,organization_id,content,created_at) VALUES(?,?,?,?)').bind(documentId,ctx.organizationId,new Uint8Array(bytes),stamp),env.DB.prepare('INSERT INTO quote_site_visit_documents(organization_id,visit_id,document_id,kind,created_at) VALUES(?,?,?,?,?)').bind(ctx.organizationId,String(visitId),documentId,item.kind,stamp),env.DB.prepare('INSERT INTO quote_site_visit_document_relations(organization_id,visit_id,document_id,created_by,created_at) VALUES(?,?,?,?,?)').bind(ctx.organizationId,String(visitId),documentId,ctx.uid,stamp),auditStatement(env,ctx,'quote_visit.attachment.uploaded','secure_document',documentId,{visit_id:String(visitId),kind:item.kind,checksum_sha256:checksum,byte_size:file.size})];if(visit.customer_id)statements.push(env.DB.prepare('INSERT INTO document_relations(id,organization_id,document_id,relation_type,relation_id,created_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(id('document-relation'),ctx.organizationId,documentId,'customer',visit.customer_id,ctx.uid,stamp));if(visit.quote_id)statements.push(auditStatement(env,ctx,'quote_visit.attachment.linked_to_quote','secure_document',documentId,{quote_id:visit.quote_id,visit_id:String(visitId)}));await dbBatch(env,statements);added.push({id:documentId,kind:item.kind});
    }
    const updated=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,visitId).first();return json({visit:await quoteVisitPayload(env,ctx,updated),added});
  }
  if(request.method==='POST'&&!visitId){await requirePermission(env,ctx,'quotes.create');const data=exactObject(await body(request,15000),['customerId','place','contact','notes','operationKey']),customerId=data.customerId?String(data.customerId).trim():null,place=fieldText(data.place,200),contact=fieldText(data.contact||'',160),notes=fieldText(data.notes||'',6000),key=operationKey({operationKey:data.operationKey});if(!place)return json({error:'Le lieu ou l’adresse de la visite est obligatoire.'},400);if(customerId){const customer=await env.DB.prepare('SELECT id FROM customers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,customerId).first();if(!customer)return json({error:'Client introuvable dans cette entreprise.'},404)}const existing=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND operation_key=?').bind(ctx.organizationId,key).first();if(existing){if(existing.place!==place||existing.contact!==contact||existing.notes!==notes||String(existing.customer_id||'')!==String(customerId||''))return json({error:'Cette clé de visite a déjà été utilisée avec d’autres informations.'},409);return json({visit:await quoteVisitPayload(env,ctx,existing),replayed:true},200)}const visitId=id('quote-visit'),stamp=now();await dbBatch(env,[env.DB.prepare('INSERT INTO quote_site_visits(id,organization_id,customer_id,place,contact,notes,operation_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(visitId,ctx.organizationId,customerId,place,contact,notes,key,ctx.uid,stamp,stamp),auditStatement(env,ctx,'quote_visit.created','quote_site_visit',visitId,{customer_id:customerId,place})]);const row=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,visitId).first();return json({visit:await quoteVisitPayload(env,ctx,row)},201)}
  if(visitId&&request.method==='PATCH'){await requireQuoteVisitWrite(env,ctx);const old=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,visitId).first();if(!old)return json({error:'Dossier de visite introuvable.'},404);const data=exactObject(await body(request,15000),['place','contact','notes']),place=data.place===undefined?old.place:fieldText(data.place,200),contact=data.contact===undefined?old.contact:fieldText(data.contact,160),notes=data.notes===undefined?old.notes:fieldText(data.notes,6000);if(!place)return json({error:'Le lieu de la visite est obligatoire.'},400);if(place===old.place&&contact===old.contact&&notes===old.notes)return json({visit:await quoteVisitPayload(env,ctx,old),replayed:true});const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE quote_site_visits SET place=?,contact=?,notes=?,updated_at=? WHERE organization_id=? AND id=?').bind(place,contact,notes,stamp,ctx.organizationId,visitId),auditStatement(env,ctx,'quote_visit.updated','quote_site_visit',visitId,{place,contact,notes},{place:old.place,contact:old.contact,notes:old.notes})]);const row=await env.DB.prepare('SELECT * FROM quote_site_visits WHERE organization_id=? AND id=?').bind(ctx.organizationId,visitId).first();return json({visit:await quoteVisitPayload(env,ctx,row)})}
  return json({error:'Méthode non autorisée.'},405);
}

function customerPayload(row){
  return {
    id:row.id,type:row.type,companyName:row.company_name||'',firstName:row.first_name||'',lastName:row.last_name||'',
    enterpriseNumber:row.enterprise_number||'',vatNumber:row.vat_number||'',email:row.email||'',phone:row.phone||'',
    street:row.street||'',postalCode:row.postal_code||'',city:row.city||'',country:row.country||'BE',
    notes:row.notes||'',paymentTermsDays:Number(row.payment_terms_days||30),createdAt:row.created_at,updatedAt:row.updated_at
  };
}
async function customerRoutes(request,url,env,ctx,customerId=null){
  if(request.method==='GET'){
    await requirePermission(env,ctx,'customers.view');
    if(customerId){
      const row=await env.DB.prepare('SELECT * FROM customers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(customerId)).first();
      if(!row)return json({error:'Client introuvable.'},404);
      return json({customer:customerPayload(row)});
    }
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,120),limit=Math.min(250,Math.max(1,Number(url.searchParams.get('limit')||100)||100));
    let sql='SELECT * FROM customers WHERE organization_id=? AND archived_at IS NULL',values=[ctx.organizationId];
    if(q){sql+=" AND (LOWER(COALESCE(company_name,'')) LIKE ? OR LOWER(COALESCE(first_name,'')) LIKE ? OR LOWER(COALESCE(last_name,'')) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ? OR LOWER(COALESCE(vat_number,'')) LIKE ?)";const like='%'+q+'%';values.push(like,like,like,like,like)}
    sql+=" ORDER BY LOWER(COALESCE(company_name,first_name||' '||last_name,id)),id LIMIT ?";values.push(limit);
    return json({customers:(await rows(env.DB.prepare(sql).bind(...values))).map(customerPayload),limit:q?limit:limit});
  }
  if(request.method==='POST'){
    await requirePermission(env,ctx,'customers.create');
  }else if(request.method==='PUT'){
    await requirePermission(env,ctx,'customers.edit');
    if(!customerId)return json({error:'Client cible requis.'},400);
  }else if(request.method==='DELETE'){
    await requirePermission(env,ctx,'customers.edit');
    if(!customerId)return json({error:'Client cible requis.'},400);
    const existing=await env.DB.prepare('SELECT * FROM customers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(customerId)).first();
    if(!existing)return json({error:'Client introuvable.'},404);
    const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE customers SET archived_at=?,updated_at=? WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(stamp,stamp,ctx.organizationId,String(customerId)),auditStatement(env,ctx,'customer.archived','customer',String(customerId),{archived_at:stamp},customerPayload(existing))]);
    return json({archived:true,id:String(customerId)});
  }else return json({error:'Méthode non autorisée.'},405);
  const data=exactObject(await body(request,30000),['type','companyName','firstName','lastName','enterpriseNumber','vatNumber','email','phone','street','postalCode','city','country','notes','paymentTermsDays']);
  const type=String(data.type||'company'),companyName=financialText(data.companyName||'',240),firstName=financialText(data.firstName||'',120),lastName=financialText(data.lastName||'',120),enterpriseNumber=financialText(data.enterpriseNumber||'',80),vatNumber=financialText(data.vatNumber||'',80),email=financialText(data.email||'',240),phone=financialText(data.phone||'',80),street=financialText(data.street||'',240),postalCode=financialText(data.postalCode||'',40),city=financialText(data.city||'',120),country=financialText(data.country||'BE',2).toUpperCase(),notes=financialText(data.notes||'',2000),terms=Number.isInteger(data.paymentTermsDays)?Math.max(0,Math.min(3650,data.paymentTermsDays)):30;
  if(!['individual','company'].includes(type)||country.length!==2)return json({error:'Données client invalides.'},400);
  const stamp=now();
  if(request.method==='POST'){
    const customerIdNew=id('customer');
    await dbBatch(env,[env.DB.prepare('INSERT INTO customers(id,organization_id,type,company_name,first_name,last_name,enterprise_number,vat_number,email,phone,street,postal_code,city,country,notes,payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(customerIdNew,ctx.organizationId,type,companyName||null,firstName||null,lastName||null,enterpriseNumber||null,vatNumber||null,email||null,phone||null,street||null,postalCode||null,city||null,country,notes,terms,stamp,stamp),auditStatement(env,ctx,'customer.created','customer',customerIdNew,{type,company_name:companyName,first_name:firstName,last_name:lastName,vat_number:vatNumber,email})]);
    return json({customer:customerPayload(await env.DB.prepare('SELECT * FROM customers WHERE organization_id=? AND id=?').bind(ctx.organizationId,customerIdNew).first())},201);
  }
  const existing=await env.DB.prepare('SELECT * FROM customers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(customerId)).first();
  if(!existing)return json({error:'Client introuvable.'},404);
  await dbBatch(env,[env.DB.prepare('UPDATE customers SET type=?,company_name=?,first_name=?,last_name=?,enterprise_number=?,vat_number=?,email=?,phone=?,street=?,postal_code=?,city=?,country=?,notes=?,payment_terms_days=?,updated_at=? WHERE organization_id=? AND id=?').bind(type,companyName||null,firstName||null,lastName||null,enterpriseNumber||null,vatNumber||null,email||null,phone||null,street||null,postalCode||null,city||null,country,notes,terms,stamp,ctx.organizationId,String(customerId)),auditStatement(env,ctx,'customer.updated','customer',String(customerId),{type,company_name:companyName,first_name:firstName,last_name:lastName,vat_number:vatNumber,email},customerPayload(existing))]);
  return json({customer:customerPayload(await env.DB.prepare('SELECT * FROM customers WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(customerId)).first())});
}

function supplierPayload(row){
  return {id:row.id,name:row.name,enterpriseNumber:row.enterprise_number||'',vatNumber:row.vat_number||'',email:row.email||'',phone:row.phone||'',street:row.street||'',postalCode:row.postal_code||'',city:row.city||'',country:row.country||'BE',defaultExpenseCategory:row.default_expense_category||'',defaultPaymentTermsDays:Number(row.default_payment_terms_days||30),createdAt:row.created_at,updatedAt:row.updated_at};
}
async function supplierRoutes(request,url,env,ctx,supplierId=null){
  if(request.method==='GET'){
    await requirePermission(env,ctx,'expenses.view');
    if(supplierId){
      const row=await env.DB.prepare('SELECT * FROM suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(supplierId)).first();
      if(!row)return json({error:'Fournisseur introuvable.'},404);
      return json({supplier:supplierPayload(row)});
    }
    const q=String(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,120),limit=Math.min(250,Math.max(1,Number(url.searchParams.get('limit')||100)||100));
    let sql='SELECT * FROM suppliers WHERE organization_id=? AND archived_at IS NULL',values=[ctx.organizationId];
    if(q){sql+=" AND (LOWER(name) LIKE ? OR LOWER(COALESCE(email,'')) LIKE ? OR LOWER(COALESCE(vat_number,'')) LIKE ?)";const like='%'+q+'%';values.push(like,like,like)}
    sql+=' ORDER BY LOWER(name),id LIMIT ?';values.push(limit);
    return json({suppliers:(await rows(env.DB.prepare(sql).bind(...values))).map(supplierPayload),limit});
  }
  if(request.method==='POST')await requirePermission(env,ctx,'expenses.create');
  else if(request.method==='PUT'||request.method==='DELETE')await requirePermission(env,ctx,'suppliers.edit');
  else return json({error:'Méthode non autorisée.'},405);
  if(!supplierId&&request.method!=='POST')return json({error:'Fournisseur cible requis.'},400);
  if(request.method==='DELETE'){
    const existing=await env.DB.prepare('SELECT * FROM suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(supplierId)).first();if(!existing)return json({error:'Fournisseur introuvable.'},404);
    const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE suppliers SET archived_at=?,updated_at=? WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(stamp,stamp,ctx.organizationId,String(supplierId)),auditStatement(env,ctx,'supplier.archived','supplier',String(supplierId),{archived_at:stamp},supplierPayload(existing))]);return json({archived:true,id:String(supplierId)});
  }
  const data=exactObject(await body(request,30000),['name','enterpriseNumber','vatNumber','email','phone','street','postalCode','city','country','defaultExpenseCategory','defaultPaymentTermsDays']);
  const name=financialText(data.name||'',240),enterpriseNumber=financialText(data.enterpriseNumber||'',80),vatNumber=financialText(data.vatNumber||'',80),email=financialText(data.email||'',240),phone=financialText(data.phone||'',80),street=financialText(data.street||'',240),postalCode=financialText(data.postalCode||'',40),city=financialText(data.city||'',120),country=financialText(data.country||'BE',2).toUpperCase(),category=financialText(data.defaultExpenseCategory||'',120),terms=Number.isInteger(data.defaultPaymentTermsDays)?Math.max(0,Math.min(3650,data.defaultPaymentTermsDays)):30;
  if(!name||country.length!==2)return json({error:'Données fournisseur invalides.'},400);
  const stamp=now();
  if(request.method==='POST'){
    const newId=id('supplier');await dbBatch(env,[env.DB.prepare('INSERT INTO suppliers(id,organization_id,name,enterprise_number,vat_number,email,phone,street,postal_code,city,country,default_expense_category,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(newId,ctx.organizationId,name,enterpriseNumber||null,vatNumber||null,email||null,phone||null,street||null,postalCode||null,city||null,country,category||null,terms,stamp,stamp),auditStatement(env,ctx,'supplier.created','supplier',newId,{name,vat_number:vatNumber,email})]);return json({supplier:supplierPayload(await env.DB.prepare('SELECT * FROM suppliers WHERE organization_id=? AND id=?').bind(ctx.organizationId,newId).first())},201);
  }
  const existing=await env.DB.prepare('SELECT * FROM suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(supplierId)).first();if(!existing)return json({error:'Fournisseur introuvable.'},404);
  await dbBatch(env,[env.DB.prepare('UPDATE suppliers SET name=?,enterprise_number=?,vat_number=?,email=?,phone=?,street=?,postal_code=?,city=?,country=?,default_expense_category=?,default_payment_terms_days=?,updated_at=? WHERE organization_id=? AND id=?').bind(name,enterpriseNumber||null,vatNumber||null,email||null,phone||null,street||null,postalCode||null,city||null,country,category||null,terms,stamp,ctx.organizationId,String(supplierId)),auditStatement(env,ctx,'supplier.updated','supplier',String(supplierId),{name,vat_number:vatNumber,email},supplierPayload(existing))]);
  return json({supplier:supplierPayload(await env.DB.prepare('SELECT * FROM suppliers WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(supplierId)).first())});
}

function bankAccountPayload(row){return {id:row.id,name:row.name,iban:row.iban||'',currency:row.currency||'EUR',currentBalanceCents:Number(row.current_balance_cents||0),provider:row.provider||'manual',externalId:row.external_id||null,lastSyncedAt:row.last_synced_at||null,createdAt:row.created_at,updatedAt:row.updated_at};}
function bankTransactionPayload(row){return {id:row.id,bankAccountId:row.bank_account_id,transactionDate:row.transaction_date,amountCents:Number(row.amount_cents),currency:row.currency,description:row.description||'',reference:row.reference||'',counterpartyName:row.counterparty_name||'',status:row.status,matchType:row.match_type||null,matchId:row.match_id||null,reconciledAt:row.reconciled_at||null,reconciledBy:row.reconciled_by||null,createdAt:row.created_at,updatedAt:row.updated_at};}
async function bankAccountRoutes(request,url,env,ctx,accountId=null){
  await requirePermission(env,ctx,'bank.view');
  if(request.method==='GET'){
    if(accountId){
      const row=await env.DB.prepare('SELECT * FROM bank_accounts WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(accountId)).first();if(!row)return json({error:'Compte bancaire introuvable.'},404);return json({account:bankAccountPayload(row)});
    }
    return json({accounts:(await rows(env.DB.prepare('SELECT * FROM bank_accounts WHERE organization_id=? AND archived_at IS NULL ORDER BY name,id').bind(ctx.organizationId))).map(bankAccountPayload)});
  }
  await requirePermission(env,ctx,'bank.manage');
  if(request.method==='POST'){
    const data=exactObject(await body(request,20000),['name','iban','currency','openingBalanceCents']),name=financialText(data.name||'',160),iban=financialText(data.iban||'',64),currency=financialText(data.currency||'EUR',3).toUpperCase(),opening=Number.isSafeInteger(data.openingBalanceCents)?data.openingBalanceCents:0;if(!name||currency.length!==3)return json({error:'Compte bancaire invalide.'},400);
    const newId=id('bank-account'),stamp=now();await dbBatch(env,[env.DB.prepare("INSERT INTO bank_accounts(id,organization_id,name,iban,currency,current_balance_cents,provider,created_at,updated_at) VALUES(?,?,?,?,?,?,'manual',?,?)").bind(newId,ctx.organizationId,name,iban||null,currency,opening,stamp,stamp),auditStatement(env,ctx,'bank_account.created','bank_account',newId,{name,iban,currency,opening_balance_cents:opening})]);return json({account:bankAccountPayload(await env.DB.prepare('SELECT * FROM bank_accounts WHERE organization_id=? AND id=?').bind(ctx.organizationId,newId).first())},201);
  }
  if(request.method==='PUT'&&accountId){
    const data=exactObject(await body(request,20000),['name','iban','currency']),name=financialText(data.name||'',160),iban=financialText(data.iban||'',64),currency=financialText(data.currency||'EUR',3).toUpperCase(),existing=await env.DB.prepare('SELECT * FROM bank_accounts WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,String(accountId)).first();if(!existing)return json({error:'Compte bancaire introuvable.'},404);const stamp=now();await dbBatch(env,[env.DB.prepare('UPDATE bank_accounts SET name=?,iban=?,currency=?,updated_at=? WHERE organization_id=? AND id=?').bind(name,iban||null,currency,stamp,ctx.organizationId,String(accountId)),auditStatement(env,ctx,'bank_account.updated','bank_account',String(accountId),{name,iban,currency},bankAccountPayload(existing))]);return json({account:bankAccountPayload(await env.DB.prepare('SELECT * FROM bank_accounts WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(accountId)).first())});
  }
  return json({error:'Méthode non autorisée.'},405);
}

async function bankTransactionsRoute(request,url,env,ctx,transactionId=null){
  await requirePermission(env,ctx,'bank.view');
  if(request.method==='GET'){
    if(transactionId){
      const row=await env.DB.prepare('SELECT * FROM bank_transactions WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(transactionId)).first();if(!row)return json({error:'Mouvement bancaire introuvable.'},404);return json({transaction:bankTransactionPayload(row)});
    }
    const accountId=String(url.searchParams.get('accountId')||'').trim(),status=String(url.searchParams.get('status')||'').trim(),rawLimit=Number(url.searchParams.get('limit')||100),limit=Number.isInteger(rawLimit)?Math.max(1,Math.min(250,rawLimit)):100;
    let sql='SELECT * FROM bank_transactions WHERE organization_id=?',values=[ctx.organizationId];if(accountId){sql+=' AND bank_account_id=?';values.push(accountId)}if(status){if(!['unreconciled','reconciled','ignored'].includes(status))return json({error:'Statut bancaire invalide.'},400);sql+=' AND status=?';values.push(status)}sql+=' ORDER BY transaction_date DESC,created_at DESC,id DESC LIMIT ?';values.push(limit);return json({transactions:(await rows(env.DB.prepare(sql).bind(...values))).map(bankTransactionPayload),limit});
  }
  if(request.method==='POST'&&!transactionId){
    await requirePermission(env,ctx,'bank.manage');
    const data=exactObject(await body(request,30000),['bankAccountId','transactionDate','amountCents','currency','description','reference','counterpartyName','operationKey']),accountId=String(data.bankAccountId||''),date=String(data.transactionDate||''),amount=data.amountCents,currency=financialText(data.currency||'EUR',3).toUpperCase(),description=financialText(data.description||'',500),reference=financialText(data.reference||'',240),counterparty=financialText(data.counterpartyName||'',240),key=operationKey(data);
    if(!accountId||!validIsoDate(date)||!Number.isSafeInteger(amount)||amount===0||currency.length!==3)return json({error:'Mouvement bancaire invalide.'},400);
    const account=await env.DB.prepare('SELECT * FROM bank_accounts WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,accountId).first();if(!account)return json({error:'Compte bancaire introuvable.'},404);
    const existing=await env.DB.prepare('SELECT * FROM bank_transactions WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(existing){if(existing.bank_account_id!==accountId||existing.transaction_date!==date||Number(existing.amount_cents)!==amount||existing.currency!==currency||existing.description!==description||existing.reference!==reference||existing.counterparty_name!==counterparty)return json({error:'Cette clé bancaire a déjà été utilisée avec des données différentes.'},409);return json({transaction:bankTransactionPayload(existing),replayed:true},200)}
    const newId=id('bank-tx'),stamp=now();
    try{
      await dbBatch(env,[env.DB.prepare("INSERT INTO bank_transactions(id,organization_id,bank_account_id,transaction_date,amount_cents,currency,description,reference,counterparty_name,status,idempotency_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'unreconciled',?,?,?)").bind(newId,ctx.organizationId,accountId,date,amount,currency,description,reference,counterparty,key,stamp,stamp),env.DB.prepare('UPDATE bank_accounts SET current_balance_cents=current_balance_cents+?,updated_at=? WHERE organization_id=? AND id=?').bind(amount,stamp,ctx.organizationId,accountId),auditStatement(env,ctx,'bank_transaction.created','bank_transaction',newId,{bank_account_id:accountId,amount_cents:amount,transaction_date:date,reference})]);
    }catch(error){const replay=await env.DB.prepare('SELECT * FROM bank_transactions WHERE organization_id=? AND idempotency_key=?').bind(ctx.organizationId,key).first();if(replay)return json({transaction:bankTransactionPayload(replay),replayed:true},200);throw error}
    return json({transaction:bankTransactionPayload(await env.DB.prepare('SELECT * FROM bank_transactions WHERE organization_id=? AND id=?').bind(ctx.organizationId,newId).first())},201);
  }
  if(request.method==='POST'&&transactionId){
    await requirePermission(env,ctx,'bank.reconcile');
    const tx=await env.DB.prepare('SELECT * FROM bank_transactions WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(transactionId)).first();if(!tx)return json({error:'Mouvement bancaire introuvable.'},404);
    const action=String(url.pathname).endsWith('/unreconcile')?'unreconcile':'reconcile';
    if(action==='unreconcile'){
      const stamp=now();await dbBatch(env,[env.DB.prepare("UPDATE bank_transactions SET status='unreconciled',match_type=NULL,match_id=NULL,reconciled_at=NULL,reconciled_by=NULL,updated_at=? WHERE organization_id=? AND id=? AND status='reconciled'").bind(stamp,ctx.organizationId,String(transactionId)),auditStatement(env,ctx,'bank_transaction.unreconciled','bank_transaction',String(transactionId),{status:'unreconciled'})]);return json({transaction:bankTransactionPayload(await env.DB.prepare('SELECT * FROM bank_transactions WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(transactionId)).first())});
    }
    const data=exactObject(await body(request,20000),['matchType','matchId']),matchType=String(data.matchType||''),matchId=String(data.matchId||'');if(!['invoice','expense'].includes(matchType)||!matchId)return json({error:'Rapprochement bancaire invalide.'},400);if(tx.status==='reconciled')return json({transaction:bankTransactionPayload(tx),replayed:true},200);
    if(matchType==='invoice'){
      if(Number(tx.amount_cents)<=0)return json({error:'Un encaissement client doit être positif.'},409);
      const invoice=await env.DB.prepare('SELECT * FROM invoices WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,matchId).first();if(!invoice)return json({error:'Facture client introuvable.'},404);
      const credits=await env.DB.prepare('SELECT COALESCE(SUM(amount_cents),0) total FROM credit_notes WHERE organization_id=? AND invoice_id=?').bind(ctx.organizationId,matchId).first(),remaining=Math.max(0,Number(invoice.total_cents||0)-Number(invoice.amount_paid_cents||0)-Number(credits?.total||0));if(Number(tx.amount_cents)>remaining&&remaining>0)return json({error:'Le montant bancaire dépasse le restant dû de la facture.'},409);
    }else{
      if(Number(tx.amount_cents)>=0)return json({error:'Un paiement fournisseur doit être négatif.'},409);
      const expense=await env.DB.prepare('SELECT * FROM expenses WHERE organization_id=? AND id=? AND archived_at IS NULL').bind(ctx.organizationId,matchId).first();if(!expense)return json({error:'Facture fournisseur introuvable.'},404);
      const paid=await env.DB.prepare("SELECT COALESCE(SUM(amount_cents),0) paid FROM supplier_payments WHERE organization_id=? AND expense_id=? AND status='active'").bind(ctx.organizationId,matchId).first(),remaining=Math.max(0,Number(expense.total_cents||0)-Number(paid?.paid||0));if(Math.abs(Number(tx.amount_cents))>remaining&&remaining>0)return json({error:'Le mouvement bancaire dépasse le restant dû fournisseur.'},409);
    }
    const stamp=now();await dbBatch(env,[env.DB.prepare("UPDATE bank_transactions SET status='reconciled',match_type=?,match_id=?,reconciled_at=?,reconciled_by=?,updated_at=? WHERE organization_id=? AND id=? AND status='unreconciled'").bind(matchType,matchId,stamp,ctx.uid,stamp,ctx.organizationId,String(transactionId)),auditStatement(env,ctx,'bank_transaction.reconciled','bank_transaction',String(transactionId),{match_type:matchType,match_id:matchId,amount_cents:Number(tx.amount_cents)})]);return json({transaction:bankTransactionPayload(await env.DB.prepare('SELECT * FROM bank_transactions WHERE organization_id=? AND id=?').bind(ctx.organizationId,String(transactionId)).first())});
  }
  return json({error:'Méthode non autorisée.'},405);
}

async function quoteAmendmentRoutes(request,env,ctx,quoteId,amendmentId=null){
  const quote=await env.DB.prepare("SELECT * FROM quotes_server WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,String(quoteId)).first();
  if(!quote)return json({error:'Devis introuvable.'},404);
  if(quote.project_id)await requireFinanceProjectScope(env,ctx,quote.project_id);
  if(request.method==='GET'){
    await requirePermission(env,ctx,'quote_amendments.view');
    const rowsList=await rows(env.DB.prepare("SELECT * FROM quote_amendments WHERE organization_id=? AND quote_id=? AND archived_at IS NULL ORDER BY created_at DESC,id DESC").bind(ctx.organizationId,String(quoteId)));
    return json({amendments:rowsList.map(row=>({id:row.id,quoteId:row.quote_id,projectId:row.project_id,reference:row.reference,title:row.title,reason:row.reason,amountCents:Number(row.amount_cents),vatAmountCents:Number(row.vat_amount_cents),totalCents:Number(row.total_cents),status:row.status,effectiveDate:row.effective_date,notes:row.notes,createdAt:row.created_at,updatedAt:row.updated_at}))});
  }
  if(request.method!=='POST'&&request.method!=='PUT')return json({error:'Méthode non autorisée.'},405);
  await requirePermission(env,ctx,'quote_amendments.create');
  if(!quote.project_id)return json({error:'Un avenant nécessite un chantier lié au devis.'},409);

  const data=exactObject(await body(request,30000),['reference','title','reason','amountCents','vatAmountCents','status','effectiveDate','notes']);
  const reference=financialText(data.reference||'',100),title=financialText(data.title||'',240),reason=financialText(data.reason||'',1000),amount=data.amountCents,vat=data.vatAmountCents??0,status=['draft','accepted','rejected'].includes(data.status)?data.status:'draft',effectiveDate=String(data.effectiveDate||''),notes=financialText(data.notes||'',2000);
  if(!reference||!title||!validIsoDate(effectiveDate)||!Number.isSafeInteger(amount)||!Number.isSafeInteger(vat))return json({error:'Avenant invalide.'},400);
  const total=amount+vat,stamp=now();

  if(request.method==='POST'){
    const newId=id('amendment'),duplicate=await env.DB.prepare("SELECT id FROM quote_amendments WHERE organization_id=? AND reference=? AND archived_at IS NULL").bind(ctx.organizationId,reference).first();
    if(duplicate)return json({error:'Référence d’avenant déjà utilisée.'},409);
    const statements=[
      env.DB.prepare("INSERT INTO quote_amendments(id,organization_id,quote_id,project_id,reference,title,reason,amount_cents,vat_amount_cents,total_cents,status,effective_date,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(newId,ctx.organizationId,quoteId,quote.project_id,reference,title,reason,amount,vat,total,status,effectiveDate,notes,ctx.uid,stamp,stamp),
      auditStatement(env,ctx,'quote_amendment.created','quote_amendment',newId,{quote_id:quoteId,project_id:quote.project_id,total_cents:total,status})
    ];
    const relationalProject=await env.DB.prepare("SELECT id FROM projects WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,quote.project_id).first();
    if(relationalProject&&status==='accepted')statements.push(env.DB.prepare("UPDATE projects SET quoted_amount_cents=quoted_amount_cents+?,updated_at=? WHERE organization_id=? AND id=?").bind(total,stamp,ctx.organizationId,quote.project_id));
    await dbBatch(env,statements);
    return json({amendment:{id:newId,quoteId,projectId:quote.project_id,reference,title,reason,amountCents:amount,vatAmountCents:vat,totalCents:total,status,effectiveDate,notes}},201);
  }

  if(!amendmentId)return json({error:'Avenant cible requis.'},400);
  const old=await env.DB.prepare("SELECT * FROM quote_amendments WHERE organization_id=? AND quote_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,quoteId,String(amendmentId)).first();
  if(!old)return json({error:'Avenant introuvable.'},404);
  const updateStatements=[
    env.DB.prepare("UPDATE quote_amendments SET reference=?,title=?,reason=?,amount_cents=?,vat_amount_cents=?,total_cents=?,status=?,effective_date=?,notes=?,updated_at=? WHERE organization_id=? AND id=?").bind(reference,title,reason,amount,vat,total,status,effectiveDate,notes,stamp,ctx.organizationId,String(amendmentId)),
    auditStatement(env,ctx,'quote_amendment.updated','quote_amendment',String(amendmentId),{reference,title,total_cents:total,status},{reference:old.reference,title:old.title,total_cents:Number(old.total_cents),status:old.status})
  ];
  const relationalProject=await env.DB.prepare("SELECT id FROM projects WHERE organization_id=? AND id=? AND archived_at IS NULL").bind(ctx.organizationId,quote.project_id).first();
  if(relationalProject){
    const oldApplied=old.status==='accepted'?Number(old.total_cents||0):0,newApplied=status==='accepted'?total:0,delta=newApplied-oldApplied;
    if(delta)updateStatements.push(env.DB.prepare("UPDATE projects SET quoted_amount_cents=quoted_amount_cents+?,updated_at=? WHERE organization_id=? AND id=?").bind(delta,stamp,ctx.organizationId,quote.project_id));
  }
  await dbBatch(env,updateStatements);
  return json({amendment:{id:String(amendmentId),quoteId,projectId:quote.project_id,reference,title,reason,amountCents:amount,vatAmountCents:vat,totalCents:total,status,effectiveDate,notes}});
}

function deliveryScanHooks(){return {requirePermission,allowed,organizationWorkspaceState,requireProjectScope,requireFinanceProjectScope,hasProjectScope,operationKey,detectedDocumentMime,documentExtensionMatches,sha256Hex,safeOriginalName,id,now,dbBatch,auditStatement}}
async function api(request,url,env){if(!env.DB)return json({error:'La sauvegarde est indisponible.'},503);if(!sameOrigin(request,url)&&!['GET','HEAD'].includes(request.method))return json({error:'Origine non autorisée.'},403);if(request.headers.get('x-socle-access-preview-user-id')&&!['GET','HEAD'].includes(request.method))return json({error:'Le mode test des accès est strictement en lecture seule.'},403);if(url.pathname==='/api/invitations/accept'&&request.headers.get('x-socle-access-preview-user-id'))return json({error:'Quittez le mode test pour gérer une invitation.'},403);if(url.pathname==='/api/invitations/accept')return acceptInvitationRoute(request,env,await invitationAcceptanceContext(request,env));const actorCtx=await context(request,env),ctx=await accessPreviewContext(request,env,actorCtx);if(url.pathname==="/api/search")return globalSearchRoute(request,url,env,ctx);const deliveryScanMatch=url.pathname.match(/^\/api\/purchase-orders\/([^/]+)\/delivery-scans(?:\/([^/]+)(?:\/(original))?)?$/);if(deliveryScanMatch)return deliveryScanRoute(request,env,ctx,decodeURIComponent(deliveryScanMatch[1]),deliveryScanMatch[2]?decodeURIComponent(deliveryScanMatch[2]):null,Boolean(deliveryScanMatch[3]),deliveryScanHooks());const scanDocumentMutation=url.pathname.match(/^\/api\/documents\/([^/]+)(?:\/.*)?$/);if(scanDocumentMutation&&!['GET','HEAD'].includes(request.method)){const scanOriginal=await env.DB.prepare('SELECT id FROM field_delivery_scans WHERE organization_id=? AND document_id=?').bind(ctx.organizationId,decodeURIComponent(scanDocumentMutation[1])).first();if(scanOriginal){if(await deliveryScanDocumentAccess(env,ctx,decodeURIComponent(scanDocumentMutation[1]),deliveryScanHooks())===false)return json({error:'Document introuvable.'},404);return json({error:'Un original de bon de livraison ne peut pas être modifié ou archivé.'},409)}}const userPreferenceMatch=url.pathname.match(/^\/api\/me\/preferences(?:\/([^/]+)\/([^/]+))?$/);if(url.pathname==='/api/me/preferences'||userPreferenceMatch){if(!userPreferenceMatch)return json({error:'Route de préférence inconnue.'},404);let namespace,key;try{namespace=userPreferenceMatch[1]===undefined?undefined:decodeURIComponent(userPreferenceMatch[1]);key=userPreferenceMatch[2]===undefined?undefined:decodeURIComponent(userPreferenceMatch[2])}catch{throw Object.assign(Error('Clé de préférence invalide.'),{status:400})}return userPreferencesRoute(request,url,env,ctx,namespace,key)};if(url.pathname==='/api/organizations')return organizationsRoute(request,env,ctx);if(url.pathname==='/api/roles')return rolesRoute(request,env,ctx);if(url.pathname==='/api/invitation-roster')return invitationRosterRoute(request,env,ctx);const organizationMember=url.pathname.match(/^\/api\/members\/([^/]+)$/);if(organizationMember)return memberRoutes(request,env,ctx,decodeURIComponent(organizationMember[1]));if(url.pathname==='/api/invitations')return invitationRoutes(request,env,ctx);const invitation=url.pathname.match(/^\/api\/invitations\/([^/]+)$/);if(invitation)return invitationRoutes(request,env,ctx,decodeURIComponent(invitation[1]));if(url.pathname==='/api/legacy-upgrade')return legacyUpgradeRoute(request,env,ctx);if(url.pathname==='/api/hr/people')return hrPeopleRoute(request,env,ctx);const hrEmployment=url.pathname.match(/^\/api\/hr\/people\/([^/]+)\/employment-records(?:\/([^/]+))?$/);if(hrEmployment)return hrEmploymentRoute(request,env,ctx,decodeURIComponent(hrEmployment[1]),hrEmployment[2]?decodeURIComponent(hrEmployment[2]):null);const hrPerson=url.pathname.match(/^\/api\/hr\/people\/([^/]+)$/);if(hrPerson)return hrPeopleRoute(request,env,ctx,decodeURIComponent(hrPerson[1]));if(url.pathname==='/api/hr/teams')return hrTeamsRoute(request,env,ctx);const hrTeamMembers=url.pathname.match(/^\/api\/hr\/teams\/([^/]+)\/members$/);if(hrTeamMembers)return hrTeamMembersRoute(request,env,ctx,decodeURIComponent(hrTeamMembers[1]));const hrTeamLead=url.pathname.match(/^\/api\/hr\/teams\/([^/]+)\/leads(?:\/([^/]+))?$/);if(hrTeamLead)return teamLeadRoute(request,env,ctx,decodeURIComponent(hrTeamLead[1]),hrTeamLead[2]?decodeURIComponent(hrTeamLead[2]):null);const hrTeam=url.pathname.match(/^\/api\/hr\/teams\/([^/]+)$/);if(hrTeam)return hrTeamsRoute(request,env,ctx,decodeURIComponent(hrTeam[1]));if(url.pathname.startsWith('/api/quote-visits/')){const parts=url.pathname.split('/'),visitId=decodeURIComponent(parts[3]||''),action=parts[4]||'';return quoteVisitRoutes(request,env,ctx,visitId,action)}if(url.pathname==='/api/quote-visits')return quoteVisitRoutes(request,env,ctx);
if(url.pathname==='/api/quotes')return quoteRoutes(request,env,ctx);const quoteAmendments=url.pathname.match(/^\/api\/quotes\/([^/]+)\/amendments(?:\/([^/]+))?$/);if(quoteAmendments)return quoteAmendmentRoutes(request,env,ctx,decodeURIComponent(quoteAmendments[1]),quoteAmendments[2]?decodeURIComponent(quoteAmendments[2]):null);const quote=url.pathname.match(/^\/api\/quotes\/([^/]+)$/);if(quote)return quoteRoutes(request,env,ctx,decodeURIComponent(quote[1]));if(url.pathname==='/api/access-control'&&request.method==='GET')return accessControlRoutes(request,url,env,ctx);const accessMember=url.pathname.match(/^\/api\/access-control\/([^/]+)$/);if(accessMember)return accessControlRoutes(request,url,env,ctx,decodeURIComponent(accessMember[1]));if(url.pathname==='/api/bootstrap'&&request.method==='GET'){const organization=await env.DB.prepare('SELECT id,name,legal_name,country,currency FROM organizations WHERE id=?').bind(ctx.organizationId).first();return json({organization,role:ctx.roleCode})}if(url.pathname==='/api/document-triage/expense-document')return documentUploadRoute(request,env,ctx,{expenseIntake:true});if(url.pathname==='/api/documents')return request.method==='POST'?documentUploadRoute(request,env,ctx):documentListRoute(request,url,env,ctx);const documentHistory=url.pathname.match(/^\/api\/documents\/([^/]+)\/history$/);if(documentHistory)return documentHistoryRoute(request,env,ctx,decodeURIComponent(documentHistory[1]));const documentContent=url.pathname.match(/^\/api\/documents\/([^/]+)\/(preview|download)$/);if(documentContent)return documentContentRoute(request,env,ctx,decodeURIComponent(documentContent[1]),documentContent[2]==='download');const documentRelation=url.pathname.match(/^\/api\/documents\/([^/]+)\/relations(?:\/([^/]+))?$/);if(documentRelation)return documentRelationsRoute(request,env,ctx,decodeURIComponent(documentRelation[1]),documentRelation[2]?decodeURIComponent(documentRelation[2]):null);const documentArchive=url.pathname.match(/^\/api\/documents\/([^/]+)\/archive$/);if(documentArchive)return documentArchiveRoute(request,env,ctx,decodeURIComponent(documentArchive[1]));const documentDetail=url.pathname.match(/^\/api\/documents\/([^/]+)$/);if(documentDetail)return documentMetadataRoute(request,env,ctx,decodeURIComponent(documentDetail[1]));if(url.pathname==='/api/field-data')return fieldDataRoute(request,env,ctx);if(url.pathname==='/api/home-overview')return homeOverviewRoute(request,url,env,ctx);const planningHistory=url.pathname.match(/^\/api\/projects\/([^/]+)\/planning-history$/);if(planningHistory)return planningHistoryRoute(request,env,ctx,decodeURIComponent(planningHistory[1]));if(url.pathname==='/api/planning')return planningRoute(request,url,env,ctx);if(url.pathname==='/api/planning/replan')return planningReplanRoute(request,env,ctx);if(url.pathname==='/api/planning/absences'&&request.method==='POST')return planningAbsenceRoute(request,env,ctx);const planningAbsence=url.pathname.match(/^\/api\/planning\/absences\/([^/]+)$/);if(planningAbsence)return planningAbsenceRoute(request,env,ctx,decodeURIComponent(planningAbsence[1]));if(url.pathname==='/api/planning/blocks'&&request.method==='POST')return planningBlockRoute(request,env,ctx);const planningBlock=url.pathname.match(/^\/api\/planning\/blocks\/([^/]+)$/);if(planningBlock)return planningBlockRoute(request,env,ctx,decodeURIComponent(planningBlock[1]));if(url.pathname==='/api/stock-catalog')return stockCatalogRoute(request,env,ctx);if(url.pathname==='/api/stock-catalog/categories')return stockCategoryRoute(request,env,ctx);const stockCategoryMatch=url.pathname.match(/^\/api\/stock-catalog\/categories\/([^/]+)$/);if(stockCategoryMatch)return stockCategoryRoute(request,env,ctx,decodeURIComponent(stockCategoryMatch[1]));if(url.pathname==='/api/stock-locations')return stockLocationRoutes(request,env,ctx);const stockLocationMatch=url.pathname.match(/^\/api\/stock-locations\/([^/]+)$/);if(stockLocationMatch)return stockLocationRoutes(request,env,ctx,decodeURIComponent(stockLocationMatch[1]));if(url.pathname==='/api/assignments'&&request.method==='POST')return assignmentRoute(request,env,ctx);const fieldAssignment=url.pathname.match(/^\/api\/assignments\/([^/]+)$/);if(fieldAssignment)return assignmentRoute(request,env,ctx,decodeURIComponent(fieldAssignment[1]));if(url.pathname==='/api/assets'&&request.method==='POST')return fieldAssetsRoute(request,env,ctx);const fieldAsset=url.pathname.match(/^\/api\/assets\/([^/]+)$/);if(fieldAsset)return fieldAssetsRoute(request,env,ctx,decodeURIComponent(fieldAsset[1]));const fieldFuel=url.pathname.match(/^\/api\/assets\/([^/]+)\/fuel$/);if(fieldFuel)return fuelRoute(request,env,ctx,decodeURIComponent(fieldFuel[1]));const fieldIssue=url.pathname.match(/^\/api\/assets\/([^/]+)\/issues$/);if(fieldIssue)return assetIssueRoute(request,env,ctx,decodeURIComponent(fieldIssue[1]));const fieldMaterial=url.pathname.match(/^\/api\/projects\/([^/]+)\/materials$/);if(fieldMaterial)return projectMaterialRoute(request,env,ctx,decodeURIComponent(fieldMaterial[1]));const fieldExecution=url.pathname.match(/^\/api\/projects\/([^/]+)\/execution$/);if(fieldExecution)return projectExecutionRoute(request,env,ctx,decodeURIComponent(fieldExecution[1]));const fieldPhoto=url.pathname.match(/^\/api\/projects\/([^/]+)\/field-photos$/);if(fieldPhoto)return fieldPhotoUploadRoute(request,env,ctx,decodeURIComponent(fieldPhoto[1]));const fieldNoteDetail=url.pathname.match(/^\/api\/projects\/([^/]+)\/notes\/([^/]+)$/);if(fieldNoteDetail)return projectNoteRoute(request,env,ctx,decodeURIComponent(fieldNoteDetail[1]),decodeURIComponent(fieldNoteDetail[2]));const fieldNote=url.pathname.match(/^\/api\/projects\/([^/]+)\/notes$/);if(fieldNote)return projectNoteRoute(request,env,ctx,decodeURIComponent(fieldNote[1]));const fieldProblem=url.pathname.match(/^\/api\/projects\/([^/]+)\/problems$/);if(fieldProblem)return projectProblemRoute(request,env,ctx,decodeURIComponent(fieldProblem[1]));if(url.pathname==='/api/purchase-orders')return purchaseOrderRoutes(request,env,ctx);const purchaseOrderCancel=url.pathname.match(/^\/api\/purchase-orders\/([^/]+)\/cancel$/);if(purchaseOrderCancel)return purchaseOrderCancelRoute(request,env,ctx,decodeURIComponent(purchaseOrderCancel[1]));const stockConsumeBarcode=url.pathname.match(/^\/api\/projects\/([^/]+)\/stock-consume\/barcode$/);if(stockConsumeBarcode)return stockBarcodeLookupRoute(request,url,env,ctx,decodeURIComponent(stockConsumeBarcode[1]));const stockConsumeOptions=url.pathname.match(/^\/api\/projects\/([^/]+)\/stock-consume\/options$/);if(stockConsumeOptions)return stockConsumeRoute(request,url,env,ctx,decodeURIComponent(stockConsumeOptions[1]),true);const stockConsume=url.pathname.match(/^\/api\/projects\/([^/]+)\/stock-consume$/);if(stockConsume)return stockConsumeRoute(request,url,env,ctx,decodeURIComponent(stockConsume[1]),false);if(url.pathname==='/api/stock-items/by-barcode')return stockBarcodeLookupRoute(request,url,env,ctx);if(url.pathname==='/api/stock-items'&&request.method==='POST')return stockItemRoute(request,env,ctx);const stockBarcode=url.pathname.match(/^\/api\/stock-items\/([^/]+)\/barcodes(?:\/([^/]+))?$/);if(stockBarcode)return stockBarcodeManageRoute(request,env,ctx,decodeURIComponent(stockBarcode[1]),stockBarcode[2]?decodeURIComponent(stockBarcode[2]):null);const stockMovement=url.pathname.match(/^\/api\/stock-items\/([^/]+)\/movements$/);if(stockMovement)return stockMovementRoute(request,env,ctx,decodeURIComponent(stockMovement[1]));const stockItem=url.pathname.match(/^\/api\/stock-items\/([^/]+)$/);if(stockItem)return stockItemRoute(request,env,ctx,decodeURIComponent(stockItem[1]));const delivery=url.pathname.match(/^\/api\/purchase-orders\/([^/]+)\/deliveries$/);if(delivery)return deliveryRoute(request,env,ctx,decodeURIComponent(delivery[1]));if(url.pathname==='/api/time-entries/monthly')return timeEntriesMonthlyRoute(request,url,env,ctx,{json,rows,timePermissionFlags,organizationWorkspaceState,ensureLegacyTimeEntriesImported,currentPersonId,canReadTimeEntry,timeEntryPeople,timeEntryJson,profileLabels,hasProjectScope,actorCanUseTeam,parseJson});if(url.pathname==='/api/time-entries/monthly/close')return timeEntriesMonthlyCloseRoute(request,env,ctx,{json,body,timePermissionFlags,organizationWorkspaceState,ensureLegacyTimeEntriesImported,rows,dbBatch,id,auditStatement,parseJson});if(url.pathname==='/api/time-entries/mine')return timeEntriesList(request,url,env,ctx,true);if(url.pathname==='/api/time-entries')return timeEntriesList(request,url,env,ctx);if(url.pathname==='/api/time-entries/arrival')return timeArrivalRoute(request,env,ctx);const timeDeparture=url.pathname.match(/^\/api\/time-entries\/([^/]+)\/departure$/);if(timeDeparture)return timeDepartureRoute(request,env,ctx,decodeURIComponent(timeDeparture[1]));const timeCorrection=url.pathname.match(/^\/api\/time-entries\/([^/]+)\/corrections$/);if(timeCorrection)return timeCorrectionRequestRoute(request,env,ctx,decodeURIComponent(timeCorrection[1]));const timeReview=url.pathname.match(/^\/api\/time-entry-corrections\/([^/]+)\/review$/);if(timeReview)return timeCorrectionReviewRoute(request,env,ctx,decodeURIComponent(timeReview[1]));if(url.pathname==='/api/invoices')return invoicesRoute(request,env,ctx);const invoicePayments=url.pathname.match(/^\/api\/invoices\/([^/]+)\/payments$/);if(invoicePayments)return invoicePaymentsRoute(request,env,ctx,decodeURIComponent(invoicePayments[1]));const invoiceCredits=url.pathname.match(/^\/api\/invoices\/([^/]+)\/credit-notes$/);if(invoiceCredits)return invoiceCreditNotesRoute(request,env,ctx,decodeURIComponent(invoiceCredits[1]));const invoiceDetail=url.pathname.match(/^\/api\/invoices\/([^/]+)$/);if(invoiceDetail)return invoiceDetailRoute(request,env,ctx,decodeURIComponent(invoiceDetail[1]));if(url.pathname==='/api/audit-log')return auditLogRoutes(request,url,env,ctx);if(url.pathname==='/api/simulation-runs')return simulationRunRoutes(request,url,env,ctx);if(url.pathname==='/api/accounting/summary'&&request.method==='GET')return accountingSummary(request,env,ctx);const bankAccount=url.pathname.match(/^\/api\/bank\/accounts(?:\/([^/]+))?$/);if(bankAccount)return bankAccountRoutes(request,url,env,ctx,bankAccount[1]?decodeURIComponent(bankAccount[1]):null);const bankReconcile=url.pathname.match(/^\/api\/bank\/transactions\/([^/]+)\/reconcile$/);if(bankReconcile)return bankTransactionsRoute(request,url,env,ctx,decodeURIComponent(bankReconcile[1]));const bankUnreconcile=url.pathname.match(/^\/api\/bank\/transactions\/([^/]+)\/unreconcile$/);if(bankUnreconcile)return bankTransactionsRoute(request,url,env,ctx,decodeURIComponent(bankUnreconcile[1]));const bankTransaction=url.pathname.match(/^\/api\/bank\/transactions(?:\/([^/]+))?$/);if(bankTransaction)return bankTransactionsRoute(request,url,env,ctx,bankTransaction[1]?decodeURIComponent(bankTransaction[1]):null);if(url.pathname==='/api/customers')return customerRoutes(request,url,env,ctx);const customer=url.pathname.match(/^\/api\/customers\/([^/]+)$/);if(customer)return customerRoutes(request,url,env,ctx,decodeURIComponent(customer[1]));if(url.pathname==='/api/suppliers')return supplierRoutes(request,url,env,ctx);const supplier=url.pathname.match(/^\/api\/suppliers\/([^/]+)$/);if(supplier)return supplierRoutes(request,url,env,ctx,decodeURIComponent(supplier[1]));if(url.pathname==='/api/expenses')return expenseRoutes(request,env,ctx);const supplierPayments=url.pathname.match(/^\/api\/expenses\/([^/]+)\/payments$/);if(supplierPayments)return supplierPaymentsRoute(request,env,ctx,decodeURIComponent(supplierPayments[1]));const supplierPaymentVoid=url.pathname.match(/^\/api\/expenses\/([^/]+)\/payments\/([^/]+)\/void$/);if(supplierPaymentVoid)return supplierPaymentsRoute(request,env,ctx,decodeURIComponent(supplierPaymentVoid[1]),decodeURIComponent(supplierPaymentVoid[2]));const supplierInvoiceMatchVoid=url.pathname.match(/^\/api\/supplier-invoices\/([^/]+)\/matches\/([^/]+)\/void$/);if(supplierInvoiceMatchVoid)return supplierInvoiceMatchesRoute(request,env,ctx,decodeURIComponent(supplierInvoiceMatchVoid[1]),decodeURIComponent(supplierInvoiceMatchVoid[2]));const supplierInvoiceMatch=url.pathname.match(/^\/api\/supplier-invoices\/([^/]+)\/matches$/);if(supplierInvoiceMatch)return supplierInvoiceMatchesRoute(request,env,ctx,decodeURIComponent(supplierInvoiceMatch[1]));const supplierAllocation=url.pathname.match(/^\/api\/expenses\/([^/]+)\/allocations(?:\/([^/]+)\/cancel)?$/);if(supplierAllocation)return supplierAllocationsRoute(request,env,ctx,decodeURIComponent(supplierAllocation[1]),supplierAllocation[2]?decodeURIComponent(supplierAllocation[2]):null);if(url.pathname==='/api/tasks'&&request.method==='GET')return taskRoutes(request,url,env,ctx);const projectTasks=url.pathname.match(/^\/api\/projects\/([^/]+)\/tasks$/);if(projectTasks)return taskRoutes(request,url,env,ctx,projectTasks[1]);const taskComments=url.pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);if(taskComments)return taskRoutes(request,url,env,ctx,null,taskComments[1]);const taskValidate=url.pathname.match(/^\/api\/tasks\/([^/]+)\/validate$/);if(taskValidate)return taskRoutes(request,url,env,ctx,null,taskValidate[1]);const taskHistory=url.pathname.match(/^\/api\/tasks\/([^/]+)\/history$/);if(taskHistory)return taskRoutes(request,url,env,ctx,null,taskHistory[1]);const task=url.pathname.match(/^\/api\/tasks\/([^/]+)$/);if(task)return taskRoutes(request,url,env,ctx,null,task[1]);const fieldPortal=url.pathname.match(/^\/api\/projects\/([^/]+)\/field-portal$/);if(fieldPortal)return fieldPortalRoute(request,url,env,ctx,decodeURIComponent(fieldPortal[1]));const projectHub=url.pathname.match(/^\/api\/projects\/([^/]+)\/hub$/);if(projectHub)return projectHubRoute(request,url,env,ctx,decodeURIComponent(projectHub[1]));const projectTimeline=url.pathname.match(/^\/api\/projects\/([^/]+)\/timeline$/);if(projectTimeline)return projectTimelineRoute(request,url,env,ctx,decodeURIComponent(projectTimeline[1]));const projectBaselineBootstrap=url.pathname.match(/^\/api\/projects\/([^/]+)\/financial-baseline\/bootstrap$/);if(projectBaselineBootstrap)return projectFinancialBaselineRoute(request,env,ctx,decodeURIComponent(projectBaselineBootstrap[1]),true);const projectBaseline=url.pathname.match(/^\/api\/projects\/([^/]+)\/financial-baseline$/);if(projectBaseline)return projectFinancialBaselineRoute(request,env,ctx,decodeURIComponent(projectBaseline[1]),false);const projectForecast=url.pathname.match(/^\/api\/projects\/([^/]+)\/financial-forecast$/);if(projectForecast)return projectFinancialForecastRoute(request,env,ctx,decodeURIComponent(projectForecast[1]));const projectCostControl=url.pathname.match(/^\/api\/projects\/([^/]+)\/cost-control$/);if(projectCostControl)return projectCostControlRoute(request,env,ctx,decodeURIComponent(projectCostControl[1]));const project=url.pathname.match(/^\/api\/projects\/([^/]+)$/);if(project)return projectRoute(request,env,ctx,project[1]);if(url.pathname==='/api/partner-grants')return partnerGrantRoutes(request,env,ctx);const accept=url.pathname.match(/^\/api\/partner-grants\/([^/]+)\/accept$/);if(accept)return acceptPartnerGrant(request,env,ctx,accept[1]);const partnerGrant=url.pathname.match(/^\/api\/partner-grants\/([^/]+)$/);if(partnerGrant)return partnerGrantDetailRoute(request,env,ctx,decodeURIComponent(partnerGrant[1]));if(url.pathname==='/api/partner-portfolio')return partnerPortfolio(request,env,ctx);if(url.pathname==='/api/partner-requests')return partnerRequestRoutes(request,env,ctx);if(url.pathname==='/api/conversations')return conversationRoutes(request,env,ctx);if(url.pathname==='/api/messages')return messageRoutes(request,url,env,ctx);return json({error:'Route API inconnue.'},404)}
async function workspaceOwner(env,organizationId){return env.DB.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id AND r.organization_id=om.organization_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY om.joined_at LIMIT 1").bind(organizationId).first()}
function omit(object,keys){const copy={...(object||{})};for(const key of keys)delete copy[key];return copy}
function cloneArray(value){return Array.isArray(value)?structuredClone(value):[]}
function safeCompany(company){return {name:company?.name||'',sector:company?.sector||'',region:company?.region||'',size:company?.size||'',simulationMode:Boolean(company?.simulationMode),testCompany:Boolean(company?.testCompany),blankWorkspace:Boolean(company?.blankWorkspace)}}
const quoteMoneyKeys=new Set(['price','unitPrice','amount','subtotal','netAmount','grossAmount','total','totalHt','totalHT','totalHTVA','totalTtc','totalTTC','totalTVAC','vatAmount','taxAmount','deposit','depositPercent','paymentTerms','cost','costPrice','purchasePrice','deliveredCost','margin','markup']);
function stripQuotePrices(value){
  if(Array.isArray(value))return value.map(stripQuotePrices);
  if(!value||typeof value!=='object')return value;
  const copy={};for(const [key,item] of Object.entries(value))if(!quoteMoneyKeys.has(key))copy[key]=stripQuotePrices(item);return copy;
}
function stripAssetFinancials(asset){const copy=structuredClone(asset||{});for(const key of ['monthly','purchasePrice','currentValue','finance','lease','leasing','acquisitionCost','residualValue'])delete copy[key];if(Array.isArray(copy.fuelEntries))copy.fuelEntries=copy.fuelEntries.map(entry=>omit(entry,['total','cost','amount','price']));return copy}
function stripStockFinancials(item){const copy=structuredClone(item||{});for(const key of ['unitCost','purchasePrice','deliveredCost','price','value','totalValue'])delete copy[key];if(Array.isArray(copy.movements))copy.movements=copy.movements.map(movement=>omit(movement,['unitCost','price','value']));return copy}
function stripPurchaseFinancials(order){const copy=structuredClone(order||{});for(const key of ['netAmount','vatAmount','total','totalAmount'])delete copy[key];if(Array.isArray(copy.lines))copy.lines=copy.lines.map(line=>omit(line,['unitPrice','price','netAmount','vatAmount','total']));return copy}
async function scopedLegacyState(env,ctx,state){
  const can=permission=>allowed(env,ctx,permission),workspace=await can('workspace.view'),accountingEntry=await can('accounting.view');
  if(!workspace&&!accountingEntry)throw Object.assign(Error('Vous ne pouvez pas ouvrir cet espace.'),{status:403});
  const [allProjects,assignedProjects,hr,accounting,bank,settings,assetsView,stockView,deliveriesView]=await Promise.all(['projects.view.all','projects.view.assigned','hr.sensitive.view','accounting.view','bank.view','company.settings.view','assets.view','stock.view','deliveries.view'].map(can)),margins=await profitabilityReadable(env,ctx),quotePrices=await quotePriceReadable(env,ctx);
  // Liste blanche explicite : une nouvelle clé ajoutée au workspace ne doit jamais
  // devenir visible automatiquement pour un collaborateur.
  const scoped={version:state?.version??3,company:workspace&&settings?structuredClone(state?.company||{}):safeCompany(state?.company),people:workspace?cloneArray(state?.people):[],teams:workspace?cloneArray(state?.teams):[],jobs:workspace?cloneArray(state?.jobs):[],assignments:workspace?cloneArray(state?.assignments):[],quotes:workspace?cloneArray(state?.quotes):[],assets:workspace&&assetsView?cloneArray(state?.assets).map(stripAssetFinancials):[],tasks:[],dossiers:[],reminders:[]};
  const visibleIds=new Set();
  if(allProjects)scoped.jobs.forEach(job=>visibleIds.add(String(job.id)));
  else if(assignedProjects){const grants=await rows(env.DB.prepare('SELECT project_id FROM project_access WHERE organization_id=? AND user_id=?').bind(ctx.organizationId,ctx.uid));grants.forEach(grant=>visibleIds.add(String(grant.project_id)));scoped.jobs=scoped.jobs.filter(job=>visibleIds.has(String(job.id)));}
  else scoped.jobs=[];
  // Les pointages ont désormais leur propre route métier : ils ne transitent plus
  // dans le workspace legacy des collaborateurs.
  scoped.jobs=scoped.jobs.map(job=>omit(job,['timeEntries','documents']));
  scoped.assignments=scoped.assignments.filter(item=>visibleIds.has(String(item.job)));
  scoped.quotes=scoped.quotes.filter(item=>visibleIds.has(String(item.job)));
  if(!quotePrices)scoped.quotes=scoped.quotes.map(stripQuotePrices);
  // Les anciens rappels globaux peuvent contenir des informations d'autres dossiers.
  // Tant qu'ils n'ont pas leur route serveur dédiée, un collaborateur ne reçoit que
  // les rappels explicitement liés à un chantier de son périmètre.
  scoped.reminders=cloneArray(state?.reminders).filter(item=>item?.linkType==='job'&&visibleIds.has(String(item.linkId)));
  const contactsAssigned=await can('contacts.view.assigned');
  if(contactsAssigned){const contactIds=new Set(scoped.jobs.flatMap(job=>[...(job.contactIds||[]),job.clientId].filter(Boolean)).map(String));scoped.contacts=cloneArray(state?.contacts).filter(contact=>contactIds.has(String(contact.id)));}
  else scoped.jobs=scoped.jobs.map(job=>omit(job,['contacts','contactIds']));
  if(!hr)scoped.people=scoped.people.map(person=>omit(person,['hr','employment','qualification','qualificationHistory','birth','contract','start','end']));
  if(!margins){scoped.jobs=scoped.jobs.map(job=>omit(job,['finance','contractAmount','currentContractAmount','contractAmendments']));if(scoped.company)delete scoped.company.marginRules;}
  if(accounting){scoped.accountingData=structuredClone(state?.accountingData||{});if(!bank){delete scoped.accountingData.bankTransactions;delete scoped.accountingData.openingPosition;delete scoped.accountingData.payments;}if(Array.isArray(state?.recurringCharges))scoped.recurringCharges=structuredClone(state.recurringCharges);}
  if(quotePrices&&Array.isArray(state?.priceCatalog))scoped.priceCatalog=structuredClone(state.priceCatalog);
  if(assetsView&&Array.isArray(state?.fleet))scoped.fleet=state.fleet.map(stripAssetFinancials);
  if(stockView&&Array.isArray(state?.stockItems))scoped.stockItems=state.stockItems.map(stripStockFinancials);
  if(deliveriesView){if(Array.isArray(state?.deliveryNotes))scoped.deliveryNotes=structuredClone(state.deliveryNotes);if(Array.isArray(state?.purchaseOrders))scoped.purchaseOrders=state.purchaseOrders.map(stripPurchaseFinancials);}
  if(workspace)for(const key of ['newsItems','savedJobViews','savedTaskViews','savedAssetViews'])if(Array.isArray(state?.[key]))scoped[key]=structuredClone(state[key]);
  return scoped;
}
async function legacyState(request,url,env){
  if(!env.DB)return json({error:'La sauvegarde est indisponible.'},503);
  const actorCtx=await context(request,env),ctx=await accessPreviewContext(request,env,actorCtx);
  if(request.method==='GET'){
    const row=await organizationWorkspaceRow(env,ctx.organizationId,{readOnly:ctx.preview});
    if(!row){const access=await currentAccessSnapshot(env,ctx),localIdentity=access?.personId?{personId:access.personId}:null,contactsAllowed=ctx.roleCode==='OWNER'||await allowed(env,ctx,'contacts.view.assigned');return json({state:null,revision:0,organizationId:ctx.organizationId,role:ctx.roleCode,readOnly:ctx.roleCode!=='OWNER',localIdentity,contactsAllowed,access,preview:Boolean(ctx.preview),previewedBy:ctx.previewActorUid||null})}
    const state=JSON.parse(row.payload),access=await currentAccessSnapshot(env,ctx),localIdentity=access?.personId?{personId:access.personId}:null,contactsAllowed=ctx.roleCode==='OWNER'||await allowed(env,ctx,'contacts.view.assigned');
    return json({state:ctx.roleCode==='OWNER'?state:await scopedLegacyState(env,ctx,state),revision:row.revision,organizationId:ctx.organizationId,readOnly:ctx.roleCode!=='OWNER',role:ctx.roleCode,contactsAllowed,localIdentity,access,preview:Boolean(ctx.preview),previewedBy:ctx.previewActorUid||null});
  }
  if(request.method==='PUT'){
    if(!sameOrigin(request,url))return json({error:'Origine non autorisée.'},403);
    if(ctx.roleCode!=='OWNER')throw Object.assign(Error('Les modifications globales exigent le rôle propriétaire. Utilisez une route métier autorisée.'),{status:403});
    let data;try{data=await body(request,1500000)}catch(error){return json({error:error.message},error.status||400)}
    if(!Number.isInteger(data.revision)||data.revision<0||!validState(data.state))return json({error:'Données de sauvegarde invalides.'},400);
    const payload=JSON.stringify(data.state),stamp=now();
    const result=data.revision===0
      ?await env.DB.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,1,?,?,?) ON CONFLICT(organization_id) DO NOTHING').bind(ctx.organizationId,payload,ctx.uid,stamp,stamp).run()
      :await env.DB.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,source_user_id=?,updated_at=? WHERE organization_id=? AND revision=?').bind(payload,ctx.uid,stamp,ctx.organizationId,data.revision).run();
    if(!result.meta.changes)return json({error:'Le dossier a été modifié dans une autre fenêtre. Rechargez pour reprendre la version enregistrée ; les changements non enregistrés seront perdus.'},409);
    return json({revision:data.revision+1});
  }
  return json({error:'Méthode non autorisée.'},405);
}

export default {async fetch(request,env){const url=new URL(request.url);try{if(url.pathname.startsWith('/api/')&&request.headers.get('x-socle-access-preview-user-id')&&!['GET','HEAD'].includes(request.method))return json({error:'Le mode test des accès est strictement en lecture seule.'},403);if(url.pathname==='/api/state')return await legacyState(request,url,env);if(url.pathname.startsWith('/api/'))return await api(request,url,env)}catch(error){if(!error.status||error.status>=500)console.error('socle api',error);return json({error:error.status&&error.status<500?(error.message||'Requête refusée.'):'Erreur interne du serveur.'},error.status||500)}if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const path=url.pathname==='/'?'/index.html':url.pathname;const asset=FILES[path];if(!asset)return new Response('Not found',{status:404});const assetBody=asset.encoding==='base64'?Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0)):asset.body;return new Response(request.method==='HEAD'?null:assetBody,{headers:{'content-type':asset.type,'cache-control':'no-cache','x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY','content-security-policy':"default-src 'self'; img-src 'self' data: blob: https://api.open-meteo.com https://geocoding-api.open-meteo.com; connect-src 'self' https://api.open-meteo.com https://geocoding-api.open-meteo.com; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"}})}};
