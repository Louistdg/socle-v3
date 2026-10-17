// Recalcule les contrastes des roles effectivement exposes par les palettes SOCLE.
// Usage: node scripts/audit/verify-contrast.mjs [chemin-v3-themes.css]
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const themesPath=process.argv[2]||resolve(repoRoot,'web/v3-themes.css');
const css=readFileSync(themesPath,'utf8');
const rgb=h=>{const value=String(h).trim(),functional=/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value);if(functional)return functional.slice(1).map(Number);let s=value.replace('#','');if(s.length===3)s=s.split('').map(c=>c+c).join('');if(!/^[\da-f]{6}$/i.test(s))throw new Error('couleur non hexa: '+h);return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16));};
const lum=h=>rgb(h).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const parseDecls=body=>Object.fromEntries(body.split(';').map(d=>{const i=d.indexOf(':');return i<0?['','']:[d.slice(0,i).trim(),d.slice(i+1).trim()];}).filter(([k])=>k));
const names=[...new Set([...css.matchAll(/data-v3-theme=["']([a-z]+)["']/g)].map(m=>m[1]))];
const shared=new Map(names.map(n=>[n,{}]));
for(const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const ids=[...m[1].matchAll(/body\.socle-v3\[data-v3-theme=["']([a-z]+)["']\]/g)].map(x=>x[1]);
  if(!ids.length)continue;
  const declarations=parseDecls(m[2]);
  for(const id of ids)Object.assign(shared.get(id),declarations);
}
const resolveToken=(theme,name,seen=new Set())=>{
  if(seen.has(name))return null;seen.add(name);
  const value=shared.get(theme)?.[name];if(!value)return null;
  const ref=/^var\((--[\w-]+)(?:\s*,\s*(#[\da-f]{3,6}))?\)$/i.exec(value);
  return ref?resolveToken(theme,ref[1],seen)||ref[2]||null:value;
};
let failures=0;
const check=(label,fg,bg)=>{
  console.log(`=== ${label} (${fg} / ${bg}) ===`);
  for(const name of names){
    const F=resolveToken(name,fg),B=resolveToken(name,bg);
    if(!F||!B){console.log(`${name.padEnd(11)}${String(F).padEnd(12)}${String(B).padEnd(12)}DONNEE MANQUANTE`);failures++;continue;}
    const value=ratio(F,B),ok=value>=4.5;if(!ok)failures++;
    console.log(`${name.padEnd(11)}${F.padEnd(12)}${B.padEnd(12)}${value.toFixed(2).padStart(5)}  ${ok?'OK':'SOUS AA'}`);
  }
  console.log('');
};
console.log('Palettes détectées :',names.length,'->',names.join(', '));
for(const n of names){
  for(const token of ['--sx-accent','--sx-accent-ink','--sx-soft','--sx-overlay','--sx-on-accent','--v3-accent-text','--v3-accent-text-on-tint']){
    if(!shared.get(n)?.[token]||!resolveToken(n,token)){console.error(`${n}: déclaration requise absente ou non résolue ${token}`);failures++;}
  }
}
check('Texte accent sur surface douce','--sx-accent-ink','--sx-soft');
check('Texte accent sur surface sélectionnée','--sx-accent-ink','--sx-overlay');
check('Texte bouton sur accent','--sx-on-accent','--sx-accent');
check('Texte principal sur surface','--sx-ink','--sx-surface');
check('Texte principal sur canevas','--sx-ink','--sx-canvas');
check('Texte discret sur surface','--sx-muted','--sx-surface');
check('Texte discret sur canevas','--sx-muted','--sx-canvas');
console.log('RESULTAT : '+(failures===0?'TOUTES LES PAIRES CONTROLEES SONT >= 4,5:1':failures+' paire(s) sous le seuil ou donnée(s) manquante(s)'));
process.exitCode=failures===0?0:1;
