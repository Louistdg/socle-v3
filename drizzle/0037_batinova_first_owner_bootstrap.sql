-- Audited, one-time bootstrap for the first real owner of BatiNova.
-- The event is the only permitted write path: its trigger creates the membership.
CREATE TABLE organization_first_owner_bootstraps (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES profiles(id),
  role_id TEXT NOT NULL REFERENCES roles(id),
  membership_id TEXT NOT NULL UNIQUE REFERENCES organization_members(id) DEFERRABLE INITIALLY DEFERRED,
  actor_type TEXT NOT NULL CHECK (actor_type='authorized_operator'),
  actor_channel TEXT NOT NULL CHECK (actor_channel='railway_ssh'),
  authorized_by_email TEXT NOT NULL CHECK (authorized_by_email='louis.masson@outlook.com'),
  action TEXT NOT NULL CHECK (action='first_owner_established'),
  created_at TEXT NOT NULL
);

CREATE TRIGGER organization_first_owner_bootstrap_guard
BEFORE INSERT ON organization_first_owner_bootstraps
WHEN NEW.organization_id<>'org-batinova-iae-2026-10-01'
  OR NEW.actor_type<>'authorized_operator'
  OR NEW.actor_channel<>'railway_ssh'
  OR NEW.authorized_by_email<>'louis.masson@outlook.com'
  OR NEW.action<>'first_owner_established'
  OR COALESCE((SELECT lower(trim(email)) FROM profiles WHERE id=NEW.user_id),'')<>'louis.masson@outlook.com'
  OR COALESCE((SELECT identity_kind FROM profiles WHERE id=NEW.user_id),'')<>'account'
  OR NOT EXISTS(
    SELECT 1 FROM production_credentials c
    WHERE c.user_id=NEW.user_id
      AND lower(c.email)='louis.masson@outlook.com'
      AND c.disabled_at IS NULL
  )
  OR EXISTS(SELECT 1 FROM local_test_identities WHERE profile_id=NEW.user_id)
  OR EXISTS(SELECT 1 FROM provenance_actor_map WHERE profile_id=NEW.user_id)
  OR NOT EXISTS(
    SELECT 1 FROM roles r
    WHERE r.id=NEW.role_id
      AND r.organization_id=NEW.organization_id
      AND r.code='OWNER'
  )
  OR EXISTS(SELECT 1 FROM organization_members WHERE organization_id=NEW.organization_id)
  OR EXISTS(SELECT 1 FROM organization_invitations WHERE organization_id=NEW.organization_id AND status='pending')
BEGIN
  SELECT RAISE(ABORT,'BatiNova first-owner bootstrap preconditions failed');
END;

CREATE TRIGGER organization_first_owner_bootstrap_apply
AFTER INSERT ON organization_first_owner_bootstraps
BEGIN
  INSERT INTO organization_members(
    id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id
  ) VALUES(
    NEW.membership_id,NEW.organization_id,NEW.user_id,NEW.role_id,
    'active',NEW.created_at,NEW.created_at,NEW.created_at,NULL
  );
END;

CREATE TRIGGER organization_first_owner_bootstrap_immutable_update
BEFORE UPDATE ON organization_first_owner_bootstraps
BEGIN
  SELECT RAISE(ABORT,'BatiNova first-owner bootstrap audit is immutable');
END;

CREATE TRIGGER organization_first_owner_bootstrap_immutable_delete
BEFORE DELETE ON organization_first_owner_bootstraps
BEGIN
  SELECT RAISE(ABORT,'BatiNova first-owner bootstrap audit is immutable');
END;
