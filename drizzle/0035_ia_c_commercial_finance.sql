PRAGMA foreign_keys = ON;

-- IA-C commercial + banking extensions.
ALTER TABLE quotes_server ADD COLUMN customer_id TEXT;

CREATE INDEX IF NOT EXISTS quotes_server_org_customer_idx
ON quotes_server(organization_id,customer_id,archived_at);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  bank_account_id TEXT NOT NULL REFERENCES bank_accounts(id),
  transaction_date TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  counterparty_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'unreconciled' CHECK (status IN ('unreconciled','reconciled','ignored')),
  match_type TEXT CHECK (match_type IS NULL OR match_type IN ('invoice','expense')),
  match_id TEXT,
  reconciled_at TEXT,
  reconciled_by TEXT REFERENCES profiles(id),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id,idempotency_key),
  CHECK (
    (status='reconciled' AND match_type IS NOT NULL AND match_id IS NOT NULL AND reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL)
    OR
    (status<>'reconciled' AND match_type IS NULL AND match_id IS NULL AND reconciled_at IS NULL AND reconciled_by IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS bank_transactions_org_date_idx
ON bank_transactions(organization_id,transaction_date,id);

CREATE INDEX IF NOT EXISTS bank_transactions_reconciliation_idx
ON bank_transactions(organization_id,status,bank_account_id,transaction_date);

CREATE TABLE IF NOT EXISTS quote_amendments (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  quote_id TEXT NOT NULL REFERENCES quotes_server(id),
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

CREATE INDEX IF NOT EXISTS quote_amendments_quote_idx
ON quote_amendments(organization_id,quote_id,status,created_at);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('customers.view','Voir l’annuaire clients serveur'),
 ('customers.create','Créer un client serveur'),
 ('customers.edit','Modifier un client serveur'),
 ('suppliers.edit','Modifier un fournisseur serveur'),
 ('bank.view','Voir comptes et mouvements bancaires'),
 ('bank.manage','Importer et gérer les mouvements bancaires'),
 ('bank.reconcile','Rapprocher les mouvements bancaires'),
 ('quote_amendments.view','Voir les avenants commerciaux'),
 ('quote_amendments.create','Créer et modifier les avenants commerciaux');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'customers.view' FROM role_permissions WHERE permission_code IN ('invoices.view','quotes.view');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'customers.create' FROM role_permissions WHERE permission_code IN ('invoices.create','quotes.create');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'customers.edit' FROM role_permissions WHERE permission_code IN ('invoices.create','quotes.edit');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'suppliers.edit' FROM role_permissions WHERE permission_code IN ('expenses.create','expenses.view');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'bank.view' FROM role_permissions WHERE permission_code IN ('accounting.view','financial.dashboard.view');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'bank.manage' FROM role_permissions WHERE permission_code IN ('expenses.create','invoices.create');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'bank.reconcile' FROM role_permissions WHERE permission_code IN ('payments.create','supplier_payments.manage');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'quote_amendments.view' FROM role_permissions WHERE permission_code IN ('quotes.view','quotes.prices.view');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'quote_amendments.create' FROM role_permissions WHERE permission_code IN ('quotes.create','quotes.edit');
