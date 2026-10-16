PRAGMA foreign_keys = ON;

-- The owner activity timeline reads the most recent audit events per organization.
CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx
ON audit_logs(organization_id,created_at DESC);
