# Accès IA — état et procédure

Dernière vérification : 19 octobre 2026.

## GitHub — source commune

- Dépôt : [Louistdg/socle-v3](https://github.com/Louistdg/socle-v3), branche `main`.
- Visibilité vérifiée : **public**. Toute personne peut lire les documents publics; aucun accès Write n’est nécessaire.
- Point d’entrée unique : [docs/PROJETS-IA.md](https://github.com/Louistdg/socle-v3/blob/main/docs/PROJETS-IA.md).
- Aucun secret ou identifiant n’est stocké dans ce dépôt.

## Notion — base Projets

- La base **Projets** et ses six fiches sont accessibles à la connexion Notion utilisée pour cette vérification.
- Les fiches PTS, Socle.v3, Dioptre, Berceau, Écho et Socle. ont été vérifiées; `Chronologie` est fixée au 19/10/2026 pour les six.
- La fiche **Socle.** n’a pas été modifiée; elle reste liée à Socle.v3.
- Les liens GitHub figurent dans le contenu des cinq fiches projet; la fiche historique Socle. est conservée telle quelle.
- Limite : cette connexion permet de consulter/modifier le contenu accessible, mais ne permet pas de gérer les intégrations et leurs permissions. L’intégration dédiée **IA — lecture Projets** (Read content) n’a pas pu être créée ni vérifiée. Aucune page n’a été rendue publique.

## Railway — socle-v3 / preview

- Service **Online**, déploiement courant **SUCCESS**.
- `/health` répond **200**; `backup.lastAt=2026-10-19T19:43:19.809Z` et `backup.lastError` est vide.
- Volume `socle-v3-data` monté sur `/app/data` (500 MB).
- Variables présentes : les 16 variables applicatives attendues, vérifiées par noms uniquement; leurs valeurs n’ont pas été lues ni enregistrées.
- Un ancien déploiement en échec a été observé dans l’historique; le déploiement actif est sain.
- **Railway : invitation admin requise** pour donner aux autres IA un accès nominatif en lecture seule. Les outils disponibles permettent l’inspection du projet connecté, pas d’inviter un compte externe.

## O2switch — FTP

Comptes et racines demandés :

| Compte | Racine limitée |
|---|---|
| `dioptre-deploy` | `public_html/dioptre` |
| `berceau-deploy` | `public_html/berceau` |
| `ptshield-deploy` | `public_html/ptshield` |

Blocage : aucun connecteur ou outil cPanel/FTP O2switch n’est disponible dans cette session. Les comptes ne sont donc ni créés ni testés en FTPS; aucun secret n’a été généré ou partagé. L’interface cPanel/support devra créer les comptes restreints, puis chaque compte devra être testé en FTPS explicite sur le port 21. Ne jamais communiquer le compte FTP racine.

## Message unique à transmettre aux autres IA

Lis https://github.com/Louistdg/socle-v3/blob/main/docs/PROJETS-IA.md

Le dépôt est public. Tu y trouveras les six projets, leur état, les points
ouverts et les liens. Accès en lecture seule. Ne modifie pas Socle.v3 sans
validation humaine. Ne demande pas de mot de passe : les accès spécifiques
sont nominatifs et de moindre privilège.
