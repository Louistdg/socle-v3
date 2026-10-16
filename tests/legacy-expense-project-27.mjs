import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url))
  .filter(name=>/^\d+.*\.sql$/.test(name)).sort();
assert.ok(migrations.includes('0027_legacy_expense_project.sql'),'migration 0027 présente');

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'base neuve sans violation FK');

const stamp='2026-09-29T10:00:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','Owner','SOCLE',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Owner',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org','owner','role-owner','active',stamp,stamp,stamp);

const state={version:3,company:{name:'BatiNova'},people:[],teams:[],jobs:[{id:'legacy-1',name:'Legacy 1',reference:'LEG-1'}],assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[],purchaseOrders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);
db.prepare('INSERT INTO projects(id,organization_id,customer_id,name,reference,status,country,quoted_amount_cents,estimated_cost_cents,actual_cost_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('rel-1','org',null,'Relationnel 1','REL-1','active','BE',0,0,0,stamp,stamp);

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};

async function post(payload){
  const response=await worker.fetch(new Request('https://socle.test/api/expenses',{method:'POST',headers:{
    'oai-authenticated-user-id':'owner','x-socle-organization-id':'org','origin':'https://socle.test','content-type':'application/json'
  },body:JSON.stringify(payload)}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}
const base={category:'materials',description:'Facture test',expenseDate:'2026-09-29',total:121,vatAmount:21,paymentStatus:'unpaid',supplierReference:'TEST',documentName:'',purchaseOrderId:null,deliveryNoteId:null};

let result=await post({...base,projectId:'legacy-1',operationKey:'expense-legacy-0001'});
assert.equal(result.status,201,'création dépense legacy');
let row=db.prepare('SELECT project_id,legacy_project_id FROM expenses WHERE id=?').get(result.body.id);
assert.equal(row.project_id,null,'legacy ne pollue pas la FK relationnelle');
assert.equal(row.legacy_project_id,'legacy-1','legacy conservé explicitement');

result=await post({...base,projectId:'rel-1',description:'Facture relationnelle',operationKey:'expense-rel-0001'});
assert.equal(result.status,201,'création dépense relationnelle');
row=db.prepare('SELECT project_id,legacy_project_id FROM expenses WHERE id=?').get(result.body.id);
assert.equal(row.project_id,'rel-1','relationnel conserve la FK');
assert.equal(row.legacy_project_id,null,'relationnel ne crée pas de pseudo legacy');

const listResponse=await worker.fetch(new Request('https://socle.test/api/expenses',{headers:{
  'oai-authenticated-user-id':'owner','x-socle-organization-id':'org'
}}),env);
assert.equal(listResponse.status,200,'lecture dépenses');
const list=await listResponse.json();
const legacy=list.expenses.find(item=>item.id===db.prepare("SELECT id FROM expenses WHERE legacy_project_id='legacy-1'").get().id);
const relational=list.expenses.find(item=>item.id===db.prepare("SELECT id FROM expenses WHERE project_id='rel-1'").get().id);
assert.equal(String(legacy.project_id),'legacy-1','API expose le projet effectif legacy');
assert.equal(String(relational.project_id),'rel-1','API expose le projet effectif relationnel');
assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'aucune violation FK après les deux créations');

console.log('legacy-expense-project-27: 12 assertions réussies');
