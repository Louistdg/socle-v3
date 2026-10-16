import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
assert.ok(migrations.includes('0031_supplier_payments.sql'),'0031 supplier payments présente');
assert.ok(!migrations.includes('0029_supplier_payments.sql'),'ancien numéro 0029 supplier payments absent');

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-09-29T14:00:00.000Z';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','Marc','Delcourt',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Propriétaire',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org','owner','role-owner','active',stamp,stamp,stamp);

function seedExpense(id,key){
  db.prepare('INSERT INTO expenses(id,organization_id,category,description,expense_date,currency,subtotal_cents,vat_amount_cents,total_cents,payment_status,created_by,created_at,updated_at,supplier_reference,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,'org','materials','Facture '+id,'2026-09-29','EUR',10000,2100,12100,'unpaid','owner',stamp,stamp,'REF-'+id,key);
}
seedExpense('exp-same','seed-exp-same');
seedExpense('exp-diff','seed-exp-diff');

function makeGate(){
  let release;
  const promise=new Promise(resolve=>{release=resolve});
  return {count:0,promise,release};
}
const gates=new Map([
  ['race-same-key',makeGate()],
  ['race-diff-key',makeGate()]
]);
const replaySql='SELECT * FROM supplier_payments WHERE organization_id=? AND idempotency_key=?';

const env={DB:{
  prepare(sql){
    let values=[];
    return{
      _sql:sql,
      get _values(){return values},
      bind(...args){values=args;return this},
      async first(){
        if(sql===replaySql){
          const key=String(values[1]||''),gate=gates.get(key);
          if(gate&&gate.count<2){
            const snapshot=db.prepare(sql).get(...values)??null;
            gate.count+=1;
            if(gate.count===2)gate.release();
            await gate.promise;
            return snapshot;
          }
        }
        return db.prepare(sql).get(...values)??null;
      },
      async all(){return{results:db.prepare(sql).all(...values)}},
      async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
    };
  },
  async batch(statements){
    db.exec('BEGIN IMMEDIATE');
    try{
      const out=[];
      for(const statement of statements){
        const result=db.prepare(statement._sql).run(...statement._values);
        out.push({meta:{changes:Number(result.changes)}});
      }
      db.exec('COMMIT');
      return out;
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
}};

async function call(expenseId,payload){
  const headers={
    'oai-authenticated-user-id':'owner',
    'x-socle-organization-id':'org',
    'origin':'https://socle.test',
    'content-type':'application/json'
  };
  const response=await worker.fetch(new Request('https://socle.test/api/expenses/'+expenseId+'/payments',{
    method:'POST',headers,body:JSON.stringify(payload)
  }),env);
  let body={};try{body=await response.json()}catch{}
  return{status:response.status,body};
}

let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const deep=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};

const samePayload={
  amountCents:4000,
  paymentDate:'2026-09-29',
  paymentMethod:'bank_transfer',
  reference:'VIR-SAME',
  note:'Même paiement',
  operationKey:'race-same-key'
};
const same=await Promise.all([
  call('exp-same',samePayload),
  call('exp-same',samePayload)
]);
deep(same.map(x=>x.status).sort((a,b)=>a-b),[200,201],'même clé + mêmes données: création puis replay');
eq(same.filter(x=>x.body.replayed===true).length,1,'un seul replay signalé');
eq(db.prepare("SELECT COUNT(*) c FROM supplier_payments WHERE organization_id='org' AND idempotency_key='race-same-key'").get().c,1,'un seul paiement persiste pour le replay concurrent');
eq(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE organization_id='org' AND action='supplier_payment.created' AND entity_type='supplier_payment' AND json_extract(new_values,'$.expense_id')='exp-same'").get().c,1,'un seul audit création pour mêmes données');

const diffA={
  amountCents:3000,
  paymentDate:'2026-09-29',
  paymentMethod:'bank_transfer',
  reference:'VIR-DIFF-A',
  note:'Version A',
  operationKey:'race-diff-key'
};
const diffB={
  amountCents:3500,
  paymentDate:'2026-09-30',
  paymentMethod:'card',
  reference:'VIR-DIFF-B',
  note:'Version B',
  operationKey:'race-diff-key'
};
const different=await Promise.all([
  call('exp-diff',diffA),
  call('exp-diff',diffB)
]);
deep(different.map(x=>x.status).sort((a,b)=>a-b),[201,409],'même clé + données différentes: une création et un 409');
const conflict=different.find(x=>x.status===409);
ok(conflict?.body?.error?.includes('paiement différent'),'409 explique la collision idempotente');
eq(db.prepare("SELECT COUNT(*) c FROM supplier_payments WHERE organization_id='org' AND idempotency_key='race-diff-key'").get().c,1,'aucun paiement supplémentaire sur collision');
eq(db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE organization_id='org' AND action='supplier_payment.created' AND entity_type='supplier_payment' AND json_extract(new_values,'$.expense_id')='exp-diff'").get().c,1,'aucun audit supplémentaire sur collision');

eq(db.prepare('PRAGMA foreign_key_check').all().length,0,'aucune violation FK');
eq(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','intégrité SQLite');
console.log('supplier-payments-idempotency-31: '+assertions+' assertions réussies');
