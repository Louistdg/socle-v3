import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
import {runClientFinanceStoriesPack} from '../scripts/simulation/batinova-xl/client-finance-stories-pack.mjs';

const scenarios=JSON.parse(readFileSync(new URL('../scripts/simulation/batinova-xl/project-scenarios-2026-09-29.json',import.meta.url),'utf8'));
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const deep=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};

const org='org-local-owner',owner='owner-finance',stamp='2026-08-17T05:30:00.000Z';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,'BatiNova','BatiNova','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(owner,'Marc','Finance',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner-finance',org,'OWNER','Owner',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner-finance',org,owner,'role-owner-finance','active',stamp,stamp,stamp);

const jobs=scenarios.projects.map((p,i)=>({
  id:'BATXL-PRJ-'+String(2000+i).padStart(5,'0'),
  sourceScenarioId:p.id,
  name:p.name,
  reference:'BATXL-'+String(i+1).padStart(3,'0'),
  financialStory:p.financialStory,
  vatProfile:p.vatProfile,
  progress:p.status==='completed'?100:p.status==='planned'?0:55,
  status:p.status
}));
const quotes=jobs.map((job,i)=>({
  id:'BATXL-Q-'+String(i+1).padStart(3,'0'),
  ref:'DEV-BATXL-'+String(i+1).padStart(3,'0'),
  job:job.id,
  status:'accepté',
  lines:[{label:'Marché accepté',qty:1000+i*10,price:i===13?550:25}]
}));
const state={version:3,company:{name:'BatiNova',simulationMode:true,testCompany:true},people:[],teams:[],jobs,assignments:[],quotes,contacts:[],assets:[],tasks:[],dossiers:[],reminders:[]};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,owner,stamp,stamp);

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
async function call(method,path,payload){
  const headers={'oai-authenticated-user-id':owner,'x-socle-organization-id':org,'origin':'https://socle.test'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

const quoteContractCents=projectId=>{
  const q=quotes.find(item=>String(item.job)===String(projectId));
  return Math.round(q.lines.reduce((sum,line)=>sum+Number(line.qty||0)*Number(line.price||0),0)*100);
};
const projectIdForSource=sourceId=>jobs.find(job=>job.sourceScenarioId===sourceId)?.id;
const invoiceRows=projectId=>db.prepare("SELECT * FROM invoices WHERE organization_id=? AND legacy_project_id=? AND invoice_number LIKE 'FAC-BATXL-%' ORDER BY invoice_number").all(org,projectId);
const paymentSum=invoiceId=>Number(db.prepare('SELECT COALESCE(SUM(amount_cents),0) s FROM payments WHERE organization_id=? AND invoice_id=?').get(org,invoiceId)?.s||0);
const creditSum=invoiceId=>Number(db.prepare('SELECT COALESCE(SUM(amount_cents),0) s FROM credit_notes WHERE organization_id=? AND invoice_id=?').get(org,invoiceId)?.s||0);

const script3Source=readFileSync(new URL('../scripts/simulation/batinova-xl/batinova-script3.mjs',import.meta.url),'utf8');
eq((script3Source.match(/client-finance-stories-pack\.mjs/g)||[]).length,1,'Script3 exécute une seule fois le Finance owner stories');
eq((script3Source.match(/client-finance-pack\.mjs/g)||[]).length,0,'Script3 n exécute plus le générateur Finance legacy');

const first=runClientFinanceStoriesPack({database:db,organizationId:org});
eq(first.invoices,25,'25 factures serveur');
eq(first.payments,17,'17 paiements déterministes');
eq(first.credits,1,'1 avoir canonique');
eq(first.created.invoices,25,'premier passage crée les 25 factures');
eq(first.created.payments,17,'premier passage crée les paiements');
eq(first.created.credits,1,'premier passage crée l avoir');

eq(invoiceRows(projectIdForSource('BATXL-PRJ-009')).length,0,'PRJ-009 reste sans facture');
const p14=invoiceRows(projectIdForSource('BATXL-PRJ-014'));
eq(p14.length,4,'PRJ-014 a quatre situations');
const p14Contract=quoteContractCents(projectIdForSource('BATXL-PRJ-014'));
deep(p14.map(row=>Number(row.subtotal_cents)),[10,15,20,20].map(p=>Math.round(p14Contract*p/100)),'PRJ-014 respecte 10/15/20/20%');
deep(p14.map(row=>row.invoice_type),['progress','progress','progress','progress'],'PRJ-014 utilise quatre situations');

const p5=invoiceRows(projectIdForSource('BATXL-PRJ-005'));
eq(p5.length,1,'PRJ-005 a une facture acompte');
eq(p5[0].invoice_type,'deposit','PRJ-005 type acompte');
eq(p5[0].status,'paid','PRJ-005 acompte payé');
eq(paymentSum(p5[0].id),Number(p5[0].total_cents),'PRJ-005 acompte réglé intégralement');

const p7=invoiceRows(projectIdForSource('BATXL-PRJ-007'));
eq(p7.length,2,'PRJ-007 a deux situations');
const p7Credit=creditSum(p7[0].id);
eq(p7Credit,Math.round(Number(p7[0].total_cents)*0.03),'PRJ-007 avoir = 3% TTC de la situation 1');
eq(Number(db.prepare('SELECT COUNT(*) c FROM credit_notes WHERE organization_id=? AND invoice_id=?').get(org,p7[0].id).c),1,'PRJ-007 a un seul avoir');

ok(Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND status='paid'").get(org).c)>=10,'cas payés présents');
ok(Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND status='partially_paid'").get(org).c)>=3,'cas partiellement payés présents');
ok(Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND status='unpaid'").get(org).c)>=5,'cas impayés présents');

eq(Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND notes LIKE '%simulation-only%'").get(org).c),25,'toutes les factures marquées simulation-only');
eq(Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND issue_date<'2026-09-01'").get(org).c),5,'5 factures constituent l historique/ouverture au 01/09');
eq(Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND issue_date>='2026-09-01' AND issue_date<='2026-09-30'").get(org).c),20,'20 factures sont des mouvements de septembre');
eq(Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND issue_date>'2026-09-30'").get(org).c),0,'aucune facture après la clôture 30/09');
eq(Number(db.prepare("SELECT COUNT(*) c FROM payments WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-PAY-%' AND payment_date>'2026-09-30'").get(org).c),0,'aucun paiement simulé après le 30/09');
eq(Number(db.prepare("SELECT COUNT(*) c FROM credit_notes WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-CREDIT-%' AND credit_date>'2026-09-30'").get(org).c),0,'aucun avoir simulé après le 30/09');
for(const row of db.prepare("SELECT legacy_project_id FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%'").all(org))ok(/^BATXL-PRJ-020(?:0[0-9]|1[0-4])$/.test(String(row.legacy_project_id)),'facture rattachée à un chantier canonique');
eq(Number(db.prepare("SELECT COUNT(*) c FROM payments WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-PAY-%' AND note LIKE '%simulation BATXL%'").get(org).c),17,'tous les paiements marqués simulation');
eq(Number(db.prepare("SELECT COUNT(*) c FROM credit_notes WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-CREDIT-%' AND note LIKE '%Simulation BATXL%'").get(org).c),1,'avoir marqué simulation');

for(const sourceId of ['BATXL-PRJ-002','BATXL-PRJ-005','BATXL-PRJ-007','BATXL-PRJ-014']){
  const projectId=projectIdForSource(sourceId);
  const rows=invoiceRows(projectId);
  const expectedInvoiced=rows.reduce((sum,row)=>sum+Number(row.subtotal_cents),0);
  const expectedCollected=rows.reduce((sum,row)=>sum+paymentSum(row.id),0);
  const expectedOutstanding=rows.reduce((sum,row)=>sum+Math.max(0,Number(row.total_cents)-creditSum(row.id)-paymentSum(row.id)),0);
  const forecast=await call('GET','/api/projects/'+encodeURIComponent(projectId)+'/financial-forecast');
  eq(forecast.status,200,projectId+' forecast lisible');
  eq(forecast.body.realized.invoicedHtCents,expectedInvoiced,projectId+' forecast reprend le HT facturé');
  eq(forecast.body.realized.collectedTtcCents,expectedCollected,projectId+' forecast reprend les paiements TTC');
  eq(forecast.body.realized.clientOutstandingTtcCents,expectedOutstanding,projectId+' forecast reprend le solde client net des avoirs');
}

const fingerprintBefore=first.fingerprint;
const countsBefore={
  invoices:Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%'").get(org).c),
  payments:Number(db.prepare("SELECT COUNT(*) c FROM payments WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-PAY-%'").get(org).c),
  credits:Number(db.prepare("SELECT COUNT(*) c FROM credit_notes WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-CREDIT-%'").get(org).c)
};
const second=runClientFinanceStoriesPack({database:db,organizationId:org});
eq(second.fingerprint,fingerprintBefore,'replay x2 fingerprint stable');
deep(second.created,{invoices:0,payments:0,credits:0},'replay x2 ne crée aucun doublon');
deep({
  invoices:Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%'").get(org).c),
  payments:Number(db.prepare("SELECT COUNT(*) c FROM payments WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-PAY-%'").get(org).c),
  credits:Number(db.prepare("SELECT COUNT(*) c FROM credit_notes WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-CREDIT-%'").get(org).c)
},countsBefore,'compteurs stables au replay');

eq(db.prepare('PRAGMA foreign_key_check').all().length,0,'aucune violation FK');
eq(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','intégrité SQLite valide');
eq(Number(db.prepare('SELECT COUNT(*) c FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=?').get(org,'BATXL-CLIENT-FINANCE-STORIES-V1',1).c),1,'simulation run unique');

console.log('batinova-xl-client-finance-stories-30: PASS — '+assertions+' assertions; 25 factures; PRJ-014 10/15/20/20; acompte; avoir 3%; paid/partial/unpaid; forecast; replay x2; FK/integrity');
db.close();
