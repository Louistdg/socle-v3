PRAGMA foreign_keys = ON;

-- IA5 — registre documentaire transversal.
-- 0030 est volontairement réservé au registre documentaire après 0029 IA4
-- (intégrité projet/tenant). Cette migration regroupe les métadonnées du
-- registre et les garde-fous tenant afin d'éviter deux migrations IA5
-- concurrentes ou une collision de numéro.

ALTER TABLE secure_documents ADD COLUMN document_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE secure_documents ADD COLUMN document_date TEXT;
ALTER TABLE secure_documents ADD COLUMN origin TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE secure_documents ADD COLUMN business_owner_type TEXT NOT NULL DEFAULT 'organization';
ALTER TABLE secure_documents ADD COLUMN business_owner_id TEXT;
ALTER TABLE secure_documents ADD COLUMN classification_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE secure_documents ADD COLUMN ocr_status TEXT NOT NULL DEFAULT 'not_requested';
ALTER TABLE secure_documents ADD COLUMN archived_reason TEXT NOT NULL DEFAULT '';

UPDATE secure_documents
SET business_owner_id=organization_id
WHERE business_owner_id IS NULL OR business_owner_id='';

CREATE INDEX IF NOT EXISTS secure_documents_registry_idx
  ON secure_documents(organization_id,document_type,origin,document_date,archived_at,created_at);

CREATE INDEX IF NOT EXISTS secure_documents_owner_idx
  ON secure_documents(organization_id,business_owner_type,business_owner_id,archived_at);

CREATE INDEX IF NOT EXISTS audit_logs_document_history_idx
  ON audit_logs(organization_id,entity_type,entity_id,created_at);

ALTER TABLE document_access_grants ADD COLUMN organization_id TEXT REFERENCES organizations(id);

UPDATE document_access_grants
SET organization_id=COALESCE(
  (SELECT d.organization_id FROM secure_documents d WHERE d.id=document_access_grants.document_id),
  (SELECT f.organization_id FROM document_folders f WHERE f.id=document_access_grants.folder_id)
)
WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS document_access_grants_org_idx
  ON document_access_grants(organization_id,grantee_type,grantee_id,permission);

CREATE TRIGGER IF NOT EXISTS document_folder_tenant_immutable_update
BEFORE UPDATE OF organization_id ON document_folders
WHEN NEW.organization_id<>OLD.organization_id
BEGIN
  SELECT RAISE(ABORT,'document_folder_tenant_immutable');
END;

CREATE TRIGGER IF NOT EXISTS document_folder_parent_same_org_insert
BEFORE INSERT ON document_folders
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM document_folders parent
    WHERE parent.id=NEW.parent_id AND parent.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_folder_parent_cross_tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS document_folder_parent_same_org_update
BEFORE UPDATE OF parent_id ON document_folders
WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM document_folders parent
    WHERE parent.id=NEW.parent_id AND parent.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_folder_parent_cross_tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS secure_document_tenant_immutable_update
BEFORE UPDATE OF organization_id ON secure_documents
WHEN NEW.organization_id<>OLD.organization_id
BEGIN
  SELECT RAISE(ABORT,'secure_document_tenant_immutable');
END;

CREATE TRIGGER IF NOT EXISTS secure_document_folder_same_org_insert
BEFORE INSERT ON secure_documents
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM document_folders folder
    WHERE folder.id=NEW.folder_id AND folder.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'secure_document_folder_cross_tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS secure_document_folder_same_org_update
BEFORE UPDATE OF folder_id ON secure_documents
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM document_folders folder
    WHERE folder.id=NEW.folder_id AND folder.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'secure_document_folder_cross_tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS document_relation_identity_guard_update
BEFORE UPDATE OF organization_id,document_id ON document_relations
WHEN NEW.organization_id<>OLD.organization_id OR NEW.document_id<>OLD.document_id
BEGIN
  SELECT RAISE(ABORT,'document_relation_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS document_blob_identity_guard_update
BEFORE UPDATE OF organization_id,document_id ON secure_document_blobs
WHEN NEW.organization_id<>OLD.organization_id OR NEW.document_id<>OLD.document_id
BEGIN
  SELECT RAISE(ABORT,'document_blob_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS document_access_log_same_org_insert
BEFORE INSERT ON document_access_logs
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM secure_documents d
    WHERE d.id=NEW.document_id AND d.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_access_log_cross_tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS document_access_log_identity_guard_update
BEFORE UPDATE OF organization_id,document_id ON document_access_logs
WHEN NEW.organization_id<>OLD.organization_id OR NEW.document_id<>OLD.document_id
BEGIN
  SELECT RAISE(ABORT,'document_access_log_identity_immutable');
END;

CREATE TRIGGER IF NOT EXISTS document_access_grant_tenant_insert
BEFORE INSERT ON document_access_grants
BEGIN
  SELECT CASE WHEN NEW.organization_id IS NULL THEN RAISE(ABORT,'document_access_grant_missing_tenant') END;
  SELECT CASE WHEN NEW.document_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM secure_documents d
    WHERE d.id=NEW.document_id AND d.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_access_grant_cross_tenant') END;
  SELECT CASE WHEN NEW.folder_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM document_folders f
    WHERE f.id=NEW.folder_id AND f.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_access_grant_cross_tenant') END;
END;

CREATE TRIGGER IF NOT EXISTS document_access_grant_tenant_update
BEFORE UPDATE OF organization_id,document_id,folder_id ON document_access_grants
BEGIN
  SELECT CASE WHEN NEW.organization_id IS NULL THEN RAISE(ABORT,'document_access_grant_missing_tenant') END;
  SELECT CASE WHEN NEW.document_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM secure_documents d
    WHERE d.id=NEW.document_id AND d.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_access_grant_cross_tenant') END;
  SELECT CASE WHEN NEW.folder_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM document_folders f
    WHERE f.id=NEW.folder_id AND f.organization_id=NEW.organization_id
  ) THEN RAISE(ABORT,'document_access_grant_cross_tenant') END;
END;
