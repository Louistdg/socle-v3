import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

const stamp='2026-10-03T22:30:00.000Z',org='org-quote-privacy';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,'Quote Privacy','Quote Privacy','BE','EUR',stamp,stamp);
for(const [id,first,last] of [['owner','Marc','Owner'],['worker','Anthony','Worker'],['accounting','Sophie','Accounting']]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,last,id+'@example.test',stamp,stamp);
}
for(const [id,code,name] of [['role-owner','OWNER','Propriétaire'],['role-worker','WORKER','Ouvrier'],['role-accounting','ACCOUNTING','Comptable']]){
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,org,code,name,stamp);
}
for(const [user,role,person] of [['owner','role-owner','person-owner'],['worker','role-worker','person-worker'],['accounting','role-accounting','person-accounting']]){
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,person_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+user,org,user,person,role,'active',stamp,stamp,stamp);
}
for(const permission of ['workspace.view','projects.view.assigned','quotes.view','quotes.prices.view']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker',permission);
}
for(const permission of ['accounting.view','financial.dashboard.view','quotes.view','quotes.prices.view']){
  db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-accounting',permission);
}
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,'worker','p1','owner',stamp);

const state={
  version:3,
  company:{name:'Quote Privacy'},
  people:[{id:'person-owner',name:'Marc Owner'},{id:'person-worker',name:'Anthony Worker'},{id:'person-accounting',name:'Sophie Accounting'}],
  teams:[],
  jobs:[{id:'p1',reference:'CH-1',name:'Chantier 1'}],
  assignments:[],
  quotes:[{id:'legacy-q1',job:'p1',ref:'DEV-LEGACY-1',title:'Legacy',amount:12500,total:13250,lines:[{label:'Ardoises',qty:100,unit:'m²',price:125,vat:6}]}],
  assets:[],tasks:[],dossiers:[],reminders:[],
  priceCatalog:[{id:'pc-1',name:'Ardoise',price:125,purchasePrice:80}]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,'owner',stamp,stamp);
db.prepare("INSERT INTO quotes_server(id,organization_id,project_id,reference,status,title,client_name,client_address,issue_date,valid_until,deposit_percent,payment_terms,notes,exclusions,lines_json,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .run('q1',org,'p1','DEV-1','draft','Toiture','Client','','2026-10-01','2026-11-01',20,'','','',JSON.stringify([{label:'Ardoises',qty:100,unit:'m²',price:125,vat:6}]),'owner',stamp,stamp);

async function call(uid,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':org,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let result=await call('worker','GET','/api/state');
assert.equal(result.status,200);
assert.equal(result.body.state.quotes[0].lines[0].price,undefined,'WORKER legacy state masque le prix même si quotes.prices.view existe');
assert.equal(result.body.state.quotes[0].amount,undefined,'WORKER legacy state masque le montant');
assert.equal(result.body.state.priceCatalog,undefined,'WORKER ne reçoit pas le catalogue tarifaire');

result=await call('worker','GET','/api/quotes');
assert.equal(result.status,200);
assert.equal(result.body.quotes.length,1);
assert.equal(result.body.quotes[0].lines[0].price,undefined,'WORKER API devis masque le prix même si quotes.prices.view existe');

result=await call('worker','GET','/api/projects/p1/field-portal');
assert.equal(result.status,200);
assert.equal(result.body.capabilities.viewQuotePrices,false,'Le portail terrain annonce correctement que les prix sont interdits au WORKER');
assert.equal(result.body.quotes[0].lines[0].price,undefined,'Le portail terrain masque les prix du WORKER');

result=await call('accounting','GET','/api/quotes');
assert.equal(result.status,200);
assert.equal(result.body.quotes[0].lines[0].price,125,'ACCOUNTING conserve le droit prix');

result=await call('owner','GET','/api/quotes');
assert.equal(result.status,200);
assert.equal(result.body.quotes[0].lines[0].price,125,'OWNER conserve le droit prix');

const modules={};for(const key of ['planning','personal','jobs','messages','people','quotes','gallery','fleet','accounting','actions','documents','company','permissions'])modules[key]={view:false,add:false,edit:false};
modules.personal.view=true;modules.jobs.view=true;modules.quotes.view=true;
const payload={
  profileName:'Ouvrier',
  scope:'Ses chantiers uniquement',
  modules,
  sensitive:{quotePrices:true,jobMargins:false,payroll:false,privateDocuments:false,manageAccess:false,paySlips:false},
  fieldActions:{},
  projectIds:['p1']
};
result=await call('owner','PUT','/api/access-control/worker',payload);
assert.equal(result.status,200);
const personalized=result.body.members.find(member=>member.userId==='worker');
assert.ok(personalized.roleCode.startsWith('USER_'),'Le WORKER personnalisé reçoit son rôle isolé');
assert.equal(personalized.permissions.includes('quotes.prices.view'),false,'Le scope ouvrier ne peut pas matérialiser quotes.prices.view');
assert.equal(personalized.permissions.includes('ui.sensitive.quotePrices'),false,'Le réglage UI prix ne reste pas activé sur un scope ouvrier');

result=await call('worker','GET','/api/state');
assert.equal(result.status,200);
assert.equal(result.body.state.quotes[0].lines[0].price,undefined,'WORKER personnalisé reste sans prix');
assert.equal(result.body.state.priceCatalog,undefined,'WORKER personnalisé reste sans catalogue tarifaire');

console.log('worker-quote-price-privacy-123: PASS');
