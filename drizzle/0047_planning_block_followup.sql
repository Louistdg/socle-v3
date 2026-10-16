PRAGMA foreign_keys = ON;

-- Planning lookahead: track who owns an operational constraint and when it is due.
ALTER TABLE project_planning_blocks ADD COLUMN responsible_person_id TEXT NOT NULL DEFAULT '';
ALTER TABLE project_planning_blocks ADD COLUMN due_date TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS project_planning_blocks_followup_idx
ON project_planning_blocks(organization_id,status,due_date,responsible_person_id);
