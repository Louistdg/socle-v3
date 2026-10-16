PRAGMA foreign_keys = ON;

-- Périmètre chantier contrôlé par le backend pour les utilisateurs qui ne
-- disposent pas de la vue globale.
CREATE TABLE IF NOT EXISTS project_access (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  user_id TEXT NOT NULL REFERENCES profiles(id),
  project_id TEXT NOT NULL,
  granted_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, user_id, project_id)
);
CREATE INDEX IF NOT EXISTS project_access_user_idx ON project_access(organization_id,user_id);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('workspace.view','Ouvrir l’espace entreprise'),
 ('workspace.manage','Modifier l’espace entreprise'),
 ('projects.view.all','Voir tous les chantiers'),
 ('projects.view.assigned','Voir uniquement les chantiers attribués'),
 ('hr.sensitive.view','Voir les données RH et rémunérations'),
 ('accounting.view','Voir factures et comptabilité'),
 ('bank.view','Voir comptes et mouvements bancaires'),
 ('margins.view','Voir budgets, coûts et marges'),
 ('company.settings.view','Voir les paramètres complets de la société');
