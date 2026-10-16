PRAGMA foreign_keys = ON;

-- Self-service UI preferences are isolated by active tenant membership and user.
-- They are configuration only: this table is never consulted by accessPolicy.
CREATE TABLE IF NOT EXISTS user_preferences (
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  namespace TEXT NOT NULL CHECK (namespace IN ('dashboard','quick-actions','saved-views','resume')),
  preference_key TEXT NOT NULL CHECK (length(preference_key) BETWEEN 1 AND 80),
  schema_version INTEGER NOT NULL CHECK (schema_version BETWEEN 1 AND 1000),
  value_json TEXT NOT NULL CHECK (length(value_json) <= 16384 AND json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id, namespace, preference_key, schema_version),
  FOREIGN KEY (organization_id, user_id)
    REFERENCES organization_members(organization_id, user_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS user_preferences_user_idx
  ON user_preferences(organization_id, user_id, namespace, preference_key);
