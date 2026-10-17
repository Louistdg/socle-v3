// Instrument de controle superviseur — recalcul independant des contrastes de palettes.
// Usage: node verify-contrast.mjs [chemin-v3-themes.css] [chemin-v3.css]
// Ne fait que LIRE. Ne modifie rien.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const themesPath = process.argv[2] || resolve(repoRoot,'web/v3-themes.css');
const v3Path     = process.argv[3] || resolve(repoRoot,'web/v3.css');

const css = readFileSync(themesPath,'utf8');
const cssV3 = readFileSync(v3Path,'utf8');

const rgb = h => {
  let s = String(h).trim().replace('#','');
  if (s.length === 3) s = s.split('').map(c=>c+c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error('couleur non hexa: '+h);
  return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];
};
const lum = c => {
  const a = rgb(c).map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
  return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];
};
const ratio = (x,y) => { const a=lum(x), b=lum(y); const hi=Math.max(a,b), lo=Math.min(a,b); return (hi+0.05)/(lo+0.05); };

// --- palette de base (body[data-v3-theme]) ---
const base = {};
const mBase = css.match(/body\[data-v3-theme\]\{([^}]*)\}/);
if (mBase) for (const d of mBase[1].split(';')) { const i=d.indexOf(':'); if (i>0) base[d.slice(0,i).trim()] = d.slice(i+1).trim(); }

// --- accent legacy de v3.css ---
const legacyAccent = (cssV3.match(/--v3-accent:\s*(#[0-9a-fA-F]{3,6})/)||[])[1] || null;
const legacyAccentText = (cssV3.match(/--v3-accent-text:\s*(#[0-9a-fA-F]{3,6})/)||[])[1] || null;

// --- les 13 palettes ---
const themes = {};
const re = /body\.socle-v3\[data-v3-theme=["']?([a-z]+)["']?\]\s*\{([^}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const v = {};
  for (const d of m[2].split(';')) { const i=d.indexOf(':'); if (i>0) v[d.slice(0,i).trim()] = d.slice(i+1).trim(); }
  themes[m[1]] = v;
}

const get = (t,k,seen=new Set()) => {
  const name='--v3-'+k;
  if(seen.has(name))return null;
  seen.add(name);
  const value=themes[t]?.[name]||((k==='accent')?legacyAccent:(k==='accent-text'?legacyAccentText:base[name]))||null;
  if(!value)return null;
  const reference=value.match(/^var\((--[\w-]+)(?:\s*,\s*(#[0-9a-fA-F]{3,6}))?\)$/);
  if(reference){
    const referencedKey=reference[1].startsWith('--v3-')?reference[1].slice(6):reference[1];
    return get(t,referencedKey,seen)||reference[2]||null;
  }
  return value;
};

const names = Object.keys(themes);
console.log('Palettes detectees :', names.length, '->', names.join(', '));
console.log('Accent legacy v3.css :', legacyAccent, '| accent-text legacy :', legacyAccentText);
console.log('Jeton dedie --v3-accent-text-on-tint :', Object.keys(themes).some(t=>themes[t]['--v3-accent-text-on-tint']) ? 'DECLARE' : 'ABSENT');
console.log('');

const NBSP = ' ';
let failures = 0;
const checkPairs = (label, pairs) => {
  console.log('=== '+label+' ===');
  console.log('theme'.padEnd(11)+'texte'.padEnd(12)+'fond'.padEnd(12)+'ratio   seuil  verdict');
  for (const t of names) {
    for (const [fgK,bgK] of pairs) {
      const F = get(t,fgK), B = get(t,bgK);
      if (!F || !B) { console.log(`${t.padEnd(11)}${String(F).padEnd(12)}${String(B).padEnd(12)}---     ---    DONNEE MANQUANTE (${fgK}/${bgK})`); failures++; continue; }
      const r = ratio(F,B);
      const ok = r >= 4.5;
      if (!ok) failures++;
      console.log(`${t.padEnd(11)}${F.padEnd(12)}${B.padEnd(12)}${r.toFixed(2).padStart(5)}${NBSP}  ${(4.5).toFixed(1)}${NBSP}  ${ok?'OK':'SOUS AA'}`);
    }
  }
  console.log('');
};

// Paires 1 : le nouveau jeton texte accentue sur surface teintee (coeur de T1)
checkPairs('A. accent-text-on-tint sur SOFT et SELECTED (cible T1)', [
  ['accent-text-on-tint','soft'],
  ['accent-text-on-tint','selected'],
]);
// Paires 2 : non-regression des boutons (accent en fond + accent-text)
checkPairs('B. NON-REGRESSION : accent-text sur accent (fond de bouton)', [
  ['accent-text','accent'],
]);
// Paires 3 : contexte : l'ancien usage accent-en-texte (doit rester >= 4,5 apres correction)
checkPairs('C. CONTEXTE : accent sur soft / selected (etat avant correction)', [
  ['accent','soft'],
  ['accent','selected'],
]);
// Paires 4 : lisibilite de base
checkPairs('D. LISIBILITE DE BASE : ink et muted', [
  ['ink','paper'],
  ['ink','bg'],
  ['muted','paper'],
  ['muted','bg'],
]);

console.log('RESULTAT : '+(failures===0 ? 'TOUTES LES PAIRES CONTROLEES SONT >= 4,5:1' : failures+' paire(s) sous le seuil ou manquante(s)'));
process.exitCode = failures === 0 ? 0 : 1;
