import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const nav=readFileSync(new URL('../web/mobile-nav.js',import.meta.url),'utf8');
const registry=readFileSync(new URL('../web/navigation-registry.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/mobile-nav.css',import.meta.url),'utf8');
const index=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../web/workflow-improvements.js',import.meta.url),'utf8');
const cockpit=readFileSync(new URL('../web/cockpit.js',import.meta.url),'utf8');
const organization=readFileSync(new URL('../web/organization.js',import.meta.url),'utf8');
const iaA=readFileSync(new URL('../web/ia-a-ui.js',import.meta.url),'utf8');

assert.match(nav,/SOCLE_NAVIGATION_V2/,'NAV-01 expose une configuration de navigation canonique.');

assert.match(cockpit,/\['home','Accueil'\]/,'Cockpit possède une vraie entrée Accueil.');
assert.match(cockpit,/\['planning','Planning'\]/,'Cockpit conserve une entrée Planning distincte.');
assert.doesNotMatch(organization,/planning'\)\[1\]\s*=\s*'Accueil'/,'Organization ne renomme plus Planning en Accueil.');
assert.doesNotMatch(workflow,/\['planning','Accueil'\]/,'Workflow ne confond plus Planning et Accueil.');
assert.match(workflow,/\['home','Accueil'\],\['planning','Planning'\]/,'Workflow sépare les deux clés.');
assert.doesNotMatch(workflow,/Accueil & planning/,'La matrice d’accès n’emploie plus le libellé hybride.');
assert.match(iaA,/function iaAPersonalPortalsForOverview\(\)[\s\S]{0,220}iaAModuleVisible\('personal'\)/,'Les portails utiles de l’accueil restent protégés par le droit Mon espace existant.');
assert.match(iaA,/class="ia-home-portal-links"/,'Les liens personnels sont rendus dans un format compact sur Accueil.');
assert.ok(iaA.includes("serverJson('/api/home-overview?")&&iaA.includes("people.includes(String(personId))"),'La météo d’un ouvrier réutilise le snapshot Home serveur scoppé et filtre la personne effective.');
assert.ok(iaA.includes("item.status!=='cancelled'"),'Une affectation annulée ne déclenche pas de météo sur Accueil.');
assert.ok(iaA.includes('iaAWorkerWeatherSection()+'),'La météo du chantier personnel apparaît dans le tableau de bord ouvrier.');
assert.ok(iaA.includes('aria-label="Météo de mes chantiers"'),'La météo est un widget distinct et compact sur Accueil.');
assert.match(workflow,/globalThis\.iaAPersonalPortalSection=function\(\)\{if\(typeof canViewModule!=='function'\|\|!canViewModule\('personal'\)\)/,'Mon espace conserve ses portails sous le même contrôle de permission.');
assert.match(workflow,/name:'My FGTB'[\s\S]*name:'Ma CSC'[\s\S]*name:'CGSLB[\s\S]*name:'MyCareer'[\s\S]*name:'MyPension'/,'Mon espace conserve les cinq portails personnels.');
assert.match(workflow,/personalBeforeOfficialInformation\(\)\+personalSection/,'Les portails complets restent également dans Mon espace.');

for(const route of ['home','jobs','planning','documents','personal']){
  assert.match(registry,new RegExp("route:'"+route+"'[\\s\\S]{0,180}primaryRoles:\\[[^\\]]*(?:OWNER|TEAM_LEAD|WORKER)"),route+' appartient au contrat primaire terrain.');
}
assert.match(registry,/route:'accounting'[\s\S]{0,180}primaryRoles:\['ACCOUNTING'\]/,'ACCOUNTING garde Finance comme priorité dédiée.');
assert.match(nav,/contract\?contract\.mobilePrimary\(role\)/,'La barre basse dérive ses raccourcis du registre canonique sans créer de droit.');
assert.doesNotMatch(nav,/MOBILE_THEMES|data-mobile-theme/,'Le mobile ne crée plus un second catalogue de thèmes.');
assert.match(nav,/function syncPersonalMobileCleanup\(\)/,'Le nettoyage de Mon espace est géré par la couche mobile sans modifier le scoping.');
assert.match(nav,/personal-official-links[\s\S]*personal-company-access/,'Les duplications de portails de Mon espace sont ciblées par le nettoyage mobile.');
assert.match(nav,/function mobileLogoutMarkup\(\)/,'La déconnexion peut être proposée discrètement dans Plus sans rester dans le header.');
assert.match(css,/body\[data-mobile-nav="true"\] \.socle-theme-picker\{[\s\S]{0,120}display:flex!important/,'Le sélecteur Thème canonique est exposé dans le header mobile.');
assert.match(css,/\.simulation-badge[\s\S]{0,120}form\[action\$="\/logout"\]/,'Le badge simulation et le logout permanent sont masqués du header mobile.');
assert.match(nav,/data-mobile-menu-toggle/,'Un accès permanent au menu des rubriques est présent dans la barre mobile.');
assert.match(nav,/function secondaryKeys\(\)[\s\S]*contract\.mobileMore\(currentRole\(\)\)/,'Le menu mobile dérive les rubriques secondaires autorisées du registre canonique.');
assert.match(nav,/function mobileMoreGroups\(query\)\{\s*var keys=secondaryKeys\(\)/,'Le menu mobile part des clés secondaires filtrées par les permissions existantes.');
assert.match(nav,/dialog\.showModal\(\)/,'Le menu des rubriques utilise une boîte de dialogue accessible.');
assert.doesNotMatch(nav,/socle-mobile-more-grid|moreSection\(/,'La navigation des rubriques n’est plus enfouie dans Mon espace.');
assert.match(css,/safe-area-inset-bottom/,'La barre basse respecte la safe area iPhone.');
assert.match(css,/body\[data-mobile-nav="true"\] \.topnav\{display:none!important\}/,'La navigation desktop est masquée sur téléphone.');
assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/,'La barre basse garde des cibles séparées pour cinq raccourcis et le menu Plus.');
assert.match(css,/socle-mobile-sheet\[open\]/,'Le menu Rubriques a une présentation mobile dédiée.');
assert.match(css,/min-height:44px/,'Les contrôles essentiels atteignent une taille adaptée au tactile.');
assert.match(index,/mobile-nav\.css/,'Le CSS mobile est chargé.');
assert.match(index,/mobile-nav\.js/,'Le runtime mobile est chargé.');
assert.doesNotMatch(workflow,/\$\{esc\(person\.role\)\} · \$\{esc\(person\.qualification\|\|person\.trade/,'Mon espace ne réaffiche plus qualification/barème sous le nom.');
assert.doesNotMatch(workflow,/Voir ma fiche →/,'Mon espace ne propose plus le raccourci vers la fiche RH complète.');
console.log('mobile-navigation-129: PASS');
