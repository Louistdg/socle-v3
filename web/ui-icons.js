/* Icônes SVG communes. Aucun caractère Unicode dans les nouveaux composants. */
(function(){
'use strict';
var paths={
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7M17 14.5c2.6.6 4.5 2.9 4.5 5.5"/>',
  briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18"/>',
  message:'<path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h5"/>',
  check:'<path d="m4 12 5 5L20 6"/>',
  cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.5 11h11L21 7H6"/>',
  box:'<path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  tool:'<path d="M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-3z"/>',
  file:'<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  euro:'<path d="M17 5a7 7 0 1 0 0 14"/><path d="M4 10h9M4 14h8"/>',
  shield:'<path d="M12 3 4 6v6c0 5 3.4 8 8 9 4.6-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  chevron:'<path d="m7 10 5 5 5-5"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  command:'<path d="M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z"/>'
};
function sprite(){
  if(document.getElementById('sx-icon-sprite'))return;
  var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.id='sx-icon-sprite';svg.setAttribute('aria-hidden','true');svg.style.cssText='position:absolute;width:0;height:0;overflow:hidden';
  var symbols=Object.keys(paths).map(function(name){
    return '<symbol id="sx-i-'+name+'" viewBox="0 0 24 24">'+paths[name]+'</symbol>';
  }).join('');
  svg.innerHTML=symbols;document.body.prepend(svg);
}
function icon(name,extra){
  var key=String(name||'chevron');
  if(!paths[key])key='chevron';
  return '<svg class="sx-icon '+(extra||'')+'" aria-hidden="true" focusable="false"><use href="#sx-i-'+key+'"></use></svg>';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sprite,{once:true});else sprite();
globalThis.sxIcon=icon;
})();
