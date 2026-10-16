PRAGMA foreign_keys = ON;

ALTER TABLE expenses ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_org_idempotency_idx ON expenses(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Quotes became server-authoritative in 0016. The legacy import is explicit and idempotent,
-- so old workspaces can be upgraded without making GET requests mutate state.
CREATE INDEX IF NOT EXISTS quotes_server_org_reference_idx ON quotes_server(organization_id,reference);
