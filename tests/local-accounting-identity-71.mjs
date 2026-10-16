import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const localSource=readFileSync(new URL('../scripts/local.mjs',import.meta.url),'utf8');
const planningSource=readFileSync(new URL('../scripts/simulation/batinova-xl/planning-people-pack.mjs',import.meta.url),'utf8');

assert.match(planningSource,/accountingName=String\(state\.company\?\.accountant/,'Planning doit dériver ACCOUNTING de company.accountant, hors roster Pxx.');
assert.match(planningSource,/const accountingFallback='BATXL-USER-ACC-01'/,'Planning conserve un identifiant ACCOUNTING déterministe en fallback.');
assert.match(planningSource,/personId:null,name:accountingName/,'Le membership ACCOUNTING doit être créé sans rattachement à une personne Pxx.');
assert.match(localSource,/r\.code='ACCOUNTING'/,'Le serveur local retrouve le membership ACCOUNTING actif existant.');
assert.match(localSource,/profileId:String\(accountingMember\.user_id\)/,'L’identité locale réutilise le profil ACCOUNTING existant.');
assert.match(localSource,/roleId:String\(accountingMember\.role_id\)/,'L’identité locale réutilise le rôle ACCOUNTING existant.');
assert.match(localSource,/role:'ACCOUNTING'[^\n]+standalone:true/,'Le serveur local expose ACCOUNTING comme identité séparée du roster.');
assert.match(localSource,/BATXL-ACCOUNTING-EXTERNAL/,'local_test_identities conserve un marqueur technique non-roster.');
assert.match(localSource,/entry\.standalone\?null:personId/,'organization_members.person_id reste NULL pour ACCOUNTING.');
assert.match(localSource,/accountingMember\.email\|\|state\.company\?\.accountantEmail\|\|'batxl\.accounting@simulation\.invalid'/,'L’adresse ACCOUNTING vient du profil ou de company.accountantEmail avec fallback simulation.');
assert.match(localSource,/role:'ACCOUNTING',roleId:String\(accountingMember\.role_id\),permissions:\[\],projects:\[\],standalone:true/,'Le seed ACCOUNTING n’ajoute ni permission ni accès chantier.');
assert.doesNotMatch(localSource,/role:'ACCOUNTING'[^\n]*roleId:'role-owner/,'ACCOUNTING ne reçoit jamais OWNER.');

console.log('local-accounting-identity-71: 12 assertions réussies');
