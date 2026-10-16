PRAGMA foreign_keys = ON;

-- Corrective, data-preserving follow-up to 0018.
-- HR identifiers are tenant-scoped: the same local person/team id may exist in
-- two organizations without colliding, while child rows must stay in the same tenant.

CREATE TABLE hr_people_next (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Ouvrier',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source TEXT NOT NULL DEFAULT 'workspace_state',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE employment_records_next (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  contract_type TEXT,
  weekly_hours REAL CHECK (weekly_hours IS NULL OR (weekly_hours >= 0 AND weekly_hours <= 168)),
  gross_hourly_cents INTEGER CHECK (gross_hourly_cents IS NULL OR gross_hourly_cents >= 0),
  trade_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (organization_id,person_id) REFERENCES hr_people_next(organization_id,id)
);

CREATE TABLE hr_teams_next (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  source TEXT NOT NULL DEFAULT 'workspace_state',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  UNIQUE (organization_id,name),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE hr_team_members_next (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  starts_on TEXT,
  ends_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (organization_id,team_id) REFERENCES hr_teams_next(organization_id,id),
  FOREIGN KEY (organization_id,person_id) REFERENCES hr_people_next(organization_id,id)
);

-- Copy first. Any pre-existing cross-tenant corruption aborts the migration
-- instead of silently deleting or rewriting HR data.
INSERT INTO hr_people_next(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at)
SELECT organization_id,id,display_name,role_title,category,active,source,created_at,updated_at
FROM hr_people;

INSERT INTO employment_records_next(organization_id,id,person_id,starts_on,ends_on,contract_type,weekly_hours,gross_hourly_cents,trade_name,created_at,updated_at)
SELECT organization_id,id,person_id,starts_on,ends_on,contract_type,weekly_hours,gross_hourly_cents,trade_name,created_at,updated_at
FROM employment_records;

INSERT INTO hr_teams_next(organization_id,id,name,active,source,created_at,updated_at)
SELECT organization_id,id,name,active,source,created_at,updated_at
FROM hr_teams;

INSERT INTO hr_team_members_next(organization_id,id,team_id,person_id,starts_on,ends_on,created_at,updated_at)
SELECT organization_id,id,team_id,person_id,starts_on,ends_on,created_at,updated_at
FROM hr_team_members;

DROP TABLE hr_team_members;
DROP TABLE employment_records;
DROP TABLE hr_teams;
DROP TABLE hr_people;

ALTER TABLE hr_people_next RENAME TO hr_people;
ALTER TABLE employment_records_next RENAME TO employment_records;
ALTER TABLE hr_teams_next RENAME TO hr_teams;
ALTER TABLE hr_team_members_next RENAME TO hr_team_members;

CREATE INDEX hr_people_org_idx ON hr_people(organization_id,active,display_name);
CREATE INDEX employment_records_person_idx ON employment_records(organization_id,person_id,starts_on);
CREATE INDEX hr_team_members_person_idx ON hr_team_members(organization_id,person_id,ends_on);

-- SQLite considers NULL values distinct in ordinary UNIQUE constraints.
-- COALESCE closes that loophole for an open-ended team membership.
CREATE UNIQUE INDEX hr_team_members_period_unique
ON hr_team_members(organization_id,team_id,person_id,COALESCE(starts_on,''));

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('hr.records.view','Consulter les dossiers RH relationnels'),
 ('hr.records.manage','Gérer les dossiers RH relationnels');
