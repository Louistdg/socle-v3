import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {copyFileSync,mkdirSync,mkdtempSync,readdirSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openProductionDatabase} from '../scripts/production-db.mjs';

const sourceDirectory=fileURLToPath(new URL('../drizzle/',import.meta.url));
const migrations=readdirSync(sourceDirectory).filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort();
const planning='0034_planning_operations.sql';
const commercial='0035_ia_c_commercial_finance.sql';
const formerCommercial='0034_ia_c_commercial_finance.sql';
assert.equal(migrations.length,52,'La consolidation contient exactement 52 migrations.');
assert.equal(migrations[33],'0033_production_auth.sql');
assert.equal(migrations[34],planning);
assert.equal(migrations[35],commercial);
assert.equal(migrations[36],'0036_non_authenticating_provenance_actors.sql');
assert.equal(migrations[37],'0037_batinova_first_owner_bootstrap.sql');
assert.equal(migrations[38],'0038_user_preferences.sql');
assert.equal(migrations[39],'0039_stock_worker_consume.sql');
assert.equal(migrations[40],'0040_stock_catalog_v2.sql');
assert.equal(migrations[41],'0041_delivery_scans.sql');
assert.equal(migrations[42],'0042_stock_barcodes.sql');
assert.equal(migrations[43],'0043_quote_preproject_lifecycle.sql');
assert.equal(migrations[44],'0044_canonical_role_permission_defaults.sql');
assert.equal(migrations[45],'0045_fuel_receipts.sql');
assert.equal(migrations[46],'0046_quote_site_visits.sql');
assert.equal(migrations[49],'0049_time_entry_monthly_archive.sql');
assert.equal(new Set(migrations.map(name=>name.slice(0,4))).size,52);
for(let index=0;index<migrations.length;index++)assert.equal(Number(migrations[index].slice(0,4)),index);

const temporaryRoot=realpathSync(tmpdir());
const directory=mkdtempSync(join(temporaryRoot,'socle-abc-migration-upgrade-'));
const stamp='2026-10-01T12:00:00.000Z';
const businessTables=[
  'organizations','profiles','roles','organization_members','organization_workspace_state',
  'hr_people','hr_teams','projects','field_assignments','customers','quotes_server','bank_accounts'
];
const planningTables=['planning_absences','hr_team_leads','project_planning_blocks'];
const commercialTables=['bank_transactions','quote_amendments'];

function fixture(label,names){
  const path=join(directory,label);
  mkdirSync(path);
  for(const name of names)copyFileSync(join(sourceDirectory,name),join(path,name));
  return path;
}

function quoted(identifier){return '"'+identifier.replaceAll('"','""')+'"';}

// Retenir les colonnes présentes avant l'upgrade permet de comparer toute la
// donnée historique, même quand la migration ajoute des colonnes par défaut.
function snapshot(database,tables){
  return tables.map(table=>{
    const columns=database.prepare('PRAGMA table_info('+quoted(table)+')').all().map(row=>row.name);
    assert.ok(columns.length,'Table présente : '+table);
    const selection=columns.map(quoted).join(',');
    return {table,columns,rows:database.prepare('SELECT '+selection+' FROM '+quoted(table)+' ORDER BY '+selection).all()};
  });
}

function assertPreserved(database,saved,label){
  for(const {table,columns,rows} of saved){
    const selection=columns.map(quoted).join(',');
    assert.deepEqual(database.prepare('SELECT '+selection+' FROM '+quoted(table)+' ORDER BY '+selection).all(),rows,label+' : '+table+' conservée');
  }
}

function journal(database){return database.prepare('SELECT name FROM local_migrations ORDER BY name').all().map(row=>row.name);}

function integrity(database,label){
  assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys,1,label+' : FK actives');
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(),[],label+' : aucune violation FK');
  assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check,'ok',label+' : intégrité SQLite');
}

function seedBusiness(database){
  for(const suffix of ['a','b']){
    const organization='org-'+suffix,profile='profile-'+suffix,customer='customer-'+suffix,project='project-'+suffix;
    database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(profile,'Personne',suffix,profile+'@example.invalid',stamp,stamp);
    database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(organization,'Entreprise '+suffix,'Entreprise '+suffix,'BE','EUR',stamp,stamp);
    database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)')
      .run('role-'+suffix,organization,'ACCOUNTING','Comptabilité historique',stamp);
    database.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,'active',?,?,?)")
      .run('member-'+suffix,organization,profile,'role-'+suffix,stamp,stamp,stamp);
    for(const permission of ['quotes.view','quotes.create','quotes.edit']){
      database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+suffix,permission);
    }
    database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)')
      .run(organization,JSON.stringify({company:{name:'Historique '+suffix},preserved:true}),17,profile,stamp,stamp);
    database.prepare('INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(organization,'shared-person','Ouvrier '+suffix,'Couvreur','Ouvrier',1,'server',stamp,stamp);
    database.prepare('INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
      .run(organization,'shared-team','Équipe '+suffix,1,'server',stamp,stamp);
    database.prepare("INSERT INTO customers(id,organization_id,type,company_name,email,country,notes,payment_terms_days,created_at,updated_at) VALUES(?,?,'company',?,?,'BE',?,45,?,?)")
      .run(customer,organization,'Client '+suffix,customer+'@example.invalid','Historique à conserver',stamp,stamp);
    database.prepare("INSERT INTO projects(id,organization_id,customer_id,name,reference,status,country,quoted_amount_cents,estimated_cost_cents,actual_cost_cents,created_at,updated_at) VALUES(?,?,?,?,?,'active','BE',123456,65432,12000,?,?)")
      .run(project,organization,customer,'Chantier '+suffix,'CHANTIER-'+suffix,stamp,stamp);
    database.prepare('INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run('shared-assignment',organization,'2026-10-02','shared-team',project,'["shared-person"]',null,null,'',profile,stamp,profile,stamp);
    database.prepare("INSERT INTO quotes_server(id,organization_id,project_id,reference,status,title,client_name,client_address,issue_date,valid_until,deposit_percent,payment_terms,notes,exclusions,lines_json,created_by,created_at,updated_at) VALUES(?,?,?,?,'accepted',?,?,?,'2026-10-01','2026-11-01',20,?,?,?, ?,?,?,?)")
      .run('quote-'+suffix,organization,project,'DEVIS-'+suffix,'Toiture '+suffix,'Client '+suffix,'Namur','45 jours','Historique','Aucune','[{"label":"Toiture","qty":1,"price":1234.56,"vat":21}]',profile,stamp,stamp);
    database.prepare("INSERT INTO bank_accounts(id,organization_id,name,iban,currency,current_balance_cents,provider,created_at,updated_at) VALUES(?,?,?,?,'EUR',123456,'manual',?,?)")
      .run('account-'+suffix,organization,'Compte '+suffix,'BE00000000000000',stamp,stamp);
  }
}

function seedPlanning(database){
  for(const suffix of ['a','b']){
    const organization='org-'+suffix,profile='profile-'+suffix;
    database.prepare("UPDATE field_assignments SET start_time='08:15',end_time='15:45',assignment_type='team',status='confirmed',reason=? WHERE organization_id=? AND id='shared-assignment'")
      .run('Horaire conservé '+suffix,organization);
    database.prepare("INSERT INTO planning_absences(organization_id,id,person_id,absence_type,starts_at,ends_at,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,'shared-person','training',?,?,'approved',?,?,?,?,?)")
      .run(organization,'shared-absence','2026-10-05T08:00','2026-10-05T16:00','Formation '+suffix,profile,stamp,profile,stamp);
    database.prepare('INSERT INTO hr_team_leads(organization_id,id,team_id,person_id,starts_on,ends_on,temporary,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(organization,'shared-lead','shared-team','shared-person','2026-10-01','2026-10-31',1,profile,stamp,profile,stamp);
    database.prepare("INSERT INTO project_planning_blocks(organization_id,id,project_id,starts_at,ends_at,block_type,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,?,?, ?,?,'weather','active',?,?,?,?,?)")
      .run(organization,'shared-block','project-'+suffix,'2026-10-06T07:00','2026-10-06T16:00','Intempéries '+suffix,profile,stamp,profile,stamp);
  }
}

function seedCommercial(database){
  for(const suffix of ['a','b']){
    const organization='org-'+suffix,profile='profile-'+suffix;
    database.prepare('UPDATE quotes_server SET customer_id=? WHERE id=? AND organization_id=?')
      .run('customer-'+suffix,'quote-'+suffix,organization);
    database.prepare("INSERT INTO bank_transactions(id,organization_id,bank_account_id,transaction_date,amount_cents,currency,description,reference,counterparty_name,status,idempotency_key,created_at,updated_at) VALUES(?,?,?,'2026-10-01',12345,'EUR',?,?,?,'unreconciled',?,?,?)")
      .run('transaction-'+suffix,organization,'account-'+suffix,'Virement '+suffix,'VIR-'+suffix,'Client '+suffix,'operation-bank-'+suffix,stamp,stamp);
    database.prepare("INSERT INTO quote_amendments(id,organization_id,quote_id,project_id,reference,title,reason,amount_cents,vat_amount_cents,total_cents,status,effective_date,notes,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,10000,2100,12100,'accepted','2026-10-01',?,?,?,?)")
      .run('amendment-'+suffix,organization,'quote-'+suffix,'project-'+suffix,'AV-'+suffix,'Isolation '+suffix,'Demande client','Historique avenant',profile,stamp,stamp);
  }
}

function seedTimeEntryMonthArchive(database){
  for(const suffix of ['a','b'])database.prepare('INSERT INTO time_entry_month_closures(organization_id,month,closed_at,closed_by,archived_count) VALUES(?,?,?,?,?)')
    .run('org-'+suffix,'2026-09',stamp,'profile-'+suffix,3);
}

function assertPermissions(database){
  for(const suffix of ['a','b']){
    const granted=database.prepare('SELECT permission_code FROM role_permissions WHERE role_id=? ORDER BY permission_code').all('role-'+suffix).map(row=>row.permission_code);
    for(const permission of ['quotes.view','quotes.create','quotes.edit','customers.view','customers.create','customers.edit','quote_amendments.view','quote_amendments.create']){
      assert.ok(granted.includes(permission),'Permission conservée ou ajoutée : '+permission+' tenant '+suffix);
    }
  }
}

function upgrade(label,initialNames,withPlanning){
  const initialDirectory=fixture(label+'-before',initialNames);
  const databasePath=join(directory,label+'.sqlite');
  let runtime;
  try{
    runtime=openProductionDatabase({databasePath,migrationsDirectory:initialDirectory});
    seedBusiness(runtime.database);
    if(withPlanning)seedPlanning(runtime.database);
    const before=snapshot(runtime.database,withPlanning?[...businessTables,...planningTables]:businessTables);
    assert.deepEqual(journal(runtime.database),initialNames);
    runtime.close();runtime=null;

    runtime=openProductionDatabase({databasePath,migrationsDirectory:sourceDirectory});
    assertPreserved(runtime.database,before,label+' upgrade');
    assert.deepEqual(journal(runtime.database),migrations,label+' : 52 migrations journalisées');
    integrity(runtime.database,label+' upgrade');
    assertPermissions(runtime.database);
    if(!withPlanning){
      assert.deepEqual(runtime.database.prepare('SELECT start_time,end_time,assignment_type,status,reason FROM field_assignments ORDER BY organization_id').all().map(row=>({...row})),[
        {start_time:'07:00',end_time:'16:00',assignment_type:'team',status:'planned',reason:''},
        {start_time:'07:00',end_time:'16:00',assignment_type:'team',status:'planned',reason:''}
      ],'Les affectations historiques reçoivent les défauts planning sans perte.');
      seedPlanning(runtime.database);
    }
    assert.deepEqual(runtime.database.prepare('SELECT customer_id FROM quotes_server ORDER BY id').all().map(row=>row.customer_id),[null,null],'Les devis historiques ne reçoivent pas de client inventé.');
    seedCommercial(runtime.database);
    seedTimeEntryMonthArchive(runtime.database);
    const upgraded=snapshot(runtime.database,[...businessTables,...planningTables,...commercialTables,'role_permissions','time_entry_month_closures']);
    runtime.close();runtime=null;

    for(let restart=0;restart<2;restart++){
      runtime=openProductionDatabase({databasePath,migrationsDirectory:sourceDirectory});
      assertPreserved(runtime.database,upgraded,label+' redémarrage '+restart);
      assert.deepEqual(journal(runtime.database),migrations,'Aucun ALTER ni seed rejoué au redémarrage.');
      integrity(runtime.database,label+' redémarrage '+restart);
      runtime.close();runtime=null;
    }
  }finally{runtime?.close();}
}

function historicalCommercialName(){
  // Une base ayant reçu B et C sous l'ancien nom de C doit échouer sans alias
  // implicite. B est déjà journalisée : seul le rejeu de C reste en attente.
  const historicalNames=[...migrations.slice(0,34),planning,formerCommercial,...migrations.slice(36)].sort();
  const historicalDirectory=fixture('historical-b-c',migrations.filter(name=>name!==commercial));
  copyFileSync(join(sourceDirectory,commercial),join(historicalDirectory,formerCommercial));
  const databasePath=join(directory,'historical-b-c.sqlite');
  let runtime;
  let preserved;
  try{
    runtime=openProductionDatabase({databasePath,migrationsDirectory:historicalDirectory});
    seedBusiness(runtime.database);seedPlanning(runtime.database);seedCommercial(runtime.database);
    preserved=snapshot(runtime.database,[...businessTables,...planningTables,...commercialTables,'role_permissions','local_migrations']);
    assert.deepEqual(journal(runtime.database),historicalNames);
    runtime.close();runtime=null;
    for(let retry=0;retry<2;retry++){
      assert.throws(()=>openProductionDatabase({databasePath,migrationsDirectory:sourceDirectory}),error=>
        error.message.includes(commercial)&&/duplicate column name: customer_id/.test(String(error.cause?.message)),
      'L’ancien nom C ne devient pas silencieusement un alias de 0035.');
      const database=new DatabaseSync(databasePath,{readOnly:true});
      try{
        database.exec('PRAGMA foreign_keys=ON');
        assertPreserved(database,preserved,'Échec du rejeu C');
        assert.deepEqual(journal(database),historicalNames,'Échec C : journal intact, aucune entrée 0035.');
        integrity(database,'Échec du rejeu C');
      }finally{database.close();}
    }
  }finally{runtime?.close();}
}

try{
  upgrade('main-0033',migrations.slice(0,34),false);
  upgrade('planning-0034',migrations.slice(0,35),true);
  historicalCommercialName();
  console.log('abc-migration-upgrade: PASS main0033 + B0034, données des deux tenants conservées, 52 migrations, deux redémarrages, intégrité/FK, ancien nom C refusé avec rollback.');
}finally{
  const actualDirectory=realpathSync(directory);
  assert.equal(dirname(actualDirectory),temporaryRoot,'Nettoyage limité au répertoire temporaire créé.');
  assert.match(basename(actualDirectory),/^socle-abc-migration-upgrade-[^\\/]+$/);
  rmSync(actualDirectory,{recursive:true,force:true});
}
