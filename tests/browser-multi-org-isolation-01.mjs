import assert from 'node:assert/strict';
import { connectBrowser, waitForApp } from './helpers/browser-cdp.mjs';

const base = String(process.env.SOCLE_TEST_URL || 'http://127.0.0.1:4281').replace(/\/$/, '');
const browser = await connectBrowser(base);
let tab;
try {
  tab = await browser.createSession(base);
  await tab.navigate(base);
  assert.equal(await tab.evaluate("fetch('/__local-test/logout',{method:'POST'}).then(r=>r.status)",'logout'),204);
  assert.equal(await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'owner@multi-org.test'})}).then(r=>r.status)",'login'),204);
  await tab.reload();
  await waitForApp(tab,'multi-org-owner');

  const initial = await tab.evaluate(`(async()=>{
    const [orgResponse]=await Promise.all([fetch('/api/organizations',{cache:'no-store'})]);
    const organizations=await orgResponse.json();
    const stateResponse=await fetch('/api/state',{headers:{'x-socle-organization-id':organizations.activeOrganizationId},cache:'no-store'});
    return {orgs:organizations,state:await stateResponse.json(),active:localStorage.getItem('socle.activeOrganizationId')};
  })()`,'initial-tenant');
  assert.deepEqual(initial.orgs.organizations.map(item=>item.id),['org-batinova-iae-2026-10-01']);
  assert.equal(initial.state.state.company.name,'BATINOVA-STATE-ONLY');

  let faytId='';
  for (const width of [1440,390]) {
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600,screenWidth:width,screenHeight:900});
    const layout=await tab.evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth})','layout-'+width);
    assert.equal(layout.width,width);
    assert.equal(layout.overflow,false,`La page de création ne déborde pas à ${width}px`);

    if(width===1440){
    const creationButton=await tab.evaluate(`(()=>{
      const buttons=[...document.querySelectorAll('button')];
      const match=buttons.find(button=>/^(?:\\+\\s*)?(?:Créer|Ajouter|Nouvelle) (?:une )?(entreprise|organisation)$/i.test(button.innerText.trim()));
      if(!match)throw Error('organization-create-button-not-found');
      match.click();return true;
    })()`,'open-create-'+width);
    assert.equal(creationButton,true);
    await tab.evaluate(`(()=>{
      const input=document.querySelector('[name="organizationName"],#organizationName,[data-testid="organization-name"]')||[...document.querySelectorAll('input')].find(item=>/entreprise|organisation/i.test(item.getAttribute('aria-label')||item.placeholder||''));
      if(!input)throw Error('organization-name-input-not-found');
      const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,'Menuiserie Fayt');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      const form=input.closest('form');const submit=form?.querySelector('button[type="submit"]')||[...document.querySelectorAll('button')].find(button=>/^Créer (l’entreprise|l'entreprise|l’organisation|l'organisation)$/i.test(button.innerText.trim()));
      if(!submit)throw Error('organization-create-submit-not-found');submit.click();return true;
    })()`,'submit-create-'+width);

    const created=await tab.evaluate(`(async()=>{
      const deadline=Date.now()+8000;
      while(Date.now()<deadline){const response=await fetch('/api/organizations',{cache:'no-store'});if(response.ok){const data=await response.json(),fayt=data.organizations.find(item=>item.name==='Menuiserie Fayt');if(fayt)return {data,fayt}}await new Promise(resolve=>setTimeout(resolve,100))}
      throw Error('created-organization-not-visible');
    })()`,'wait-created-'+width);
    assert.ok(created.fayt.id);
    assert.deepEqual(created.data.organizations.map(item=>item.id).sort(),['org-batinova-iae-2026-10-01',created.fayt.id].sort(),'Le même OWNER reçoit les deux organisations');
    assert.equal(created.data.activeOrganizationId,'org-batinova-iae-2026-10-01','La création conserve BatiNova comme tenant actif');

    const faytEmpty=await tab.evaluate(`(async(id)=>{
      const [stateResponse,peopleResponse,teamResponse]=await Promise.all([
        fetch('/api/state',{headers:{'x-socle-organization-id':id},cache:'no-store'}),
        fetch('/api/hr/people',{headers:{'x-socle-organization-id':id},cache:'no-store'}),
        fetch('/api/hr/teams',{headers:{'x-socle-organization-id':id},cache:'no-store'})
      ]);
      return {state:await stateResponse.json(),people:await peopleResponse.json(),teams:await teamResponse.json()};
    })(${JSON.stringify(created.fayt.id)})`,'fayt-empty');
    assert.equal(faytEmpty.state.state,null,'Fayt ne reçoit aucun workspace BatiNova');
    assert.deepEqual(faytEmpty.people.people,[],'Fayt ne reçoit aucun employé BatiNova');
    assert.deepEqual(faytEmpty.teams.teams,[],'Fayt ne reçoit aucune équipe BatiNova');
    faytId=created.fayt.id;
    } else {
      const fayt=await tab.evaluate(`fetch('/api/organizations',{cache:'no-store'}).then(response=>response.json()).then(data=>data.organizations.find(item=>item.name==='Menuiserie Fayt')?.id||'')`,'find-fayt-mobile');
      assert.ok(fayt,'Fayt reste disponible après passage au format mobile');
      faytId=fayt;
      const mobileForm=await tab.evaluate(`(()=>{
        const trigger=document.querySelector('.organization-mobile-trigger');if(!trigger)throw Error('mobile-organization-trigger-not-found');trigger.click();
        const button=document.querySelector('.organization-add');if(!button){const label=document.querySelector('#organizationLabel'),choices=label?.querySelector('.organization-choices');throw Error('mobile-owner-create-button-not-found:'+JSON.stringify({label:label?.innerText,trigger:trigger.outerHTML,choices:choices?.outerHTML,activeId:globalThis.activeSocleOrganizationId}))}
        const buttonRect=button.getBoundingClientRect();if(buttonRect.width<=0||buttonRect.height<44)throw Error('mobile-owner-create-button-not-visible:'+JSON.stringify({rect:{width:buttonRect.width,height:buttonRect.height},style:{display:getComputedStyle(button).display,visibility:getComputedStyle(button).visibility},choices:button.parentElement?.outerHTML}));
        button.click();
        const form=document.querySelector('#organizationCreateForm'),input=form?.querySelector('[name="organizationName"]'),submit=form?.querySelector('button[type="submit"]');
        const formRect=form?.getBoundingClientRect();
        return {visible:Boolean(form&&!form.hidden&&formRect&&formRect.width>0&&formRect.height>0),menuExpanded:trigger.getAttribute('aria-expanded'),width:document.documentElement.scrollWidth,viewport:innerWidth,inputHeight:input?.getBoundingClientRect().height||0,submitHeight:submit?.getBoundingClientRect().height||0};
      })()`,'mobile-create-form');
      assert.equal(mobileForm.visible,true,'Le formulaire s’ouvre aussi sur mobile après ouverture du menu compact');
      assert.equal(mobileForm.menuExpanded,'true','Le menu entreprise reste ouvert pendant le formulaire de création');
      assert.ok(mobileForm.width<=mobileForm.viewport,'Le formulaire ne déborde pas horizontalement à 390px');
      assert.ok(mobileForm.inputHeight>=44&&mobileForm.submitHeight>=44,'Champs et action ont une cible tactile de 44px minimum');
      await tab.evaluate(`document.querySelector('.organization-add')?.click()`,'close-mobile-create-form');
    }

    for (const [nextName,expectedId,expectedMarker] of [
      ['Menuiserie Fayt',faytId,'FAYT'],
      ['BatiNova — fixture QA','org-batinova-iae-2026-10-01','BATINOVA'],
    ]) {
      await tab.evaluate(`(()=>{
        if(${width}<600){
          const trigger=document.querySelector('.organization-mobile-trigger');if(!trigger)throw Error('organization-mobile-trigger-not-found');
          if(trigger.getAttribute('aria-expanded')!=='true')trigger.click();
        }
        const button=[...document.querySelectorAll('.organization-choice')].find(item=>item.innerText.trim()===${JSON.stringify(nextName)});
        const rect=button?.getBoundingClientRect();
        if(!button||(${width}<600&&(rect.width<=0||rect.height<44)))throw Error('organization-choice-not-found:'+${JSON.stringify(nextName)});
        button.click();return true;
      })()`,'switch-'+nextName+'-'+width).catch(error=>{if(!/execution context|context was destroyed|no execution context/i.test(String(error)))throw error});
      await new Promise(resolve=>setTimeout(resolve,500));
      try{await waitForApp(tab,'multi-org-owner')}catch(error){const diagnosis=await tab.evaluate(`({url:location.href,readyState:document.readyState,storageReady:typeof storageReady==='undefined'?null:storageReady,user:globalThis.socleCurrentAccess?.userId||null,tenant:globalThis.socleCurrentOrganizationId||null,main:document.querySelector('#main')?.innerText?.slice(0,400)||'',nav:document.querySelector('#nav')?.innerText?.slice(0,200)||''})`,'tenant-load-diagnostic').catch(()=>null);throw Error(`${error.message}; tenant diagnostic=${JSON.stringify(diagnosis)}`)}
      const active=await tab.evaluate(`(async()=>{
        const state=await serverJson('/api/state');
        if(state.state?.company?.name==='BATINOVA-STATE-ONLY')navigate('jobs');
        if(typeof syncSocleDesktopNavigation==='function')syncSocleDesktopNavigation();
        const contract=SOCLE_NAVIGATION.desktopEntries().map(entry=>entry.route);
        const desktopNav=[...document.querySelectorAll('#nav button[data-nav-route]')].map(button=>button.dataset.navRoute);
        let bottom=[],more=[];
        if(innerWidth<600){
          window.dispatchEvent(new Event('resize'));
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          bottom=[...document.querySelectorAll('#socleMobileNav button[data-mobile-route]')].map(button=>button.dataset.mobileRoute);
          const toggle=document.querySelector('#socleMobileNav [data-mobile-menu-toggle]');
          toggle?.click();
          await new Promise(resolve=>requestAnimationFrame(resolve));
          more=[...document.querySelectorAll('#socleMobileMoreDialog button[data-mobile-route]')].map(button=>button.dataset.mobileRoute);
          document.querySelector('#socleMobileMoreDialog')?.close();
        }
        const entry=SOCLE_NAVIGATION.item(String(view));
        const activeRootAllowed=!entry||entry.type==='INTERNAL_VIEW'||SOCLE_NAVIGATION.allowed(entry.route);
        return {id:activeSocleOrganizationId,stored:localStorage.getItem('socle.activeOrganizationId'),tenant:state.organizationId,company:state.state?.company?.name||'',state:JSON.stringify(state.state),label:document.querySelector('.organization-current')?.innerText||'',main:document.querySelector('#main')?.innerText||'',scrollWidth:document.documentElement.scrollWidth,width:innerWidth,contract,desktopNav,bottom,more,activeRootAllowed,activeView:String(view)};
      })()`,'post-switch-'+nextName+'-'+width);
      assert.equal(active.id,expectedId);
      assert.equal(active.stored,expectedId);
      assert.equal(active.tenant,expectedId);
      assert.equal(active.label,nextName,'Le nom du tenant actif suit la sélection');
      assert.equal(active.width,width);
      assert.ok(active.scrollWidth<=width,`Pas d’overflow après bascule à ${width}px`);
      assert.deepEqual(active.desktopNav,active.contract,'Le menu desktop est recalculé depuis le registre après bascule '+nextName+' '+width);
      assert.equal(active.activeRootAllowed,true,'Aucune route racine interdite ne reste active après bascule '+nextName+' '+width+' · '+active.activeView);
      if(width<600)assert.deepEqual([...new Set([...active.bottom,...active.more])].sort(),[...active.contract].sort(),'Le menu mobile est recalculé sans permission stale après bascule '+nextName);
      if(expectedMarker==='BATINOVA'){assert.equal(active.company,'BATINOVA-STATE-ONLY','Le retour restaure le tenant BatiNova et son cache');assert.equal(active.state,JSON.stringify(initial.state.state),'Le retour restitue exactement le snapshot BatiNova initial');assert.match(active.main,/BATINOVA-JOB-ONLY/,'La vue Chantiers rend le contenu du tenant revenu');}
      else assert.doesNotMatch(active.main,/BATINOVA-(STATE|JOB|PERSON|TEAM|CLIENT|SUPPLIER|QUOTE|STOCK|ORDER|DOCUMENT|ASSET|INVOICE|MESSAGE|TASK)-ONLY/i,'Aucun contenu BatiNova ne reste visible dans Fayt');
    }
  }

  const forged=await tab.evaluate(`fetch('/api/state',{headers:{'x-socle-organization-id':'org-forged-not-authorized'}}).then(response=>response.status)`,'forged-tenant');
  assert.equal(forged,403,'Le navigateur OWNER reçoit 403 pour un tenant forgé');
  console.log('browser-multi-org-isolation-01: PASS création UI, bascule A→B→A desktop/390px, données et cache tenant');
} finally {
  try { if(tab) await tab.close(); } finally { await browser.close(); }
}
