export const BATINOVA_MANUAL_TEST_ORGANIZATION_ID = 'org-batinova-iae-2026-10-01';

export const BATINOVA_MANUAL_TEST_INVITATIONS = Object.freeze({
  'david.leclercq@socle.test': Object.freeze({roleCode: 'TEAM_LEAD', personId: '1790270195166'}),
  'anthony.simon@socle.test': Object.freeze({roleCode: 'WORKER', personId: '1790270195400'}),
  'sophie.martin@socle.test': Object.freeze({roleCode: 'ACCOUNTING', personId: null})
});

const valueOf = (invitation, snake, camel) => invitation?.[snake] ?? invitation?.[camel] ?? null;

export function manualTestInvitationTarget(invitation) {
  const organizationId = String(valueOf(invitation, 'organization_id', 'organizationId') || '');
  const email = String(invitation?.email || '').trim().toLowerCase();
  const roleCode = String(valueOf(invitation, 'role_code', 'roleCode') || '');
  const personId = valueOf(invitation, 'person_id', 'personId');
  const target = BATINOVA_MANUAL_TEST_INVITATIONS[email];
  if (organizationId !== BATINOVA_MANUAL_TEST_ORGANIZATION_ID || !target) return null;
  if (target.roleCode !== roleCode || (target.personId === null ? personId !== null : String(personId || '') !== target.personId)) return null;
  return target;
}

function activeRosterEntry(entry) {
  if (!entry || entry.active === false || entry.active === 0 || ['false', '0'].includes(String(entry.active).trim().toLowerCase())) return false;
  return !['inactive', 'archived', 'deleted'].includes(String(entry.status || '').trim().toLowerCase());
}

export function batinovaWorkspaceRosterPeople(state) {
  const seen = new Set(), people = [];
  for (const entry of Array.isArray(state?.people) ? state.people : []) {
    if (!activeRosterEntry(entry)) continue;
    const id = String(entry?.id ?? '').trim();
    const name = String(entry?.name || entry?.displayName || [entry?.firstName, entry?.lastName].filter(Boolean).join(' ') || '').trim();
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    people.push({id, name, role: String(entry?.role || entry?.roleTitle || '').trim(), active: true});
  }
  return people;
}

export function batinovaWorkspaceRosterPerson(state, personId) {
  const id = String(personId ?? '').trim();
  if (!id) return null;
  const person = batinovaWorkspaceRosterPeople(state).find(entry => entry.id === id);
  return person ? {id: person.id, display_name: person.name, role_title: person.role, active: 1, source: 'workspace_state'} : null;
}

export function batinovaWorkspaceTeamIds(state, personId, roleCode) {
  const person = batinovaWorkspaceRosterPerson(state, personId);
  if (!person || String(roleCode || '') !== 'TEAM_LEAD' || !/chef/i.test(person.role_title)) return [];
  return [...new Set((Array.isArray(state?.teams) ? state.teams : [])
    .filter(team => activeRosterEntry(team) && Array.isArray(team.members) && team.members.some(member => String(typeof member === 'object' && member ? (member.personId ?? member.person_id ?? member.id) : member) === person.id))
    .map(team => String(team.id || ''))
    .filter(Boolean))].sort();
}

export function manualTestRosterPerson(state, invitation) {
  const target = manualTestInvitationTarget(invitation);
  if (!target?.personId) return null;
  return batinovaWorkspaceRosterPerson(state, target.personId);
}

export function manualTestTeamIds(state, invitation) {
  return manualTestTeamIdsFromTarget(state, invitation);
}

function manualTestTeamIdsFromTarget(state, invitation) {
  const person = manualTestRosterPerson(state, invitation);
  return person ? batinovaWorkspaceTeamIds(state, person.id, valueOf(invitation, 'role_code', 'roleCode')) : [];
}
