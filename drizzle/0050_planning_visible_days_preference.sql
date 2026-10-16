-- Company-wide planning visibility. This setting never grants access to
-- planning data or changes role permissions.
CREATE TABLE organization_preferences (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL CHECK (preference_key IN ('planning-visible-days')),
  schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 1000),
  value_json TEXT NOT NULL CHECK (length(value_json) <= 16384 AND json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, preference_key, schema_version)
);

CREATE INDEX organization_preferences_org_idx
  ON organization_preferences(organization_id, preference_key);
