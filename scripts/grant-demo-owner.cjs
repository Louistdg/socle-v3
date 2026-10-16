// Explicit operator utility, never run automatically on application startup.
// Purpose: give the demo operator account the OWNER role inside the three
// explicitly authorised test organizations, so that the existing
// "Tester cet acces" (read-only access preview) option becomes usable.
//
// Why OWNER and not a personal role: the access preview requires the acting
// account to be OWNER (worker/index.js:70) and the previewed accounts to keep
// a WORKER / TEAM_LEAD / ACCOUNTING role (worker/index.js:74). A personal
// USER_* role is therefore NOT previewable and would break the option.
//
// stdin: {accounts:[{id,email,role}],organizations:[...]}
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const { randomUUID, createHash } = require('node:crypto');

(async () => {
  const manifest = JSON.parse(fs.readFileSync(0, 'utf8'));
  const organizations = [
    'org-fe704248-01ff-4b79-a2c0-c14c6b203eef',
    'org-17fd1b7f-e297-4814-aba3-5633d2c19178',
    'e52068dc-64c6-402e-b80b-c0d2737f6b52'
  ];
  if (JSON.stringify(manifest.organizations) !== JSON.stringify(organizations)) throw Error('Unexpected test scope');
  if (manifest.accounts.length !== 5) throw Error('Unexpected test account count');
  const expected = ['invite01@socle-test.invalid', 'invite02@socle-test.invalid', 'invite03@socle-test.invalid', 'invite04@socle-test.invalid', 'invite05@socle-test.invalid'];
  for (let i = 0; i < 5; i++) if (manifest.accounts[i].email !== expected[i]) throw Error('Unexpected test account');
  const operator = manifest.accounts[0];

  const dbPath = process.env.SOCLE_DB_PATH;
  if (!dbPath) throw Error('Explicit SOCLE_DB_PATH required');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000');

  // Snapshot every table we must not touch, so an accidental side effect aborts the run.
  const unchanged = () => Object.fromEntries(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
      .filter(t => !['organization_members', 'audit_logs', 'roles'].includes(t.name))
      .map(t => [t.name, createHash('sha256').update(db.prepare('SELECT * FROM "' + t.name.replaceAll('"', '""') + '"').all().map(r => JSON.stringify(r)).sort().join('\n')).digest('hex')])
  );
  const before = unchanged();
  const stamp = new Date().toISOString();
  const dir = path.join(path.dirname(dbPath), 'operator-backups');
  fs.mkdirSync(dir, { recursive: true });
  await backup(db, path.join(dir, 'before-demo-operator-owner-' + Date.now() + '.sqlite'));

  db.exec('BEGIN IMMEDIATE');
  const report = { operator: operator.email, organizations: [] };
  try {
    const profile = db.prepare('SELECT id,email FROM profiles WHERE lower(email)=?').get(operator.email.toLowerCase());
    if (!profile) throw Error('Operator profile missing');
    if (!db.prepare('SELECT 1 FROM production_credentials WHERE user_id=?').get(profile.id)) throw Error('Operator credential missing');

    for (const org of organizations) {
      const orgRow = db.prepare('SELECT name FROM organizations WHERE id=?').get(org);
      if (!orgRow) throw Error('Organization missing: ' + org);
      const ownerRole = db.prepare("SELECT id FROM roles WHERE organization_id=? AND code='OWNER'").get(org);
      if (!ownerRole) throw Error('OWNER role missing in ' + org);
      const member = db.prepare("SELECT om.id,om.role_id,om.status,r.code role FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.user_id=?").get(org, profile.id);
      if (!member) throw Error('Operator is not a member of ' + org);
      if (member.status !== 'active') throw Error('Operator membership is not active in ' + org);

      const already = member.role === 'OWNER';
      if (!already) {
        // Refuse to overwrite a role that another operator already changed on purpose.
        if (member.role !== 'WORKER') throw Error('Unexpected current role in ' + org + ': ' + member.role);
        const changed = db.prepare('UPDATE organization_members SET role_id=?,updated_at=? WHERE id=? AND role_id=?').run(ownerRole.id, stamp, member.id, member.role_id);
        if (Number(changed.changes) !== 1) throw Error('Role change was not applied in ' + org);
        db.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,new_values,created_at) VALUES(?,?,?,?,?,?,?,?)')
          .run('audit-' + randomUUID(), org, profile.id, 'member.demo_operator_owner', 'organization_member', member.id,
            JSON.stringify({ previousRole: member.role, newRole: 'OWNER', purpose: 'access preview operator', release: 'demo' }), stamp);
      }
      report.organizations.push({ organization: orgRow.name, previousRole: member.role, newRole: 'OWNER', changed: !already });
    }
    if (JSON.stringify(before) !== JSON.stringify(unchanged())) throw Error('Unrelated tables changed');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw Error('Foreign key check failed');
    db.exec('COMMIT');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { db.exec('ROLLBACK'); throw error; } finally { db.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
