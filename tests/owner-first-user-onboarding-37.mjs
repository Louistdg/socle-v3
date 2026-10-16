import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {openProductionDatabase} from '../scripts/production-db.mjs';
import {provisionCredential} from '../scripts/production-auth.mjs';
import {startProduction} from '../scripts/production.mjs';

const migrationsDirectory=fileURLToPath(new URL('../drizzle/',import.meta.url));
const temporary=mkdtempSync(join(tmpdir(),'socle-owner-onboarding-')),volume=join(temporary,'volume');mkdirSync(volume);
const secret=randomBytes(32).toString('base64url'),ownerPassword='Owner-Test-Password-2026!Long',existingPassword='Existing-Account-Password-2026!Long',davidExistingPassword='David-Existing-Account-Password-2026!Long';
const portProbe=createServer();await new Promise((resolve,reject)=>portProbe.once('error',reject).listen(0,'127.0.0.1',resolve));const port=portProbe.address().port;await new Promise(resolve=>portProbe.close(resolve));
const env={PORT:String(port),SOCLE_PUBLIC_URL:'https://socle.test',SOCLE_SESSION_SECRET:secret,SOCLE_DATA_DIR:volume};
const databasePath=join(volume,'socle.sqlite'),storage=openProductionDatabase({databasePath,migrationsDirectory});let database=storage.database;
const stamp=new Date().toISOString();
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-batinova-iae-2026-10-01','BatiNova','BatiNova','BE','EUR',stamp,stamp);
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-other','Other','Other','BE','EUR',stamp,stamp);
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-socle-simu-v2','Socle.Simu.V2','Socle.Simu.V2','BE','EUR',stamp,stamp);
database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('owner','Marc','Delcourt','owner@batinova.test',stamp,stamp);
database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('existing-user','Compte','Existant','existing@other.test',stamp,stamp);
database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('david-existing-user','David','Leclercq','david.leclercq@socle.test',stamp,stamp);
for(const [id,organizationId,code,name] of [
  ['role-owner','org-batinova-iae-2026-10-01','OWNER','Propriétaire'],['role-team-lead','org-batinova-iae-2026-10-01','TEAM_LEAD','Chef d’équipe'],
  ['role-worker','org-batinova-iae-2026-10-01','WORKER','Ouvrier'],['role-accounting','org-batinova-iae-2026-10-01','ACCOUNTING','Comptabilité'],['role-other-owner','org-other','OWNER','Propriétaire'],['role-other-team-lead','org-other','TEAM_LEAD','Chef d’équipe'],['role-simu-owner','org-socle-simu-v2','OWNER','Propriétaire']
])database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,organizationId,code,name,stamp);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('owner-simu-member','org-socle-simu-v2','owner','role-simu-owner','active',new Date(Date.parse(stamp)-3600000).toISOString(),stamp,stamp);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('owner-member','org-batinova-iae-2026-10-01','owner','role-owner','active',stamp,stamp,stamp);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('other-member','org-other','existing-user','role-other-owner','active',stamp,stamp,stamp);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('david-other-member','org-other','david-existing-user','role-other-team-lead','active',stamp,stamp,stamp);
const permissionCodes={
  OWNER:['workspace.view','projects.view.all','financial.dashboard.view','accounting.view'],
  TEAM_LEAD:['workspace.view','projects.view.assigned','time_entries.view.team'],
  WORKER:['workspace.view','projects.view.assigned','time_entries.view.own'],
  ACCOUNTING:['financial.dashboard.view','accounting.view','invoices.view']
};
for(const [roleCode,codes] of Object.entries(permissionCodes)){
  const roleId={OWNER:'role-owner',TEAM_LEAD:'role-team-lead',WORKER:'role-worker',ACCOUNTING:'role-accounting'}[roleCode];
  for(const code of codes){database.prepare('INSERT OR IGNORE INTO permissions(code,description) VALUES(?,?)').run(code,code);database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(roleId,code)}
}
const people=[
  ['1790270195001','Marc Delcourt','Gérant / direction'],['1790270195002','Julien Lambert','Conducteur principal'],['1790270195003','Nicolas Gérard','Conducteur'],
  ['1790270195004','Thomas Renard','Deviseur / acheteur'],['1790270194900','Sophie Martin','Administration / pré-comptabilité'],
  ['1790270195166','David Leclercq','Chef d’équipe gros œuvre'],['1790270195400','Anthony Simon','Ouvrier E1'],['1790270195008','Kevin Laurent','Ouvrier E1'],
  ['1790270195009','Samuel Bernard','Ouvrier E1'],['1790270195010','Hugo Denis','Ouvrier E1'],['1790270195011','Olivier Mathieu','Chef d’équipe E2'],
  ['1790270195012','Maxime Evrard','Ouvrier E2'],['1790270195013','Lucas Fontaine','Ouvrier E2'],['1790270195014','Romain Dubois','Ouvrier E2'],
  ['1790270195015','Mathis Leroy','Ouvrier E2'],['1790270195016','Philippe André','Chef d’équipe E3'],['1790270195017','Damien François','Ouvrier E3'],
  ['1790270195018','Benjamin Michel','Ouvrier E3'],['1790270195019','Jonathan Robert','Ouvrier E3'],['1790270195020','Alex Marchal','Logistique transverse'],
  ['1790270195021','Christophe Henry','Chef d’équipe E4'],['1790270195022','Adrien Georges','Ouvrier E4'],['1790270195023','Quentin Noël','Ouvrier E4'],
  ['1790270195024','Sébastien Collard','Ouvrier E4'],['1790270195025','Florian Masset','Ouvrier E4']
];
const projectIds=Array.from({length:13},(_,index)=>'BATXL-PRJ-'+String(index).padStart(5,'0'));
const unrelatedProject='BATXL-PRJ-09999';
const state={version:3,company:{name:'BatiNova'},people:people.map(([id,name,role])=>({id:Number(id),name,role})),teams:[{id:1790270200093,name:'Gros œuvre',members:people.slice(5,10).map(person=>Number(person[0]))}],jobs:[...projectIds,unrelatedProject].map(id=>({id,name:id,reference:id})),assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[],deliveryNotes:[],stockItems:[]};
database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,1,?,?,?)').run('org-batinova-iae-2026-10-01',JSON.stringify(state),'owner',stamp,stamp);
assert.equal(database.prepare("SELECT COUNT(*) n FROM hr_people WHERE organization_id='org-batinova-iae-2026-10-01'").get().n,0,'le roster BatiNova réel n’est pas normalisé en tables RH relationnelles');
for(let index=0;index<41;index++){
  const id='BATXL-ASG-'+String(index+1).padStart(3,'0'),projectId=projectIds[index%projectIds.length],date=new Date(Date.UTC(2026,8,1+index)).toISOString().slice(0,10);
  database.prepare('INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,'org-batinova-iae-2026-10-01',date,'1790270200093',projectId,JSON.stringify(['1790270195400','1790270195166']),'owner',stamp,'owner',stamp);
}
database.prepare("INSERT INTO profiles(id,first_name,last_name,email,identity_kind,created_at,updated_at) VALUES('provenance-profile','Comptable','historique','provenance@example.test','provenance',?,?)").run(stamp,stamp);
database.prepare("INSERT INTO provenance_actor_map(organization_id,source_profile_id,profile_id,source_person_id,display_name,source_dataset) VALUES('org-batinova-iae-2026-10-01','BATXL-USER-ACC-01','provenance-profile',NULL,'Comptable historique','QA-BATXL-DEF-2026-10-01')").run();
await provisionCredential(database,{userId:'owner',password:ownerPassword,secret});
await provisionCredential(database,{userId:'existing-user',password:existingPassword,secret});
await provisionCredential(database,{userId:'david-existing-user',password:davidExistingPassword,secret});
storage.close();

const deliveries=[];let runtime;
try{
  const runtimeLogs=[];
  runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  database=new DatabaseSync(databasePath);database.exec('PRAGMA foreign_keys=ON');
  const base=`http://127.0.0.1:${port}`;
  async function request(path,{method='GET',body,cookie,organization='org-batinova-iae-2026-10-01',redirect='follow'}={}){
    const headers={'origin':'https://socle.test','connection':'close'};
    if(body!==undefined)headers['content-type']='application/json';
    if(cookie)headers.cookie=cookie;
    if(organization)headers['x-socle-organization-id']=organization;
    const response=await fetch(base+path,{method,headers,redirect,...(body!==undefined?{body:JSON.stringify(body)}:{})});
    let data={};try{data=await response.clone().json()}catch{}
    return{response,data};
  }
  const login=await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null});
  assert.equal(login.response.status,200,'OWNER authentifié par le vrai runtime');
  let ownerCookie=login.response.headers.get('set-cookie').split(';')[0];
  const defaultWorkspace=await request('/api/state',{cookie:ownerCookie,organization:null});
  assert.equal(defaultWorkspace.data.organizationId,'org-socle-simu-v2','sans entreprise explicitement sélectionnée, le premier membership est Socle.Simu.V2');
  const defaultRoster=await request('/api/invitation-roster',{cookie:ownerCookie,organization:null});
  assert.equal(defaultRoster.response.status,200);
  assert.equal(defaultRoster.data.organizationId,'org-socle-simu-v2','le roster suit le tenant réellement sélectionné côté serveur');
  assert.equal(defaultRoster.data.people.length,0,'Socle.Simu.V2 ne reçoit pas le roster BatiNova');
  const batinovaRoster=await request('/api/invitation-roster',{cookie:ownerCookie});
  assert.equal(batinovaRoster.response.status,200);
  assert.equal(batinovaRoster.data.organizationId,'org-batinova-iae-2026-10-01');
  assert.equal(batinovaRoster.data.organizationName,'BatiNova');
  assert.equal(batinovaRoster.data.source,'workspace_state');
  assert.equal(batinovaRoster.data.rosterCount,25,'le roster IA-E contient les 25 personnes actives');
  assert.equal(batinovaRoster.data.eligibleCount,25,'les 25 personnes sont proposées tant qu’aucune n’est liée ou invitée');
  assert.equal(batinovaRoster.data.people.length,25);
  assert.equal(batinovaRoster.data.people.find(person=>person.id==='1790270195166')?.name,'David Leclercq','P06 est retourné par le vrai endpoint du select');
  assert.equal(batinovaRoster.data.people.find(person=>person.id==='1790270195400')?.name,'Anthony Simon','P07 est retourné par le vrai endpoint du select');
  const anonymousRoster=await request('/api/invitation-roster',{cookie:null});
  assert.equal(anonymousRoster.response.status,401,'le roster d’invitation exige une session');
  let ownerInvitations=await request('/api/invitations',{cookie:ownerCookie});
  assert.equal(ownerInvitations.response.status,200);
  assert.equal(ownerInvitations.data.manualTestEnabled,false,'la remise manuelle est désactivée par défaut');
  let disabledManual=await request('/api/invitations',{method:'POST',cookie:ownerCookie,body:{email:'david.leclercq@socle.test',personId:'1790270195166',roleId:'role-team-lead',deliveryMode:'manual-test'}});
  assert.equal(disabledManual.response.status,403,'le mode manuel exige son activation explicite');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_invitations WHERE organization_id='org-batinova-iae-2026-10-01'").get().n,0,'aucune invitation n’est créée tant que le mode est désactivé');
  await runtime.close();
  env.SOCLE_INVITATION_TEST_MODE='1';
  runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  const enabledLogin=await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null});
  assert.equal(enabledLogin.response.status,200,'OWNER reste authentifié après redémarrage avec le mode de test explicite');
  ownerCookie=enabledLogin.response.headers.get('set-cookie').split(';')[0];
  ownerInvitations=await request('/api/invitations',{cookie:ownerCookie});
  assert.equal(ownerInvitations.data.manualTestEnabled,true,'le mode manuel n’est visible qu’après activation côté runtime');
  assert.equal(ownerInvitations.data.emailDeliveryEnabled,true,'le chemin d’e-mail normal reste disponible');
  const invalidToken=await request('/auth/activate',{method:'POST',body:{token:'invalid-token'},organization:null});
  assert.equal(invalidToken.response.status,400,'un jeton invalide est refusé');
  const activationPage=await request('/invite/activate',{organization:null});
  assert.equal(activationPage.response.status,200);
  assert.equal(activationPage.response.headers.get('referrer-policy'),'no-referrer');
  assert.match(await activationPage.response.text(),/invite-activation\.js/);
  const activationScript=await request('/invite-activation.js',{organization:null});
  assert.equal(activationScript.response.status,200);
  assert.match(await activationScript.response.text(),/history\.replaceState/,'le jeton est retiré de la barre d’adresse');

  async function invite(email,roleId,personId,deliveryMode='email'){
    const result=await request('/api/invitations',{method:'POST',cookie:ownerCookie,body:{email,roleId,personId,expiresInDays:7,deliveryMode}});
    assert.equal(result.response.status,201,'OWNER crée invitation '+roleId);
    assert.equal('token' in result.data,false,'le jeton brut n’est jamais exposé comme champ API');
    if(deliveryMode==='manual-test'){
      assert.match(result.response.headers.get('cache-control')||'',/no-store/,'le lien secret ne peut pas être mis en cache');
      assert.equal(result.response.headers.get('referrer-policy'),'no-referrer');
      assert.match(result.data.activationPath,/^\/invite\/activate#[A-Fa-f0-9-]{40,100}$/,'le lien utilise le fragment non transmis au serveur');
      const token=decodeURIComponent(result.data.activationPath.slice(result.data.activationPath.indexOf('#')+1));
      const listed=await request('/api/invitations',{cookie:ownerCookie});
      assert.equal(JSON.stringify(listed.data).includes(token),false,'la liste OWNER ne permet pas de récupérer le jeton une seconde fois');
      assert.equal(deliveries.some(item=>item.to===email),false,'aucun e-mail n’est envoyé aux adresses de test');
      assert.equal(runtimeLogs.some(line=>line.includes(token)),false,'le jeton n’apparaît pas dans les journaux du runtime');
      const audit=database.prepare("SELECT new_values FROM audit_logs WHERE organization_id='org-batinova-iae-2026-10-01' AND action='member.invited' AND entity_id=?").get(result.data.id);
      assert.equal(JSON.stringify(audit||{}).includes(token),false,'le journal d’audit ne contient pas le jeton brut');
      return{...result.data,token};
    }
    assert.equal('activationPath' in result.data,false,'le parcours e-mail ne révèle aucun lien ou jeton');
    return{...result.data,token:deliveries.findLast(item=>item.to===email)?.token};
  }
  async function activate(invitation,password,extra={}){
    const result=await request('/auth/activate',{method:'POST',body:{token:invitation.token,password,...extra},organization:null});
    assert.equal(result.response.status,200,'activation de '+invitation.roleId);
    assert.match(result.response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
    return result.response.headers.get('set-cookie').split(';')[0];
  }
  async function loginAfterActivation(email,password,cookie){
    const logout=await request('/auth/logout',{method:'POST',cookie,organization:null,redirect:'manual'});
    assert.equal(logout.response.status,303,'la session d’activation peut être fermée avant le test de connexion');
    const login=await request('/auth/login',{method:'POST',body:{email,password},organization:null});
    assert.equal(login.response.status,200,'le nouveau compte se connecte avec ses identifiants propres');
    return login.response.headers.get('set-cookie').split(';')[0];
  }
  const wrongMapping=await request('/api/invitations',{method:'POST',cookie:ownerCookie,body:{email:'david.leclercq@socle.test',personId:'1790270195166',roleId:'role-worker',deliveryMode:'manual-test'}});
  assert.equal(wrongMapping.response.status,400,'le mapping de test David ne peut être modifié par le formulaire');
  const wrongSophieMapping=await request('/api/invitations',{method:'POST',cookie:ownerCookie,body:{email:'sophie.martin@socle.test',personId:'1790270194900',roleId:'role-accounting',deliveryMode:'manual-test'}});
  assert.equal(wrongSophieMapping.response.status,400,'Sophie reste une identité comptable distincte avec person_id NULL');
  const wrongTarget=await request('/api/invitations',{method:'POST',cookie:ownerCookie,body:{email:'other@socle.test',personId:null,roleId:'role-accounting',deliveryMode:'manual-test'}});
  assert.equal(wrongTarget.response.status,400,'aucune autre adresse .test ne peut récupérer un lien manuel');

  await runtime.close();env.SOCLE_INVITATION_TEST_MODE='0';env.RAILWAY_PROJECT_ID='7a1eaac4-1d0d-469d-bab2-94dc4493c5e8';env.SOCLE_V3_MANUAL_INVITATIONS='1';env.SOCLE_V3_MANUAL_ORGANIZATION_ID='org-v3-test';env.RAILWAY_VOLUME_MOUNT_PATH=volume;
  database.prepare('INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)').run('org-v3-test','SOCLE V3 test','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner-v3','org-v3-test','OWNER','Propriétaire','2026-10-01T00:00:00Z');
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-worker-v3','org-v3-test','WORKER','Ouvrier','2026-10-01T00:00:00Z');
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-accounting-v3','org-v3-test','ACCOUNTING','Comptable','2026-10-01T00:00:00Z');
  for(const code of ['workspace.view','projects.view.assigned'])database.prepare('INSERT OR IGNORE INTO permissions(code,description) VALUES(?,?)').run(code,code);
  database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker-v3','projects.view.assigned');
  database.prepare('INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?)').run('org-v3-test','test-person-v3','Ouvrier Démo','Ouvrier test','Ouvrier','server','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
  database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('v3-owner-member','org-v3-test','owner','role-owner-v3','active','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
  runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  ownerCookie=(await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null})).response.headers.get('set-cookie').split(';')[0];
  const v3Mode=await request('/api/invitations',{cookie:ownerCookie,organization:'org-v3-test'});assert.equal(v3Mode.data.manualTestEnabled,true,'mode test exposé uniquement avec flag + identifiant projet V3');
  let v3Invite=await request('/api/invitations',{method:'POST',cookie:ownerCookie,organization:'org-v3-test',body:{email:'ouvrier-test@socle-v3.test',personId:'test-person-v3',roleId:'role-worker-v3',deliveryMode:'manual-test'}});
  assert.equal(v3Invite.response.status,201,'OWNER V3 crée son invitation Ouvrier sans e-mail');
  assert.equal(deliveries.some(item=>item.to==='ouvrier-test@socle-v3.test'),false,'aucun e-mail sortant pour invitation V3');
  let v3WrongRole=await request('/api/invitations',{method:'POST',cookie:ownerCookie,organization:'org-v3-test',body:{email:'autre-test@socle-v3.test',personId:'test-person-v3',roleId:'role-accounting-v3',deliveryMode:'manual-test'}});
  assert.equal(v3WrongRole.response.status,403,'le mode manuel V3 refuse un rôle différent de WORKER');
  await runtime.close();env.SOCLE_V3_MANUAL_ORGANIZATION_ID='org-scope-mismatch';runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  ownerCookie=(await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null})).response.headers.get('set-cookie').split(';')[0];
  const v3TenantOff=await request('/api/invitations',{cookie:ownerCookie,organization:'org-v3-test'});assert.equal(v3TenantOff.data.manualTestEnabled,false,'le mode V3 est aussi lié à un identifiant d’entreprise exact');
  v3Invite=await request('/api/invitations',{method:'POST',cookie:ownerCookie,organization:'org-v3-test',body:{email:'scope-test@socle-v3.test',personId:'test-person-v3',roleId:'role-worker-v3',deliveryMode:'manual-test'}});assert.equal(v3Invite.response.status,403,'l’invitation test V3 est refusée si l’entreprise ne correspond pas');
  await runtime.close();env.SOCLE_V3_MANUAL_ORGANIZATION_ID='org-v3-test';runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  ownerCookie=(await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null})).response.headers.get('set-cookie').split(';')[0];
  await runtime.close();delete env.RAILWAY_PROJECT_ID;delete env.SOCLE_V3_MANUAL_INVITATIONS;delete env.SOCLE_V3_MANUAL_ORGANIZATION_ID;delete env.RAILWAY_VOLUME_MOUNT_PATH;
  runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  ownerCookie=(await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null})).response.headers.get('set-cookie').split(';')[0];
  const v3Off=await request('/api/invitations',{cookie:ownerCookie,organization:'org-v3-test'});assert.equal(v3Off.data.manualTestEnabled,false,'mode V3 désactivé hors variables explicites du projet');
  v3Invite=await request('/api/invitations',{method:'POST',cookie:ownerCookie,organization:'org-v3-test',body:{email:'another-test@socle-v3.test',personId:'test-person-v3',roleId:'role-worker-v3',deliveryMode:'manual-test'}});assert.equal(v3Invite.response.status,403,'une invitation test V3 échoue fermée hors Railway V3');
  await runtime.close();runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  ownerCookie=(await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null})).response.headers.get('set-cookie').split(';')[0];
  assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_invitations WHERE organization_id='org-v3-test' AND status='pending'").get().n,1,'l’invitation de test V3 créée plus tôt demeure en attente et unique');
  const davidEmail='socle-david-teamlead@agentmail.to';
  const david=await invite(davidEmail,'role-team-lead','1790270195166','email');
  assert.equal(deliveries.findLast(item=>item.to===davidEmail)?.to,davidEmail,'une adresse AgentMail hors allowlist passe par l’invitation e-mail normale');
  const wrongEmailAcceptance=await request('/auth/activate',{method:'POST',cookie:ownerCookie,body:{token:david.token}});
  assert.equal(wrongEmailAcceptance.response.status,403,'un autre compte ne peut pas accepter l’invitation AgentMail');
  assert.equal(database.prepare('SELECT status FROM organization_invitations WHERE id=?').get(david.id).status,'pending','le refus ne consomme pas le lien');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM profiles WHERE lower(email)=?').get(davidEmail).n,0,'un mauvais e-mail ne crée aucun profil fantôme');
  let davidCookie=await activate(david,davidExistingPassword);
  davidCookie=await loginAfterActivation(davidEmail,davidExistingPassword,davidCookie);
  const replayDavid=await request('/auth/activate',{method:'POST',body:{token:david.token,password:'David-Test-Password-2026!Long'},organization:null});
  assert.equal(replayDavid.response.status,404,'une invitation déjà utilisée ne peut pas créer un second compte');
  const davidMember=database.prepare("SELECT om.user_id,om.person_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-batinova-iae-2026-10-01' AND om.person_id='1790270195166'").get();
  assert.equal(davidMember.role_code,'TEAM_LEAD');
  assert.equal(davidMember.person_id,'1790270195166');
  assert.equal(database.prepare('SELECT identity_kind FROM profiles WHERE id=?').get(davidMember.user_id).identity_kind,'account','David reste un compte authentifiable, jamais une provenance');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id=? AND status='active'").get(davidMember.user_id).n,1,'le nouvel e-mail AgentMail crée un seul compte et n’hérite pas du membership d’un autre profil');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='david-existing-user' AND status='active'").get().n,1,'le profil historique séparé conserve son membership existant');
  const davidProjects=database.prepare("SELECT project_id FROM project_access WHERE organization_id='org-batinova-iae-2026-10-01' AND user_id=? ORDER BY project_id").all(davidMember.user_id).map(row=>row.project_id);
  assert.deepEqual(davidProjects,[...projectIds].sort(),'TEAM_LEAD reçoit les 13 chantiers de E1 issus des affectations d’équipe');
  let result=await request('/api/bootstrap',{cookie:davidCookie});assert.equal(result.data.role,'TEAM_LEAD');
  result=await request('/api/invitations',{cookie:davidCookie});assert.equal(result.response.status,403,'un non-OWNER ne peut pas lister les invitations');
  result=await request('/api/invitations',{method:'POST',cookie:davidCookie,body:{email:'socle-other-worker@agentmail.to',roleId:'role-worker',personId:'1790270195008',deliveryMode:'manual-test'}});assert.equal(result.response.status,403,'un non-OWNER ne peut pas créer un lien de test, quelle que soit l’adresse');
  result=await request('/api/projects/'+encodeURIComponent(projectIds[0]),{cookie:davidCookie});assert.equal(result.response.status,200);
  result=await request('/api/projects/'+encodeURIComponent(unrelatedProject),{cookie:davidCookie});assert.equal(result.response.status,403,'chantier hors périmètre refusé');
  result=await request('/api/accounting/summary',{cookie:davidCookie});assert.equal(result.response.status,403,'Finance refusée au TEAM_LEAD');
  result=await request('/api/bootstrap',{cookie:davidCookie,organization:'org-other'});assert.equal(result.response.status,403,'le nouveau compte AgentMail n’hérite pas des memberships d’un autre profil');
  result=await request('/api/bootstrap',{cookie:davidCookie,organization:'org-socle-simu-v2'});assert.equal(result.response.status,403,'David n’a aucun membership Socle.Simu.V2');
  result=await request('/api/invitations',{method:'POST',cookie:davidCookie,body:{email:'escalation@example.test',roleId:'role-owner'}});assert.equal(result.response.status,403,'David ne peut pas augmenter son rôle');

  const anthonyEmail='socle-anthony-worker@agentmail.to';
  const anthony=await invite(anthonyEmail,'role-worker','1790270195400','email');
  let anthonyCookie=await activate(anthony,'Anthony-Test-Password-2026!Long');
  anthonyCookie=await loginAfterActivation(anthonyEmail,'Anthony-Test-Password-2026!Long',anthonyCookie);
  const anthonyMember=database.prepare("SELECT om.user_id,om.person_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-batinova-iae-2026-10-01' AND om.person_id='1790270195400'").get();
  assert.equal(anthonyMember.role_code,'WORKER');
  assert.equal(database.prepare('SELECT identity_kind FROM profiles WHERE id=?').get(anthonyMember.user_id).identity_kind,'account','Anthony est créé comme véritable compte, pas comme provenance');
  assert.equal(database.prepare('SELECT COUNT(*) n FROM field_assignments WHERE organization_id=? AND people_json LIKE ?').get('org-batinova-iae-2026-10-01','%1790270195400%').n,41);
  const anthonyProjects=database.prepare("SELECT project_id FROM project_access WHERE organization_id='org-batinova-iae-2026-10-01' AND user_id=? ORDER BY project_id").all(anthonyMember.user_id).map(row=>row.project_id);
  assert.deepEqual(anthonyProjects,[...projectIds].sort(),'WORKER reçoit ses 13 seuls chantiers affectés');
  result=await request('/api/bootstrap',{cookie:anthonyCookie});assert.equal(result.data.role,'WORKER');
  result=await request('/api/projects/'+encodeURIComponent(projectIds[0]),{cookie:anthonyCookie});assert.equal(result.response.status,200);
  result=await request('/api/projects/'+encodeURIComponent(unrelatedProject),{cookie:anthonyCookie});assert.equal(result.response.status,403);
  result=await request('/api/accounting/summary',{cookie:anthonyCookie});assert.equal(result.response.status,403,'Finance refusée au WORKER');
  result=await request('/api/bootstrap',{cookie:anthonyCookie,organization:'org-other'});assert.equal(result.response.status,403,'isolation tenant Anthony');
  result=await request('/api/invitations',{method:'POST',cookie:anthonyCookie,body:{email:'escalation@example.test',roleId:'role-owner'}});assert.equal(result.response.status,403,'TEAM_LEAD ne peut ni inviter ni escalader');

  const existingInvite=await invite('existing@other.test','role-accounting',null);
  const existingLogin=await request('/auth/login',{method:'POST',body:{email:'existing@other.test',password:existingPassword},organization:null});
  assert.equal(existingLogin.response.status,200,'un compte SOCLE déjà existant conserve sa connexion');
  const existingCookie=existingLogin.response.headers.get('set-cookie').split(';')[0];
  const foreignTenantRoster=await request('/api/invitation-roster',{cookie:existingCookie});
  assert.equal(foreignTenantRoster.response.status,403,'un OWNER d’un autre tenant ne peut pas lire le roster BatiNova');
  const crossTenantManual=await request('/api/invitations',{method:'POST',cookie:existingCookie,organization:'org-other',body:{email:'socle-other-worker@agentmail.to',personId:'1790270195166',roleId:'role-accounting',deliveryMode:'manual-test'}});
  assert.equal(crossTenantManual.response.status,403,'le mode manuel ne fonctionne que dans le tenant BatiNova dédié');
  result=await request('/auth/activate',{method:'POST',cookie:existingCookie,body:{token:existingInvite.token}});
  assert.equal(result.response.status,200,'le compte existant peut accepter l’invitation sans recréer ses credentials');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM production_credentials WHERE user_id='existing-user'").get().n,1,'les credentials existants restent uniques');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='existing-user'").get().n,2,'l’adhésion de l’autre tenant est conservée et BatiNova est ajoutée');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM project_access WHERE user_id='existing-user' AND organization_id='org-batinova-iae-2026-10-01'").get().n,0,'aucun accès chantier n’est ajouté à ce compte sans roster');
  result=await request('/auth/activate',{method:'POST',cookie:existingCookie,body:{token:existingInvite.token}});
  assert.equal(result.response.status,404,'un compte existant ne peut pas rejouer le lien');

  const sophieEmail='socle-sophie-accounting@agentmail.to';
  const sophie=await invite(sophieEmail,'role-accounting',null,'email');
  let sophieCookie=await activate(sophie,'Sophie-Test-Password-2026!Long',{firstName:'Sophie',lastName:'Martin'});
  sophieCookie=await loginAfterActivation(sophieEmail,'Sophie-Test-Password-2026!Long',sophieCookie);
  const sophieMember=database.prepare("SELECT om.user_id,om.person_id,r.code role_code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-batinova-iae-2026-10-01' AND lower((SELECT email FROM profiles WHERE id=om.user_id))=?").get(sophieEmail);
  assert.equal(sophieMember.role_code,'ACCOUNTING');
  assert.equal(sophieMember.person_id,null,'ACCOUNTING reste une identité de connexion séparée du roster');
  assert.equal(database.prepare('SELECT identity_kind FROM profiles WHERE id=?').get(sophieMember.user_id).identity_kind,'account','Sophie est créée comme véritable compte, pas comme provenance');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM project_access WHERE organization_id='org-batinova-iae-2026-10-01' AND user_id=?").get(sophieMember.user_id).n,0,'ACCOUNTING ne reçoit aucun project_access');
  result=await request('/api/bootstrap',{cookie:sophieCookie});assert.equal(result.data.role,'ACCOUNTING');
  result=await request('/api/accounting/summary',{cookie:sophieCookie});assert.equal(result.response.status,200,'Finance autorisée à ACCOUNTING');
  result=await request('/api/planning',{cookie:sophieCookie});assert.equal(result.response.status,403,'Planning refusé à ACCOUNTING');
  result=await request('/api/projects/'+encodeURIComponent(projectIds[0]),{cookie:sophieCookie});assert.equal(result.response.status,403,'accès chantier refusé à ACCOUNTING');
  result=await request('/api/bootstrap',{cookie:sophieCookie,organization:'org-other'});assert.equal(result.response.status,403,'isolation tenant Sophie');
  result=await request('/api/invitations',{method:'POST',cookie:sophieCookie,body:{email:'escalation@example.test',roleId:'role-owner'}});assert.equal(result.response.status,403,'Sophie ne peut pas augmenter son rôle');

  const blocked=await invite('provenance@example.test','role-accounting',null);
  result=await request('/auth/activate',{method:'POST',body:{token:blocked.token,password:'Provenance-Test-Password-2026!Long',firstName:'Faux',lastName:'Compte'},organization:null});
  assert.equal(result.response.status,403,'un profil de provenance ne peut pas être converti en compte');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM production_credentials WHERE email='provenance@example.test'").get().n,0);
  assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id='provenance-profile'").get().n,0);

  env.SOCLE_INVITATION_TEST_MODE='1';env.RAILWAY_PROJECT_ID='7a1eaac4-1d0d-469d-bab2-94dc4493c5e8';env.SOCLE_V3_MANUAL_INVITATIONS='1';env.SOCLE_V3_MANUAL_ORGANIZATION_ID='org-v3-test';env.RAILWAY_VOLUME_MOUNT_PATH=volume;
  await runtime.close();runtime=await startProduction({env,logger:{log(...args){runtimeLogs.push(args.map(String).join(' '))},error(...args){runtimeLogs.push(args.map(String).join(' '))}},invitationMailer:async message=>{deliveries.push(message)}});
  ownerCookie=(await request('/auth/login',{method:'POST',body:{email:'owner@batinova.test',password:ownerPassword},organization:null})).response.headers.get('set-cookie').split(';')[0];
  const manualAgentMail=await invite('socle-manual-worker@agentmail.to','role-worker','1790270195008','manual-test');
  assert.equal(deliveries.some(item=>item.to==='socle-manual-worker@agentmail.to'),false,'le fallback manuel ne transmet aucun e-mail');
  assert.match(manualAgentMail.token,/^[A-Fa-f0-9-]{40,100}$/,'le test manuel reste un lien secret à usage unique pour une adresse valide hors ancienne allowlist');
  const manualAgentCookie=await activate(manualAgentMail,'Manual-Test-Password-2026!Long');
  assert.equal(database.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org-batinova-iae-2026-10-01' AND om.person_id='1790270195008'").get().code,'WORKER','le fallback manuel rattache le rôle et la personne demandés');
  const duplicate=await request('/api/invitations',{method:'POST',cookie:ownerCookie,body:{email:'another-david@example.test',roleId:'role-worker',personId:'1790270195166'}});
  assert.equal(duplicate.response.status,409,'une personne déjà liée ne peut pas recevoir un second compte');
  const invalid=await invite('invalid-password@example.test','role-accounting',null);
  result=await request('/auth/activate',{method:'POST',body:{token:invalid.token,password:'short',firstName:'Invalid',lastName:'Password'},organization:null});
  assert.equal(result.response.status,400,'mot de passe faible refusé');
  assert.equal(database.prepare("SELECT COUNT(*) n FROM organization_members WHERE user_id IN (SELECT id FROM profiles WHERE email='invalid-password@example.test')").get().n,0);

  assert.equal(database.prepare("SELECT COUNT(*) n FROM audit_logs WHERE organization_id='org-batinova-iae-2026-10-01' AND action='member.invitation_accepted'").get().n,5,'chaque activation réussie est auditée');
  for(const table of ['hr_people','hr_teams','hr_team_members','hr_team_leads'])assert.equal(database.prepare(`SELECT COUNT(*) n FROM ${table} WHERE organization_id='org-batinova-iae-2026-10-01'`).get().n,0,`le parcours n’écrit pas de doublons dans ${table}`);
  assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0,'aucune FK cassée après les invitations');
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  console.log('owner-first-user-onboarding-37: OWNER, activation, 3 rôles, scopes, audit et isolation vérifiés');
}finally{
  try{database.close()}catch{}
  if(runtime)await runtime.close();
  rmSync(temporary,{recursive:true,force:true});
}
