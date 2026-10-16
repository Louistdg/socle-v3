# BATINOVA XL — POINT UNIQUE DE RESYNCHRONISATION GITHUB

Date: 2026-09-29

## Branche commune obligatoire

Toutes les IA BatiNova XL doivent désormais prendre comme point de départ :

`integration/batinova-xl-resync-2026-09-29`

Base de création :

`integration/batinova-xl-socket-2026-09-29` @ `44a6fd242036fd71dd786c386a8391b58d4806eb`

Aucune IA ne doit repartir d'un ancien socket, d'une ancienne PR ou d'un SHA intermédiaire pour produire une nouvelle intégration.

Chaque IA doit :
1. récupérer le HEAD courant de `integration/batinova-xl-resync-2026-09-29`;
2. créer/mettre à jour une branche dédiée depuis ce HEAD;
3. ne modifier que son périmètre;
4. ouvrir/retargeter sa PR vers `integration/batinova-xl-resync-2026-09-29`;
5. fournir SHA départ, SHA final, tests réellement exécutés et anomalies;
6. ne jamais merger directement vers `main`.

## Pourquoi la resynchronisation est obligatoire

Le socket officiel actuel assemble des lots à des SHA devenus obsolètes.

### IA2 — anomalie critique Finance

Le socket a intégré IA2 depuis :
`56f43f80c1482c846518c999fed7bbf6703627d0`

La branche IA2 Finance plus récente est :
`feat/ia2-batinova-finance-achats-rentabilite-2026-09-29`
HEAD vérifié :
`df7299e6f701e430bf49627f23336b9fc7779270`

La version finale IA2 fait de `/api/projects/:id/cost-control` un dérivé du Forecast canonique et retourne :
`source: financial-forecast-v1`.

Le socket contient encore l'ancienne implémentation séparée.

Preuve CI :
- PR #22
- Release Gate run ID `36613964592`
- Node `22.23.2`
- checkout/build : PASS
- `tests/batinova-finance-chain-31.mjs` : FAIL
- attendu : `financial-forecast-v1`
- obtenu : `undefined`

Action IA2 :
- reporter la version Finance finale sur une branche issue du point de resync;
- préserver les migrations déjà arbitrées du socket;
- réexécuter les tests finance;
- ne pas réintroduire les anciens numéros de migration.

Pack simulation IA2 disponible séparément :
`feat/ia2-batinova-xl-finance-stock-socket-2026-09-29`
HEAD vérifié :
`b7eab717294db93a5f3bf32e4a08be34d5a19188`

## IA3 — Planning / RH

Pack attendu :
`scripts/simulation/batinova-xl/planning-people-pack.mjs`

Source connue :
`ia3/batinova-xl-planning-people-2026-09-29`
SHA vérifié :
`29e8244cd880dabddf3d30f7b7d825033ab022bd`

Le socket officiel n'embarque pas ce pack.

Action IA3 :
- repartir du point de resync;
- intégrer uniquement le pack Planning/RH et les adaptations strictement nécessaires;
- conserver OWNER / TEAM_LEAD / WORKER / ACCOUNTING;
- aucun rôle legacy PROJECT_MANAGER ou LOGISTICS;
- revalider les accès cross-project.

## IA4 — Intégrité / volume / replay

Branche :
`ia4/batinova-xl-integrity-volume-2026-09-29`

HEAD courant observé :
`9d79f1bc7723b38fe2609f5a9a41f57a48ebc9dc`

Artefacts attendus :
- `scripts/simulation/batinova-xl/integrity-volume-pack.mjs`
- `scripts/simulation/batinova-xl/manifest.mjs`

Le socket officiel n'embarque pas ces packs.

Action IA4 :
- repartir du point de resync;
- porter manifest + integrity/replay;
- conserver l'ordre de migrations déjà arbitré 0029 -> 0030 -> 0031 -> 0032;
- lancer le replay x2 seulement quand tous les packs sont présents;
- aucun PASS si un pack manque.

## IA5 — Documents

Le travail métier IA5 existe bien.

Branche finale :
`feat/document-registry-transversal-2026-09-29`
HEAD vérifié :
`1c4b6e4318648993ba3421c39b175999fc845aa5`

Le socket a été construit depuis un ancien lot IA5 :
`8873718deae116967d430cc64c6dc701697e4237`

La version finale corrige notamment le défaut >250 documents :
- ancien socket : `LIMIT 250` avant le filtrage RBAC;
- version finale : pagination curseur stable, lecture par fenêtres, filtrage RBAC, `nextCursor`, UI `Afficher plus`.

Action IA5 :
- reporter le correctif final de pagination/RBAC sur une branche issue du point de resync;
- préserver le registre privé et les gardes tenant;
- fournir en plus le pack contractuel manquant :
  `scripts/simulation/batinova-xl/documents-pack.mjs`
- ce pack doit générer les volumes documents/photos BatiNova XL sans rendre de blob public.

## IA6 — QA / assemblage / stress

Branche QA socket actuelle :
`ia6/batinova-xl-qa-socket-2026-09-29`
HEAD :
`ae4205363932a21bcb1ff8ad70eb8cde57cb6514`

Problème :
le `qa-report.mjs` de cette branche est une ancienne version et ne contient pas le garde-fou `packs.presence`.

Version IA6 plus sûre :
`ia6/batinova-xl-qa-stress-2026-09-29`
SHA :
`995a1ee5e90e6dfad7d876f613514846b81a3b6e`

Cette version refuse un PASS global lorsqu'un pack attendu est absent.

Autre défaut :
la Release Gate exécute `scripts/test.mjs`, donc `scripts/simulation/batinova-xl/qa-report.mjs` n'est pas actuellement exécuté par la CI.

Action IA6 :
- repartir du point de resync;
- reprendre le garde-fou `packs.presence`;
- ne pas réécrire les données métier des packs;
- brancher le QA BatiNova XL dans la gate uniquement lorsque les packs requis sont présents;
- exécuter Node 22, replay x2, volumes, pagination, sécurité tenant/projet, prix WORKER, forecast, stock, planning, documents et Browser Gate;
- publier PASS/FAIL avec preuves.

## Etat CI de référence

Le problème historique `startup_failure/jobs=[]` n'est plus le seul état observable.

Sur PR #22 :
- workflow : SOCLE Release Gate
- run : `36613964592`
- Core / Node 22 : FAIL réel
- Browser / Chromium : SKIPPED car Core a échoué
- première anomalie fonctionnelle : `batinova-finance-chain-31.mjs`

Donc toute IA doit désormais traiter les échecs de tests comme des régressions réelles et ne plus les classer automatiquement comme blocage infrastructure.

## Gate de resynchronisation

La resynchronisation n'est considérée rétablie que lorsque :

- IA2 Finance finale est portée et `batinova-finance-chain-31.mjs` passe;
- IA3 pack Planning est présent;
- IA4 manifest + integrity pack sont présents;
- IA5 pagination finale est portée;
- IA5 `documents-pack.mjs` est présent;
- IA6 `qa-report.mjs` contient `packs.presence`;
- le QA BatiNova XL est réellement exécuté;
- replay x2 stable;
- FK/integrity checks OK;
- volumes finaux mesurés, pas supposés;
- Browser Gate exécuté;
- aucun merge direct dans `main` avant verdict superviseur.

Ce document est la source de coordination GitHub BatiNova XL jusqu'à remplacement explicite par une version plus récente.
