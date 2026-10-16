import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

let n=0;
const eq=(a,b,m)=>{assert.equal(a,b,m);n++};
const ok=(a,m)=>{assert.ok(a,m);n++};
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
const supplierIndex=migrations.indexOf('0015_supplier_allocations.sql');
ok(supplierIndex>=0,'migration historique 0015 préservée');
eq(migrations[supplierIndex+1],'0016_transversal_stabilization.sql','stabilisation ajoutée après 0015');
eq(migrations[supplierIndex+2],'0017_pre_point10_lock.sql','verrou ciblé ajouté après stabilisation');
eq(migrations[supplierIndex+3],'0018_hr_foundation.sql','fondation RH ajoutée après le verrou');

const fresh=new DatabaseSync(':memory:');
for(const name of migrations)fresh.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
ok(fresh.prepare("select 1 ok from sqlite_master where type='table' and name='supplier_allocations'").get()?.ok,'table ventilation');
const cols=fresh.prepare('pragma table_info(supplier_allocations)').all().map(r=>r.name);
for(const c of ['organization_id','expense_id','destination_type','destination_id','amount_cents','idempotency_key','status','created_by','cancelled_by','cancelled_at'])ok(cols.includes(c),'colonne '+c);
ok(fresh.prepare("select 1 ok from permissions where code='supplier_allocations.view'").get()?.ok,'permission lecture');
ok(fresh.prepare("select 1 ok from permissions where code='supplier_allocations.create'").get()?.ok,'permission création');
ok(fresh.prepare("select 1 ok from permissions where code='supplier_allocations.cancel'").get()?.ok,'permission annulation');
ok(fresh.prepare("select 1 ok from pragma_table_info('expenses') where name='supplier_reference'").get()?.ok,'référence fournisseur ajoutée');
for(const table of ['hr_people','employment_records','hr_teams','hr_team_members'])ok(fresh.prepare("select 1 ok from sqlite_master where type='table' and name=?").get(table)?.ok,'table RH '+table);

const existing = new DatabaseSync(':memory:');

for (const name of migrations.slice(0, supplierIndex)) {
  existing.exec(
    readFileSync(
      new URL('../drizzle/' + name, import.meta.url),
      'utf8'
    )
  );
}

const stamp='2026-09-26T16:00:00.000Z';
existing.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('owner','O','W',stamp,stamp);
existing.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','Org','Org','BE','EUR',stamp,stamp);
existing.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role','org','OWNER','Owner',stamp);
existing.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-accounting','org','ACCOUNTANT','Accounting',stamp);
for(const permission of ['accounting.view','expenses.create','credit_notes.create'])existing.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-accounting',permission);
existing.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('member','org','owner','role','active',stamp,stamp);
existing.prepare('INSERT INTO suppliers(id,organization_id,name,country,default_payment_terms_days,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('sup','org','Supplier','BE',30,stamp,stamp);
existing.prepare("INSERT INTO expenses(id,organization_id,supplier_id,category,description,expense_date,currency,subtotal_cents,vat_amount_cents,total_cents,payment_status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run('exp','org','sup','materials','Facture','2026-09-26','EUR',10000,2100,12100,'unpaid','owner',stamp,stamp);
existing.prepare("INSERT INTO secure_documents(id,organization_id,folder_id,storage_key,original_name,content_type,byte_size,sensitivity,status,uploaded_by,created_at,updated_at,title,description,category,reference) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
const before={expenses:existing.prepare('select count(*) c from expenses').get().c,suppliers:existing.prepare('select count(*) c from suppliers').get().c,documents:existing.prepare('select count(*) c from secure_documents').get().c,relations:existing.prepare('select count(*) c from document_relations').get().c};
existing.exec(readFileSync(new URL('../drizzle/0015_supplier_allocations.sql',import.meta.url),'utf8'));
eq(existing.prepare('select count(*) c from expenses').get().c,before.expenses,'dépenses Point8 préservées');
eq(existing.prepare('select count(*) c from suppliers').get().c,before.suppliers,'fournisseurs préservés');
eq(existing.prepare('select count(*) c from secure_documents').get().c,before.documents,'documents Point8 préservés');
eq(existing.prepare('select count(*) c from document_relations').get().c,before.relations,'relations documentaires préservées');
eq(existing.prepare("select supplier_reference r from expenses where id='exp'").get().r,'','nouveau champ neutre sans donnée inventée');
ok(existing.prepare("select 1 ok from sqlite_master where type='trigger' and name='supplier_allocation_validate_insert'").get()?.ok,'contrôle atomique installé');
ok(existing.prepare("select 1 ok from sqlite_master where type='trigger' and name='supplier_allocation_no_delete'").get()?.ok,'journal non supprimable');
ok(existing.prepare("select 1 ok from role_permissions where role_id='role-accounting' and permission_code='supplier_allocations.view'").get()?.ok,'lecture héritée rôle comptable');
ok(existing.prepare("select 1 ok from role_permissions where role_id='role-accounting' and permission_code='supplier_allocations.create'").get()?.ok,'création héritée rôle financier autorisé');
ok(existing.prepare("select 1 ok from role_permissions where role_id='role-accounting' and permission_code='supplier_allocations.cancel'").get()?.ok,'annulation héritée rôle financier autorisé');
fresh.close();existing.close();
console.log('supplier-allocations-migration-19: '+n+' assertions passed');
