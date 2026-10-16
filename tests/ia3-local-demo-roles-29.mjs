import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const local=readFileSync(new URL('../scripts/local.mjs',import.meta.url),'utf8');
const planning=readFileSync(new URL('../scripts/simulation/batinova-xl/planning-people-pack.mjs',import.meta.url),'utf8');
const script3=readFileSync(new URL('../scripts/simulation/batinova-xl/batinova-script3.mjs',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../web/local-test-auth.js',import.meta.url),'utf8');

const canonicalRoles=new Set(['OWNER','TEAM_LEAD','WORKER','ACCOUNTING']);
const seedStart=local.indexOf('function seedLocalTestIdentities()');
const seedEnd=local.indexOf('seedLocalTestIdentities();',seedStart);
const seedBlock=local.slice(seedStart,seedEnd);
const demoRoles=[...seedBlock.matchAll(/role:'([^']+)'/g)].map(match=>match[1]);

assert.ok(demoRoles.length>=4,'La démo locale doit couvrir OWNER / TEAM_LEAD / WORKER / ACCOUNTING');
for(const role of demoRoles)assert.equal(canonicalRoles.has(role),true,`Rôle local non canonique interdit: ${role}`);
assert.doesNotMatch(local,/\b(?:PROJECT_MANAGER|LOGISTICS)\b/,'PROJECT_MANAGER et LOGISTICS ne doivent plus apparaître dans la démo locale');

const profileDecision=worker.match(/function accessProfileForRole\(code,name\)\{[^\n]+\}/)?.[0]||'';
assert.ok(profileDecision,'Le mapping serveur des profils doit exister');
assert.doesNotMatch(profileDecision,/\b(?:PROJECT_MANAGER|LOGISTICS)\b/,'Un rôle legacy ne doit plus déclencher de profil serveur spécial');

assert.match(local,/name:'Marc Delcourt'[^\n]+role:'OWNER'/,'Marc reste OWNER');
assert.match(local,/name:'Anthony Simon'[^\n]+role:'WORKER'/,'Anthony reste WORKER');
assert.match(local,/findPerson\('David Leclercq'\)/,'La démo locale doit retrouver David dans le roster réel');
assert.match(local,/id:'test-david'[^\n]+role:'TEAM_LEAD'/,'David doit utiliser le membership TEAM_LEAD créé par Planning');
assert.match(local,/r\.code='ACCOUNTING'/,'La démo locale doit retrouver le membership ACCOUNTING existant');
assert.match(local,/id:'test-accounting'[^\n]+role:'ACCOUNTING'[^\n]+standalone:true/,'ACCOUNTING doit réutiliser une identité Finance séparée du roster');
assert.doesNotMatch(local,/name:'Julien Lambert'[^\n]+role:'TEAM_LEAD'/,'Julien ne doit plus servir de faux TEAM_LEAD');
assert.doesNotMatch(local,/name:'Alex Marchal'[^\n]+role:'TEAM_LEAD'/,'Alex ne doit plus servir de faux TEAM_LEAD');

assert.match(planning,/expectedLeadNames=\['David Leclercq','Olivier Mathieu','Philippe André','Christophe Henry'\]/,'Planning doit verrouiller les quatre vrais chefs');
assert.match(planning,/accountingName=String\(state\.company\?\.accountant/,'Planning doit dériver ACCOUNTING des champs company.accountant');
assert.match(planning,/personId:null,name:accountingName/,'Planning doit créer ACCOUNTING sans rattachement à un Pxx');
assert.match(local,/BATXL-ACCOUNTING-EXTERNAL/,'La démo locale doit conserver un identifiant technique non-roster pour local_test_identities');
assert.match(local,/entry\.standalone\?null:personId/,'Le membership ACCOUNTING local doit garder person_id NULL');
assert.match(planning,/floater:0,temporaryReinforcement:1,accounting:1/,'P24 doit rester renfort ponctuel, pas volant permanent');
assert.doesNotMatch(script3,/\['script2',join\(root,'scripts','batinova-script2\.mjs'\),\[\]\]/,'Script3 final ne doit plus exécuter Script2 comme générateur opérationnel');

assert.match(local,/ON CONFLICT\(organization_id,user_id\) DO UPDATE SET role_id=excluded\.role_id,status=excluded\.status,updated_at=excluded\.updated_at/,'Le reseed local doit conserver un membership canonique actif');
assert.match(auth,/placeholder\.textContent='Choisir un utilisateur…'/,'Le sélecteur local doit rester sans utilisateur présélectionné');
assert.match(auth,/placeholder\.disabled=true/,'Le placeholder du sélecteur local doit être non sélectionnable comme identité');
assert.match(auth,/placeholder\.selected=true/,'Le placeholder doit être sélectionné au chargement');
assert.match(auth,/button\.disabled=true/,'Le bouton de connexion doit être désactivé avant un choix');
assert.match(auth,/select\.addEventListener\('change',\(\)=>\{button\.disabled=!select\.value\}\)/,'Le bouton ne doit s’activer qu’après sélection explicite');

console.log('ia3-local-demo-roles-29: roster canonique, identités locales et garde du sélecteur vérifiés');
