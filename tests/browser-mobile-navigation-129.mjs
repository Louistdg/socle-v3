import assert from 'node:assert/strict';
import {connectBrowser,waitForApp} from './helpers/browser-cdp.mjs';

if(!process.env.SOCLE_CDP_URL){console.log('browser-mobile-navigation-129: SKIP hors Browser Gate');process.exit(0)}

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base),sessions=[];

async function session(email,role){
  const tab=await browser.createSession(base);sessions.push(tab);
  await tab.navigate(base);
  const login=await tab.evaluate(`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)}})}).then(response=>response.status)`,'login:'+email);
  assert.equal(login,204,'Connexion locale '+role);
  await tab.reload();
  await waitForApp(tab);
  return tab;
}

async function tap(tab,selector){
  const point=await tab.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw Error('Cible tactile absente: '+${JSON.stringify(selector)});const rect=node.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`,'touch-target:'+selector);
  await tab.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
  await tab.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

async function metrics(tab,role,width){
  await tab.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:844});
  await tab.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  return tab.evaluate(`(async()=>{
    window.dispatchEvent(new Event('resize'));
    navigate('home');
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const nav=document.querySelector('#socleMobileNav');
    const old=document.querySelector('#nav');
    const buttons=[...nav.querySelectorAll('button')].map(button=>({label:button.querySelector('span:last-child')?.textContent.trim()||button.textContent.trim().replace(/\\s+/g,' '),route:button.dataset.mobileRoute||'',active:button.classList.contains('active')||['page','location'].includes(button.getAttribute('aria-current'))}));
    const rect=nav.getBoundingClientRect();
    const menuToggle=nav.querySelector('[data-mobile-menu-toggle]');
    const header=document.querySelector('.topbar'),themeButton=document.querySelector('.v3-theme-button'),simBadge=document.querySelector('.header-right .simulation-badge');
    const logoutProbe=document.createElement('form');logoutProbe.action='/auth/logout';document.querySelector('.header-right')?.appendChild(logoutProbe);const logoutDisplay=getComputedStyle(logoutProbe).display;logoutProbe.remove();
    const homePortals=[...document.querySelectorAll('#main .ia-home-portal-links a')].map(link=>link.textContent.replace(/↗/g,'').trim());
    const result={buttons,oldDisplay:getComputedStyle(old).display,position:getComputedStyle(nav).position,bottomGap:Math.round(window.innerHeight-rect.bottom),overflow:document.documentElement.scrollWidth>window.innerWidth,bodyMobile:document.body.dataset.mobileNav||'',role:${JSON.stringify(role)},width:${JSON.stringify(width)},menuAvailable:Boolean(menuToggle),menuTarget:menuToggle?Math.round(menuToggle.getBoundingClientRect().height):0,headerHeight:Math.round(header?.getBoundingClientRect().height||0),themeHeaderVisible:Boolean(themeButton&&getComputedStyle(themeButton).display!=='none'&&themeButton.getBoundingClientRect().width>0),simulationBadgeVisible:Boolean(simBadge&&getComputedStyle(simBadge).display!=='none'&&simBadge.getBoundingClientRect().width>0),logoutHeaderDisplay:logoutDisplay,homePortals};
    if(${JSON.stringify(role)}==='WORKER'||${JSON.stringify(role)}==='OWNER'){
      navigate('personal');
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const subtitle=document.querySelector('#main .personal-head h1 + span')?.textContent.trim()||'';
      const mainText=document.querySelector('#main')?.innerText||'';
      const personalLinks=[...document.querySelectorAll('#main .personal-official-links a')].filter(node=>getComputedStyle(node).display!=='none'&&!node.closest('[hidden]'));
      const companyLinks=[...document.querySelectorAll('#main .personal-company-links a')].filter(node=>getComputedStyle(node).display!=='none'&&!node.closest('[hidden]'));
      result.personal={
        subtitle,
        themeCount:document.querySelectorAll('#main [data-mobile-theme]').length,
        moreCount:document.querySelectorAll('#main .socle-mobile-more-grid button').length,
        hasPayCopy:/CP\\s*124|€\\/?h|bar[eè]me|cat\\.?\\s*(iv|v|vi)/i.test(mainText),
        personalPortalCount:personalLinks.length,
        companyPortalCount:companyLinks.length,
        hasEssentialCopy:/Vos portails essentiels/i.test(mainText),
        headerThemeVisible:Boolean(document.querySelector('.v3-theme-button')&&getComputedStyle(document.querySelector('.v3-theme-button')).display!=='none')
      };
      if(${JSON.stringify(role)}==='OWNER'){
        const trigger=document.querySelector('.v3-theme-button'),before=document.body.dataset.v3Theme||'';
        trigger.click();await new Promise(resolve=>requestAnimationFrame(resolve));
        const menu=document.querySelector('#v3-theme-menu'),choices=[...menu.querySelectorAll('[data-theme]')],target=choices.find(choice=>choice.dataset.theme!==before)||choices[0];
        result.themeMenu={open:!menu.hidden,count:choices.length,ids:choices.map(choice=>choice.dataset.theme)};
        target?.click();await new Promise(resolve=>requestAnimationFrame(resolve));
        result.themeMenu.changed=document.body.dataset.v3Theme!==before;
        result.themeMenu.persisted=localStorage.getItem('socle-v3.theme')===document.body.dataset.v3Theme;
      }
    }
    if(${JSON.stringify(width)}===390){
      const toggle=document.querySelector('#socleMobileNav [data-mobile-menu-toggle]');
      const touchTarget=toggle.getBoundingClientRect();
      await new Promise(resolve=>setTimeout(resolve,20));
      result.menuTouchTarget={width:Math.round(touchTarget.width),height:Math.round(touchTarget.height)};
      return result;
    }
    return result;
  })()`,'mobile-nav:'+role+':'+width);
}

try{
  const cases=[
    ['direction@batinova.example','OWNER',['Accueil','Chantiers','Planning','Docs','Moi']],
    ['david.leclercq@batinova.example','TEAM_LEAD',['Accueil','Chantiers','Planning','Docs','Moi']],
    ['anthony.simon@batinova.example','WORKER',['Accueil','Chantiers','Planning','Docs','Moi']],
    ['batxl.accounting@simulation.invalid','ACCOUNTING',['Accueil','Finance','Docs']]
  ];
  for(const [email,role,expected] of cases){
    const tab=await session(email,role);
    for(const width of [375,390,430]){
      const out=await metrics(tab,role,width);
      console.log('MOBILE_NAV_'+role+'_'+width+'='+JSON.stringify(out));
      assert.equal(out.oldDisplay,'none','La nav desktop est masquée sur mobile '+role+' '+width);
      assert.equal(out.position,'fixed','La barre mobile est fixe '+role+' '+width);
      assert.ok(Math.abs(out.bottomGap)<=2,'La barre mobile colle au bas de l’écran '+role+' '+width);
      assert.equal(out.buttons.length,expected.length+1,'Le menu Plus complète les rubriques directes sans les remplacer '+role+' '+width);
      assert.deepEqual(out.buttons.map(x=>x.label),[...expected,'Plus'],'Ordre mobile '+role+' '+width);
      assert.equal(out.buttons.filter(x=>x.active).length,1,'Une seule entrée active '+role+' '+width);
      assert.equal(out.buttons[0].route,'home','Accueil pointe vers home '+role+' '+width);
      assert.equal(out.overflow,false,'Pas de débordement horizontal '+role+' '+width);
      assert.equal(out.menuAvailable,true,'Le menu Rubriques est disponible '+role+' '+width);
      assert.ok(out.menuTarget>=54,'La cible Plus est assez grande pour le doigt '+role+' '+width);
      assert.ok(out.headerHeight<=58,'Le header mobile reste compact '+role+' '+width);
      assert.equal(out.themeHeaderVisible,true,'Le bouton Thème est visible dans le header '+role+' '+width);
      assert.equal(out.simulationBadgeVisible,false,'Le badge simulation est absent visuellement du header '+role+' '+width);
      assert.equal(out.logoutHeaderDisplay,'none','La déconnexion permanente est absente du header '+role+' '+width);
      if(role==='OWNER'){
        assert.ok(out.homePortals.some(label=>label.includes('My FGTB')),'Accueil conserve My FGTB '+width);
        assert.ok(out.homePortals.some(label=>label.includes('MyCareer')),'Accueil conserve MyCareer '+width);
        assert.ok(out.homePortals.length>=5,'Accueil conserve les portails officiels '+width);
        assert.equal(out.personal.personalPortalCount,0,'Moi ne duplique aucun portail personnel '+width);
        assert.equal(out.personal.companyPortalCount,0,'Moi ne duplique aucun portail entreprise '+width);
        assert.equal(out.personal.hasEssentialCopy,false,'Moi ne montre plus Vos portails essentiels '+width);
        assert.equal(out.personal.themeCount,0,'Moi ne contient plus le grand catalogue Thème '+width);
        assert.equal(out.personal.headerThemeVisible,true,'Thème reste accessible dans le header depuis Moi '+width);
        assert.equal(out.themeMenu.open,true,'Le bouton Thème ouvre le sélecteur '+width);
        assert.equal(out.themeMenu.count,13,'Le sélecteur expose les treize thèmes V3 '+width);
        assert.ok(out.themeMenu.ids.includes('carmin'),'Le thème Carmin est proposé par le sélecteur '+width);
        assert.equal(new Set(out.themeMenu.ids).size,out.themeMenu.ids.length,'Aucun identifiant de thème n’est dupliqué '+width);
        assert.deepEqual([...out.themeMenu.ids].sort(),['ardoise','atelier','beton','bordeaux','carmin','ciel','contraste','cuivre','foret','graphite','lin','nuit','terre'],'Le sélecteur expose exactement les treize thèmes V3 '+width);
        assert.equal(out.themeMenu.changed,true,'Le choix de thème fonctionne '+width);
        assert.equal(out.themeMenu.persisted,true,'Le thème choisi persiste '+width);
      }
      if(role==='WORKER'){
        assert.equal(out.personal.themeCount,0,'Le catalogue Thème n’est plus dupliqué dans Moi '+width);
        assert.equal(out.personal.moreCount,0,'Les rubriques ne sont plus enfouies dans Mon espace '+width);
        assert.equal(out.personal.hasPayCopy,false,'Mon espace ouvrier ne montre plus barème/CP/taux horaire '+width);
      }
    }
    if(role==='OWNER'){
      await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
      const preview=await tab.evaluate(`(async()=>{const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));navigate('permissions');await wait();const deadline=Date.now()+4000;let member=null;while(!member&&Date.now()<deadline){member=[...document.querySelectorAll('.access-member-list button')].find(button=>/david\\s+leclercq?/i.test(button.textContent||''));if(!member)await new Promise(resolve=>setTimeout(resolve,50))}if(!member)return{found:false,available:[...document.querySelectorAll('.access-member-list button')].map(button=>button.textContent.trim())};member.click();await wait();const saveDeadline=Date.now()+15000;while(!(storageReady&&!saveRunning&&!saveFailed&&workspaceSnapshot()===savedSnapshot)&&Date.now()<saveDeadline)await new Promise(resolve=>setTimeout(resolve,50));if(!(storageReady&&!saveRunning&&!saveFailed&&workspaceSnapshot()===savedSnapshot))throw Error('workspace did not settle before access preview');const buttonDeadline=Date.now()+2000;let testButton=null;while(!testButton&&Date.now()<buttonDeadline){testButton=document.querySelector('.access-preview-actions button.primary');if(!testButton)await new Promise(resolve=>setTimeout(resolve,40))}if(!testButton)return{found:true,testButton:false};testButton.click();const previewDeadline=Date.now()+20000;while((!globalThis.socleAccessPreviewVerified||!(/Mode test en lecture seule activé/.test(document.querySelector('#toast')?.innerText||'')))&&Date.now()<previewDeadline)await new Promise(resolve=>setTimeout(resolve,40));if(!globalThis.socleAccessPreviewVerified)throw Error('preview not confirmed: '+JSON.stringify({error:globalThis.socleAccessPreviewError||'',role:globalThis.socleAuthenticatedAccess?.roleCode||globalThis.socleCurrentAccess?.roleCode,clean:workspaceSnapshot()===savedSnapshot,ready:storageReady,toast:document.querySelector('#toast')?.innerText||''}));await wait();const bannerDeadline=Date.now()+2000;let banner=null;while(!banner&&Date.now()<bannerDeadline){banner=document.querySelector('#main .access-test-banner');if(!banner)await new Promise(resolve=>setTimeout(resolve,40))}const sim=document.querySelector('.header-right .simulation-badge'),theme=document.querySelector('.v3-theme-button');const result={found:true,testButton:true,bannerText:banner?.innerText||'',themeVisible:Boolean(theme&&getComputedStyle(theme).display!=='none'),simulationBadgeVisible:Boolean(sim&&getComputedStyle(sim).display!=='none'&&sim.getBoundingClientRect().width>0),overflow:document.documentElement.scrollWidth>innerWidth};await stopAccessPreview();await wait();navigate('home');return result})()`,'owner-david-preview');
      assert.equal(preview.found,true,'David Leclercq reste présent dans Droits d’accès');
      assert.equal(preview.testButton,true,'Le bouton Tester cet accès reste disponible pour David Leclercq');
      assert.equal(preview.themeVisible,true,'Le bouton Thème reste visible pendant le parcours Tester cet accès');
      assert.equal(preview.simulationBadgeVisible,false,'Le badge simulation du header reste masqué pendant le parcours Tester cet accès');
      assert.equal(preview.overflow,false,'Le parcours Tester cet accès ne crée pas de débordement mobile');
      if(preview.bannerText){
        assert.match(preview.bannerText,/MODE TEST — CHEF D’ÉQUIPE/i,'Le rôle serveur simulé reste clairement indiqué');
        assert.match(preview.bannerText,/Quitter le mode test/i,'La sortie du preview reste explicite');
      }
      const bannerCss=await tab.evaluate(`(()=>{const host=document.querySelector('#main');const probe=document.createElement('section');probe.className='access-test-banner';probe.innerHTML='<span><strong>Mode test · David Leclercq</strong></span><button>Revenir au patron</button>';host.prepend(probe);const style=getComputedStyle(probe),result={display:style.display,visibility:style.visibility,opacity:style.opacity,width:Math.round(probe.getBoundingClientRect().width)};probe.remove();return result})()`,'access-banner-css');
      assert.notEqual(bannerCss.display,'none','Le lot mobile ne masque pas .access-test-banner');
      assert.notEqual(bannerCss.visibility,'hidden','Le lot mobile conserve la visibilité de .access-test-banner');
      assert.notEqual(bannerCss.opacity,'0','Le lot mobile conserve l’opacité de .access-test-banner');
      assert.ok(bannerCss.width>0,'La carte Mode test reste rendable sur mobile');
    }
    await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
    await tab.call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await tab.evaluate("navigate('home');window.dispatchEvent(new Event('resize'))",'menu-reset:'+role);
    await tap(tab,'#socleMobileNav [data-mobile-menu-toggle]');
    const opened=await tab.evaluate(`(()=>{const dialog=document.querySelector('#socleMobileMoreDialog'),toggle=document.querySelector('[data-mobile-menu-toggle]'),buttons=[...dialog.querySelectorAll('button[data-mobile-route]')];return{open:dialog.open,expanded:toggle.getAttribute('aria-expanded'),keys:buttons.map(button=>button.dataset.mobileRoute),firstLabel:buttons[0]?.querySelector('strong')?.textContent||'',allowed:buttons.every(button=>canViewModule(button.dataset.mobileRoute)&&tabs2.some(tab=>tab[0]===button.dataset.mobileRoute)),groups:dialog.querySelectorAll('.socle-mobile-menu-group').length,hasSearch:Boolean(dialog.querySelector('[data-mobile-menu-search]')),searchAutofocused:document.activeElement===dialog.querySelector('[data-mobile-menu-search]')}})()`,'menu-open:'+role);
    console.log('MOBILE_MORE_'+role+'='+JSON.stringify(opened));
    assert.equal(opened.open,true,'Le menu s’ouvre au toucher '+role);
    assert.equal(opened.expanded,'true','aria-expanded reflète l’ouverture '+role);
    assert.ok(opened.keys.length>0,'Au moins une rubrique disponible '+role);
    assert.equal(opened.allowed,true,'Le menu ne révèle que les routes autorisées '+role);
    assert.ok(opened.groups>0&&opened.hasSearch,'Les rubriques sont groupées et recherchables '+role);
    assert.equal(opened.searchAutofocused,false,'L’ouverture ne fait pas surgir le clavier du téléphone '+role);
    if(role==='OWNER'){
      for(const [width,height] of [[375,844],[390,844],[430,844],[375,667]]){
        await tab.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:height});
        const sheet=await tab.evaluate(`(()=>{const dialog=document.querySelector('#socleMobileMoreDialog'),rect=dialog.getBoundingClientRect(),close=dialog.querySelector('[data-mobile-menu-close]').getBoundingClientRect(),groups=dialog.querySelector('.socle-mobile-menu-groups'),style=getComputedStyle(dialog);return{open:dialog.open,ratio:rect.height/innerHeight,top:rect.top,bottomGap:innerHeight-rect.bottom,radius:parseFloat(style.borderTopLeftRadius)||0,closeWidth:close.width,closeHeight:close.height,scrollClient:groups.clientHeight,scrollHeight:groups.scrollHeight}})()`,'plus-sheet:'+width+'x'+height);
        console.log('PLUS_SHEET_'+width+'x'+height+'='+JSON.stringify(sheet));
        assert.equal(sheet.open,true,'Le panneau reste ouvert au format '+width+'x'+height);
        assert.ok(sheet.ratio>=0.89&&sheet.ratio<=0.95,'Le panneau occupe environ 90–95 % de la hauteur (tolérance sous-pixel) '+width+'x'+height);
        assert.ok(sheet.top>0&&sheet.top<=height*.12,'Le panneau commence près du haut '+width+'x'+height);
        assert.ok(Math.abs(sheet.bottomGap)<=2,'Le panneau reste ancré en bas '+width+'x'+height);
        assert.ok(sheet.radius>=12,'Les coins supérieurs restent arrondis '+width+'x'+height);
        assert.ok(sheet.closeWidth>=44&&sheet.closeHeight>=44,'Le bouton X reste accessible '+width+'x'+height);
        if(height===667)assert.ok(sheet.scrollHeight>sheet.scrollClient,'La liste possède un scroll interne sur écran court '+width+'x'+height);
        else assert.ok(sheet.scrollHeight>=sheet.scrollClient,'La liste reste contenue dans son panneau '+width+'x'+height);
      }
      const scroll=await tab.evaluate(`(()=>{const groups=document.querySelector('.socle-mobile-menu-groups'),before=groups.scrollTop;groups.scrollTop=groups.scrollHeight;return{before,after:groups.scrollTop,max:groups.scrollHeight-groups.clientHeight}})()`,'plus-sheet-scroll');
      assert.ok(scroll.max>0&&scroll.after>scroll.before,'Le contenu du panneau défile indépendamment '+role);
      await tab.call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true,screenWidth:390,screenHeight:844});
      await tab.call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:8,y:8,id:1}]});
      await tab.call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const backdropClosed=await tab.evaluate("!document.querySelector('#socleMobileMoreDialog').open",'plus-sheet-backdrop-close');
      assert.equal(backdropClosed,true,'Un toucher hors du panneau le ferme '+role);
      await tap(tab,'#socleMobileNav [data-mobile-menu-toggle]');
      await tap(tab,'#socleMobileMoreDialog [data-mobile-menu-close]');
      const closeButtonClosed=await tab.evaluate("!document.querySelector('#socleMobileMoreDialog').open",'plus-sheet-close-button');
      assert.equal(closeButtonClosed,true,'Le bouton X ferme le panneau '+role);
      await tap(tab,'#socleMobileNav [data-mobile-menu-toggle]');
    }
    const searchResult=await tab.evaluate(`(()=>{const dialog=document.querySelector('#socleMobileMoreDialog'),search=dialog.querySelector('[data-mobile-menu-search]'),label=${JSON.stringify(opened.firstLabel)},needle=label.slice(0,3);search.value=needle;search.dispatchEvent(new Event('input',{bubbles:true}));const buttons=[...dialog.querySelectorAll('button[data-mobile-route]')],sameInput=search===dialog.querySelector('[data-mobile-menu-search]'),matched=buttons.every(button=>button.querySelector('strong').textContent.toLocaleLowerCase('fr').includes(needle.toLocaleLowerCase('fr')));search.value='';search.dispatchEvent(new Event('input',{bubbles:true}));return{sameInput,matched,count:buttons.length}})()`,'menu-search:'+role);
    assert.equal(searchResult.sameInput,true,'La recherche conserve le champ saisi et le clavier ouvert '+role);
    assert.equal(searchResult.matched,true,'La recherche filtre les rubriques '+role);
    await tab.call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    await tab.call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
    const escapeClosed=await tab.evaluate("!document.querySelector('#socleMobileMoreDialog').open",'menu-escape:'+role);
    assert.equal(escapeClosed,true,'La touche Échap ferme le menu '+role);
    await tap(tab,'#socleMobileNav [data-mobile-menu-toggle]');
    const targetRoute=await tab.evaluate("document.querySelector('#socleMobileMoreDialog button[data-mobile-route]')?.dataset.mobileRoute||''",'menu-first-route:'+role);
    assert.ok(targetRoute,'Une rubrique du menu est sélectionnable '+role);
    await tap(tab,'#socleMobileMoreDialog button[data-mobile-route]');
    const afterMenuNavigation=await tab.evaluate(`(()=>({view:typeof view==='undefined'?'':view,open:document.querySelector('#socleMobileMoreDialog')?.open||false,active:[...document.querySelectorAll('#socleMobileNav button')].filter(button=>button.classList.contains('active')||['page','location'].includes(button.getAttribute('aria-current'))).length,moreActive:document.querySelector('#socleMobileNav [data-mobile-menu-toggle]').classList.contains('active')}))()`,'menu-route:'+role);
    assert.equal(afterMenuNavigation.view,targetRoute,'Le choix ouvre la rubrique '+role);
    assert.equal(afterMenuNavigation.open,false,'Le menu se ferme après navigation '+role);
    assert.equal(afterMenuNavigation.active,1,'Une seule entrée mobile est active après navigation '+role);
    assert.equal(afterMenuNavigation.moreActive,true,'La rubrique ouverte est repérée dans Plus '+role);
    await tab.close();
  }

  const desktop=await session('direction@batinova.example','OWNER');
  await desktop.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:1000});
  const desktopState=await desktop.evaluate(`(()=>{window.dispatchEvent(new Event('resize'));const theme=document.querySelector('.v3-theme-button');return{mobile:document.querySelector('#socleMobileNav'),topDisplay:getComputedStyle(document.querySelector('#nav')).display,themeVisible:Boolean(theme&&getComputedStyle(theme).display!=='none')}})()`,'desktop-nav');
  assert.equal(desktopState.mobile,null,'La barre mobile est retirée sur desktop.');
  assert.notEqual(desktopState.topDisplay,'none','La navigation desktop reste visible.');
  assert.equal(desktopState.themeVisible,true,'Le sélecteur Thème desktop reste visible.');
  await desktop.close();
}finally{
  for(const tab of sessions){try{await tab.close()}catch{}}
  await browser.close();
}

console.log('browser-mobile-navigation-129: PASS 375/390/430 · OWNER/TEAM_LEAD/WORKER/ACCOUNTING');
