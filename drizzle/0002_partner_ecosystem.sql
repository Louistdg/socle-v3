PRAGMA foreign_keys = ON;

-- Un partenaire est lui-même une organisation SOCLE. Cette table relie une
-- entreprise cliente à cette organisation, sans aucun partage de mot de passe.
CREATE TABLE IF NOT EXISTS partner_grants (
  id TEXT PRIMARY KEY NOT NULL,
  client_organization_id TEXT NOT NULL REFERENCES organizations(id),
  partner_organization_id TEXT REFERENCES organizations(id),
  partner_name TEXT NOT NULL,
  partner_email TEXT NOT NULL,
  partner_type TEXT NOT NULL,
  enterprise_number TEXT,
  contact_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','invited','active','revoked','expired')),
  scopes_json TEXT NOT NULL DEFAULT '[]',
  invited_by TEXT NOT NULL REFERENCES profiles(id),
  invited_at TEXT,
  accepted_by TEXT REFERENCES profiles(id),
  accepted_at TEXT,
  revoked_by TEXT REFERENCES profiles(id),
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_grants_client_idx ON partner_grants(client_organization_id,status);
CREATE INDEX IF NOT EXISTS partner_grants_partner_idx ON partner_grants(partner_organization_id,status);

-- Une demande reste liée à son objet, même si son traitement passe d'une
-- entreprise à un partenaire puis revient vers l'entreprise.
CREATE TABLE IF NOT EXISTS partner_requests (
  id TEXT PRIMARY KEY NOT NULL,
  client_organization_id TEXT NOT NULL REFERENCES organizations(id),
  partner_grant_id TEXT NOT NULL REFERENCES partner_grants(id),
  context_type TEXT NOT NULL CHECK (context_type IN ('expense','invoice','bank_transaction','worker','payroll','document','project','other')),
  context_id TEXT,
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL CHECK (status IN ('open','received','resolved','cancelled')),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  resolved_by TEXT REFERENCES profiles(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS partner_requests_client_idx ON partner_requests(client_organization_id,status,due_date);
CREATE INDEX IF NOT EXISTS partner_requests_grant_idx ON partner_requests(partner_grant_id,status);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('partners.view','Voir les mandats partenaires'),
 ('partners.manage','Créer, modifier et révoquer les mandats partenaires'),
 ('partner_requests.view','Voir les demandes partenaires'),
 ('partner_requests.manage','Créer et traiter les demandes partenaires');
