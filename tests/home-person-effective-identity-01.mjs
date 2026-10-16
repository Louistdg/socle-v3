import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const iaA=readFileSync(new URL('../web/ia-a-ui.js',import.meta.url),'utf8');
const permissions=readFileSync(new URL('../web/permissions.js',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../web/workflow-improvements.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');

function functionBlock(source,name,nextName){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name+' existe');
  const end=source.indexOf('function '+nextName+'(',start+1);
  assert.ok(end>start,nextName+' suit '+name);
  return source.slice(start,end);
}

const previewMember=functionBlock(iaA,'iaAPreviewMember','iaACurrentAccess');
assert.match(previewMember,/member\.key===sessionAccessKey/,'le preview sélectionne la clé exacte et non le nom');
assert.match(previewMember,/member\.serverUserId/,'le compte serveur est obligatoire');
assert.match(previewMember,/\(!\['TEAM_LEAD','WORKER'\]\.includes\(role\)\|\|member\.id!=null\)/,'le roster est obligatoire pour les rôles terrain mais pas pour ACCOUNTING');
assert.match(previewMember,/member\.serverRoleCode/,'le rôle serveur réel est obligatoire');
assert.doesNotMatch(previewMember,/member\.name\s*===|\.find\([^\n]*name/,'aucun appariement par nom ou homonyme');

const effective=functionBlock(iaA,'iaACurrentAccess','iaACurrentPersonId');
assert.match(effective,/if\(!iaAPreviewRequested\(\)\)return actual/,'hors preview la session réelle reste autoritaire');
assert.match(effective,/if\(!member\)return null/,'un preview invalide devient limité au lieu de retomber OWNER');
assert.match(effective,/personId:member\.id==null\?null:String\(member\.id\)/,'le personId effectif reste nul pour un comptable sans roster');
assert.match(effective,/roleCode:iaAProfileRole\([^\n]*member\.serverRoleCode/,'le rôle effectif provient du rôle serveur');

const accessMembers=functionBlock(permissions,'accessMembers','defaultProfileFor');
assert.match(accessMembers,/serverMemberForPerson\(p\.id\)/,'les personnes sont reliées au membre serveur par personId');
assert.doesNotMatch(accessMembers,/serverMemberForPerson\([^)]*name/,'aucune liaison de compte serveur par nom');

const startPreview=functionBlock(workflow,'startAccessPreview','stopAccessPreview');
assert.match(startPreview,/member\?\.serverUserId/,'Tester cet accès exige un compte serveur');
assert.match(startPreview,/member\.id==null/,'Tester cet accès refuse un profil sans roster');
assert.match(startPreview,/serverRoleCode/,'Tester cet accès vérifie le rôle serveur canonique');

assert.match(worker,/JOIN roles r ON r\.id=om\.role_id AND r\.organization_id=om\.organization_id WHERE om\.organization_id=\? AND om\.user_id=\? AND om\.status='active'/,'le serveur résout le view-as dans la même organisation');
assert.ok(worker.includes("['TEAM_LEAD','WORKER'].includes(roleCode)&&!member.person_id")&&worker.includes("aucune personne active du roster"),'un profil terrain sans roster est refusé côté serveur');
assert.match(worker,/if\(!policy\.owner&&!taskIsParticipant\(task,ctx\.uid\)\)continue/,'une tâche urgente étrangère ne devient jamais visible sans participation');

console.log('home-person-effective-identity-01: PASS — identité serveur/personId, no-name match et no OWNER fallback verrouillés');
