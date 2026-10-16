PRAGMA foreign_keys = ON;

-- Point 8: private server-backed documents with one binary payload and many
-- validated business relations. Existing 0000-0013 migrations remain immutable.
ALTER TABLE secure_documents ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE secure_documents ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE secure_documents ADD COLUMN category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE secure_documents ADD COLUMN reference TEXT NOT NULL DEFAULT '';
ALTER TABLE secure_documents ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS secure_documents_idempotency_idx
  ON secure_documents(organization_id,idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS secure_documents_org_status_idx
  ON secure_documents(organization_id,status,created_at);

-- Private byte storage for the current D1-only deployment. The bytes have no
-- public URL and are only returned by authorized API routes. storage_key stays
-- server-generated so a private bucket can replace this table later without
-- changing document identity or relations.
CREATE TABLE IF NOT EXISTS secure_document_blobs (
  document_id TEXT PRIMARY KEY NOT NULL REFERENCES secure_documents(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  content BLOB NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS secure_document_blobs_org_idx
  ON secure_document_blobs(organization_id,document_id);

CREATE TABLE IF NOT EXISTS document_relations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  document_id TEXT NOT NULL REFERENCES secure_documents(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'customer','supplier','person','project','quote','invoice','expense','payment',
    'purchase_order','delivery','asset'
  )),
  relation_id TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  UNIQUE (organization_id,document_id,relation_type,relation_id)
);
CREATE INDEX IF NOT EXISTS document_relations_document_idx
  ON document_relations(organization_id,document_id,created_at);
CREATE INDEX IF NOT EXISTS document_relations_target_idx
  ON document_relations(organization_id,relation_type,relation_id,created_at);

CREATE TRIGGER IF NOT EXISTS document_relation_same_org_insert
BEFORE INSERT ON document_relations
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM secure_documents d
    WHERE d.id=NEW.document_id AND d.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_relation_cross_tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS document_blob_same_org_insert
BEFORE INSERT ON secure_document_blobs
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM secure_documents d
    WHERE d.id=NEW.document_id AND d.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_blob_cross_tenant') END;
END;

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('documents.secure.confidential','Voir les documents sécurisés confidentiels');
