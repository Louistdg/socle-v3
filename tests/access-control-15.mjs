import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let failBatchAfter=0;
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){
    database.exec('BEGIN IMMEDIATE');
    try{
      const results=[];
      for(let index=0;index<statements.length;index++){
        if(failBatchAfter&&index===failBatchAfter)throw Error('batch failure injected');
        const statement=statements[index],result=database.prepare(statement._sql).run(...statement._values);
        results.push({meta:{changes:Number(result.changes)}});
      }
      database.exec('COMMIT');
      return results;
    }catch(error){
      database.exec('ROLLBACK');
      throw error;
    }
  }
}};
const stamp='2026-09-25T18:00:00.000Z';
const state={version:3,company:{name:'BatiNova'},people:[{id:10,name:'Julien Lambert'},{id:11,name:'Anthony Simon'}],teams:[],jobs:[{id:1,reference:'CH-1',name:'Chantier 1'},{id:2,reference:'CH-2',name:'Chantier 2'}],assignments:[],quotes:[{id:1,job:1,total:1000,label:'Devis 1'}],assets:[],tasks:[],dossiers:[],reminders:[]};
for(const [id,first,last,email] of [['owner','Marc','Delcourt','owner@example.test'],['julien','Julien','Lambert','julien@example.test'],['anthony','Anthony','Simon','anthony@example.test'],['admin','Sophie','Admin','admin@example.test']])database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,last,email,stamp,stamp);
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [id,code,name] of [['role-owner','OWNER','Propriétaire'],['role-worker','WORKER','Ouvrier'],['role-admin','ADMIN','Administration']])database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,'org',code,name,stamp);
for(const [user,role] of [['owner','role-owner'],['julien','role-worker'],['anthony','role-worker'],['admin','role-admin']])database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,'org',user,role,'active',stamp,stamp,stamp);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,stamp);
database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('i-julien','org','julien','10','julien@example.test','Julien Lambert','simulation_not_sent',stamp,stamp);
database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('i-anthony','org','anthony','11','anthony@example.test','Anthony Simon','simulation_not_sent',stamp,stamp);
database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-admin','permissions.view');
database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-admin','permissions.manage');

const call=async(uid,method='GET',path='/api/access-control',payload)=>{const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers:{'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test',...(payload?{'content-type':'application/json'}:{})},...(payload?{body:JSON.stringify(payload)}:{})}),env);let body={};try{body=await response.json()}catch{}return{status:response.status,body}};
const emptyModules={};for(const key of ['planning','personal','jobs','messages','people','quotes','gallery','fleet','accounting','actions','documents','company','permissions'])emptyModules[key]={view:false,add:false,edit:false};
const baseAssignment={profileName:'Chef d’équipe',scope:'Ses chantiers uniquement',modules:structuredClone(emptyModules),sensitive:{quotePrices:false,jobMargins:false,payroll:false,privateDocuments:false,manageAccess:false,paySlips:false},fieldActions:{logHours:true,requestTimeCorrection:true,approveTimeCorrection:false,scheduleTeams:false,manageTeams:false,logFuel:true,reportAssetIssue:true,manageAssets:false,manageAlerts:false,manageSharedCalendar:false,managePeople:false,removePeople:false,paymentReminders:false,markPayments:false,uploadPaySlips:false,consumeStock:true,viewProfitability:false},projectIds:['1']};
baseAssignment.modules.planning.view=true;baseAssignment.modules.personal.view=true;baseAssignment.modules.jobs={view:true,add:true,edit:true};baseAssignment.modules.actions={view:true,add:true,edit:true};baseAssignment.modules.messages={view:true,add:true,edit:false};

let result=await call('owner');assert.equal(result.status,200);assert.equal(result.body.members.length,4);assert.equal(result.body.members.find(x=>x.userId==='julien').personId,'10');
result=await call('julien');assert.equal(result.status,403,'Un utilisateur sans permission ne peut pas ouvrir le gestionnaire d’accès');
result=await call('owner','PUT','/api/access-control/julien',baseAssignment);assert.equal(result.status,200);
let member=database.prepare("SELECT om.role_id,r.code role_code,r.name role_name FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id='org' AND om.user_id='julien'").get();assert.match(member.role_code,/^USER_/);assert.equal(member.role_name,'Chef d’équipe');assert.notEqual(member.role_id,'role-worker','Julien reçoit un rôle personnel pour éviter de modifier les autres ouvriers');
assert.equal(database.prepare("SELECT role_id FROM organization_members WHERE organization_id='org' AND user_id='anthony'").get().role_id,'role-worker','Anthony garde le rôle partagé d’origine');
let permissions=database.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').all(member.role_id).map(x=>x.permission_code);assert.ok(permissions.includes('ui.module.jobs.view'));assert.ok(permissions.includes('projects.view.assigned'));assert.ok(permissions.includes('time_entries.create.own'));assert.ok(permissions.includes('stock.consume.assigned'));assert.ok(permissions.includes('ui.field.consumeStock'));for(const broad of ['stock.view','stock.move','stock.items.manage','stock.locations.manage'])assert.ok(!permissions.includes(broad),'consumeStock ne doit pas ajouter '+broad);assert.ok(!permissions.includes('quotes.prices.view'));assert.ok(!permissions.includes('permissions.manage'));
assert.deepEqual(database.prepare("SELECT project_id FROM project_access WHERE organization_id='org' AND user_id='julien' ORDER BY project_id").all().map(x=>String(x.project_id)),['1']);
result=await call('julien','GET','/api/state');assert.equal(result.status,200);assert.deepEqual(result.body.state.jobs.map(x=>x.reference),['CH-1']);assert.equal(result.body.state.quotes[0].total,undefined,'Le devis reste sans prix sans quotes.prices.view');assert.equal(result.body.access.userId,'julien');assert.equal(result.body.access.profileName,'Chef d’équipe');assert.equal(result.body.access.scope,'Ses chantiers uniquement');assert.ok(result.body.access.permissions.includes('ui.module.jobs.edit'));assert.deepEqual(result.body.access.projectIds,['1']);

const allAssignment=structuredClone(baseAssignment);allAssignment.profileName='Gestionnaire de chantier';allAssignment.scope='Tous les chantiers';allAssignment.sensitive.quotePrices=true;allAssignment.projectIds=['1','2'];
result=await call('owner','PUT','/api/access-control/julien',allAssignment);assert.equal(result.status,200);member=database.prepare("SELECT om.role_id FROM organization_members om WHERE om.organization_id='org' AND om.user_id='julien'").get();permissions=database.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').all(member.role_id).map(x=>x.permission_code);assert.ok(permissions.includes('projects.view.all'));assert.ok(!permissions.includes('projects.view.assigned'));assert.ok(permissions.includes('quotes.prices.view'));assert.equal(database.prepare("SELECT COUNT(*) count FROM project_access WHERE organization_id='org' AND user_id='julien'").get().count,0,'Le périmètre explicite est vidé quand tous les chantiers sont autorisés');
result=await call('julien','GET','/api/state');assert.equal(result.status,200);assert.deepEqual(result.body.state.jobs.map(x=>x.reference),['CH-1','CH-2']);assert.equal(result.body.state.quotes[0].total,1000);

const invalid=structuredClone(baseAssignment);invalid.projectIds=['999'];result=await call('owner','PUT','/api/access-control/julien',invalid);assert.equal(result.status,400,'Un chantier hors workspace est refusé');
result=await call('owner','PUT','/api/access-control/owner',baseAssignment);assert.equal(result.status,403,'Le propriétaire ne peut pas être dégradé via cette route');
result=await call('admin','GET','/api/access-control');assert.equal(result.status,200,'Un gestionnaire des accès peut consulter la configuration');
const selfEscalation=structuredClone(baseAssignment);selfEscalation.sensitive.manageAccess=true;result=await call('admin','PUT','/api/access-control/admin',selfEscalation);assert.equal(result.status,403,'Un gestionnaire non propriétaire ne peut pas augmenter ses propres droits');
result=await call('admin','PUT','/api/access-control/anthony',selfEscalation);assert.equal(result.status,403,'Seul le propriétaire peut déléguer permissions.manage');
result=await call('owner');const configured=result.body.members.find(x=>x.userId==='julien');assert.equal(configured.configured,true);assert.equal(configured.profileName,'Gestionnaire de chantier');assert.equal(configured.scope,'Tous les chantiers');assert.ok(configured.permissions.includes('ui.field.logHours'));
const invalidScope=structuredClone(baseAssignment);invalidScope.scope='Tous les chantïers';result=await call('owner','PUT','/api/access-control/anthony',invalidScope);assert.equal(result.status,400,'Un périmètre libre non reconnu doit être refusé');
result=await call('admin','PUT','/api/access-control/anthony',baseAssignment);assert.equal(result.status,403,'Un gestionnaire délégué ne peut pas accorder des droits qu’il ne possède pas');

const beforeRole=database.prepare("SELECT role_id FROM organization_members WHERE organization_id='org' AND user_id='julien'").get().role_id;
const beforePermissions=database.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').all(beforeRole).map(row=>row.permission_code);
const beforeProjects=database.prepare("SELECT project_id FROM project_access WHERE organization_id='org' AND user_id='julien' ORDER BY project_id").all().map(row=>String(row.project_id));
const beforeSettings=database.prepare("SELECT profile_name,scope FROM member_access_settings WHERE organization_id='org' AND user_id='julien'").get();
failBatchAfter=5;
result=await call('owner','PUT','/api/access-control/julien',baseAssignment);
failBatchAfter=0;
assert.equal(result.status,500,'Une panne transactionnelle doit faire échouer la mise à jour complète');
const afterRole=database.prepare("SELECT role_id FROM organization_members WHERE organization_id='org' AND user_id='julien'").get().role_id;
const afterPermissions=database.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').all(beforeRole).map(row=>row.permission_code);
const afterProjects=database.prepare("SELECT project_id FROM project_access WHERE organization_id='org' AND user_id='julien' ORDER BY project_id").all().map(row=>String(row.project_id));
const afterSettings=database.prepare("SELECT profile_name,scope FROM member_access_settings WHERE organization_id='org' AND user_id='julien'").get();
assert.equal(afterRole,beforeRole,'Le rôle reste identique après rollback');
assert.deepEqual(afterPermissions,beforePermissions,'Les permissions restent intactes après rollback');
assert.deepEqual(afterProjects,beforeProjects,'Le périmètre chantier reste intact après rollback');
assert.equal(afterSettings.profile_name,beforeSettings.profile_name,'Le profil UI reste intact après rollback');
assert.equal(afterSettings.scope,beforeSettings.scope,'Le périmètre UI reste intact après rollback');

const auditRow=database.prepare("SELECT action,entity_id,new_values FROM audit_logs WHERE action='access.updated' ORDER BY created_at DESC LIMIT 1").get();assert.equal(auditRow.entity_id,'julien');assert.equal(JSON.parse(auditRow.new_values).profile,'Gestionnaire de chantier');

const organizationsBeforeBootstrap=database.prepare('SELECT COUNT(*) count FROM organizations').get().count;
let bootstrapResponse=await worker.fetch(new Request('https://socle.test/api/state',{headers:{'oai-authenticated-user-id':'bootstrap-user','origin':'https://socle.test'}}),env);
assert.equal(bootstrapResponse.status,403,'Le bootstrap automatique est désactivé par défaut');
assert.equal(database.prepare('SELECT COUNT(*) count FROM organizations').get().count,organizationsBeforeBootstrap,'Aucune organisation ne doit être créée implicitement');
let forgedResponse=await worker.fetch(new Request('https://socle.test/api/state',{headers:{'oai-authenticated-user-id':'bootstrap-user','x-socle-organization-id':'org','origin':'https://socle.test'}}),env);
assert.equal(forgedResponse.status,403,'Un header organisation forgé ne donne aucun accès');
assert.equal(database.prepare('SELECT COUNT(*) count FROM organizations').get().count,organizationsBeforeBootstrap,'Le header forgé ne crée aucune organisation');
env.SOCLE_ALLOW_BOOTSTRAP='true';
bootstrapResponse=await worker.fetch(new Request('https://socle.test/api/state',{headers:{'oai-authenticated-user-id':'bootstrap-user','origin':'https://socle.test'}}),env);
delete env.SOCLE_ALLOW_BOOTSTRAP;
assert.equal(database.prepare("SELECT COUNT(*) count FROM organizations WHERE id='org-bootstrap-user'").get().count,1,'Le bootstrap explicite crée bien une organisation');
assert.equal(database.prepare("SELECT r.code FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.user_id='bootstrap-user' AND om.organization_id='org-bootstrap-user'").get().code,'OWNER','Le bootstrap explicite crée le propriétaire attendu');
for(const roleCode of ['TEAM_LEAD','WORKER']){const role=database.prepare("SELECT id FROM roles WHERE organization_id='org-bootstrap-user' AND code=?").get(roleCode);assert.ok(role);assert.equal(database.prepare("SELECT COUNT(*) count FROM role_permissions WHERE role_id=? AND permission_code='stock.consume.assigned'").get(role.id).count,1,roleCode+' reçoit stock.consume.assigned par défaut')}
{const role=database.prepare("SELECT id FROM roles WHERE organization_id='org-bootstrap-user' AND code='ACCOUNTING'").get();assert.ok(role);assert.equal(database.prepare("SELECT COUNT(*) count FROM role_permissions WHERE role_id=? AND permission_code='stock.consume.assigned'").get(role.id).count,0,'ACCOUNTING ne reçoit pas le droit terrain par défaut')}

console.log('access-control-15: contrôles d’accès, permission Stock terrain et bootstrap validés');
