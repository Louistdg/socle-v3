import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/(.:)/,'$1'));
const read=name=>readFileSync(join(root,name),'utf8');

const registry=read('web/navigation-registry.js');
const mobile=read('web/mobile-nav.js');
const legacy=read('web/blank-workspace.js');
const index=read('web/index.html');
const build=read('scripts/build.mjs');

for(const token of ['route:','label:','group:','order:','permission:','type:'])assert.ok(registry.includes(token),'Le registre canonique contient '+token);
for(const type of ['ROOT_MODULE','INTERNAL_VIEW','SUPPORT','SETTINGS'])assert.ok(registry.includes(type),'Le registre couvre '+type);
for(const route of ['purchases','stock','partners','people','fleet','quotes','gallery','actions','messages','contacts','accounting','permissions','company'])assert.match(registry,new RegExp("route:'"+route+"'"),'Route canonique '+route);
assert.ok(!legacy.includes('function applyMobileNavigation'),'Le moteur mobile legacy blank-workspace est supprimé');
assert.ok(!mobile.includes('var NAV_ITEMS='),'mobile-nav ne possède plus de registre parallèle NAV_ITEMS');
assert.ok(!mobile.includes('var PRIMARY='),'mobile-nav ne possède plus de registre parallèle PRIMARY');
assert.ok(!mobile.includes('var SECONDARY='),'mobile-nav ne possède plus de registre parallèle SECONDARY');
assert.ok(mobile.includes('navigationContract()'),'mobile-nav consomme le registre canonique');
assert.ok(mobile.includes('syncSocleDesktopNavigation'),'desktop et mobile passent par le même contrat');
assert.ok(index.includes('<script defer src="navigation-registry.js"></script>'),'index charge le registre canonique sans bloquer le document');
assert.ok(build.includes("'navigation-registry.js'"),'build embarque le registre canonique');

console.log('navigation-contract-01: PASS registre canonique unique, legacy mobile neutralisé');
