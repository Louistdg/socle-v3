/* Appearance is a browser preference; it never changes business permissions. */
(()=>{'use strict';
const themes=[['atelier','Atelier','Clair et équilibré'],['ardoise','Ardoise','Bleu professionnel'],['terre','Sauge','Vert mousse, sombre et apaisant'],['nuit','Nuit','Confort dans la pénombre'],['graphite','Graphite','Sombre, doux et épuré'],['carmin','Carmin','Prune profond et corail vif'],['contraste','Contraste','Bleu nuit et jaune lumineux']];
const key='socle-v3.theme';let selected='atelier';
try{const saved=localStorage.getItem(key);if(themes.some(t=>t[0]===saved))selected=saved;}catch{}
function apply(id){selected=id;document.body.dataset.v3Theme=id;try{localStorage.setItem(key,id);}catch{}document.querySelectorAll('.v3-theme-choice').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.theme===id)));}
const layoutKey='socle-v3.mobile-layout';let mobileLayout='standard';
try{if(localStorage.getItem(layoutKey)==='wide')mobileLayout='wide';}catch{}
function applyLayout(mode){mobileLayout=mode==='wide'?'wide':'standard';document.body.dataset.mobileLayout=mobileLayout;try{localStorage.setItem(layoutKey,mobileLayout);}catch{}document.querySelectorAll('.v3-layout-choice').forEach(b=>{b.setAttribute('aria-checked',String(b.dataset.layout===mobileLayout));b.setAttribute('aria-pressed',String(b.dataset.layout===mobileLayout));});}
async function loadLayoutPreference(){if(typeof serverJson!=='function')return;try{const result=await serverJson('/api/me/preferences/dashboard/density');const value=result.preference?.value?.density;if(value==='wide'||value==='standard')applyLayout(value);}catch{}}
async function saveLayoutPreference(mode){applyLayout(mode);if(typeof serverJson!=='function')return;try{await serverJson('/api/me/preferences/dashboard/density',{method:'PUT',body:JSON.stringify({schemaVersion:1,value:{density:mobileLayout}})});}catch{}}
apply(selected);
document.addEventListener('DOMContentLoaded',()=>{
const header=document.querySelector('.header-right');if(!header)return;
const picker=document.createElement('div');picker.className='v3-theme-picker';
picker.innerHTML='<button class="v3-theme-button" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="v3-theme-menu">◐ <span>Apparence</span></button><div id="v3-theme-menu" class="v3-theme-menu" role="menu" aria-label="Apparence et affichage" hidden><p>Votre espace, vos couleurs</p>'+themes.map(([id,name,desc])=>'<button type="button" class="v3-theme-choice" role="menuitemradio" aria-checked="false" data-theme="'+id+'"><span class="v3-theme-swatch" data-palette="'+id+'" aria-hidden="true"></span><span><strong>'+name+'</strong><small>'+desc+'</small></span><span class="v3-theme-check" aria-hidden="true">✓</span></button>').join('')+'<div class="v3-layout-options" role="group" aria-label="Format d’affichage de l’application"><strong>Affichage de l’application</strong><button type="button" class="v3-layout-choice" role="radio" aria-checked="true" aria-pressed="true" data-layout="standard"><span>Vue par défaut</span><small>Taille normale</small></button><button type="button" class="v3-layout-choice" role="radio" aria-checked="false" aria-pressed="false" data-layout="wide"><span>Vue large</span><small>Tout l’écran dézoomé · 75 % · plus d’informations</small></button></div><small class="v3-theme-note">Thème et affichage mémorisés dans votre espace.</small></div>';
header.prepend(picker);const button=picker.querySelector('.v3-theme-button'),menu=picker.querySelector('[role=menu]'),choices=[...picker.querySelectorAll('.v3-theme-choice')];
function close(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
button.addEventListener('click',()=>{const opening=menu.hidden;menu.hidden=!opening;button.setAttribute('aria-expanded',String(opening));if(opening)choices.find(b=>b.dataset.theme===selected).focus();});
choices.forEach(b=>b.addEventListener('click',()=>{apply(b.dataset.theme);close(true);}));
picker.querySelectorAll('.v3-layout-choice').forEach(b=>b.addEventListener('click',()=>{void saveLayoutPreference(b.dataset.layout);close(true);}));
picker.addEventListener('keydown',e=>{if(e.key==='Escape'){close(true);e.preventDefault();}if(!menu.hidden&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();let i=choices.indexOf(document.activeElement);i=e.key==='Home'?0:e.key==='End'?choices.length-1:(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;choices[i].focus();}});
document.addEventListener('click',e=>{if(!picker.contains(e.target))close();});
document.addEventListener('focusin',e=>{if(!picker.contains(e.target))close();});apply(selected);applyLayout(mobileLayout);void loadLayoutPreference();
});})();
