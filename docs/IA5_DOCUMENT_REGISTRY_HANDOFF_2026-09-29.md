# IA5 — Registre documentaire transversal — passation superviseur

Date : 2026-09-29
Dépôt : `Louistdg/SOCLE-V2`
Branche IA5 : `ia5/document-registry-hardening-2026-09-29`
SHA au début de cette reprise : `599f83ff9392280123a4f0e6874167856e771f98`
SHA source historique du lot documentaire : `a34dadf934aa8f29f725e4a3a23a3a9f18dff5fe`
HEAD avant cette mise à jour de passation : `24167b1a859f08bdd5e9e0da4a6ad3d60a0dd266`

## Périmètre

Travail strictement limité au registre documentaire transversal : stockage privé, métadonnées, relations métier, recherche/filtrage, accès serveur, traçabilité, intégrité multi-tenant et tests associés. Aucun développement Hub/Timeline ni logique finance métier.

## État fonctionnel constaté

Le registre possède désormais :
- un stockage BLOB privé serveur, sans URL publique permanente ;
- des métadonnées documentaires : type, date, origine, propriétaire métier, auteur, sensibilité, checksum, statut ;
- des rattachements multiples à des objets SOCLE via `document_relations` ;
- des routes serveur pour liste/recherche, upload, détail, métadonnées, relations, preview/download, historique et archivage ;
- des filtres serveur `q`, type, origine, relation, propriétaire, auteur, sensibilité, dates et archivage ;
- un historique combinant audit métier et journaux d'accès ;
- un archivage contrôlé avec raison ;
- des champs `classification_source` et `ocr_status` préparant l'OCR/classement futur sans rendre l'IA obligatoire ;
- des permissions imposées côté serveur et des contrôles de portée métier.

## Bugs trouvés pendant cette reprise

### 1. Collision de migration IA4 / IA5

IA4 a réservé et livré `0029_project_tenant_integrity.sql` sur son lot d'intégrité base. IA5 possédait encore `0029_document_registry_transversal.sql`, puis `0030_document_registry_tenant_guards.sql`.

Correction :
- suppression du `0029` IA5 pour libérer définitivement ce numéro à IA4 ;
- consolidation des métadonnées + garde-fous tenant IA5 dans un seul fichier :
  `drizzle/0030_document_registry_transversal.sql` ;
- renommage des tests IA5 de migration vers le suffixe 30.

### 2. Rejeu d'upload idempotent trop permissif

Avant correction, une clé d'opération déjà utilisée était considérée comme un replay si le nom, la taille et le hash du fichier correspondaient. La même clé + le même PDF + des métadonnées ou rattachements différents pouvait donc retourner 200/replayed au lieu de signaler un conflit.

Correction :
- comparaison de l'intention complète de l'upload : fichier, type MIME, titre, description, catégorie, référence, sensibilité, type documentaire, date, origine, propriétaire métier et ensemble normalisé de relations ;
- même clé + même intention => replay 200 ;
- même clé + intention divergente => 409 ;
- le chemin de concurrence après violation d'unicité applique la même comparaison.

### 3. Tests documentaires devenus obsolètes après durcissement

`tests/documents-ui-18.mjs` attendait encore l'ancien appel littéral `serverJson('/api/documents')`, alors que la recherche/filtrage passe maintenant par `documentRegistryUrl()`. Une assertion sur la description ne correspondait plus non plus au rendu avec valeur vide sécurisée.

Correction :
- test aligné sur `serverJson(documentRegistryUrl())` ;
- assertion d'échappement alignée sur `esc(document.description||'')`.

## Correctifs déjà présents dans le lot IA5 avant cette reprise

- recherche et filtres principaux exécutés côté serveur plutôt que seulement sur les 250 documents déjà chargés ;
- rechargement contextuel serveur pour invoice / expense / asset / person / quote et hook tardif supplier allocation ;
- `organization_id` ajouté et backfill sur `document_access_grants` ;
- garde-fous SQLite pour dossiers, documents, blobs, relations, access logs et grants ;
- tenant dossier/document rendu immuable ;
- blocage des rattachements cross-tenant.

## Preuves réellement exécutées

### A. Reproduction et correction de l'idempotence

Le code exact de `documentUploadRoute` a été récupéré depuis GitHub et exécuté dans un harness contrôlé sur :
- ancien commit `8e96eb3b72a872841be052fb147f2acc26b3eda5` ;
- code corrigé après `a7a33c3ca7214281ba25ccabf5baff02a02be1da`.

Résultats :
- ancien code, replay strictement identique : 200 + `replayed:true` ;
- ancien code, même clé + même fichier + date différente : **200 + replayed:true** — bug reproduit ;
- nouveau code, replay strictement identique : 200 + `replayed:true` ;
- nouveau code, date différente : **409** ;
- nouveau code, relation différente : **409**.

### B. Permissions serveur

Les fonctions serveur exactes ont été exécutées avec un stockage simulé contrôlé :
- WORKER sans `documents.secure.view` sur la liste : **403** ;
- WORKER avec `documents.secure.view` sur la liste : **200** ;
- WORKER avec seulement `documents.secure.view` sur l'upload : **403** ;
- header d'organisation forgé sans membership : **403**.

Le test `tests/document-registry-transversal-30.mjs` contient aussi ces scénarios pour la suite Node 22.

### C. SQLite ciblé

Smoke SQLite réel avec `PRAGMA foreign_keys = ON`, schéma documentaire legacy minimal et application du SQL IA5 :
- migration appliquée : OK ;
- `PRAGMA foreign_keys = 1` ;
- backfill `document_access_grants.organization_id = org-a` ;
- backfill `business_owner_id = org-a` ;
- tentatives cross-tenant rejetées : parent de dossier, dossier d'un document, changement de tenant document, blob, relation, access log et grant.

Ce smoke est ciblé sur IA5 ; ce n'est pas une exécution de toute la chaîne SOCLE incluant le `0029` IA4.

### D. Contrôle UI/documentaire statique

Contrôle équivalent aux assertions de `documents-ui-18.mjs` sur les sources GitHub courantes :
- **31/31 contrôles passés** ;
- vérifiés notamment : UI chargée dans le build, stockage privé, routes serveur, preview/download same-origin, MIME, nom de fichier, limite taille, relations, archivage, échappement titre/description/relation, absence de `scheduleSave()`, absence d'URL publique de stockage.

### E. Preuves antérieures conservées

Sur le lot IA5 précédent :
- contrôle UI ciblé et parsing JavaScript : OK ;
- smoke tenant SQLite ciblé : OK ;
- recherche serveur et rechargement des contextes métier couverts par les tests IA5 existants.

## CI / exécution complète

Aucun succès CI complet n'est revendiqué ici. Le conteneur local disponible n'a pas pu cloner GitHub (résolution réseau indisponible), donc `npm test` complet n'a pas été exécuté dans ce conteneur. Un contrôle GitHub Actions sera refait sur le SHA final de la PR après synchronisation.

## Fichiers IA5 principaux après correction

- `drizzle/0030_document_registry_transversal.sql`
- `worker/index.js`
- `web/documents-server.js`
- `tests/document-registry-migration-30.mjs`
- `tests/document-registry-tenant-guards-30.mjs`
- `tests/document-registry-transversal-30.mjs`
- `tests/document-registry-ui-contexts-30.mjs`
- `tests/documents-ui-18.mjs`
- `docs/IA5_DOCUMENT_REGISTRY_HANDOFF_2026-09-29.md`

## Restant ouvert / risques

- La liste générale reste limitée à 250 résultats ; il manque une pagination/cursor pour une bibliothèque très volumineuse.
- `jobDocumentLinks` utilise encore le cache global pour l'affichage inline chantier. La route contextuelle sécurisée existe, mais sa modification empiéterait sur le Hub/Timeline réservé aux autres IA.
- Les identifiants customer/supplier de certains écrans Annuaire legacy ne sont pas encore garantis identiques aux IDs relationnels serveur ; ne pas créer de rattachement approximatif.
- Purchase order / delivery ont des types de relation backend, mais pas encore un parcours détail canonique homogène partout.
- La politique multi-relation est volontairement conservatrice : une relation non accessible peut rendre le document entier invisible, même si une autre relation est accessible. Toute modification de cette sémantique doit être décidée explicitement.
- Limite actuelle par fichier : 1,8 MB, liée au stockage BLOB/D1 actuel. Un object storage privé sera préférable à plus grande échelle.
- La vérification d'idempotence compare l'intention de replay à l'état actuel du document. Après une modification légitime ultérieure de métadonnées/relations, rejouer l'upload initial peut retourner 409. C'est sûr côté intégrité, mais cette sémantique doit être assumée.
- La chaîne combinée IA4 `0029_project_tenant_integrity.sql` → IA5 `0030_document_registry_transversal.sql` doit encore être exécutée par IA4/IA6 dans la gate globale.
- La validation finale appartient au superviseur.

Ce document est une passation factuelle, pas une validation.
