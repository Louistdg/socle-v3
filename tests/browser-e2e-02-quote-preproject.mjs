import assert from 'node:assert/strict';
import {connectBrowser,waitForApp,waitFor} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){
  console.log('browser-e2e-02-quote-preproject: SKIP hors Browser Gate');
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
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'e2e02-login');
  assert.equal(login,204);
  await tab.reload();await waitForApp(tab,'local-owner');

  const setup=await tab.evaluate(`(async()=>{
    const list=await serverJson('/api/customers?limit=250');
    let customer=(list.customers||[]).find(item=>item.companyName==='Client E2E-02 Browser');
    if(!customer){
      customer=(await serverJson('/api/customers',{method:'POST',body:JSON.stringify({
        type:'company',companyName:'Client E2E-02 Browser',street:'Rue Browser 2',
        postalCode:'5000',city:'Namur',country:'BE',paymentTermsDays:30
      })})).customer;
    }
    await e2e02EnsureCustomers();
    globalThis.e2e02BrowserCustomerId=customer.id;
    return {customerId:customer.id,jobsCount:jobs.length,jobsSnapshot:JSON.stringify(jobs)};
  })()`,'e2e02-setup');
  assert.ok(setup.customerId);

  for(const [width,height] of [[1440,1000],[430,844],[390,844],[375,667]]){
    await viewport(width,height);
    await tab.evaluate(`(()=>{navigate('quotes');window.scrollTo(0,0);quoteForm('','',e2e02BrowserCustomerId);return true})()`,'e2e02-open-'+width);
    await waitFor(()=>tab.evaluate("Boolean(document.querySelector('form[data-e2e02-preproject=true]'))",'e2e02-form-ready-'+width),'quote preproject form '+width,15000);
    const metrics=await tab.evaluate(`(()=>{
      const form=document.querySelector('form[data-e2e02-preproject=true]');
      const customer=form.querySelector('[name=customerId]');
      const project=form.querySelector('[name=job]');
      const save=form.querySelector('button.primary');
      const modal=document.querySelector('#modal');
      return {
        customer:customer?.value||'',project:project?.value||'',
        projectRequired:Boolean(project?.required),newProjectFields:Boolean(form.querySelector('.new-job-fields')),
        overflow:document.documentElement.scrollWidth>innerWidth+1,
        modalWidth:modal?.getBoundingClientRect().width||0,
        formWidth:form?.getBoundingClientRect().width||0,
        saveHeight:save?.getBoundingClientRect().height||0,
        text:form.innerText
      };
    })()`,'e2e02-metrics-'+width);
    assert.equal(metrics.customer,setup.customerId,'client préselectionné '+width);
    assert.equal(metrics.project,'','chantier facultatif '+width);
    assert.equal(metrics.projectRequired,false,'chantier non requis '+width);
    assert.equal(metrics.newProjectFields,false,'aucune création chantier depuis le devis '+width);
    assert.equal(metrics.overflow,false,'aucun overflow '+width);
    assert.ok(metrics.modalWidth<=width+1,'modal tient dans '+width);
    assert.ok(metrics.formWidth<=metrics.modalWidth+1,'formulaire tient dans modal '+width);
    assert.match(metrics.text,/conversion chantier sera une étape séparée/i);
    if(width<600)assert.ok(metrics.saveHeight>=44,'cible tactile enregistrer '+width);
    await tab.evaluate("closeModal()",'e2e02-close-'+width);
  }

  await viewport(390,844);
  await tab.evaluate("quoteForm('','',e2e02BrowserCustomerId)",'e2e02-create-open');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('form[data-e2e02-preproject=true]'))",'e2e02-create-ready'),'create form',10000);
  const submitProbe=await tab.evaluate(`(()=>{
    const form=document.querySelector('form[data-e2e02-preproject=true]');
    form.querySelector('[name=title]').value='Devis Browser E2E-02';
    form.querySelector('[name=clientAddress]').value='Rue du futur chantier 99, Namur';
    form.querySelector('[name=label]').value='Couverture pré-chantier';
    form.querySelector('[name=description]').value='Preuve Browser Gate';
    form.querySelector('[name=qty]').value='10';
    form.querySelector('[name=unit]').value='m²';
    form.querySelector('[name=price]').value='100';
    form.querySelector('[name=vat]').value='21';
    const invalid=[...form.elements].filter(el=>typeof el.checkValidity==='function'&&!el.checkValidity()).map(el=>({name:el.name||el.tagName,value:el.value||'',message:el.validationMessage||''}));
    const valid=form.checkValidity();
    if(valid)form.requestSubmit();
    return {valid,invalid,handlerType:typeof e2e02SaveQuote,canAdd:canModuleAction('quotes','add'),onsubmit:form.getAttribute('onsubmit')||''};
  })()`,'e2e02-submit');
  assert.equal(submitProbe.valid,true,'formulaire HTML valide avant submit: '+JSON.stringify(submitProbe.invalid));
  assert.equal(submitProbe.handlerType,'function','handler E2E-02 disponible');
  assert.equal(submitProbe.canAdd,true,'permission UI quotes.add disponible');

  await new Promise(resolve=>setTimeout(resolve,500));
  const submitState=await tab.evaluate(`(async()=>{
    const form=document.querySelector('form[data-e2e02-preproject=true]');
    const error=form?.querySelector('#quoteError')?.textContent?.trim()||'';
    let serverQuote=null,serverError='';
    try{
      const response=await serverJson('/api/quotes');
      serverQuote=(response.quotes||[]).find(q=>q.title==='Devis Browser E2E-02')||null;
    }catch(e){serverError=e?.message||String(e)}
    return {
      formOpen:Boolean(form),
      modalOpen:Boolean(document.querySelector('#modal')?.open),
      error,
      local:quotes.some(q=>q.title==='Devis Browser E2E-02'),
      serverQuote,
      serverError,
      buttonDisabled:Boolean(form?.querySelector('button.primary')?.disabled),
      canAdd:canModuleAction('quotes','add'),
      handlerType:typeof e2e02SaveQuote
    };
  })()`,'e2e02-submit-state');
  console.log('E2E02_SUBMIT_STATE='+JSON.stringify(submitState));
  if(submitState.error)throw Error('E2E-02 submit UI error: '+submitState.error+' | serverQuote='+JSON.stringify(submitState.serverQuote)+' | serverError='+submitState.serverError);
  assert.equal(submitState.serverError,'','lecture serveur après submit');
  assert.ok(submitState.serverQuote?.id,'devis réellement créé côté serveur après submit');
  assert.equal(submitState.modalOpen,false,'modal fermé après création');
  await waitFor(()=>tab.evaluate("!document.querySelector('#modal')?.open&&quotes.some(q=>q.title==='Devis Browser E2E-02')",'e2e02-created'),'preproject quote created and modal closed',15000);
  const created=await tab.evaluate(`(async()=>{
    const response=await serverJson('/api/quotes');
    const quote=(response.quotes||[]).find(q=>q.title==='Devis Browser E2E-02');
    return {quote,jobsCount:jobs.length,jobsSnapshot:JSON.stringify(jobs)};
  })()`,'e2e02-created-proof');
  assert.ok(created.quote?.id,'devis créé côté serveur');
  assert.equal(created.quote.projectId,null,'aucun projectId');
  assert.equal(created.quote.customerId,setup.customerId,'customer canonique');
  assert.equal(created.quote.client,'Client E2E-02 Browser','libellé canonique');
  assert.equal(created.jobsCount,setup.jobsCount,'aucun chantier local créé');
  assert.equal(created.jobsSnapshot,setup.jobsSnapshot,'liste chantiers inchangée');

  await tab.evaluate(`iaCUpdateQuoteStatus(${JSON.stringify(created.quote.id)},'Accepté')`,'e2e02-accept');
  await waitFor(()=>tab.evaluate(`serverJson('/api/quotes/${encodeURIComponent(created.quote.id)}').then(r=>r.quote?.status==='accepted'&&r.quote?.projectId===null)`,'e2e02-accepted-ready'),'accepted preproject',15000);
  const accepted=await tab.evaluate(`serverJson('/api/quotes/${encodeURIComponent(created.quote.id)}').then(r=>r.quote)`,'e2e02-accepted-proof');
  assert.equal(accepted.status,'accepted');
  assert.equal(accepted.projectId,null,'acceptation reste sans chantier');

  await tab.evaluate(`(async()=>{navigate('contacts');if(iaCServerDirectoryState!=='ready')await iaCLoadServerDirectory();render();return true})()`,'e2e02-client-view');
  await waitFor(()=>tab.evaluate("Boolean([...document.querySelectorAll('.ia-c-server-directory button')].find(button=>button.textContent.trim()==='Créer un devis'))",'e2e02-client-action-ready'),'client quote action',15000);
  const clientAction=await tab.evaluate(`(()=>{
    const rows=[...document.querySelectorAll('.ia-c-server-directory .detail-row')];
    const row=rows.find(item=>item.innerText.includes('Client E2E-02 Browser'));
    const button=[...(row?.querySelectorAll('button')||[])].find(item=>item.textContent.trim()==='Créer un devis');
    if(!button)return false;button.click();return true;
  })()`,'e2e02-client-action');
  assert.equal(clientAction,true,'action créer devis depuis client');
  await waitFor(()=>tab.evaluate("Boolean(document.querySelector('form[data-e2e02-preproject=true]'))",'e2e02-client-form'),'client quote form',10000);
  const preselected=await tab.evaluate("document.querySelector('form[data-e2e02-preproject=true] [name=customerId]')?.value||''",'e2e02-client-preselected');
  assert.equal(preselected,setup.customerId,'action client préselectionne le customer canonique');
  await tab.evaluate("closeModal()");

  console.log('BROWSER_E2E_02_QUOTE_PREPROJECT=PASS — 1440/430/390/375, client canonique, aucun chantier, acceptation pré-chantier');
}finally{
  try{await tab.close()}finally{await browser.close()}
}
