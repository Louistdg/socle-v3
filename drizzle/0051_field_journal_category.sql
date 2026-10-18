ALTER TABLE field_project_notes
  ADD COLUMN category TEXT NOT NULL DEFAULT 'Avancement'
  CHECK (category IN ('Avancement','Problème','Livraison','Sécurité'));
