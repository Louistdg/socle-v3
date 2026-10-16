# Mentions des composants tiers livrés au navigateur

Cette notice recense les composants tiers embarqués par `scripts/build.mjs` dans les fichiers servis au navigateur. Les chemins de sources et de licences sont relatifs à la racine du dépôt.

## Fichiers livrés et composants

| Fichier livré | Composant | Version | Licence | Texte ou référence de licence |
|---|---|---:|---|---|
| `web/tesseract.js` | `tesseract.js` | 7.0.0 | Apache-2.0 | `node_modules/tesseract.js/LICENSE.md` |
| `web/tesseract-worker.js` | `tesseract.js` | 7.0.0 | Apache-2.0 | `node_modules/tesseract.js/LICENSE.md` |
| `web/tesseract-core-lstm.wasm.js` | `tesseract.js-core` (dépendance transitive de `tesseract.js`) | 7.0.0 | Apache-2.0 | `node_modules/tesseract.js-core/LICENSE` |
| `web/tessdata/fra.traineddata.gz` | `@tesseract.js-data/fra` (modèle français) | 1.0.0 | MIT | `node_modules/@tesseract.js-data/fra/package.json` (`license: MIT`) |
| `web/pdfjs.js` | `pdfjs-dist` | 6.4.299 | Apache-2.0 | `node_modules/pdfjs-dist/LICENSE` |
| `web/pdfjs-worker.mjs` | `pdfjs-dist` | 6.4.299 | Apache-2.0 | `node_modules/pdfjs-dist/LICENSE` |
| `web/stock-zxing.js` | `@zxing/browser` | 0.1.5 | MIT | `node_modules/@zxing/browser/package.json` (`license: MIT`) |
| `web/stock-zxing.js` | `@zxing/library` | 0.21.3 | MIT | `node_modules/@zxing/library/package.json` (`license: MIT`) |
| `web/roofing-metre.js` | `big.js` | 7.0.1 | MIT | `scripts/roofing-metre/vendor/LICENCE.md` |

Les trois bundles (`pdfjs.js`, `stock-zxing.js` et `roofing-metre.js`) sont créés par esbuild à partir de `scripts/pdfjs-entry.js`, `scripts/stock-zxing-entry.js` et `scripts/roofing-metre-entry.js`. Les entrées importent respectivement `pdfjs-dist`, les deux paquets ZXing, et le code de calcul qui utilise la copie locale de `big.js`. Le script copie séparément les fichiers Tesseract et le worker PDF.js depuis `node_modules`, ainsi que le modèle français.

Les versions npm et les identifiants de licence ci-dessus sont vérifiables dans `package-lock.json` et dans les métadonnées des paquets indiquées. `big.js` est une copie vendored, hors de `node_modules` et du lockfile : son en-tête de version se trouve dans `scripts/roofing-metre/vendor/big.cjs`, et sa licence MIT dans le fichier indiqué.

`tesseract.js-core` est déclaré en `devDependencies` dans `package.json` (version exacte `7.0.0`), et reste par ailleurs requis par `tesseract.js`. Il est copié par le build et distribué au navigateur.

`esbuild` (0.28.2, MIT dans `package-lock.json`) est utilisé comme outil de build pour produire les bundles ; le script ne livre pas son paquet ni son code d'exécution au navigateur. Les sorties générées par esbuild contiennent en revanche les composants listés ci-dessus. Les licences MIT de ZXing ont été vérifiées dans les métadonnées locales de chaque paquet.

## Vérifications des artefacts

Le worker livré `web/pdfjs-worker.mjs` contient l'empreinte `pdfjsVersion = 6.4.299`, qui correspond à la version `6.4.299` de `pdfjs-dist` dans `package-lock.json`. Les copies directes du worker PDF.js, des trois fichiers Tesseract et du modèle français ont des sommes SHA-256 identiques à leurs fichiers sources respectifs au moment de cette vérification. Les bundles JavaScript générés ne conservent pas tous une empreinte de version autonome ; leur provenance est établie par les entrées et les appels de build cités ci-dessus.
