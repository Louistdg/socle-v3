import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const source = readFileSync(new URL('../web/quote-roofing-metre.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const build = readFileSync(new URL('../scripts/build.mjs', import.meta.url), 'utf8');
const calculatorUrl = new URL('../scripts/roofing-metre/src/estimate.cjs', import.meta.url);
assert.ok(existsSync(calculatorUrl), 'le calculateur source est conservé dans le dépôt SOCLE');
const { estimate } = createRequire(import.meta.url)(fileURLToPath(calculatorUrl));

const result = estimate({
  planes: [{ id: 'avant', eaveLengthM: '10', developedSlopeM: '4', openingsM2: '2' }],
  guttersM: '10', flashingsM: '4',
  config: {
    usefulCoverWidthMm: '180', usefulExposureMm: '120', battenSpacingM: '0.3',
    counterBattenSpacingM: '0.6', slateWastePct: '10', underlayAllowancePct: '10', timberWastePct: '10'
  }
});
assert.equal(result.areaGrossM2, '40.000');
assert.equal(result.areaNetM2, '38.000');
assert.equal(result.items.find(item => item.code === 'SLATE_PIECES').quantity, '2095');
assert.equal(result.pricedTotalExVat, null, 'le pré-devis ne calcule aucun prix automatiquement');
assert.match(source, /SocleRoofingMetre\.estimate/, 'le pré-devis appelle le calculateur intégré');
assert.doesNotMatch(source, /required>/, 'le calculateur facultatif ne bloque pas l’enregistrement d’une visite sans métrés toiture');
assert.match(source, /Ajouter ce métré aux notes/, 'la personne choisit avant d’ajouter le résultat au relevé');
assert.match(source, /longueur de pente développée/i, 'le résultat rappelle que la mesure de pente doit être développée');
assert.match(source, /à vérifier avec le fabricant/i, 'les dimensions utiles doivent être vérifiées avec le fabricant');
assert.match(source, /prescriptions sur le chantier/i, 'les mesures restent à contrôler sur place');
assert.match(html, /roofing-metre\.js/, 'le bundle est chargé dans SOCLE');
assert.match(build, /roofing-metre-entry\.js/, 'le build compile le calculateur depuis le code livré');

console.log('roofing-metre-predevis-01: calcul pur branché au pré-devis, prix absents et validation humaine maintenue');
