PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX secure_documents_scan_identity_idx ON secure_documents(organization_id,id);
CREATE TABLE field_delivery_scans (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  order_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL CHECK(length(checksum_sha256)=64),
  operation_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK(status='uploaded'),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  FOREIGN KEY(organization_id,document_id) REFERENCES secure_documents(organization_id,id) ON DELETE RESTRICT,
  UNIQUE(organization_id,order_id,checksum_sha256),
  UNIQUE(organization_id,operation_key),
  UNIQUE(organization_id,document_id)
);

-- The original and its order linkage survive generic document operations.
CREATE TRIGGER delivery_scan_identity_immutable BEFORE UPDATE ON field_delivery_scans
BEGIN SELECT RAISE(ABORT,'delivery_scan_immutable'); END;
CREATE TRIGGER delivery_scan_document_guard BEFORE UPDATE ON secure_documents
WHEN EXISTS(SELECT 1 FROM field_delivery_scans WHERE document_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'delivery_scan_original_immutable'); END;
CREATE TRIGGER delivery_scan_blob_update_guard BEFORE UPDATE ON secure_document_blobs
WHEN EXISTS(SELECT 1 FROM field_delivery_scans WHERE document_id=OLD.document_id)
BEGIN SELECT RAISE(ABORT,'delivery_scan_original_immutable'); END;
CREATE TRIGGER delivery_scan_blob_delete_guard BEFORE DELETE ON secure_document_blobs
WHEN EXISTS(SELECT 1 FROM field_delivery_scans WHERE document_id=OLD.document_id)
BEGIN SELECT RAISE(ABORT,'delivery_scan_original_immutable'); END;
CREATE TRIGGER delivery_scan_relation_delete_guard BEFORE DELETE ON document_relations
WHEN EXISTS(SELECT 1 FROM field_delivery_scans WHERE document_id=OLD.document_id)
BEGIN SELECT RAISE(ABORT,'delivery_scan_relation_immutable'); END;
CREATE TRIGGER delivery_scan_relation_update_guard BEFORE UPDATE ON document_relations
WHEN EXISTS(SELECT 1 FROM field_delivery_scans WHERE document_id=OLD.document_id)
BEGIN SELECT RAISE(ABORT,'delivery_scan_relation_immutable'); END;
CREATE TRIGGER delivery_scan_delete_guard BEFORE DELETE ON field_delivery_scans
BEGIN SELECT RAISE(ABORT,'delivery_scan_immutable'); END;
