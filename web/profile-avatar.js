'use strict';
const SOCLE_AVATAR_ENDPOINT='/api/profile/avatar';
let socleAvatarMeta={hasAvatar:false,avatarUrl:null,initials:'',displayName:''};

const socleAvatarBackdrops=['#dce9e5','#e1e6ee','#eee2d8','#e9e1e7','#e4e9dc','#dce6eb'];
const socleAvatarUniforms=[['#344b59','#d6e0e2'],['#315b61','#d7e2dc'],['#5b5062','#ded6cc'],['#42594a','#d9e0d3'],['#554c46','#e6dbce'],['#4d5a70','#d4deea']];
const socleAvatarSkins=['#f0c8a4','#dba980','#bd8061','#956049','#e8b996','#c99170'];
const socleAvatarHairs=['#302a28','#26313a','#5b4132','#95633f','#bba36e','#6b5157','#717b80','#3b302d'];
const socleAvatarHairLabels=['cheveux courts','raie latérale','boucles souples','cheveux longs','chignon bas','tresses','ondulations','coupe courte'];
const socleAvatarCatalogue=Array.from({length:36},(_,index)=>({
  id:'classic-'+String(index+1).padStart(2,'0'),
  label:'Profil '+String(index+1).padStart(2,'0')+' · '+socleAvatarHairLabels[index%8]+([4,10,16,22,28,34].includes(index)?' · barbe':[1,7,13,19,25,31].includes(index)?' · lunettes':''),
  skin:socleAvatarSkins[(index*5+Math.floor(index/6))%socleAvatarSkins.length],
  hair:index===23||index===26?'#8c9698':index===25?'#b99a5a':index===32?'#934b3d':socleAvatarHairs[(index*5+Math.floor(index/4))%socleAvatarHairs.length],
  bg:socleAvatarBackdrops[(index*5+Math.floor(index/6))%socleAvatarBackdrops.length],
  uniform:socleAvatarUniforms[index%6][0],accent:socleAvatarUniforms[index%6][1],style:index
}));
function socleAvatarHash(value){let hash=2166136261;for(const char of String(value||'SOCLE')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}return hash>>>0}
function socleAvatarDefinition(id){return socleAvatarCatalogue.find(item=>item.id===String(id))||socleAvatarCatalogue[0]}
function socleAvatarIdForPerson(person){return socleAvatarCatalogue.some(item=>item.id===person?.avatarId)?person.avatarId:socleAvatarCatalogue[socleAvatarHash(person?.id??person?.name)%socleAvatarCatalogue.length].id}
function socleAvatarCharacter(seed){
  const person=typeof seed==='object'&&seed?seed:null;
  const id=person?socleAvatarIdForPerson(person):(/^(classic-\d{2})$/.test(String(seed||''))?String(seed):'');
  const avatar=id?socleAvatarDefinition(id):socleAvatarCatalogue[socleAvatarHash(person?.id??seed)%socleAvatarCatalogue.length];
  const {skin,hair,bg,uniform,accent,style}=avatar;
  const beard=[14,15,16,26,34].includes(style);
  const glasses=[1,7,13,19,25,31].includes(style),hairStyle=style%8;
  const hairShapes=[
    `<path d="M18 26c0-12 6-19 14-19s14 7 14 19c-5-5-9-7-14-7s-9 2-14 7Z" fill="${hair}"/><path d="M31 9q6 5 8 10" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>`,
    `<path d="M18 25c0-12 6-18 14-18 8 0 14 6 14 18-5-5-9-8-14-8-6 0-10 3-14 8Z" fill="${hair}"/><path d="M26 9q8-3 15 3-7 1-12 6" fill="${hair}"/>`,
    `<path d="M17 26c-2-12 5-20 15-20 11 0 17 8 15 20l-4-3-2-7-5 5-7-5-5 7z" fill="${hair}"/><circle cx="20" cy="15" r="4" fill="${hair}"/><circle cx="27" cy="8" r="4" fill="${hair}"/><circle cx="37" cy="8" r="4" fill="${hair}"/><circle cx="44" cy="15" r="4" fill="${hair}"/>`,
    `<path d="M17 25c-2-12 5-19 15-19 10 0 17 7 15 19l-1 28-7 3-2-28-10-1-2 26-7-1z" fill="${hair}"/>`,
    `<circle cx="32" cy="8" r="6" fill="${hair}"/><path d="M18 25c0-12 6-19 14-19s14 7 14 19c-5-5-9-7-14-7s-9 2-14 7Z" fill="${hair}"/>`,
    `<path d="M17 25c0-12 6-19 15-19s15 7 15 19c-5-5-10-7-15-7s-10 2-15 7Z" fill="${hair}"/><path d="M18 28v19m28-19v19" stroke="${hair}" stroke-width="4" stroke-linecap="round"/><path d="M16 35q-3 3 0 6m32-6q3 3 0 6" fill="none" stroke="${accent}" stroke-width="1.5"/>`,
    `<path d="M17 25c-1-12 5-19 15-19 10 0 16 7 15 19-4-5-8-7-12-7-5 0-10 4-18 7Z" fill="${hair}"/><path d="M18 17q7-9 15-8m-13 12q8-4 14-10" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>`,
    `<path d="M18 25c0-11 6-17 14-17s14 6 14 17c-5-4-9-6-14-6s-9 2-14 6Z" fill="${hair}"/><path d="M20 17q5-7 11-7" fill="none" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>`
  ];
  const backHair=[3,4,5].includes(hairStyle)?`<path d="M19 24c-3 9-3 18-2 28l8 3 2-19zm26 0c3 9 3 18 2 28l-8 3-2-19z" fill="${hair}"/>`:'';
  const accessory=glasses?`<path d="M18 27h12m4 0h12" stroke="#35434a" stroke-width="1.5"/><rect x="19" y="24" width="11" height="8" rx="3.5" fill="none" stroke="#35434a" stroke-width="1.6"/><rect x="34" y="24" width="11" height="8" rx="3.5" fill="none" stroke="#35434a" stroke-width="1.6"/>`:'';
  const beardSvg=beard?`<path d="M21 32c1 8 5 13 11 13s10-5 11-13c-4 3-8 4-11 4s-7-1-11-4Z" fill="${hair}"/><path d="M26 39q6 3 12 0" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="1.2"/>`:'';
  const facial=`<path d="M24 25h5m6 0h5" stroke="#493a34" stroke-width="1.5" stroke-linecap="round"/><path d="M25 29h.5m13 0h.5" stroke="#302b2a" stroke-width="2.2" stroke-linecap="round"/><path d="M32 29v4" stroke="#ae7660" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/><path d="M28 36q4-1 8 0" fill="none" stroke="#875a4d" stroke-width="1.3" stroke-linecap="round"/>`;
  const torso=`<path d="M22 45 32 55 42 45" fill="${accent}"/><path d="M10 64c1-13 9-20 22-20s21 7 22 20" fill="${uniform}"/><path d="m22 45 10 10 10-10" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1.2"/><path d="M15 60q5-9 11-12m23 12q-5-9-11-12" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.4"/>`;
  const title=person?.name?`<title>${String(person.name).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</title>`:'';
  return `<svg class="socle-avatar-character" data-avatar-id="${avatar.id}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${title}<circle cx="32" cy="32" r="32" fill="${bg}"/><circle cx="32" cy="32" r="29.5" fill="none" stroke="#fff" stroke-opacity=".38"/>${torso}${backHair}<path d="M27 39h10v9H27z" fill="${skin}"/><circle cx="17" cy="31" r="2" fill="${skin}"/><circle cx="47" cy="31" r="2" fill="${skin}"/><path d="M20 25c0-10 5-16 12-16s12 6 12 16v7c0 8-5 13-12 13s-12-5-12-13z" fill="${skin}"/><path d="M23 18q9-7 18 0" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="2"/>${hairShapes[hairStyle]}${facial}${accessory}${beardSvg}</svg>`;
}
function soclePersonAvatar(person){return socleAvatarCharacter(person||'SOCLE')}
function socleAvatarGalleryHtml(selected='',personId=''){
  const id=String(personId||'').replace(/[^a-zA-Z0-9_-]/g,'');
  return `<div class="socle-avatar-gallery" data-person-id="${id}" role="group" aria-label="Choisir un personnage">${socleAvatarCatalogue.map(avatar=>`<button type="button" class="socle-avatar-choice${avatar.id===selected?' selected':''}" aria-label="${avatar.label}" aria-pressed="${avatar.id===selected?'true':'false'}" onclick="selectSoclePersonAvatar('${avatar.id}')">${socleAvatarCharacter(avatar.id)}<span>${avatar.label}</span></button>`).join('')}</div>`
}
function socleAvatarSeed(){
  const selected=document.querySelector('.personal-head .person-avatar')?.dataset.personId;
  if(selected)return (typeof people!=='undefined'&&people.find(person=>String(person.id)===String(selected)))||selected;
  const identity=globalThis.socleCurrentAccess?.personId||globalThis.socleCurrentAccess?.userId||globalThis.socleAuthenticatedAccess?.userId;
  const linked=typeof people!=='undefined'&&people.find(person=>String(person.id)===String(identity)||person.name===socleAvatarMeta.displayName);
  return linked||identity||socleAvatarMeta.displayName||socleAvatarMeta.initials||'socle';
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
    top.title='Photo de profil';top.setAttribute('role','button');top.setAttribute('tabindex','0');top.onclick=openSocleAvatarMenu;
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
      const button=document.createElement('button');button.type='button';button.className='link profile-avatar-edit';button.textContent=socleAvatarMeta.avatarUrl?'Modifier ma photo':'Ajouter une photo ou choisir un personnage';button.onclick=openSocleAvatarMenu;head.append(button);
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
  const person=socleAvatarSeed(),gallery=own&&person&&typeof person==='object'?`<h3>Personnages SOCLE</h3><p>Choisissez celui qui vous ressemble. La sélection est enregistrée dans la fiche de la personne.</p>${socleAvatarGalleryHtml(socleAvatarIdForPerson(person),person.id)}`:'';
  modal('Mon profil',`<div class="profile-avatar-modal"><div class="profile-avatar-preview">${socleAvatarMeta.avatarUrl?avatarHtml(socleAvatarMeta.avatarUrl,socleAvatarMeta.displayName):socleAvatarPlaceholder(person)}</div>${gallery}<div class="profile-avatar-photo"><p>Vous préférez une vraie photo ?</p><div class="modal-actions"><button class="btn primary" type="button" onclick="chooseSocleAvatar()">Choisir une photo</button>${socleAvatarMeta.avatarUrl?'<button class="btn danger" type="button" onclick="removeSocleAvatar()">Supprimer la photo</button>':''}</div></div></div>`);
}
function openSoclePersonAvatarPicker(id){
  if(typeof requireField==='function'&&!requireField('managePeople'))return;
  if(globalThis.socleAccessPreview)return typeof denyAccess==='function'?denyAccess('Le mode test est en lecture seule.'):false;
  const person=typeof people!=='undefined'&&people.find(item=>String(item.id)===String(id));if(!person)return;
  modal('Choisir un personnage',`<div class="socle-avatar-picker"><p>Quel personnage représente ${esc(person.name)} ?</p>${socleAvatarGalleryHtml(socleAvatarIdForPerson(person),person.id)}</div>`);
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
  if(typeof toast==='function')toast(`Personnage « ${valid.label} » enregistré.`);
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
if(showPersonDossierBeforeAvatar)showPersonDossier=function(id){showPersonDossierBeforeAvatar(id);const person=typeof people!=='undefined'&&people.find(item=>String(item.id)===String(id)),root=document.querySelector('#modalbody .modal-inner');if(!person||!root||typeof canFieldAction!=='function'||!canFieldAction('managePeople')||globalThis.socleAccessPreview)return;const argument=typeof id==='number'?String(id):`'${jsString(String(id))}'`;root.insertAdjacentHTML('afterbegin',`<section class="person-avatar-management"><div>${soclePersonAvatar(person)}</div><span><strong>Personnage de la fiche</strong><small>Visible dans les équipes, le personnel et les listes.</small></span><button class="btn" type="button" onclick="openSoclePersonAvatarPicker(${argument})">Changer</button></section>`)};
if(typeof render==='function'){const renderBeforeProfileAvatar=render;render=function(){const result=renderBeforeProfileAvatar();queueMicrotask(applySocleProfileAvatar);return result}}
document.addEventListener('DOMContentLoaded',()=>{loadSocleAvatarMeta();queueMicrotask(applySocleProfileAvatar)});
