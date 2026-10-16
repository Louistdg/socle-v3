import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {backup,DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {importBatiNovaTenantOnly,BATINOVA_IAE_SHA256,BATINOVA_IAE_DATASET} from './import-batinova-tenant-only.mjs';

const [sourceArg,copyArg,outputArg]=process.argv.slice(2);
if(!sourceArg||!copyArg||!outputArg)throw Error('Usage: node --experimental-sqlite scripts/verify-batinova-tenant-only-copy.mjs <artefact-IA-E> <copie-SQLite-non-prod> <sortie-copie-test>');
const sourcePath=resolve(sourceArg),copyPath=resolve(copyArg),outputPath=resolve(outputArg),targetOrg='org-batinova-iae-2026-10-01';
if(!existsSync(sourcePath)||!existsSync(copyPath))throw Error('Artefact IA-E ou copie de base source absent.');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
assert.equal(hash(sourcePath),BATINOVA_IAE_SHA256,'SHA de l’artefact IA-E figé');
mkdirSync(dirname(outputPath),{recursive:true});
if(existsSync(outputPath)||existsSync(outputPath+'-wal')||existsSync(outputPath+'-shm'))throw Error('La sortie de test doit être un nouveau fichier sans sidecars SQLite.');
const copySource=new DatabaseSync(copyPath,{readOnly:true});
try{await backup(copySource,outputPath)}finally{copySource.close()}

const snapshotOrg=(path,organizationId)=>{
  const db=new DatabaseSync(path,{readOnly:true}),snapshot={};
  try{
    for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
      const cols=db.prepare(`PRAGMA table_info("${name.replaceAll('"','""')}")`).all().map(row=>row.name);
      if(cols.includes('organization_id')&&!['provenance_actor_map','tenant_imports'].includes(name))snapshot[name]=db.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" WHERE organization_id=? ORDER BY rowid`).all(organizationId).map(row=>Object.fromEntries(Object.entries(row)));
    }
    return snapshot;
  }finally{db.close()}
};
const baseDb=new DatabaseSync(outputPath),baseTenant=baseDb.prepare("SELECT id FROM organizations WHERE name='Socle.Simu.V2'").get()?.id;
if(!baseTenant){baseDb.close();throw Error('La copie locale ne contient pas Socle.Simu.V2.');}
const beforeExisting=snapshotOrg(outputPath,baseTenant);
const authSnapshot={};
for(const table of ['local_test_sessions','production_credentials','production_sessions'])authSnapshot[table]=baseDb.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all().map(row=>Object.fromEntries(Object.entries(row)));
for(const table of ['profiles','local_test_identities','organization_members','organization_invitations','project_access','member_access_settings']){
  const cols=baseDb.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name);
  const query=cols.includes('organization_id')?`SELECT * FROM "${table}" WHERE organization_id=? ORDER BY rowid`:`SELECT * FROM "${table}" ORDER BY rowid`;
  authSnapshot[table]=baseDb.prepare(query).all(...(cols.includes('organization_id')?[baseTenant]:[])).map(row=>Object.fromEntries(Object.entries(row)));
  if(table==='profiles')authSnapshot[table]=authSnapshot[table].map(({identity_kind,...row})=>row);
}
baseDb.close();
const sourceDb=new DatabaseSync(sourcePath,{readOnly:true}),sourceOrg=sourceDb.prepare("SELECT id FROM organizations WHERE name LIKE '%BatiNova%' ORDER BY id LIMIT 1").get().id;
const sourcePeopleByProfile=new Map(sourceDb.prepare('SELECT user_id,person_id FROM organization_members WHERE organization_id=? AND person_id IS NOT NULL').all(sourceOrg).map(row=>[row.user_id,String(row.person_id)]));
const sourceWorkspace=JSON.parse(sourceDb.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(sourceOrg).payload);
assert.equal(sourceWorkspace.people.length,25,'roster source IA-E: 25 personnes');
assert.equal(sourceWorkspace.teams.length,4,'roster source IA-E: 4 équipes');
assert.equal(sourceWorkspace.jobs.length,30,'source canonique IA-E: 30 chantiers');
assert.equal(sourceWorkspace.quotes.length,40,'source canonique IA-E: 40 devis');
assert.ok(Object.keys(sourceWorkspace.accessAssignments||{}).length>0,'la source contient bien des droits locaux à filtrer');
const sourceRows={},excluded=new Set(['organization_members','local_test_identities','organization_invitations','project_access','document_access_grants','member_access_settings','workspace_state']);
for(const {name} of sourceDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()){
  const cols=sourceDb.prepare(`PRAGMA table_info("${name.replaceAll('"','""')}")`).all().map(row=>row.name);
  if(cols.includes('organization_id')&&!excluded.has(name))sourceRows[name]=sourceDb.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" WHERE organization_id=? ORDER BY rowid`).all(sourceOrg).map(row=>Object.fromEntries(Object.entries(row)));
}
sourceDb.close();
const first=importBatiNovaTenantOnly({sourcePath,targetPath:outputPath,organizationId:targetOrg});
assert.equal(first.status,'imported');
assert.equal(first.sourceSha,BATINOVA_IAE_SHA256);
const afterExisting=snapshotOrg(outputPath,baseTenant);
assert.deepEqual(afterExisting,beforeExisting,'toutes les lignes du tenant préexistant sont identiques');

const db=new DatabaseSync(outputPath);
let importCounts={},actorRefs=0,provenancePeople=[];
try{
  db.exec('PRAGMA foreign_keys=ON');
  assert.equal(db.prepare('SELECT name FROM organizations WHERE id=?').get(targetOrg).name,'BatiNova Entreprise Générale SRL');
  const importedWorkspace=JSON.parse(db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(targetOrg).payload);
  assert.equal(importedWorkspace.people.length,25,'25 personnes métier conservées');
  assert.equal(importedWorkspace.teams.length,4,'4 équipes conservées');
  assert.equal(importedWorkspace.jobs.length,30,'30 chantiers conservés');
  assert.equal(importedWorkspace.quotes.length,40,'40 devis conservés');
  assert.deepEqual(importedWorkspace.accessAssignments,{},'les autorisations de simulation présentes dans le JSON sont retirées');
  for(const [table,rows] of Object.entries(sourceRows)){
    importCounts[table]=Number(db.prepare(`SELECT COUNT(*) n FROM "${table.replaceAll('"','""')}" WHERE organization_id=?`).get(targetOrg).n);
    assert.equal(importCounts[table],rows.length,`volume métier IA-E: ${table}`);
  }
  const exclusions={organization_members:'organization_id',local_test_identities:'organization_id',organization_invitations:'organization_id',project_access:'organization_id',document_access_grants:'organization_id',member_access_settings:'organization_id'};
  for(const [table,col] of Object.entries(exclusions))if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))assert.equal(Number(db.prepare(`SELECT COUNT(*) n FROM "${table}" WHERE "${col}"=?`).get(targetOrg).n),0,`${table} non importé`);
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM organization_invitations WHERE organization_id=?').get(targetOrg).n),0,'aucune invitation locale importée');
  for(const table of ['local_test_sessions','production_credentials','production_sessions','profiles','local_test_identities','organization_members','organization_invitations','project_access','member_access_settings']){
    const cols=db.prepare(`PRAGMA table_info("${table}")`).all().map(row=>row.name);
    const query=cols.includes('organization_id')?`SELECT * FROM "${table}" WHERE organization_id=? ORDER BY rowid`:`SELECT * FROM "${table}" ORDER BY rowid`;
    let actual=db.prepare(query).all(...(cols.includes('organization_id')?[baseTenant]:[])).map(row=>Object.fromEntries(Object.entries(row)));
    if(table==='profiles'){
      const oldIds=new Set(authSnapshot.profiles.map(row=>row.id));
      actual=actual.filter(row=>oldIds.has(row.id)).map(({identity_kind,...row})=>row);
    }
    assert.deepEqual(actual,authSnapshot[table],`authentification/droits préexistants inchangés: ${table}`);
  }
  assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM provenance_actor_map WHERE organization_id=?").get(targetOrg).n),first.actorCount,'mapping de provenance complet');
  assert.ok(first.actorCount>0,'les auteurs/acteurs sont conservés comme provenance non authentifiable');
  assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM provenance_actor_map m JOIN profiles p ON p.id=m.profile_id WHERE m.organization_id=? AND p.identity_kind<>'provenance'").get(targetOrg).n),0,'aucun acteur historique classé comme compte');
  provenancePeople=db.prepare('SELECT source_profile_id,source_person_id FROM provenance_actor_map WHERE organization_id=?').all(targetOrg);
  for(const row of provenancePeople)assert.equal(row.source_person_id,sourcePeopleByProfile.get(row.source_profile_id)||null,`roster source conservé pour ${row.source_profile_id}`);
  const rosterIds=new Set(importedWorkspace.people.map(person=>String(person.id)));
  for(const row of provenancePeople)if(row.source_person_id)assert.ok(rosterIds.has(String(row.source_person_id)),`person_id relié à une personne du roster: ${row.source_profile_id}`);
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM production_credentials c JOIN provenance_actor_map m ON m.profile_id=c.user_id WHERE m.organization_id=?').get(targetOrg).n),0,'aucun credential sur acteur historique');
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM production_sessions s JOIN provenance_actor_map m ON m.profile_id=s.user_id WHERE m.organization_id=?').get(targetOrg).n),0,'aucune session sur acteur historique');
  assert.equal(Number(db.prepare('SELECT COUNT(*) n FROM local_test_identities i JOIN provenance_actor_map m ON m.profile_id=i.profile_id WHERE m.organization_id=?').get(targetOrg).n),0,'aucune identité locale de test sur acteur historique');
  const profileFkTables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
  for(const table of profileFkTables){
    const fks=db.prepare(`PRAGMA foreign_key_list("${table.replaceAll('"','""')}")`).all().filter(fk=>fk.table==='profiles');
    if(!fks.length||!sourceRows[table])continue;
    for(const fk of fks)actorRefs+=Number(db.prepare(`SELECT COUNT(*) n FROM "${table.replaceAll('"','""')}" WHERE organization_id=? AND "${fk.from.replaceAll('"','""')}" LIKE 'provenance:%'`).get(targetOrg).n);
  }
  assert.ok(actorRefs>0,'les FK A/B ciblent des profils de provenance');
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0,'foreign_key_check=0');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity_check=ok');
}finally{db.close()}

const snapshotAll=()=>{
  const check=new DatabaseSync(outputPath,{readOnly:true}),result={};
  try{for(const {name} of check.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'local_migrations' ORDER BY name").all())result[name]=check.prepare(`SELECT * FROM "${name.replaceAll('"','""')}" ORDER BY rowid`).all().map(row=>Object.fromEntries(Object.entries(row)))}finally{check.close()}
  return result;
};
const beforeReplay=snapshotAll();
const replay=importBatiNovaTenantOnly({sourcePath,targetPath:outputPath,organizationId:targetOrg});
assert.equal(replay.status,'already-imported','replay idempotent, marqueur source/SHA identiques');
assert.deepEqual(snapshotAll(),beforeReplay,'aucune ligne/donnée ajoutée ou modifiée au replay');
const evidence={status:'PASS',sourceSha256:hash(sourcePath),dataset:BATINOVA_IAE_DATASET,copyOf:copyPath,output:outputPath,existingTenant:baseTenant,existingTenantUnchanged:true,existingAuthAndAccessUnchanged:true,import: first,replay,actorReferences:actorRefs,actorProfilesNonAuthenticatable:first.actorCount,rosterPersonMappings:provenancePeople.filter(row=>row.source_person_id).length,tenantPayload:{people:25,teams:4,jobs:30,quotes:40,simulationAccessAssignmentsRemoved:true},sourceBusinessTableCounts:Object.fromEntries(Object.entries(sourceRows).map(([table,rows])=>[table,rows.length])),targetBusinessTableCounts:importCounts,foreignKeyCheck:'0',integrityCheck:'ok',importedLocalMemberships:0,importedProjectAccess:0,importedSessions:0,importedCredentials:0,importedInvitations:0};
writeFileSync(outputPath+'.evidence.json',JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify(evidence,null,2));
