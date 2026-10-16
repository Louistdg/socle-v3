# Relais compact — Script n°1 définitif BatiNova

## Mission

Continuer exclusivement dans ce dossier `versions/Socle vierge` afin de terminer le Script n°1 définitif avant la simulation opérationnelle de dix jours.

Ne pas reconstruire Socle et ne pas recréer les objets existants. Procéder phase par phase, avec sauvegarde, migration compatible, tests et point de contrôle avant de poursuivre.

## Documents de référence à lire

1. `SOCLE — Rapport correctif 1.5 BatiNova.md`
2. Le script définitif fourni par l’utilisateur dans la conversation, si disponible.
3. `web/onboarding.js`
4. `web/procurement.js`
5. `worker/index.js`
6. `drizzle/0004_workspace_permissions.sql`
7. `tests/data-15.mjs`
8. `tests/permissions-15.mjs`
9. `tests/browser-15.mjs`

## État contrôlé de BatiNova

- 25 personnes ;
- 4 équipes de production ;
- 6 clients ;
- 8 fournisseurs ;
- 3 sous-traitants ;
- 5 chantiers ;
- 8 véhicules ;
- 19 matériels/lots ;
- 34 articles catalogue ;
- 6 devis ;
- 3 factures clients historiques ;
- 0 facture fournisseur opérationnelle ;
- 0 commande opérationnelle ;
- 0 livraison opérationnelle ;
- mode simulation actif.

Les tests actuels totalisent 46 assertions réussies :

```text
node tests/data-15.mjs
node tests/permissions-15.mjs
node tests/browser-15.mjs
```

## Sauvegardes à préserver

- `data/socle-toitures-meunier-backup-2026-09-24.sqlite` : ne jamais modifier.
- `data/socle-batinova-before-1.5-2026-09-24.sqlite`.
- `versions/Socle vierge/data/socle-blank-before-batinova-1.5-2026-09-24.sqlite`.

Avant toute nouvelle modification, créer dans `versions/Socle vierge/data` :

`socle-batinova-before-script-1-final-2026-09-24.sqlite`

## Ordre obligatoire

1. Sauvegarde et contrôle automatique des compteurs.
2. Schéma cible et migrations, sans module doublon.
3. Quatre identités réelles : propriétaire, Julien, Alex, ouvrier.
4. Matrice RBAC et périmètres chantier.
5. Routes métier ciblées, sans rouvrir `/api/state` aux collaborateurs.
6. Stock multi-emplacement et reprise physique exacte de 95 000 €.
7. Paiements partiels et avoirs.
8. Documents privés et multi-relations.
9. Ventilation fournisseur dans toutes les vues.
10. Administratif chantier et prévention.
11. Trésorerie, dashboard et drill-down.
12. Test réel avec quatre sessions, nettoyage des données TEST et rapport final.

Ne pas commencer une phase si les tests de la précédente échouent.

## Première tâche de la nouvelle conversation

Exécuter uniquement la phase 0 :

1. inspecter la base active ;
2. vérifier les compteurs ci-dessus ;
3. créer la nouvelle sauvegarde sans écraser les précédentes ;
4. relancer les 46 assertions ;
5. examiner les migrations et proposer le schéma des routes métier et la matrice de permissions ;
6. ne pas encore modifier les workflows fonctionnels ;
7. rendre un compte-rendu court et attendre la validation avant la phase suivante.

## Règles critiques

- Ne jamais modifier la sauvegarde Toitures Meunier.
- Ne pas inventer de données manquantes.
- Ne pas créer de fausses opérations commerciales.
- Ne pas lancer les dix jours de simulation.
- Ne pas remettre l’écriture globale `/api/state` aux non-propriétaires.
- Toute autorisation doit être contrôlée côté serveur.
- Aucun fichier sensible ne doit être public ou encodé en base64 dans l’état global.
- Les 46 assertions existantes ne peuvent pas être supprimées pour masquer une régression.
- Le feu vert final reste NON tant que les quatre rôles ne peuvent pas accomplir leurs tâches normales avec leurs propres sessions.
