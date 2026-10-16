PRAGMA foreign_keys = ON;

-- Phase A 0026: immutable matching between a supplier invoice allocation,
-- a purchase-order line kept in organization_workspace_state and a received
-- delivery line. Purchase-order ids remain server-validated because there is
-- no canonical D1 purchase_order_lines table yet.
CREATE TABLE IF NOT EXISTS supplier_invoice_matches (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  expense_id TEXT NOT NULL REFERENCES expenses(id),
  allocation_id TEXT NOT NULL REFERENCES supplier_allocations(id),
  project_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_line_id TEXT NOT NULL,
  delivery_note_id TEXT NOT NULL REFERENCES field_delivery_notes(id),
  delivery_line_id TEXT NOT NULL REFERENCES field_delivery_lines(id),
  matched_cents INTEGER NOT NULL CHECK (matched_cents > 0),
  matched_quantity_milli INTEGER NOT NULL CHECK (matched_quantity_milli > 0),
  operation_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','voided')),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  voided_by TEXT REFERENCES profiles(id),
  voided_at TEXT,
  UNIQUE (organization_id,operation_key),
  CHECK (
    (status='active' AND voided_by IS NULL AND voided_at IS NULL)
    OR
    (status='voided' AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS supplier_invoice_matches_expense_idx
ON supplier_invoice_matches(organization_id,expense_id,status,created_at);

CREATE INDEX IF NOT EXISTS supplier_invoice_matches_allocation_idx
ON supplier_invoice_matches(organization_id,allocation_id,status,created_at);

CREATE INDEX IF NOT EXISTS supplier_invoice_matches_delivery_line_idx
ON supplier_invoice_matches(organization_id,delivery_line_id,status,created_at);

-- Economic identity and amounts never change. The only supported mutation is
-- active -> voided, with an actor and timestamp.
CREATE TRIGGER IF NOT EXISTS supplier_invoice_match_validate_update
BEFORE UPDATE ON supplier_invoice_matches
BEGIN
  SELECT CASE WHEN
    OLD.organization_id<>NEW.organization_id OR
    OLD.expense_id<>NEW.expense_id OR
    OLD.allocation_id<>NEW.allocation_id OR
    OLD.project_id<>NEW.project_id OR
    OLD.order_id<>NEW.order_id OR
    OLD.order_line_id<>NEW.order_line_id OR
    OLD.delivery_note_id<>NEW.delivery_note_id OR
    OLD.delivery_line_id<>NEW.delivery_line_id OR
    OLD.matched_cents<>NEW.matched_cents OR
    OLD.matched_quantity_milli<>NEW.matched_quantity_milli OR
    OLD.operation_key<>NEW.operation_key OR
    OLD.created_by<>NEW.created_by OR
    OLD.created_at<>NEW.created_at
  THEN RAISE(ABORT,'supplier_invoice_match_immutable') END;
  SELECT CASE WHEN OLD.status<>'active' OR NEW.status<>'voided'
    THEN RAISE(ABORT,'supplier_invoice_match_transition_invalid') END;
  SELECT CASE WHEN NEW.voided_by IS NULL OR NEW.voided_at IS NULL OR
    NEW.updated_by<>NEW.voided_by OR NEW.updated_at<>NEW.voided_at
    THEN RAISE(ABORT,'supplier_invoice_match_void_invalid') END;
END;

CREATE TRIGGER IF NOT EXISTS supplier_invoice_match_no_delete
BEFORE DELETE ON supplier_invoice_matches
BEGIN
  SELECT RAISE(ABORT,'supplier_invoice_match_immutable');
END;

-- An allocation cannot be cancelled while it still carries an active match.
-- Correct lifecycle: void match first, then cancel the allocation.
CREATE TRIGGER IF NOT EXISTS supplier_allocation_block_cancel_with_active_match
BEFORE UPDATE OF status ON supplier_allocations
WHEN OLD.status='active' AND NEW.status='cancelled'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM supplier_invoice_matches m
    WHERE m.organization_id=OLD.organization_id
      AND m.allocation_id=OLD.id
      AND m.status='active'
  ) THEN RAISE(ABORT,'supplier_allocation_has_active_matches') END;
END;

INSERT OR IGNORE INTO permissions(code,description)
VALUES(
  'supplier_invoice_matches.manage',
  'Créer et annuler les rapprochements entre factures fournisseur, commandes et livraisons'
);
