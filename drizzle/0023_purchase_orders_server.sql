PRAGMA foreign_keys = ON;

-- Script 2 requires supplier orders to be created through the authoritative server.
INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('purchase_orders.view','Voir les commandes fournisseurs'),
 ('purchase_orders.manage','Créer et gérer les commandes fournisseurs');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'purchase_orders.view'
  FROM role_permissions
  WHERE permission_code IN ('expenses.view','deliveries.view');

INSERT OR IGNORE INTO role_permissions(role_id,permission_code)
  SELECT role_id,'purchase_orders.manage'
  FROM role_permissions
  WHERE permission_code IN ('expenses.create','deliveries.receive');
