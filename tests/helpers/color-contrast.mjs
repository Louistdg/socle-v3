export function parseColor(value){
  const color=String(value).trim();
  const hex=/^#([a-f\d]{3}|[a-f\d]{6})$/i.exec(color);
  if(hex){
    const full=hex[1].length===3?[...hex[1]].map(c=>c+c).join(''):hex[1];
    return [0,2,4].map(i=>parseInt(full.slice(i,i+2),16));
  }
  const rgb=/^rgba?\(([^)]+)\)$/i.exec(color);
  if(rgb){
    const channels=rgb[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if(channels.length!==3&&channels.length!==4)throw Error('Canaux RGB invalides: '+value);
    const result=channels.slice(0,3).map(c=>c.endsWith('%')?parseFloat(c)*255/100:Number(c));
    if(result.every(c=>Number.isFinite(c)&&c>=0&&c<=255))return result;
  }
  // Chromium serializes color-mix(in srgb, ...) using color(srgb ...).
  const srgb=/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+)?\)$/.exec(color);
  if(srgb){const result=srgb.slice(1).map(c=>Number(c)*255);if(result.every(c=>c>=0&&c<=255))return result;}
  throw Error('Couleur hex/rgb non reconnue: '+value);
}
export const rgbColor=value=>'rgb('+parseColor(value).map(Math.round).join(', ')+')';
export const luminance=value=>parseColor(value).map(c=>{
  const s=c/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
export function contrastRatio(foreground,background){
  const a=luminance(foreground),b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}
