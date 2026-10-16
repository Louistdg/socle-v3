import assert from 'node:assert/strict';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){
  console.log('browser-stock-catalog-v2-01: SKIP hors Browser Gate');
  process.exit(0);
}

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const browser=await connectBrowser(base);
const tab=await browser.createSession(base);

async function viewport(width,height){
  await tab.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600,screenWidth:width,screenHeight:height});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:width<600,maxTouchPoints:width<600?5:1});
}

try{
  await tab.navigate(base);
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'catalog-login');
  assert.equal(login,204);
  await tab.reload();
  await waitForApp(tab,'local-owner');

  const setup=await tab.evaluate("(async()=>{const c=await serverJson('/api/stock-catalog');let root=(c.categories||[]).find(x=>!x.parentId&&x.name==='Isolation QA');if(!root){const x=await serverJson('/api/stock-catalog/categories',{method:'POST',body:JSON.stringify({name:'Isolation QA',parentId:null,sortOrder:900})});root={id:x.id,name:'Isolation QA'}}const c2=await serverJson('/api/stock-catalog');let child=(c2.categories||[]).find(x=>String(x.parentId||'')===String(root.id)&&x.name==='Panneaux QA');if(!child){const x=await serverJson('/api/stock-catalog/categories',{method:'POST',body:JSON.stringify({name:'Panneaux QA',parentId:root.id,sortOrder:10})});child={id:x.id,name:'Panneaux QA'}}const l=await serverJson('/api/stock-locations');let loc=(l.locations||[]).find(x=>x.name==='Dépôt Catalogue QA');if(!loc){const x=await serverJson('/api/stock-locations',{method:'POST',body:JSON.stringify({name:'Dépôt Catalogue QA',type:'warehouse'})});loc={id:x.id,name:'Dépôt Catalogue QA'}}const f=await serverJson('/api/field-data');let item=(f.stockItems||[]).find(x=>x.name==='Panneau PIR 140 QA');if(!item){const x=await serverJson('/api/stock-items',{method:'POST',body:JSON.stringify({reference:'',name:'Panneau PIR 140 QA',categoryId:root.id,subcategoryId:child.id,unit:'panneau',quantity:12,locationId:loc.id,minimum:15,supplier:'Négoce QA',supplierReference:'QA-PIR-140',barcode:'5410000999999',aliases:['PIR 140 QA','isolant QA'],operationKey:'browser-stock-catalog-create-01'})});item={id:x.id}}await loadServerFieldData({renderAfter:false});await loadStockCatalog({force:true,renderAfter:false});return{rootId:root.id,itemId:item.id}})()",'catalog-fixture');
  assert.ok(setup.rootId&&setup.itemId);

  const sizes=[[1440,1000,true],[430,844,false],[390,844,false],[375,667,false]];
  for(const size of sizes){
    const width=size[0],height=size[1],desktop=size[2];
    await viewport(width,height);
    await tab.evaluate("(()=>{stockCatalogQuery='';stockCatalogCategoryFilter='all';stockCatalogLocationFilter='all';stockCatalogLowOnly=false;navigate('stock');window.scrollTo(0,0);window.dispatchEvent(new Event('resize'));return true})()",'catalog-open-'+width);
    await waitFor(()=>tab.evaluate("Boolean(view==='stock'&&document.querySelector('.stock-catalog-shell')&&stockCatalogState==='ready')",'catalog-ready-'+width),'catalogue '+width,30000);

    const metrics=await tab.evaluate("(()=>{const d=document.querySelector('.stock-catalog-desktop'),m=document.querySelector('.stock-catalog-mobile'),t=document.querySelector('.stock-catalog-toolbar'),s=document.querySelector('.stock-catalog-search input');return{overflow:document.documentElement.scrollWidth>innerWidth+1,desktop:d?getComputedStyle(d).display:'missing',mobile:m?getComputedStyle(m).display:'missing',toolbar:t?.getBoundingClientRect().width||0,search:s?.getBoundingClientRect().height||0,categories:[...document.querySelectorAll('.stock-catalog-toolbar select')[0].options].map(o=>o.textContent)}})()",'catalog-metrics-'+width);
    assert.equal(metrics.overflow,false,'overflow '+width);
    assert.ok(metrics.toolbar<=width+1,'toolbar '+width);
    assert.ok(metrics.search>=(desktop?38:44),'search height '+width);
    assert.ok(metrics.categories.includes('Isolation QA'),'category option '+width);
    if(desktop){assert.notEqual(metrics.desktop,'none');assert.equal(metrics.mobile,'none');}
    else{assert.equal(metrics.desktop,'none');assert.notEqual(metrics.mobile,'none');}

    await tab.evaluate("(()=>{const i=document.querySelector('.stock-catalog-search input');const s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;s.call(i,'5410000999999');i.dispatchEvent(new Event('input',{bubbles:true}));return true})()",'catalog-search-'+width);
    await waitFor(()=>tab.evaluate("document.querySelector('#main')?.innerText.includes('Panneau PIR 140 QA')",'catalog-search-ready-'+width),'search '+width,10000);
    const filtered=await tab.evaluate("(()=>{const main=document.querySelector('#main');return{text:main.innerText,overflow:document.documentElement.scrollWidth>innerWidth+1,rows:main.querySelectorAll('.stock-catalog-desktop tbody tr').length,cards:main.querySelectorAll('.stock-catalog-mobile .stock-catalog-card').length}})()",'catalog-filtered-'+width);
    assert.match(filtered.text,/Panneau PIR 140 QA/);
    assert.match(filtered.text,/Isolation QA/);
    assert.match(filtered.text,/Stock bas/);
    assert.equal(filtered.overflow,false);
    if(desktop)assert.ok(filtered.rows>=1);else assert.ok(filtered.cards>=1);

    const filterExpr="(()=>{const s=[...document.querySelectorAll('.stock-catalog-toolbar select')][0];s.value="+JSON.stringify(setup.rootId)+";s.dispatchEvent(new Event('change',{bubbles:true}));return true})()";
    await tab.evaluate(filterExpr,'catalog-filter-'+width);
    await waitFor(()=>tab.evaluate("document.querySelector('#main')?.innerText.includes('Panneau PIR 140 QA')",'catalog-filter-ready-'+width),'filter '+width,10000);
  }

  console.log('BROWSER_STOCK_CATALOG_V2_01=PASS');
}finally{
  try{await tab.close()}finally{await browser.close()}
}
