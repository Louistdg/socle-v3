import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const migrationDir=new URL('../drizzle/',import.meta.url);
const migrations=readdirSync(migrationDir).filter(name=>/^\d+.*\.sql$/.test(name)).sort();

function apply(db,names){
  for(const name of names){
    db.exec('BEGIN');
    try{
      db.exec(readFileSync(new URL(name,migrationDir),'utf8'));
      db.exec('COMMIT');
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

let assertions=0;
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const throws=(fn,pattern,message)=>{assert.throws(fn,pattern,message);assertions++};

equal(migrations.includes('0029_project_tenant_integrity.sql'),true,'0029 IA4 présente');
equal(migrations.indexOf('0030_document_registry_transversal.sql')>migrations.indexOf('0029_project_tenant_integrity.sql'),true,'0030 documents suit 0029 IA4');

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
apply(db,migrations);

const stamp='2026-09-29T15:00:00.000Z';
db.exec(`
  INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at)
  VALUES
    ('org-a','A','A','BE','EUR','${stamp}','${stamp}'),
    ('org-b','B','B','BE','EUR','${stamp}','${stamp}');
  INSERT INTO profiles(id,first_name,last_name,created_at,updated_at)
  VALUES('owner-a','Owner','A','${stamp}','${stamp}');
  INSERT INTO projects(
    id,organization_id,customer_id,name,reference,status,country,
    quoted_amount_cents,estimated_cost_cents,actual_cost_cents,created_at,updated_at
  ) VALUES
    ('project-a','org-a',NULL,'Projet A','A-001','active','BE',0,0,0,'${stamp}','${stamp}'),
    ('project-b','org-b',NULL,'Projet B','B-001','active','BE',0,0,0,'${stamp}','${stamp}');
`);

const insertBaseline=(id,org,project)=>db.prepare(`
  INSERT INTO project_financial_baselines(
    id,organization_id,project_id,version,status,
    planned_minutes,hourly_cost_cents,progress_basis_points,
    created_by,created_at,updated_by,updated_at
  ) VALUES(?,?,?,?, 'active',NULL,NULL,NULL,?,?,?,?)
`).run(id,org,project,1,'owner-a',stamp,'owner-a',stamp);

throws(
  ()=>insertBaseline('baseline-cross','org-a','project-b'),
  /project_financial_baseline_cross_tenant_project/,
  'une baseline ne peut pas viser un projet relationnel d’une autre entreprise'
);
insertBaseline('baseline-legacy','org-a','legacy-project-a');
equal(
  db.prepare("SELECT project_id FROM project_financial_baselines WHERE id='baseline-legacy'").get().project_id,
  'legacy-project-a',
  'un identifiant chantier legacy absent de projects reste accepté'
);

const insertExpense=(id,project)=>db.prepare(`
  INSERT INTO expenses(
    id,organization_id,supplier_id,project_id,category,description,expense_date,currency,
    subtotal_cents,vat_amount_cents,total_cents,payment_status,
    created_by,created_at,updated_at
  ) VALUES(?, 'org-a',NULL,?,'materials','Test','2026-09-29','EUR',100,21,121,'unpaid','owner-a',?,?)
`).run(id,project,stamp,stamp);

throws(
  ()=>insertExpense('expense-cross','project-b'),
  /expense_project_cross_tenant/,
  'une dépense relationnelle ne peut pas viser un projet d’une autre entreprise'
);
insertExpense('expense-a','project-a');

db.prepare(`
  INSERT INTO supplier_allocations(
    id,organization_id,expense_id,destination_type,destination_id,amount_cents,
    label,note,reference,idempotency_key,status,created_by,created_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
`).run('allocation-a','org-a','expense-a','project','project-a',100,'Test','','','alloc-scope-0001','active','owner-a',stamp);

db.prepare(`
  INSERT INTO field_delivery_notes(
    id,organization_id,order_id,supplier_id,project_id,number,delivery_date,
    receiver_name,comment,file_name,status,created_by,created_at,idempotency_key
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
`).run('delivery-a','org-a','order-a',null,'project-a','BL-A','2026-09-29','Owner','',null,'Reçue','owner-a',stamp,'delivery-scope-0001');

db.prepare(`
  INSERT INTO field_delivery_lines(
    id,organization_id,delivery_note_id,order_line_id,reference,label,
    ordered,received,condition,difference,stock_item_id
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
`).run('delivery-line-a','org-a','delivery-a','order-line-a','','Test',1,1,'Conforme',0,null);

const insertMatch=(id,project,operationKey)=>db.prepare(`
  INSERT INTO supplier_invoice_matches(
    id,organization_id,expense_id,allocation_id,project_id,order_id,order_line_id,
    delivery_note_id,delivery_line_id,matched_cents,matched_quantity_milli,
    operation_key,status,created_by,created_at,updated_by,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'active',?,?,?,?)
`).run(id,'org-a','expense-a','allocation-a',project,'order-a','order-line-a','delivery-a','delivery-line-a',100,1000,operationKey,'owner-a',stamp,'owner-a',stamp);

throws(
  ()=>insertMatch('match-cross','project-b','match-scope-cross'),
  /supplier_invoice_match_cross_tenant_project/,
  'un rapprochement ne peut pas viser un projet relationnel d’une autre entreprise'
);
insertMatch('match-legacy','legacy-project-a','match-scope-legacy');

equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,'foreign_keys reste activé');
equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'aucune violation FK');
equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','intégrité SQLite');

db.close();
console.log(`migrations-project-scope-29: ${assertions} assertions réussies.`);
