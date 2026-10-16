# SOCLE — état actuel et reprise rapide

Dernière mise à jour : **26 septembre 2026**.

## Base de référence

Cet export est issu exclusivement de `SOCLE_b990_POINT7_VALIDE_2026-09-26.zip`, travaillé sur une copie isolée. Le worktree Windows canonique n'a pas été modifié directement.

Projet canonique sur le PC :

`C:\Users\louis\.codex\worktrees\b990\Socle - Jumeau administratif\versions\Socle vierge`

## État validé

- Points 1–5 : correctifs sécurité/RBAC/routes métier conservés.
- Point 6 : **VALIDÉ** — stock multi-emplacement, soldes par emplacement, mouvements atomiques, idempotence et contrôle du négatif.
- Point 7 : **VALIDÉ** — paiements partiels/multiples, restant dû, avoirs, concurrence et idempotence financière.
- Point 8 : **VALIDÉ dans cet export** — documents privés serveur et multi-relations.
- Point 9 : **NON COMMENCÉ**.

## Point 8 — architecture documentaire

Le module Documents n'utilise plus `workspace_state` comme stockage de fichiers. Les fondations historiques `document_folders`, `secure_documents`, `document_access_grants` et `document_access_logs` sont réutilisées.

La migration `0014_documents_private_relations.sql` ajoute :

- métadonnées documentaires (`title`, `description`, `category`, `reference`) ;
- idempotence d'import ;
- `secure_document_blobs` : stockage binaire privé D1, sans URL publique ;
- `document_relations` : plusieurs relations métier pour un document unique ;
- permission `documents.secure.confidential`.

Un document peut être relié aux objets existants pertinents sans dupliquer son contenu. Le serveur valide organisation, permission, confidentialité et périmètre. Preview et download passent par les mêmes contrôles serveur.

Le stockage actuel est volontairement adapté au déploiement D1-only déclaré dans `.openai/hosting.json` : un payload binaire privé unique est conservé en base. `storage_key` reste généré côté serveur afin de permettre un futur passage à un bucket privé sans changer l'identité métier des documents.

## Sécurité à préserver

- `PUT /api/state` reste strictement OWNER-only.
- Aucune session ne devient jamais OWNER par fallback.
- RBAC, `organization_id`, `project_access` et contrôles cross-tenant restent serveur.
- Un document confidentiel exige la permission documentaire confidentielle en plus du périmètre métier.
- Connaître un ID de document, un nom ou un chemin ne donne aucun accès.
- Les noms clients ne déterminent jamais le chemin de stockage.
- PDF/JPEG/PNG/WebP seulement ; MIME, signature binaire, extension et taille sont contrôlés côté serveur.
- Les données dynamiques sont échappées côté interface.
- Les uploads utilisent une clé d'idempotence et les écritures document + blob + relations + audit sont regroupées en transaction DB.
- Retirer une relation ne supprime pas le document ni son fichier ; un document sans relation reste dans la bibliothèque centrale.

## Vérifications de cet export

Build complet : **réussi**.

Assertions non-navigateur exécutées automatiquement et réussies : **652**.

- suites Points 1–7 exécutables dans cet environnement : **519** assertions ;
- nouvelles suites Point 8 : **133** assertions (`documents-private-18`: 88, `documents-migration-18`: 17, `documents-ui-18`: 28).

`local-auth-required-15.mjs` ne peut toujours pas créer son sous-processus Node dans ce bac à sable (`spawn ... ENOENT`). Ses **6 contrôles équivalents ont été rejoués manuellement contre le vrai serveur local : 6/6 réussis**. Ils ne sont pas ajoutés au total automatique.

Les tests navigateur `browser-identities-15.mjs` et `browser-15.mjs` ont été tentés mais Chromium/CDP reste indisponible sur `127.0.0.1:9222` (`ECONNREFUSED`). Ils ont atteint **0 assertion** et ne sont pas comptés comme réussis.

## Migrations

La base de cet export est migrée jusqu'à :

`0014_documents_private_relations.sql`

La migration a été vérifiée sur :

- une base Point 7 existante simulée → Point 8 ;
- une base neuve appliquant 0000 → 0014.

## Suite officielle

9. Ventilation fournisseur dans toutes les vues — **à faire, non commencé**.
10. Administratif chantier et prévention.
11. Trésorerie / dashboard / drill-down.
12. Validation quatre sessions + nettoyage final.

Ne commencer le Point 9 qu'après contre-audit indépendant du livrable Point 8.
