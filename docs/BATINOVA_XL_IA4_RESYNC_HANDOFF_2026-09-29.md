# HANDOFF INTER-IA — IA4 BatiNova XL resync intégrité / replay

Date : 2026-09-29

## Références

- Dépôt : `Louistdg/SOCLE-V2`
- Branche de coordination : `integration/batinova-xl-resync-2026-09-29`
- START SHA resync : `99a0783578b9a80b218e5214ad5fd9ecd5168833`
- Branche IA4 : `ia4/batinova-xl-resync-integrity-2026-09-29`
- PR IA4 : `#31`

## Fichiers IA4

- `scripts/simulation/batinova-xl/manifest.mjs`
- `scripts/simulation/batinova-xl/integrity-volume-pack.mjs`
- `docs/BATINOVA_XL_IA4_RESYNC_HANDOFF_2026-09-29.md`

Aucune migration, aucun `worker/index.js`, aucun script métier IA2/IA3/IA5 n'a été modifié.

## Packs resync observés

Les trois packs métier sont désormais publiés sur leurs branches resync :

- IA2 Finance : `b16f1e71745b52e2b9ebc1b3dcf0c470c050a64b`
  - `finance-stock-pack.mjs`
  - blob `0cd0e0c77f6d49c397cec52469a550d7fb636d20`
- IA3 Planning/RH : `7b635f07f1e0c52b9bfe0fc7c69cfb36a10db5d1`
  - `planning-people-pack.mjs`
  - blob `57d359ed1f2c4d4b08779e0f9038ea09c10f8512`
- IA5 Documents : `a8a73c239d24b27db55e9f8b57ea6b1435b84b52`
  - `documents-pack.mjs`
  - blob `61ac9d02ffbc1a04fec306065be81022bc4aac99`

Le manifest IA4 a été enrichi avec les namespaces IA5 réellement publiés.

## Contrôles IA4

Le contrôleur impose :

- `PRAGMA foreign_keys = ON` ;
- `PRAGMA foreign_key_check` vide ;
- `PRAGMA integrity_check = ok` ;
- doublons ID ;
- doublons operationKey/idempotencyKey ;
- IDs BATXL réutilisés entre tables ;
- relations orphelines ;
- relations cross-tenant et cross-project ;
- chantier sans organisation ;
- client/fournisseur inexistant ou cross-tenant ;
- stock négatif et projection stock incohérente ;
- personne/ressource sur plusieurs équipes incompatibles le même jour ;
- présence obligatoire des trois packs métier ;
- snapshot logique déterministe SHA-256 ;
- double replay avec second delta nul et même fingerprint.

## Tests réellement exécutés

### Node 22 ciblé resync

Version : **Node v22.16.0**.

Résultat : **46 assertions réussies**.

Couverture exécutée :
- 38 plages du manifest : non-chevauchement ;
- détection d'un pack métier manquant ;
- fournisseur valide accepté ;
- fournisseur absent détecté ;
- client valide accepté ;
- client absent détecté ;
- `PRAGMA foreign_keys = 1` ;
- `PRAGMA foreign_key_check` vide sur fixture ;
- `PRAGMA integrity_check = ok`.

Le runner distant intégral a été tenté mais était saturé par sa limite de jobs concurrents. Aucun succès intégral n'est revendiqué.

## Anomalies de coordination manifest ↔ packs

Aucune collision d'ID exacte n'a été prouvée par les générateurs inspectés, mais les packs ne respectent pas encore tous la convention d'ordinal du manifest.

### IA2

Exemples au SHA `b16f1e7...` :
- stock : `BATXL-STK-00001+` alors que le manifest canonique réserve `stockItem: 16000–17999` ;
- commandes : `BATXL-PO-00001+` vs `purchaseOrder: 12000–13999` ;
- fournisseurs : `BATXL-SUP-01+` vs `supplier: 10000–10999`.

Le littéral `BATXL-REF-` d'IA2 est un fallback de ligne de commande ; les stocks normaux fournissent `BATXL-STK-*`.

### IA3

Exemples au SHA `7b635f0...` :
- affectations : `BATXL-ASG-YYYYMMDD-Txx` ;
- pointages : `BATXL-TE-YYYYMMDD-Txx-Pxx` ;
- tâches : `BATXL-TASK-001+`.

Ces formats structurés ne correspondent pas à l'ordinal numérique canonique actuel du manifest.

### IA5

Au SHA `a8a73c2...` :
- documents : `BATXL-DOC-26000+` — conforme à la plage document ;
- photos : `BATXL-PHO-29000+` — conforme à la plage photo ;
- références : `BATXL-REF-26000+`, alors que le domaine `reference` du manifest réserve actuellement `46000–47999`.

IA4 ne modifie pas ces packs métier. Une convention unique doit être actée/corrigée par les propriétaires ou par le superviseur avant PASS de reproductibilité.

## État d'intégration

Le HEAD de `integration/batinova-xl-resync-2026-09-29` est resté `99a0783578b9a80b218e5214ad5fd9ecd5168833` pendant ce contrôle.

Les branches IA2/IA3/IA5 ont publié leurs packs, mais ils ne sont pas encore assemblés dans le HEAD resync. Le replay x2 massif ne peut donc pas être exécuté sur un candidat intégré réel.

GitHub Actions sur la PR IA4 a lancé `SOCLE Release Gate` run #33 et conclut `failure`; aucune réussite CI n'est revendiquée.

## Verdict IA4

**BLOQUÉ**

Raisons objectives :
1. les trois packs ne sont pas encore intégrés dans le candidat resync ;
2. les conventions d'IDs du manifest et des packs ne sont pas encore harmonisées ;
3. le double replay massif sur un état assemblé n'a donc pas pu être exécuté.

Le pack IA4 est prêt pour le replay final dès que ces dépendances sont résolues.

Aucun merge vers `main`. Validation finale réservée au superviseur.
