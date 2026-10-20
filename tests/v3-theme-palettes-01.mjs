import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../web/v3-themes.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/v3-themes.css',import.meta.url),'utf8');
const v3css=readFileSync(new URL('../web/v3.css',import.meta.url),'utf8');
const tokenCss=readFileSync(new URL('../web/design-tokens.css',import.meta.url),'utf8');
const paletteIds=['atelier','ardoise','terre','nuit','graphite','carmin','contraste','beton','lin','ciel','foret','bordeaux','cuivre','encre','craie','comete','petrole','petrole-signature','charbon-ivoire'];
const roles=['--sx-canvas','--sx-surface','--sx-raised','--sx-overlay','--sx-sunken','--sx-line','--sx-line-strong','--sx-ink','--sx-ink-soft','--sx-muted','--sx-faint','--sx-on-accent','--sx-accent','--sx-accent-ink','--sx-accent-hover','--sx-accent-soft','--sx-accent-line','--sx-ok','--sx-warn','--sx-danger','--sx-info','--sx-ok-soft','--sx-warn-soft','--sx-danger-soft','--sx-info-soft'];
const themeRules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const blocks=themeRules.filter(([,selector])=>/^body\.socle-v3\[data-v3-theme="[^"]+"\]$/.test(selector.trim()));
function declarations(block){return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)\s*;/g)].map(match=>[match[1],match[2].trim()]));}
function effectiveTheme(id){const result={};for(const [,selectorText,block] of themeRules){const selectors=selectorText.split(',').map(value=>value.trim());if(selectors.includes('body.socle-v3[data-v3-theme]')||selectors.includes(`body.socle-v3[data-v3-theme="${id}"]`))Object.assign(result,declarations(block));}return result;}
const mobileMenu=[...css.matchAll(/\.v3-theme-menu\{([^}]+)\}/g)].map(match=>match[1]).find(rule=>rule.includes('100dvh'))||'';
const registeredIds=[...js.matchAll(/\['([^']+)','([^']+)'/g)].slice(0,19).map(match=>match[1]);
assert.deepEqual(registeredIds,paletteIds,'les dix-neuf palettes gardent leurs identifiants et leur ordre');
assert.equal(new Set(blocks.map(([,selector])=>selector.trim())).size,19,'dix-neuf palettes ont leurs règles dédiées');
for(const id of paletteIds){
  const theme=effectiveTheme(id);
  for(const role of roles)assert.ok(role in theme,`${id}: jeton ${role} présent dans la cascade partagée`);
  assert.equal(theme['--v3-bg'],'var(--sx-canvas)',`${id}: alias historique du fond`);
  assert.equal(theme['--v3-paper'],'var(--sx-surface)',`${id}: alias historique des panneaux`);
  assert.equal(theme['--v3-accent-text-on-tint'],'var(--sx-accent-ink)',`${id}: ancien jeton de texte redirigé vers le rôle accent texte`);
  assert.equal(theme['--ia-accent'],'var(--sx-accent)',`${id}: alias IA conservé`);
  assert.ok(js.includes(`['${id}'`),`${id}: option dans le sélecteur`);
  assert.ok(css.includes(`.v3-theme-swatch[data-palette=${id}]`)||css.includes('.v3-theme-swatch{'),`${id}: pastille thématique`);
}
assert.match(tokenCss,/@media\(max-width:760px\)\{[^}]*--sx-tap:48px/,'hauteur tactile partagée sur mobile');
assert.match(css,/\.v3-theme-choice\{[^}]*min-height:var\(--sx-row\)/,'les choix de thème utilisent la hauteur tactile partagée');
assert.match(mobileMenu,/max-height:calc\(100dvh - 80px/,'la hauteur du menu tient compte de la hauteur visible réelle du téléphone');
assert.match(mobileMenu,/overflow-y:auto/,'la liste des thèmes défile verticalement');
assert.match(mobileMenu,/overflow-x:hidden/,'le menu ne peut pas partir horizontalement');
assert.match(mobileMenu,/overscroll-behavior:contain/,'le geste reste dans le menu quand sa liste défile');
assert.match(mobileMenu,/touch-action:pan-y/,'le balayage vertical au doigt est explicitement autorisé');
assert.match(mobileMenu,/env\(safe-area-inset-bottom/,'la zone sûre basse des téléphones est préservée');
assert.match(css,/body\.socle-v3\[data-socle-theme\] :focus-visible\{outline:3px solid var\(--sx-accent-line\)!important/,'le focus visible suit le rôle de trait accentué');
assert.match(v3css,/\.v3-hero[^}]*background:var\(--sx-accent\)/,'le bandeau principal utilise le rôle accent partagé');
assert.match(v3css,/\.v3-note\{padding:var\(--sx-space-4\) var\(--sx-space-5\);background:var\(--v3-soft\)/,'les encarts suivent les couleurs et espacements du thème');
assert.match(css,/@media\(max-width:899px\)\{body\.socle-v3 #main\{width:min\(100%,760px\)!important;max-width:760px!important;margin-inline:auto!important\}\}/,'le contenu reste centré dans la largeur disponible');
assert.match(css,/@media\(min-width:900px\)\{body\.socle-v3 #main\{max-width:1480px!important;margin-inline:auto!important\}\}/,'les pages desktop restent centrées après la navigation');
console.log(`v3-theme-palettes-01: ${paletteIds.length} palettes, aliases, navigation tactile et primitives vérifiés`);
