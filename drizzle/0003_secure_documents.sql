PRAGMA foreign_keys = ON;

-- Métadonnées séparées du fichier. Le stockage physique (bucket privé) sera
-- branché ensuite : aucun document sensible ne doit vivre dans workspace_state.
CREATE TABLE IF NOT EXISTS document_folders (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  parent_id TEXT REFERENCES document_folders(id),
  name TEXT NOT NULL,
  context_type TEXT NOT NULL CHECK (context_type IN ('company','project','worker','accounting','payroll','partner_request','other')),
  context_id TEXT,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('standard','confidential','restricted')) DEFAULT 'standard',
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS document_folders_org_idx ON document_folders(organization_id,context_type,context_id);

CREATE TABLE IF NOT EXISTS secure_documents (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  folder_id TEXT NOT NULL REFERENCES document_folders(id),
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  checksum_sha256 TEXT,
  sensitivity TEXT NOT NULL CHECK (sensitivity IN ('standard','confidential','restricted')) DEFAULT 'standard',
  status TEXT NOT NULL CHECK (status IN ('pending_scan','available','quarantined','archived')) DEFAULT 'pending_scan',
  uploaded_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS secure_documents_folder_idx ON secure_documents(folder_id,status,created_at);

-- Un accès explicite peut être donné à un utilisateur, un rôle ou un mandat
-- partenaire. L'absence de règle ne donne aucun accès additionnel.
CREATE TABLE IF NOT EXISTS document_access_grants (
  id TEXT PRIMARY KEY NOT NULL,
  document_id TEXT REFERENCES secure_documents(id),
  folder_id TEXT REFERENCES document_folders(id),
  grantee_type TEXT NOT NULL CHECK (grantee_type IN ('user','role','partner_grant')),
  grantee_id TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('view','upload','manage')),
  granted_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  CHECK ((document_id IS NOT NULL AND folder_id IS NULL) OR (document_id IS NULL AND folder_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS document_access_grants_lookup_idx ON document_access_grants(grantee_type,grantee_id,expires_at);

CREATE TABLE IF NOT EXISTS document_access_logs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  document_id TEXT NOT NULL REFERENCES secure_documents(id),
  user_id TEXT NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL CHECK (action IN ('listed','viewed','downloaded','uploaded','shared','revoked')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS document_access_logs_document_idx ON document_access_logs(document_id,created_at);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('documents.secure.view','Voir les documents sécurisés autorisés'),
 ('documents.secure.manage','Gérer les dossiers, documents et droits sécurisés');
