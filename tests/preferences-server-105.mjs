import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const stamp='2026-10-03T08:00:00.000Z',orgA='prefs-org-a',orgB='prefs-org-b';
for(const org of [orgA,orgB])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,\'BE\',\'EUR\',?,?)').run(org,org,org,stamp,stamp);
const roleDefinitions=[
  ['owner','OWNER',orgA],['lead','TEAM_LEAD',orgA],['worker','WORKER',orgA],['accountant','ACCOUNTING',orgA],
  ['owner-b','OWNER',orgB],['worker-b','WORKER',orgB],['no-access','USER_no_access',orgA]
];
for(const [code,role,org] of roleDefinitions)db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+code,org,role,role,stamp);
const memberships=[['owner',orgA,'owner'],['owner-second',orgA,'owner'],['lead',orgA,'lead'],['worker',orgA,'worker'],['accountant',orgA,'accountant'],['owner-b',orgB,'owner-b'],['worker',orgB,'worker-b']];
for(const [user,org,role] of memberships){
  if(!db.prepare('SELECT 1 FROM profiles WHERE id=?').get(user))db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(user,user,'Prefs',user+'@prefs.test',stamp,stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,? ,\'active\',?,?,?)').run('member-'+org+'-'+user,org,user,'role-'+role,stamp,stamp,stamp);
}
for(const [role,permissions] of Object.entries({lead:['workspace.view'],worker:['workspace.view'],accountant:['accounting.view'],'worker-b':['workspace.view']})){
  for(const permission of permissions)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+role,permission);
}
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}};},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=statements.map(statement=>({meta:{changes:Number(db.prepare(statement._sql).run(...statement._values).changes)}}));db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
async function call(user,method,path,payload,organization=orgA){
  const headers={origin:'https://socle.test'};if(user)headers['oai-authenticated-user-id']=user;if(organization)headers['x-socle-organization-id']=organization;if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env);
  let body=null;if(response.status!==204)try{body=await response.json()}catch{}
  return{status:response.status,body};
}
const saved={};
try{
  assert.equal((await call(null,'GET','/api/me/preferences')).status,401,'une session est obligatoire');
  for(const [user,role] of [['owner','OWNER'],['lead','TEAM_LEAD'],['worker','WORKER'],['accountant','ACCOUNTING']]){
    const write=await call(user,'PUT','/api/me/preferences/dashboard/density',{schemaVersion:1,value:{density:'compact'}});
    assert.equal(write.status,200,role+' peut écrire ses préférences dans son tenant');
    assert.deepEqual(write.body.preference.value,{density:'compact'},role+' reçoit sa propre valeur');
    const read=await call(user,'GET','/api/me/preferences/dashboard/density');
    assert.equal(read.status,200,role+' peut lire ses préférences');
    assert.deepEqual(read.body.preference.value,{density:'compact'},role+' relit sa préférence persistée');
  }
  await call('owner','PUT','/api/me/preferences/dashboard/layout',{schemaVersion:1,value:{columns:3}});
  assert.equal((await call('worker','GET','/api/me/preferences?userId=owner')).status,400,'un userId arbitraire en query est refusé');
  assert.equal((await call('worker','GET','/api/me/preferences/dashboard/layout')).body.preference,null,'lecture limitée à son propre userId');
  assert.equal((await call('worker','PUT','/api/me/preferences/dashboard/layout',{schemaVersion:1,value:{columns:4},userId:'owner'})).status,400,'un userId arbitraire dans le body est refusé');

  const tenantA=await call('worker','PUT','/api/me/preferences/resume/context',{schemaVersion:1,value:{lastPage:'planning'}});
  const tenantB=await call('worker','GET','/api/me/preferences/resume/context',undefined,orgB);
  assert.equal(tenantA.status,200,'un même compte peut écrire dans le tenant A');
  assert.equal(tenantB.body.preference,null,'les préférences sont isolées entre tenants pour le même compte');
  await call('worker','PUT','/api/me/preferences/resume/context',{schemaVersion:1,value:{lastPage:'jobs'}},orgB);
  await call('worker','PUT','/api/me/preferences/dashboard/density',{schemaVersion:1,value:{density:'comfortable'}},orgB);
  assert.deepEqual((await call('worker','GET','/api/me/preferences/resume/context')).body.preference.value,{lastPage:'planning'},'la valeur A reste indépendante de B');
  assert.deepEqual((await call('worker','GET','/api/me/preferences/resume/context',undefined,orgB)).body.preference.value,{lastPage:'jobs'},'la valeur B est propre au tenant B');
  assert.equal((await call('owner','GET','/api/me/preferences',undefined,orgB)).status,403,'une adhésion absente bloque le tenant étranger');

  const planningDaysA=await call('owner','PUT','/api/me/preferences/planning/visible-days',{schemaVersion:1,value:{days:[1,2,3,4,5,6]}},orgA);
  assert.equal(planningDaysA.status,200,'le patron peut régler les jours de planning partagés');
  assert.deepEqual(planningDaysA.body.preference.value.days,[1,2,3,4,5,6],'le serveur garde la semaine du lundi au vendredi et ajoute samedi');
  assert.deepEqual((await call('worker','GET','/api/me/preferences/planning/visible-days',undefined,orgA)).body.preference.value.days,[1,2,3,4,5,6],'l’ouvrier reçoit le réglage du patron dans le même tenant');
  const secondOwnerDays=await call('owner-second','PUT','/api/me/preferences/planning/visible-days',{schemaVersion:1,value:{days:[1,2,3,4,5,0]}},orgA);
  assert.equal(secondOwnerDays.status,200,'un autre compte patron peut modifier le même réglage de l’entreprise');
  assert.deepEqual((await call('worker','GET','/api/me/preferences/planning/visible-days',undefined,orgA)).body.preference.value.days,[1,2,3,4,5,0],'les comptes patron partagent un réglage au niveau entreprise');
  await call('owner','PUT','/api/me/preferences/planning/visible-days',{schemaVersion:1,value:{days:[1,2,3,4,5,6]}},orgA);
  assert.equal((await call('worker','PUT','/api/me/preferences/planning/visible-days',{schemaVersion:1,value:{days:[1,2,3,4,5,6,0]}},orgA)).status,403,'un ouvrier ne peut pas modifier les jours partagés');
  assert.equal((await call('owner','PUT','/api/me/preferences/planning/visible-days',{schemaVersion:1,value:{days:[1,2,3,4,5,5]}},orgA)).status,400,'le serveur refuse les jours en double');
  assert.equal((await call('owner','PUT','/api/me/preferences/planning/visible-days',{schemaVersion:1,value:{days:[1,2,3,4,6]}},orgA)).status,400,'le serveur refuse de masquer un jour ouvré');
  const planningDaysB=await call('owner-b','PUT','/api/me/preferences/planning/visible-days',{schemaVersion:1,value:{days:[1,2,3,4,5,0]}},orgB);
  assert.deepEqual(planningDaysB.body.preference.value.days,[1,2,3,4,5,0],'le dimanche est accepté et reste distinct du samedi');
  assert.deepEqual((await call('worker','GET','/api/me/preferences/planning/visible-days',undefined,orgB)).body.preference.value.days,[1,2,3,4,5,0],'un même utilisateur voit le réglage du patron correspondant à chaque entreprise');
  assert.deepEqual((await call('worker','GET','/api/me/preferences/planning/visible-days',undefined,orgA)).body.preference.value.days,[1,2,3,4,5,6],'le réglage de l’entreprise A ne change pas avec celui de B');
  assert.equal((await call('worker','DELETE','/api/me/preferences/planning/visible-days',undefined,orgA)).status,403,'un ouvrier ne peut pas réinitialiser les jours partagés');

  const inert=await call('worker','PUT','/api/me/preferences/dashboard/widgets',{schemaVersion:1,value:{visible:['home','accounting']}});
  assert.equal(inert.status,200,'une préférence de widget reste une configuration sans effet sur les droits');
  assert.deepEqual(inert.body.preference.value.visible,['home','accounting'],'la demande UI est conservée comme préférence seule');
  assert.equal((await call('worker','GET','/api/accounting/summary')).status,403,'la préférence ne donne pas accès au module comptable interdit');

  assert.equal((await call('worker','PUT','/api/me/preferences/unknown/layout',{schemaVersion:1,value:{x:1}})).status,400,'namespace inconnu refusé');
  assert.equal((await call('worker','PUT','/api/me/preferences/dashboard/unknown',{schemaVersion:1,value:{x:1}})).status,400,'clé inconnue refusée');
  assert.equal((await call('worker','PUT','/api/me/preferences/dashboard/density',{schemaVersion:2,value:{density:'compact'}})).status,400,'version de schéma inconnue refusée');
  assert.equal((await call('worker','PUT','/api/me/preferences/dashboard/density',{schemaVersion:1})).status,400,'valeur manquante refusée');
  assert.equal((await call('worker','PUT','/api/me/preferences/dashboard/layout',{schemaVersion:1,value:{role:'OWNER'}})).status,400,'les préférences ne peuvent contenir de rôle');
  assert.equal((await call('worker','PUT','/api/me/preferences/dashboard/layout',{schemaVersion:1,value:{permissions:['financial.dashboard.view']}})).status,400,'les préférences ne peuvent contenir de permissions');
  assert.equal((await call('worker','PUT','/api/me/preferences/saved-views/definitions',{schemaVersion:1,value:Array.from({length:100},()=>({filter:'x'.repeat(200)}))})).status,413,'taille de valeur bornée');
  assert.equal((await call('worker','PUT','/api/me/preferences/dashboard/density',{schemaVersion:1,value:{density:'compact'},userId:'worker'})).status,400,'payload avec cible de compte explicite refusé');
  assert.equal((await call('worker','PATCH','/api/me/preferences/dashboard/density',{schemaVersion:1,value:{density:'compact'}})).status,405,'méthode non prévue refusée');

  const replay1=await call('worker','PUT','/api/me/preferences/dashboard/density',{schemaVersion:1,value:{density:'compact'}});
  const replay2=await call('worker','PUT','/api/me/preferences/dashboard/density',{schemaVersion:1,value:{density:'compact'}});
  assert.equal(replay1.status,200);assert.equal(replay2.status,200,'répéter la même écriture reste idempotent');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM user_preferences WHERE organization_id=? AND user_id='worker' AND namespace='dashboard' AND preference_key='density' AND schema_version=1").get(orgA).n,1,'le replay ne crée aucune ligne doublon');

  db.prepare("DELETE FROM role_permissions WHERE role_id='role-worker' AND permission_code='workspace.view'").run();
  assert.equal((await call('worker','GET','/api/me/preferences')).status,403,'la perte de la permission existante bloque les préférences');
  db.prepare("INSERT INTO role_permissions(role_id,permission_code) VALUES('role-worker','workspace.view')").run();
  db.prepare("UPDATE organization_members SET role_id='role-no-access' WHERE organization_id=? AND user_id='worker'").run(orgA);
  assert.equal((await call('worker','GET','/api/me/preferences')).status,403,'un changement vers un rôle sans permission bloque l’API');
  db.prepare("UPDATE organization_members SET role_id='role-worker' WHERE organization_id=? AND user_id='worker'").run(orgA);
  db.prepare("UPDATE organization_members SET status='disabled' WHERE organization_id=? AND user_id='worker'").run(orgA);
  assert.equal((await call('worker','GET','/api/me/preferences')).status,403,'une adhésion désactivée bloque l’API');
  db.prepare("UPDATE organization_members SET status='active' WHERE organization_id=? AND user_id='worker'").run(orgA);

  const reset1=await call('worker','DELETE','/api/me/preferences/dashboard/density');
  const reset2=await call('worker','DELETE','/api/me/preferences/dashboard/density');
  assert.equal(reset1.status,204);assert.equal(reset2.status,204,'le reset répété est idempotent');
  assert.equal((await call('worker','GET','/api/me/preferences/dashboard/density',undefined,orgB)).body.preference.value.density,'comfortable','le reset dans A ne touche pas les préférences B');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[],'FK valides après les tests');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','intégrité SQLite valide');
  console.log('PREFS-01 server: PASS (4 rôles, self-only, tenant isolation, permission loss, replay/reset, validation)');
}finally{db.close();}
