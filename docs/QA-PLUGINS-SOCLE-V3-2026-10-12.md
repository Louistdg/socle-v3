# SOCLE V3 — intégration et vérification des outils terrain

Date : 12 octobre 2026
Périmètre : aperçu Railway V3 uniquement — `https://socle-v3-preview.up.railway.app`

## Outils intégrés

- **Pré-devis** : outil de mesure et de calcul pour toiture. Il prépare des quantités ; il n’invente ni prix, ni marge, ni TVA.
- **Factures fournisseurs** : lecture des PDF et extraction de champs proposés, à vérifier par une personne avant enregistrement.
- **Stock** : lecture des codes-barres avec possibilité de garder la saisie manuelle.

Les dépendances et leurs licences sont conservées dans le dépôt. Les données locales de test sont exclues du déploiement.

## Vérifications réussies

- `npm test` : **141 suites hermétiques réussies**.
- Browser Gate : **PASS** pour les identités, les parcours principaux et l’isolation du candidat.
- Parcours PC et mobile simulé ; contrôles des quatre rôles, des sept thèmes, du pré-devis, du scan et des repli/fallbacks.
- Tests ciblés : calcul toiture branché au pré-devis ; lecture PDF fournisseur (27 assertions) ; code-barres (25 assertions).
- `npm run build` : réussi.
- `npm audit --audit-level=low` : aucune vulnérabilité signalée.
- Les fichiers V3 de thème et de mise en page contrôlés restent identiques aux empreintes de l’aperçu accepté, conservées dans `socle-v3-accepted-preview-assets-20261012.json`.

## Aperçu Railway

- Déploiement : `76702ac8-20b3-4f5f-ada1-d9503896e724` — **SUCCESS**.
- `/health` : HTTP 200, `{"status":"ok"}`.
- Après connexion, la page d’accueil et les fichiers JavaScript/CSS des trois outils ont répondu HTTP 200 avec le type de contenu attendu.
- Session de vérification fermée après les requêtes. Aucune facture, commande, affectation ou donnée métier n’a été créée en ligne.

## Limites

Les parcours navigateur détaillés ont été exécutés sur une copie locale isolée. Les dimensions mobiles sont simulées dans Chromium ; aucun iPhone physique ni Safari iOS n’a été testé. Sur Railway, la vérification connectée a confirmé le chargement de la page et des ressources, sans soumettre de création métier.

La production n’a pas été déployée et aucun changement V2 n’a été intégré.
