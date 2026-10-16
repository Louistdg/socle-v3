# BatiNova XL / Script 3 — matrice financière causale et gate navigateur

Date : 2026-09-29

## Provenance

- Mission : calibration métier / réalisme BatiNova XL.
- Branche : `supervisor/batinova-xl-source-calibration-2026-09-29`.
- Source canonique : PR #30.
- Calibration HEAD de départ de cette extension documentaire : `99af6c1cdc19924cf13e18a4aced4ab00dd121f5`.
- Candidat d'intégration observé : PR #44, `fix/ia1-role-routes-gate-2026-09-29` @ `a7e91c28b7e3d912fd7b4fd18b23aacc286c34d3`.
- Run de référence : `36627952361`.

Ce document ne modifie aucun fichier appartenant à #44, IA2, IA3, IA4, IA5 ou IA6. Il précise les données métier attendues pour fermer le déficit Finance client et la gate navigateur.

## Problème démontré

Le navigateur affiche les factures issues de la table serveur `invoices` lorsque `serverFinanceState === 'ready'`.

Le smoke historique injecte 100 lignes dans `accountingData.customerInvoices`, qui n'est alors plus la source affichée.

État mesuré :
- factures client serveur : 4 ;
- première page : 4 lignes ;
- après « Afficher 10 de plus » : toujours 4 ;
- gate attendue : 10 puis 20.

La correction métier doit enrichir Script 3. Elle ne doit ni abaisser la gate à 4, ni forcer le frontend à revenir sur le stockage legacy.

## Règles de génération

1. Les montants proviennent du **CA contractuel canonique** du chantier :
   - devis principal accepté ;
   - + avenants canoniquement acceptés ;
   - aucune facture ne doit dépasser le CA contractuel net de ses avoirs.
2. Les pourcentages ci-dessous s'appliquent au total contractuel HTVA du chantier au moment de la facture.
3. TVA :
   - utiliser le profil TVA du projet déjà calibré ;
   - 6 % uniquement quand les conditions du profil rénovation privée sont satisfaites ;
   - sinon 21 %.
4. Les factures doivent être créées dans la **table serveur `invoices`** par le chemin métier/API existant, pas seulement dans `accountingData.customerInvoices`.
5. Chaque facture possède une clé/idempotence BATXL stable et un numéro déterministe.
6. Les paiements doivent utiliser les routes/tables serveur canoniques et modifier le solde de la facture.
7. Les avoirs doivent pointer vers une facture existante et réduire son solde.
8. Replay x2 : zéro nouvelle facture, zéro nouveau paiement, zéro nouvel avoir au second passage.
9. Projets `waiting`, `planned` ou `blocked` ne reçoivent pas artificiellement un cycle de facturation de chantier terminé.
10. Les dates restent dans la période Script 3 ou représentent une échéance cohérente immédiatement postérieure.

## Matrice cible — 25 factures serveur

Les pourcentages sont des parts du contrat HTVA. Les montants exacts doivent être calculés depuis le devis/avenant réellement présent, pas codés en dur.

| # | Projet | Story | Type facture | % contrat HTVA | Paiement attendu | État causal attendu |
|---|---|---|---|---:|---|---|
| 1 | PRJ-001 Delcourt | healthy_margin | acompte | 25 % | payé 100 % | démarrage financé |
| 2 | PRJ-001 Delcourt | healthy_margin | situation 1 | 35 % | payé 50 % | encours client réel ; solde ouvert |
| 3 | PRJ-002 Laurent | tight_margin_due_to_labor | acompte | 20 % | payé 100 % | coût MO futur sans défaut client |
| 4 | PRJ-002 Laurent | tight_margin_due_to_labor | situation 1 | 45 % | impayé à échéance | marge comprimée + créance |
| 5 | PRJ-003 Renard sarking | approved_positive_amendment | acompte contrat initial | 20 % | payé 100 % | avant avenant |
| 6 | PRJ-003 Renard sarking | approved_positive_amendment | situation après avenant | 45 % du contrat amendé | payé 70 % | hausse CA observable |
| 7 | PRJ-004 Dubois EPDM | supplier_delay | acompte | 30 % | payé 100 % | démarrage |
| 8 | PRJ-004 Dubois EPDM | supplier_delay | situation 1 | 30 % | payé 25 % | progression ralentie, pas finale |
| 9 | PRJ-005 extension EPDM | deposit_received | acompte | 30 % | payé 100 % | seul document client avant démarrage |
| 10 | PRJ-006 zinc | normal_small_job | facture finale | 100 % | payé 100 % | chantier simple soldé |
| 11 | PRJ-007 Cedral | material_cost_pressure | acompte | 25 % | payé 100 % | base contractuelle |
| 12 | PRJ-007 Cedral | material_cost_pressure | situation 1 | 40 % | payé 40 % | trésorerie sous tension |
| 13 | PRJ-008 mur creux | good_margin_with_stock_return | acompte | 25 % | payé 100 % | démarrage |
| 14 | PRJ-008 mur creux | good_margin_with_stock_return | situation/finale partielle | 65 % | payé 100 % | reste 10 % non facturé ; retour stock réduit le coût |
| — | PRJ-009 garage | waiting_on_client_decision | **aucune facture** | 0 % | — | devis en attente uniquement |
| 15 | PRJ-010 béton cellulaire | hours_overrun | acompte | 20 % | payé 100 % | revenu normal |
| 16 | PRJ-010 béton cellulaire | hours_overrun | situation 1 | 50 % | payé 100 % | dérive uniquement par heures |
| 17 | PRJ-011 infiltration | completed_paid | facture finale | 100 % | payé 100 % | chantier terminé, solde zéro |
| 18 | PRJ-012 cheminée | blocked_by_weather_and_access | acompte | 25 % | payé 100 % | aucun solde final artificiel |
| 19 | PRJ-013 isolation | planned_margin_recovery | acompte | 20 % | payé 100 % | baseline |
| 20 | PRJ-013 isolation | planned_margin_recovery | situation 1 | 35 % | payé 60 % | forecast peut ensuite s'améliorer |
| 21 | PRJ-014 industriel | large_contract_with_partial_invoicing_and_supplier_risk | acompte | 10 % | payé 100 % | contrat >=500 k€ HTVA |
| 22 | PRJ-014 industriel | idem | situation 1 | 15 % | payé 100 % | première situation |
| 23 | PRJ-014 industriel | idem | situation 2 | 20 % | payé 50 % | paiement partiel |
| 24 | PRJ-014 industriel | idem | situation 3 | 20 % | impayé à échéance | risque client/trésorerie |
| 25 | PRJ-015 Renard phase 1 | historical_returning_client_profitable | facture finale historique | 100 % | payé 100 % | même client que PRJ-003, solde zéro |

Total : **25 factures serveur**, dont 24 projets/factures actives ou historiques réparties sur 14 projets facturables ; PRJ-009 reste volontairement sans facture.

## Avoir client obligatoire

Créer au moins un avoir canonique :

- projet : PRJ-007 Cedral ;
- facture cible : situation 1 (#12) ;
- cause simulation : geste commercial après correction esthétique de finition ;
- valeur : **3 % du montant TTC de la facture cible** ;
- l'avoir réduit le solde et le CA encaissable ;
- ne pas supprimer/recréer la facture ;
- replay idempotent.

Cette histoire ajoute une pression commerciale au scénario `material_cost_pressure` sans falsifier un coût fournisseur.

## Paiements client obligatoires

La simulation doit matérialiser au minimum les états suivants :

- 10+ factures totalement payées ;
- 4+ factures partiellement payées ;
- 2+ factures échues et impayées ;
- 1 facture affectée par un avoir ;
- au moins une facture sans paiement mais non encore échue ;
- PRJ-011 et PRJ-015 avec solde final exactement zéro ;
- PRJ-014 avec plusieurs paiements répartis sur plusieurs situations.

Les paiements partiels doivent être de vrais objets serveur et non un simple champ texte d'état.

## Numérotation / idempotence

Format recommandé :

- facture : `FAC-BATXL-001` … `FAC-BATXL-025` ;
- paiement : `BATXL-CLIENT-PAY-001` … ;
- avoir : `AV-BATXL-001` ;
- operation keys : `BATXL-CLIENT-INVOICE-OP-001`, `BATXL-CLIENT-PAYMENT-OP-001`, etc.

Les identifiants techniques réels doivent venir de la stratégie `manifest.mjs` lorsque cette famille d'ID y est définie.

## Gate navigateur

Le smoke doit utiliser les objets serveur réellement chargés.

Preuve minimale :

1. `serverFinanceState === 'ready'`.
2. `serverInvoices.length >= 20`.
3. `financeVisibleCount = 10`.
4. page 1 : exactement 10 lignes facture client visibles.
5. après `showMoreFinance()` : exactement 20 lignes visibles.
6. le résumé financier reste affiché avant la liste.
7. au moins une ligne partiellement payée, une impayée et une payée sont présentes dans le dataset serveur.
8. aucune injection de 100 lignes dans `accountingData.customerInvoices` n'est nécessaire pour cette preuve.

La gate reste donc `10 → 20`, mais elle mesure désormais le vrai chemin serveur.

## Acceptation causale des 15 financialStory

Cette matrice Finance ne suffit pas seule au verdict Script 3 final. Les preuves suivantes restent obligatoires :

- PRJ-002 / PRJ-010 : budget heures vs pointages réels → dérive calculable.
- PRJ-003 : avenant accepté → CA contractuel augmenté.
- PRJ-004 : BC/BL réellement retardé ou partiel.
- PRJ-007 : coûts matériaux/engagements + avoir client → pression de marge démontrable.
- PRJ-008 : sortie puis retour de stock → coût net corrigé.
- PRJ-012 : événement météo/accès + tâche/problème bloqué.
- PRJ-013 : forecast avant/après mesures correctives.
- PRJ-014 : engagements fournisseurs + situations + paiements partiels + risque.
- PRJ-001/006/011/015 : histoires positives calculables, pas seulement des labels.

## Non-chevauchement

- #44 reste propriétaire du Browser smoke et des fichiers déjà repris.
- IA2 reste propriétaire Finance/achats/stock.
- IA3 reste propriétaire Planning/RH.
- IA5 reste propriétaire Documents.
- IA4 reste propriétaire intégrité/replay.
- IA6 garde la gate finale.
- Ce document est une **spécification d'acceptation métier** destinée aux propriétaires concernés.
