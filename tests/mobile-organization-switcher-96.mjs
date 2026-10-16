import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const css=readFileSync(resolve('web/organization.css'),'utf8');
const js=readFileSync(resolve('web/server-modules.js'),'utf8');
const mobile=css.match(/\/\* Téléphone[\s\S]*?@media\(max-width:760px\)\{([\s\S]*?)\n\}/)?.[1]||'';

assert.ok(mobile,'bloc CSS téléphone introuvable');
assert.match(css,/\.organization-mobile-trigger\{display:none\}/,'le bouton compact reste masqué sur desktop');
assert.match(css,/\.organization-choices\{display:flex;/,'le comportement desktop conserve la liste visible');
assert.match(mobile,/\.topbar \.workspace\{display:flex;/,'le sélecteur entreprise reste présent dans l’en-tête mobile');
assert.match(mobile,/\.organization-current\{display:none\}/,'le libellé desktop est masqué sur téléphone');
assert.match(mobile,/\.organization-mobile-trigger\{display:inline-flex;/,'le bouton compact devient le seul libellé visible sur téléphone');
assert.match(mobile,/\.organization-mobile-trigger\{[^}]*min-height:44px/,'le bouton compact respecte une cible tactile de 44px minimum');
assert.match(mobile,/\.organization-mobile-trigger\{[^}]*border:1px solid var\(--ia-line\)[^}]*background:var\(--ia-surface-soft\)[^}]*color:var\(--ia-text\)/,'le bouton compact utilise uniquement les tokens de thème existants');
assert.match(mobile,/\.organization-choices\{position:fixed;/,'le menu mobile sort du flux de l’en-tête');
assert.match(mobile,/\.organization-choices\[data-mobile-open="false"\]\{display:none\}/,'la liste est repliée par défaut');
assert.match(mobile,/\.organization-choices\[data-mobile-open="true"\]\{display:flex\}/,'la liste s’affiche uniquement après ouverture');
assert.match(mobile,/\.organization-choice,\.organization-add\{width:100%;min-height:44px/,'les choix restent tactiles dans le menu');
assert.match(mobile,/\.global-search,\.quick-create\{display:none\}/,'les contrôles secondaires restent masqués sur téléphone');

assert.match(js,/const canCreateOrganization=active\.role_code==='OWNER';/,'la création d’entreprise reste réservée au rôle OWNER');
assert.match(js,/const hasMobileMenu=organizations\.length>1\|\|canCreateOrganization;/,'le menu existe pour plusieurs entreprises ou pour un OWNER pouvant en ajouter');
assert.match(js,/mobileTrigger\.className='organization-mobile-trigger';/,'le bouton mobile est généré par le switcher');
assert.match(js,/choices\.dataset\.mobileOpen='false';/,'le menu est créé fermé');
assert.match(js,/if\(canCreateOrganization\)\{/,'le bouton Ajouter reste derrière le contrôle OWNER');
assert.match(js,/document\.addEventListener\('keydown'.*Escape/s,'Échap ferme le menu mobile');

console.log('Mobile organization switcher: OK');
