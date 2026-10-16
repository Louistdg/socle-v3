-- Monthly time-entry closure is an auditable archive marker, not a lock.
-- Closed entries remain in time_entries so authorized corrections can update
-- the source records and the monthly report can always be recalculated.
CREATE TABLE IF NOT EXISTS time_entry_month_closures (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  month TEXT NOT NULL CHECK(length(month)=7 AND substr(month,5,1)='-' AND CAST(substr(month,1,4) AS INTEGER)>0 AND CAST(substr(month,6,2) AS INTEGER) BETWEEN 1 AND 12),
  closed_at TEXT NOT NULL,
  closed_by TEXT NOT NULL REFERENCES profiles(id),
  archived_count INTEGER NOT NULL DEFAULT 0 CHECK(archived_count>=0),
  PRIMARY KEY (organization_id,month)
);

CREATE INDEX IF NOT EXISTS time_entry_month_closures_org_closed_idx
ON time_entry_month_closures(organization_id,closed_at);

-- Database-level guard: a concurrent request cannot archive a month while a
-- punch is still open or a correction is waiting for approval.
CREATE TRIGGER IF NOT EXISTS time_entry_month_close_guard_insert
BEFORE INSERT ON time_entry_month_closures
WHEN EXISTS (
  SELECT 1 FROM time_entries e
  WHERE e.organization_id=NEW.organization_id
    AND substr(e.work_date,1,7)=NEW.month
    AND e.archived_at IS NULL
    AND e.departure IS NULL
) OR EXISTS (
  SELECT 1 FROM time_entry_corrections c
  JOIN time_entries e ON e.id=c.time_entry_id AND e.organization_id=c.organization_id
  WHERE c.organization_id=NEW.organization_id
    AND substr(e.work_date,1,7)=NEW.month
    AND c.status='pending'
)
BEGIN
  SELECT RAISE(ABORT,'time_entry_month_unresolved');
END;

CREATE TRIGGER IF NOT EXISTS time_entry_month_close_guard_update
BEFORE UPDATE OF closed_at,closed_by,archived_count ON time_entry_month_closures
WHEN EXISTS (
  SELECT 1 FROM time_entries e
  WHERE e.organization_id=NEW.organization_id
    AND substr(e.work_date,1,7)=NEW.month
    AND e.archived_at IS NULL
    AND e.departure IS NULL
) OR EXISTS (
  SELECT 1 FROM time_entry_corrections c
  JOIN time_entries e ON e.id=c.time_entry_id AND e.organization_id=c.organization_id
  WHERE c.organization_id=NEW.organization_id
    AND substr(e.work_date,1,7)=NEW.month
    AND c.status='pending'
)
BEGIN
  SELECT RAISE(ABORT,'time_entry_month_unresolved');
END;
