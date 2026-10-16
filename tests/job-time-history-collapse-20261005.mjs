import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const business=readFileSync(new URL('../web/business.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/style.css',import.meta.url),'utf8');

assert.match(business,/class="job-time-history"/,'le détail chantier contient le bloc repliable des pointages');
assert.match(business,/<details class="job-time-history"><summary>/,'le bloc est fermé par défaut via details sans attribut open');
assert.match(business,/Pointages ouvriers/,'le libellé demandé est visible');
assert.match(business,/job-time-history-action">Historique/,'l’action Historique est visible sans afficher toute la liste');
assert.match(business,/job-time-history-body"[\s\S]*?\$\{timeRows\(j\)\}[\s\S]*?<\/details>/,'les lignes de pointage restent dans le contenu dépliable');
assert.doesNotMatch(business,/<h3>Temps du chantier<\/h3>[\s\S]*?\$\{timeRows\(j\)\}/,'l’ancien historique toujours ouvert n’est plus rendu');
assert.match(css,/\.job-time-history\{/,'le composant repliable est stylé');
assert.match(css,/\.job-time-history\[open\]/,'l’état ouvert est stylé');

console.log('job-time-history-collapse-20261005: PASS — pointages ouvriers repliés par défaut, historique conservé au clic');
