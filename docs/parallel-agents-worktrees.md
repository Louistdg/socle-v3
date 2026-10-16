# Deux agents en parallèle : un worktree chacun

## Créer les arbres (PowerShell, seulement si absents)

```powershell
$repo = 'D:\Codex\SOCLE-V3\v3-source'
$base = (git -C $repo rev-parse HEAD).Trim()
$trees = 'D:\Codex\SOCLE-V3\work'
New-Item -ItemType Directory -Force $trees | Out-Null
git -C $repo worktree add -b agent/t3 "$trees\T3" $base
git -C $repo worktree add -b agent/t4 "$trees\T4" $base
```

Les arbres `D:\Codex\SOCLE-V3\work\T3` et `work\T4` sont déjà enregistrés sur `agent/t3` et `agent/t4`. Dans cet état, ne relancer pas les commandes `worktree add` ; utiliser directement ces deux chemins.

Donner à chaque agent **uniquement** le chemin de son arbre et sa mission. Les deux branches partent du même commit, mais chaque agent écrit dans un dossier physique distinct. Ne pas ouvrir les deux missions dans le dépôt principal. Ne pas réutiliser une branche déjà attachée à un worktree. Chaque arbre a son propre `node_modules` ignoré ; si les dépendances manquent, exécuter `npm ci` dans cet arbre.

## Vérifier les changements séparément

```powershell
$trees = 'D:\Codex\SOCLE-V3\work'
foreach ($name in 'T3','T4') {
  $tree = Join-Path $trees $name
  git -C $tree status --short
  git -C $tree add -N -- .   # rend les nouveaux fichiers visibles dans le diff, sans ajouter leur contenu à l'index
  git -C $tree diff --stat
  git -C $tree diff
}
```

Chaque `git diff` est celui d'un seul agent. Après revue, l’opérateur peut faire ajouter et committer chaque branche séparément, puis intégrer les branches selon l’ordre voulu. Avant revue, les agents ne committent et ne poussent rien.

## Exécuter le palier navigateur

Préparer une fixture `data/` indépendante dans **chaque** worktree, selon le workflow habituel ; ne pas partager ni déplacer celle du dépôt principal. Lancer les deux gates avec des ports distincts, par exemple :

```powershell
# Dans T3
node --experimental-sqlite scripts/browser-gate.mjs --runs=1 --port=5586 --cdp-port=10422 --only=browser-identities-15.mjs
# Dans T4
node --experimental-sqlite scripts/browser-gate.mjs --runs=1 --port=5686 --cdp-port=10522 --only=browser-regression-116.mjs
```

Les fichiers du dépôt, `data/`, `dist/` et `tests/artifacts/` sont séparés par worktree. Le Browser Gate choisit aussi des répertoires temporaires Chromium uniques. Des ports libres et distincts restent nécessaires ; chaque candidate SQLite doit être inactive avant son gate.

## Limites à connaître

Les worktrees partagent la base d’objets et les références Git : utiliser une branche distincte par agent et ne pas nettoyer les références de l’autre. Ce n’est pas une frontière de sécurité : sous le même compte Windows, un agent peut toujours viser le chemin absolu de son voisin. L’isolation protège les commandes relatives au worktree courant (git clean, git restore) et les outils qui respectent leur dossier courant ; elle ne protège pas un outil qui écrit vers un chemin absolu partagé, un service externe ou un port commun. Pour empêcher un agent malveillant d’atteindre l’autre arbre, il faut des comptes Windows/ACL distincts. Une fixture ne se partage pas : sa préparation peut devoir être répétée. La preuve ci-jointe couvre les écritures de fichiers dans des worktrees ; elle ne remplace pas le test réel des deux suites Browser Gate sur des fixtures prêtes.
