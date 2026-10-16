import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
const stamp='2026-09-30T12:00:00.000Z';
const state={version:3,company:{name:'BatiNova',bankAccount:'BE00-SECRET'},people:[{id:'p1',name:'Employé Secret',employment:{grossHourly:99}}],teams:[{id:'t1',name:'Equipe'}],jobs:[{id:'j1',reference:'CH-SECRET',name:'Chantier secret',finance:{margin:999}}],assignments:[{id:'a1',job:'j1'}],quotes:[{id:'q1',job:'j1',total:9999}],assets:[{id:'asset1',name:'Camion'}],tasks:[{id:'task1'}],dossiers:[{id:'d1'}],reminders:[{id:'r1'}],newsItems:[{id:'n1',title:'Interne'}],accountingData:{customerInvoices:[{id:'inv1',ref:'FAC-1',amount:121}],bankTransactions:[{id:'bank1',amount:999}],openingPosition:5000,payments:[{id:'pay1'}]},recurringCharges:[{id:'charge1',amount:10}]};
for(const [id,first,last,email] of [['owner','Marc','Owner','owner@example.test'],['accounting','Alice','Comptable','accounting@example.test'],['blocked','Bob','Blocked','blocked@example.test']])db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,first,last,email,stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [id,code,name] of [['role-owner','OWNER','Owner'],['role-accounting','ACCOUNTING','Comptable'],['role-blocked','LIMITED','Limited']])db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,'org',code,name,stamp);
for(const [user,role] of [['owner','role-owner'],['accounting','role-accounting'],['blocked','role-blocked']])db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+user,'org',user,role,'active',stamp,stamp,stamp);
for(const permission of ['financial.dashboard.view','accounting.view','invoices.view'])db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-accounting',permission);
db.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,stamp);
const req=async(uid,method='GET',path='/api/state',payload)=>{const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test'};if(payload!==undefined)headers['content-type']='application/json';const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);let body={};try{body=await response.json()}catch{}return{status:response.status,body}};
let n=0;const eq=(a,b,m)=>{assert.equal(a,b,m);n++},deep=(a,b,m)=>{assert.deepEqual(a,b,m);n++},ok=(v,m)=>{assert.ok(v,m);n++};

let r=await req('accounting');eq(r.status,200,'ACCOUNTING peut ouvrir un workspace finance-only sans workspace.view');eq(r.body.role,'ACCOUNTING');eq(r.body.access.roleCode,'ACCOUNTING');ok(r.body.access.permissions.includes('accounting.view'),'permission accounting conservée');ok(!r.body.access.permissions.includes('workspace.view'),'aucun workspace.view ajouté');
deep(r.body.state.people,[],'aucune donnée RH legacy');deep(r.body.state.teams,[],'aucune équipe legacy');deep(r.body.state.jobs,[],'aucun chantier legacy');deep(r.body.state.assignments,[],'aucune affectation legacy');deep(r.body.state.quotes,[],'aucun devis legacy');deep(r.body.state.assets,[],'aucun asset legacy');eq(r.body.state.newsItems,undefined,'aucune actualité legacy');
eq(r.body.state.accountingData.customerInvoices[0].ref,'FAC-1','données comptables autorisées');eq(r.body.state.accountingData.bankTransactions,undefined,'banque masquée sans bank.view');eq(r.body.state.accountingData.openingPosition,undefined,'position bancaire masquée');eq(r.body.state.accountingData.payments,undefined,'paiements legacy bancaires masqués');
r=await req('accounting','PUT','/api/state',{revision:1,state});eq(r.status,403,'écriture globale reste OWNER-only');
r=await req('blocked');eq(r.status,403,'profil sans workspace.view ni accounting.view reste refusé');
console.log(`accounting-workspace-73: ${n} assertions réussies`);
