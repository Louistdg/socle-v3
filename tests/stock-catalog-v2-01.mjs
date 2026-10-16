import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){database.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>{const result=database.prepare(statement._sql).run(...statement._values);return{meta:{changes:Number(result.changes)}}});database.exec('COMMIT');return results}catch(error){database.exec('ROLLBACK');throw error}}
}};

const stamp='2026-10-06T14:00:00.000Z';
const emptyState={version:3,company:{name:'Fixture'},people:[],teams:[],jobs:[],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],stockItems:[],purchaseOrders:[],deliveryNotes:[]};

function addOrg(id,name){
  database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
}
function addUser({id,org,role,permissions=[]}){
  database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,id,'Test',stamp,stamp);
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+id,org,role,role,stamp);
  database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+id,org,id,'role-'+id,'active',stamp,stamp,stamp);
  for(const permission of permissions)database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+id,permission);
}
function addWorkspace(org,user,name){
  database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify({...emptyState,company:{name}}),1,user,stamp,stamp);
}

addOrg('org-a','Entreprise A');addOrg('org-b','Entreprise B');
addUser({id:'owner-a',org:'org-a',role:'OWNER'});
addUser({id:'catalog-a',org:'org-a',role:'LOGISTICS',permissions:['workspace.view','stock.view','stock.items.manage','stock.categories.manage','stock.locations.manage','stock.move']});
addUser({id:'viewer-a',org:'org-a',role:'VIEWER',permissions:['workspace.view','stock.view']});
addUser({id:'worker-a',org:'org-a',role:'WORKER',permissions:['workspace.view','stock.consume.assigned']});
addUser({id:'owner-b',org:'org-b',role:'OWNER'});
addWorkspace('org-a','owner-a','Entreprise A');addWorkspace('org-b','owner-b','Entreprise B');

const request=async(uid,method,path,payload,org='org-a')=>{
  const headers={'origin':'https://socle.test','x-socle-organization-id':org};
  if(uid)headers['oai-authenticated-user-id']=uid;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body=null;try{body=await response.json()}catch{}
  return{status:response.status,body};
};

let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};

// Permission model: WORKER is not promoted to catalogue management.
let r=await request('worker-a','GET','/api/stock-catalog');
eq(r.status,403,'WORKER sans stock.view ne reçoit pas le catalogue global');
r=await request('viewer-a','GET','/api/stock-catalog');
eq(r.status,200,'lecteur stock peut consulter le catalogue');
eq(r.body.capabilities.manageItems,false,'lecteur ne peut pas modifier les articles');
eq(r.body.capabilities.manageCategories,false,'lecteur ne peut pas gérer les catégories');
eq(r.body.capabilities.viewCosts,false,'lecteur sans droit financier ne voit pas les coûts via le catalogue');

// Catégories tenant-scoped, deux niveaux maximum.
r=await request('catalog-a','POST','/api/stock-catalog/categories',{name:'Isolation',parentId:null,sortOrder:10});
eq(r.status,201,'création catégorie');
const isolationId=r.body.id;
r=await request('catalog-a','POST','/api/stock-catalog/categories',{name:'Panneaux isolants',parentId:isolationId,sortOrder:10});
eq(r.status,201,'création sous-catégorie');
const panelsId=r.body.id;
r=await request('catalog-a','POST','/api/stock-catalog/categories',{name:'Niveau interdit',parentId:panelsId,sortOrder:1});
eq(r.status,404,'troisième niveau refusé');
r=await request('owner-b','POST','/api/stock-catalog/categories',{name:'Isolation',parentId:null,sortOrder:1},'org-b');
eq(r.status,201,'même nom autorisé dans un autre tenant');
const otherIsolationId=r.body.id;

// Article sans référence, classification, alias et référence fournisseur.
r=await request('catalog-a','POST','/api/stock-items',{
  reference:'',
  name:'Panneau PIR 140 mm — 1200 × 600',
  categoryId:isolationId,
  subcategoryId:panelsId,
  unit:'panneau',
  quantity:0,
  locationId:null,
  minimum:10,
  supplier:'Négoce A',
  supplierReference:'SUP-PIR-140',
  barcode:'5410000123456',
  aliases:['PIR 140','isolant 140'],
  operationKey:'catalog-create-001'
});
eq(r.status,201,'article sans référence accepté');
const itemId=r.body.id;
let row=database.prepare('SELECT * FROM field_stock_items WHERE organization_id=? AND id=?').get('org-a',itemId);
eq(row.reference,'','référence reste facultative');
eq(row.category_id,isolationId,'catégorie persistée');
eq(row.subcategory_id,panelsId,'sous-catégorie persistée');
eq(row.supplier_reference,'SUP-PIR-140','référence fournisseur persistée');
eq(row.barcode,'5410000123456','code-barres persisté');
assert.deepEqual(JSON.parse(row.aliases_json),['PIR 140','isolant 140']);assertions++;

// Le même article canonique conserve un seul ID malgré le multi-emplacement.
r=await request('owner-a','POST','/api/stock-locations',{name:'Dépôt principal',type:'warehouse'});
eq(r.status,201,'emplacement dépôt');
const depotId=r.body.id;
r=await request('owner-a','POST','/api/stock-locations',{name:'Crafter 1',type:'vehicle'});
eq(r.status,201,'emplacement véhicule');
r=await request('owner-a','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/movements',{type:'entrée',quantity:20,date:'2026-10-06',destinationLocationId:depotId,reason:'Stock initial catalogue',operationKey:'catalog-move-001'});
eq(r.status,201,'entrée dépôt');
r=await request('owner-a','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/movements',{type:'transfert',quantity:8,date:'2026-10-06',sourceLocationId:depotId,destinationLocationId:depotId,reason:'Même emplacement',operationKey:'catalog-move-invalid'});
eq(r.status,400,'même source/destination refusée');
r=await request('owner-a','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/movements',{type:'transfert',quantity:8,date:'2026-10-06',sourceLocationId:depotId,destinationLocationId:'missing',reason:'Vers camion absent',operationKey:'catalog-move-002'});
eq(r.status,404,'emplacement inexistant refusé');
r=await request('owner-a','POST','/api/stock-items/'+encodeURIComponent(itemId)+'/movements',{type:'transfert',quantity:8,date:'2026-10-06',sourceLocationId:depotId,destinationLocationId:database.prepare("SELECT id FROM stock_locations WHERE organization_id='org-a' AND name='Crafter 1'").get().id,reason:'Répartition camion',operationKey:'catalog-move-003'});
eq(r.status,201,'transfert multi-emplacement préservé');
eq(database.prepare('SELECT COUNT(*) c FROM field_stock_items WHERE organization_id=? AND id=?').get('org-a',itemId).c,1,'un seul article canonique');
eq(database.prepare('SELECT COUNT(*) c FROM stock_balances WHERE organization_id=? AND stock_item_id=? AND quantity>0').get('org-a',itemId).c,2,'deux emplacements sur le même article');

// Cross-tenant category assignment and item access remain impossible.
r=await request('catalog-a','PATCH','/api/stock-items/'+encodeURIComponent(itemId),{categoryId:otherIsolationId,subcategoryId:null});
eq(r.status,404,'catégorie autre tenant refusée');
r=await request('owner-b','PATCH','/api/stock-items/'+encodeURIComponent(itemId),{name:'Intrusion'},'org-b');
eq(r.status,404,'article autre tenant introuvable');

// Cost/value remains permission protected.
r=await request('catalog-a','PATCH','/api/stock-items/'+encodeURIComponent(itemId),{unitCost:99});
eq(r.status,403,'gestionnaire catalogue sans finance ne peut pas écrire le coût');
r=await request('owner-a','PATCH','/api/stock-items/'+encodeURIComponent(itemId),{unitCost:42.5,reference:'',name:'Panneau PIR 140 mm — 1200 × 600',unit:'panneau',minimum:10,supplier:'Négoce A',categoryId:isolationId,subcategoryId:panelsId,supplierReference:'SUP-PIR-140',barcode:'5410000123456',aliases:['PIR 140','isolant 140']});
eq(r.status,200,'OWNER peut mettre le coût à jour');
eq(database.prepare('SELECT unit_cost_cents FROM field_stock_items WHERE organization_id=? AND id=?').get('org-a',itemId).unit_cost_cents,4250,'coût historique reste en centimes');
r=await request('owner-a','POST','/api/stock-items',{reference:'',name:'Doublon code-barres',unit:'pièce',quantity:0,minimum:0,supplier:'',supplierReference:'',barcode:'5410000123456',aliases:[],operationKey:'catalog-barcode-duplicate'});eq(r.status,409,'code-barres déjà utilisé refusé dans le même tenant');

// Field-data keeps financial redaction and all movement balances.
r=await request('viewer-a','GET','/api/field-data');
eq(r.status,200,'lecteur stock reçoit field-data');
const viewed=r.body.stockItems.find(item=>item.id===itemId);
ok(viewed,'article visible');
eq(Object.prototype.hasOwnProperty.call(viewed,'unitCost'),false,'coût masqué au lecteur');
eq(viewed.quantity,20,'quantité totale inchangée après transfert');
eq(viewed.balances.reduce((sum,balance)=>sum+Number(balance.quantity),0),20,'total = somme emplacements');

// Catalogue endpoint returns metadata without leaking cost.
r=await request('viewer-a','GET','/api/stock-catalog');
eq(r.status,200);
const meta=r.body.items.find(item=>item.id===itemId);
ok(meta,'métadonnées catalogue visibles');
eq(meta.categoryId,isolationId);
eq(meta.subcategoryId,panelsId);
eq(meta.supplierReference,'SUP-PIR-140');
eq(meta.barcode,'5410000123456');
assert.deepEqual(meta.aliases,['PIR 140','isolant 140']);assertions++;
eq(Object.prototype.hasOwnProperty.call(meta,'unitCost'),false,'catalogue metadata ne transporte jamais le coût');

// Existing uncategorized items continue to work.
database.prepare('INSERT INTO field_stock_items(id,organization_id,reference,name,quantity,reserved,unit,unit_cost_cents,minimum,supplier,location,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .run('legacy-item','org-a','LEG','Article historique',0,0,'pièce',100,0,'','','owner-a',stamp,'owner-a',stamp);
r=await request('viewer-a','GET','/api/stock-catalog');
eq(r.status,200);
const legacy=r.body.items.find(item=>item.id==='legacy-item');
ok(legacy,'article historique présent');
eq(legacy.categoryId,null,'article historique reste non classé');
eq(legacy.subcategoryId,null,'aucune sous-catégorie inventée');

// Categories can be deactivated only coherently.
r=await request('catalog-a','PATCH','/api/stock-catalog/categories/'+encodeURIComponent(isolationId),{status:'inactive'});
eq(r.status,409,'catégorie parente avec sous-catégorie active ne peut pas être désactivée');
r=await request('catalog-a','PATCH','/api/stock-catalog/categories/'+encodeURIComponent(panelsId),{status:'inactive'});
eq(r.status,200,'sous-catégorie désactivable');
r=await request('catalog-a','PATCH','/api/stock-catalog/categories/'+encodeURIComponent(isolationId),{status:'inactive'});
eq(r.status,200,'catégorie désactivable après ses enfants');

// Purchases/delivery schema still references the same stock item engine.
ok(database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='field_delivery_lines'").get(),'table réception conservée');
ok(database.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='stock_movement_apply_after_insert'").get(),'trigger mouvements stock conservé');

console.log('stock-catalog-v2-01: '+assertions+' assertions réussies');
