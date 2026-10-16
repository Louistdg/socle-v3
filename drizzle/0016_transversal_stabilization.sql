PRAGMA foreign_keys = ON;

ALTER TABLE organization_members ADD COLUMN person_id TEXT;
CREATE INDEX IF NOT EXISTS organization_members_person_idx ON organization_members(organization_id, person_id, status);

CREATE TABLE IF NOT EXISTS organization_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  email TEXT NOT NULL,
  person_id TEXT,
  role_id TEXT NOT NULL REFERENCES roles(id),
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('pending','accepted','revoked','expired')),
  expires_at TEXT NOT NULL,
  invited_by TEXT NOT NULL REFERENCES profiles(id),
  accepted_by TEXT REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS organization_invitations_org_email_idx ON organization_invitations(organization_id,email,status);

CREATE TABLE IF NOT EXISTS legacy_domain_imports (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  domain TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(organization_id,domain)
);

CREATE TABLE IF NOT EXISTS quotes_server (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_address TEXT NOT NULL DEFAULT '',
  issue_date TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  deposit_percent INTEGER NOT NULL DEFAULT 0,
  payment_terms TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  exclusions TEXT NOT NULL DEFAULT '',
  lines_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE(organization_id,reference)
);
CREATE INDEX IF NOT EXISTS quotes_server_org_project_idx ON quotes_server(organization_id,project_id,archived_at);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('quotes.view','Consulter les devis serveur'),
 ('quotes.create','Créer les devis serveur'),
 ('quotes.edit','Modifier les devis serveur'),
 ('members.invite','Inviter des membres'),
 ('members.view.organizations','Lister ses organisations');

-- Migrate known local simulation links into the production membership relation.
UPDATE organization_members
SET person_id=(SELECT li.person_id FROM local_test_identities li WHERE li.organization_id=organization_members.organization_id AND li.profile_id=organization_members.user_id LIMIT 1)
WHERE person_id IS NULL AND EXISTS(SELECT 1 FROM local_test_identities li WHERE li.organization_id=organization_members.organization_id AND li.profile_id=organization_members.user_id);

-- Local-test compatibility only: when the local harness creates a simulated identity
-- after migrations, copy its person link into the production membership relation.
CREATE TRIGGER IF NOT EXISTS local_test_identity_member_person_insert
AFTER INSERT ON local_test_identities
BEGIN
  UPDATE organization_members SET person_id=NEW.person_id
  WHERE organization_id=NEW.organization_id AND user_id=NEW.profile_id AND person_id IS NULL;
END;
CREATE TRIGGER IF NOT EXISTS local_test_identity_member_person_update
AFTER UPDATE OF person_id,profile_id ON local_test_identities
BEGIN
  UPDATE organization_members SET person_id=NEW.person_id
  WHERE organization_id=NEW.organization_id AND user_id=NEW.profile_id;
END;

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'quotes.view' FROM role_permissions WHERE permission_code='ui.module.quotes.view';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'quotes.create' FROM role_permissions WHERE permission_code='ui.module.quotes.add';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'quotes.edit' FROM role_permissions WHERE permission_code='ui.module.quotes.edit';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'members.invite' FROM role_permissions WHERE permission_code='ui.sensitive.manageAccess';
