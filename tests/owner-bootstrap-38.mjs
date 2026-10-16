import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {openProductionDatabase} from '../scripts/production-db.mjs';
import {bootstrapBatinovaFirstOwner} from '../scripts/bootstrap-batinova-first-owner.mjs';

const migrationsDirectory=fileURLToPath(new URL('../drizzle/',import.meta.url));
const stamp='2026-10-02T10:00:00.000Z';
const storage=openProductionDatabase({databasePath:':memory:',migrationsDirectory});
const db=storage.database;
function invalidFixture({identityKind='account',credential=true,localTestIdentity=false,membership=false}={}){
  const candidate=openProductionDatabase({databasePath:':memory:',migrationsDirectory});
  const database=candidate.database;
  database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('org-batinova-iae-2026-10-01','BatiNova','BatiNova','BE','EUR',stamp,stamp);
  database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)')
    .run('owner-role','org-batinova-iae-2026-10-01','OWNER','Propriétaire',stamp);
  database.prepare('INSERT INTO profiles(id,first_name,last_name,email,identity_kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
    .run('louis-profile','Louis','Masson','louis.masson@outlook.com',identityKind,stamp,stamp);
  if(credential&&identityKind==='account')database.prepare('INSERT INTO production_credentials(user_id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)')
    .run('louis-profile','louis.masson@outlook.com','test-hash',stamp,stamp);
  if(localTestIdentity)database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('local-identity','org-batinova-iae-2026-10-01','louis-profile','person-local','louis.masson@outlook.com','Local Louis',stamp,stamp);
  if(membership)database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run('existing-membership','org-batinova-iae-2026-10-01','louis-profile','owner-role','active',stamp,stamp,stamp);
  return candidate;
}
try{
  for(const [id,name] of [['org-batinova-iae-2026-10-01','BatiNova'],['org-simu','Socle.Simu.V2']]){
    db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,name,name,'BE','EUR',stamp,stamp);
    db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner-'+id,id,'OWNER','Propriétaire',stamp);
  }
  db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('louis-profile','Louis','Masson','louis.masson@outlook.com',stamp,stamp);
  db.prepare("INSERT INTO production_credentials(user_id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)").run('louis-profile','louis.masson@outlook.com','test-hash',stamp,stamp);
  db.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)")
    .run('simu-membership','org-simu','louis-profile','role-owner-org-simu','active',stamp,stamp,stamp);
  db.prepare('INSERT INTO projects(id,organization_id,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('simu-project','org-simu','Existing project','active',stamp,stamp);
  db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)')
    .run('org-simu','louis-profile','simu-project','louis-profile',stamp);

  const businessBefore=db.prepare("SELECT id,name,updated_at FROM organizations WHERE id='org-batinova-iae-2026-10-01'").get();
  const otherMembershipBefore=db.prepare("SELECT id,organization_id,user_id,role_id,status,person_id FROM organization_members WHERE user_id='louis-profile' ORDER BY organization_id").all().map(row=>({...row}));
  const credentialBefore=db.prepare("SELECT user_id,email,password_hash,disabled_at,created_at,updated_at FROM production_credentials WHERE user_id='louis-profile'").get();
  const result=bootstrapBatinovaFirstOwner(db,{createdAt:stamp});
  assert.equal(result.organizationId,'org-batinova-iae-2026-10-01');
  assert.equal(result.email,'louis.masson@outlook.com');
  assert.equal(result.role,'OWNER');
  const membership=db.prepare('SELECT organization_id,user_id,role_id,status,person_id FROM organization_members WHERE id=?').get(result.membershipId);
  assert.deepEqual({...membership},{organization_id:'org-batinova-iae-2026-10-01',user_id:'louis-profile',role_id:'role-owner-org-batinova-iae-2026-10-01',status:'active',person_id:null});
  const event=db.prepare('SELECT actor_type,actor_channel,authorized_by_email,action,created_at FROM organization_first_owner_bootstraps WHERE organization_id=?').get('org-batinova-iae-2026-10-01');
  assert.deepEqual({...event},{actor_type:'authorized_operator',actor_channel:'railway_ssh',authorized_by_email:'louis.masson@outlook.com',action:'first_owner_established',created_at:stamp});
  assert.deepEqual(db.prepare("SELECT id,organization_id,user_id,role_id,status,person_id FROM organization_members WHERE user_id='louis-profile' ORDER BY organization_id").all().map(row=>({...row})),[
    {id:result.membershipId,organization_id:'org-batinova-iae-2026-10-01',user_id:'louis-profile',role_id:'role-owner-org-batinova-iae-2026-10-01',status:'active',person_id:null},
    ...otherMembershipBefore
  ].sort((a,b)=>a.organization_id.localeCompare(b.organization_id)),'l’adhésion Socle.Simu.V2 est préservée');
  assert.deepEqual({...db.prepare("SELECT user_id,email,password_hash,disabled_at,created_at,updated_at FROM production_credentials WHERE user_id='louis-profile'").get()},{...credentialBefore},'aucun credential ni mot de passe n’est remplacé');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM production_sessions WHERE user_id=?').get('louis-profile').n,0,'aucune session créée');
  assert.deepEqual(db.prepare("SELECT organization_id,user_id,project_id,granted_by,created_at FROM project_access WHERE user_id='louis-profile'").all().map(row=>({...row})),[
    {organization_id:'org-simu',user_id:'louis-profile',project_id:'simu-project',granted_by:'louis-profile',created_at:stamp}
  ],'aucun project_access BatiNova ajouté et grants Socle.Simu.V2 préservés');
  assert.deepEqual({...db.prepare("SELECT id,name,updated_at FROM organizations WHERE id='org-batinova-iae-2026-10-01'").get()},{...businessBefore},'le tenant métier reste inchangé');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM organization_first_owner_bootstraps').get().n,1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  assert.throws(()=>bootstrapBatinovaFirstOwner(db,{createdAt:stamp}),/sans aucune adhésion|déjà été utilisé/,'le bootstrap refuse le rejeu');
  assert.throws(()=>db.prepare('UPDATE organization_first_owner_bootstraps SET action=? WHERE organization_id=?').run('changed','org-batinova-iae-2026-10-01'),/immutable/,'l’audit est immuable');
  assert.throws(()=>db.prepare('DELETE FROM organization_first_owner_bootstraps WHERE organization_id=?').run('org-batinova-iae-2026-10-01'),/immutable/,'l’audit ne peut pas être effacé');

  for(const [options,pattern,label] of [
    [{credential:false},/credential de production actif/,'credential de production absent'],
    [{identityKind:'provenance'},/provenance/,'profil provenance refusé'],
    [{localTestIdentity:true},/simulation/,'identité locale refusée'],
    [{membership:true},/sans aucune adhésion/,'tenant déjà initialisé refusé']
  ]){
    const candidate=invalidFixture(options);
    try{
      assert.throws(()=>bootstrapBatinovaFirstOwner(candidate.database,{createdAt:stamp}),pattern,label);
      assert.equal(candidate.database.prepare('SELECT COUNT(*) n FROM organization_members WHERE organization_id=?').get('org-batinova-iae-2026-10-01').n,Number(Boolean(options.membership)),label+' sans écriture partielle');
      assert.equal(candidate.database.prepare('SELECT COUNT(*) n FROM organization_first_owner_bootstraps').get().n,0,label+' sans audit partiel');
    }finally{candidate.close();}
  }

  const blocked=invalidFixture({identityKind:'provenance'});
  try{
    assert.throws(()=>blocked.database.prepare(`INSERT INTO organization_first_owner_bootstraps(
      organization_id,user_id,role_id,membership_id,actor_type,actor_channel,authorized_by_email,action,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?)`).run('org-batinova-iae-2026-10-01','louis-profile','owner-role','forged-member','authorized_operator','railway_ssh','louis.masson@outlook.com','first_owner_established',stamp),/preconditions failed/,'la garde SQLite refuse aussi un insert direct d’un profil provenance');
  }finally{blocked.close();}

  console.log('owner-bootstrap-38: PASS — premier OWNER réel BatiNova, membership multi-tenant préservé, compte/session/grant inchangé, audit immuable et rejeu refusé.');
}finally{storage.close();}
