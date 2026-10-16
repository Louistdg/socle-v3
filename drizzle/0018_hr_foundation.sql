-- SOCLE V2 : référentiel RH relationnel, compatible avec les données historiques.
-- Les anciennes données de simulation restent des données de test ; aucune donnée
-- métier de production n'est créée par cette migration.
CREATE TABLE IF NOT EXISTS hr_people (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Ouvrier',
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'workspace_state',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS hr_people_org_idx ON hr_people(organization_id, active, display_name);

CREATE TABLE IF NOT EXISTS employment_records (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  contract_type TEXT,
  weekly_hours REAL,
  gross_hourly_cents INTEGER,
  trade_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (person_id) REFERENCES hr_people(id)
);
CREATE INDEX IF NOT EXISTS employment_records_person_idx ON employment_records(organization_id, person_id, starts_on);

CREATE TABLE IF NOT EXISTS hr_teams (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'workspace_state',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, name),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS hr_team_members (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id, team_id, person_id, starts_on),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (team_id) REFERENCES hr_teams(id),
  FOREIGN KEY (person_id) REFERENCES hr_people(id)
);
CREATE INDEX IF NOT EXISTS hr_team_members_person_idx ON hr_team_members(organization_id, person_id, ends_on);
