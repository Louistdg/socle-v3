import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const dir=mkdtempSync(join(tmpdir(),'socle-stock-worker-')),dbPath=join(dir,'stock-worker.sqlite');
const db=new DatabaseSync(dbPath);db.exec('PRAGMA foreign_keys=ON');db.exec('PRAGMA busy_timeout=1000');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const db2=new DatabaseSync(dbPath);db2.exec('PRAGMA foreign_keys=ON');db2.exec('PRAGMA busy_timeout=1000');
process.on('exit',()=>{try{db2.close()}catch{}try{db.close()}catch{}rmSync(dir,{recursive:true,force:true})});

function databaseEnv(database){return{DB:{prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},async batch(statements){database.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>{const result=database.prepare(statement._sql).run(...statement._values);return{meta:{changes:Number(result.changes)}}});database.exec('COMMIT');return results}catch(error){database.exec('ROLLBACK');throw error}}}}}
const env=databaseEnv(db),env2=databaseEnv(db2),stamp='2026-10-04T12:00:00.000Z';
const businessDate=(()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),v={};for(const p of parts)if(['year','month','day'].includes(p.type))v[p.type]=p.value;return v.year+'-'+v.month+'-'+v.day})(),otherDate=(()=>{const d=new Date(businessDate+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10)})();

for(const [org,name] of [['org','BatiNova'],['org2','Autre']])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,name,name,'BE','EUR',stamp,stamp);
for(const [id,first] of [['owner','Marc'],['worker','Anthony'],['lead','David'],['custom','Camille'],['other','Autre']])db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,first,'Test',stamp,stamp);
for(const [id,org,code,name] of [['role-owner','org','OWNER','Propriétaire'],['role-worker','org','WORKER','Ouvrier'],['role-lead','org','TEAM_LEAD','Chef d’équipe'],['role-custom','org','USER_CUSTOM','Chef d’équipe'],['role-other','org2','WORKER','Ouvrier']])db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,name,stamp);
for(const [user,org,role,person] of [['owner','org','role-owner','1'],['worker','org','role-worker','3'],['lead','org','role-lead','2'],['custom','org','role-custom','4'],['other','org2','role-other','9']])db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+user,org,user,role,'active',stamp,stamp,stamp,person);

const state={version:3,company:{name:'BatiNova',timeZone:'Europe/Brussels'},people:[{id:1,name:'Marc'},{id:2,name:'David'},{id:3,name:'Anthony'},{id:4,name:'Camille'}],teams:[{id:10,name:'Équipe toiture',members:[2,3]}],jobs:[{id:'p1',name:'Chantier 1',reference:'CH-1'},{id:'p2',name:'Chantier 2',reference:'CH-2'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],stockItems:[],purchaseOrders:[],deliveryNotes:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org2',JSON.stringify({...state,company:{name:'Autre',timeZone:'Europe/Brussels'},jobs:[{id:'p9',name:'Autre chantier'}]}),1,'other',stamp,stamp);
db.prepare('INSERT INTO field_data_imports(organization_id,imported_at) VALUES(?,?)').run('org',stamp);
db.prepare('INSERT INTO field_data_imports(organization_id,imported_at) VALUES(?,?)').run('org2',stamp);

for(const [role,codes] of [
 ['role-worker',['workspace.view','projects.view.assigned']],
 ['role-lead',['workspace.view','projects.view.assigned','stock.consume.assigned']],
 ['role-custom',['workspace.view','projects.view.assigned','stock.consume.assigned']],
 ['role-other',['workspace.view','projects.view.assigned','stock.consume.assigned']]
])for(const code of codes)db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(role,code);
for(const [org,user,project,by] of [['org','worker','p1','owner'],['org','lead','p1','owner'],['org','custom','p1','owner'],['org2','other','p9','other']])db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,user,project,by,stamp);

db.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('stock-1','org','ARD-01','Ardoises',35,0,'paquet',2500,0,'Négoce','', 'owner',stamp,'owner',stamp);
const locationTypes=['warehouse','vehicle','project','internal','legacy','unknown'];
for(const type of locationTypes){const id='loc-'+type;db.prepare('INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id,'org','Lieu '+type,type,'active','owner',stamp,'owner',stamp);db.prepare('INSERT INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at) VALUES(?,?,?,?,?)').run('org','stock-1',id,5,stamp)}
db.prepare('INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('loc-inactive','org','Dépôt inactif','warehouse','inactive','owner',stamp,'owner',stamp);
db.prepare('INSERT INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at) VALUES(?,?,?,?,?)').run('org','stock-1','loc-inactive',5,stamp);
db.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('other-stock','org2','X','Autre stock',1,0,'u',100,0,'','', 'other',stamp,'other',stamp);
db.prepare('INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('other-warehouse','org2','Autre dépôt','warehouse','active','other',stamp,'other',stamp);
db.prepare('INSERT INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at) VALUES(?,?,?,?,?)').run('org2','other-stock','other-warehouse',1,stamp);

const callWith=async(targetEnv,uid,method,path,payload,org='org')=>{const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':org,'origin':'https://socle.test'};if(payload!==undefined)headers['content-type']='application/json';const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),targetEnv);let body={};try{body=await response.json()}catch{}return{status:response.status,body}};
const call=(uid,method,path,payload,org='org')=>callWith(env,uid,method,path,payload,org);
const consume=(uid,payload)=>call(uid,'POST','/api/projects/p1/stock-consume',payload);
const assignment=(project,date,status='planned',people=['3'],team='10')=>{db.prepare('DELETE FROM field_assignments WHERE organization_id=?').run('org');db.prepare('INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at,start_time,end_time,assignment_type,status,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('a1','org',date,team,project,JSON.stringify(people),null,null,'','owner',stamp,'owner',stamp,'07:00','16:00','team',status,'')};

let r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,operationKey:'no-permission'});
assert.equal(r.status,403,'WORKER sans permission = 403');
db.prepare("INSERT INTO role_permissions(role_id,permission_code) VALUES('role-worker','stock.consume.assigned')").run();
r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,operationKey:'project-access-only'});
assert.equal(r.status,403,'project_access seul ne suffit pas');
assignment('p2',businessDate);r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,operationKey:'other-project'});
assert.equal(r.status,403,'affectation autre projet refusée');
assignment('p1',businessDate,'cancelled');r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,operationKey:'cancelled'});
assert.equal(r.status,403,'affectation annulée refusée');
assignment('p1',otherDate);r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,operationKey:'wrong-date'});
assert.equal(r.status,403,'date différente refusée');
assignment('p1',businessDate);

r=await call('worker','GET','/api/projects/p1/stock-consume/options?q=ARD');
assert.equal(r.status,200);assert.equal(r.body.date,businessDate);assert.equal(r.body.options.length,1,'seul l’entrepôt actif est exposé');assert.equal(r.body.options[0].location.type,'warehouse');assert.equal(r.body.options[0].location.id,'loc-warehouse');assert.equal(r.body.options[0].available,5);
const optionText=JSON.stringify(r.body);for(const forbidden of ['unit_cost','unitCost','supplier','margin','cost'])assert.equal(optionText.includes(forbidden),false,'aucun coût/fournisseur exposé: '+forbidden);
r=await call('worker','GET','/api/field-data');assert.equal(r.status,200);assert.deepEqual(r.body.stockItems,[],'stock.consume.assigned ne donne pas stock.view');
const workerPermissions=db.prepare("SELECT permission_code FROM role_permissions WHERE role_id='role-worker'").all().map(row=>row.permission_code);for(const broad of ['stock.view','stock.move','stock.items.manage','stock.locations.manage'])assert.equal(workerPermissions.includes(broad),false,'aucun droit Stock large: '+broad);

for(const type of ['vehicle','project','internal','legacy','unknown']){r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-'+type,quantity:1,operationKey:'blocked-'+type});assert.equal(r.status,400,type+' explicitement refusé')}
r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-inactive',quantity:1,operationKey:'inactive'});assert.equal(r.status,404,'entrepôt inactif refusé');
r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'other-warehouse',quantity:1,operationKey:'cross-location'});assert.equal(r.status,404,'emplacement autre tenant refusé');
r=await call('worker','POST','/api/projects/p1/stock-consume',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,note:'x',operationKey:'client-date',movement_date:businessDate});assert.equal(r.status,400,'le client ne peut pas fournir movement_date');
r=await call('worker','POST','/api/projects/p1/stock-consume',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,note:'x',operationKey:'client-cost',unit_cost_cents:1});assert.equal(r.status,400,'le client ne peut pas fournir le coût');
r=await call('worker','GET','/api/projects/p1/stock-consume/options',undefined,'org2');assert.equal(r.status,403,'tenant forgé refusé');

r=await consume('worker',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:99,note:'Trop',operationKey:'too-much'});assert.equal(r.status,409,'quantité > disponible = 409');
const payload={stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,note:'Pour la rive',operationKey:'consume-1'};
r=await consume('worker',payload);assert.equal(r.status,201,'WORKER + permission + affectation valide');assert.equal(r.body.date,businessDate);assert.equal('unit_cost_cents' in r.body,false);assert.equal('cost' in r.body,false);
assert.equal(db.prepare("SELECT movement_date FROM field_stock_movements WHERE organization_id='org' AND idempotency_key='consume-1'").get().movement_date,businessDate,'date du mouvement fixée côté serveur');
r=await consume('worker',payload);assert.equal(r.status,200);assert.equal(r.body.replayed,true,'replay identique idempotent');
r=await consume('worker',{...payload,quantity:2});assert.equal(r.status,409,'même clé + contenu différent = 409');
assert.equal(db.prepare("SELECT COUNT(*) count FROM field_stock_movements WHERE organization_id='org' AND idempotency_key='consume-1'").get().count,1);

assignment('p1',businessDate,'planned',['3'],'10');
r=await call('lead','GET','/api/projects/p1/stock-consume/options');assert.equal(r.status,403,'TEAM_LEAD absent de people_json ne peut pas consommer pour son équipe');
r=await call('lead','POST','/api/projects/p1/stock-consume',{stockItemId:'stock-1',sourceLocationId:'loc-warehouse',quantity:1,operationKey:'lead-not-assigned'});assert.equal(r.status,403,'TEAM_LEAD absent de people_json est refusé au POST également');
assignment('p1',businessDate,'planned',['2','3'],'10');
r=await call('lead','GET','/api/projects/p1/stock-consume/options');assert.equal(r.status,200,'TEAM_LEAD présent dans people_json et son scope équipe réel peut consommer');
assignment('p1',businessDate,'planned',['3'],'10');
r=await call('custom','GET','/api/projects/p1/stock-consume/options');assert.equal(r.status,403,'USER_* nommé Chef d’équipe ne reçoit aucun élargissement par son nom de profil');

db.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('stock-race','org','RACE','Article concurrence',1,0,'u',700,0,'','', 'owner',stamp,'owner',stamp);
db.prepare('INSERT INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at) VALUES(?,?,?,?,?)').run('org','stock-race','loc-warehouse',1,stamp);
const racePayload=key=>({stockItemId:'stock-race',sourceLocationId:'loc-warehouse',quantity:1,note:'Concurrence',operationKey:key});
const raced=[
  await callWith(env,'worker','POST','/api/projects/p1/stock-consume',racePayload('race-attempt-a')),
  await callWith(env2,'worker','POST','/api/projects/p1/stock-consume',racePayload('race-attempt-b'))
];
assert.equal(raced.filter(x=>x.status===201).length,1,'une seule des deux consommations réussit');
assert.equal(raced.filter(x=>x.status===409).length,1,'la seconde est refusée en 409 par l’invariant stock');
assert.equal(db.prepare("SELECT quantity FROM stock_balances WHERE organization_id='org' AND stock_item_id='stock-race' AND location_id='loc-warehouse'").get().quantity,0,'stock final = 0, jamais négatif');
const raceImpact=db.prepare("SELECT COUNT(*) count,COALESCE(SUM(quantity*unit_cost_cents),0) cost FROM field_stock_movements WHERE organization_id='org' AND project_id='p1' AND stock_item_id='stock-race' AND movement_type='sortie chantier'").get();
assert.equal(raceImpact.count,1,'exactement un mouvement sortie chantier');assert.equal(raceImpact.cost,700,'exactement un impact coût projet');
assert.equal(db.prepare("SELECT COUNT(*) count FROM audit_logs WHERE organization_id='org' AND action='stock_movement.created' AND json_extract(new_values,'$.stock_item_id')='stock-race'").get().count,1,'un seul audit mouvement');

const ui=readFileSync(new URL('../web/field-portal.js',import.meta.url),'utf8');assert.match(ui,/📦 Prendre du stock/);assert.match(ui,/stock-consume\/options/);assert.match(ui,/stock-consume'/);assert.doesNotMatch(ui,/name="movement_date"/);
const permissionUi=readFileSync(new URL('../web/permissions.js',import.meta.url),'utf8');assert.match(permissionUi,/consumeStock:\['stock\.consume\.assigned'\]/);

console.log('stock-worker-consume-20261004: permission étroite, affectation du jour, warehouse-only, idempotence, coût caché et concurrence à deux connexions validés');
