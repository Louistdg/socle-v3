PRAGMA foreign_keys = ON;

-- Creates and relative replans use a receipt so browser retries are safe.
CREATE TABLE IF NOT EXISTS planning_operation_receipts (
  organization_id TEXT NOT NULL,
  operation_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES profiles(id),
  operation_kind TEXT NOT NULL CHECK(operation_kind IN ('assignment','replan')),
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (organization_id,operation_key),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- The API checks first to give a useful message; triggers are the final guard
-- against concurrent writes and other paths that bypass that preflight check.
CREATE TRIGGER IF NOT EXISTS field_assignments_conflict_insert
BEFORE INSERT ON field_assignments
WHEN NEW.status <> 'cancelled'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM field_assignments existing
    WHERE existing.organization_id=NEW.organization_id
      AND existing.id<>NEW.id
      AND existing.assignment_date=NEW.assignment_date
      AND existing.status <> 'cancelled'
      AND (existing.team_id=NEW.team_id OR EXISTS (
        SELECT 1
        FROM json_each(CASE WHEN json_valid(existing.people_json) THEN existing.people_json ELSE '[]' END) existing_person
        JOIN json_each(CASE WHEN json_valid(NEW.people_json) THEN NEW.people_json ELSE '[]' END) new_person
          ON CAST(existing_person.value AS TEXT)=CAST(new_person.value AS TEXT)
      ))
      AND COALESCE(existing.start_time,'07:00') < COALESCE(NEW.end_time,'16:00')
      AND COALESCE(NEW.start_time,'07:00') < COALESCE(existing.end_time,'16:00')
  ) THEN RAISE(ABORT,'planning_assignment_conflict') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM planning_absences absence
    JOIN json_each(CASE WHEN json_valid(NEW.people_json) THEN NEW.people_json ELSE '[]' END) assigned_person
      ON CAST(assigned_person.value AS TEXT)=absence.person_id
    WHERE absence.organization_id=NEW.organization_id
      AND absence.status='approved'
      AND absence.starts_at < NEW.assignment_date||'T'||COALESCE(NEW.end_time,'16:00')
      AND absence.ends_at > NEW.assignment_date||'T'||COALESCE(NEW.start_time,'07:00')
  ) THEN RAISE(ABORT,'planning_absence_conflict') END;
END;

CREATE TRIGGER IF NOT EXISTS field_assignments_conflict_update
BEFORE UPDATE OF organization_id,assignment_date,team_id,project_id,people_json,start_time,end_time,status
ON field_assignments
WHEN NEW.status <> 'cancelled'
BEGIN
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM field_assignments existing
    WHERE existing.organization_id=NEW.organization_id
      AND existing.assignment_date=NEW.assignment_date
      AND existing.id<>OLD.id
      AND existing.status <> 'cancelled'
      AND (existing.team_id=NEW.team_id OR EXISTS (
        SELECT 1
        FROM json_each(CASE WHEN json_valid(existing.people_json) THEN existing.people_json ELSE '[]' END) existing_person
        JOIN json_each(CASE WHEN json_valid(NEW.people_json) THEN NEW.people_json ELSE '[]' END) new_person
          ON CAST(existing_person.value AS TEXT)=CAST(new_person.value AS TEXT)
      ))
      AND COALESCE(existing.start_time,'07:00') < COALESCE(NEW.end_time,'16:00')
      AND COALESCE(NEW.start_time,'07:00') < COALESCE(existing.end_time,'16:00')
  ) THEN RAISE(ABORT,'planning_assignment_conflict') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM planning_absences absence
    JOIN json_each(CASE WHEN json_valid(NEW.people_json) THEN NEW.people_json ELSE '[]' END) assigned_person
      ON CAST(assigned_person.value AS TEXT)=absence.person_id
    WHERE absence.organization_id=NEW.organization_id
      AND absence.status='approved'
      AND absence.starts_at < NEW.assignment_date||'T'||COALESCE(NEW.end_time,'16:00')
      AND absence.ends_at > NEW.assignment_date||'T'||COALESCE(NEW.start_time,'07:00')
  ) THEN RAISE(ABORT,'planning_absence_conflict') END;
END;
