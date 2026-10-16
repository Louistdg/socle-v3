# IA4 — Base de données, migrations et intégrité SQLite

Date : 2026-09-29

## Périmètre

Mission IA4 uniquement : intégrité SQLite, migrations, installation neuve et chemins de mise à niveau. Aucun changement Hub/Timeline/UI et aucune fusion vers `main`.

- Dépôt : `Louistdg/SOCLE-V2`
- Branche source : `fix/reprise-factuelle-priorites-1-3-2026-09-29`
- SHA source figé : `18d62fd02f7fbec0aa9c28b28464d2af168cf796`
- Branche IA4 : `diag/database-migrations-integrity-v2-2026-09-29`
- Chaîne auditée après correctif : `0000` → `0029`

## Anomalie confirmée

La migration `0028_project_financial_baseline.sql` stockait `organization_id` et `project_id` sans contrainte de cohérence tenant/projet.

Le serveur vérifie bien les projets avec `organization_id`, mais SQLite acceptait en écriture directe une baseline :

- `organization_id = org-a`
- `project_id = project-b`
- alors que `project-b` appartient à `org-b`.

Reproduction SQLite réelle, avec `PRAGMA foreign_keys=ON` :

- `foreign_keys = 1`
- insertion cross-tenant acceptée par 0028 ;
- `PRAGMA foreign_key_check` vide ;
- `PRAGMA integrity_check = ok`.

Cela démontrait que les FK existantes ne suffisaient pas à détecter cette incohérence de tenant.

## Correctif 0029

Ajout de `drizzle/0029_project_tenant_integrity.sql`.

Le correctif est additif et conserve la compatibilité avec les chantiers legacy :

- `expenses.project_id` doit désigner un projet relationnel de la même organisation ; les anciens IDs doivent être dans `legacy_project_id` depuis 0027 ;
- `supplier_invoice_matches.project_id` peut rester un ID legacy absent de `projects`, mais un ID qui existe dans `projects` ne peut appartenir à une autre organisation ;
- `project_financial_baselines.project_id` suit la même règle ;
- des gardes de migration détectent les corruptions historiques et font échouer la migration au lieu de réécrire ou supprimer silencieusement les données ;
- des triggers empêchent les nouvelles insertions/mises à jour cross-tenant.

## Tests réellement exécutés

### Reproduction ciblée 0028

Exécutée avec Node 22 / `node:sqlite` et `PRAGMA foreign_keys=ON`.

Résultat : l'insertion cross-tenant est acceptée avant 0029. Bug reproduit.

### Validation ciblée 0029

Exécutée avec Node 22 / `node:sqlite`.

Résultat : **PASS — 8 contrôles** :

- baseline cross-tenant refusée ;
- baseline legacy acceptée ;
- dépense cross-tenant refusée ;
- dépense même tenant acceptée ;
- rapprochement fournisseur cross-tenant refusé ;
- rapprochement legacy accepté ;
- `foreign_key_check` vide ;
- `integrity_check = ok`.

### Suites de migration exécutées sur la chaîne GitHub 0000→0029

Les 30 migrations et 5 fichiers de test ont été reconstruits dans un runner Node à partir du contenu exact lu sur la branche IA4 via le connecteur GitHub.

Résultats réels, exit code 0 :

- `migrations-current-integrity-29.mjs` : **79 assertions réussies**
- `migrations-project-scope-29.mjs` : **8 assertions réussies**
- `migrations-clean-upgrade-21.mjs` : **28 assertions réussies**
- `migrations-integrity-0020-0021.mjs` : **23 assertions réussies**
- `migrations-workspace-0019.mjs` : **20 assertions réussies**

Total : **158 assertions réussies**.

La suite couvre notamment :

- séquence continue 0000→0029 ;
- installation SQLite neuve avec journal transactionnel `local_migrations` ;
- redémarrage sans rejeu des migrations journalisées ;
- upgrade depuis 0021 avec conservation workspace + RH ;
- chaîne RH autour de 0018/0020/0021 ;
- upgrade depuis 0026 vers 0027/0028/0029 avec réparation explicite d'un ancien `project_id` orphelin vers `legacy_project_id` ;
- rollback réel après erreur injectée pendant 0028 ;
- reprise après rollback ;
- rejeu prévu de 0028 et 0029 ;
- blocage d'une corruption historique cross-tenant avant installation des triggers 0029 ;
- reprise de 0029 après correction explicite de la donnée ;
- CHECK, UNIQUE, FK et triggers d'immutabilité des baselines/budgets.

## GitHub Actions

Le workflow `Node.js CI` ne fournit actuellement aucune preuve de test, car il échoue avant le démarrage des jobs :

- SHA source `18d62fd02f7fbec0aa9c28b28464d2af168cf796` : run #224 — `startup_failure`
- premier commit IA4 de reproduction `261f2664cc361e82e2e98b133882ac94a620a7cd` : run #247 — `startup_failure`
- HEAD IA4 avant ce rapport `e048c194340e1c2535ef839d49206c18a128ca22` : run #274 — `startup_failure`

Le `startup_failure` existait donc déjà sur le SHA source. Il n'est pas considéré comme un test échoué du code IA4, mais il reste un blocage de release à traiter par IA6.

## Statut demandé

**INSTALLATION NEUVE : OK pour la chaîne SQLite 0000→0029 testée.**

Preuves : installation transactionnelle complète, 30 migrations journalisées, `foreign_keys=ON`, `foreign_key_check` vide, `integrity_check=ok`, structures 0028/0029 présentes, redémarrage sans migration pendante.

**MISE À JOUR ANCIENNE BASE : OK pour les chemins reproduits et testés.**

Chemins vérifiés :

- autour de 0018/0020/0021 ;
- départ 0021 → 0029 avec données workspace/RH préservées ;
- départ 0026 → 0029 avec ancien projet orphelin réparé par 0027 ;
- interruption 0028 → rollback → reprise 0028/0029 ;
- base 0028 historiquement cross-tenant → 0029 refuse la migration sans perte silencieuse → correction explicite → reprise réussie.

Ce statut ne vaut pas validation finale du superviseur.

## Fichiers IA4

- `drizzle/0029_project_tenant_integrity.sql`
- `tests/migrations-project-scope-29.mjs`
- `tests/migrations-current-integrity-29.mjs`
- `docs/IA4_DATABASE_MIGRATIONS_INTEGRITY_2026-09-29.md`

## Risques / points ouverts

1. GitHub Actions reste en `startup_failure`; aucune gate CI GitHub ne peut encore certifier cette branche.
2. La PR IA4 a initialement été ouverte vers `main` uniquement pour déclencher la CI. La branche IA4 est basée sur une branche fonctionnelle qui contient déjà de nombreux changements sans rapport avec IA4 ; il ne faut pas fusionner la PR en bloc vers `main`.
3. Pour l'intégration, le superviseur doit préférer un rebase/cherry-pick contrôlé des commits IA4 sur la branche d'intégration retenue, en vérifiant que 0029 reste le prochain numéro libre.
4. Plusieurs tables historiques plus anciennes utilisent encore des IDs globaux avec contrôles de tenant assurés en partie par le serveur. Le défaut concret corrigé ici concerne la chaîne finance récente ; un durcissement composite généralisé constituerait une mission séparée et risquerait de casser la compatibilité legacy.
5. Les tests SQLite prouvent la migration et les contraintes de base ; ils ne remplacent pas les tests d'API/RBAC/cross-tenant d'IA3/IA6.

## Décision superviseur attendue

Le superviseur doit contrôler :

- ordre final des migrations et disponibilité du numéro 0029 lors de l'intégration ;
- absence de conflit avec les travaux Uno/Dos/IA5 ;
- stratégie d'intégration de la migration 0029 et des deux tests ;
- réparation de la CI `startup_failure` avant toute décision de release ;
- exécution de la gate complète après intégration.
