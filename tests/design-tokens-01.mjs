import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tokens=readFileSync(process.env.SOCLE_DESIGN_TOKENS_FILE||join(root,'web/design-tokens.css'),'utf8');
const themes=readFileSync(process.env.SOCLE_V3_THEMES_FILE||join(root,'web/v3-themes.css'),'utf8');
const themeJs=readFileSync(join(root,'web/v3-themes.js'),'utf8');
const index=readFileSync(join(root,'web/index.html'),'utf8');
const production=readFileSync(join(root,'scripts/production.mjs'),'utf8');
const paletteIds=['atelier','ardoise','terre','nuit','graphite','carmin','contraste','beton','lin','ciel','foret','bordeaux','cuivre','encre','craie'];
const paletteNames=['Ciment','Ardoise','Mousse','Bitume','Graphite','Grès','Chantier','Béton','Lin','Zinc','Sapin','Acajou','Cuivre','Encre','Craie'];
const roles=['--sx-canvas','--sx-surface','--sx-raised','--sx-overlay','--sx-sunken','--sx-line','--sx-line-strong','--sx-ink','--sx-ink-soft','--sx-muted','--sx-faint','--sx-on-accent','--sx-accent','--sx-accent-ink','--sx-accent-hover','--sx-accent-soft','--sx-accent-line','--sx-ok','--sx-warn','--sx-danger','--sx-info','--sx-ok-soft','--sx-warn-soft','--sx-danger-soft','--sx-info-soft'];
const aliases={'--v3-bg':'--sx-canvas','--v3-paper':'--sx-surface','--v3-ink':'--sx-ink','--v3-muted':'--sx-muted','--v3-line':'--sx-line','--v3-accent':'--sx-accent','--v3-soft':'--sx-raised','--v3-selected':'--sx-overlay','--v3-control-line':'--sx-line-strong','--v3-accent-text':'--sx-on-accent','--v3-accent-text-on-tint':'--sx-accent-ink'};
function declarations(block){return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)\s*;/g)].map(m=>[m[1],m[2].trim()]));}
function color(value){
  const h=/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if(h){let s=h[1];if(s.length===3)s=[...s].map(c=>c+c).join('');return [0,2,4].map(i=>parseInt(s.slice(i,i+2),16)).concat(1);}
  const m=/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(value);
  assert(m,'Unsupported color value: '+value);
  return [Number(m[1]),Number(m[2]),Number(m[3]),m[4]===undefined?1:Number(m[4])];
}
function luminance(c){const values=c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return .2126*values[0]+.7152*values[1]+.0722*values[2];}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
function round(n){return Math.round(n*100)/100;}
const themeRules=[...themes.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
const themeMatches=themeRules.filter(([,selector])=>/^body\.socle-v3\[data-v3-theme="[^"]+"\]$/.test(selector.trim()));
assert.equal(themeMatches.length,15,'exactement quinze blocs de palette complets');
function effectiveTheme(id){
  const result={};
  for(const [,selectorText,body] of themeRules){
    const selectors=selectorText.split(',').map(value=>value.trim());
    if(selectors.includes('body.socle-v3[data-v3-theme]')||selectors.includes(`body.socle-v3[data-v3-theme="${id}"]`))Object.assign(result,declarations(body));
  }
  return result;
}
const jsNames=[...themeJs.matchAll(/\['([^']+)','([^']+)'/g)].slice(0,15);
assert.deepEqual(jsNames.map(m=>[m[1],m[2]]),paletteIds.map((id,i)=>[id,paletteNames[i]]),'identifiants, libellés et ordre existants');
assert(index.indexOf('href="design-tokens.css"')>=0&&index.indexOf('href="design-tokens.css"')<index.indexOf('href="style.css"'),'les jetons chargent avant les feuilles');
const rootBlock=/\:root\s*\{([^}]*)\}/.exec(tokens)?.[1];
assert(rootBlock,'déclaration racine des jetons absente');
const rootTokens=declarations(rootBlock);
for(const [name,value] of Object.entries(rootTokens))assert(value, 'valeur de base absente: '+name);
const embedded=/const standaloneDesignTokens = '([^']*)';/.exec(production);
assert(embedded,'jetons autonomes login/invitation absents');
const embeddedTokens=declarations(embedded[1]);
for(const [name,value] of Object.entries(rootTokens))if(name.startsWith('--sx-')&&!name.startsWith('--sx-mobile-'))assert.equal(embeddedTokens[name],value,'jeton inline divergent: '+name);
assert(production.includes('const standalonePageStyle = ')&&production.includes(':root{color-scheme: dark;'),'style autonome déclare ses jetons dans :root');
assert(production.includes("style-src 'sha256-"+String.fromCharCode(36)+"{standaloneStyleHash}'"),'CSP ne lie pas le style autonome à son empreinte');
const matrix=[];
for(let i=0;i<themeMatches.length;i++){
  const id=/data-v3-theme="([^"]+)"/.exec(themeMatches[i][1])[1];assert.equal(id,paletteIds[i],'ordre palette '+(i+1));
  const d=effectiveTheme(id);
  for(const role of roles)assert(role in d,id+': jeton requis absent '+role);
  for(const [alias,target] of Object.entries(aliases))assert.equal(d[alias],'var('+target+')',id+': alias '+alias);
  const surface=color(d['--sx-surface']),raised=color(d['--sx-raised']),ink=color(d['--sx-ink']),muted=color(d['--sx-muted']),accent=color(d['--sx-accent']),onAccent=color(d['--sx-on-accent']),ring=color(d['--sx-accent-line']);
  const values={textSurface:ratio(ink,surface),textRaised:ratio(ink,raised),mutedSurface:ratio(muted,surface),textAccent:ratio(onAccent,accent),activeLine:ratio(ring,surface),focusRing:ratio(ring,surface)};
  assert(values.textSurface>=4.5,id+': texte/surface '+round(values.textSurface)+' < 4.5');
  assert(values.textRaised>=4.5,id+': texte/levée '+round(values.textRaised)+' < 4.5');
  assert(values.mutedSurface>=4.5,id+': explicatif/surface '+round(values.mutedSurface)+' < 4.5');
  assert(values.textAccent>=4.5,id+': texte/accent '+round(values.textAccent)+' < 4.5');
  assert(values.activeLine>=3,id+': trait actif/surface '+round(values.activeLine)+' < 3');
  assert(values.focusRing>=3,id+': anneau/surface '+round(values.focusRing)+' < 3');
  matrix.push({palette:paletteNames[i],...Object.fromEntries(Object.entries(values).map(([k,v])=>[k,round(v)]))});
}
const cssFiles=['style.css','v3.css','ui-foundation.css','mobile-nav.css'];
for(const file of cssFiles){
 const css=readFileSync(file==='style.css'&&process.env.SOCLE_STYLE_FILE?process.env.SOCLE_STYLE_FILE:join(root,'web',file),'utf8');
 assert(!/(#[0-9a-f]{3,8}\b|rgba?\s*\()/i.test(css),'couleur littérale hors jetons dans '+file);
}
const allCss=cssFiles.map(f=>readFileSync(join(root,'web',f),'utf8')).join('\n')+'\n'+themes.replace(/--sx-[\w-]+\s*:\s*[^;{}]+;/g,'');
const defs=new Set([...tokens.matchAll(/(--(?:sx|v3)-[\w-]+)\s*:/g),...themes.matchAll(/(--(?:sx|v3)-[\w-]+)\s*:/g)].map(m=>m[1]));
const refs=new Set([...allCss.matchAll(/var\(\s*(--(?:sx|v3)-[\w-]+)/g)].map(m=>m[1]));
for(const ref of refs)assert(defs.has(ref),'jeton orphelin utilisé mais non défini: '+ref);
console.log('design-tokens-01: PASS palettes=15 aliases=11 orphan-tokens=0');
console.log('CONTRAST_MATRIX='+JSON.stringify(matrix));
