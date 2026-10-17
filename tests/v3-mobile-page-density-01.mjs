import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../web/v3.css',import.meta.url),'utf8');
const themeCss=readFileSync(new URL('../web/v3-themes.css',import.meta.url),'utf8');
const themeJs=readFileSync(new URL('../web/v3-themes.js',import.meta.url),'utf8');
const start=css.indexOf('/* Mobile: reclaim repeated vertical space');
assert.notEqual(start,-1,'règles de densité mobile SOCLE V3 présentes');
const rules=css.slice(start);
for(const [pattern,reason] of [
  [/\.socle-masthead\{padding:var\(--sx-mobile-masthead-y\) var\(--sx-space-4\)/,'bandeau de marque compact sans être supprimé'],
  [/\.socle-masthead span\{margin:var\(--sx-space-1\) 0 0;font-size:var\(--sx-text-2xs\)/,'description conservée avec un espacement réduit'],
  [/#saveStatus\{padding:var\(--sx-space-1\) var\(--sx-space-4\)!important/,'statut de sauvegarde compact sans le masquer'],
  [/#main\{padding:var\(--sx-space-4\) var\(--sx-space-4\) var\(--sx-mobile-nav-clearance\)!important/,'padding haut mobile réduit en conservant la place de la navigation basse'],
  [/\.heading,body\.socle-v3 #main \.ui-page-header\{margin:0 0 var\(--sx-mobile-section-gap\)!important/,'espacement sous le titre réduit pour toutes les pages'],
  [/\.heading p:not\(\.eyebrow\),body\.socle-v3 #main \.ui-page-subtitle\{margin:var\(--sx-space-2\) 0 0!important/,'sous-titres rapprochés du titre']
])assert.match(rules,pattern,reason);
assert.match(rules,/\.header-right \.demo\{display:none!important\}/,'le bandeau de mode simulation est masqué dans l’en-tête');
assert.match(rules,/footer>span:not\(:first-child\)\{display:none!important\}/,'la mention technique de version de recherche est masquée au pied de page');
assert.match(rules,/@media\(max-width:760px\)/,'le resserrement reste limité au mobile');
console.log('v3-mobile-page-density-01: bandeau, sauvegarde et en-têtes de module resserrés sur mobile');
assert.match(css,/body\.socle-v3 #main :is\(\.planning-head,\.simple-head,\.personal-head,\.job-workspace-head\)\{margin-bottom:var\(--sx-mobile-section-gap\)!important\}/,'les pages utilisant un en-tête spécialisé suivent la même densité');
assert.match(css,/body\.socle-v3 #main :is\(\.planning-head,\.simple-head,\.personal-head,\.job-workspace-head\) h1\{margin-top:0!important/,'les titres spécialisés ne gardent pas leur ancienne marge haute');
assert.match(themeJs,/Espacements compacts · texte lisible/,'le menu décrit une densité sans dézoom');
assert.match(themeJs,/api\/me\/preferences\/dashboard\/density/,'densité conservée dans les préférences utilisateur');
assert.match(themeCss,/data-mobile-layout=wide\] #main\{zoom:1/,'aucune réduction du texte en vue large');
assert.doesNotMatch(themeCss,/zoom:\.75|width:133\.333vw/,'aucune largeur virtuelle qui déborde du téléphone');
assert.match(themeCss,/data-mobile-layout=wide\] #main :is\(button,\.btn\)\{min-height:44px\}/,'cibles tactiles de 44 px');
assert.match(themeCss,/data-mobile-layout=wide\] #main :is\(input,select,textarea\)\{min-height:44px\}/,'champs de 44 px');
