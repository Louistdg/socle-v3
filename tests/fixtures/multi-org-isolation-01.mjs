import { readFileSync, readdirSync } from 'node:fs';

export const BATINOVA_ORG_ID = 'org-batinova-iae-2026-10-01';
export const OWNER_ID = 'multi-org-owner';
export const WORKER_ID = 'multi-org-worker';
export const PROJECT_ID = 'shared-looking-project-id';
export const STAMP = '2026-10-05T12:00:00.000Z';

export function applyMigrations(database) {
  database.exec('PRAGMA foreign_keys=ON');
  database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
  const directory = new URL('../../drizzle/', import.meta.url);
  for (const name of readdirSync(directory).filter(file => /^\d+.*\.sql$/.test(file)).sort()) {
    if (database.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name)) continue;
    database.exec(readFileSync(new URL(name, directory), 'utf8'));
    database.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
  }
}

export function seedBatiNova(database, { localIdentities = false } = {}) {
  const organization = database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
  organization.run(BATINOVA_ORG_ID, 'BatiNova — fixture QA', 'BatiNova — fixture QA', 'BE', 'EUR', STAMP, STAMP);
  const profile = database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)');
  profile.run(OWNER_ID, 'Louis', 'Fixture', 'owner@multi-org.test', STAMP, STAMP);
  profile.run(WORKER_ID, 'Anthony', 'Fixture', 'worker@multi-org.test', STAMP, STAMP);

  for (const [code, name] of [['OWNER', 'Propriétaire'], ['WORKER', 'Ouvrier']]) {
    database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)')
      .run(`role-batinova-${code.toLowerCase()}`, BATINOVA_ORG_ID, code, name, STAMP);
  }
  const member = database.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,'active',?,?,?,?)");
  member.run('member-batinova-owner', BATINOVA_ORG_ID, OWNER_ID, 'role-batinova-owner', STAMP, STAMP, STAMP, 'P01');
  member.run('member-batinova-worker', BATINOVA_ORG_ID, WORKER_ID, 'role-batinova-worker', STAMP, STAMP, STAMP, 'P07');
  database.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)")
    .run('role-batinova-worker', 'projects.view.assigned');

  database.prepare("INSERT INTO customers(id,organization_id,type,company_name,country,notes,payment_terms_days,created_at,updated_at) VALUES(?,?,'company',?,'BE',?,30,?,?)")
    .run('batinova-client-marker', BATINOVA_ORG_ID, 'BATINOVA-CLIENT-ONLY', 'fixture marker', STAMP, STAMP);
  database.prepare('INSERT INTO projects(id,organization_id,customer_id,name,reference,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(PROJECT_ID, BATINOVA_ORG_ID, 'batinova-client-marker', 'BATINOVA-PROJECT-ONLY', 'BATI-ONLY-001', 'active', STAMP, STAMP);
  database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)')
    .run(BATINOVA_ORG_ID, WORKER_ID, PROJECT_ID, OWNER_ID, STAMP);

  const state = {
    version: 3,
    company: { name: 'BATINOVA-STATE-ONLY' },
    people: [{ id: 'same-person-id', name: 'BATINOVA-PERSON-ONLY' }],
    teams: [{ id: 'same-team-id', name: 'BATINOVA-TEAM-ONLY', members: ['P07'] }],
    jobs: [{ id: PROJECT_ID, name: 'BATINOVA-JOB-ONLY', reference: 'BATI-ONLY-001' }],
    contacts: [{ id: 'same-contact-id', company: 'BATINOVA-CONTACT-ONLY' }],
    suppliers: [{ id: 'same-supplier-id', name: 'BATINOVA-SUPPLIER-ONLY' }],
    quotes: [{ id: 'same-quote-id', reference: 'BATINOVA-QUOTE-ONLY' }],
    assignments: [{ id: 'same-assignment-id', job: PROJECT_ID, team: 'same-team-id', people: ['P07'], date: '2026-10-05' }],
    timeEntries: [{ id: 'same-time-id', job: PROJECT_ID, people: ['P07'], date: '2026-10-05' }],
    stockItems: [{ id: 'same-stock-id', reference: 'BATINOVA-STOCK-ONLY' }],
    purchaseOrders: [{ id: 'same-order-id', number: 'BATINOVA-ORDER-ONLY' }],
    dossiers: [{ id: 'same-document-id', name: 'BATINOVA-DOCUMENT-ONLY' }],
    assets: [{ id: 'same-asset-id', name: 'BATINOVA-ASSET-ONLY' }],
    accountingData: { customerInvoices: [{ id: 'same-invoice-id', ref: 'BATINOVA-INVOICE-ONLY' }] },
    messages: [{ id: 'same-message-id', text: 'BATINOVA-MESSAGE-ONLY' }],
    tasks: [{ id: 'same-task-id', title: 'BATINOVA-TASK-ONLY' }],
  };
  database.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run(BATINOVA_ORG_ID, JSON.stringify(state), 1, OWNER_ID, STAMP, STAMP);

  if (localIdentities) {
    const identity = database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,\'simulation_not_sent\',?,?)');
    identity.run('multi-org-owner-local', BATINOVA_ORG_ID, OWNER_ID, 'P01', 'owner@multi-org.test', 'Louis Fixture', STAMP, STAMP);
    identity.run('multi-org-worker-local', BATINOVA_ORG_ID, WORKER_ID, 'P07', 'worker@multi-org.test', 'Anthony Fixture', STAMP, STAMP);
  }
  return state;
}
