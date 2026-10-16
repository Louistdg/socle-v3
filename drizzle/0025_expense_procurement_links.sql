PRAGMA foreign_keys = ON;

-- Link supplier expenses to the procurement documents that caused them.
-- Purchase orders are still stored in the canonical organization workspace,
-- so their id is validated by the server rather than by a SQLite foreign key.
ALTER TABLE expenses ADD COLUMN purchase_order_id TEXT;
ALTER TABLE expenses ADD COLUMN delivery_note_id TEXT REFERENCES field_delivery_notes(id);

CREATE INDEX IF NOT EXISTS expenses_purchase_order_idx
ON expenses(organization_id,purchase_order_id,expense_date);

CREATE INDEX IF NOT EXISTS expenses_delivery_note_idx
ON expenses(organization_id,delivery_note_id,expense_date);
