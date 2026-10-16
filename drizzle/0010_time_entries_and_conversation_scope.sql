PRAGMA foreign_keys = ON;

-- Pointages métier : source de vérité serveur à partir du point 5.
CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  team_id TEXT,
  people_json TEXT NOT NULL DEFAULT '[]',
  work_date TEXT NOT NULL,
  arrival TEXT NOT NULL,
  departure TEXT,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS time_entries_org_date_idx ON time_entries(organization_id,work_date,project_id);
CREATE INDEX IF NOT EXISTS time_entries_org_project_idx ON time_entries(organization_id,project_id,archived_at);

CREATE TABLE IF NOT EXISTS time_entry_corrections (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  time_entry_id TEXT NOT NULL REFERENCES time_entries(id),
  person_id TEXT,
  original_arrival TEXT NOT NULL,
  original_departure TEXT,
  proposed_arrival TEXT NOT NULL,
  proposed_departure TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')) DEFAULT 'pending',
  requested_by TEXT NOT NULL REFERENCES profiles(id),
  requested_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES profiles(id),
  reviewed_at TEXT,
  result_entry_id TEXT REFERENCES time_entries(id)
);
CREATE INDEX IF NOT EXISTS time_entry_corrections_entry_idx ON time_entry_corrections(time_entry_id,status,requested_at);

-- Marqueur de reprise des anciens job.timeEntries afin de ne pas réimporter deux fois.
CREATE TABLE IF NOT EXISTS time_entry_imports (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id),
  imported_at TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('time_entries.view.team','Voir les pointages de son équipe autorisée'),
 ('time_entries.create.team','Encoder les pointages de son équipe autorisée'),
 ('time_entries.view.all','Voir les pointages de tous ses chantiers autorisés'),
 ('time_entries.correction.request','Demander une correction de pointage'),
 ('time_entries.correction.review','Valider ou refuser une correction de pointage');

-- Point 6 : une conversation d'équipe possède maintenant un périmètre explicite.
ALTER TABLE conversations ADD COLUMN team_id TEXT;
ALTER TABLE conversations ADD COLUMN scope_project_id TEXT;
CREATE INDEX IF NOT EXISTS conversations_team_idx ON conversations(organization_id,team_id,updated_at);
CREATE INDEX IF NOT EXISTS conversations_scope_project_idx ON conversations(organization_id,scope_project_id,updated_at);

-- Conserver les capacités déjà attendues par les profils historiques de la simulation.
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT id,'time_entries.correction.request' FROM roles WHERE code IN ('WORKER','PROJECT_MANAGER');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT id,'time_entries.view.team' FROM roles WHERE code='PROJECT_MANAGER';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT id,'time_entries.create.team' FROM roles WHERE code='PROJECT_MANAGER';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT id,'time_entries.view.all' FROM roles WHERE code='PROJECT_MANAGER';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT id,'time_entries.correction.review' FROM roles WHERE code='PROJECT_MANAGER';

-- Les rôles individualisés créés par l'écran Droits d'accès héritent des
-- permissions métier correspondant aux cases déjà cochées dans l'UI.
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT rp.role_id,'time_entries.correction.request'
FROM role_permissions rp WHERE rp.permission_code='ui.field.requestTimeCorrection';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT rp.role_id,'time_entries.correction.review'
FROM role_permissions rp WHERE rp.permission_code='ui.field.approveTimeCorrection';

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT om.role_id,'time_entries.view.team'
FROM organization_members om
JOIN member_access_settings mas ON mas.organization_id=om.organization_id AND mas.user_id=om.user_id
WHERE mas.profile_name IN ('Chef d’équipe','Gestionnaire de chantier');
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT om.role_id,'time_entries.create.team'
FROM organization_members om
JOIN member_access_settings mas ON mas.organization_id=om.organization_id AND mas.user_id=om.user_id
WHERE mas.profile_name IN ('Chef d’équipe','Gestionnaire de chantier');
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT om.role_id,'time_entries.view.all'
FROM organization_members om
JOIN member_access_settings mas ON mas.organization_id=om.organization_id AND mas.user_id=om.user_id
WHERE mas.profile_name='Gestionnaire de chantier';
