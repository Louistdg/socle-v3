PRAGMA foreign_keys = ON;

-- Exclusivement pour les sessions de démonstration locales. Aucun mot de passe
-- ni jeton brut n'est conservé ; la version hébergée ne reçoit pas ces routes.
CREATE TABLE IF NOT EXISTS local_test_identities (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  person_id TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  invitation_status TEXT NOT NULL CHECK (invitation_status IN ('simulation_not_sent','active','revoked')) DEFAULT 'simulation_not_sent',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, profile_id),
  UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS local_test_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL REFERENCES local_test_identities(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS local_test_sessions_active_idx ON local_test_sessions(token_hash,expires_at);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('assets.view','Voir le matériel autorisé'),
 ('stock.view','Voir le stock autorisé'),
 ('stock.move','Encoder un mouvement de stock autorisé'),
 ('deliveries.view','Voir les livraisons autorisées'),
 ('deliveries.receive','Réceptionner une livraison autorisée'),
 ('time_entries.view.own','Voir ses pointages'),
 ('time_entries.create.own','Encoder ses pointages'),
 ('tasks.view.assigned','Voir ses tâches attribuées'),
 ('documents.view.assigned','Voir les documents explicitement partagés');
