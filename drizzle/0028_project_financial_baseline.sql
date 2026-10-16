PRAGMA foreign_keys = ON;

-- Versioned, server-authoritative project financial baseline.
CREATE TABLE IF NOT EXISTS project_financial_baselines (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded')),
  planned_minutes INTEGER CHECK (planned_minutes IS NULL OR planned_minutes >= 0),
  hourly_cost_cents INTEGER CHECK (hourly_cost_cents IS NULL OR hourly_cost_cents >= 0),
  progress_basis_points INTEGER CHECK (progress_basis_points IS NULL OR (progress_basis_points >= 0 AND progress_basis_points <= 10000)),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL REFERENCES profiles(id),
  updated_at TEXT NOT NULL,
  UNIQUE (organization_id,project_id,version)
);

CREATE UNIQUE INDEX IF NOT EXISTS project_financial_baseline_active_idx
ON project_financial_baselines(organization_id,project_id)
WHERE status='active';

CREATE TABLE IF NOT EXISTS project_cost_budgets (
  baseline_id TEXT NOT NULL REFERENCES project_financial_baselines(id),
  category TEXT NOT NULL CHECK (category IN ('LABOUR','MATERIALS','SUBCONTRACTING','EQUIPMENT','OTHER')),
  budget_cents INTEGER CHECK (budget_cents IS NULL OR budget_cents >= 0),
  PRIMARY KEY (baseline_id,category)
);

CREATE INDEX IF NOT EXISTS project_financial_baseline_project_idx
ON project_financial_baselines(organization_id,project_id,version DESC);

CREATE TRIGGER IF NOT EXISTS project_financial_baseline_no_delete
BEFORE DELETE ON project_financial_baselines
BEGIN
  SELECT RAISE(ABORT,'project_financial_baseline_immutable');
END;

CREATE TRIGGER IF NOT EXISTS project_cost_budget_no_delete
BEFORE DELETE ON project_cost_budgets
BEGIN
  SELECT RAISE(ABORT,'project_cost_budget_immutable');
END;
