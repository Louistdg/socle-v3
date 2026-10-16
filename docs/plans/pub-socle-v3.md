# pub socle V3 — correction de l’audit du 16 octobre 2026

Référence : outputs/audit-visuel-complet-2026-10-16/constats.json (43 constats).

Ordre de livraison :
1. Vérifier les corrections existantes V01–V04 ; corriger le chargement V38–V41 sans changer la portée des autorisations.
2. Corriger les majeurs V05–V07, V09, V15–V17, V25–V27, V29 et le rattachement des comptes de démonstration V42.
3. Corriger V08, V10–V14, V18–V24, V28, V30–V37 et V43 selon le rapport de référence.
4. Construire et exécuter les tests serveur ; vérifier mobile 375×812 et PC 1920×1080, clavier, thèmes, formulaires, absence de débordement et performances à froid.
5. Faire relire le résultat, publier les fichiers vérifiés sur GitHub, créer la version « pub socle V3 », déployer et contrôler la version effectivement servie.

Invariants : conserver les données et les identifiants, ne fusionner aucune entreprise, préserver le focus visible, les contrôles d’accès et les fonctionnalités existantes. Les personnes de test doivent être distinctes des salariés existants. Aucun mot de passe dans le dépôt.

Suivi : docs/plans/pub-socle-v3-progress.md. Une correction n’est validée qu’avec un contrôle reproductible et une preuve.
