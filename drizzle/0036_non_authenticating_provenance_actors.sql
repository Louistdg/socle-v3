-- Historical actors preserve authorship without becoming login identities.
ALTER TABLE profiles ADD COLUMN identity_kind TEXT NOT NULL DEFAULT 'account'
  CHECK (identity_kind IN ('account','provenance'));

CREATE TABLE tenant_imports (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id),
  source_dataset TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256)=64),
  imported_at TEXT NOT NULL
);

CREATE TABLE provenance_actor_map (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  source_profile_id TEXT NOT NULL,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  source_person_id TEXT,
  display_name TEXT NOT NULL,
  source_dataset TEXT NOT NULL,
  PRIMARY KEY (organization_id, source_profile_id),
  UNIQUE (profile_id)
);

CREATE TRIGGER provenance_actor_map_kind_insert
BEFORE INSERT ON provenance_actor_map
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.profile_id),'account')<>'provenance'
BEGIN SELECT RAISE(ABORT,'provenance map must reference a provenance actor'); END;

CREATE TRIGGER profiles_identity_kind_guard_update
BEFORE UPDATE OF identity_kind ON profiles
WHEN NEW.identity_kind='provenance' AND OLD.identity_kind<>'provenance'
 AND (
   EXISTS(SELECT 1 FROM organization_members WHERE user_id=NEW.id)
   OR EXISTS(SELECT 1 FROM production_credentials WHERE user_id=NEW.id)
   OR EXISTS(SELECT 1 FROM project_access WHERE user_id=NEW.id)
 )
BEGIN SELECT RAISE(ABORT,'account with membership or authorization cannot become a provenance actor'); END;

CREATE TRIGGER organization_members_account_insert
BEFORE INSERT ON organization_members
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.user_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot be an organization member'); END;

CREATE TRIGGER organization_members_account_update
BEFORE UPDATE OF user_id ON organization_members
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.user_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot be an organization member'); END;

CREATE TRIGGER local_test_identity_account_insert
BEFORE INSERT ON local_test_identities
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.profile_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot have a local test identity'); END;

CREATE TRIGGER local_test_identity_account_update
BEFORE UPDATE OF profile_id ON local_test_identities
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.profile_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot have a local test identity'); END;

CREATE TRIGGER production_credentials_account_insert
BEFORE INSERT ON production_credentials
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.user_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot have production credentials'); END;

CREATE TRIGGER production_credentials_account_update
BEFORE UPDATE OF user_id ON production_credentials
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.user_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot have production credentials'); END;

CREATE TRIGGER project_access_account_insert
BEFORE INSERT ON project_access
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.user_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot receive project access'); END;

CREATE TRIGGER project_access_account_update
BEFORE UPDATE OF user_id ON project_access
WHEN COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.user_id),'account')<>'account'
BEGIN SELECT RAISE(ABORT,'provenance actor cannot receive project access'); END;
