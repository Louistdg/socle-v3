import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../web/workflow-improvements.js',import.meta.url),'utf8');
const start=source.indexOf('function profitabilityTeams(job)');
const end=source.indexOf('\nfunction profitabilityTone',start);
assert.ok(start>=0&&end>start,'helper de rattachement des équipes présent');
const section=source.slice(start,end);
const context={
  teams:[{id:1,name:'Toiture'},{id:2,name:'Finition'}],
  assignments:[{job:10,team:1},{job:'10',team:2},{job:11,team:1}],
  demoJobSpecs:[{id:312,team:2}]
};
runInNewContext(section+';globalThis.pickTeams=profitabilityTeams;',context);
const teamIds=job=>JSON.stringify(context.pickTeams(job).map(team=>team.id));
assert.equal(teamIds({id:10}),'[1,2]','toutes les équipes planifiées sont remontées sans attribution arbitraire');
assert.equal(teamIds({id:11,timeEntries:[{team:2}]}),'[1,2]','les équipes planifiées et celles présentes dans les heures sont combinées');
assert.equal(teamIds({id:12}),'[]','aucune équipe inconnue n’est inventée pour un chantier réel sans affectation');
assert.equal(teamIds({id:12,timeEntries:[{team:99}]}),'[]','un identifiant externe n’est pas remplacé par une équipe de démonstration');
assert.equal(teamIds({id:212}),'[2]','les exemples existants conservent leur équipe de démonstration');
assert.match(source,/row\.teams\.length===1&&row\.teams\[0\]\.id===team\.id/,'seul un chantier avec une équipe unique entre dans son total');
assert.match(source,/Plusieurs équipes · résultat non ventilé/,'les chantiers multiéquipes sont clairement identifiés');
assert.match(source,/Les chantiers multiéquipes restent dans le résultat global sans ventilation/,'la limite de comparaison est expliquée au patron');
console.log('profitability-team-attribution-01: multiéquipes exclues des totaux individuels sans perdre le résultat global');
