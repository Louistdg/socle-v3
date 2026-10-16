import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../web/profile-avatar.js',import.meta.url),'utf8');
const person={id:'P-07',name:'Anthony Simon',initials:undefined};
let galleryPersonId='',saved=0,rendered=0,modalHtml='',denied=0;
const sandbox={
  console,
  queueMicrotask:()=>{},
  document:{addEventListener(){},querySelector(selector){return selector==='.socle-avatar-gallery'?{dataset:{personId:galleryPersonId}}:null}},
  globalThis:{socleAccessPreview:null},
  person,
  esc:value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
  getPerson:id=>String(id)===String(person.id)?person:null,
  requireField:()=>true,
  denyAccess:()=>{denied++;return false},
  canFieldAction:()=>true,
  scheduleSave:()=>{saved++},
  render:()=>{rendered++},
  modal:(_title,html)=>{modalHtml=html},
  closeModal(){},
  toast(){},
  people:[person],
  view:'people'
};
vm.runInNewContext(source,sandbox);

const catalogue=vm.runInContext('socleAvatarCatalogue',sandbox);
assert.equal(catalogue.length,36,'La galerie propose 36 personnages de base.');
assert.equal(new Set(catalogue.map(item=>item.id)).size,36,'Chaque personnage a un identifiant stable unique.');
assert.ok(catalogue.every(item=>/^classic-\d{2}$/.test(item.id)),'Les identifiants de la galerie respectent un format sûr.');
assert.equal(new Set(catalogue.map(item=>vm.runInContext(`socleAvatarCharacter('${item.id}')`,sandbox))).size,36,'Les 36 personnages ont des portraits distincts.');
assert.ok(catalogue.every(item=>!/casque|bonnet|playmobil|chantier/i.test(item.label)),'Les portraits par défaut gardent un style professionnel sans accessoire fantaisie.');
const defaultHtml=vm.runInContext('soclePersonAvatar(person)',sandbox);
assert.match(defaultHtml,/data-avatar-id="classic-\d{2}"/,'Sans sélection, le personnage attribué par défaut est stable.');
assert.ok(!defaultHtml.includes('undefined'),'Une personne sans initiales n’affiche plus undefined.');
assert.ok(!defaultHtml.includes('${'),'Le rendu SVG ne contient pas de gabarit non résolu.');
assert.ok(defaultHtml.indexOf('M10 64')<defaultHtml.indexOf('M20 25'),'Le vêtement est dessiné derrière le portrait.');

sandbox.openSoclePersonAvatarPicker(person.id);
assert.equal(modalHtml.match(/class="socle-avatar-choice/g)?.length,36,'Le dossier ouvre les 36 choix.');
assert.match(modalHtml,/data-person-id="P-07"/,'La galerie garde le rattachement à la bonne personne.');
galleryPersonId=person.id;
sandbox.selectSoclePersonAvatar('classic-15');
assert.equal(person.avatarId,'classic-15','Le choix est conservé sur la fiche du salarié.');
assert.equal(saved,1,'Le choix déclenche la sauvegarde du dossier.');
assert.equal(rendered,1,'Les affichages sont rafraîchis après le choix.');
assert.match(vm.runInContext('soclePersonAvatar(person)',sandbox),/data-avatar-id="classic-15"/,'La sélection apparaît sur le personnage.');

sandbox.globalThis.socleAccessPreview={roleCode:'WORKER'};
sandbox.selectSoclePersonAvatar('classic-02');
assert.equal(person.avatarId,'classic-15','Le mode test en lecture seule ne modifie pas la fiche.');
assert.equal(saved,1,'Aucune sauvegarde ne part depuis le mode test.');
assert.equal(denied,1,'La tentative en lecture seule est explicitement refusée.');

console.log('personnel-avatars-ui: PASS galerie, valeurs par défaut, sauvegarde et refus en lecture seule.');
