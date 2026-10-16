PRAGMA foreign_keys = ON;

-- Point 7: server-authoritative partial payments and credit notes.
-- Existing 0000-0012 migrations remain immutable.
ALTER TABLE invoices ADD COLUMN legacy_project_id TEXT;
ALTER TABLE invoices ADD COLUMN legacy_source_id TEXT;
ALTER TABLE invoices ADD COLUMN legacy_paid_cents INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_legacy_source_idx
  ON invoices(organization_id,legacy_source_id) WHERE legacy_source_id IS NOT NULL;

ALTER TABLE payments ADD COLUMN note TEXT NOT NULL DEFAULT '';
ALTER TABLE payments ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_idx
  ON payments(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_invoice_idx
  ON payments(organization_id,invoice_id,created_at);

CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  credit_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  reference TEXT,
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  UNIQUE (organization_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS credit_notes_invoice_idx
  ON credit_notes(organization_id,invoice_id,created_at);

-- A payment is an immutable financial event. The trigger checks the current
-- invoice balance in the same database transaction, preventing concurrent
-- final payments from producing an overpayment.
CREATE TRIGGER IF NOT EXISTS payment_validate_before_insert
BEFORE INSERT ON payments
BEGIN
  SELECT CASE WHEN NEW.amount_cents <= 0 THEN RAISE(ABORT,'payment_amount_invalid') END;
  SELECT CASE WHEN NEW.invoice_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM invoices i
    WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.archived_at IS NULL
  ) THEN RAISE(ABORT,'payment_invoice_invalid') END;
  SELECT CASE WHEN NEW.amount_cents > (
    SELECT MAX(0,i.total_cents
      - COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=i.organization_id AND c.invoice_id=i.id),0)
      - i.legacy_paid_cents
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=i.organization_id AND p.invoice_id=i.id),0))
    FROM invoices i WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'payment_overpayment') END;
END;

CREATE TRIGGER IF NOT EXISTS payment_apply_after_insert
AFTER INSERT ON payments
BEGIN
  UPDATE invoices SET
    amount_paid_cents=legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0),
    status=CASE
      WHEN legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0) >
           total_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=NEW.organization_id AND c.invoice_id=NEW.invoice_id),0)
        THEN 'credit_due'
      WHEN total_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=NEW.organization_id AND c.invoice_id=NEW.invoice_id),0) <= 0
        THEN 'credited'
      WHEN legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0) = 0
        THEN 'unpaid'
      WHEN legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0) <
           total_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=NEW.organization_id AND c.invoice_id=NEW.invoice_id),0)
        THEN 'partially_paid'
      ELSE 'paid' END,
    updated_at=NEW.created_at
  WHERE id=NEW.invoice_id AND organization_id=NEW.organization_id;
END;

-- Credit notes are distinct immutable business objects linked to the original
-- invoice. They reduce the net invoice amount but never create a fake refund.
CREATE TRIGGER IF NOT EXISTS credit_note_validate_before_insert
BEFORE INSERT ON credit_notes
BEGIN
  SELECT CASE WHEN NEW.amount_cents <= 0 THEN RAISE(ABORT,'credit_note_amount_invalid') END;
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM invoices i
    WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id AND i.archived_at IS NULL
  ) THEN RAISE(ABORT,'credit_note_invoice_invalid') END;
  SELECT CASE WHEN NEW.amount_cents > (
    SELECT i.total_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=i.organization_id AND c.invoice_id=i.id),0)
    FROM invoices i WHERE i.id=NEW.invoice_id AND i.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'credit_note_excess') END;
END;

CREATE TRIGGER IF NOT EXISTS credit_note_apply_after_insert
AFTER INSERT ON credit_notes
BEGIN
  UPDATE invoices SET
    amount_paid_cents=legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0),
    status=CASE
      WHEN legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0) >
           total_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=NEW.organization_id AND c.invoice_id=NEW.invoice_id),0)
        THEN 'credit_due'
      WHEN total_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=NEW.organization_id AND c.invoice_id=NEW.invoice_id),0) <= 0
        THEN 'credited'
      WHEN legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0) = 0
        THEN 'unpaid'
      WHEN legacy_paid_cents+COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.organization_id=NEW.organization_id AND p.invoice_id=NEW.invoice_id),0) <
           total_cents-COALESCE((SELECT SUM(c.amount_cents) FROM credit_notes c WHERE c.organization_id=NEW.organization_id AND c.invoice_id=NEW.invoice_id),0)
        THEN 'partially_paid'
      ELSE 'paid' END,
    updated_at=NEW.created_at
  WHERE id=NEW.invoice_id AND organization_id=NEW.organization_id;
END;

CREATE TRIGGER IF NOT EXISTS payments_immutable_update
BEFORE UPDATE ON payments BEGIN SELECT RAISE(ABORT,'payment_immutable'); END;
CREATE TRIGGER IF NOT EXISTS payments_immutable_delete
BEFORE DELETE ON payments BEGIN SELECT RAISE(ABORT,'payment_immutable'); END;
CREATE TRIGGER IF NOT EXISTS credit_notes_immutable_update
BEFORE UPDATE ON credit_notes BEGIN SELECT RAISE(ABORT,'credit_note_immutable'); END;
CREATE TRIGGER IF NOT EXISTS credit_notes_immutable_delete
BEFORE DELETE ON credit_notes BEGIN SELECT RAISE(ABORT,'credit_note_immutable'); END;

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('invoices.view','Voir les factures clients serveur'),
 ('payments.create','Enregistrer des paiements clients'),
 ('credit_notes.create','Créer des avoirs clients');
