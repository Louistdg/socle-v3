-- Keep the uploaded fuel receipt in the private document registry and link it
-- to the exact fuel entry without exposing its cost to field users.
ALTER TABLE field_fuel_entries ADD COLUMN receipt_document_id TEXT;
ALTER TABLE field_fuel_entries ADD COLUMN operation_key TEXT;
CREATE UNIQUE INDEX field_fuel_receipt_document_unique
  ON field_fuel_entries(organization_id,receipt_document_id)
  WHERE receipt_document_id IS NOT NULL;
CREATE UNIQUE INDEX field_fuel_operation_unique
  ON field_fuel_entries(organization_id,operation_key)
  WHERE operation_key IS NOT NULL;
