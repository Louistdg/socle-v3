PRAGMA foreign_keys = ON;

-- Product simulation registry: every reproducible scenario is versioned per organization.
CREATE TABLE IF NOT EXISTS simulation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  script_code TEXT NOT NULL,
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  applied_by TEXT NOT NULL REFERENCES profiles(id),
  summary_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE (organization_id,script_code,version)
);
CREATE INDEX IF NOT EXISTS simulation_runs_org_idx
  ON simulation_runs(organization_id,applied_at);

-- Client invoices can now be created through the authoritative server route.
INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('invoices.create','Créer une facture client');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'invoices.create'
  FROM role_permissions
  WHERE permission_code='expenses.create';
