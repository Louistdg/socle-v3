import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const barcodeIndex=migrations.indexOf('0042_stock_barcodes.sql');
assert.ok(barcodeIndex>0,'migration 0042 présente');
const database=new DatabaseSync(':memory:');database.exec('PRAGMA foreign_keys=ON');
for(const name of migrations.slice(0,barcodeIndex))database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-10-06T20:00:00.000Z';
const today=(()=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),v={};for(const p of parts)if(['year','month','day'].includes(p.type))v[p.type]=p.value;return v.year+'-'+v.month+'-'+v.day})();
const state={version:3,company:{name:'Entreprise A',timeZone:'Europe/Brussels'},people:[{id:'1',name:'Owner'},{id:'2',name:'Worker'},{id:'3',name:'Lead'}],teams:[{id:'10',name:'Équipe',members:['2','3']}],jobs:[{id:'p1',name:'Chantier 1'},{id:'p2',name:'Chantier 2'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],stockItems:[],purchaseOrders:[],deliveryNotes:[]};

for(const [org,name] of [['org-a','Entreprise A'],['org-b','Entreprise B']])database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,name,name,'BE','EUR',stamp,stamp);
for(const id of ['owner-a','owner-b','viewer','catalog','worker','lead','accounting'])database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,'Test',stamp,stamp);
for(const [id,org,code] of [['role-owner-a','org-a','OWNER'],['role-owner-b','org-b','OWNER'],['role-viewer','org-a','VIEWER'],['role-catalog','org-a','LOGISTICS'],['role-worker','org-a','WORKER'],['role-lead','org-a','TEAM_LEAD'],['role-accounting','org-a','ACCOUNTING']])database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,code,stamp);
for(const [user,org,role,person] of [['owner-a','org-a','role-owner-a','1'],['owner-b','org-b','role-owner-b','9'],['viewer','org-a','role-viewer',null],['catalog','org-a','role-catalog',null],['worker','org-a','role-worker','2'],['lead','org-a','role-lead','3'],['accounting','org-a','role-accounting',null]])database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+user,org,user,role,'active',stamp,stamp,stamp,person);

database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-a',JSON.stringify(state),1,'owner-a',stamp,stamp);
database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-b',JSON.stringify({...state,company:{name:'Entreprise B',timeZone:'Europe/Brussels'},people:[{id:'9',name:'Owner B'}],teams:[],jobs:[{id:'pb',name:'Chantier B'}]}),1,'owner-b',stamp,stamp);
database.prepare('INSERT INTO field_data_imports(organization_id,imported_at) VALUES(?,?)').run('org-a',stamp);
database.prepare('INSERT INTO field_data_imports(organization_id,imported_at) VALUES(?,?)').run('org-b',stamp);

database.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at,barcode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('legacy-item','org-a','LEG','Article historique',5,0,'u',1234,0,'','','owner-a',stamp,'owner-a',stamp,'4006381333931');
database.prepare("INSERT INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at) VALUES('warehouse-a','org-a','Dépôt A','warehouse','active','owner-a',?,'owner-a',?)").run(stamp,stamp);
database.prepare("INSERT INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at) VALUES('org-a','legacy-item','warehouse-a',5,?)").run(stamp);

database.exec(readFileSync(new URL('../drizzle/0042_stock_barcodes.sql',import.meta.url),'utf8'));

let row=database.prepare("SELECT * FROM stock_item_barcodes WHERE organization_id='org-a' AND stock_item_id='legacy-item'").get();
assert.equal(row.raw_value,'4006381333931','raw historique conservé');
assert.equal(row.normalized_key,'gtin:04006381333931','EAN-13 backfill en GTIN-14');
assert.equal(row.gtin14,'04006381333931');
assert.equal(row.is_primary,1);
assert.equal(database.prepare("SELECT barcode FROM field_stock_items WHERE organization_id='org-a' AND id='legacy-item'").get().barcode,'4006381333931');

for(const [role,codes] of [
  ['role-viewer',['workspace.view','stock.view']],
  ['role-catalog',['workspace.view','stock.view','stock.items.manage','stock.move','stock.locations.manage']],
  ['role-worker',['workspace.view','projects.view.assigned','stock.consume.assigned']],
  ['role-lead',['workspace.view','projects.view.assigned','stock.consume.assigned']],
  ['role-accounting',['workspace.view','accounting.view']]
])for(const code of codes)database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(role,code);
for(const [user,project] of [['worker','p1'],['lead','p1']])database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org-a',user,project,'owner-a',stamp);

const env={DB:{prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},async batch(statements){database.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>{const result=database.prepare(statement._sql).run(...statement._values);return{meta:{changes:Number(result.changes)}}});database.exec('COMMIT');return results}catch(error){database.exec('ROLLBACK');throw error}}}};
const request=async(uid,method,path,payload,org='org-a')=>{const headers={'origin':'https://socle.test','x-socle-organization-id':org};if(uid)headers['oai-authenticated-user-id']=uid;if(payload!==undefined)headers['content-type']='application/json';const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);let body={};try{body=await response.json()}catch{}return{status:response.status,body}};
const countMoves=()=>Number(database.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id='org-a'").get().c);

let r=await request('catalog','POST','/api/stock-items',{reference:'B1',name:'Article barcode',unit:'u',quantity:5,locationId:'warehouse-a',minimum:0,supplier:'',supplierReference:'',barcode:'96385074',aliases:[],operationKey:'barcode-item-create'});
assert.equal(r.status,201,'article avec EAN-8 créé');
const itemId=r.body.id;
row=database.prepare('SELECT raw_value,normalized_key,gtin14,is_primary FROM stock_item_barcodes WHERE organization_id=? AND stock_item_id=?').get('org-a',itemId);
assert.equal(row.raw_value,'96385074');assert.equal(row.normalized_key,'gtin:00000096385074');assert.equal(row.gtin14,'00000096385074');assert.equal(row.is_primary,1);

r=await request('catalog','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes',{value:'ABC-001',symbology:'code_128'});
assert.equal(r.status,201,'Code 128 secondaire accepté');
r=await request('catalog','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes',{value:'036000291452',symbology:'upc_a'});
assert.equal(r.status,201,'UPC-A accepté');
r=await request('catalog','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes',{value:'10012345000017',symbology:'itf_14'});
assert.equal(r.status,201,'ITF-14 accepté');
r=await request('catalog','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes',{value:'ABC-001',symbology:'code_128'});
assert.equal(r.status,200);assert.equal(r.body.replayed,true,'même code + même article = no-op');
r=await request('catalog','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes',{value:'4006381333932',symbology:'ean_13'});
assert.equal(r.status,400,'check digit invalide refusé');

r=await request('catalog','POST','/api/stock-items',{reference:'B2',name:'Article conflit',unit:'u',quantity:0,minimum:0,supplier:'',supplierReference:'',barcode:'',aliases:[],operationKey:'barcode-item-2'});
const secondId=r.body.id;
r=await request('catalog','POST','/api/stock-items/'+encodeURIComponent(secondId)+'/barcodes',{value:'96385074',symbology:'ean_8'});
assert.equal(r.status,409,'même barcode autre article même tenant = conflit fort');

r=await request('owner-b','POST','/api/stock-items',{reference:'B',name:'Article B',unit:'u',quantity:0,minimum:0,supplier:'',supplierReference:'',barcode:'',aliases:[],operationKey:'org-b-item'},'org-b');
const itemB=r.body.id;
r=await request('owner-b','POST','/api/stock-items/'+encodeURIComponent(itemB)+'/barcodes',{value:'96385074',symbology:'ean_8'},'org-b');
assert.equal(r.status,201,'même barcode dans autre tenant accepté');

let before=countMoves();
r=await request('viewer','GET','/api/stock-items/by-barcode?value=96385074&symbology=ean_8');
assert.equal(r.status,200);assert.equal(r.body.item.id,itemId);assert.equal(r.body.item.name,'Article barcode');assert.equal('unitCost' in r.body.item,false,'coût masqué sans permission financière');assert.equal(countMoves(),before,'lookup global ne crée aucun mouvement');
r=await request('viewer','GET','/api/stock-items/by-barcode?value=036000291452&symbology=upc_a');assert.equal(r.status,200);assert.equal(r.body.barcode.gtin14,'00036000291452');
r=await request('viewer','GET','/api/stock-items/by-barcode?value=10012345000017&symbology=itf_14');assert.equal(r.status,200);
r=await request('viewer','GET','/api/stock-items/by-barcode?value=ABC-001&symbology=code_128');assert.equal(r.status,200);assert.equal(r.body.barcode.identifierKind,'private');
r=await request('accounting','GET','/api/stock-items/by-barcode?value=96385074');assert.equal(r.status,403,'ACCOUNTING sans stock.view refusé');
r=await request('catalog','GET','/api/stock-items/by-barcode?value=96385074');assert.equal(r.status,200);assert.equal('unitCost' in r.body.item,false,'catalog manager sans finance ne voit pas le coût');
r=await request('owner-a','GET','/api/stock-items/by-barcode?value=96385074');assert.equal(r.status,200);assert.equal(r.body.item.unitCost,0,'OWNER reçoit le coût');
r=await request('viewer','GET','/api/stock-items/by-barcode?value=4006381333931',undefined,'org-b');assert.equal(r.status,403,'membership forgé tenant B refusé');

r=await request('catalog','GET','/api/stock-items/missing/barcodes');assert.equal(r.status,404,'article forgé refusé');
r=await request('viewer','GET','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes');assert.equal(r.status,403,'stock.view seul ne gère pas les barcodes');

r=await request('catalog','GET','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes');assert.equal(r.status,200);assert.equal(r.body.barcodes.filter(x=>x.status==='active').length,4,'plusieurs codes actifs pour un article');
const code128=r.body.barcodes.find(x=>x.rawValue==='ABC-001');
r=await request('catalog','PATCH','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes/'+encodeURIComponent(code128.id),{status:'active',isPrimary:true});
assert.equal(r.status,200);assert.equal(database.prepare('SELECT barcode FROM field_stock_items WHERE organization_id=? AND id=?').get('org-a',itemId).barcode,'ABC-001','champ historique = projection du principal');
r=await request('catalog','PATCH','/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes/'+encodeURIComponent(code128.id),{status:'inactive',isPrimary:false});
assert.equal(r.status,200);assert.notEqual(database.prepare('SELECT barcode FROM field_stock_items WHERE organization_id=? AND id=?').get('org-a',itemId).barcode,'ABC-001','désactivation promeut un autre code');
assert.ok(database.prepare("SELECT 1 ok FROM audit_logs WHERE organization_id='org-a' AND action='stock_barcode.updated' LIMIT 1").get()?.ok,'gestion barcode auditée');

before=countMoves();
r=await request('worker','GET','/api/stock-items/by-barcode?value=96385074');assert.equal(r.status,403,'WORKER ne gagne pas stock.view');
r=await request('worker','GET','/api/projects/p1/stock-consume/barcode?value=96385074');assert.equal(r.status,403,'WORKER non affecté refusé');
database.prepare('INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at,start_time,end_time,assignment_type,status,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('assign','org-a',today,'10','p1',JSON.stringify(['2','3']),null,null,'','owner-a',stamp,'owner-a',stamp,'07:00','16:00','team','planned','');
r=await request('worker','GET','/api/projects/p1/stock-consume/barcode?value=96385074');
assert.equal(r.status,200,'WORKER affecté peut identifier par barcode terrain');assert.equal('unitCost' in r.body.item,false);assert.ok(r.body.item.balances.every(x=>x.location.type==='warehouse'),'lookup terrain ne retourne que les entrepôts');assert.equal(countMoves(),before,'simple lookup terrain sans mouvement');
r=await request('worker','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/movements',{type:'sortie chantier',quantity:1,date:today,projectId:'p1',sourceLocationId:'warehouse-a',reason:'interdit',operationKey:'generic-worker'});assert.equal(r.status,403,'absence stock.move toujours respectée');
r=await request('worker','POST','/api/projects/p1/stock-consume',{stockItemId:itemId,sourceLocationId:'warehouse-a',quantity:1,note:'Scan terrain',operationKey:'barcode-consume-1'});assert.equal(r.status,201,'scan peut enchaîner vers moteur terrain existant');
assert.equal(database.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id='org-a' AND idempotency_key='barcode-consume-1'").get().c,1,'exactement un mouvement via stockConsumeRoute');
r=await request('worker','GET','/api/projects/p2/stock-consume/barcode?value=96385074');assert.equal(r.status,403,'autre chantier refusé');
r=await request('lead','GET','/api/projects/p1/stock-consume/barcode?value=96385074');assert.equal(r.status,200,'TEAM_LEAD réellement affecté autorisé');

r=await request('owner-b','GET','/api/stock-items/by-barcode?value=4006381333931',undefined,'org-b');assert.equal(r.status,404,'barcode A absent de B reste inconnu sans fuite');
r=await request('owner-b','GET','/api/stock-items/by-barcode?value=96385074',undefined,'org-b');assert.equal(r.status,200);assert.equal(r.body.item.id,itemB,'même code résout l’article du tenant actif uniquement');

r=await request('catalog','PATCH','/api/stock-items/'+encodeURIComponent(itemId),{barcode:'05412345678908'});
assert.equal(r.status,200,'ancien champ catalogue reste compatible');
assert.equal(database.prepare("SELECT COUNT(*) c FROM stock_item_barcodes WHERE organization_id='org-a' AND stock_item_id=? AND status='active'").get(itemId).c,4,'nouveau principal ajouté sans casser les identifiants existants');
assert.equal(database.prepare('SELECT barcode FROM field_stock_items WHERE organization_id=? AND id=?').get('org-a',itemId).barcode,'05412345678908');
assert.equal(database.prepare("SELECT COUNT(*) c FROM field_stock_movements WHERE organization_id='org-a' AND stock_item_id=? AND quantity<0").get(itemId).c,0,'aucun mouvement négatif créé');

console.log('stock-barcode-01: backfill, GTIN, 1→N, lookup global/terrain, RBAC, multi-org et moteur Stock préservés');
