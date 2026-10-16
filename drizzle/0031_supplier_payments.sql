PRAGMA foreign_keys = ON;

-- Structured supplier payments + supplier due dates.
-- Existing expenses remain the authoritative supplier invoice rows.
ALTER TABLE expenses ADD COLUMN due_date TEXT;
ALTER TABLE expenses ADD COLUMN vat_rate_bps INTEGER;

CREATE INDEX IF NOT EXISTS expenses_due_date_idx
ON expenses(organization_id,payment_status,due_date)
WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_date TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  reference TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  voided_by TEXT REFERENCES profiles(id),
  voided_at TEXT,
  void_reason TEXT NOT NULL DEFAULT '',
  UNIQUE (organization_id,idempotency_key),
  CHECK (
    (status='active' AND voided_by IS NULL AND voided_at IS NULL AND void_reason='')
    OR
    (status='voided' AND voided_by IS NOT NULL AND voided_at IS NOT NULL AND length(trim(void_reason)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS supplier_payments_expense_idx
ON supplier_payments(organization_id,expense_id,status,payment_date,created_at);

CREATE TRIGGER IF NOT EXISTS supplier_payment_validate_insert
BEFORE INSERT ON supplier_payments
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM expenses e
    WHERE e.id=NEW.expense_id
      AND e.organization_id=NEW.organization_id
      AND e.archived_at IS NULL
  ) THEN RAISE(ABORT,'supplier_payment_expense_invalid') END;

  SELECT CASE WHEN NEW.amount_cents <= 0
    THEN RAISE(ABORT,'supplier_payment_amount_invalid') END;

  SELECT CASE WHEN NEW.amount_cents > (
    SELECT e.total_cents - COALESCE((
      SELECT SUM(p.amount_cents)
      FROM supplier_payments p
      WHERE p.organization_id=e.organization_id
        AND p.expense_id=e.id
        AND p.status='active'
    ),0)
    FROM expenses e
    WHERE e.id=NEW.expense_id
      AND e.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'supplier_payment_exceeds_outstanding') END;
END;

CREATE TRIGGER IF NOT EXISTS supplier_payment_validate_update
BEFORE UPDATE ON supplier_payments
BEGIN
  SELECT CASE WHEN
    OLD.organization_id<>NEW.organization_id OR
    OLD.expense_id<>NEW.expense_id OR
    OLD.amount_cents<>NEW.amount_cents OR
    OLD.payment_date<>NEW.payment_date OR
    OLD.payment_method<>NEW.payment_method OR
    OLD.reference<>NEW.reference OR
    OLD.note<>NEW.note OR
    OLD.idempotency_key<>NEW.idempotency_key OR
    OLD.created_by<>NEW.created_by OR
    OLD.created_at<>NEW.created_at
  THEN RAISE(ABORT,'supplier_payment_immutable') END;

  SELECT CASE WHEN OLD.status<>'active' OR NEW.status<>'voided'
    THEN RAISE(ABORT,'supplier_payment_transition_invalid') END;

  SELECT CASE WHEN NEW.voided_by IS NULL OR NEW.voided_at IS NULL OR length(trim(NEW.void_reason))=0
    THEN RAISE(ABORT,'supplier_payment_void_invalid') END;
END;

CREATE TRIGGER IF NOT EXISTS supplier_payment_no_delete
BEFORE DELETE ON supplier_payments
BEGIN
  SELECT RAISE(ABORT,'supplier_payment_immutable');
END;

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('supplier_payments.view','Voir les paiements des factures fournisseurs'),
 ('supplier_payments.manage','Enregistrer et annuler les paiements des factures fournisseurs');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'supplier_payments.view'
  FROM role_permissions
  WHERE permission_code IN ('expenses.view','accounting.view');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'supplier_payments.manage'
  FROM role_permissions
  WHERE permission_code='expenses.create';

-- Convert legacy "paid" flags into auditable full supplier payments.
INSERT OR IGNORE INTO supplier_payments(
  id,organization_id,expense_id,amount_cents,payment_date,payment_method,
  reference,note,idempotency_key,status,created_by,created_at
)
SELECT
  'legacy-supplier-payment-' || e.id,
  e.organization_id,
  e.id,
  e.total_cents,
  COALESCE(e.payment_date,e.expense_date),
  'legacy',
  COALESCE(e.supplier_reference,''),
  'Migration 0031 · paiement historique déclaré payé',
  'legacy-supplier-payment:' || e.id,
  'active',
  e.created_by,
  e.created_at
FROM expenses e
WHERE e.archived_at IS NULL
  AND e.payment_status='paid'
  AND e.total_cents>0;
