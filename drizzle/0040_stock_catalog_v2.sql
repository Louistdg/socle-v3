PRAGMA foreign_keys = ON;

-- STOCK-CATALOG-V2-01 — additive catalogue metadata. Existing stock quantities,
-- locations and movements remain authoritative and untouched.
CREATE TABLE IF NOT EXISTS stock_categories (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  parent_id TEXT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0 AND sort_order <= 9999),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id,parent_id) REFERENCES stock_categories(organization_id,id)
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_categories_root_name_idx
  ON stock_categories(organization_id,normalized_name)
  WHERE parent_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stock_categories_child_name_idx
  ON stock_categories(organization_id,parent_id,normalized_name)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS stock_categories_org_idx
  ON stock_categories(organization_id,status,parent_id,sort_order,name);

CREATE TRIGGER IF NOT EXISTS stock_category_depth_insert
BEFORE INSERT ON stock_categories
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.parent_id=NEW.id THEN RAISE(ABORT,'stock_category_self_parent') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM stock_categories parent
    WHERE parent.organization_id=NEW.organization_id
      AND parent.id=NEW.parent_id
      AND parent.parent_id IS NOT NULL
  ) THEN RAISE(ABORT,'stock_category_depth') END;
END;

CREATE TRIGGER IF NOT EXISTS stock_category_depth_update
BEFORE UPDATE OF parent_id,organization_id ON stock_categories
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.parent_id=NEW.id THEN RAISE(ABORT,'stock_category_self_parent') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM stock_categories parent
    WHERE parent.organization_id=NEW.organization_id
      AND parent.id=NEW.parent_id
      AND parent.parent_id IS NOT NULL
  ) THEN RAISE(ABORT,'stock_category_depth') END;
END;

ALTER TABLE field_stock_items ADD COLUMN category_id TEXT;
ALTER TABLE field_stock_items ADD COLUMN subcategory_id TEXT;
ALTER TABLE field_stock_items ADD COLUMN supplier_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE field_stock_items ADD COLUMN barcode TEXT NOT NULL DEFAULT '';
ALTER TABLE field_stock_items ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS field_stock_items_catalog_idx
  ON field_stock_items(organization_id,category_id,subcategory_id,archived_at,name);

CREATE UNIQUE INDEX IF NOT EXISTS field_stock_items_barcode_unique_idx
  ON field_stock_items(organization_id,barcode)
  WHERE barcode <> '' AND archived_at IS NULL;

CREATE TRIGGER IF NOT EXISTS stock_item_catalog_scope_insert
BEFORE INSERT ON field_stock_items
WHEN NEW.category_id IS NOT NULL OR NEW.subcategory_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.category_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM stock_categories category
    WHERE category.organization_id=NEW.organization_id
      AND category.id=NEW.category_id
      AND category.parent_id IS NULL
  ) THEN RAISE(ABORT,'stock_item_category_invalid') END;
  SELECT CASE WHEN NEW.subcategory_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM stock_categories child
    WHERE child.organization_id=NEW.organization_id
      AND child.id=NEW.subcategory_id
      AND child.parent_id=NEW.category_id
  ) THEN RAISE(ABORT,'stock_item_subcategory_invalid') END;
END;

CREATE TRIGGER IF NOT EXISTS stock_item_catalog_scope_update
BEFORE UPDATE OF organization_id,category_id,subcategory_id ON field_stock_items
WHEN NEW.category_id IS NOT NULL OR NEW.subcategory_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NEW.category_id IS NULL OR NOT EXISTS(
    SELECT 1 FROM stock_categories category
    WHERE category.organization_id=NEW.organization_id
      AND category.id=NEW.category_id
      AND category.parent_id IS NULL
  ) THEN RAISE(ABORT,'stock_item_category_invalid') END;
  SELECT CASE WHEN NEW.subcategory_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM stock_categories child
    WHERE child.organization_id=NEW.organization_id
      AND child.id=NEW.subcategory_id
      AND child.parent_id=NEW.category_id
  ) THEN RAISE(ABORT,'stock_item_subcategory_invalid') END;
END;

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('stock.categories.manage','Créer et gérer les catégories du catalogue Stock');

-- Keep exactly the same catalogue-management audience as stock.items.manage.
-- This does not grant any additional right to WORKER unless that role already
-- had stock.items.manage.
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT role_id,'stock.categories.manage'
FROM role_permissions
WHERE permission_code='stock.items.manage';
