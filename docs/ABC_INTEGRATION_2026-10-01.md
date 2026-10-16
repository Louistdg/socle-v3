# Intégration A+B+C

## Références figées

- Base : `94d3afbeabc1705d57b33fc9ea1bf562f447225d`.
- A : PR #87, `3dea760af0d245c49bb58533824f4c6909966464`, Gate #282.
- B : PR #88, `c6b6e958747f4a0880a8ea90d217fc05c81cdf69`, Gate #281.
- C : PR #86, `55d5f7fa3e2d1184507965e868c4d992eeba2634`, Gate #270.

Les trois historiques sont conservés par des merges sur une branche dédiée.
Les branches sources et main ne sont pas modifiées par cette intégration.
Le candidat combiné doit obtenir son propre Release Gate.

## Migrations

La chaîne comporte 36 migrations continues, de 0000 à 0035. Planning conserve
`0034_planning_operations.sql`. Commercial/Finance devient
`0035_ia_c_commercial_finance.sql` ; le contenu SQL de C reste inchangé.
Ces deux migrations n'ont pas de dépendance mutuelle.

L'upgrade vise une base main jusqu'à 0033, ou une base B ayant déjà 0034 Planning.
Le journal utilise les noms complets. Une base expérimentale ayant exécuté
`0034_ia_c_commercial_finance.sql` doit être examinée et sauvegardée séparément :
aucun alias de journal, suppression de colonne ou réinitialisation silencieuse
n'est effectué. La migration renommée échoue sur cette base au lieu de
supprimer ses données. Chaque migration est transactionnelle ; les migrations
précédentes réussies restent journalisées.

## Raccords et régressions corrigées

- Dashboard A : entrée `home`, distincte du Planning opérationnel B.
- Rôle du dashboard : accès authentifié du serveur, sans fallback OWNER.
- Les résumés financiers utilisent les factures/dépenses serveur en centimes.
- Devis C : états de recherche, filtre et pagination initialisés.
- Les contrôles Finance historiques et la section banque C restent composés.
- Planning : un WORKER sans personne liée ne reçoit aucune donnée opérationnelle.
- Une modification de bloc contrôle les chantiers source et destination.
- Un devis directement accepté synchronise son montant ; une nouvelle sauvegarde
  conserve les avenants acceptés, dans le même batch transactionnel.
- Les permissions avenants du comptable utilisent son périmètre Finance sans
  lui ouvrir de périmètre chantier opérationnel.
- Build : union des assets A/B et inclusion du script d'allocations fournisseur
  déjà référencé dans la page.

## Frontières de validation

Le dataset historique Script3 sert aux tests de régression existants. Il ne vaut
pas chargement ni validation du futur dataset IA-E `QA-BATXL-DEF-2026-10-01`.
Une preuve locale/Chromium ne vaut pas preuve Railway ou iPhone réel.
Railway ne reçoit le candidat qu'après son Gate combiné vert. Le stockage reste
SQLite sur volume persistant, une instance, selon `RAILWAY_PRODUCTION_RUNTIME.md`.
