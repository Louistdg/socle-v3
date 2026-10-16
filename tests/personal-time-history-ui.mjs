import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/field-workflows.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const personal=source.slice(source.indexOf('personalView=function(){'),source.indexOf('\n\nlet personalClockAnchor='));
assert.match(personal,/Voir mes pointages/);
assert.match(personal,/Demander une correction/);
assert.doesNotMatch(personal,/clock-history|flatMap\(job/,'Mon espace doit afficher une carte, pas l’historique complet.');

const start=source.indexOf('let personalClockAnchor=');
const end=source.indexOf('\nconst renderBeforePersonalClockHistory=',start);
assert.ok(start>=0&&end>start,'La vue historique dédiée est présente.');
const sandbox={
  reference:'2026-09-16',view:'personal-time-history',
  document:{body:{dataset:{organizationId:'org-iae'}}},
  jobs:[{id:'p-1',name:'Toiture Dumas'}],
  heading:(title,subtitle)=>`<h1>${title}</h1><p>${subtitle}</p>`,
  fullDate:value=>String(value),
  esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
  serverJson:async()=>({entries:[],nextCursor:null}),
  URLSearchParams
};
const exercise=`personalClockAnchor='2026-09-10';personalClockState={key:personalClockKey(personalClockAnchor),loading:false,error:'',entries:[
{id:'one',date:'2026-09-01',projectId:'p-1',arrival:'07:00',departure:'15:30',breakMinutes:30},
{id:'two',date:'2026-09-08',projectId:'p-1',arrival:'07:00',departure:'16:00',breakMinutes:30,archivedAt:'2026-10-01T00:00:00.000Z'},
{id:'three',date:'2026-09-15',projectId:'p-1',arrival:'07:00',departure:'12:00',breakMinutes:15}
]};globalThis.html=personalClockHistoryView()`;
vm.runInNewContext(source.slice(start,end)+'\n'+exercise,sandbox);
assert.match(sandbox.html,/Mois précédent/);
assert.match(sandbox.html,/Semaine précédente/);
assert.match(sandbox.html,/Semaine suivante/);
assert.match(sandbox.html,/Jours pointés <strong>3<\/strong>/);
assert.match(sandbox.html,/21\.25 h/,'Le récapitulatif mensuel totalise les pointages du mois.');
assert.match(sandbox.html,/Total de la semaine : 8\.50 h/);
assert.match(sandbox.html,/07:00 → 16:00/);
assert.match(sandbox.html,/Pause : 30 min/);
assert.match(sandbox.html,/Historique archivé/,'Un pointage archivé reste clairement visible dans l’historique personnel.');
assert.match(sandbox.html,/Toiture Dumas/);
console.log('personal-time-history-ui: PASS carte compacte, résumé mensuel et détail hebdomadaire.');
