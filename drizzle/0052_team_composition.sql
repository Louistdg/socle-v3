-- Receipts make a person move atomic, replayable and guarded against stale views.
CREATE TABLE hr_composition_moves (
 organization_id TEXT NOT NULL REFERENCES organizations(id),
 operation_key TEXT NOT NULL,
 actor_user_id TEXT NOT NULL REFERENCES profiles(id),
 person_id TEXT NOT NULL,
 expected_json TEXT NOT NULL,
 desired_json TEXT NOT NULL,
 effective_date TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY (organization_id, operation_key)
);
CREATE TRIGGER hr_composition_guard BEFORE INSERT ON hr_composition_moves
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM hr_people WHERE organization_id=NEW.organization_id AND id=NEW.person_id AND active=1)
 THEN RAISE(ABORT,'composition_person_inactive') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.desired_json) d WHERE NOT EXISTS(SELECT 1 FROM hr_teams t WHERE t.organization_id=NEW.organization_id AND t.id=d.value AND t.active=1))
 THEN RAISE(ABORT,'composition_team_inactive') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_team_members WHERE organization_id=NEW.organization_id AND person_id=NEW.person_id AND ends_on IS NULL AND starts_on>NEW.effective_date)
 THEN RAISE(ABORT,'composition_future_membership') END;
 SELECT CASE WHEN (SELECT json_group_array(team_id) FROM (SELECT DISTINCT team_id FROM hr_team_members WHERE organization_id=NEW.organization_id AND person_id=NEW.person_id AND ends_on IS NULL AND (starts_on IS NULL OR starts_on<=NEW.effective_date) ORDER BY team_id))<>NEW.expected_json
 THEN RAISE(ABORT,'composition_stale') END;
END;
