import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {contrastRatio,luminance} from './helpers/color-contrast.mjs';

const js=readFileSync(new URL('../web/v3-themes.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/v3-themes.css',import.meta.url),'utf8');
const v3css=readFileSync(new URL('../web/v3.css',import.meta.url),'utf8');
const mobileThemeRule=css.match(/\.v3-theme-menu\{([^}]+)\}/g)?.find(rule=>rule.includes('100dvh'))||'';
const palettes={
  graphite:{bg:'#111315',paper:'#191c20',soft:'#22262b',selected:'#2c343c',ink:'#edf0f2',muted:'#aeb5bd',accent:'#35c99a',accentText:'#102019'},
  carmin:{bg:'#1d131c',paper:'#2a1b29',soft:'#382339',selected:'#4a2b43',ink:'#f6edf5',muted:'#d0b8ce',accent:'#ec6f91',accentText:'#35111f'}
};
const appPalettes={
  atelier:{bg:'#cfd6d4',paper:'#dfe5e2',ink:'#1c3036',muted:'#425358'},
  ardoise:{bg:'#c8d1dd',paper:'#d7dee8',ink:'#1e304c',muted:'#3d4d65'},
  terre:{bg:'#141b17',paper:'#1e2922',ink:'#edf4ee',muted:'#b9cabe'},
  contraste:{bg:'#101a29',paper:'#19283b',ink:'#fff7df',muted:'#d6d4c5'}
};
for(const [id,t] of Object.entries(appPalettes)){
  const block=css.match(new RegExp(`body\\.socle-v3\\[data-v3-theme=${id}\\]\\{([^}]+)\\}`))?.[1];
  assert.ok(block,`${id}: palette claire présente`);
  for(const [name,value] of Object.entries(t))assert.ok(block.includes(`--v3-${name}:${value}`),`${id}: teinte de référence ${name}`);
  assert.ok(luminance(t.paper)<=0.8,`${id}: panneau moins lumineux que le blanc`);
  assert.ok(contrastRatio(t.ink,t.paper)>=4.5,`${id}: texte principal AA`);
  assert.ok(contrastRatio(t.muted,t.paper)>=4.5,`${id}: texte secondaire AA`);
}
for(const [id,tokens] of Object.entries(palettes)){
  const block=css.match(new RegExp(`body\\.socle-v3\\[data-v3-theme=${id}\\]\\{([^}]+)\\}`))?.[1];
  assert.ok(block,`${id}: palette présente`);
  for(const [name,value] of Object.entries(tokens))assert.ok(block.includes(`--v3-${name.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())}:${value}`),`${id}: token ${name}`);
  assert.ok(block.includes('color-scheme:dark'),`${id}: contrôles système en mode sombre`);
  assert.ok(luminance(tokens.bg)<0.02,`${id}: fond sombre doux`);
  assert.ok(contrastRatio(tokens.ink,tokens.bg)>=4.5,`${id}: texte principal lisible sur le fond`);
  assert.ok(contrastRatio(tokens.ink,tokens.paper)>=4.5,`${id}: texte principal lisible sur les panneaux`);
  assert.ok(contrastRatio(tokens.muted,tokens.paper)>=4.5,`${id}: texte secondaire lisible`);
  assert.ok(contrastRatio(tokens.ink,tokens.selected)>=4.5,`${id}: texte lisible sur les sélections`);
  assert.ok(contrastRatio(tokens.accent,tokens.paper)>=4.5,`${id}: accent lisible`);
  assert.ok(contrastRatio(tokens.accentText,tokens.accent)>=4.5,`${id}: bouton primaire lisible`);
  assert.ok(js.includes(`['${id}'`),`${id}: option dans le sélecteur`);
  assert.ok(css.includes(`.v3-theme-swatch[data-palette=${id}]`),`${id}: aperçu couleur du menu`);
}
assert.ok(css.includes('body.socle-v3[data-v3-theme=carmin] #main .v3-hero'),'Carmin colore aussi le bandeau principal');
// Couverture complete des six palettes ajoutees : chaque paire de texte reellement
// utilisee est controlee, accent sur surface douce et accent sur selection incluses.
// Les thèmes clairs historiques n'étaient vérifiés que sur deux paires.
const newPalettes={
  beton:{bg:'#d9dbdc',paper:'#e8eae9',soft:'#d2d5d4',selected:'#c6cbc9',ink:'#22282e',muted:'#4d565f',accent:'#7d3308',accentText:'#ffffff'},
  lin:{bg:'#ece5d8',paper:'#f7f2e8',soft:'#e6ddcd',selected:'#d9cdb6',ink:'#2b2a26',muted:'#57534a',accent:'#1f5f5b',accentText:'#ffffff'},
  ciel:{bg:'#d8e4ef',paper:'#e9f1f8',soft:'#d0dfec',selected:'#bcd2e5',ink:'#1b2b3a',muted:'#45596d',accent:'#17538c',accentText:'#ffffff'},
  foret:{bg:'#101a13',paper:'#182619',soft:'#213324',selected:'#2a4530',ink:'#eaf3ea',muted:'#a9bda9',accent:'#e0a33c',accentText:'#241703'},
  bordeaux:{bg:'#1a1013',paper:'#26171b',soft:'#331f24',selected:'#452a31',ink:'#f5ecec',muted:'#c4a9ac',accent:'#e0b155',accentText:'#2a1c07'},
  cuivre:{bg:'#17120e',paper:'#221a14',soft:'#2e231a',selected:'#3f3023',ink:'#f3ece5',muted:'#c3b0a0',accent:'#d98a52',accentText:'#2a1608'}
};
const textPairs=[['ink','bg'],['ink','paper'],['ink','soft'],['ink','selected'],['muted','paper'],['muted','soft'],['muted','bg'],['accent','paper'],['accent','soft'],['accent','selected'],['accent','bg'],['accentText','accent']];
for(const [id,t] of Object.entries(newPalettes)){
  const block=css.match(new RegExp(`body\\.socle-v3\\[data-v3-theme=${id}\\]\\{([^}]+)\\}`))?.[1];
  assert.ok(block,`${id}: palette présente`);
  for(const [name,value] of Object.entries(t))assert.ok(block.includes(`--v3-${name.replace(/[A-Z]/g,letter=>'-'+letter.toLowerCase())}:${value}`),`${id}: token ${name}`);
  for(const [fg,bg] of textPairs)assert.ok(contrastRatio(t[fg],t[bg])>=4.5,`${id}: ${fg} sur ${bg} doit rester AA (${contrastRatio(t[fg],t[bg])})`);
  assert.ok(js.includes(`['${id}'`),`${id}: option dans le sélecteur`);
  assert.ok(css.includes(`.v3-theme-swatch[data-palette=${id}]`),`${id}: aperçu couleur du menu`);
}
assert.ok(css.includes('body.socle-v3[data-v3-theme=foret] #main .v3-hero'),'Forêt colore aussi le bandeau principal');
assert.match(mobileThemeRule,/position:fixed/,'le menu reste attaché à l’écran mobile');
assert.match(mobileThemeRule,/max-height:calc\(100dvh - 80px/,'la hauteur tient compte de la hauteur visible réelle du téléphone');
assert.match(mobileThemeRule,/overflow-y:auto/,'la liste des thèmes défile verticalement');
assert.match(mobileThemeRule,/overflow-x:hidden/,'le menu ne peut pas partir horizontalement');
assert.match(mobileThemeRule,/overscroll-behavior:contain/,'le geste reste dans le menu quand sa liste défile');
assert.match(mobileThemeRule,/touch-action:pan-y/,'le balayage vertical au doigt est explicitement autorisé');
assert.match(mobileThemeRule,/env\(safe-area-inset-bottom/,'la zone sûre basse des téléphones est préservée');
assert.match(css,/\.v3-theme-choice\{min-height:48px\}/,'les thèmes restent faciles à sélectionner au doigt');
assert.ok(v3css.includes('.v3-note{padding:14px 18px;background:var(--v3-soft)'),'les encarts suivent les couleurs du thème');
assert.match(css,/@media\(max-width:899px\)\{body\.socle-v3 #main\{width:min\(100%,760px\)!important;max-width:760px!important;margin-inline:auto!important\}\}/,'le contenu de chaque page reste centré dans la largeur disponible');
assert.match(css,/@media\(min-width:900px\)\{body\.socle-v3 #main\{max-width:1480px!important;margin-inline:auto!important\}\}/,'les pages desktop restent centrées dans leur espace après la navigation');
console.log('v3-theme-palettes-01: palettes, contraste AA et défilement tactile du sélecteur vérifiés');
