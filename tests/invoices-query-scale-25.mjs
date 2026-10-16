import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}

let queryCount=0;
const env={DB:{
  prepare(sql){
    queryCount++;
    let values=[];
    return{
      _sql:sql,
      get _values(){return values},
      bind(...args){values=args;return this},
      async first(){return db.prepare(sql).get(...values)??null},
      async all(){return{results:db.prepare(sql).all(...values)}},
      async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
    };
  },
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const out=statements.map(statement=>{const result=db.prepare(statement._sql).run(...statement._values);return{meta:{changes:Number(result.changes)}}});
      db.exec('COMMIT');
      return out;
    }catch(error){db.exec('ROLLBACK');throw error}
  }
}};

const stamp='2026-09-28T21:30:00.000Z';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
for(const [uid,code] of [['owner','OWNER'],['accountant','ACCOUNTING']]){
  db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(uid,uid,'Test',stamp,stamp);
  db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,'org',code,code,stamp);
  db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+uid,'org',uid,'role-'+uid,'active',stamp,stamp,stamp);
}
for(const permission of ['invoices.view','projects.view.assigned'])db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-accountant',permission);
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','accountant','p1','owner',stamp);

function seedInvoices(count){
  db.prepare("DELETE FROM invoices WHERE organization_id='org'").run();
  const insert=db.prepare("INSERT INTO invoices(id,organization_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at,legacy_project_id,legacy_paid_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
  for(let index=0;index<count;index++){
    const id='inv-'+count+'-'+index,project=index===count-1?'p2':'p1';
    insert.run(id,'org','FAC-'+count+'-'+index,'customer','unpaid','2026-09-28','2026-10-28','EUR',10000,2100,12100,0,'','owner',stamp,stamp,project,0);
  }
}

async function list(uid){
  queryCount=0;
  const response=await worker.fetch(new Request('https://socle.test/api/invoices',{headers:{
    'oai-authenticated-user-id':uid,
    'x-socle-organization-id':'org',
    'origin':'https://socle.test'
  }}),env);
  const body=await response.json();
  return{status:response.status,body,queries:queryCount};
}

seedInvoices(10);
let ownerSmall=await list('owner'),accountantSmall=await list('accountant');
assert.equal(ownerSmall.status,200);assert.equal(accountantSmall.status,200);
assert.equal(ownerSmall.body.invoices.length,10);
assert.equal(accountantSmall.body.invoices.length,9,'La facture du chantier p2 reste hors périmètre');
assert.ok(accountantSmall.body.invoices.every(invoice=>invoice.projectId==='p1'));

seedInvoices(300);
let ownerLarge=await list('owner'),accountantLarge=await list('accountant');
assert.equal(ownerLarge.status,200);assert.equal(accountantLarge.status,200);
assert.equal(ownerLarge.body.invoices.length,300);
assert.equal(accountantLarge.body.invoices.length,299);
assert.equal(ownerLarge.queries,ownerSmall.queries,'Le nombre de requêtes OWNER ne dépend plus du nombre de factures');
assert.equal(accountantLarge.queries,accountantSmall.queries,'Le nombre de requêtes à périmètre restreint ne dépend plus du nombre de factures');
assert.ok(ownerLarge.queries<=5,`OWNER utilise ${ownerLarge.queries} requêtes, attendu <= 5`);
assert.ok(accountantLarge.queries<=9,`Utilisateur restreint utilise ${accountantLarge.queries} requêtes, attendu <= 9`);

console.log(`invoices-query-scale-25: 13 assertions réussies · OWNER ${ownerLarge.queries} requêtes · restreint ${accountantLarge.queries}`);
