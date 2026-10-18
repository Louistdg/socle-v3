# Rapport T3 — Cartographe

Branche `agent/t3` · 18 octobre 2026

## FAIT VÉRIFIÉ

- Ajout de `GET /api/search?q=` en lecture seule, dans l’entreprise active, avec rôles, attribution projet, accès documents, aperçu d’accès, bornes de saisie (2–80), 6 résultats par rubrique et 30 au total.
- Ajout du panneau autonome au champ existant : délai d’inactivité de 150 ms, groupes ordonnés, clavier flèches/Entrée/Échap, aucun appel pour une saisie d’un caractère, état vide avec actions. Aucun raccourci clavier ajouté.
- Vérifié `node --experimental-sqlite tests/search-scope-01.mjs` : `PASS équipe attribuée visible, chantier non attribué absent, aperçu fidèle, bornes q, lecture seule`.
- Vérifié `npm test` : code 0, sortie finale `SOCLE CI: 161 suites hermétiques réussies.` Le contrôle de contraste est inclus et passe.
- Vérifié la suite navigateur de recherche isolément avec Browser Gate : `BROWSER_GATE=PASS — browser-search-01.mjs x1 / candidate isolation x1`. Fonctionnalités couvertes : recherche multi-rubriques, ouverture avec Entrée, contacts, facture, ordre préfixe, silence sous deux caractères, état vide, Échap/focus, confidentialité TEAM_LEAD et capture WORKER.
- Temps de traitement serveur mesuré dans `took` : **6 ms**; aller-retour du navigateur dans cette exécution : 9,6 ms. La durée CDP a varié dans d’autres exécutions; la mesure serveur est la valeur de référence de la route.
- Preuve négative réalisée : retrait temporaire du filtre d’attribution des chantiers dans `scopedLegacyState`, reconstruction, puis exécution du navigateur. La suite échoue sur l’assertion `Le chef d’équipe ne retrouve pas le nom exact du chantier hors attribution`. Filtre restauré; la suite passe avec l’utilisateur TEAM_LEAD réel et un chantier hors périmètre.
- `npm run build`, `git diff --check` et le test hermétique de portée repassent après les dernières modifications.
- Les quatre captures ont été générées et inspectées : le panneau trois rubriques montre Chantiers, Contacts et Personnes à l’écran (Documents commence sous le pli); l’état vide conserve l’écran courant en arrière-plan; les captures chef d’équipe et ouvrier montrent les résultats permis sans le chantier refusé.

### Suites Browser Gate

La branche enregistre **24 suites**, alors que les consignes de mission mentionnent 22. Le lancement complet s’arrête sur la deuxième suite, `browser-ui-frame-audit-01.mjs`; elle attend `.ia-b-week-day` pour OWNER et ne trouve pas ce sélecteur dans son parcours. Elle échoue également lorsqu’exécutée seule. Cette suite et les écrans Planning concernés sont hors périmètre Cartographe; aucun de ces fichiers n’a été modifié. La suite de recherche est passée en exécution isolée. Le gate complet n’est donc pas vert.

| Suite enregistrée | Résultat du gate complet |
|---|---|
| `browser-access-preview-theme-contrast-01.mjs` | PASS avant arrêt |
| `browser-ui-frame-audit-01.mjs` | ÉCHEC — sélecteur Planning absent après attente de 6 s; reproduit seule |
| `browser-v3-theme-visual-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-ui-foundation-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-design-catalogue-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-regression-116.mjs` | NON LANCÉE — arrêt préalable |
| `browser-mobile-navigation-129.mjs` | NON LANCÉE — arrêt préalable |
| `browser-navigation-convergence-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-mobile-density-162.mjs` | NON LANCÉE — arrêt préalable |
| `browser-stock-catalog-v2-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-stock-barcode-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-e2e-02-quote-preproject.mjs` | NON LANCÉE — arrêt préalable |
| `browser-bl-scan-01ab.mjs` | NON LANCÉE — arrêt préalable |
| `browser-home-person-scope-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-multi-org-isolation-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-identities-15.mjs` | NON LANCÉE — arrêt préalable |
| `browser-15.mjs` | NON LANCÉE — arrêt préalable |
| `browser-document-triage-20261012.mjs` | NON LANCÉE — arrêt préalable |
| `browser-field-journal-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-search-01.mjs` | PASS isolément; non atteint dans le gate séquentiel |
| `browser-didactic-layer-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-attention-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-planning-board-01.mjs` | NON LANCÉE — arrêt préalable |
| `browser-planning-drag-step2.mjs` | NON LANCÉE — arrêt préalable |

### Captures

- [Panneau avec trois rubriques](/D:/Codex/SOCLE-V3/work/T3/tests/artifacts/search/01-panneau-trois-groupes.png)
- [Aucun résultat](/D:/Codex/SOCLE-V3/work/T3/tests/artifacts/search/02-aucun-resultat.png)
- [Chef d’équipe](/D:/Codex/SOCLE-V3/work/T3/tests/artifacts/search/03-chef-equipe.png)
- [Ouvrier](/D:/Codex/SOCLE-V3/work/T3/tests/artifacts/search/04-ouvrier.png)

## DÉCLARÉ

- Les dépendances locales de `work/T3/node_modules` pointaient vers une cible partagée vide. Le lien local a été remplacé par une installation privée via `npm ci`; ni manifeste ni verrou n’a été modifié. Node local est v24.21.0, alors que le dépôt annonce Node 22+/npm 10+; build et tests hermétiques ont néanmoins terminé avec succès.
- Le CSS du module est servi comme asset et injecté par son module JS afin de préserver la liste et l’ordre canoniques des feuilles de style contrôlés par l’audit UI.
- Aucune modification ni déploiement sur `main`; aucun push effectué.

## HYPOTHÈSE

- L’échec de `browser-ui-frame-audit-01.mjs` semble lié à son sélecteur/assertion ou au chargement de Planning, car il se reproduit en solo et concerne un écran non modifié ici. Sa cause racine n’a pas été vérifiée dans cette mission.
- La mesure serveur de 6 ms sur la base de test suggère qu’aucun nouvel index n’est nécessaire pour le corpus mesuré. Cela ne prouve pas la latence sur une base de production plus volumineuse.

## Modifications

- `worker/index.js`, `dist/server/index.js` : route de recherche bornée et filtrée par permissions.
- `web/omnisearch.js`, `web/omnisearch.css`, `web/index.html` : expérience de recherche et inclusion du module.
- `scripts/build.mjs`, `scripts/browser-gate.mjs`, `scripts/test.mjs` : assets et inscription de la suite au palier navigateur, exclue du lot hermétique.
- `tests/search-scope-01.mjs`, `tests/browser-search-01.mjs` : contrôles hermétiques, navigateur, confidentialité négative, temps et captures.

## Ce que je te déconseille

Ne pas qualifier le Browser Gate complet de réussi tant que `browser-ui-frame-audit-01.mjs` échoue et que les 22 suites restantes du gate séquentiel n’ont pas été exécutées. Ne pas ajouter d’index ou de table de recherche sur la seule base d’une hypothèse de volume.

— CARTOGRAPHE
