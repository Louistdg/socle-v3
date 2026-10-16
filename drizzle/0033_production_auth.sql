-- Production authentication is independent of simulation identities.
-- No profile, organization, role, credential or session is seeded here.
CREATE TABLE production_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES profiles(id),
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  disabled_at TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE production_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES production_credentials(user_id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  CHECK (expires_at > created_at)
);
CREATE INDEX production_sessions_user_idx ON production_sessions(user_id, expires_at);
