# SOCLE — Rapport de validation du point 5

Date : 25 septembre 2026  
Base : instantané SOCLE b990 exporté le 25/09/2026, points 1 à 4 préservés.  
Périmètre : **point 5 uniquement**. Le point 6 (stock multi-emplacement) n’a pas été commencé.

## Conclusion

# POINT 5 VALIDÉ

Le pointage serveur déjà présent a été conservé et vérifié. Les écritures terrain encore locales ont été déplacées vers des routes métier serveur dédiées pour le planning, le matériel, le carburant, les matériaux/fiches/remarques chantier, le stock mono-emplacement et la réception des livraisons.

`PUT /api/state` reste strictement OWNER-only. Les routes ajoutées appliquent les contrôles serveur d’organisation, permission et périmètre chantier nécessaires, et les opérations sensibles sont auditées.

## Routes ajoutées / finalisées

- `GET /api/field-data`
- `POST /api/assignments`
- `PUT /api/assignments/:id`
- `DELETE /api/assignments/:id`
- `POST /api/assets`
- `PATCH /api/assets/:id`
- `POST /api/assets/:id/fuel`
- `POST /api/assets/:id/issues`
- `POST /api/projects/:id/materials`
- `PUT /api/projects/:id/execution`
- `POST /api/projects/:id/notes`
- `POST /api/stock-items`
- `PATCH /api/stock-items/:id`
- `POST /api/stock-items/:id/movements`
- `POST /api/purchase-orders/:id/deliveries`

Les routes de pointage déjà présentes restent utilisées : lecture, arrivée, départ, demande de correction et validation de correction.

## Écritures legacy remplacées

Après chargement réussi des données terrain serveur, le snapshot legacy ne réécrit plus :

- `assignments` ;
- `assets` et `fuelEntries` ;
- `stockItems` et leurs mouvements ;
- `deliveryNotes` ;
- `job.materials` ;
- `job.execution` ;
- `job.notes` ;
- les `timeEntries` étaient déjà exclus par le correctif pointage existant.

Les commandes fournisseurs restent dans le modèle existant pour le moment ; la **réception** est désormais une écriture serveur. Le point 6 n’a pas été anticipé : aucun modèle d’emplacements multiples n’a été créé.

## Contrôles de sécurité

- session obligatoire ;
- `organization_id` imposé par le contexte serveur ;
- ressource reçue par ID relue avec son organisation ;
- permission métier vérifiée côté serveur ;
- périmètre chantier vérifié pour planning, matériaux, exécution, remarques, mouvements liés à un chantier et livraisons ;
- personnes d’une affectation validées contre l’entreprise ;
- auteur/conducteur d’un plein déterminé côté serveur, pas par une valeur libre envoyée par le navigateur ;
- note « Patron uniquement » interdite à un collaborateur ;
- stock négatif refusé ;
- sur-réception fournisseur refusée ;
- actions cross-tenant renvoyées comme ressources introuvables/inaccessibles ;
- audit serveur des opérations sensibles.

## Fichiers source modifiés / ajoutés

- `worker/index.js`
- `drizzle/0011_field_operations.sql` — nouveau
- `web/field-server.js` — nouveau
- `web/index.html`
- `web/admin.js`
- `scripts/build.mjs`
- `scripts/local.mjs`
- `tests/field-operation-routes-15.mjs` — nouveau
- `tests/field-operations-ui-15.mjs` — nouveau
- `tests/local-auth-required-15.mjs` — rendu non destructif pour préserver `data/` pendant la suite complète
- `tests/browser-15.mjs` — adaptation du workflow livraison devenu asynchrone
- `00-ETAT-ACTUEL-ET-REPRISE.md`
- `00-REPRISE-ACTUELLE.md`

`dist/server/index.js` n’a pas été édité directement : il est régénéré par `scripts/build.mjs`.

## Tests

Suite automatisée non navigateur : **333 assertions réussies**.

- data : 20
- security hardening : 33
- XSS inline : 4
- access control : 39
- access UI : 13
- permissions : 20
- task routes : 21
- local auth required : 6
- time-entry routes : 44
- field server UI existant : 18
- conversation scope : 34
- nouvelles routes terrain : 61
- nouveau branchement UI terrain : 20

Le build complet et la vérification syntaxique de `dist/server/index.js` réussissent.

### Tests navigateur non exécutables dans cet environnement

`browser-identities-15.mjs` et `browser-15.mjs` ont été tentés. Chromium headless démarre et expose bien DevTools sur le port 9222, mais son processus ne peut pas joindre le serveur local `127.0.0.1:4281` dans cet environnement, alors que `curl` y accède. Les tests échouent donc avant leurs assertions avec `TypeError: Failed to fetch`.

Ils restent à rejouer sur le PC Windows avec Chromium/Chrome en mode debug. Ce blocage n’a pas été compté comme une régression SOCLE.

## Point 6

**Non commencé.** Le stock reste mono-emplacement dans le point 5. Le futur modèle multi-emplacement, les transferts atomiques entre emplacements et la reprise détaillée du stock d’ouverture appartiennent au point 6.
