PRAGMA foreign_keys = ON;

-- UNO / chantier opérationnel : enrichit les tâches et remarques terrain sans
-- créer de système parallèle. Le statut historique des tâches reste inchangé ;
-- la validation chef/patron est portée par validated_*.
ALTER TABLE project_tasks ADD COLUMN due_at TEXT;
ALTER TABLE project_tasks ADD COLUMN checklist_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project_tasks ADD COLUMN materials_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project_tasks ADD COLUMN people_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project_tasks ADD COLUMN operation_key TEXT;
ALTER TABLE project_tasks ADD COLUMN task_kind TEXT NOT NULL DEFAULT 'task' CHECK (task_kind IN ('task','problem'));
ALTER TABLE project_tasks ADD COLUMN problem_category TEXT;
ALTER TABLE project_tasks ADD COLUMN photo_document_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project_tasks ADD COLUMN validated_by TEXT REFERENCES profiles(id);
ALTER TABLE project_tasks ADD COLUMN validated_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS project_tasks_operation_key_idx
ON project_tasks(organization_id,created_by,operation_key)
WHERE operation_key IS NOT NULL;

ALTER TABLE field_project_notes ADD COLUMN operation_key TEXT;
ALTER TABLE field_project_notes ADD COLUMN photo_document_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE field_project_notes ADD COLUMN updated_by TEXT REFERENCES profiles(id);
ALTER TABLE field_project_notes ADD COLUMN updated_at TEXT;
ALTER TABLE field_project_notes ADD COLUMN archived_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS field_project_notes_operation_key_idx
ON field_project_notes(organization_id,created_by,operation_key)
WHERE operation_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS field_project_notes_active_project_idx
ON field_project_notes(organization_id,project_id,archived_at,created_at);
