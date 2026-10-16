PRAGMA foreign_keys = ON;

-- Les tâches de chantier vivent hors du bloc workspace_state : elles peuvent
-- donc être écrites par un collaborateur sans lui donner les droits globaux.
CREATE TABLE IF NOT EXISTS project_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('todo','in_progress','blocked','done')) DEFAULT 'todo',
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high','urgent')) DEFAULT 'normal',
  assigned_to TEXT REFERENCES profiles(id),
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS project_tasks_scope_idx ON project_tasks(organization_id,project_id,status,updated_at);
CREATE INDEX IF NOT EXISTS project_tasks_assignee_idx ON project_tasks(organization_id,assigned_to,status);

CREATE TABLE IF NOT EXISTS project_task_comments (
  id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL REFERENCES project_tasks(id),
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  body TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES profiles(id),
  created_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS project_task_comments_task_idx ON project_task_comments(task_id,created_at);

INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('tasks.manage.project','Créer et gérer les tâches de ses chantiers'),
 ('tasks.update.assigned','Mettre à jour les états autorisés de ses tâches'),
 ('tasks.comment.create','Ajouter un commentaire à une tâche autorisée');
