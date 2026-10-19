# Rapport — accès IA SOCLE

Vérification : 19 octobre 2026.

- **GitHub** : dépôt public; `docs/PROJETS-IA.md` et `docs/ACCES-IA.md` synchronisés sur `main`. Les six projets sont listés et le lien commun est publiquement lisible. Aucun secret n’a été publié.
- **Notion** : base Projets accessible à la connexion actuelle. Les six fiches existent, leurs dates `Chronologie` valent 19/10/2026; fiche historique Socle. préservée. L’intégration dédiée lecture seule n’a pas pu être créée/vérifiée.
- **Railway** : service socle-v3 Online, `/health` = 200, volume monté sur `/app/data`, variables applicatives présentes (noms seulement), dernière sauvegarde sans erreur. L’invitation d’autres comptes requiert un administrateur.
- **O2switch** : demande UAC acceptée et droits admin confirmés dans un processus élevé; le terminal Codex reste non élevé. cPanel répond, mais demande une connexion authentifiée; aucun identifiant cPanel local n’est disponible. Les comptes FTPS ne sont donc pas créés ni testés.

## Blocages précis

- Railway : invitation admin requise.
- O2switch : identifiant/mot de passe cPanel ou session authentifiée manquant; l’élévation Windows ne crée pas de session cPanel.
- Notion : gestion des intégrations indisponible depuis la connexion actuelle; aucune page rendue publique.

## Lien commun pour les IA

https://github.com/Louistdg/socle-v3/blob/main/docs/PROJETS-IA.md

Aucun identifiant, token ou mot de passe n’est inclus dans ce rapport.
