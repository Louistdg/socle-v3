import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {productionConfig} from './production-config.mjs';

export const BATINOVA_FIRST_OWNER = Object.freeze({
  organizationId: 'org-batinova-iae-2026-10-01',
  email: 'louis.masson@outlook.com'
});

function assertIntegrity(database) {
  const foreignKeys = database.prepare('PRAGMA foreign_key_check').all();
  if (foreignKeys.length) throw new Error('La vérification des clés étrangères a échoué.');
  const integrity = database.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
    throw new Error('La vérification d’intégrité SQLite a échoué.');
  }
}

function assertBootstrapPreconditions(database) {
  const organization = database.prepare('SELECT id FROM organizations WHERE id=?')
    .all(BATINOVA_FIRST_OWNER.organizationId);
  if (organization.length !== 1) throw new Error('Le tenant BatiNova attendu est absent ou ambigu.');

  const profiles = database.prepare(`
    SELECT id,identity_kind FROM profiles WHERE lower(trim(email))=?
  `).all(BATINOVA_FIRST_OWNER.email);
  if (profiles.length !== 1) throw new Error('Le compte réel OWNER attendu est absent ou ambigu.');
  const profile = profiles[0];
  if (profile.identity_kind !== 'account') throw new Error('Un profil de provenance ne peut pas devenir OWNER.');

  const credentials = database.prepare(`
    SELECT user_id FROM production_credentials
    WHERE user_id=? AND lower(email)=? AND disabled_at IS NULL
  `).all(profile.id, BATINOVA_FIRST_OWNER.email);
  if (credentials.length !== 1) throw new Error('Le compte ne possède pas exactement un credential de production actif.');

  const localIdentity = database.prepare('SELECT 1 FROM local_test_identities WHERE profile_id=? LIMIT 1').all(profile.id);
  if (localIdentity.length) throw new Error('Une identité de simulation ne peut pas être utilisée pour le bootstrap.');
  const provenance = database.prepare('SELECT 1 FROM provenance_actor_map WHERE profile_id=? LIMIT 1').all(profile.id);
  if (provenance.length) throw new Error('Un acteur de provenance ne peut pas être utilisé pour le bootstrap.');

  const ownerRoles = database.prepare(`
    SELECT id FROM roles WHERE organization_id=? AND code='OWNER'
  `).all(BATINOVA_FIRST_OWNER.organizationId);
  if (ownerRoles.length !== 1) throw new Error('Le rôle OWNER BatiNova est absent ou ambigu.');

  const memberships = database.prepare('SELECT id FROM organization_members WHERE organization_id=?')
    .all(BATINOVA_FIRST_OWNER.organizationId);
  if (memberships.length) throw new Error('Le bootstrap est réservé à une organisation sans aucune adhésion.');
  const pendingInvitations = database.prepare("SELECT 1 FROM organization_invitations WHERE organization_id=? AND status='pending' LIMIT 1")
    .all(BATINOVA_FIRST_OWNER.organizationId);
  if (pendingInvitations.length) throw new Error('Le bootstrap est refusé tant qu’une invitation BatiNova est en attente.');
  const previousBootstrap = database.prepare('SELECT 1 FROM organization_first_owner_bootstraps WHERE organization_id=?')
    .all(BATINOVA_FIRST_OWNER.organizationId);
  if (previousBootstrap.length) throw new Error('Le bootstrap du premier OWNER a déjà été utilisé.');

  return {userId: profile.id, roleId: ownerRoles[0].id};
}

/**
 * Creates only the first BatiNova membership for an existing, real production account.
 * The migration trigger enforces the same fixed tenant/account constraints and records
 * a one-time immutable operator audit event. No account, credential, session, or grant is created.
 */
export function bootstrapBatinovaFirstOwner(database, {createdAt = new Date().toISOString()} = {}) {
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  assertIntegrity(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const applied = database.prepare('SELECT 1 FROM local_migrations WHERE name=?')
      .all('0037_batinova_first_owner_bootstrap.sql');
    if (applied.length !== 1) throw new Error('La migration 0037 du bootstrap n’est pas appliquée.');
    const {userId, roleId} = assertBootstrapPreconditions(database);
    const membershipId = `member-batinova-owner-${randomUUID()}`;
    database.prepare(`
      INSERT INTO organization_first_owner_bootstraps(
        organization_id,user_id,role_id,membership_id,actor_type,actor_channel,authorized_by_email,action,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?)
    `).run(
      BATINOVA_FIRST_OWNER.organizationId,
      userId,
      roleId,
      membershipId,
      'authorized_operator',
      'railway_ssh',
      BATINOVA_FIRST_OWNER.email,
      'first_owner_established',
      createdAt
    );

    const membership = database.prepare(`
      SELECT id,organization_id,user_id,role_id,status,person_id
      FROM organization_members WHERE id=?
    `).all(membershipId);
    if (membership.length !== 1 || membership[0].status !== 'active' || membership[0].person_id !== null) {
      throw new Error('La création de l’adhésion OWNER n’a pas produit l’état attendu.');
    }
    assertIntegrity(database);
    database.exec('COMMIT');
    return {
      organizationId: BATINOVA_FIRST_OWNER.organizationId,
      email: BATINOVA_FIRST_OWNER.email,
      role: 'OWNER',
      membershipId
    };
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch {}
    throw error;
  }
}

function confirmArgs(args) {
  const accepted = new Set([
    '--confirm-org=org-batinova-iae-2026-10-01',
    '--confirm-email=louis.masson@outlook.com'
  ]);
  if (args.length !== accepted.size || args.some(arg => !accepted.has(arg)) || new Set(args).size !== accepted.size) {
    throw new Error('Confirmation requise : --confirm-org=org-batinova-iae-2026-10-01 --confirm-email=louis.masson@outlook.com');
  }
}

function run() {
  confirmArgs(process.argv.slice(2));
  const config = productionConfig(process.env);
  const database = new DatabaseSync(config.databasePath);
  try {
    const result = bootstrapBatinovaFirstOwner(database);
    console.log(JSON.stringify({status: 'created', ...result}));
  } finally {
    database.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    run();
  } catch (error) {
    console.error('Bootstrap premier OWNER BatiNova refusé :', error.message);
    process.exitCode = 1;
  }
}
