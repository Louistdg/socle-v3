import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const artifacts=resolve(process.env.SOCLE_ATTENTION_ARTIFACTS||'tests/artifacts/attention');
const browser=await connectBrowser(base),tab=await browser.createSession(base);
const fixture={today:'2026-10-18',checkedAt:'2026-10-18T12:00:00Z',invoicesReady:true,fieldReportsAvailable:true,
  purchaseOrders:[
    {id:'late',number:'BC-RETARD',supplierId:'supplier-1',status:'commandée',expectedDate:'2026-10-15',lines:[{quantity:4,received:1}]},
    {id:'today',number:'BC-AUJOURD-HUI',supplierId:'supplier-2',status:'commandée',expectedDate:'2026-10-18',lines:[{quantity:1,received:0}]},
    {id:'future',number:'BC-FUTURE',supplierId:'supplier-3',status:'commandée',expectedDate:'2026-10-22',lines:[{quantity:1,received:0}]},
    {id:'received',number:'BC-RECU',supplierId:'supplier-4',status:'commandée',expectedDate:'2026-10-10',lines:[{quantity:1,received:1}]}
  ],
  invoices:[
    {id:'unmatched',supplier_id:'unmatched-supplier',supplier_reference:'FACTURE-SANS-COMMANDE'},
    {id:'matched',supplier_id:'supplier-1',supplier_reference:'FACTURE-SANS-BL'}
  ],
  jobs:[
    {id:'active',name:'Chantier actif',phase:'En cours',timeEntries:[{date:'2026-10-17'}]},
    {id:'done',name:'Chantier terminé',phase:'Terminé',timeEntries:[]},
    {id:'archived',name:'Chantier archivé',phase:'En cours',archivedAt:'2026-10-01',timeEntries:[]}
  ],
  fieldReports:[{id:'report-1',jobId:'active',type:'issue',text:'Fuite observée',createdAt:'2026-10-18T08:00:00Z'},{id:'report-progress',jobId:'active',type:'progress',text:'Avancement',createdAt:'2026-10-18T09:00:00Z'},{id:'report-delivery',jobId:'active',type:'delivery',text:'Livraison',createdAt:'2026-10-18T10:00:00Z'}],subcontractors:[]};

async function key(value){const code=value==='Enter'?13:9;if(value==='Enter')await tab.call('Input.dispatchKeyEvent',{type:'rawKeyDown',key:value,code:value,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});else await tab.call('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});if(value==='Enter')await tab.call('Input.dispatchKeyEvent',{type:'char',key:value,text:'\r',windowsVirtualKeyCode:code,nativeVirtualKeyCode:code});await tab.call('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code})}
async function capture(name){const shot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});writeFileSync(resolve(artifacts,name),Buffer.from(shot.data,'base64'));console.log('ATTENTION_CAPTURE='+resolve(artifacts,name))}
try{
  await tab.navigate(base+'/');
  const login=await tab.evaluate(`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(response=>response.status)`,'attention-owner-login');
  assert.equal(login,204);await tab.reload();await waitForApp(tab);await tab.evaluate(`navigate('home')`,'attention-open-home');
  await waitFor(()=>tab.evaluate(`view==='home'&&typeof iaAAttentionBuild==='function'`,'attention-home-ready',5000),'accueil direction disponible',15000);
  await waitFor(()=>tab.evaluate(`iaAAttentionHomeReady()`,'attention-home-async-ready',5000),'chargements asynchrones de l’accueil terminés',15000);
  const mounted=await tab.evaluate(`(()=>{const main=document.querySelector('#main'),card=main?.querySelector('.ia-attention');return{role:iaARoleCode(),cards:main?.querySelectorAll('.ia-attention').length||0,previous:card?.previousElementSibling?.className||''}})()`,'attention-mounted-card');
  assert.equal(mounted.role,'OWNER');assert.equal(mounted.cards,1,'Une seule carte est montée sur l’accueil direction');
  assert.match(mounted.previous,/ia-role-head|v3-intro/,'La carte suit l’introduction de l’accueil, avant les autres sections');
  await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:900});
  const result=await tab.evaluate(`(()=>{const model=iaAAttentionBuild(${JSON.stringify(fixture)});return{model,html:iaAAttentionRender(model)}})()`,'attention-fixture-build');
  const titles=result.model.items.map(item=>item.title).join('\n');
  assert.match(titles,/BC-RETARD/);assert.doesNotMatch(titles,/BC-AUJOURD-HUI|BC-FUTURE/,'La date du jour et la date future ne déclenchent pas un retard');
  assert.equal(result.model.items.length,4,'Le scénario de référence contient exactement quatre lignes');
  assert.match(titles,/Facture à vérifier/);assert.doesNotMatch(titles,/FACTURE-SANS-COMMANDE.*en retard/i);
  assert.match(titles,/Facture à rapprocher/);assert.doesNotMatch(titles,/Chantier terminé|Chantier archivé/);
  assert.equal(result.model.items.filter(item=>item.category==='reports').length,1,'Une relève issue est remontée');
  const temporal=await tab.evaluate(`iaAAttentionBuild(${JSON.stringify({today:fixture.today,checkedAt:fixture.checkedAt,invoicesReady:true,fieldReportsAvailable:true,timeEntries:[{projectId:'job-1',projectName:'Atelier',correction:{status:'pending',requestedAt:'2026-10-15T12:00:00Z'}},{projectId:'job-1',correction:{status:'pending',requestedAt:'2026-10-16T12:00:00Z'}}],jobs:[{id:'silent-old',name:'Chantier inactif',phase:'En cours',timeEntries:[{date:'2026-10-09'}]},{id:'done-old',name:'Terminé',phase:'Terminé',timeEntries:[{date:'2026-10-01'}]}],fieldReports:[]})})`,'attention-aging-rules');assert.equal(temporal.items.filter(item=>item.category==='hours').length,1,'Seules les corrections de plus de deux jours sont signalées');assert.equal(temporal.items.filter(item=>item.category==='silent').length,1,'Le chantier actif est signalé après huit jours, le chantier terminé est exclu');assert.match(temporal.items.find(item=>item.category==='silent').title,/9 jours/);
  const countText=result.html.match(/>(\d+) choses à traiter</)?.[1];assert.equal(Number(countText),result.model.items.length,'Le compteur correspond aux lignes');
  const unknown=await tab.evaluate(`iaAAttentionBuild(${JSON.stringify({today:fixture.today,checkedAt:fixture.checkedAt,invoicesReady:true,fieldReportsAvailable:true,purchaseOrders:[{id:'date-absente',number:'BC-SANS-DATE',status:'commandée'}]})}).items`,'attention-unknown');
  assert.equal(unknown.length,1);assert.match(unknown[0].title,/Je ne sais pas/);assert.match(unknown[0].detail,/Date de livraison prévue absente/);
  const missingDocs=await tab.evaluate(`iaAAttentionBuild(${JSON.stringify({today:fixture.today,checkedAt:fixture.checkedAt,invoicesReady:true,fieldReportsAvailable:true,subcontractors:[{id:'sub-1',name:'Sous-traitant'}],subcontractorRequirementsAvailable:false})}).items`,'attention-unknown-documents');assert.ok(missingDocs.some(item=>/Je ne sais pas/.test(item.title)&&/documents attendus/.test(item.detail)),'Les pièces non définies ne sont pas inventées');
  const absentReports=await tab.evaluate(`iaAAttentionBuild(${JSON.stringify({today:fixture.today,checkedAt:fixture.checkedAt,jobs:[{id:'a',name:'Chantier A',phase:'En cours'},{id:'b',name:'Chantier B',phase:'En cours'}]})})`,'attention-absent-reports');assert.equal(absentReports.categories.find(item=>item.id==='reports').available,false,'La catégorie T3 reste absente si fieldReports est absent');assert.equal(absentReports.items.length,1);assert.match(absentReports.items[0].title,/Je ne sais pas/);assert.match(absentReports.items[0].title,/2 chantiers/,'Une donnée T3 absente est résumée sans répétition');
  const empty=await tab.evaluate(`iaAAttentionRender(iaAAttentionBuild({today:${JSON.stringify(fixture.today)},checkedAt:${JSON.stringify(fixture.checkedAt)},invoicesReady:true,fieldReportsAvailable:true,fieldReports:[]}))`,'attention-empty-html');
  assert.match(empty,/Rien à traiter/);assert.match(empty,/Dernier contrôle/);assert.match(empty,/\d{2}:\d{2}/);assert.match(empty,/Aucune relève à consulter/,'fieldReports vide affiche son état vide');
  await tab.evaluate(`document.querySelectorAll('.ia-attention').forEach(node=>node.remove());document.querySelector('#main').insertAdjacentHTML('afterbegin',iaAAttentionRender(iaAAttentionBuild(${JSON.stringify(fixture)})))`,'attention-insert-card');
  const visual=await tab.evaluate(`(()=>({heading:document.querySelector('.ia-attention h2')?.textContent,rows:[...document.querySelectorAll('.ia-attention-row')].map(row=>({text:row.innerText,height:row.getBoundingClientRect().height})),guides:document.querySelectorAll('.ia-attention-guides p').length,scrollWidth:document.documentElement.scrollWidth,viewport:innerWidth}))()`,'attention-visual-check');
  assert.equal(visual.heading,'4 choses à traiter');assert.equal(visual.rows.length,4);assert.equal(visual.guides,6);assert.ok(visual.rows.every(row=>row.height<=34.5),'Chaque ligne fait au plus 34 px au bureau');assert.ok(visual.scrollWidth<=visual.viewport,'La carte ne déborde pas');
  mkdirSync(artifacts,{recursive:true});await capture('attention-quatre-lignes.png');
  await tab.evaluate(`document.querySelector('.ia-attention').outerHTML=${JSON.stringify(empty)}`,'attention-empty-card');
  const emptyView=await tab.evaluate(`({text:document.querySelector('.ia-attention-empty')?.innerText||'',count:document.querySelector('.ia-attention h2')?.innerText||''})`,'attention-empty-proof');assert.equal(emptyView.count,'0 choses à traiter');assert.match(emptyView.text,/Rien à traiter[\s\S]*Dernier contrôle[\s\S]*\d{2}:\d{2}/);await capture('attention-vide.png');
  await tab.evaluate(`iaAAttentionFilter='all';document.querySelector('.ia-attention').outerHTML=iaAAttentionRender(iaAAttentionBuild(${JSON.stringify(fixture)}));document.querySelector('.ia-attention-filter select').value='orders';iaAAttentionSetFilter('orders')`,'attention-filter');
  const filtered=await tab.evaluate(`({selected:document.querySelector('.ia-attention-filter select')?.value,heading:document.querySelector('.ia-attention h2')?.textContent,rows:[...document.querySelectorAll('.ia-attention-row')].map(row=>row.innerText)})`,'attention-filter-proof');assert.equal(filtered.selected,'orders');assert.equal(filtered.rows.length,1);assert.equal(filtered.heading,'1 chose à traiter');assert.match(filtered.rows[0],/BC-RETARD/);await capture('attention-filtre-commandes.png');
  await tab.evaluate(`navigate=route=>{globalThis.__attentionActivated=route};document.querySelector('.ia-attention-filter select')?.focus()`,'attention-keyboard-start');
  let focus=null,guideSeen=false;
  for(let step=0;step<4;step++){
    await key('Tab');
    const current=await tab.evaluate(`({tag:document.activeElement?.tagName,className:document.activeElement?.className,action:document.activeElement?.getAttribute('onclick')||'',text:document.activeElement?.textContent||''})`,'attention-keyboard-step');
    if(current.tag==='SUMMARY'&&/Comment ces vérifications/.test(current.text))guideSeen=true;
    if(/ia-attention-action/.test(current.className)){focus=current;break}
  }
  assert.ok(guideSeen,'Le résumé des vérifications est atteignable au clavier');
  assert.ok(focus,'La ligne d’action est atteignable au clavier');assert.match(focus.className,/ia-attention-action/,'Tab parcourt le filtre puis la ligne d’action');assert.match(focus.action,/navigate/);await key('Enter');
  const activated=await tab.evaluate(`globalThis.__attentionActivated||''`,'attention-keyboard-activation');assert.equal(activated,'purchases','Entrée active l’action de la ligne');
  console.log('browser-attention-01: PASS (date limite, factures, chantiers clos, état vide, compteur, filtre, clavier et donnée manquante)');
}finally{await tab.close();await browser.close()}
