PRAGMA foreign_keys = ON;

-- Preserve the relational project foreign key while allowing supplier expenses
-- to belong to legacy workspace projects that do not have a row in projects.
ALTER TABLE expenses ADD COLUMN legacy_project_id TEXT;

-- Repair historical rows created while foreign-key enforcement was disabled.
-- Valid relational project ids remain in project_id; only orphaned ids move to
-- the explicit legacy column.
UPDATE expenses
SET legacy_project_id=project_id,
    project_id=NULL
WHERE project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM projects p
    WHERE p.organization_id=expenses.organization_id
      AND p.id=expenses.project_id
  );

CREATE INDEX IF NOT EXISTS expenses_effective_project_idx
ON expenses(organization_id,legacy_project_id,project_id,archived_at,expense_date);

CREATE TRIGGER IF NOT EXISTS expenses_project_scope_insert
BEFORE INSERT ON expenses
WHEN NEW.project_id IS NOT NULL AND NEW.legacy_project_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'expense_project_scope_ambiguous');
END;

CREATE TRIGGER IF NOT EXISTS expenses_project_scope_update
BEFORE UPDATE OF project_id,legacy_project_id ON expenses
WHEN NEW.project_id IS NOT NULL AND NEW.legacy_project_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT,'expense_project_scope_ambiguous');
END;
