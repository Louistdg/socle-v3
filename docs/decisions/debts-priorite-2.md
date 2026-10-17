# Décisions — dettes courtes SOCLE V3

État vérifié le 17 octobre 2026. Les observations ci-dessous décrivent le checkout et les services interrogés à cette date.

## O5 — Rotation des sauvegardes S3

- Inventaire du bucket : 5 objets `daily/`, du 12:00 au 16:07 UTC; seuil configuré à 30.
- Sonde de sauvegarde : écriture puis relecture réussies, intégrité SQLite `ok`, une organisation dans la fixture de simulation.
- Sonde `DELETE` : objet temporaire unique écrit et relu, suppression signée réussie, lecture suivante refusée en HTTP 404. Inventaire après sonde toujours à 5 objets.
- Décision : ne pas fabriquer des sauvegardes artificielles pour franchir le seuil; le scénario de rotation d'anciennes générations reste à vérifier quand le bucket atteindra naturellement plus de 30 objets. Le test actuel prouve le verbe `DELETE`, pas la sélection et suppression réelles d'anciennes sauvegardes par `rotateS3`.

## O10 — Région du staging

- Railway indique `heartfelt-analysis` en `sfo`, volume `heartfelt-analysis-volume` d'environ 88 Mo utilisés sur 5 Go; production en `europe-west4` (EU West).
- Décision : conserver le staging en `sfo` pour ce cycle. La région ne bloque pas son rôle de test, tandis qu'un changement oblige à recréer le service et migrer son volume. Réévaluer à la prochaine reconstruction planifiée du staging, pas par une migration isolée.

## O11 — Artefacts `dist/`

- `Dockerfile` exécute `node scripts/build.mjs`; `scripts/local.mjs` charge `dist/server/index.js`.
- Capture SHA-256 des 77 fichiers suivis sous `web/` et `dist/`, build local, puis comparaison : aucune différence d'octets.
- Décision : garder `dist/` versionné pour l'instant. Le signalement de dérive n'est pas reproduit dans ce checkout; le build est déterministe et le point d'entrée local le consomme. Le contrôle CI compare les octets avant/après le build pour détecter toute dérive future.

## O12 — Cycle de vie du bucket

- Le code applicatif conserve les 30 générations les plus récentes et protège la copie fraîche avant suppression.
- Décision : ne pas ajouter de règle de cycle de vie côté fournisseur tant que cette politique applicative reste la source de vérité. Si le test naturel de rotation échoue, réexaminer une règle fournisseur comme alternative plutôt que d'exécuter deux politiques concurrentes.

## O9 — Sélecteur historique de thème

- Mesure Chromium à 1440 px : `#socleThemeButton` est présent, mais son rectangle est `0×0`; `.v3-theme-button` est visible (`110×41`). Le test navigateur vérifie désormais ces deux états.
- La règle `body.socle-v3 .socle-theme-picker{display:none!important}` cache le bouton historique.
- Décision : ne pas retirer le système historique dans ce changement. `data-socle-theme` reste référencé par les règles de style, donc masquer le contrôle ne prouve pas que l’ensemble de ses dépendances est mort. Le doublon visuel est absent; une suppression exige une migration de ces styles.

## Limites ouvertes

- Le vrai `DELETE` S3 a été testé sur un objet temporaire, mais la rotation de générations anciennes n'a pas été provoquée faute de plus de 30 objets.
- Les décisions de région et de rétention ne constituent pas une validation d'interface en Belgique ni une restauration complète d'un service staging.
