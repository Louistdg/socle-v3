import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const database=new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}

const stamp='2026-09-28T21:00:00.000Z';
for(const org of ['org-a','org-b']){
  database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,org,org,'BE','EUR',stamp,stamp);
}

// Tenant-scoped identifiers: same local id is legal in two organizations.
database.prepare('INSERT INTO hr_people(organization_id,id,display_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('org-a','person-1','Alice',stamp,stamp);
database.prepare('INSERT INTO hr_people(organization_id,id,display_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('org-b','person-1','Bruno',stamp,stamp);
assert.equal(database.prepare("SELECT COUNT(*) count FROM hr_people WHERE id='person-1'").get().count,2,'Un même id RH local peut exister dans deux entreprises');

database.prepare('INSERT INTO hr_teams(organization_id,id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run('org-a','team-1','Équipe A',stamp,stamp);
database.prepare('INSERT INTO hr_teams(organization_id,id,name,created_at,updated_at) VALUES(?,?,?,?,?)').run('org-b','team-1','Équipe B',stamp,stamp);
assert.equal(database.prepare("SELECT COUNT(*) count FROM hr_teams WHERE id='team-1'").get().count,2,'Un même id équipe local peut exister dans deux entreprises');

database.prepare('INSERT INTO employment_records(organization_id,id,person_id,weekly_hours,gross_hourly_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-a','employment-1','person-1',38,2500,stamp,stamp);
assert.equal(database.prepare("SELECT gross_hourly_cents FROM employment_records WHERE organization_id='org-a' AND id='employment-1'").get().gross_hourly_cents,2500);

assert.throws(
  ()=>database.prepare('INSERT INTO employment_records(organization_id,id,person_id,created_at,updated_at) VALUES(?,?,?,?,?)').run('org-a','employment-cross','missing-person',stamp,stamp),
  /FOREIGN KEY/,
  'Un contrat ne peut pas pointer vers une personne absente du même tenant'
);

database.prepare('INSERT INTO hr_people(organization_id,id,display_name,created_at,updated_at) VALUES(?,?,?,?,?)').run('org-b','person-only-b','Bruno B',stamp,stamp);
assert.throws(
  ()=>database.prepare('INSERT INTO employment_records(organization_id,id,person_id,created_at,updated_at) VALUES(?,?,?,?,?)').run('org-a','employment-cross-tenant','person-only-b',stamp,stamp),
  /FOREIGN KEY/,
  'Une personne d’une autre entreprise ne peut pas être référencée'
);

database.prepare('INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-a','membership-1','team-1','person-1',null,stamp,stamp);
assert.throws(
  ()=>database.prepare('INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-a','membership-duplicate','team-1','person-1',null,stamp,stamp),
  /UNIQUE/,
  'Deux appartenances ouvertes identiques sont interdites même avec starts_on NULL'
);
assert.throws(
  ()=>database.prepare('INSERT INTO hr_team_members(organization_id,id,team_id,person_id,starts_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org-a','membership-cross','team-1','person-only-b','2026-09-28',stamp,stamp),
  /FOREIGN KEY/,
  'Une équipe ne peut pas contenir une personne d’un autre tenant'
);

assert.throws(
  ()=>database.prepare('INSERT INTO employment_records(organization_id,id,person_id,weekly_hours,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-a','employment-hours','person-1',200,stamp,stamp),
  /CHECK/,
  'Les heures hebdomadaires incohérentes sont refusées'
);
assert.throws(
  ()=>database.prepare('INSERT INTO employment_records(organization_id,id,person_id,gross_hourly_cents,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-a','employment-negative','person-1',-1,stamp,stamp),
  /CHECK/,
  'Un taux horaire brut négatif est refusé'
);

const permissions=database.prepare("SELECT code FROM permissions WHERE code IN ('hr.records.view','hr.records.manage') ORDER BY code").all().map(row=>row.code);
assert.deepEqual(permissions,['hr.records.manage','hr.records.view']);

console.log('hr-tenant-integrity-24: 10 assertions réussies');
