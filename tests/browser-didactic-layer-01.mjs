import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const PALETTE_SHORTCUT_KEY='k';
const forbiddenPurposeWords=['entité','payload','statut','token','api','http','json','base de données'];
const ownedDidacticRules=readFileSync(new URL('../web/ia-a-ui.css',import.meta.url),'utf8').split(/\r?\n/).filter(line=>/^\.ia-screen-purpose|^\.ia-command-|^@media\(max-width:640px\)\{\.ia-command/.test(line)).join('\n');
assert.doesNotMatch(ownedDidacticRules,/#(?:[\da-f]{3,8})\b|\brgb\s*\(|\bhsl\s*\(/i,'Les règles didactiques utilisent les jetons, sans couleur en dur');
assert.doesNotMatch(ownedDidacticRules,/!important/i,'Les règles didactiques ne masquent pas le socle avec !important');
const browser=await connectBrowser(base),tab=await browser.createSession(base);
async function key(value,modifiers=0){const codes={ArrowDown:40,ArrowUp:38,Enter:13,Escape:27,Tab:9,'?':191},code={ArrowDown:'ArrowDown',ArrowUp:'ArrowUp',Enter:'Enter',Escape:'Escape',Tab:'Tab','?':'Slash'}[value]||`Key${value.toUpperCase()}`,virtual=codes[value]||value.toUpperCase().charCodeAt(0);await tab.call('Input.dispatchKeyEvent',{type:'keyDown',key:value,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers});await tab.call('Input.dispatchKeyEvent',{type:'keyUp',key:value,code,windowsVirtualKeyCode:virtual,nativeVirtualKeyCode:virtual,modifiers})}
async function shortcut(){await key(PALETTE_SHORTCUT_KEY,2)}
async function type(value){await tab.call('Input.insertText',{text:value})}
async function openPalette(){await shortcut();await waitFor(()=>tab.evaluate(`Boolean(document.querySelector('#ia-command-dialog[open] #ia-command-search'))`,'didactic-palette-open',5000),'palette au clavier',5000)}
async function search(value){await tab.evaluate(`(()=>{const input=document.querySelector('#ia-command-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus()})()`,'didactic-clear-search');await type(value);await waitFor(()=>tab.evaluate(`document.querySelector('#ia-command-search')?.value===${JSON.stringify(value)}`,'didactic-search-value',5000),'saisie de recherche',5000)}
async function loginOwner(){await tab.navigate(base+'/');const status=await tab.evaluate(`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(response=>response.status)`,'didactic-owner-login');assert.equal(status,204);await tab.reload();await waitForApp(tab);await tab.evaluate(`navigate('home')`,'didactic-open-home');await waitFor(()=>tab.evaluate(`view==='home'&&document.querySelector('#main')?.hasAttribute('data-screen-purpose')`,'didactic-home-ready',5000),'accueil et intention présents',15000)}
try{
  await loginOwner();await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:900});
  const routes=await tab.evaluate(`SOCLE_NAVIGATION.entries.filter(entry=>['ROOT_MODULE','SUPPORT','SETTINGS'].includes(entry.type)).map(entry=>({route:entry.route,label:entry.label}))`,'didactic-root-routes');
  console.log('DIDACTIC_REGISTERED_ROOTS='+routes.length+' '+routes.map(item=>item.route).join(','));
  assert.ok(routes.length>=15,'Le registre contient au moins les quinze rubriques prévues');
  for(const item of routes){
    await tab.evaluate(`navigate(${JSON.stringify(item.route)})`,'didactic-navigate-'+item.route);
    await waitFor(()=>tab.evaluate(`view===${JSON.stringify(item.route)}&&document.querySelector('#main')?.dataset.view===${JSON.stringify(item.route)}`,'didactic-view-'+item.route,5000),'écran '+item.label,15000);
    if(process.env.SOCLE_DIDACTIC_REMOVE_PURPOSE===item.route)await tab.evaluate(`(()=>{const main=document.querySelector('#main');main.removeAttribute('data-screen-purpose');main.querySelector('.ia-screen-purpose')?.remove()})()`,'didactic-negative-remove-'+item.route);
    const screen=await tab.evaluate(`(()=>{const main=document.querySelector('#main');return{purpose:main?.getAttribute('data-screen-purpose')||'',line:main?.querySelector(':scope > .ia-screen-purpose')?.textContent||'',heading:main?.innerText?.slice(0,160)||''}})()`,'didactic-purpose-'+item.route);
    assert.ok(screen.purpose.trim().length>=20,`${item.route}: data-screen-purpose doit contenir au moins 20 caractères (reçu: ${JSON.stringify(screen.purpose)})`);
    assert.equal(screen.line,screen.purpose,`${item.route}: la phrase est visible en haut de l’écran`);
    const normalized=screen.purpose.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-BE');
    for(const word of forbiddenPurposeWords)assert.ok(!normalized.includes(word.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-BE')),`${item.route}: mot interdit « ${word} » dans la phrase`);
  }
  await tab.evaluate(`document.querySelector('#ia-command-trigger').focus()`,'didactic-focus-command-trigger');await shortcut();
  await waitFor(()=>tab.evaluate(`document.querySelector('#ia-command-dialog')?.open&&document.activeElement?.id==='ia-command-search'`,'didactic-keyboard-open',5000),'Ctrl/⌘+K ouvre et place le focus dans la recherche',5000);
  assert.equal(await tab.evaluate(`document.querySelectorAll('#ia-command-results [role="option"]').length`,'didactic-command-count'),routes.length,'La palette liste toutes les rubriques racines accessibles par rôle');
  await type('point');await waitFor(()=>tab.evaluate(`document.querySelector('#ia-command-option-0 strong')?.textContent==='Pointages'`,'didactic-point-result',5000),'point trouve Pointages',5000);
  await key('Enter');await waitFor(()=>tab.evaluate(`view==='timeEntries'`,'didactic-point-open',5000),'Entrée ouvre Pointages',15000);
  await tab.evaluate(`document.querySelector('#ia-command-trigger').focus()`,'didactic-restore-focus-source');await openPalette();await key('ArrowDown');await key('ArrowUp');
  assert.equal(await tab.evaluate(`document.querySelector('#ia-command-search').getAttribute('aria-activedescendant')`,'didactic-active-result'),'ia-command-option-0','Les flèches parcourent les rubriques et le résultat actif est annoncé');await key('Escape');
  assert.equal(await tab.evaluate(`document.activeElement?.id`,'didactic-focus-restored'),'ia-command-trigger','Échap rend le focus au déclencheur d’origine');
  await shortcut();await waitFor(()=>tab.evaluate(`Boolean(document.querySelector('#ia-command-search'))`,'didactic-accent-palette',5000),'seconde ouverture clavier',5000);await type('equipe');
  const accentSearch=await tab.evaluate(`({value:document.querySelector('#ia-command-search')?.value,results:[...document.querySelectorAll('#ia-command-results [role="option"] strong')].map(node=>node.textContent)})`,'didactic-accent-result');console.log('DIDACTIC_ACCENT_SEARCH='+JSON.stringify(accentSearch));assert.ok(accentSearch.results.includes('Personnel & équipes'),'equipe trouve Personnel & équipes sans accent');
  await tab.evaluate(`document.querySelector('#ia-command-search').value='';document.querySelector('#ia-command-search').dispatchEvent(new Event('input',{bubbles:true}))`,'didactic-no-results-query');await type('zzzz-introuvable');
  await waitFor(()=>tab.evaluate(`Boolean(document.querySelector('.ia-command-job-search'))`,'didactic-job-search-action',5000),'une recherche vide propose les chantiers',5000);
  await tab.evaluate(`document.querySelector('.ia-command-job-search').focus()`,'didactic-focus-job-action');await key('Enter');await waitFor(()=>tab.evaluate(`view==='jobs'`,'didactic-job-search-route',5000),'l’action de recherche ouvre les chantiers',15000);
  await tab.evaluate(`document.querySelector('#ia-command-trigger').focus()`,'didactic-help-focus-source');await key('?',8);await waitFor(()=>tab.evaluate(`document.querySelector('#ia-command-dialog')?.open&&document.querySelector('#ia-command-title')?.textContent==='Raccourcis clavier'`,'didactic-help-open',5000),'? ouvre la feuille des raccourcis',5000);
  const shortcuts=await tab.evaluate(`document.querySelector('.ia-command-help-list')?.innerText||''`,'didactic-help-shortcuts');
  assert.match(shortcuts,/Ctrl[\s\S]*K[\s\S]*Ouvrir les commandes/,'La feuille annonce le raccourci qui ouvre la palette');assert.match(shortcuts, /\?[\s\S]*Afficher cette aide/,'La feuille annonce son propre raccourci');assert.match(shortcuts,/Entrée[\s\S]*Parcourir, ouvrir et fermer/,'La feuille annonce les commandes réellement utilisables dans la palette');
  await key('Escape');assert.equal(await tab.evaluate(`document.activeElement?.id`,'didactic-help-focus'),'ia-command-trigger','La feuille se ferme et rend le focus');
  console.log('browser-didactic-layer-01: PASS (19 rubriques racines, navigation clavier, accents, focus, aide et absence de jargon)');
}finally{await tab.close();await browser.close()}
