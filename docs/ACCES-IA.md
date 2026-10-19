# Accès pour toutes les IA — mode d’emploi

## Ce que je ne peux pas faire

- m’élever moi-même administrateur Notion, Railway, GitHub ou O2switch ;
- créer une intégration Notion à ta place sans accès administrateur ;
- connecter un compte ChatGPT, Perplexity, Claude ou Cursor à ta place ;
- partager un mot de passe ou un token dans un document.

Les approbations d’élévation sont désactivées dans cette session. Il faut donc
que l’accès soit accordé par un administrateur ou par toi.

## La solution la plus simple : GitHub comme source commune

Toutes les IA peuvent lire un dépôt GitHub sans recevoir tes mots de passe.

1. Le fichier commun est `docs/PROJETS-IA.md`.
2. Les fiches détaillées restent dans leurs dépôts respectifs.
3. Si le dépôt est privé, ajoute les IA comme **lecteurs** (Read) ou donne-leur
   un accès via une GitHub App / un compte de service.
4. Ne jamais mettre de token Railway, Notion ou O2switch dans le dépôt.

C’est le chemin recommandé pour « connecter toutes les IA » sans gérer un
compte par outil.

## Notion — accès en lecture

### Option A — intégration Notion

1. Va sur `https://www.notion.so/my-integrations`.
2. Crée une intégration interne nommée `IA — lecture Projets`.
3. Donne-lui uniquement **Read content**.
4. Dans Notion, ouvre la base **Projets** → `•••` → **Connections** →
   ajoute `IA — lecture Projets`.
5. Copie le token dans un gestionnaire de secrets, pas dans un document.
6. Chaque IA doit être configurée avec ce token via son connecteur Notion/MCP.
   Un même token partagé à plusieurs IA reste un accès partagé : si une IA fuite,
   toutes fuient. Le mieux est un proxy/MCP en lecture seule.

### Option B — export vers GitHub

1. Dans Notion, base **Projets** → `•••` → **Export** → Markdown & CSV.
2. Décompresse dans `D:\MIGRATION-2026\NOTION-EXPORT`.
3. Je peux transformer cet export en `docs/PROJETS-IA.md` et le pousser sur
   GitHub.
4. Toutes les IA lisent alors GitHub, sans token Notion.

## Railway — accès infrastructure

Je ne peux pas demander une élévation Railway depuis cette session.

Demande à l’administrateur du projet :

```text
Merci de m’inviter au projet Railway « socle-v3 », environnement « preview »,
avec le rôle minimal permettant de consulter :
- les variables d’environnement (sans afficher les secrets) ;
- le volume persistant et son point de montage ;
- l’historique des déploiements et des sauvegardes.

Je n’ai pas besoin du rôle Owner ni du droit de supprimer le service.
```

Une fois invité, je peux vérifier le volume, les sauvegardes et les variables
sans jamais afficher les secrets.

## O2switch — FTP par projet

Les comptes FTP restreints doivent être créés dans cPanel ou par le support.

```text
Bonjour,

Merci de créer trois comptes FTP supplémentaires, limités chacun à leur dossier :
- dioptre-deploy → public_html/dioptre
- berceau-deploy → public_html/berceau
- ptshield-deploy → public_html/ptshield

Accès en FTPS explicite uniquement (port 21, AUTH TLS).
Aucun accès au reste de public_html.
Merci d’envoyer les identifiants par un canal sécurisé, pas par e-mail en clair.
```

Je ne peux pas créer ces comptes à ta place : le formulaire cPanel échoue en
automatisation, et je n’ai pas les droits du support.

## GitHub — lecture pour les IA

- Dépôt principal : `Louistdg/socle-v3`.
- Fichier commun : `docs/PROJETS-IA.md`.
- Pour un accès privé : ajouter l’IA comme collaborateur **Read** ou via une
  GitHub App installée sur le dépôt.
- Ne pas ajouter d’IA avec droit **Write** sans validation humaine.

## Ce que tu fais maintenant, en 5 minutes

1. Choisis GitHub comme source commune.
2. Donne aux IA le lien du dépôt et le chemin `docs/PROJETS-IA.md`.
3. Si tu veux Notion : crée l’intégration en lecture et ajoute-la à la base
   **Projets**.
4. Pour Railway : envoie le texte ci-dessus à l’administrateur.
5. Pour O2switch : envoie le ticket ci-dessus au support.

## Ce que je peux préparer ensuite

- un export Markdown propre des six fiches ;
- un `docs/PROJETS-IA.md` mis à jour depuis ton export Notion ;
- un modèle de fiche par projet ;
- une checklist de moindre privilège pour chaque accès.
