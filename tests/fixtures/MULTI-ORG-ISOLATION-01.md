# MULTI-ORG-ISOLATION-01 — fixture et exécution

Ces fixtures créent une base SQLite jetable avec un OWNER et un WORKER BatiNova, des marqueurs métier propres à BatiNova et deux sessions locales de test. Elles ne lisent ni ne modifient de base Railway.

## Contrôle API / serveur

Depuis la racine du dépôt :

```powershell
node tests/multi-org-isolation-01.mjs
```

Le test crée Menuiserie Fayt via `POST /api/organizations`, vérifie le tenant vide, la bascule API, les refus `403`, la collision d’identifiants métier et l’intégrité SQLite.

## Contrôle navigateur A+B

Créer une nouvelle base locale temporaire :

```powershell
$fixtureDb = Join-Path $env:TEMP 'socle-multi-org-isolation-01.sqlite'
node tests/fixtures/create-multi-org-isolation-db.mjs $fixtureDb
```

Démarrer SOCLE localement avec cette base, puis lancer le test depuis un navigateur de test isolé :

```powershell
node scripts/local.mjs "--db-path=$fixtureDb" --port=4281
$env:SOCLE_TEST_URL = 'http://127.0.0.1:4281'
$env:SOCLE_CDP_URL = 'http://127.0.0.1:9237'
node tests/browser-multi-org-isolation-01.mjs
```

Le port CDP doit appartenir à un navigateur de test dédié. Le scénario utilise le compte local `owner@multi-org.test`, crée Menuiserie Fayt depuis l’interface, puis vérifie A→B→A sur desktop 1440 px et mobile 390 px. Il attend le contrôle d’interface accessible `Créer une entreprise` (ou équivalent), un champ nommé pour l’entreprise et le bouton de soumission. Le test navigateur est à exécuter seulement sur le candidat combiné avec l’interface CODEX B.
