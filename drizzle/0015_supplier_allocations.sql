PRAGMA foreign_keys = ON;

-- Point 9: financial allocation of supplier expenses/invoices.
ALTER TABLE expenses ADD COLUMN supplier_reference TEXT NOT NULL DEFAULT '';

-- The expense remains the single financial source. Allocations describe where
-- its HTVA cost belongs; they never create stock movements or duplicate files.
CREATE TABLE IF NOT EXISTS supplier_allocations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  destination_type TEXT NOT NULL CHECK (destination_type IN ('project','stock','vehicle','asset','overhead')),
  destination_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  label TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  reference TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  cancelled_by TEXT REFERENCES profiles(id),
  cancelled_at TEXT,
  cancellation_reason TEXT NOT NULL DEFAULT '',
  UNIQUE (organization_id,idempotency_key),
  CHECK (
    (destination_type IN ('project','vehicle','asset') AND destination_id IS NOT NULL AND length(trim(destination_id)) > 0)
    OR (destination_type IN ('stock','overhead') AND destination_id IS NULL)
  ),
  CHECK (
    (status='active' AND cancelled_by IS NULL AND cancelled_at IS NULL)
    OR (status='cancelled' AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND length(trim(cancellation_reason)) > 0)
  )
);
CREATE INDEX IF NOT EXISTS supplier_allocations_expense_idx
  ON supplier_allocations(organization_id,expense_id,status,created_at);
CREATE INDEX IF NOT EXISTS supplier_allocations_destination_idx
  ON supplier_allocations(organization_id,destination_type,destination_id,status);

-- The allocation base is the supplier expense HTVA (subtotal_cents). VAT and
-- the original expense totals are never rewritten by allocation operations.
CREATE TRIGGER IF NOT EXISTS supplier_allocation_validate_insert
BEFORE INSERT ON supplier_allocations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM expenses e
    WHERE e.id=NEW.expense_id AND e.organization_id=NEW.organization_id AND e.archived_at IS NULL
  ) THEN RAISE(ABORT,'supplier_allocation_expense_invalid') END;
  SELECT CASE WHEN NEW.amount_cents <= 0 THEN RAISE(ABORT,'supplier_allocation_amount_invalid') END;
  SELECT CASE WHEN NEW.status <> 'active' THEN RAISE(ABORT,'supplier_allocation_status_invalid') END;
  SELECT CASE WHEN NEW.amount_cents > (
    SELECT e.subtotal_cents - COALESCE((
      SELECT SUM(a.amount_cents) FROM supplier_allocations a
      WHERE a.organization_id=e.organization_id AND a.expense_id=e.id AND a.status='active'
    ),0)
    FROM expenses e WHERE e.id=NEW.expense_id AND e.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'supplier_allocation_exceeds_remaining') END;
END;

-- Amount, destination, ownership and provenance are immutable. The only
-- supported mutation is an explicit audited cancellation.
CREATE TRIGGER IF NOT EXISTS supplier_allocation_validate_update
BEFORE UPDATE ON supplier_allocations
BEGIN
  SELECT CASE WHEN
    OLD.organization_id<>NEW.organization_id OR OLD.expense_id<>NEW.expense_id OR
    OLD.destination_type<>NEW.destination_type OR COALESCE(OLD.destination_id,'')<>COALESCE(NEW.destination_id,'') OR
    OLD.amount_cents<>NEW.amount_cents OR OLD.label<>NEW.label OR OLD.note<>NEW.note OR
    OLD.reference<>NEW.reference OR OLD.idempotency_key<>NEW.idempotency_key OR
    OLD.created_by<>NEW.created_by OR OLD.created_at<>NEW.created_at
  THEN RAISE(ABORT,'supplier_allocation_immutable') END;
  SELECT CASE WHEN OLD.status='cancelled' THEN RAISE(ABORT,'supplier_allocation_immutable') END;
  SELECT CASE WHEN NEW.status<>'cancelled' OR NEW.cancelled_by IS NULL OR NEW.cancelled_at IS NULL OR length(trim(NEW.cancellation_reason))=0
    THEN RAISE(ABORT,'supplier_allocation_cancel_invalid') END;
END;
CREATE TRIGGER IF NOT EXISTS supplier_allocation_no_delete
BEFORE DELETE ON supplier_allocations
BEGIN
  SELECT RAISE(ABORT,'supplier_allocation_immutable');
END;

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('supplier_allocations.view','Voir la ventilation des factures fournisseurs'),
 ('supplier_allocations.create','Ventiler une facture fournisseur'),
 ('supplier_allocations.cancel','Annuler une ventilation fournisseur avec traçabilité');

-- Preserve existing financial-role intent without granting these rights to
-- unrelated collaborators. Future changes are still managed by the RBAC UI.
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'supplier_allocations.view' FROM role_permissions WHERE permission_code='accounting.view';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'supplier_allocations.create' FROM role_permissions WHERE permission_code='expenses.create';
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'supplier_allocations.cancel' FROM role_permissions WHERE permission_code='credit_notes.create';
