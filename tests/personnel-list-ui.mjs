import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/refinement.js',import.meta.url),'utf8');
const start=source.indexOf('function personnelTable(list)');
const end=source.indexOf('\npeopleView=',start);
assert.ok(start>=0&&end>start,'La table du personnel est présente.');
const sandbox={
  esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
  face:()=>'<span class="person-avatar">PM</span>',
  fullDate:()=> '01/09/2026',
  teams:[{id:'team-1',name:'E1',members:[1790270195166,'P-07']}]
};
vm.runInNewContext(source.slice(start,end),sandbox);

for(const person of [{id:1790270195166,name:'David Leclercq'},{id:'P-07',name:'Anthony Simon'}]){
  const html=sandbox.personnelTable([{...person,category:'CP 124',qualification:'Niveau spécialisé',contract:'CDI',hourlyRate:29.5}]);
  assert.match(html,/class="personnel-row"[^>]*role="button"[^>]*tabindex="0"/,'La ligne est cliquable et accessible au clavier.');
  assert.ok(!/<tr class="personnel-row"[^>]*\saria-label=/.test(html),'La ligne utilise le nom accessible calculé depuis son contenu.');
  assert.ok(html.includes('<strong>'+person.name+'</strong>'),'Le nom de la personne reste présent dans le contenu visible.');
  assert.ok(html.includes('showPersonDossier('),'Le clic et le clavier ouvrent le détail métier.');
  assert.ok(html.includes("event.key==='Enter'||event.key===' '"),'Entrée et Espace sont pris en charge.');
  assert.ok(!html.includes('<button'),'La ligne reste un seul contrôle clavier sans boutons imbriqués.');
  assert.match(html,/Équipe \/ statut/,'La liste indique une équipe et un statut utiles.');
  assert.ok(!/Qualification|Contrat|CP 124|Niveau spécialisé|29\.5/.test(html),'La liste générale ne révèle pas de détail RH ni de rémunération.');
}

console.log('personnel-list-ui: PASS clic, clavier, libellé accessible et propagation maîtrisée.');
