import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
assert.equal(Number(db.prepare('PRAGMA foreign_keys').get().foreign_keys),1,'les FK SQLite doivent être actives');

const sent=[];
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const r=db.prepare(sql).run(...values);return{meta:{changes:Number(r.changes)}}}}},
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const out=[];
      for(const statement of statements){
        const result=db.prepare(statement._sql).run(...statement._values);
        out.push({meta:{changes:Number(result.changes)}});
      }
      db.exec('COMMIT');
      return out;
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
},sendInvitationEmail:async message=>{sent.push(message)}};

const stamp='2026-09-29T14:30:00.000Z';
for(const [id,name] of [['org-a','Entreprise A'],['org-b','Entreprise B']]){
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
}
for(const [id,email] of [
  ['owner-a','owner-a@example.test'],
  ['lead-a','lead-a@example.test'],
  ['worker-a','worker-a@example.test'],
  ['accounting-a','accounting-a@example.test'],
  ['multi','multi@example.test'],
  ['owner-b','owner-b@example.test']
]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,'QA',email,stamp,stamp);
}
for(const [id,org,code,name] of [
  ['role-a-owner','org-a','OWNER','Propriétaire'],
  ['role-a-team-lead','org-a','TEAM_LEAD','Chef de chantier QA'],
  ['role-a-worker','org-a','WORKER','Ouvrier'],
  ['role-a-accounting','org-a','ACCOUNTING','Comptable'],
  ['role-b-owner','org-b','OWNER','Propriétaire B'],
  ['role-b-accounting','org-b','ACCOUNTING','Comptable B']
]){
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,name,stamp);
}
for(const [id,org,user,role] of [
  ['m-owner-a','org-a','owner-a','role-a-owner'],
  ['m-lead-a','org-a','lead-a','role-a-team-lead'],
  ['m-worker-a','org-a','worker-a','role-a-worker'],
  ['m-accounting-a','org-a','accounting-a','role-a-accounting'],
  ['m-multi-a','org-a','multi','role-a-worker'],
  ['m-multi-b','org-b','multi','role-b-accounting'],
  ['m-owner-b','org-b','owner-b','role-b-owner']
]){
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,org,user,role,'active',stamp,stamp,stamp);
}

const teamPermissions=['workspace.view','projects.view.assigned','tasks.view.assigned','time_entries.view.team'];
const workerPermissions=['workspace.view','projects.view.assigned','tasks.view.assigned','time_entries.view.own'];
const accountingPermissions=['invoices.view','financial.dashboard.view','expenses.view'];
for(const permission of [...new Set([...teamPermissions,...workerPermissions,...accountingPermissions])]){
  assert.ok(db.prepare('SELECT 1 ok FROM permissions WHERE code=?').get(permission),'permission SOCLE réelle: '+permission);
}
for(const permission of teamPermissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-a-team-lead',permission);
for(const permission of workerPermissions){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-a-worker',permission);
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-b-accounting',permission);
}
for(const permission of accountingPermissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-a-accounting',permission);

const stateA={version:3,company:{name:'Entreprise A'},people:[],teams:[],jobs:[],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
const stateB={version:3,company:{name:'Entreprise B'},people:[],teams:[],jobs:[],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-a',JSON.stringify(stateA),1,'owner-a',stamp,stamp);
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-b',JSON.stringify(stateB),1,'owner-b',stamp,stamp);

async function call(uid,email,method,path,payload,org,environment=env){
  const headers={
    origin:'https://socle.test',
    'oai-authenticated-user-id':uid,
    'oai-authenticated-user-email':email
  };
  if(org)headers['x-socle-organization-id']=org;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{
    method,
    headers,
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{})
  }),environment);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

const failures=[];
function check(label,fn){
  try{fn();console.log('OK '+label)}
  catch(error){failures.push(label+': '+error.message);console.error('KO '+label+' -> '+error.message)}
}

// 15. Aucun fallback OWNER implicite par défaut.
let result=await call('ghost','ghost@example.test','GET','/api/bootstrap',undefined);
check('aucun fallback OWNER automatique',()=>assert.equal(result.status,403));
check('aucune organisation parasite créée',()=>assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM organizations WHERE id='org-ghost'").get().n),0));
check('aucun membership parasite créé',()=>assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='ghost'").get().n),0));

// 1 + 13. La création initiale reste une action explicitement autorisée par configuration, puis la première ouverture reflète OWNER.
const bootstrapEnv={...env,SOCLE_ALLOW_BOOTSTRAP:'true'};
result=await call('founder','founder@example.test','GET','/api/bootstrap',undefined,undefined,bootstrapEnv);
check('bootstrap explicitement autorisé',()=>assert.equal(result.status,200));
check('première ouverture OWNER explicite',()=>assert.equal(result.body.role,'OWNER'));
check('organisation initiale créée une seule fois',()=>assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM organizations WHERE id='org-founder'").get().n),1));

const founderRoles=db.prepare("SELECT id,code FROM roles WHERE organization_id='org-founder' ORDER BY code").all();
check('catalogue de quatre rôles créé au bootstrap',()=>assert.deepEqual(founderRoles.map(role=>role.code).sort(),['ACCOUNTING','OWNER','TEAM_LEAD','WORKER']));
result=await call('founder','founder@example.test','GET','/api/roles',undefined,'org-founder');
check('catalogue rôles exposé au propriétaire',()=>assert.equal(result.status,200));
check('API rôles expose les quatre rôles canoniques',()=>assert.deepEqual((result.body.roles||[]).map(role=>role.code).sort(),['ACCOUNTING','OWNER','TEAM_LEAD','WORKER']));
const apiRoles=new Map((result.body.roles||[]).map(role=>[role.code,new Set(role.permissions||[])]));
check('TEAM_LEAD peut valider les corrections de pointage',()=>assert.equal(apiRoles.get('TEAM_LEAD')?.has('time_entries.correction.review'),true));
check('WORKER ne peut pas valider les corrections de pointage',()=>assert.equal(apiRoles.get('WORKER')?.has('time_entries.correction.review'),false));
check('WORKER voit les devis sans droit prix',()=>{assert.equal(apiRoles.get('WORKER')?.has('quotes.view'),true);assert.equal(apiRoles.get('WORKER')?.has('quotes.prices.view'),false)});
check('ACCOUNTING voit le tableau financier',()=>assert.equal(apiRoles.get('ACCOUNTING')?.has('financial.dashboard.view'),true));
check('ACCOUNTING ne reçoit pas la gestion des accès',()=>assert.equal(apiRoles.get('ACCOUNTING')?.has('permissions.manage'),false));

const founderWorkerRole=founderRoles.find(role=>role.code==='WORKER');
if(founderWorkerRole){
  result=await call('founder','founder@example.test','POST','/api/invitations',{email:'fresh-worker@example.test',roleId:founderWorkerRole.id,expiresInDays:7},'org-founder');
  check('invitation WORKER depuis organisation neuve',()=>assert.equal(result.status,201));
  const freshToken=sent.findLast(message=>message.to==='fresh-worker@example.test')?.token;
  if(freshToken){
    result=await call('fresh-worker','fresh-worker@example.test','POST','/api/invitations/accept',{token:freshToken});
    check('acceptation invitation WORKER organisation neuve',()=>assert.equal(result.status,200));
    result=await call('fresh-worker','fresh-worker@example.test','GET','/api/bootstrap',undefined,'org-founder');
    check('première ouverture avec le bon rôle WORKER',()=>assert.equal(result.body.role,'WORKER'));
  }else failures.push('invitation WORKER depuis organisation neuve: jeton absent');
}else failures.push('invitation WORKER depuis organisation neuve: rôle WORKER absent');


// 6 + 7. Un même utilisateur peut appartenir à plusieurs entreprises et choisir l’organisation active.
result=await call('multi','multi@example.test','GET','/api/organizations',undefined,'org-a');
check('liste multi-organisations',()=>assert.equal(result.status,200));
check('deux organisations visibles au membre multi-org',()=>assert.deepEqual(result.body.organizations.map(item=>item.id).sort(),['org-a','org-b']));
check('organisation active A',()=>assert.equal(result.body.activeOrganizationId,'org-a'));
result=await call('multi','multi@example.test','GET','/api/bootstrap',undefined,'org-b');
check('bascule organisation active B',()=>assert.equal(result.status,200));
check('rôle propre à B après bascule',()=>assert.equal(result.body.role,'ACCOUNTING'));
result=await call('multi','multi@example.test','GET','/api/bootstrap',undefined,'org-inexistante');
check('organisation non membre refusée',()=>assert.equal(result.status,403));

// 12. Le rôle TEAM_LEAD doit être canonique et ne pas dépendre du libellé arbitraire du rôle.
result=await call('owner-a','owner-a@example.test','GET','/api/access-control',undefined,'org-a');
const lead=result.body.members?.find(member=>member.userId==='lead-a');
check('liste accès OWNER',()=>assert.equal(result.status,200));
check('TEAM_LEAD mappé sur Chef d’équipe',()=>assert.equal(lead?.profileName,'Chef d’équipe'));

// 10. Un WORKER ne peut jamais s’auto-promouvoir OWNER via la route de gestion des membres.
result=await call('worker-a','worker-a@example.test','PATCH','/api/members/worker-a',{roleId:'role-a-owner'},'org-a');
check('auto-promotion WORKER vers OWNER refusée',()=>assert.equal(result.status,403));
check('rôle WORKER inchangé après attaque',()=>assert.equal(db.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-a' AND om.user_id='worker-a'").get().code,'WORKER'));
db.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES('role-a-worker','permissions.manage')").run();
result=await call('worker-a','worker-a@example.test','PUT','/api/access-control/worker-a',{},'org-a');
check('auto-promotion bloquée même avec permissions.manage déléguée',()=>assert.equal(result.status,403));
check('rôle WORKER inchangé après chemin access-control',()=>assert.equal(db.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-a' AND om.user_id='worker-a'").get().code,'WORKER'));
db.prepare("DELETE FROM role_permissions WHERE role_id='role-a-worker' AND permission_code='permissions.manage'").run();


// 11. L’OWNER A ne peut ni modifier ni révoquer un membre de B.
const ownerBBefore=db.prepare("SELECT om.status,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-b' AND om.user_id='owner-b'").get();
result=await call('owner-a','owner-a@example.test','PATCH','/api/members/owner-b',{roleId:'role-a-worker'},'org-a');
check('changement de rôle cross-tenant introuvable',()=>assert.equal(result.status,404));
const ownerBAfter=db.prepare("SELECT om.status,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-b' AND om.user_id='owner-b'").get();
check('membre B intact après attaque A',()=>assert.deepEqual(ownerBAfter,ownerBBefore));

// 9. Le propriétaire peut changer un membre non-OWNER vers un rôle canonique de sa propre entreprise.
result=await call('owner-a','owner-a@example.test','PATCH','/api/members/worker-a',{roleId:'role-a-team-lead'},'org-a');
check('changement WORKER vers TEAM_LEAD',()=>assert.equal(result.status,200));
check('réponse expose TEAM_LEAD',()=>assert.equal(result.body.roleCode,'TEAM_LEAD'));
check('rôle persistant TEAM_LEAD',()=>assert.equal(db.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-a' AND om.user_id='worker-a'").get().code,'TEAM_LEAD'));

// Un rôle OWNER ne peut pas être attribué par cette route à un membre ordinaire.
result=await call('owner-a','owner-a@example.test','PATCH','/api/members/worker-a',{roleId:'role-a-owner'},'org-a');
check('promotion administrative vers OWNER bloquée',()=>assert.equal(result.status,403));

// 8. Révocation d’un accès actif : la relation reste traçable mais n’autorise plus le contexte organisation.
result=await call('owner-a','owner-a@example.test','DELETE','/api/members/worker-a',undefined,'org-a');
check('révocation membre actif',()=>assert.equal(result.status,200));
check('statut membre révoqué',()=>assert.equal(db.prepare("SELECT status FROM organization_members WHERE organization_id='org-a' AND user_id='worker-a'").get().status,'disabled'));
result=await call('worker-a','worker-a@example.test','GET','/api/bootstrap',undefined,'org-a');
check('membre révoqué immédiatement refusé',()=>assert.equal(result.status,403));

// Le propriétaire courant est verrouillé contre sa propre révocation.
result=await call('owner-a','owner-a@example.test','DELETE','/api/members/owner-a',undefined,'org-a');
check('OWNER ne peut pas être révoqué par cette route',()=>assert.equal(result.status,403));

// Traçabilité des mutations de membres.
check('audit changement de rôle',()=>assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-a' AND action='member.role_changed' AND entity_id='worker-a'").get().n),1));
check('audit révocation',()=>assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-a' AND action='member.revoked' AND entity_id='worker-a'").get().n),1));

if(failures.length){
  throw new Error('IA3 onboarding/members: '+failures.length+' contrôle(s) en échec\n- '+failures.join('\n- '));
}
console.log('ia3-onboarding-members-rbac-29: contrôles terminés');
