PRAGMA foreign_keys = ON;

-- IA-B Planning operations: extend the existing field_assignments source of truth.
ALTER TABLE field_assignments ADD COLUMN start_time TEXT NOT NULL DEFAULT '07:00';
ALTER TABLE field_assignments ADD COLUMN end_time TEXT NOT NULL DEFAULT '16:00';
ALTER TABLE field_assignments ADD COLUMN assignment_type TEXT NOT NULL DEFAULT 'team';
ALTER TABLE field_assignments ADD COLUMN status TEXT NOT NULL DEFAULT 'planned';
ALTER TABLE field_assignments ADD COLUMN reason TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS field_assignments_time_idx
ON field_assignments(organization_id,assignment_date,start_time,end_time);

-- Availability is operational planning data, separate from payroll/finance.
CREATE TABLE IF NOT EXISTS planning_absences (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  absence_type TEXT NOT NULL CHECK(absence_type IN ('absence','leave','sickness','training','unavailable')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending','approved','cancelled')),
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (organization_id,person_id) REFERENCES hr_people(organization_id,id)
);
CREATE INDEX IF NOT EXISTS planning_absences_person_time_idx
ON planning_absences(organization_id,person_id,starts_at,ends_at,status);

-- Team leaders are temporal so replacements do not overwrite the permanent structure.
CREATE TABLE IF NOT EXISTS hr_team_leads (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  temporary INTEGER NOT NULL DEFAULT 0 CHECK(temporary IN (0,1)),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (organization_id,team_id) REFERENCES hr_teams(organization_id,id),
  FOREIGN KEY (organization_id,person_id) REFERENCES hr_people(organization_id,id)
);
CREATE INDEX IF NOT EXISTS hr_team_leads_active_idx
ON hr_team_leads(organization_id,team_id,starts_on,ends_on);

-- Operational project blocks (weather/client/material/architect/technical/other).
CREATE TABLE IF NOT EXISTS project_planning_blocks (
  organization_id TEXT NOT NULL,
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  block_type TEXT NOT NULL CHECK(block_type IN ('weather','client','material','architect','technical','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','resolved','cancelled')),
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,id),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
CREATE INDEX IF NOT EXISTS project_planning_blocks_scope_idx
ON project_planning_blocks(organization_id,project_id,starts_at,ends_at,status);
