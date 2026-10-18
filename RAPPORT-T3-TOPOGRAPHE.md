# RAPPORT T3 — TOPOGRAPHE

Date : 18 octobre 2026
Branche : `agent/t3`
Périmètre : carnet de chantier et remontée des problèmes au bureau.

## FAIT VÉRIFIÉ

### Changements livrés

- `drizzle/0051_field_journal_category.sql` ajoute `category` aux notes de chantier, valeur historique par défaut `Avancement`, contrainte sur les quatre catégories.
- `worker/index.js` accepte et valide la catégorie, retourne celle-ci dans les notes, conserve la clé d’idempotence et expose dans `GET /api/tasks` les relèves `Problème` et `Sécurité` visibles au propriétaire, avec projet, auteur, texte et date.
- `web/field-journal.js` fournit le bouton fixe « Relever », le formulaire photo/catégorie/note, le choix de chantier, l’envoi photo puis note, et l’état local `Non envoyée` avec réessai après erreur. Le libellé `Envoyée` n’est posé qu’après la réponse réussie de la route note.
- `web/field-journal.css` n’utilise que les jetons `--sx-*`, avec cibles tactiles de 48 px.
- `web/ia-a-ui.js` ajoute les problèmes/sécurités aux lignes « À traiter » depuis la réponse existante `/api/tasks` et ouvre leur chantier. Aucun endpoint réseau dédié au carnet n’est ajouté pour cet accueil.
- `web/index.html`, `scripts/build.mjs`, `scripts/browser-gate.mjs` raccordent les fichiers. La suite navigateur est exclue des suites hermétiques dans `scripts/test.mjs`. Les attentes de migrations ont été mises à jour, ainsi que le contrat d’ordre CSS existant.
- Le carnet est inséré avant « Tâches du chantier » afin de le garder visible dans le parcours de la fiche.

### Vérifications

Commande : `npm run build`

Sortie brute :

```text
> socle-v3@3.0.0 build
> node scripts/build.mjs

Worker and interface built.
```

Commande : `npm test`

Sortie brute finale :

```text
RESULTAT : TOUTES LES PAIRES CONTROLEES SONT >= 4,5:1
SOCLE CI: 160 suites hermétiques réussies.
```

Commande : `node scripts/browser-gate.mjs --only=browser-field-journal-01.mjs --runs=1 --port=4387 --cdp-port=9237`

Sortie brute :

```text
BROWSER_FIELD_JOURNAL_01=PASS mobile=390x844 target=48px project-change=PASS problem+safety=OWNER-task-response advancement=excluded retry=PASS no-premature-sent=PASS desktop=1440px
BROWSER_GATE=PASS — browser-field-journal-01.mjs x1 / candidate isolation x1
```

Commande : `node scripts/browser-gate.mjs --runs=1 --port=4387 --cdp-port=9237`

Sortie brute finale :

```text
BROWSER_CANDIDATE_ISOLATION_1=PASS SHA256=45b16f8611c9bc131f9a04c5d424c784f06185057988c64c1043ca81f726ec27
BROWSER_GATE=PASS — identities x1 / smoke x1 / candidate isolation x1
```

Le premier passage complet avait révélé deux défauts de preuve : le contrat de cascade CSS ne connaissait pas la nouvelle feuille, et une attente de test lisait le carnet avant que son contenu asynchrone ne soit rendu. La source CSS et l’attente ont été ajustées; le passage complet final est vert.

### Captures inspectées

Les captures proviennent du Browser Gate en Chromium, viewport mobile 390 × 844 et écran bureau 1440 px. Je les ai ouvertes et vérifiées :

- [01 — bouton Relever](tests/artifacts/field-journal/01-bouton-relever.png) : bouton visible au-dessus de la navigation mobile; rien de travers.
- [02 — formulaire photo](tests/artifacts/field-journal/02-appareil-photo.png) : le champ est configuré pour image et caméra arrière (`capture="environment"`); Chromium affiche un fichier de test, pas l’interface native de l’appareil photo.
- [03 — catégories](tests/artifacts/field-journal/03-pastilles.png) : les quatre catégories sont présentes, une sélection active; rien de travers.
- [04 — carnet](tests/artifacts/field-journal/04-releve-carnet.png) : la vignette et la relève apparaissent avant les tâches. La photo est volontairement le fixture de test facture, cadré par `object-fit: cover`, pas une photo de chantier réelle.
- [05 — accueil propriétaire](tests/artifacts/field-journal/05-accueil-a-traiter.png) : la ligne Problème affiche chantier, auteur et heure dans « À traiter »; rien de travers.

### Preuve négative

Garde photo temporairement désactivée dans `fieldJournalSubmit`, puis reconstruction et relance de la suite navigateur.

Sortie brute de l’échec attendu :

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  actual:   { photoRequired: false, noPhotoGuardBeforeSend: true }
  expected: { photoRequired: true, noPhotoGuardBeforeSend: true }
```

Code de sortie observé : `1`. La garde `if(!file)` a ensuite été remise; rebuild, suite ciblée et Browser Gate complet finaux sont verts.

## DÉCLARÉ

- L’appel `/api/tasks` existait déjà dans l’état d’agenda du propriétaire. Le client stocke maintenant `fieldJournal` dans ce même résultat et l’accueil le lit; il n’y a pas de second endpoint ou appel inventé par T4.
- La suite navigateur simule le choix d’une photo en fournissant un fichier fixture. Le navigateur headless ne prouve pas l’ouverture effective de la caméra matérielle. Le sélecteur natif est demandé par `accept="image/*" capture="environment"`, à confirmer sur téléphone réel.
- L’échec réseau, la conservation sur l’appareil dans la session navigateur et le réessai ont été simulés par interception HTTP; aucun réseau mobile réel n’a été coupé.

## HYPOTHÈSE

- Sur un téléphone compatible, le sélecteur système interprétera `capture="environment"` comme une ouverture directe de caméra arrière. Le navigateur et le système d’exploitation gardent le choix final; je n’ai pas pu le mesurer sur matériel réel.
- Les rôles non propriétaires n’ont pas reçu le nouveau flux prioritaire; la route n’ajoute `fieldJournal` qu’à la réponse OWNER de `/api/tasks`.

## Ce qui n’a pas été fait

Pas de caméra physique testée, pas de déploiement, pas de push, pas de fusion. Aucun changement de tokens ou palette. La livraison reste locale sur `agent/t3`.

## Ce que je te déconseille

Je déconseille de déclarer l’ouverture caméra validée avant un essai sur téléphone Android et iOS. Je déconseille aussi de supprimer le statut local « Non envoyée » : c’est la seule indication immédiate en cas d’échec réseau.

## Commits

Les changements sont répartis en trois commits locaux sur `agent/t3`; aucun push effectué.

— TOPOGRAPHE