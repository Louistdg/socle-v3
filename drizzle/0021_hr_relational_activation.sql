PRAGMA foreign_keys = ON;

-- Activate the relational HR read permission for roles that already had the
-- legacy sensitive-HR visibility. Management remains opt-in; OWNER bypasses RBAC.
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT role_id,'hr.records.view'
FROM role_permissions
WHERE permission_code='hr.sensitive.view';
