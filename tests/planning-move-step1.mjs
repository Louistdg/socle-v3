import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/planning.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/planning.css',import.meta.url),'utf8');
assert.match(source,/function iaBSelectMove\(id\)/);
assert.match(source,/function iaBCancelMove\(\)/);
assert.match(source,/async function iaBPlaceMove\(date\)/);
assert.match(source,/scope:'assignment',assignmentId:selected\.id,shiftDays:/);
assert.match(source,/result\?\.ok\)throw Error/,'Un refus sans confirmation ne doit pas annoncer un succès.');
assert.match(source,/catch\(error\).*toast\(error\.message\|\|'Déplacement refusé/);
assert.match(source,/is-move-target/);
assert.match(source,/iaBMoveSelection\?\.id===String\(id\)/,'Retoucher la carte sélectionnée annule le choix.');
assert.match(css,/\.ia-b-slot\.is-move-selected/);
assert.match(css,/\.ia-b-week-day\.is-move-target/);
assert.doesNotMatch(source,/dragstart|dragover|drop|draggable/i);
console.log('planning-move-step1: PASS — sélection, annulation, jour cible, appel audité, retour en cas de refus, styles et absence de geste glissé.');
