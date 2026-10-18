import {createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {BATINOVA_MANUAL_TEST_ORGANIZATION_ID,batinovaWorkspaceRosterPerson,batinovaWorkspaceTeamIds} from '../worker/batinova-invitation-roster.js';

const derive = promisify(scrypt);
const COST = {N: 32768, r: 8, p: 3, maxmem: 48 * 1024 * 1024};
export const SESSION_COOKIE = '__Host-socle_session';
const SESSION_SECONDS = 8 * 60 * 60;
const pepper = (password, secret) => createHmac('sha256', secret).update('password\0').update(password).digest();
const tokenHash = (token, secret) => createHmac('sha256', secret).update('session\0').update(token).digest('hex');

export async function hashPassword(password, secret) {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 1024) throw new Error('Password must have 8+ characters and at most 1024 bytes.');
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(pepper(password, secret), salt, 32, COST);
  return `scrypt:32768:8:3:${salt}:${hash.toString('hex')}`;
}

async function verifyPassword(password, encoded, secret) {
  const parts = String(encoded || '').split(':');
  const valid = parts.length === 6 && parts.slice(0, 4).join(':') === 'scrypt:32768:8:3' && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  // Unknown/disabled accounts perform the same work without accepting a password.
  const result = await derive(pepper(password, secret), valid ? parts[4] : '0'.repeat(32), 32, COST);
  return valid && timingSafeEqual(result, Buffer.from(parts[5], 'hex'));
}

export async function provisionCredential(database, {userId, password, secret}) {
  const profile = database.prepare(`SELECT p.id,p.email FROM profiles p WHERE p.id=? AND p.email IS NOT NULL AND p.identity_kind='account'
    AND EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=p.id AND m.status='active')
    AND NOT EXISTS(SELECT 1 FROM local_test_identities i WHERE i.profile_id=p.id)`).get(userId);
  if (!profile || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) throw new Error('An existing real profile with email and active membership is required; simulation profiles are refused.');
  const hash = await hashPassword(password, secret);
  const now = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(`INSERT INTO production_credentials(user_id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,disabled_at=NULL,failed_attempts=0,locked_until=0,updated_at=excluded.updated_at`).run(userId, profile.email.trim().toLowerCase(), hash, now, now);
    database.prepare('UPDATE production_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(Date.now(), userId);
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); throw error; }
}

function invitationRosterPerson(database, invitation, roleCode) {
  const personId = String(invitation.person_id || '');
  if (!personId) return null;
  const person = database.prepare('SELECT display_name,role_title,active FROM hr_people WHERE organization_id=? AND id=?').get(invitation.organization_id, personId);
  if (person) return Number(person.active) === 1 ? person : null;
  if (String(invitation.organization_id || '') !== BATINOVA_MANUAL_TEST_ORGANIZATION_ID) return null;
  let state = null;
  try {
    const row = database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(invitation.organization_id);
    state = JSON.parse(row?.payload || 'null');
  } catch {}
  return batinovaWorkspaceRosterPerson(state, personId);
}

export function productionAuth(database, secret) {
  let inFlight = 0, windowStart = Date.now(), attempts = 0;
  const eligible = id => !!database.prepare(`SELECT 1 FROM production_credentials c JOIN profiles p ON p.id=c.user_id WHERE c.user_id=? AND c.disabled_at IS NULL AND p.identity_kind='account'
    AND EXISTS(SELECT 1 FROM organization_members m WHERE m.user_id=c.user_id AND m.status='active')
    AND NOT EXISTS(SELECT 1 FROM local_test_identities i WHERE i.profile_id=c.user_id)`).get(id);
  function cookie(token = '', maxAge = SESSION_SECONDS) {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
  }
  function session(header = '') {
    const values = header.split(';').map(value => value.trim()).filter(value => value.startsWith(SESSION_COOKIE + '='));
    if (values.length !== 1) return null;
    const token = values[0].slice(SESSION_COOKIE.length + 1);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const row = database.prepare(`SELECT s.user_id,c.email FROM production_sessions s JOIN production_credentials c ON c.user_id=s.user_id
      WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`).get(tokenHash(token, secret), Date.now());
    return row && eligible(row.user_id) ? {userId: row.user_id, email: row.email} : null;
  }
  async function login(email, password) {
    const now = Date.now();
    if (now - windowStart > 60_000) { windowStart = now; attempts = 0; }
    if (inFlight >= 2 || attempts >= 30) return {status: 429};
    if (typeof email !== 'string' || typeof password !== 'string' || email.length > 254 || Buffer.byteLength(password) > 1024) return {status: 401};
    attempts++; inFlight++;
    try {
      const row = database.prepare('SELECT * FROM production_credentials WHERE email=?').get(email.trim().toLowerCase());
      const allowed = row && eligible(row.user_id) && row.locked_until <= now;
      const matches = await verifyPassword(password, allowed ? row.password_hash : null, secret);
      if (!matches || !allowed || !eligible(row.user_id)) {
        if (row && row.locked_until <= now) database.prepare(`UPDATE production_credentials SET failed_attempts=failed_attempts+1,
          locked_until=CASE WHEN failed_attempts+1>=5 THEN ? ELSE 0 END,updated_at=? WHERE user_id=?`).run(now + 600_000, new Date(now).toISOString(), row.user_id);
        return {status: 401};
      }
      // Recheck the hash after asynchronous work: password reset revokes old credentials.
      if (database.prepare('SELECT password_hash FROM production_credentials WHERE user_id=?').get(row.user_id)?.password_hash !== row.password_hash) return {status: 401};
      const token = randomBytes(32).toString('base64url');
      database.exec('BEGIN IMMEDIATE');
      try {
        database.prepare('DELETE FROM production_sessions WHERE expires_at<=? OR revoked_at IS NOT NULL').run(now);
        database.prepare('UPDATE production_credentials SET failed_attempts=0,locked_until=0 WHERE user_id=?').run(row.user_id);
        database.prepare('INSERT INTO production_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(tokenHash(token, secret), row.user_id, now, now + SESSION_SECONDS * 1000);
        database.exec('COMMIT');
      } catch (error) { database.exec('ROLLBACK'); throw error; }
      return {status: 200, cookie: cookie(token), userId: row.user_id, email: row.email};
    } finally { inFlight--; }
  }
  function invitationProjects(invitation, roleCode) {
    if (roleCode === 'ACCOUNTING') return [];
    const personId = String(invitation.person_id || '');
    if (!personId) return [];
    const role = database.prepare('SELECT id FROM roles WHERE id=? AND organization_id=?').get(invitation.role_id, invitation.organization_id);
    if (!role) throw Object.assign(Error('Le rôle de l’invitation n’appartient plus à cette entreprise.'), {status: 409});
    const permission = database.prepare("SELECT 1 ok FROM role_permissions WHERE role_id=? AND permission_code='projects.view.assigned'").get(role.id);
    if (!permission) return [];
    const stateRow = database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(invitation.organization_id);
    let state = null;
    try { state = JSON.parse(stateRow?.payload || 'null'); } catch {}
    const today = new Date().toISOString().slice(0, 10), teams = new Set();
    if (roleCode === 'TEAM_LEAD') {
      for (const row of database.prepare('SELECT team_id FROM hr_team_leads WHERE organization_id=? AND person_id=? AND starts_on<=? AND (ends_on IS NULL OR ends_on>=?)').all(invitation.organization_id, personId, today, today)) teams.add(String(row.team_id));
      if (!teams.size) {
        const person = database.prepare('SELECT role_title FROM hr_people WHERE organization_id=? AND id=? AND active=1').get(invitation.organization_id, personId);
        if (/chef/i.test(String(person?.role_title || ''))) {
          for (const row of database.prepare('SELECT tm.team_id FROM hr_team_members tm JOIN hr_teams t ON t.organization_id=tm.organization_id AND t.id=tm.team_id WHERE tm.organization_id=? AND tm.person_id=? AND (tm.starts_on IS NULL OR tm.starts_on<=?) AND (tm.ends_on IS NULL OR tm.ends_on>=?) AND t.active=1').all(invitation.organization_id, personId, today, today)) teams.add(String(row.team_id));
        }
      }
      if (!teams.size) {
        if (String(invitation.organization_id || '') === BATINOVA_MANUAL_TEST_ORGANIZATION_ID) {
          for (const teamId of batinovaWorkspaceTeamIds(state, personId, roleCode)) teams.add(teamId);
        }
      }
      if (!teams.size) throw Object.assign(Error('Le chef d’équipe doit être rattaché à une équipe active avant son activation.'), {status: 409});
    }
    const validProjects = new Set((state?.jobs || []).map(project => String(project.id)));
    const projectIds = new Set();
    for (const row of database.prepare("SELECT project_id,team_id,people_json FROM field_assignments WHERE organization_id=? AND status<>'cancelled'").all(invitation.organization_id)) {
      let people = [];
      try { people = JSON.parse(row.people_json || '[]'); } catch {}
      const included = Array.isArray(people) && people.some(value => String(value) === personId);
      const inScope = roleCode === 'TEAM_LEAD' ? teams.has(String(row.team_id)) : included;
      if (inScope && validProjects.has(String(row.project_id))) projectIds.add(String(row.project_id));
    }
    return [...projectIds].sort();
  }
  async function activateInvitation({token, password, firstName = '', lastName = ''} = {}) {
    const fail = (status, error) => ({status, error});
    if (typeof token !== 'string' || token.length < 20 || token.length > 200) return fail(400, 'Invitation invalide.');
    const digest = createHash('sha256').update(token).digest('hex');
    let invitation = database.prepare("SELECT i.*,r.code role_code FROM organization_invitations i JOIN roles r ON r.id=i.role_id AND r.organization_id=i.organization_id WHERE i.token_hash=? AND i.status='pending'").get(digest);
    if (!invitation) return fail(404, 'Invitation introuvable ou déjà utilisée.');
    if (invitation.expires_at <= new Date().toISOString()) {
      database.prepare("UPDATE organization_invitations SET status='expired' WHERE id=? AND status='pending'").run(invitation.id);
      return fail(410, 'Invitation expirée.');
    }
    if (!['TEAM_LEAD', 'WORKER', 'ACCOUNTING'].includes(String(invitation.role_code))) return fail(403, 'Ce rôle ne peut pas être attribué par invitation.');
    const email = String(invitation.email || '').trim().toLowerCase();
    const existing = database.prepare('SELECT id,identity_kind FROM profiles WHERE lower(email)=?').all(email);
    if (existing.some(profile => profile.identity_kind === 'provenance')) return fail(403, 'Un profil de provenance ne peut pas devenir un compte.');
    if (existing.length) return fail(409, 'Un compte existe déjà pour cette adresse. Connectez-vous puis rouvrez le lien d’invitation.');
    const role = database.prepare('SELECT id FROM roles WHERE id=? AND organization_id=?').get(invitation.role_id, invitation.organization_id);
    if (!role) return fail(409, 'Le rôle de l’invitation n’appartient plus à cette entreprise.');
    let person = null;
    if (invitation.person_id) {
      person = invitationRosterPerson(database, invitation, String(invitation.role_code));
      if (!person) return fail(409, 'La personne liée à cette invitation n’est plus dans le roster actif.');
      if (database.prepare("SELECT 1 ok FROM organization_members WHERE organization_id=? AND person_id=? AND status='active' LIMIT 1").get(invitation.organization_id, invitation.person_id)) return fail(409, 'Cette personne est déjà liée à un compte actif.');
    }
    const parsedName = String(person?.display_name || '').trim().split(/\s+/).filter(Boolean);
    const givenName = (parsedName.length ? parsedName.shift() : String(firstName || '').trim()).slice(0, 80);
    const familyName = (parsedName.length ? parsedName.join(' ') : String(lastName || '').trim()).slice(0, 100);
    if (!givenName || !familyName) return fail(400, 'Indiquez le prénom et le nom du titulaire du compte.');
    let passwordHash;
    try { passwordHash = await hashPassword(password, secret); }
    catch { return fail(400, 'Le mot de passe doit contenir au moins 8 caractères et au plus 1024 octets.'); }
    const userId = randomUUID(), memberId = 'member-' + randomUUID(), stamp = new Date().toISOString(), nowMs = Date.now(), sessionToken = randomBytes(32).toString('base64url');
    let projectIds;
    try { projectIds = invitationProjects(invitation, String(invitation.role_code)); }
    catch (error) { return fail(error.status || 409, error.message || 'Périmètre chantier invalide.'); }
    database.exec('BEGIN IMMEDIATE');
    try {
      invitation = database.prepare("SELECT i.*,r.code role_code FROM organization_invitations i JOIN roles r ON r.id=i.role_id AND r.organization_id=i.organization_id WHERE i.id=? AND i.status='pending'").get(invitation.id);
      if (!invitation || invitation.expires_at <= new Date().toISOString()) throw Object.assign(Error('Invitation introuvable, expirée ou déjà utilisée.'), {status: 409});
      if (!['TEAM_LEAD', 'WORKER', 'ACCOUNTING'].includes(String(invitation.role_code))) throw Object.assign(Error('Ce rôle ne peut pas être attribué par invitation.'), {status: 403});
      if (database.prepare('SELECT 1 ok FROM profiles WHERE lower(email)=?').get(email)) throw Object.assign(Error('Un compte existe déjà pour cette adresse. Connectez-vous puis rouvrez le lien d’invitation.'), {status: 409});
      if (database.prepare('SELECT 1 ok FROM organization_members WHERE organization_id=? AND user_id=?').get(invitation.organization_id, userId)) throw Object.assign(Error('Ce compte possède déjà une adhésion dans cette entreprise.'), {status: 409});
      person = null;
      if (invitation.person_id) {
        person = invitationRosterPerson(database, invitation, String(invitation.role_code));
        if (!person) throw Object.assign(Error('La personne liée à cette invitation n’est plus dans le roster actif.'), {status: 409});
        if (database.prepare("SELECT 1 ok FROM organization_members WHERE organization_id=? AND person_id=? AND status='active' LIMIT 1").get(invitation.organization_id, invitation.person_id)) throw Object.assign(Error('Cette personne est déjà liée à un compte actif.'), {status: 409});
      }
      projectIds = invitationProjects(invitation, String(invitation.role_code));
      const name = person ? String(person.display_name || '').trim().split(/\s+/).filter(Boolean) : [givenName, familyName];
      const first = name.shift() || givenName, last = name.join(' ') || familyName;
      database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(userId, first, last, email, stamp, stamp);
      database.prepare("INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,'active',?,?,?,?)").run(memberId, invitation.organization_id, userId, invitation.role_id, stamp, stamp, stamp, invitation.person_id || null);
      database.prepare('INSERT INTO production_credentials(user_id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').run(userId, email, passwordHash, stamp, stamp);
      for (const projectId of projectIds) database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(invitation.organization_id, userId, projectId, invitation.invited_by, stamp);
      const accepted = database.prepare("UPDATE organization_invitations SET status='accepted',accepted_by=?,accepted_at=? WHERE id=? AND status='pending'").run(userId, stamp, invitation.id);
      if (Number(accepted.changes) !== 1) throw Object.assign(Error('Cette invitation a déjà été utilisée.'), {status: 409});
      database.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,new_values,created_at) VALUES(?,?,?,?,?,?,?,?)').run('audit-' + randomUUID(), invitation.organization_id, invitation.invited_by, 'member.invitation_accepted', 'organization_invitation', invitation.id, JSON.stringify({user_id:userId,person_id:invitation.person_id || null,role_code:invitation.role_code,project_ids:projectIds}), stamp);
      database.prepare('INSERT INTO production_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(tokenHash(sessionToken, secret), userId, nowMs, nowMs + SESSION_SECONDS * 1000);
      database.exec('COMMIT');
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch {}
      return fail(error.status || 409, error.message || 'Activation refusée.');
    }
    return {status: 200, cookie: cookie(sessionToken), userId, email, organizationId: invitation.organization_id, roleCode: invitation.role_code, personId: invitation.person_id || null, projectIds};
  }
  function logout(header = '') {
    const token = header.split(';').map(value => value.trim()).find(value => value.startsWith(SESSION_COOKIE + '='))?.slice(SESSION_COOKIE.length + 1);
    if (token) database.prepare('UPDATE production_sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(Date.now(), tokenHash(token, secret));
    return cookie('', 0);
  }
  return {session, login, logout, activateInvitation};
}
