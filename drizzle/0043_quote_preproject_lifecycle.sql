PRAGMA foreign_keys = ON;

-- E2E-02 QUOTE-PREPROJECT-LIFECYCLE
-- Allow a commercial quote to exist before a project is created.
-- Existing project-linked quotes and amendments are preserved exactly.

CREATE TABLE quotes_server_v0043 (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT,
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
  customer_id TEXT,
  UNIQUE(organization_id,reference)
);

INSERT INTO quotes_server_v0043(
  id,organization_id,project_id,reference,status,title,client_name,client_address,
  issue_date,valid_until,deposit_percent,payment_terms,notes,exclusions,lines_json,
  created_by,created_at,updated_at,archived_at,customer_id
)
SELECT
  id,organization_id,project_id,reference,status,title,client_name,client_address,
  issue_date,valid_until,deposit_percent,payment_terms,notes,exclusions,lines_json,
  created_by,created_at,updated_at,archived_at,customer_id
FROM quotes_server;

-- quote_amendments owns the only FK that points at quotes_server. Rebuild it
-- against the replacement parent before dropping the old table so FK checks stay
-- valid throughout the transactional production migration.
CREATE TABLE quote_amendments_v0043 (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  quote_id TEXT NOT NULL REFERENCES quotes_server_v0043(id),
  project_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL,
  vat_amount_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','accepted','rejected')),
  effective_date TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (organization_id,reference)
);

INSERT INTO quote_amendments_v0043(
  id,organization_id,quote_id,project_id,reference,title,reason,amount_cents,
  vat_amount_cents,total_cents,status,effective_date,notes,created_by,created_at,
  updated_at,archived_at
)
SELECT
  id,organization_id,quote_id,project_id,reference,title,reason,amount_cents,
  vat_amount_cents,total_cents,status,effective_date,notes,created_by,created_at,
  updated_at,archived_at
FROM quote_amendments;

DROP TABLE quote_amendments;
DROP TABLE quotes_server;

ALTER TABLE quotes_server_v0043 RENAME TO quotes_server;
ALTER TABLE quote_amendments_v0043 RENAME TO quote_amendments;

CREATE INDEX quotes_server_org_project_idx
  ON quotes_server(organization_id,project_id,archived_at);

CREATE INDEX quotes_server_org_reference_idx
  ON quotes_server(organization_id,reference);

CREATE INDEX quotes_server_org_customer_idx
  ON quotes_server(organization_id,customer_id,archived_at);

CREATE INDEX quote_amendments_quote_idx
  ON quote_amendments(organization_id,quote_id,status,created_at);
