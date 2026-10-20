'use strict';
const SOCLE_AVATAR_ENDPOINT='/api/profile/avatar';
let socleAvatarMeta={hasAvatar:false,avatarUrl:null,initials:'',displayName:''};

// Stable ids preserve existing selections; the presentation is now a monogram.
const socleAvatarPalettes=[['Pétrole','#244c50','#e5f4ed'],['Sauge','#d9e6d9','#26483b'],['Ardoise','#324654','#eaf0f3'],['Sable','#e9dfcb','#514431'],['Prune','#51404e','#f4e9ef'],['Graphite','#303c3c','#e7efeb']];
const socleAvatarCatalogue=Array.from({length:36},(_,index)=>({id:'classic-'+String(index+1).padStart(2,'0'),label:socleAvatarPalettes[index%6][0]+' '+(Math.floor(index/6)+1),bg:socleAvatarPalettes[index%6][1],ink:socleAvatarPalettes[index%6][2],style:Math.floor(index/6)}));
function socleAvatarEscape(value){return String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function socleAvatarInitials(person){const name=String(person?.displayName||person?.name||'').trim();if(!name)return String(person?.initials||'').slice(0,2).toLocaleUpperCase('fr');const words=name.split(/\s+/).filter(w=>/[\p{L}\p{N}]/u.test(w));return (words.length>1?Array.from(words[0])[0]+Array.from(words.at(-1))[0]:Array.from(words[0]||'').slice(0,2).join('')).toLocaleUpperCase('fr')}
function socleAvatarHash(value){let hash=2166136261;for(const char of String(value||'SOCLE')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return hash>>>0}
function socleAvatarDefinition(id){return socleAvatarCatalogue.find(item=>item.id===String(id))||socleAvatarCatalogue[0]}
function socleAvatarIdForPerson(person){return socleAvatarCatalogue.some(item=>item.id===person?.avatarId)?person.avatarId:socleAvatarCatalogue[socleAvatarHash(person?.id??person?.name)%socleAvatarCatalogue.length].id}
function socleAvatarCharacter(seed){
  const person=typeof seed==='object'&&seed?seed:null;
  const id=person?socleAvatarIdForPerson(person):(/^classic-\d{2}$/.test(String(seed||''))?String(seed):'');
  const avatar=id?socleAvatarDefinition(id):socleAvatarCatalogue[socleAvatarHash(seed)%socleAvatarCatalogue.length];
  const initials=socleAvatarInitials(person),radius=[14,20,32,10,16,24][avatar.style];
  const mark=initials?`<text x="32" y="33" text-anchor="middle" dominant-baseline="central" fill="${avatar.ink}" font-family="system-ui,sans-serif" font-size="23" font-weight="650" letter-spacing="-1">${socleAvatarEscape(initials)}</text>`:`<circle cx="32" cy="25" r="7" fill="none" stroke="${avatar.ink}" stroke-width="2"/><path d="M19 47c0-8 5-12 13-12s13 4 13 12" fill="none" stroke="${avatar.ink}" stroke-width="2" stroke-linecap="round"/>`;
  return `<svg class="socle-avatar-character socle-avatar-monogram" data-avatar-id="${avatar.id}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect x="1" y="1" width="62" height="62" rx="${radius}" fill="${avatar.bg}"/><rect x="3" y="3" width="58" height="58" rx="${Math.max(8,radius-2)}" fill="none" stroke="${avatar.ink}" stroke-opacity=".18"/>${mark}</svg>`;
}
function soclePersonAvatar(person){return socleAvatarCharacter(person||'SOCLE')}
function socleAvatarGalleryHtml(selected='',personId=''){
  const id=String(personId||'').replace(/[^a-zA-Z0-9_-]/g,'');
  const choices=socleAvatarCatalogue.slice(0,6);if(selected&&!choices.some(avatar=>avatar.id===selected))choices.unshift(socleAvatarDefinition(selected));
  return `<div class="socle-avatar-gallery" data-person-id="${id}" role="group" aria-label="Choisir un monogramme">${choices.map(avatar=>`<button type="button" class="socle-avatar-choice${avatar.id===selected?' selected':''}" aria-label="${avatar.label}" aria-pressed="${avatar.id===selected?'true':'false'}" onclick="selectSoclePersonAvatar('${avatar.id}')">${socleAvatarCharacter({...(typeof people!=='undefined'&&people.find(p=>String(p.id)===String(personId))||{name:socleAvatarMeta.displayName}),avatarId:avatar.id})}<span>${avatar.label}</span></button>`).join('')}</div>`
}
function socleAvatarSeed(){
  const selected=document.querySelector('.personal-head .person-avatar')?.dataset.personId;
  if(selected)return (typeof people!=='undefined'&&people.find(person=>String(person.id)===String(selected)))||selected;
  const identity=globalThis.socleCurrentAccess?.personId||globalThis.socleCurrentAccess?.userId||globalThis.socleAuthenticatedAccess?.userId;
  const linked=typeof people!=='undefined'&&people.find(person=>String(person.id)===String(identity)||person.name===socleAvatarMeta.displayName);
  return linked||{id:identity||'socle',name:socleAvatarMeta.displayName,initials:socleAvatarMeta.initials};
}
function socleAvatarPlaceholder(seed=socleAvatarSeed()){return socleAvatarCharacter(seed)}
function socleAvatarIsOwnProfile(){
  const selected=document.querySelector('.personal-head .person-avatar')?.dataset.personId;
  const identity=globalThis.socleCurrentAccess?.personId||globalThis.socleCurrentAccess?.userId||globalThis.socleAuthenticatedAccess?.userId;
  return Boolean(identity&&selected&&String(identity)===String(selected));
}

function avatarHtml(url,label='Photo de profil'){
  const safe=String(url||'').replace(/"/g,'&quot;');
  const alt=String(label||'Photo de profil').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  return '<img class="socle-profile-avatar-image" src="'+safe+'" alt="'+alt+'">';
}
function applySocleProfileAvatar(){
  const top=document.querySelector('.header-right .avatar');
  if(top){
    if(!top.dataset.avatarFallback)top.dataset.avatarFallback=top.textContent.trim()||socleAvatarMeta.initials||'';
    const linked=socleAvatarSeed();
    top.classList.toggle('has-photo',Boolean(socleAvatarMeta.avatarUrl));
    top.innerHTML=socleAvatarMeta.avatarUrl?avatarHtml(socleAvatarMeta.avatarUrl,socleAvatarMeta.displayName):socleAvatarCharacter(linked);
    top.title='Mon profil';top.setAttribute('aria-label','Mon profil'+(socleAvatarMeta.displayName?' · '+socleAvatarMeta.displayName:''));top.setAttribute('role','button');top.setAttribute('tabindex','0');top.onclick=openSocleAvatarMenu;
    top.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openSocleAvatarMenu()}};
  }
  if(typeof view!=='undefined'&&view==='personal'){
    const avatar=document.querySelector('.personal-head .person-avatar');
    if(avatar){
      const own=socleAvatarIsOwnProfile(),person=typeof people!=='undefined'&&people.find(item=>String(item.id)===String(avatar.dataset.personId)),photo=own?socleAvatarMeta.avatarUrl:null;
      avatar.classList.toggle('has-photo',Boolean(photo));avatar.innerHTML=photo?avatarHtml(photo,socleAvatarMeta.displayName):soclePersonAvatar(person||avatar.dataset.personId);
      avatar.title=own?'Modifier ma photo':'Avatar de profil';
      if(own){avatar.setAttribute('role','button');avatar.setAttribute('tabindex','0');avatar.onclick=openSocleAvatarMenu;avatar.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openSocleAvatarMenu()}}}
      else{avatar.removeAttribute('role');avatar.removeAttribute('tabindex');avatar.onclick=null;avatar.onkeydown=null}
    }
    const head=document.querySelector('.personal-head > div');
    if(head&&socleAvatarIsOwnProfile()&&!head.querySelector('.profile-avatar-edit')){
      const button=document.createElement('button');button.type='button';button.className='link profile-avatar-edit';button.textContent=socleAvatarMeta.avatarUrl?'Modifier ma photo':'Ajouter une photo ou choisir un monogramme';button.onclick=openSocleAvatarMenu;head.append(button);
    }
    if(head&&!socleAvatarIsOwnProfile())head.querySelector('.profile-avatar-edit')?.remove();
  }
}
async function loadSocleAvatarMeta(){
  if(!globalThis.SOCLE_PRODUCTION)return;
  try{const response=await fetch('/api/profile/avatar/meta',{headers:{accept:'application/json'}});if(!response.ok)return;socleAvatarMeta=await response.json();applySocleProfileAvatar()}catch{}
}
function openSocleAvatarMenu(){
  if(typeof modal!=='function')return chooseSocleAvatar();
  const own=typeof canFieldAction==='function'&&canFieldAction('managePeople')&&!globalThis.socleAccessPreview;
  const person=socleAvatarSeed(),gallery=own&&person&&typeof person==='object'?`<h3>Votre signature</h3><p>Choisissez une couleur et une forme pour vos initiales. La sélection est enregistrée dans la fiche de la personne.</p>${socleAvatarGalleryHtml(socleAvatarIdForPerson(person),person.id)}`:'';
  modal('Mon profil',`<div class="profile-avatar-modal"><div class="profile-avatar-preview">${socleAvatarMeta.avatarUrl?avatarHtml(socleAvatarMeta.avatarUrl,socleAvatarMeta.displayName):socleAvatarPlaceholder(person)}</div>${gallery}<div class="profile-avatar-photo"><p>Vous préférez une vraie photo ?</p><div class="modal-actions"><button class="btn primary" type="button" onclick="chooseSocleAvatar()">Choisir une photo</button>${socleAvatarMeta.avatarUrl?'<button class="btn danger" type="button" onclick="removeSocleAvatar()">Supprimer la photo</button>':''}</div></div></div>`);
}
function openSoclePersonAvatarPicker(id){
  if(typeof requireField==='function'&&!requireField('managePeople'))return;
  if(globalThis.socleAccessPreview)return typeof denyAccess==='function'?denyAccess('Le mode test est en lecture seule.'):false;
  const person=typeof people!=='undefined'&&people.find(item=>String(item.id)===String(id));if(!person)return;
  modal('Choisir un monogramme',`<div class="socle-avatar-picker"><p>Choisissez le monogramme de ${esc(person.name)}.</p>${socleAvatarGalleryHtml(socleAvatarIdForPerson(person),person.id)}</div>`);
}
function selectSoclePersonAvatar(avatarId){
  if(typeof requireField==='function'&&!requireField('managePeople'))return;
  if(globalThis.socleAccessPreview)return typeof denyAccess==='function'?denyAccess('Le mode test est en lecture seule.'):false;
  const valid=socleAvatarCatalogue.find(avatar=>avatar.id===String(avatarId));
  const personId=document.querySelector('.socle-avatar-gallery')?.dataset.personId;
  const person=personId&&typeof people!=='undefined'?people.find(item=>String(item.id)===String(personId)):socleAvatarSeed();
  if(!valid||!person||typeof person!=='object')return;
  person.avatarId=valid.id;
  if(typeof scheduleSave==='function')scheduleSave();
  if(typeof closeModal==='function')closeModal();
  if(typeof render==='function')render();
  if(typeof toast==='function')toast(`Monogramme « ${valid.label} » enregistré.`);
}
async function chooseSocleAvatar(){
  let input=document.querySelector('#socleProfileAvatarInput');
  if(!input){input=document.createElement('input');input.id='socleProfileAvatarInput';input.type='file';input.accept='image/jpeg,image/png,image/webp,image/*';input.hidden=true;input.addEventListener('change',event=>uploadSocleAvatar(event.target.files?.[0]).finally(()=>{event.target.value=''}));document.body.append(input)}
  input.click();
}
async function normalizedAvatarBlob(file){
  if(!file||file.size<=0)throw Error('Choisissez une image.');if(file.size>12*1024*1024)throw Error('La photo source est trop volumineuse.');
  const url=URL.createObjectURL(file);
  try{const image=new Image();image.src=url;await image.decode();const side=Math.min(image.naturalWidth,image.naturalHeight);if(!side)throw Error('Image illisible.');const sx=Math.max(0,(image.naturalWidth-side)/2),sy=Math.max(0,(image.naturalHeight-side)/2),canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const context=canvas.getContext('2d',{alpha:false});context.fillStyle='#fff';context.fillRect(0,0,512,512);context.drawImage(image,sx,sy,side,side,0,0,512,512);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.86));if(!blob)throw Error('Impossible de préparer la photo.');return blob}finally{URL.revokeObjectURL(url)}
}
async function uploadSocleAvatar(file){
  try{const blob=await normalizedAvatarBlob(file),response=await fetch(SOCLE_AVATAR_ENDPOINT,{method:'PUT',headers:{'content-type':blob.type},body:blob}),result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Enregistrement impossible.');socleAvatarMeta={...socleAvatarMeta,hasAvatar:true,avatarUrl:result.avatarUrl+'&t='+Date.now()};if(typeof closeModal==='function')closeModal();applySocleProfileAvatar();if(typeof toast==='function')toast('Photo de profil mise à jour.');await loadSocleAvatarMeta()}catch(error){if(typeof toast==='function')toast(error.message||'Photo impossible à enregistrer.');else alert(error.message)}
}
async function removeSocleAvatar(){
  try{const response=await fetch(SOCLE_AVATAR_ENDPOINT,{method:'DELETE'}),result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'Suppression impossible.');socleAvatarMeta={...socleAvatarMeta,hasAvatar:false,avatarUrl:null};if(typeof closeModal==='function')closeModal();applySocleProfileAvatar();if(typeof toast==='function')toast('Photo de profil supprimée.')}catch(error){if(typeof toast==='function')toast(error.message||'Suppression impossible.');else alert(error.message)}
}
const showPersonDossierBeforeAvatar=typeof showPersonDossier==='function'?showPersonDossier:null;
if(showPersonDossierBeforeAvatar)showPersonDossier=function(id){showPersonDossierBeforeAvatar(id);const person=typeof people!=='undefined'&&people.find(item=>String(item.id)===String(id)),root=document.querySelector('#modalbody .modal-inner');if(!person||!root||typeof canFieldAction!=='function'||!canFieldAction('managePeople')||globalThis.socleAccessPreview)return;const argument=typeof id==='number'?String(id):`'${jsString(String(id))}'`;root.insertAdjacentHTML('afterbegin',`<section class="person-avatar-management"><div>${soclePersonAvatar(person)}</div><span><strong>Monogramme de la fiche</strong><small>Visible dans les équipes, le personnel et les listes.</small></span><button class="btn" type="button" onclick="openSoclePersonAvatarPicker(${argument})">Changer</button></section>`)};
if(typeof render==='function'){const renderBeforeProfileAvatar=render;render=function(){const result=renderBeforeProfileAvatar();queueMicrotask(applySocleProfileAvatar);return result}}
document.addEventListener('DOMContentLoaded',()=>{loadSocleAvatarMeta();queueMicrotask(applySocleProfileAvatar)});
