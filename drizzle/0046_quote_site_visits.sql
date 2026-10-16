PRAGMA foreign_keys = ON;

-- Field visit notes are durable records that can later be linked to a quote.
CREATE TABLE quote_site_visits (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  customer_id TEXT,
  place TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  quote_id TEXT,
  operation_key TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,operation_key)
);

CREATE INDEX quote_site_visits_org_created_idx
  ON quote_site_visits(organization_id,created_at DESC,id);
CREATE INDEX quote_site_visits_quote_idx
  ON quote_site_visits(organization_id,quote_id,created_at DESC);

CREATE TABLE quote_site_visit_documents (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  visit_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo','sketch','voice')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,visit_id,document_id),
  FOREIGN KEY (organization_id,visit_id)
    REFERENCES quote_site_visits(organization_id,id) ON DELETE CASCADE
);

-- Preserve the deployed document relation CHECK and add a tenant-scoped,
-- indexed relation for visit folders without rewriting prior migrations.
CREATE TABLE quote_site_visit_document_relations (
  organization_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,visit_id,document_id),
  FOREIGN KEY (organization_id,visit_id,document_id)
    REFERENCES quote_site_visit_documents(organization_id,visit_id,document_id) ON DELETE CASCADE
);
CREATE INDEX quote_site_visit_document_relations_document_idx
  ON quote_site_visit_document_relations(organization_id,document_id,visit_id);

CREATE INDEX quote_site_visit_documents_visit_idx
  ON quote_site_visit_documents(organization_id,visit_id,kind,created_at);
