import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const migrationDir=new URL('../drizzle/',import.meta.url);
const migrations=readdirSync(migrationDir).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const sql=name=>readFileSync(new URL(name,migrationDir),'utf8');

let assertions=0;
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};
const throws=(fn,pattern,message)=>{assert.throws(fn,pattern,message);assertions++};

function indexOf(name){
  const i=migrations.indexOf(name);
  assert.notEqual(i,-1,`migration absente: ${name}`);
  return i;
}
function through(name){return migrations.slice(0,indexOf(name)+1)}
function after(name){return migrations.slice(indexOf(name)+1)}
function applyOne(db,name){
  db.exec('BEGIN');
  try{
    db.exec(sql(name));
    db.exec('COMMIT');
  }catch(error){
    db.exec('ROLLBACK');
    throw error;
  }
}
function apply(db,names){for(const name of names)applyOne(db,name)}
function check(db,label){
  equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys,1,`${label}: foreign_keys=ON`);
  equal(db.prepare('PRAGMA foreign_key_check').all().length,0,`${label}: foreign_key_check vide`);
  equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok',`${label}: integrity_check ok`);
}
function seedIdentity(db,org='org-a',user='owner-a'){
  const stamp='2026-09-29T15:00:00.000Z';
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run(org,org,org,'BE','EUR',stamp,stamp);
  db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run(user,'Owner',org,stamp,stamp);
  return stamp;
}
function seedRelationalProject(db,{id='project-a',org='org-a',stamp='2026-09-29T15:00:00.000Z'}={}){
  db.prepare(`INSERT INTO projects(
    id,organization_id,customer_id,name,reference,status,country,
    quoted_amount_cents,estimated_cost_cents,actual_cost_cents,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,org,null,id,id,'active','BE',0,0,0,stamp,stamp);
}
function insertExpense0026(db,{id='expense-old',org='org-a',project='legacy-orphan',user='owner-a',key='upgrade-expense-0001',stamp='2026-09-29T15:00:00.000Z'}={}){
  db.prepare(`INSERT INTO expenses(
    id,organization_id,supplier_id,project_id,category,description,expense_date,currency,
    subtotal_cents,vat_amount_cents,total_cents,payment_status,created_by,created_at,updated_at,
    supplier_reference,idempotency_key,purchase_order_id,delivery_note_id
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,org,null,project,'materials','Historique','2026-09-29','EUR',100,21,121,'unpaid',user,stamp,stamp,'OLD',key,null,null);
}

equal(migrations[0],'0000_known_spot.sql','la chaîne commence à 0000');
equal(migrations[48],'0048_planning_integrity.sql','0048 ajoute les garde-fous d’intégrité planning après le suivi des blocages');
equal(migrations[49],'0049_time_entry_monthly_archive.sql','0049 ajoute l’archivage mensuel des pointages');
equal(migrations.at(-1),'0051_field_journal_category.sql','0051 ajoute la catégorie des notes du carnet terrain');
equal(migrations.length,52,'une migration numérotée unique existe pour chaque étape 0000→0051');
equal(migrations[31],'0031_supplier_payments.sql','0031 paiements fournisseurs présente');
equal(migrations[32],'0032_project_field_operations.sql','0032 opérations terrain chantier présente');
equal(migrations[33],'0033_production_auth.sql','0033 authentification production présente');
equal(migrations[34],'0034_planning_operations.sql','0034 planning opérationnel présente');
equal(migrations[35],'0035_ia_c_commercial_finance.sql','0035 finance commerciale IA-C présente');
equal(migrations[36],'0036_non_authenticating_provenance_actors.sql','0036 provenance non authentifiable présente');
equal(migrations[37],'0037_batinova_first_owner_bootstrap.sql','0037 bootstrap initial OWNER BatiNova présent');
equal(migrations[38],'0038_user_preferences.sql','0038 préférences utilisateur tenant-scoped présentes');
equal(migrations[39],'0039_stock_worker_consume.sql','0039 permission de consommation Stock terrain présente');equal(migrations[40],'0040_stock_catalog_v2.sql','0040 catalogue Stock V2 présent');equal(migrations[41],'0041_delivery_scans.sql','0041 BL-SCAN présent');equal(migrations[42],'0042_stock_barcodes.sql','0042 modèle barcode relationnel présent');equal(migrations[43],'0043_quote_preproject_lifecycle.sql','0043 devis pré-chantier présent');equal(migrations[44],'0044_canonical_role_permission_defaults.sql','0044 permissions standards par rôle présent');equal(migrations[45],'0045_fuel_receipts.sql','0045 ticket carburant privé relié au plein présent');equal(migrations[46],'0046_quote_site_visits.sql','0046 dossier de visite pré devis présent');equal(migrations[47],'0047_planning_block_followup.sql','0047 suivi des responsables et échéances de blocage présent');equal(migrations[48],'0048_planning_integrity.sql','0048 conflits d’affectations et rejeu idempotent sécurisés');
for(let i=0;i<migrations.length;i++)equal(Number(migrations[i].slice(0,4)),i,`séquence continue au numéro ${String(i).padStart(4,'0')}`);

const temp=mkdtempSync(join(tmpdir(),'socle-ia4-current-'));
try{
  // 1) Installation neuve avec le même journal transactionnel que scripts/local.mjs.
  const cleanPath=join(temp,'clean.sqlite');
  let db=new DatabaseSync(cleanPath);
  db.exec('PRAGMA foreign_keys=ON; CREATE TABLE local_migrations(name TEXT PRIMARY KEY NOT NULL)');
  for(const name of migrations){
    db.exec('BEGIN');
    try{
      db.exec(sql(name));
      db.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
      db.exec('COMMIT');
    }catch(error){
      db.exec('ROLLBACK');
      throw error;
    }
  }
  equal(db.prepare('SELECT COUNT(*) n FROM local_migrations').get().n,52,'installation neuve journalise 52 migrations');
  equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='project_financial_baselines'").get().n,1,'0028 crée les baselines');
  equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='project_financial_baseline_project_tenant_insert'").get().n,1,'0029 crée la garde tenant baseline');
  check(db,'installation neuve');
  db.close();

  db=new DatabaseSync(cleanPath);
  db.exec('PRAGMA foreign_keys=ON');
  const pending=migrations.filter(name=>!db.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name));
  equal(pending.length,0,'redémarrage: aucune migration déjà journalisée n’est rejouée');
  check(db,'redémarrage');
  db.close();

  // 2) Upgrade depuis 0021: données workspace + RH préservées.
  db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  apply(db,through('0021_hr_relational_activation.sql'));
  const stamp=seedIdentity(db);
  db.prepare(`INSERT INTO organization_workspace_state(
    organization_id,payload,revision,source_user_id,created_at,updated_at
  ) VALUES(?,?,?,?,?,?)`).run('org-a','{"preserved":"from-0021"}',21,'owner-a',stamp,stamp);
  db.prepare(`INSERT INTO hr_people(
    organization_id,id,display_name,role_title,category,active,source,created_at,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)`).run('org-a','person-a','Person A','','Ouvrier',1,'server',stamp,stamp);
  apply(db,after('0021_hr_relational_activation.sql'));
  equal(db.prepare("SELECT payload FROM organization_workspace_state WHERE organization_id='org-a'").get().payload,'{"preserved":"from-0021"}','upgrade 0021 conserve le workspace');
  equal(db.prepare("SELECT display_name FROM hr_people WHERE organization_id='org-a' AND id='person-a'").get().display_name,'Person A','upgrade 0021 conserve la RH');
  check(db,'upgrade depuis 0021');
  db.close();

  // 3) Upgrade depuis 0026: un ancien project_id orphelin devient explicitement legacy en 0027.
  db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  apply(db,through('0026_supplier_invoice_matches.sql'));
  seedIdentity(db);
  db.exec('PRAGMA foreign_keys=OFF');
  insertExpense0026(db);
  equal(db.prepare('PRAGMA foreign_key_check').all().length>0,true,'pré-0027: l’orphelin historique est réellement détecté');
  db.exec('PRAGMA foreign_keys=ON');
  apply(db,after('0026_supplier_invoice_matches.sql'));
  const repaired=db.prepare("SELECT project_id,legacy_project_id FROM expenses WHERE id='expense-old'").get();
  equal(repaired.project_id,null,'0027 retire l’id orphelin du FK relationnel');
  equal(repaired.legacy_project_id,'legacy-orphan','0027 conserve l’id historique en legacy_project_id');
  check(db,'upgrade depuis 0026');
  db.close();

  // 4) Rollback réel d’une 0028 interrompue, puis reprise.
  db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  apply(db,through('0027_legacy_expense_project.sql'));
  let interrupted=false;
  db.exec('BEGIN');
  try{
    db.exec(sql('0028_project_financial_baseline.sql'));
    db.exec('THIS IS NOT VALID SQL');
    db.exec('COMMIT');
  }catch{
    interrupted=true;
    db.exec('ROLLBACK');
  }
  ok(interrupted,'une erreur injectée interrompt réellement la transaction 0028');
  equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='project_financial_baselines'").get().n,0,'rollback 0028 ne laisse aucune table partielle');
  applyOne(db,'0028_project_financial_baseline.sql');
  applyOne(db,'0029_project_tenant_integrity.sql');
  equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='project_financial_baselines'").get().n,1,'reprise après rollback crée 0028');
  check(db,'reprise après interruption 0028');

  // 0028 et 0029 sont explicitement rejouables: IF NOT EXISTS + garde temporaire nettoyée.
  applyOne(db,'0028_project_financial_baseline.sql');
  applyOne(db,'0029_project_tenant_integrity.sql');
  check(db,'rejeu 0028/0029');
  db.close();

  // 5) Une ancienne incohérence cross-tenant bloque 0029 sans perte silencieuse.
  db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  apply(db,through('0028_project_financial_baseline.sql'));
  seedIdentity(db,'org-a','owner-a');
  seedIdentity(db,'org-b','owner-b');
  seedRelationalProject(db,{id:'project-b',org:'org-b',stamp});
  db.prepare(`INSERT INTO project_financial_baselines(
    id,organization_id,project_id,version,status,created_by,created_at,updated_by,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?)`).run('bad-baseline','org-a','project-b',1,'active','owner-a',stamp,'owner-a',stamp);

  let blocked=false;
  try{applyOne(db,'0029_project_tenant_integrity.sql')}catch(error){
    blocked=true;
    ok(/CHECK constraint failed/i.test(String(error?.message||error)),'0029 échoue sur la garde de données historiques cross-tenant');
  }
  ok(blocked,'0029 refuse une base historiquement incohérente');
  equal(db.prepare("SELECT project_id FROM project_financial_baselines WHERE id='bad-baseline'").get().project_id,'project-b','rollback conserve la ligne problématique pour diagnostic');
  equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='project_financial_baseline_project_tenant_insert'").get().n,0,'rollback 0029 ne laisse pas de trigger partiel');

  db.prepare("UPDATE project_financial_baselines SET project_id='legacy-recovered' WHERE id='bad-baseline'").run();
  applyOne(db,'0029_project_tenant_integrity.sql');
  equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='project_financial_baseline_project_tenant_insert'").get().n,1,'0029 réussit après correction explicite de la donnée');
  check(db,'reprise 0029 après correction');
  db.close();

  // 6) Contraintes 0028: CHECK, unicité active, immutabilité et FK budget.
  db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  apply(db,migrations);
  const stamp2=seedIdentity(db);
  const insertBaseline=(id,version,planned,status='active')=>db.prepare(`INSERT INTO project_financial_baselines(
    id,organization_id,project_id,version,status,planned_minutes,hourly_cost_cents,progress_basis_points,
    created_by,created_at,updated_by,updated_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,'org-a','legacy-a',version,status,planned,5000,2500,'owner-a',stamp2,'owner-a',stamp2);
  insertBaseline('baseline-1',1,6000);
  throws(()=>insertBaseline('baseline-negative',2,-1),/CHECK/i,'planned_minutes négatif refusé');
  throws(()=>insertBaseline('baseline-duplicate-active',2,6000),/UNIQUE/i,'une deuxième baseline active du même projet est refusée');
  db.prepare("INSERT INTO project_cost_budgets(baseline_id,category,budget_cents) VALUES('baseline-1','LABOUR',500000)").run();
  throws(()=>db.prepare("DELETE FROM project_cost_budgets WHERE baseline_id='baseline-1' AND category='LABOUR'").run(),/project_cost_budget_immutable/,'budget financier non supprimable');
  throws(()=>db.prepare("DELETE FROM project_financial_baselines WHERE id='baseline-1'").run(),/project_financial_baseline_immutable/,'baseline financière non supprimable');
  throws(()=>db.prepare("INSERT INTO project_cost_budgets(baseline_id,category,budget_cents) VALUES('missing','LABOUR',1)").run(),/FOREIGN KEY/i,'budget orphelin refusé');
  check(db,'contraintes 0028/0029');
  db.close();
}finally{
  rmSync(temp,{recursive:true,force:true});
}

console.log(`migrations-current-integrity-29: ${assertions} assertions réussies.`);
