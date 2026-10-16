PRAGMA foreign_keys = ON;

-- Canonical legacy workspace snapshot, now scoped by organization instead of owner user.
-- The historical workspace_state table stays untouched for rollback/reference only.
CREATE TABLE IF NOT EXISTS organization_workspace_state (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id),
  payload TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  source_user_id TEXT REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Preserve the historical snapshot of the earliest active OWNER for each organization.
-- If several owners already have different legacy snapshots, choose deterministically
-- instead of allowing each owner to keep a separate source of truth.
INSERT OR IGNORE INTO organization_workspace_state(
  organization_id,payload,revision,source_user_id,created_at,updated_at
)
SELECT
  om.organization_id,
  ws.payload,
  ws.revision,
  ws.user_id,
  ws.updated_at,
  ws.updated_at
FROM organization_members om
JOIN roles r ON r.id=om.role_id
JOIN workspace_state ws ON ws.user_id=om.user_id
WHERE om.status='active'
  AND r.code='OWNER'
  AND om.user_id=(
    SELECT om2.user_id
    FROM organization_members om2
    JOIN roles r2 ON r2.id=om2.role_id
    JOIN workspace_state ws2 ON ws2.user_id=om2.user_id
    WHERE om2.organization_id=om.organization_id
      AND om2.status='active'
      AND r2.code='OWNER'
    ORDER BY COALESCE(om2.joined_at,om2.created_at),om2.user_id
    LIMIT 1
  );

CREATE INDEX IF NOT EXISTS organization_workspace_state_updated_idx
  ON organization_workspace_state(updated_at);
