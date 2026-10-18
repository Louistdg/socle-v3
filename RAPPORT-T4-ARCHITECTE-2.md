# Rapport T4 — ARCHITECTE

Date : 2026-10-18

Branche : `agent/t4`

Base examinée : `e31c223`

Périmètre : canevas de chantier OWNER, stockage des préférences de présentation et vérification de la mission.

## Résultat

Le canevas de chantier est intégré à l’accueil OWNER. Les cartes peuvent être déplacées à la souris ou au clavier; les positions et cartes masquées sont enregistrées dans la préférence de tableau de bord de l’utilisateur. Un échec serveur remet la carte à sa dernière position enregistrée. Le téléphone présente les chantiers en liste sans glisser-déposer.

L’archivage et la suppression de carte ne modifient pas les données métier du chantier : ils masquent uniquement la carte dans la préférence personnelle, avec une action Annuler pendant huit secondes.

## Modifications

- `web/canvas-jobs.js` : rendu du canevas, disposition initiale, déplacement souris/clavier, sauvegarde, retour arrière, menu et annulation.
- `web/canvas-jobs.css` : cartes sans ombre au repos, grille de points, état de déplacement, menu et présentation mobile, avec les jetons d’interface existants.
- `web/ia-a-ui.js` : montage du canevas sur l’accueil OWNER et positionnement de la carte d’attention après l’en-tête.
- `web/index.html` : préchargement du CSS du canevas et chargement du module différé.
- `scripts/build.mjs` et `dist/server/index.js` : inclusion et génération des nouveaux fichiers livrables.
- `scripts/browser-gate.mjs` : enregistrement de la nouvelle suite Browser Gate.
- `scripts/test.mjs` : exclusion de cette suite navigateur de la CI hermétique standard.
- `tests/browser-job-canvas-01.mjs` : suite navigateur couvrant le canevas et ses interactions.

Fichiers interdits vérifiés : aucun changement à `worker/index.js` ou `drizzle/**`. Aucun déploiement ni push effectué.

## Registre — FAIT VÉRIFIÉ

- `npm test` : terminé avec succès, **160 suites hermétiques réussies**; les suites navigateur sont indiquées comme hors CI standard.
- Browser Gate complète : **24/24 suites réussies**, `--runs=1`; candidat isolé SHA256 `45b16f8611c9bc131f9a04c5d424c784f06185057988c64c1043ca81f726ec27`.
- La suite `browser-job-canvas-01.mjs` vérifie le déplacement des trois cartes, leurs positions avec 24 px d’écart (`224`, `496`, `768`), la persistance après rechargement, le rollback sur refus 503, le déplacement clavier et l’annonce `aria-live`, le menu, l’archivage/annulation, le double-clic et le rendu mobile.
- Le test d’échec simulé confirme que la dernière position validée est restaurée et que le refus serveur est annoncé.
- Inspection visuelle effectuée sur les captures desktop, menu, annulation et mobile. La capture desktop montre les trois cartes séparées et la grille; la capture mobile montre une liste verticale.
- `git diff --check` : aucun problème d’espacement détecté.

Captures conservées sous `tests/artifacts/job-canvas/` :

- `carte-soulevee.png`
- `trois-cartes-deplacees.png`
- `menu-carte.png`
- `notification-annuler.png`
- `mobile-liste.png`

Preuve négative conservée dans `tests/artifacts/job-canvas/preuve-negative.log` : le PUT de préférence a été temporairement neutralisé dans une copie de travail, puis le test de rechargement a échoué parce que les positions ne survivaient pas. Le code source a été restauré et reconstruit avant la validation positive.

## Registre — DÉCLARÉ

- La mission demandait un canevas personnel à l’accueil OWNER, les positions sauvegardées côté serveur, les interactions clavier et mobile, la suite Browser Gate, la preuve négative et un rapport signé.
- La réponse au blocage est de garder l’accent visuel vif comme remplissage et de laisser le texte hériter des jetons de texte déjà prévus; aucun éclaircissement d’accent n’a été introduit dans cette mission.
- Le nom de rapport `RAPPORT-T4-ARCHITECTE-2.md` est nouveau; le rapport antérieur n’a pas été écrasé.

## Registre — HYPOTHÈSE

- Le serveur de production expose la route de préférences du tableau de bord exactement comme dans le build validé. Le contrôle Browser Gate confirme cette route dans l’environnement local; la production n’a pas été déployée ni sondée pendant cette mission.
- Les préférences de position restent individuelles au compte authentifié puisque la route utilisée est `/api/me/preferences/dashboard/canvas`; l’isolation entre comptes de production n’a pas été testée sur un service distant.

## Ce que je te déconseille

Je te déconseille de déployer avant une revue de l’expérience sur les vraies données OWNER : les cartes de la grille couvrent plusieurs lignes et l’espace initial dépend du nombre de chantiers. Il faut aussi vérifier sur les comptes de production que la préférence reste privée par utilisateur. Ces deux points nécessitent un environnement et des identités de production; ils ne sont pas couverts par le build local.

## État du dépôt

Le travail est prêt sur `agent/t4`. Aucun push ni déploiement n’a été fait. Le commit local sera consigné après ce rapport.

**T4 — ARCHITECTE**
