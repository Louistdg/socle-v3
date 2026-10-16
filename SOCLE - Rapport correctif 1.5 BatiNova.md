# SOCLE — Rapport correctif 1.5 BatiNova

Date de contrôle : 24 septembre 2026  
Base de travail : `versions/Socle vierge`  
Entreprise migrée : BatiNova Entreprise Générale SRL

## Résultat synthétique

La base BatiNova a été copiée dans la version vierge puis migrée sans recréer l’entreprise, les personnes, les chantiers, les devis ou les factures historiques. La sauvegarde Toitures Meunier n’a pas été modifiée.

Le socle 1.5 couvre désormais l’annuaire central, la migration des véhicules, la structure RH, la situation d’ouverture V2, le mode simulation, les achats, les livraisons, les mouvements de stock, la ventilation des factures fournisseurs, la facturation HTVA/TVA/TVAC et un premier filtrage serveur réel.

Le feu vert final reste **NON** : les écritures opérationnelles pour les rôles non propriétaires, les avoirs, le registre documentaire transversal et plusieurs indicateurs du tableau de bord doivent encore être finalisés avant une simulation multi-utilisateur de dix jours.

## Phases A à N

| Phase | État | Résultat |
|---|---|---|
| A — Sauvegarde, inspection, migrations | Fait | Base BatiNova sauvegardée et copiée dans la version vierge. Migration additive 0004 appliquée. |
| B — Annuaire | Fait | 6 clients, 8 fournisseurs et 3 sous-traitants centraux, fiches structurées et multi-rôles. |
| C — Chantiers et liens | Fait | 5 chantiers conservés, références séparées, clients liés, champs contrat/budget/avancement ajoutés. Les avancements inconnus restent à 0 plutôt que d’être inventés. |
| D — RH et permissions serveur | Partiellement fait | Emploi, CP, rémunération, historique, temps/absences, certifications et EPI structurés. Lecture sensible filtrée côté serveur et périmètre chantier réel. Les écritures métier non propriétaire restent volontairement bloquées. |
| E — Véhicules et matériel | Fait | 8 contournements migrés en véhicules ; 19 matériels restent dans l’outillage. Fiches enrichies. |
| F — Catalogue, achats, commandes, livraisons | Fait | 34 articles conservés ; prix achat/coût rendu/vente/historique. Flux commande et livraison partielle fonctionnel. |
| G — Stock | Fait | Entrées, sorties chantier, transferts/retours/pertes/casse, contrôle du stock négatif et coût chantier. Le détail du stock initial doit encore être encodé ; seule la valeur d’ouverture de 95 000 € est connue. |
| H — Factures fournisseurs, avoirs, paiements | Partiellement fait | Facture HTVA/TVA/TVAC, commande/livraison et ventilation multi-chantier disponibles. Paiements et avoirs existent dans le modèle, mais leurs écrans complets manquent. |
| I — Facturation client | Fait | HTVA, régime, taux, TVA, TVAC, destinataire et format séparés. Les anciennes factures ambiguës sont marquées « Montant historique à vérifier ». |
| J — Situation financière | Partiellement fait | Situation d’ouverture V2, comptes conceptuels, solde historique non détaillé, budgets annuels et 26 charges récurrentes enregistrés. Éditeur complet et vue de trésorerie dédiée à terminer. |
| K — Documents et recherche | Partiellement fait | Recherche exacte `FAC-C-26094` validée et sources élargies. Métadonnées sécurisées présentes côté serveur ; stockage fichier et relations transversales complètes non branchés. |
| L — Administratif et sécurité | Partiellement fait | Structures chantier et prévention ajoutées ; écrans détaillés et workflow de validation à compléter. Aucune déclaration externe. |
| M — Mode simulation | Fait | Badge permanent, entreprise de test, transmissions externes marquées ou bloquées. Aucun envoi réel n’est effectué. |
| N — Tests et régression | Fait pour le périmètre livré | 46 assertions automatisées réussies après ajout du test de persistance. Pas d’échec connu sur ce périmètre. |

## Fichiers principaux modifiés ou ajoutés

- `web/onboarding.js` : migration BatiNova 1.5, RH, annuaire, chantiers, véhicules, catalogue, TVA, situation d’ouverture, simulation.
- `web/procurement.js` : commandes, livraisons, stock, liaisons factures et recherche étendue.
- `web/index.html` et `scripts/build.mjs` : chargement et construction des nouveaux modules.
- `worker/index.js` : lecture serveur filtrée, contrôle des permissions, périmètre chantier, écriture globale réservée au propriétaire.
- `drizzle/0004_workspace_permissions.sql` : nouvelles permissions et table `project_access`.
- `tests/data-15.mjs`, `tests/permissions-15.mjs`, `tests/browser-15.mjs` : données, permissions, persistance et parcours navigateur.

## Sauvegardes

- Source BatiNova avant 1.5 : `data/socle-batinova-before-1.5-2026-09-24.sqlite`.
- Version vierge avant réception de BatiNova : `versions/Socle vierge/data/socle-blank-before-batinova-1.5-2026-09-24.sqlite`.
- Ancienne démonstration Meunier : intacte dans `data/socle-toitures-meunier-backup-2026-09-24.sqlite`.

## Tests

Commandes exécutées :

```text
node --check web/onboarding.js
node --check web/procurement.js
node --check worker/index.js
node tests/data-15.mjs
node tests/permissions-15.mjs
node tests/browser-15.mjs
node scripts/build.mjs
```

Couverture validée :

- migration persistée et données BatiNova conservées ;
- sauvegarde puis rechargement d’un chantier à 48 % ;
- relation client → chantier et recherche de facture ;
- commande → livraison → stock → facture fournisseur ;
- HTVA + TVA = TVAC ;
- entrée +100, sortie chantier -25, stock final 75, coût chantier +300 € ;
- utilisateur sans permission refusé ;
- ouvrier limité à son chantier et privé des données RH/comptables ;
- écriture globale non propriétaire refusée ;
- propriétaire autorisé ;
- 8 véhicules sans augmentation du compteur outillage ;
- recherche exacte `FAC-C-26094` ;
- badge du mode simulation visible.

Résultat final : **46 assertions réussies, 0 échec**.

## Éléments de l’audit initial corrigés

| Problème initial | État actuel |
|---|---|
| 8 véhicules comptés comme outillage | Corrigé : 8 véhicules, 19 matériels. |
| Absence d’annuaire central | Corrigé : 17 fiches structurées et multi-rôles. |
| RH contenue dans « Qualification » | Corrigé pour les champs structurés ; le texte ancien reste conservé comme historique. |
| Chantiers impossibles à reprendre proprement | Corrigé : référence, contrat, budget, avancement et responsabilités sont éditables. |
| Facturation limitée au TVAC | Corrigé : HTVA, TVA, TVAC et régime distincts. |
| Facture fournisseur mono-chantier | Corrigé dans le modèle et la saisie ; la ventilation est persistée et imputée. Certaines anciennes vues n’affichent encore que le chantier principal. |
| Aucun stock réel | Corrigé pour les mouvements ; détail du stock initial encore à encoder. |
| Recherche exacte de `FAC-C-26094` défaillante | Corrigé et testé dans le navigateur. |
| Permissions seulement visuelles | Corrigé pour les lectures sensibles et le périmètre chantier ; mutation métier fine à poursuivre. |
| Pas de mode simulation global | Corrigé : badge visible et absence de transmission externe. |
| Mélange des chiffres V1/V2 | Corrigé : la situation d’ouverture V2 est la référence. |
| Écarts comblés par de fausses pièces | Corrigé : usage d’un solde historique non détaillé. |

## Régressions éventuelles

Aucune régression détectée par les contrôles exécutés. La base historique est conservée. Les utilisateurs non propriétaires ne peuvent toutefois plus modifier le bloc global `/api/state` : c’est une restriction de sécurité volontaire. Ils auront besoin de routes métier autorisées pour écrire dans les achats, le stock, les pointages et les tâches.

## État des données BatiNova

| Objet | Nombre final |
|---|---:|
| Personnes | 25 |
| Équipes de production | 4 |
| Clients | 6 |
| Fournisseurs | 8 |
| Sous-traitants | 3 |
| Chantiers | 5 |
| Véhicules | 8 |
| Matériels / lots | 19 |
| Articles catalogue | 34 |
| Devis | 6 |
| Factures clients | 3 |
| Factures fournisseurs | 0 |
| Commandes fournisseurs | 0 |
| Bons de livraison | 0 |
| Documents réels | 0 |

Les zéros correspondent à l’absence volontaire de fausses opérations avant le Script n°2, pas à une perte de données.

## Ce qui manque avant le Script n°2

1. Créer les routes métier serveur autorisées pour que les profils logistique, conducteur et ouvrier puissent écrire uniquement dans leur périmètre sans accès au bloc global.
2. Terminer les écrans et calculs des avoirs client/fournisseur et des paiements partiels.
3. Brancher le registre documentaire transversal sur un stockage privé et afficher une pièce unique depuis toutes ses relations.
4. Afficher correctement une ventilation fournisseur multi-chantier dans toutes les anciennes vues, pas seulement dans la donnée et le coût imputé.
5. Compléter le tableau de bord BatiNova avec les KPI demandés, exclusivement à partir des données persistées.
6. Encoder les quantités réelles qui composent les 95 000 € de stock d’ouverture ; elles ne sont pas fournies dans le script 1.5.
7. Faire un test multi-session réel avec au moins un compte propriétaire, un conducteur, Alex en logistique et un ouvrier.

## Feu vert pour Script n°2

**PRÊT POUR SCRIPT N°2 : NON**

Le blocage principal est la mutation serveur par rôle : la confidentialité en lecture est contrôlée, mais les collaborateurs non propriétaires n’ont pas encore toutes les routes métier leur permettant d’exécuter la simulation complète. Lancer dix jours maintenant obligerait soit à tout faire avec le compte propriétaire, soit à relâcher la sécurité, ce qui fausserait le test.
