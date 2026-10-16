PRAGMA foreign_keys = ON;

-- Point 6: stock multi-emplacement. 0011 remains untouched.
CREATE TABLE IF NOT EXISTS stock_locations (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('warehouse','vehicle','project','internal','legacy','unknown')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,name)
);
CREATE INDEX IF NOT EXISTS stock_locations_org_idx ON stock_locations(organization_id,status,name);

CREATE TABLE IF NOT EXISTS stock_balances (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  stock_item_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,stock_item_id,location_id),
  FOREIGN KEY (organization_id,stock_item_id) REFERENCES field_stock_items(organization_id,id),
  FOREIGN KEY (organization_id,location_id) REFERENCES stock_locations(organization_id,id)
);
CREATE INDEX IF NOT EXISTS stock_balances_location_idx ON stock_balances(organization_id,location_id,stock_item_id);

ALTER TABLE field_stock_movements ADD COLUMN source_location_id TEXT;
ALTER TABLE field_stock_movements ADD COLUMN destination_location_id TEXT;
ALTER TABLE field_stock_movements ADD COLUMN reference TEXT;
ALTER TABLE field_stock_movements ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS field_stock_movements_idempotency_idx ON field_stock_movements(organization_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE field_delivery_notes ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS field_delivery_notes_idempotency_idx ON field_delivery_notes(organization_id,order_id,idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS field_stock_movements_locations_idx ON field_stock_movements(organization_id,source_location_id,destination_location_id,created_at);

-- Preserve existing point-5 stock without pretending to know a real location.
-- Existing non-empty labels are retained verbatim as legacy labels. Blank labels
-- are migrated to an explicitly unknown historical location.
INSERT OR IGNORE INTO stock_locations(id,organization_id,name,type,status,created_by,created_at,updated_by,updated_at)
SELECT 'legacy-' || hex(organization_id || ':' || CASE WHEN trim(location)='' THEN '__unknown__' ELSE trim(location) END),
       organization_id,
       CASE WHEN trim(location)='' THEN 'Emplacement historique non précisé' ELSE trim(location) END,
       CASE WHEN trim(location)='' THEN 'unknown' ELSE 'legacy' END,
       'active',created_by,created_at,updated_by,updated_at
FROM field_stock_items WHERE archived_at IS NULL;

INSERT OR IGNORE INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at)
SELECT organization_id,id,
       'legacy-' || hex(organization_id || ':' || CASE WHEN trim(location)='' THEN '__unknown__' ELSE trim(location) END),
       quantity,updated_at
FROM field_stock_items WHERE archived_at IS NULL;

-- The movement row is the immutable source of truth. Triggers apply its effect
-- atomically to per-location balances and keep the legacy aggregate quantity as
-- a compatibility projection for point-5 UI/tests.
CREATE TRIGGER IF NOT EXISTS stock_movement_validate_before_insert
BEFORE INSERT ON field_stock_movements
BEGIN
  SELECT CASE WHEN NEW.quantity <= 0 THEN RAISE(ABORT,'stock_quantity_invalid') END;
  SELECT CASE WHEN NEW.movement_type NOT IN ('entrée','sortie chantier','transfert','retour chantier','perte','casse','ajustement positif','ajustement négatif','historique') THEN RAISE(ABORT,'stock_movement_type_invalid') END;
  SELECT CASE WHEN NEW.movement_type IN ('sortie chantier','transfert','retour chantier','perte','casse','ajustement négatif') AND NEW.source_location_id IS NULL THEN RAISE(ABORT,'stock_source_required') END;
  SELECT CASE WHEN NEW.movement_type IN ('entrée','transfert','retour chantier','ajustement positif') AND NEW.destination_location_id IS NULL THEN RAISE(ABORT,'stock_destination_required') END;
  SELECT CASE WHEN NEW.source_location_id IS NOT NULL AND NEW.destination_location_id IS NOT NULL AND NEW.source_location_id=NEW.destination_location_id THEN RAISE(ABORT,'stock_same_location') END;
  SELECT CASE WHEN NEW.source_location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM stock_locations l WHERE l.organization_id=NEW.organization_id AND l.id=NEW.source_location_id AND l.status='active') THEN RAISE(ABORT,'stock_source_invalid') END;
  SELECT CASE WHEN NEW.destination_location_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM stock_locations l WHERE l.organization_id=NEW.organization_id AND l.id=NEW.destination_location_id AND l.status='active') THEN RAISE(ABORT,'stock_destination_invalid') END;
  SELECT CASE WHEN NEW.source_location_id IS NOT NULL AND COALESCE((SELECT quantity FROM stock_balances b WHERE b.organization_id=NEW.organization_id AND b.stock_item_id=NEW.stock_item_id AND b.location_id=NEW.source_location_id),0) < NEW.quantity THEN RAISE(ABORT,'stock_insufficient') END;
END;

CREATE TRIGGER IF NOT EXISTS stock_movement_apply_after_insert
AFTER INSERT ON field_stock_movements
BEGIN
  INSERT INTO stock_balances(organization_id,stock_item_id,location_id,quantity,updated_at)
    SELECT NEW.organization_id,NEW.stock_item_id,NEW.destination_location_id,NEW.quantity,NEW.created_at
    WHERE NEW.destination_location_id IS NOT NULL
    ON CONFLICT(organization_id,stock_item_id,location_id) DO UPDATE SET quantity=quantity+NEW.quantity,updated_at=NEW.created_at;
  UPDATE stock_balances SET quantity=quantity-NEW.quantity,updated_at=NEW.created_at
    WHERE NEW.source_location_id IS NOT NULL AND organization_id=NEW.organization_id AND stock_item_id=NEW.stock_item_id AND location_id=NEW.source_location_id;
  UPDATE field_stock_items SET quantity=COALESCE((SELECT SUM(quantity) FROM stock_balances b WHERE b.organization_id=NEW.organization_id AND b.stock_item_id=NEW.stock_item_id),0),updated_by=NEW.created_by,updated_at=NEW.created_at
    WHERE organization_id=NEW.organization_id AND id=NEW.stock_item_id;
END;

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('stock.locations.manage','Créer ou modifier les emplacements de stock');
