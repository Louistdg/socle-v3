PRAGMA foreign_keys = ON;

-- STOCK-BARCODE-01 — additive 1→N barcode model.
-- 0040 field_stock_items.barcode remains as a compatibility projection.
CREATE TABLE IF NOT EXISTS stock_item_barcodes (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  stock_item_id TEXT NOT NULL,
  raw_value TEXT NOT NULL,
  normalized_key TEXT NOT NULL,
  symbology TEXT NOT NULL DEFAULT 'unknown',
  identifier_kind TEXT NOT NULL DEFAULT 'private' CHECK(identifier_kind IN ('gtin','private')),
  gtin14 TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  source TEXT NOT NULL DEFAULT 'manual',
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  FOREIGN KEY (organization_id,stock_item_id) REFERENCES field_stock_items(organization_id,id)
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_item_barcodes_active_key_idx
  ON stock_item_barcodes(organization_id,normalized_key)
  WHERE status='active' AND archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stock_item_barcodes_primary_idx
  ON stock_item_barcodes(organization_id,stock_item_id)
  WHERE status='active' AND archived_at IS NULL AND is_primary=1;

CREATE INDEX IF NOT EXISTS stock_item_barcodes_item_idx
  ON stock_item_barcodes(organization_id,stock_item_id,status,created_at);

-- Backfill every non-empty historical barcode without touching stock balances,
-- quantities or movements. Numeric GTINs are canonicalized to GTIN-14 when the
-- existing value has a valid check digit; other values remain exact identifiers.
WITH legacy AS (
  SELECT
    organization_id,
    id AS stock_item_id,
    barcode AS raw_value,
    trim(barcode) AS clean_value,
    created_by,
    created_at,
    updated_by,
    updated_at
  FROM field_stock_items
  WHERE archived_at IS NULL AND trim(COALESCE(barcode,''))<>''
),
classified AS (
  SELECT *,
    CASE
      WHEN clean_value NOT GLOB '*[^0-9]*' AND length(clean_value)=8
       AND ((10-(
          (CAST(substr(clean_value,1,1) AS INTEGER)*3)+CAST(substr(clean_value,2,1) AS INTEGER)+
          (CAST(substr(clean_value,3,1) AS INTEGER)*3)+CAST(substr(clean_value,4,1) AS INTEGER)+
          (CAST(substr(clean_value,5,1) AS INTEGER)*3)+CAST(substr(clean_value,6,1) AS INTEGER)+
          (CAST(substr(clean_value,7,1) AS INTEGER)*3)
        )%10)%10)=CAST(substr(clean_value,8,1) AS INTEGER)
      THEN '000000'||clean_value
      WHEN clean_value NOT GLOB '*[^0-9]*' AND length(clean_value)=12
       AND ((10-(
          (CAST(substr(clean_value,1,1) AS INTEGER)*3)+CAST(substr(clean_value,2,1) AS INTEGER)+
          (CAST(substr(clean_value,3,1) AS INTEGER)*3)+CAST(substr(clean_value,4,1) AS INTEGER)+
          (CAST(substr(clean_value,5,1) AS INTEGER)*3)+CAST(substr(clean_value,6,1) AS INTEGER)+
          (CAST(substr(clean_value,7,1) AS INTEGER)*3)+CAST(substr(clean_value,8,1) AS INTEGER)+
          (CAST(substr(clean_value,9,1) AS INTEGER)*3)+CAST(substr(clean_value,10,1) AS INTEGER)+
          (CAST(substr(clean_value,11,1) AS INTEGER)*3)
        )%10)%10)=CAST(substr(clean_value,12,1) AS INTEGER)
      THEN '00'||clean_value
      WHEN clean_value NOT GLOB '*[^0-9]*' AND length(clean_value)=13
       AND ((10-(
          CAST(substr(clean_value,1,1) AS INTEGER)+(CAST(substr(clean_value,2,1) AS INTEGER)*3)+
          CAST(substr(clean_value,3,1) AS INTEGER)+(CAST(substr(clean_value,4,1) AS INTEGER)*3)+
          CAST(substr(clean_value,5,1) AS INTEGER)+(CAST(substr(clean_value,6,1) AS INTEGER)*3)+
          CAST(substr(clean_value,7,1) AS INTEGER)+(CAST(substr(clean_value,8,1) AS INTEGER)*3)+
          CAST(substr(clean_value,9,1) AS INTEGER)+(CAST(substr(clean_value,10,1) AS INTEGER)*3)+
          CAST(substr(clean_value,11,1) AS INTEGER)+(CAST(substr(clean_value,12,1) AS INTEGER)*3)
        )%10)%10)=CAST(substr(clean_value,13,1) AS INTEGER)
      THEN '0'||clean_value
      WHEN clean_value NOT GLOB '*[^0-9]*' AND length(clean_value)=14
       AND ((10-(
          (CAST(substr(clean_value,1,1) AS INTEGER)*3)+CAST(substr(clean_value,2,1) AS INTEGER)+
          (CAST(substr(clean_value,3,1) AS INTEGER)*3)+CAST(substr(clean_value,4,1) AS INTEGER)+
          (CAST(substr(clean_value,5,1) AS INTEGER)*3)+CAST(substr(clean_value,6,1) AS INTEGER)+
          (CAST(substr(clean_value,7,1) AS INTEGER)*3)+CAST(substr(clean_value,8,1) AS INTEGER)+
          (CAST(substr(clean_value,9,1) AS INTEGER)*3)+CAST(substr(clean_value,10,1) AS INTEGER)+
          (CAST(substr(clean_value,11,1) AS INTEGER)*3)+CAST(substr(clean_value,12,1) AS INTEGER)+
          (CAST(substr(clean_value,13,1) AS INTEGER)*3)
        )%10)%10)=CAST(substr(clean_value,14,1) AS INTEGER)
      THEN clean_value
      ELSE NULL
    END AS gtin14
  FROM legacy
)
INSERT OR IGNORE INTO stock_item_barcodes(
  id,organization_id,stock_item_id,raw_value,normalized_key,symbology,
  identifier_kind,gtin14,is_primary,status,source,created_by,created_at,
  updated_by,updated_at,archived_at
)
SELECT
  'stock-barcode-legacy-'||lower(hex(randomblob(16))),
  organization_id,
  stock_item_id,
  raw_value,
  CASE WHEN gtin14 IS NOT NULL THEN 'gtin:'||gtin14 ELSE 'raw:'||clean_value END,
  'legacy',
  CASE WHEN gtin14 IS NOT NULL THEN 'gtin' ELSE 'private' END,
  gtin14,
  1,
  'active',
  'legacy',
  created_by,
  created_at,
  updated_by,
  updated_at,
  NULL
FROM classified;

-- The structured table is authoritative; the legacy column remains a projection
-- for STOCK-CATALOG-V2 compatibility during this transition.
CREATE TRIGGER IF NOT EXISTS stock_item_barcode_projection_insert
AFTER INSERT ON stock_item_barcodes
WHEN NEW.status='active' AND NEW.archived_at IS NULL AND NEW.is_primary=1
BEGIN
  UPDATE field_stock_items
  SET barcode=NEW.raw_value,updated_by=NEW.updated_by,updated_at=NEW.updated_at
  WHERE organization_id=NEW.organization_id AND id=NEW.stock_item_id;
END;

CREATE TRIGGER IF NOT EXISTS stock_item_barcode_projection_update
AFTER UPDATE OF raw_value,status,is_primary,archived_at ON stock_item_barcodes
BEGIN
  UPDATE field_stock_items
  SET barcode=COALESCE((
      SELECT raw_value FROM stock_item_barcodes b
      WHERE b.organization_id=NEW.organization_id
        AND b.stock_item_id=NEW.stock_item_id
        AND b.status='active' AND b.archived_at IS NULL AND b.is_primary=1
      ORDER BY b.created_at,b.id LIMIT 1
    ),''),
    updated_by=NEW.updated_by,
    updated_at=NEW.updated_at
  WHERE organization_id=NEW.organization_id AND id=NEW.stock_item_id;
END;
