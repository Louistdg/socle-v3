// Audit de classe superviseur : toutes les regles qui posent une couleur d'accent
// sur une surface teintee, dans les CSS V3. Lecture seule.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const dir=resolve(dirname(fileURLToPath(import.meta.url)),'../../web')+'/';
const themesCss=readFileSync(dir+'v3-themes.css','utf8');
const v3Css=readFileSync(dir+'v3.css','utf8');

const rgb=h=>{let s=String(h).trim().replace('#','');if(s.length===3)s=s.split('').map(c=>c+c).join('');return [parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16)];};
const lum=c=>{const a=rgb(c).map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];};
const ratio=(x,y)=>{const a=lum(x),b=lum(y);const hi=Math.max(a,b),lo=Math.min(a,b);return (hi+0.05)/(lo+0.05);};

const T={};
const re=/body\.socle-v3\[data-v3-theme=["']?([a-z]+)["']?\]\s*\{([^}]*)\}/g;let m;
while((m=re.exec(themesCss))){const v={};for(const d of m[2].split(';')){const i=d.indexOf(':');if(i>0)v[d.slice(0,i).trim()]=d.slice(i+1).trim();}T[m[1]]=v;}
const base={};const mb=themesCss.match(/body\[data-v3-theme\]\{([^}]*)\}/);
if(mb)for(const d of mb[1].split(';')){const i=d.indexOf(':');if(i>0)base[d.slice(0,i).trim()]=d.slice(i+1).trim();}
const legacyAccent=(v3Css.match(/--v3-accent:\s*(#[0-9a-fA-F]{3,6})/)||[])[1];
const get=(t,k)=>{const v=T[t]['--v3-'+k];if(v)return v;if(k==='accent')return legacyAccent;return base['--v3-'+k]||null;};

const names=Object.keys(T);
// En V3 (body.socle-v3[data-socle-theme]), v3.css:44 remappe : --ia-accent-strong = --v3-accent
// Donc la couleur effective de --ia-accent-strong sous theme V3 = l'accent du theme.
const surfaces=[['soft','--v3-soft'],['selected','--v3-selected'],['paper','--v3-paper'],['bg','--v3-bg']];

console.log('Couleur effective de --ia-accent-strong sous data-socle-theme = --v3-accent du theme');
console.log('');
console.log('theme'.padEnd(11)+surfaces.map(s=>s[0].padEnd(9)).join('')+'  verdict');
let bad=0;
for(const t of names){
  const acc=get(t,'accent');
  const row=[];
  for(const [label] of surfaces){
    const b=get(t,label==='soft'?'soft':label);
    const r=ratio(acc,b);
    if(r<4.5)bad++;
    row.push((r.toFixed(2)+(r>=4.5?' OK':' <<')).padEnd(9));
  }
  console.log(t.padEnd(11)+row.join(''));
}
console.log('');
console.log('Paires accent-sur-surface sous 4,5:1 :',bad,'/ '+(names.length*surfaces.length));
console.log('Accent legacy (v3.css:2) :',legacyAccent);
console.log('');
console.log('--- Rappel des usages FOND de --ia-accent-strong (a NE PAS assombrir) ---');
const ia=readFileSync(dir+'ia-a-ui.css','utf8').split('\n');
let n=0;
ia.forEach((l,i)=>{ if(/background:\s*var\(--ia-accent-strong/.test(l)){ n++; if(n<=8)console.log('  ia-a-ui.css:'+(i+1)+'  '+l.trim().slice(0,110)); }});
console.log('  total regles avec background:var(--ia-accent-strong) :',n);
