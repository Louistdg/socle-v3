PRAGMA foreign_keys = ON;

-- STOCK-WORKER-01: permission étroite de consommation terrain.
INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('stock.consume.assigned','Prendre du stock pour un chantier réellement affecté'),
 ('ui.field.consumeStock','UI · Prendre du stock');

-- Les rôles canoniques existants reçoivent le droit métier par défaut.
-- Aucun USER_* ni ACCOUNTING n'est autorisé par nom ou profil.
INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
SELECT id,'stock.consume.assigned' FROM roles WHERE code IN ('TEAM_LEAD','WORKER');
