# SOCLE V2 — consolidation contrôlée

## Base de départ

- SOCLE historique reste intact dans `Louistdg/SOCLE`.
- Cette V2 est un dépôt séparé, initialisé depuis la branche `main` complète.
- BatiNova est uniquement un jeu de simulation et de tests ; il n'est jamais une donnée de production.

## Références et décisions

| Référence | Ce qui est retenu | Limite actuelle |
| --- | --- | --- |
| SOCLE | worker serveur, migrations, permissions, `project_access`, documents privés, opérations de stock et audit | UI historique à moderniser progressivement |
| Emergent | parcours web React, cookie HttpOnly, séparation frontend/backend observée | code serveur non récupéré, aucune fusion de code faite |
| Base44 | chantier central et parcours Patron/Ouvrier à reproduire | code non accessible, seulement référence UX/API |

## Lots de construction

1. Stabiliser la base et rendre la simulation reproductible.
2. Migrer le référentiel RH et les liens Client → Devis → Chantier.
3. Consolider le chantier, planning, terrain et mobile Ouvrier.
4. Consolider achats, stock, livraisons, facturation et rentabilité.
5. Moderniser l'interface par composants sans déplacer l'autorité métier côté navigateur.

Chaque lot doit préserver l'isolation multi-entreprise, les permissions serveur, l'audit, les documents privés et l'idempotence.
