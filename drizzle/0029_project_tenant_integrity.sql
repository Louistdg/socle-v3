PRAGMA foreign_keys = ON;

-- IA4: enforce tenant/project coherence for the recent finance chain without
-- rejecting legacy workspace project ids that do not exist in relational projects.
--
-- expenses.project_id is relational after 0027; legacy ids belong in legacy_project_id.
-- supplier_invoice_matches.project_id and project_financial_baselines.project_id may
-- still reference legacy workspace projects, so only an id that resolves to a
-- relational project in another organization is rejected.

CREATE TABLE IF NOT EXISTS migration_guard_0029_project_scope (
  violation INTEGER NOT NULL CHECK (violation = 0)
);
DELETE FROM migration_guard_0029_project_scope;

-- Existing relational expense ids must belong to the same organization.
INSERT INTO migration_guard_0029_project_scope(violation)
SELECT 1
WHERE EXISTS (
  SELECT 1
  FROM expenses e
  WHERE e.project_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id=e.project_id
        AND p.organization_id=e.organization_id
    )
);

-- Legacy-capable tables may use an id absent from projects, but never a
-- relational project id owned by a different organization.
INSERT INTO migration_guard_0029_project_scope(violation)
SELECT 1
WHERE EXISTS (
  SELECT 1
  FROM supplier_invoice_matches m
  WHERE EXISTS (SELECT 1 FROM projects p_any WHERE p_any.id=m.project_id)
    AND NOT EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id=m.project_id
        AND p.organization_id=m.organization_id
    )
);

INSERT INTO migration_guard_0029_project_scope(violation)
SELECT 1
WHERE EXISTS (
  SELECT 1
  FROM project_financial_baselines b
  WHERE EXISTS (SELECT 1 FROM projects p_any WHERE p_any.id=b.project_id)
    AND NOT EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id=b.project_id
        AND p.organization_id=b.organization_id
    )
);

DROP TABLE migration_guard_0029_project_scope;

CREATE TRIGGER IF NOT EXISTS expenses_project_tenant_insert
BEFORE INSERT ON expenses
WHEN NEW.project_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM projects p
   WHERE p.id=NEW.project_id
     AND p.organization_id=NEW.organization_id
 )
BEGIN
  SELECT RAISE(ABORT,'expense_project_cross_tenant');
END;

CREATE TRIGGER IF NOT EXISTS expenses_project_tenant_update
BEFORE UPDATE OF organization_id,project_id ON expenses
WHEN NEW.project_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM projects p
   WHERE p.id=NEW.project_id
     AND p.organization_id=NEW.organization_id
 )
BEGIN
  SELECT RAISE(ABORT,'expense_project_cross_tenant');
END;

CREATE TRIGGER IF NOT EXISTS supplier_invoice_match_project_tenant_insert
BEFORE INSERT ON supplier_invoice_matches
WHEN EXISTS (SELECT 1 FROM projects p_any WHERE p_any.id=NEW.project_id)
 AND NOT EXISTS (
   SELECT 1 FROM projects p
   WHERE p.id=NEW.project_id
     AND p.organization_id=NEW.organization_id
 )
BEGIN
  SELECT RAISE(ABORT,'supplier_invoice_match_cross_tenant_project');
END;

CREATE TRIGGER IF NOT EXISTS project_financial_baseline_project_tenant_insert
BEFORE INSERT ON project_financial_baselines
WHEN EXISTS (SELECT 1 FROM projects p_any WHERE p_any.id=NEW.project_id)
 AND NOT EXISTS (
   SELECT 1 FROM projects p
   WHERE p.id=NEW.project_id
     AND p.organization_id=NEW.organization_id
 )
BEGIN
  SELECT RAISE(ABORT,'project_financial_baseline_cross_tenant_project');
END;

CREATE TRIGGER IF NOT EXISTS project_financial_baseline_project_tenant_update
BEFORE UPDATE OF organization_id,project_id ON project_financial_baselines
WHEN EXISTS (SELECT 1 FROM projects p_any WHERE p_any.id=NEW.project_id)
 AND NOT EXISTS (
   SELECT 1 FROM projects p
   WHERE p.id=NEW.project_id
     AND p.organization_id=NEW.organization_id
 )
BEGIN
  SELECT RAISE(ABORT,'project_financial_baseline_cross_tenant_project');
END;
