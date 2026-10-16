PRAGMA foreign_keys = ON;

-- Point 5: dedicated server persistence for field writes.
-- Stock remains single-location here; multi-location is intentionally deferred to point 6.
CREATE TABLE IF NOT EXISTS field_data_imports (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id),
  imported_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS field_assignments (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  assignment_date TEXT NOT NULL,
  team_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  people_json TEXT NOT NULL,
  vehicle_id TEXT,
  pack_id TEXT,
  subcontractor TEXT,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id)
);
CREATE INDEX IF NOT EXISTS field_assignments_scope_idx ON field_assignments(organization_id,assignment_date,project_id,team_id);
CREATE TABLE IF NOT EXISTS field_assets (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  payload_json TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  PRIMARY KEY (organization_id,id)
);
CREATE INDEX IF NOT EXISTS field_assets_org_idx ON field_assets(organization_id,archived_at);
CREATE TABLE IF NOT EXISTS field_fuel_entries (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  asset_id TEXT NOT NULL,
  work_date TEXT NOT NULL,
  odometer REAL NOT NULL,
  liters REAL NOT NULL,
  total_cents INTEGER NOT NULL,
  driver_person_id TEXT,
  driver_name TEXT NOT NULL,
  pump_name TEXT,
  receipt_name TEXT,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_fuel_asset_idx ON field_fuel_entries(organization_id,asset_id,work_date);
CREATE TABLE IF NOT EXISTS field_asset_issues (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  asset_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  reporter_person_id TEXT,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_asset_issues_asset_idx ON field_asset_issues(organization_id,asset_id,created_at);
CREATE TABLE IF NOT EXISTS field_project_materials (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  delivered REAL NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_project_materials_project_idx ON field_project_materials(organization_id,project_id,created_at);
CREATE TABLE IF NOT EXISTS field_project_execution (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  lines_json TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,project_id)
);
CREATE TABLE IF NOT EXISTS field_project_notes (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  note_date TEXT NOT NULL,
  visibility TEXT NOT NULL,
  body TEXT NOT NULL,
  photo_name TEXT,
  author_person_id TEXT,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_project_notes_project_idx ON field_project_notes(organization_id,project_id,created_at);
CREATE TABLE IF NOT EXISTS field_stock_items (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  reference TEXT,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  reserved REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  minimum REAL NOT NULL DEFAULT 0,
  supplier TEXT,
  location TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  PRIMARY KEY (organization_id,id)
);
CREATE INDEX IF NOT EXISTS field_stock_items_org_idx ON field_stock_items(organization_id,archived_at);
CREATE TABLE IF NOT EXISTS field_stock_movements (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  stock_item_id TEXT NOT NULL,
  movement_date TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL,
  origin TEXT,
  destination TEXT,
  project_id TEXT,
  reason TEXT NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_stock_movements_item_idx ON field_stock_movements(organization_id,stock_item_id,created_at);
CREATE TABLE IF NOT EXISTS field_delivery_notes (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  order_id TEXT NOT NULL,
  supplier_id TEXT,
  project_id TEXT,
  number TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  receiver_person_id TEXT,
  receiver_name TEXT NOT NULL,
  comment TEXT,
  file_name TEXT,
  status TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS field_delivery_notes_order_idx ON field_delivery_notes(organization_id,order_id,delivery_date);
CREATE TABLE IF NOT EXISTS field_delivery_lines (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  delivery_note_id TEXT NOT NULL REFERENCES field_delivery_notes(id),
  order_line_id TEXT NOT NULL,
  reference TEXT,
  label TEXT NOT NULL,
  ordered REAL NOT NULL,
  received REAL NOT NULL,
  condition TEXT NOT NULL,
  difference REAL NOT NULL,
  stock_item_id TEXT
);
CREATE INDEX IF NOT EXISTS field_delivery_lines_note_idx ON field_delivery_lines(delivery_note_id);
INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('assets.manage','Ajouter ou modifier le matériel'),
 ('asset_issues.create','Signaler un problème matériel'),
 ('fuel.create','Enregistrer un plein de carburant'),
 ('stock.items.manage','Ajouter ou modifier une référence de stock'),
 ('project_materials.create','Ajouter un matériau à un chantier'),
 ('project_execution.edit','Modifier la fiche d’exécution d’un chantier'),
 ('project_notes.create','Ajouter une remarque de chantier'),
 ('planning.assignments.manage','Créer, modifier ou retirer une affectation planning');
