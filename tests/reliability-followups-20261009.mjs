import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const planning=readFileSync(new URL('../web/planning.js',import.meta.url),'utf8');
const planningCss=readFileSync(new URL('../web/planning.css',import.meta.url),'utf8');
const v3Css=readFileSync(new URL('../web/v3.css',import.meta.url),'utf8');
const admin=readFileSync(new URL('../web/admin.js',import.meta.url),'utf8');
const fieldServer=readFileSync(new URL('../web/field-server.js',import.meta.url),'utf8');
const business=readFileSync(new URL('../web/business.js',import.meta.url),'utf8');
const aiUi=readFileSync(new URL('../web/ia-a-ui.js',import.meta.url),'utf8');

assert.match(planning,/to:iaBAddDays\(from,6\)/,'la semaine complète est chargée');
assert.match(planning,/length:7/,'la vue planning contient les sept jours');
assert.match(planning,/days:\[1,2,3,4,5\]/,'le planning est limité aux jours ouvrés par défaut');
assert.match(planning,/Ajouter samedi/,'le patron peut activer le samedi');
assert.match(planning,/Ajouter dimanche/,'le patron peut activer le dimanche');
assert.match(planning,/filter\(date=>visible\.has\(iaBDate\(date\)\.getDay\(\)\)\)/,'les jours activés filtrent réellement la semaine affichée');
assert.match(planningCss,/\.ia-b-week-day\.is-weekend/,'samedi et dimanche restent visuellement identifiés quand activés');
assert.match(v3Css,/\.ia-b-week-board\{grid-template-columns:repeat\(var\(--planning-visible-days,5\)/,'la grille patron suit le nombre de jours activés');

assert.match(fieldServer,/\/field-photos/,'upload sécurisé des photos de remarque chantier');
assert.match(fieldServer,/photoDocumentIds,operationKey/,'liaison du document à la remarque côté serveur');
assert.match(business,/n\.photoDocumentIds\|\|\[\]/,'affichage de la photo depuis le stockage documentaire');

assert.match(admin,/preserveWorkspaceRecovery\(snapshot\)/,'copie de secours locale sur conflit/échec');
assert.match(admin,/Télécharger ma copie de secours/,'copie récupérable après rechargement');
assert.match(admin,/Supprimer la copie/,'suppression volontaire de la copie de secours');
assert.match(admin,/socle:workspace-recovery:/,'copie cloisonnée par organisation');
assert.doesNotMatch(admin,/savedSnapshot=snapshot;clearWorkspaceRecovery\(\)/,'une sauvegarde ultérieure ne détruit pas un brouillon conflictuel');

assert.match(aiUi,/les commandes sont enregistrées dans SOCLE/,'état interne des commandes expliqué dans Achats');
assert.match(aiUi,/Commande enregistrée dans SOCLE · non transmise au fournisseur/,'non-transmission persistante au détail');

console.log('reliability-followups-20261009: 17 assertions réussies');
