PRAGMA foreign_keys = ON;

-- Les prix de devis sont une donnée sensible distincte de l'accès au chantier.
-- Le rôle OWNER contourne les permissions dans le worker; les autres rôles
-- doivent recevoir explicitement ce droit pour voir les montants.
INSERT OR IGNORE INTO permissions(code,description) VALUES
 ('quotes.prices.view','Voir les prix et montants des devis');
