import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {connectBrowser, waitForApp} from './helpers/browser-cdp.mjs';
import {rgbColor} from './helpers/color-contrast.mjs';

const base=(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4281').replace(/\/$/,'');
const browser=await connectBrowser(base),sessions=[];
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const visualArtifacts=resolve(root,'tests','artifacts','ia-a-visual');
mkdirSync(visualArtifacts,{recursive:true});


async function captureMissionView(tab,role,viewport,route,suffix){
  const routeCode=JSON.stringify(route);
  const code='(async()=>{const target='+routeCode+';const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));navigate(target);await wait();const main=document.querySelector("#main"),nav=document.querySelector(".socle-mobile-nav");const selectors={home:".ia-role-head",jobs:".ia-jobs-list,.ia-job-row,.compact-jobs,.compact-job",planning:".ia-b-week-board,.ia-b-worker-week",accounting:".server-finance,.finance-control-panel,.account-kpis",personal:".personal-head"};const deadline=Date.now()+5000;while(Date.now()<deadline&&selectors[target]&&!document.querySelector("#main "+selectors[target]))await new Promise(resolve=>setTimeout(resolve,40));await new Promise(resolve=>setTimeout(resolve,140));const panel=main?.querySelector(".panel,.ia-home-weather,.server-finance,.ia-b-planning-head,.ia-b-week-day,.ia-jobs-list,.compact-job,.personal-head"),weather=main?.querySelector(".ia-home-weather"),work=main?.querySelector(".ia-owner-dashboard,.ia-worker-job,.ia-today-card"),portals=[...main?.querySelectorAll(".ia-home-portals a")||[]].map(link=>link.textContent.replace("↗","").trim());const explicitJobs=[...main?.querySelectorAll(".ia-job-row,.compact-job,.job-card,.job-list-row")||[]];const fallbackJobs=[...main?.querySelectorAll("button,article")||[]].filter(node=>/BATXL-CHANTIER-\d+/.test(node.textContent||"")&&node.getBoundingClientRect().height>60);const jobs=explicitJobs.length?explicitJobs:fallbackJobs;const titles=jobs.map(card=>card.querySelector(".ia-job-title-link strong")||[...card.querySelectorAll("h1,h2,h3,strong")].find(node=>!/BATXL-CHANTIER-/i.test(node.textContent||""))||card);const financeCards=[...main?.querySelectorAll(".server-finance-grid article,.account-kpis>div,.ia-mobile-card-table tbody tr")||[]],amounts=[...main?.querySelectorAll(".server-finance-grid strong,.account-kpis strong,.ia-mobile-card-table td strong")||[]],themeChoices=[...document.querySelectorAll("[data-mobile-theme]")],catalog=Array.isArray(globalThis.SOCLE_THEME_CATALOG)?globalThis.SOCLE_THEME_CATALOG:[],bodyBg=getComputedStyle(document.body).backgroundColor,panelBg=panel?getComputedStyle(panel).backgroundColor:"";const weatherBeforeWork=Boolean(weather&&work&&(weather.compareDocumentPosition(work)&Node.DOCUMENT_POSITION_FOLLOWING));const jobWidthRatios=jobs.map(node=>main?.clientWidth?node.getBoundingClientRect().width/main.clientWidth:0),jobWordBreaks=titles.map(node=>({wordBreak:getComputedStyle(node).wordBreak,overflowWrap:getComputedStyle(node).overflowWrap,width:Math.round(node.getBoundingClientRect().width),scrollWidth:node.scrollWidth,clientWidth:node.clientWidth}));const amountsClipped=amounts.some(node=>node.scrollWidth>node.clientWidth+2);window.scrollTo(0,document.documentElement.scrollHeight);if(main)main.scrollTop=main.scrollHeight;await new Promise(resolve=>setTimeout(resolve,80));const visibleChildren=main?[...main.children].filter(node=>{const style=getComputedStyle(node),rect=node.getBoundingClientRect();return style.display!=="none"&&rect.height>0}):[],last=visibleChildren.at(-1),navRect=nav?.getBoundingClientRect(),lastRect=last?.getBoundingClientRect(),bottomClear=!nav||!last||lastRect.bottom<=navRect.top+2;const arrow=document.querySelector("#ia-back-to-top"),arrowRect=arrow&&!arrow.hidden?arrow.getBoundingClientRect():null,arrowClear=!navRect||!arrowRect||arrowRect.bottom<=navRect.top+2;window.scrollTo(0,0);if(main)main.scrollTop=0;await wait();return{target,overflow:document.documentElement.scrollWidth>window.innerWidth,bodyBg,panelBg,surfaceDistinct:Boolean(panelBg&&bodyBg!==panelBg),weatherCount:main?.querySelectorAll(".ia-home-weather").length||0,weatherBeforeWork,portalLabels:portals,jobCards:jobs.length,jobWidthRatios,jobWordBreaks,financeCards:financeCards.length,amountsClipped,themeChoices:themeChoices.length,themeCatalog:catalog.length,bottomClear,arrowClear,navButtons:nav?[...nav.querySelectorAll("button")].length:0,navSafePadding:parseFloat(getComputedStyle(document.body).paddingBottom)||0,mainWidth:main?.clientWidth||0,viewport:window.innerWidth};})()';
  const metrics=await tab.evaluate(code,'mission:'+role+':'+viewport.name+':'+route);
  const shot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
  writeFileSync(resolve(visualArtifacts,'convergence-'+role.toLowerCase()+'-'+viewport.name+'-'+suffix+'.png'),Buffer.from(shot.data,'base64'));
  return metrics;
}

async function captureVisual(tab,role){
  const outputs={};
  for(const viewport of [{name:'desktop',width:1920,height:1080,mobile:false},{name:'mobile',width:390,height:844,mobile:true}]){
    await tab.call('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile,screenWidth:viewport.width,screenHeight:viewport.height});
    await tab.call('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile,maxTouchPoints:viewport.mobile?5:1});
    const themeTokens=await tab.evaluate("(()=>{const s=getComputedStyle(document.body);return{bg:s.getPropertyValue('--ia-bg'),surface:s.getPropertyValue('--ia-surface'),soft:s.getPropertyValue('--ia-surface-soft'),text:s.getPropertyValue('--ia-text')}})()",'visual-theme-tokens');
    const palette=Object.fromEntries(Object.entries(themeTokens).map(([key,value])=>[key,rgbColor(value)]));
    const organizationMenu=await tab.evaluate(`(async()=>{await new Promise(resolve=>setTimeout(resolve,40));const root=document.querySelector('#organizationLabel'),trigger=root?.querySelector('.organization-mobile-trigger'),choices=root?.querySelector('.organization-choices'),initialOpen=choices?.dataset.mobileOpen==='true',initialDisplay=choices?getComputedStyle(choices).display:'none',hasMenu=trigger?.dataset.hasMenu==='true';if(hasMenu)trigger.click();await new Promise(resolve=>requestAnimationFrame(resolve));const opened=hasMenu&&choices?.dataset.mobileOpen==='true'&&getComputedStyle(choices).display!=='none';document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}));await new Promise(resolve=>requestAnimationFrame(resolve));return{trigger:Boolean(trigger),hasMenu,initialOpen,initialDisplay,opened,closedOutside:!choices||choices.dataset.mobileOpen==='false'}})()`,'organization-switcher-popover:'+role+':'+viewport.name);
    assert.equal(organizationMenu.initialOpen,false,'La liste des entreprises est fermée au chargement '+role+' '+viewport.name);
    if(organizationMenu.hasMenu){assert.equal(organizationMenu.initialDisplay,'none','Les autres entreprises ne prennent plus la place dans l’en-tête '+role+' '+viewport.name);assert.equal(organizationMenu.opened,true,'Le menu entreprise s’ouvre au clic '+role+' '+viewport.name);assert.equal(organizationMenu.closedOutside,true,'Le menu se referme après un clic extérieur '+role+' '+viewport.name)}
    const planning=await tab.evaluate(`(async()=>{
      const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const planningAllowed=canViewModule('planning'),companyAccess=canFieldAction('viewProfitability');
      navigate('planning');await wait();
      if(planningAllowed){iaBSetPlanningAnchor('2026-09-28');const deadline=Date.now()+4000;while((iaBPlanningState.loading||iaBPlanningState.key!==iaBPlanningKey()||!document.querySelector('#main .ia-b-slot'))&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25))}
      const planningLinks=[...document.querySelectorAll('#main a[href^="https://"],#main a[href^="http://"]')].map(link=>({name:link.querySelector('strong')?.textContent.trim()||link.textContent.trim(),href:link.getAttribute('href')||''}));
    const planningPortalBlocks=document.querySelectorAll('#main .field-official,#main .official-access').length;
    const planningAccessCopy=/accès utiles|accès entreprise|informations et accès utiles|portails professionnels|vos portails essentiels/i.test(document.querySelector('#main')?.textContent||'');
    const planningOverflow=document.documentElement.scrollWidth>window.innerWidth;
      let rolePlanning=null;
      if(${JSON.stringify(role)}==='WORKER'||${JSON.stringify(role)}==='TEAM_LEAD'||${JSON.stringify(role)}==='OWNER'){
        const deadline=Date.now()+4000;
        while(!document.querySelector('#main .ia-b-worker-week,#main .ia-b-week-board')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
        const planningData=typeof iaBPlanningState!=='undefined'?(iaBPlanningState.data||{}):{};const ownPersonId=String(planningData.people?.[0]?.id||'');
        const managementBoard=document.querySelector('#main .ia-b-week-board');
        const firstManagementDay=managementBoard?.querySelector(':scope > .ia-b-week-day');
        const dayWidth=firstManagementDay?.getBoundingClientRect().width||0;
        const managementAssignmentWidthRatio=firstManagementDay&&dayWidth?Math.min(...[...firstManagementDay.querySelectorAll('.ia-b-week-assignment')].map(node=>node.getBoundingClientRect().width))/dayWidth:0;
        rolePlanning={workerDays:document.querySelectorAll('#main .ia-b-worker-day').length,workerDates:[...document.querySelectorAll('#main .ia-b-worker-day')].map(day=>day.getAttribute('data-planning-date')),workerMissions:document.querySelectorAll('#main .ia-b-worker-mission').length,workerControlsHidden:!document.querySelector('#main .ia-b-filters,#main .ia-b-actions,#main .ia-b-planning-head>.tabs'),workerOwnAssignments:planningData.people?.length===1&&(planningData.assignments||[]).every(item=>(item.people||[]).length===1&&String(item.people[0])===ownPersonId),managementDays:document.querySelectorAll('#main .ia-b-week-day').length,managementDates:[...document.querySelectorAll('#main .ia-b-week-day h2, #main .ia-b-week-day h3')].map(node=>node.textContent.trim()),managementControlsVisible:Boolean(document.querySelector('#main .ia-b-filters')),weekdaySettingsVisible:Boolean(document.querySelector('#main .ia-b-weekday-settings')),weekendSettings:[...document.querySelectorAll('#main .ia-b-weekday-settings input[type="checkbox"]')].map(input=>({name:input.name,checked:input.checked})),managementColumns:managementBoard?new Set([...managementBoard.querySelectorAll(':scope > .ia-b-week-day')].map(node=>Math.round(node.getBoundingClientRect().left))).size:0,managementAssignmentWidthRatio,overflow:document.documentElement.scrollWidth>window.innerWidth};
      }
      const styleBackground=selector=>{const node=document.querySelector(selector);return node?getComputedStyle(node).backgroundColor:''};
      const planningSurface={bodyBackground:getComputedStyle(document.body).backgroundColor,mainBackground:getComputedStyle(document.querySelector('main')).backgroundColor,controlsBackground:styleBackground('#main .ia-b-planning-head'),filtersBackground:styleBackground('#main .ia-b-filters'),dayBackground:styleBackground('#main .ia-b-week-day'),slotBackground:styleBackground('#main .ia-b-slot')};
      return {planningAllowed,companyAccess,planningNames:planningLinks.map(link=>link.name),planningHrefs:Object.fromEntries(planningLinks.map(link=>[link.name,link.href])),planningPortalBlocks,planningAccessCopy,planningOverflow,rolePlanning,surface:planningSurface};
    })()`,'portal-planning:'+role+':'+viewport.name);
    if(planning.planningAllowed){
      const planningShot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});
      writeFileSync(resolve(visualArtifacts,role.toLowerCase()+'-'+viewport.name+'-planning.png'),Buffer.from(planningShot.data,'base64'));
    }
    const personal=await tab.evaluate(`(async()=>{
      const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const personalAllowed=canViewModule('personal');
      navigate('home');await wait();
      const personalButton=viewport.mobile?document.querySelector('#socleMobileNav button[data-mobile-route="personal"]'):document.querySelector('#nav button[data-nav-route="personal"]');
      const personalButtonLabel=personalButton?.textContent.trim()||'';personalButton?.click();
      const navigationDeadline=Date.now()+5000;while(personalAllowed&&Date.now()<navigationDeadline&&(view!=='personal'||!document.querySelector('#main .personal-head')))await new Promise(resolve=>setTimeout(resolve,35));
      const personalNavigation={buttonFound:Boolean(personalButton),buttonLabel:personalButtonLabel,route:typeof view==='undefined'?'':view,personalContentVisible:Boolean(document.querySelector('#main .personal-head')),peopleContentVisible:Boolean(document.querySelector('#main .people-table,#main .people-grid,#main .people-list'))};
      const personalLinks=[...document.querySelectorAll('.personal-official-links a')].map(link=>({name:link.querySelector('strong')?.textContent.trim()||'',href:link.getAttribute('href')||''}));
      const companyLinks=[...document.querySelectorAll('.personal-company-links a')].map(link=>({name:link.querySelector('strong')?.textContent.trim()||'',href:link.getAttribute('href')||''}));
      const allPortalHrefs=[...document.querySelectorAll('.personal-official-links a,.personal-company-links a')].map(link=>link.getAttribute('href')||'');
      const personalOverflow=document.documentElement.scrollWidth>window.innerWidth;
      const personalNames=['My FGTB','Ma CSC','CGSLB — accès/dossier en ligne','MyCareer','MyPension'];
      const companyNames=['ONEM','MyMinfin','Sécurité sociale','Aides wallonnes','Le Forem','e-Box Enterprise','Buildwise'];
      const personalHead=document.querySelector('#main .personal-head'),personalKpi=document.querySelector('#main .personal-kpis>div'),personalToday=document.querySelector('#main .personal-today');
      const personalSurface={bodyBackground:getComputedStyle(document.body).backgroundColor,mainBackground:getComputedStyle(document.querySelector('main')).backgroundColor,headBackground:personalHead?getComputedStyle(personalHead).backgroundColor:'',kpiBackground:personalKpi?getComputedStyle(personalKpi).backgroundColor:'',todayBackground:personalToday?getComputedStyle(personalToday).backgroundColor:''};
      return {personalAllowed,personalNavigation,companyAccess:canFieldAction('viewProfitability'),personalNames:personalLinks.map(link=>link.name),personalHrefs:Object.fromEntries(personalLinks.map(link=>[link.name,link.href])),personalCounts:Object.fromEntries(personalNames.map(name=>[name,personalLinks.filter(link=>link.name===name).length])),companyNames:companyLinks.map(link=>link.name),companyHrefs:Object.fromEntries(companyLinks.map(link=>[link.name,link.href])),companyCounts:Object.fromEntries(companyNames.map(name=>[name,companyLinks.filter(link=>link.name===name).length])),personalContainsBuildwise:personalLinks.some(link=>link.name==='Buildwise'),uniquePortalUrls:new Set(allPortalHrefs).size===allPortalHrefs.length,personalOverflow,surface:personalSurface};
    })()`,'portal-personal:'+role+':'+viewport.name);
    if(personal.personalAllowed){
      const personalShot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});
      writeFileSync(resolve(visualArtifacts,role.toLowerCase()+'-'+viewport.name+'-personal.png'),Buffer.from(personalShot.data,'base64'));
    }
    const jobs=await tab.evaluate(`(async()=>{
      const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const jobsAllowed=canViewModule('jobs');
      if(!jobsAllowed)return{jobsAllowed:false};
      navigate('jobs');await wait();
      const filters=document.querySelector('#main .ia-b-filters'),counter=document.querySelector('#main .ia-b-filters ~ .section-heading'),list=document.querySelector('#main .ia-jobs-list'),row=document.querySelector('#main .ia-job-row');
      return{jobsAllowed:true,overflow:document.documentElement.scrollWidth>window.innerWidth,surface:{bodyBackground:getComputedStyle(document.body).backgroundColor,mainBackground:getComputedStyle(document.querySelector('main')).backgroundColor,filtersBackground:filters?getComputedStyle(filters).backgroundColor:'',counterBackground:counter?getComputedStyle(counter).backgroundColor:'',listBackground:list?getComputedStyle(list).backgroundColor:'',rowBackground:row?getComputedStyle(row).backgroundColor:''}};
    })()`,'visual-jobs:'+role+':'+viewport.name);
    if(jobs.jobsAllowed){
      const jobsShot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});
      writeFileSync(resolve(visualArtifacts,role.toLowerCase()+'-'+viewport.name+'-jobs.png'),Buffer.from(jobsShot.data,'base64'));
    }
    const overlap=Object.values(personal.personalHrefs).some(href=>Object.values(personal.companyHrefs).includes(href));
    const portals={...planning,...personal,personalCompanyUrlOverlap:overlap,planningContainsPersonalLink:planning.planningNames.some(name=>personal.personalNames.includes(name)),planningBuildwiseCount:planning.planningNames.filter(name=>name==='Buildwise').length};
    const ownerHome=await tab.evaluate(`(async()=>{
      const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      if(${JSON.stringify(role)}==='OWNER'){
        navigate('home');await wait();
        const home=document.querySelector('#main'),days=[...home.querySelectorAll('.ia-owner-week-day')];
        await new Promise(resolve=>setTimeout(resolve,120));
        const messageState=home.querySelector('.ia-owner-messages .ia-state');
        const card=home.querySelector('.ia-owner-messages');
        const metrics={heading:home.querySelector('.ia-role-head h1')?.textContent.trim()||'',messagePanel:Boolean(card),taskPanel:Boolean(home.querySelector('.ia-owner-tasks')),weekdays:days.map(node=>new Date(node.dataset.date+'T12:00:00').getDay()),weekCount:days.length,financeHidden:!home.querySelector('.ia-finance-overview,.ia-kpi-grid')&&!/facturé|à recevoir|finance|impayés/i.test(home.innerText),noTeamAssignmentInventory:!home.querySelector('.ia-summary')&&!/Équipes actives|Chantiers actifs|Aucune équipe planifiée|affectations aujourd’hui/i.test(home.innerText),background:getComputedStyle(document.body).backgroundColor,mainBackground:getComputedStyle(document.querySelector('main')).backgroundColor,textColor:getComputedStyle(document.body).color,brandColor:getComputedStyle(document.querySelector('.brand')).color,cardBackground:card?getComputedStyle(card).backgroundColor:'',cardTextColor:card?getComputedStyle(card).color:'',emptyStateBackground:messageState?getComputedStyle(messageState).backgroundColor:'',emptyStateColor:messageState?getComputedStyle(messageState).color:''};
        const scrollPosition=()=>Math.max(window.scrollY||0,document.documentElement.scrollTop||0,document.body.scrollTop||0,home.scrollTop||0);
        const scrollPage=(top)=>{window.scrollTo(0,top);document.documentElement.scrollTop=top;document.body.scrollTop=top;home.scrollTop=top;};
        const spacer=document.createElement('div');spacer.id='scroll-test-spacer';spacer.style.height='1400px';home.appendChild(spacer);scrollPage(900);await new Promise(resolve=>setTimeout(resolve,120));
        metrics.scrollActuallyMoved=scrollPosition()>240;
        const arrow=document.querySelector('#ia-back-to-top'),arrowDeadline=Date.now()+900;while(arrow&&arrow.hidden&&Date.now()<arrowDeadline)await new Promise(resolve=>setTimeout(resolve,25));const arrowVisible=Boolean(arrow&&!arrow.hidden);arrow?.click();const topDeadline=Date.now()+1800;while(scrollPosition()>4&&Date.now()<topDeadline)await new Promise(resolve=>setTimeout(resolve,25));metrics.backToTopVisible=arrowVisible;metrics.backToTopWorked=scrollPosition()<5;
        scrollPage(600);await new Promise(resolve=>setTimeout(resolve,80));navigate('planning');await wait();metrics.pageChangeAtTop=Boolean(scrollPosition()<5&&document.querySelector('#main .ia-b-planning-head'));spacer.remove();
        return metrics;
      }
      navigate('home');await wait();return null;
    })()`,'owner-home-and-scroll:'+role+':'+viewport.name);
    const expectedPermissions={OWNER:{planning:true,personal:true,companyAccess:true},TEAM_LEAD:{planning:true,personal:true,companyAccess:false},WORKER:{planning:true,personal:true,companyAccess:false},ACCOUNTING:{planning:false,personal:false,companyAccess:false}}[role];
    assert.deepEqual({planning:portals.planningAllowed,personal:portals.personalAllowed,companyAccess:portals.companyAccess},expectedPermissions,'Les permissions existantes restent inchangées pour '+role+' '+viewport.name);
    if(portals.personalAllowed){assert.equal(portals.personalNavigation.buttonFound,true,'Le bouton Mon espace est visible et cliquable '+role+' '+viewport.name);assert.equal(portals.personalNavigation.route,'personal','Un vrai clic Mon espace ouvre la route personnelle '+role+' '+viewport.name);assert.equal(portals.personalNavigation.personalContentVisible,true,'Le contenu Mon espace est affiché après le clic '+role+' '+viewport.name);assert.equal(portals.personalNavigation.peopleContentVisible,false,'Mon espace ne bascule pas vers Personnel & équipes '+role+' '+viewport.name)}
    assert.equal(portals.planningPortalBlocks,0,'Aucun bloc officiel ni équivalent dans Planning '+role+' '+viewport.name);
    assert.equal(portals.planningAccessCopy,false,'Aucun libellé d’accès utiles dans Planning '+role+' '+viewport.name);
    assert.deepEqual(portals.planningNames,[],'Planning ne contient aucun lien externe '+role+' '+viewport.name);
    assert.equal(portals.planningOverflow,false,'Pas de débordement Planning '+role+' '+viewport.name);
    if(role==='WORKER'){
      assert.equal(portals.rolePlanning.workerDays,5,'Planning WORKER affiche les cinq jours ouvrés par défaut '+viewport.name);
      assert.deepEqual(portals.rolePlanning.workerDates.map(date=>new Date(date+'T12:00:00').getDay()).sort(),[1,2,3,4,5],'Planning WORKER masque le week-end par défaut '+viewport.name);
      assert.equal(portals.rolePlanning.workerControlsHidden,true,'Planning WORKER ne montre pas les filtres ou commandes de gestion '+viewport.name);
      assert.equal(portals.rolePlanning.workerOwnAssignments,true,'Planning WORKER ne rend que ses affectations '+viewport.name);
      assert.equal(portals.rolePlanning.overflow,false,'Planning WORKER sans débordement '+viewport.name);
    }
    if(role==='TEAM_LEAD'||role==='OWNER'){
      assert.equal(portals.rolePlanning.managementDays,5,'Le calendrier de gestion '+role+' affiche lundi-vendredi par défaut '+viewport.name);
      assert.deepEqual(portals.rolePlanning.managementDates.map(label=>label.split(' ')[0].toLowerCase()),['lundi','mardi','mercredi','jeudi','vendredi'],'La gestion masque samedi et dimanche par défaut '+role+' '+viewport.name);
      assert.equal(portals.rolePlanning.managementControlsVisible,true,'La gestion '+role+' conserve ses filtres '+viewport.name);
      if(role==='OWNER'){assert.equal(portals.rolePlanning.weekdaySettingsVisible,true,'Le patron dispose des options de week-end '+viewport.name);assert.deepEqual(portals.rolePlanning.weekendSettings,[{name:'includeSaturday',checked:false},{name:'includeSunday',checked:false}],'Samedi et dimanche sont décochés par défaut '+viewport.name)}
      if(role==='TEAM_LEAD')assert.equal(portals.rolePlanning.weekdaySettingsVisible,false,'Seul le patron règle le week-end partagé '+viewport.name);
    }
    assert.deepEqual(portals.companyNames,portals.personalAllowed&&portals.companyAccess?['ONEM','MyMinfin','Sécurité sociale','Aides wallonnes','Le Forem','e-Box Enterprise','Buildwise']:[],'Aucun portail professionnel hors Mon espace ou hors permission existante '+role+' '+viewport.name);
    if(portals.personalAllowed){
      assert.deepEqual(portals.personalNames,['My FGTB','Ma CSC','CGSLB — accès/dossier en ligne','MyCareer','MyPension'],'Les cinq portails personnels sont présents une seule fois et dans l’ordre prévu '+role+' '+viewport.name);
      assert.ok(Object.values(portals.personalCounts).every(count=>count===1),'Chaque portail personnel apparaît une seule fois '+role+' '+viewport.name);
      assert.equal(portals.personalContainsBuildwise,false,'Buildwise reste hors des portails personnels '+role+' '+viewport.name);
      assert.equal(portals.personalOverflow,false,'Pas de débordement Mon espace '+role+' '+viewport.name);
      assert.deepEqual(portals.companyNames,portals.companyAccess?['ONEM','MyMinfin','Sécurité sociale','Aides wallonnes','Le Forem','e-Box Enterprise','Buildwise']:[],'Les accès professionnels sont placés dans Mon espace uniquement avec la permission existante '+role+' '+viewport.name);
      assert.ok(Object.values(portals.companyCounts).every(count=>count===(portals.companyAccess?1:0)),'Chaque accès professionnel apparaît une fois et uniquement si autorisé '+role+' '+viewport.name);
      assert.equal(portals.uniquePortalUrls,true,'Aucun doublon de lien dans Mon espace '+role+' '+viewport.name);
      assert.equal(portals.personalHrefs['My FGTB'],'https://my.abvv.be/','Lien officiel direct de connexion My FGTB');
      assert.equal(portals.personalHrefs['Ma CSC'],'https://www.macsc.be','URL officielle Ma CSC');
      assert.equal(portals.personalHrefs['CGSLB — accès/dossier en ligne'],'https://my.aclvb-cgslb.org/','URL du dossier actuel proposée par le site officiel CGSLB');
      assert.equal(portals.personalHrefs.MyCareer,'https://mycareer.socialsecurity.be/','Lien officiel direct MyCareer');
      assert.equal(portals.personalHrefs.MyPension,'https://www.mypension.be/fr','Entrée officielle MyPension conservée car l’authentification utilise une URL dynamique');
    }else{
      assert.equal(portals.personalNames.length,0,'Aucun portail personnel ne fuit vers un rôle sans accès Mon espace '+role+' '+viewport.name);
    }
    assert.equal(portals.planningContainsPersonalLink,false,'Aucun portail personnel dans Planning '+role+' '+viewport.name);
    assert.equal(portals.personalCompanyUrlOverlap,false,'Aucun lien ne figure dans les deux catégories '+role+' '+viewport.name);
    assert.equal(portals.companyAccess?portals.companyHrefs.Buildwise:'Buildwise absent',portals.companyAccess?'https://www.buildwise.be/fr/':'Buildwise absent','Buildwise reste dans la partie professionnelle autorisée '+role+' '+viewport.name);
    let workerWeather=null;
    if(role==='WORKER'){
      workerWeather=await tab.evaluate(`(async()=>{
        navigate('home');
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const hasUnexpectedScopedCard=Boolean(document.querySelector('#main .ia-home-weather-card'));
        const hadTown=Object.hasOwn(weatherByTown,'Namur'),originalTown=weatherByTown.Namur;
        const currentDate=String((typeof day!=='undefined'&&day)||(typeof reference!=='undefined'&&reference)||'');
        const dates=Array.from({length:5},(_,index)=>{const value=new Date(currentDate+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+index);return value.toISOString().slice(0,10)});
        const daily={time:dates,weather_code:[61,1,95,71,3],temperature_2m_max:[12,14,13,9,11],temperature_2m_min:[6,7,8,4,5],precipitation_probability_max:[70,10,85,45,25],precipitation_sum:[4.2,0,8.8,1.4,0.3],wind_speed_10m_max:[20,12,31,18,16],wind_gusts_10m_max:[36,20,54,29,25],sunrise:dates.map(date=>date+'T07:30'),sunset:dates.map(date=>date+'T19:12')};
        weatherByTown.Namur={place:{name:'Namur'},daily};
        try{
          showTownWeather('Namur');
          const dialog=document.querySelector('#modal'),forecast=dialog?.querySelector('.weather-detail'),body=document.querySelector('#modalbody'),text=body?.innerText||'';
          return{hasUnexpectedScopedCard,opened:Boolean(dialog?.open&&forecast),heading:dialog?.querySelector('.modal-top h2')?.textContent.trim()||'',dayCount:forecast?.querySelectorAll('.weather-day').length||0,hasRain:text.includes('Risque de précipitations'),hasWind:text.includes('Vent maximum'),hasGusts:text.includes('Rafales maximum'),hasSun:text.includes('Lever 07:30')&&text.includes('Coucher 19:12'),hasFiveDays:text.includes('Prévision détaillée sur 5 jours'),overflow:document.documentElement.scrollWidth>window.innerWidth};
        }finally{if(document.querySelector('#modal')?.open)closeModal();if(hadTown)weatherByTown.Namur=originalTown;else delete weatherByTown.Namur;render()}
      })()`,'worker-weather-five-day:'+viewport.name);
      assert.equal(workerWeather.hasUnexpectedScopedCard,false,'Sans affectation personnelle scoppée, aucune météo chantier ne fuit sur l’accueil WORKER '+viewport.name);
      assert.equal(workerWeather.opened,true,'La fiche météo 5 jours reste ouvrable '+viewport.name);
      assert.equal(workerWeather.heading,'Météo chantier · Namur','La fiche identifie la ville du chantier '+viewport.name);
      assert.equal(workerWeather.dayCount,5,'La fiche affiche cinq jours '+viewport.name);
      assert.equal(workerWeather.hasRain,true,'La fiche affiche le risque de pluie '+viewport.name);
      assert.equal(workerWeather.hasWind,true,'La fiche affiche le vent maximum '+viewport.name);
      assert.equal(workerWeather.hasGusts,true,'La fiche affiche les rafales maximum '+viewport.name);
      assert.equal(workerWeather.hasSun,true,'La fiche affiche le lever et coucher du soleil '+viewport.name);
      assert.equal(workerWeather.hasFiveDays,true,'La fiche annonce sa période '+viewport.name);
      assert.equal(workerWeather.overflow,false,'La fiche météo tient dans la largeur '+viewport.name);
    }
    const metrics=await tab.evaluate(`(async()=>{
      if(typeof navigate==='function')navigate('home');
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const summaries=[...document.querySelectorAll('.ia-summary')].map(section=>({
        title:section.querySelector('h2')?.textContent?.trim()||'',
        visible:section.querySelectorAll('.ia-summary-row').length,
        more:section.querySelector('.ia-show-more')?.textContent?.trim()||''
      }));
      return {
        role:document.body.dataset.iaARole||'',
        heading:document.querySelector('.ia-role-head h1')?.textContent?.trim()||'',
        overviewPortalSections:document.querySelectorAll('#main .ia-overview-personal-portals').length,
        overviewPersonalLinks:[...document.querySelectorAll('#main .ia-overview-personal-portals .official-grid a')].map(link=>link.querySelector('strong')?.textContent.trim()||''),
        overviewCompanyLinks:[...document.querySelectorAll('#main .ia-overview-personal-portals .official-grid a')].filter(link=>['Buildwise','ONEM','MyMinfin','Sécurité sociale','Aides wallonnes','Le Forem','e-Box Enterprise'].includes(link.querySelector('strong')?.textContent.trim()||'')).map(link=>link.querySelector('strong')?.textContent.trim()||''),
        overviewPortalCardWidths:[...document.querySelectorAll('#main .ia-overview-personal-portals .official-grid a')].map(link=>Math.round(link.getBoundingClientRect().width)),
        summaries,
        overflowX:document.documentElement.scrollWidth>window.innerWidth,
        scrollWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,
        viewportHeight:window.innerHeight,
        planningCount:[...document.querySelectorAll('#nav button')].filter(button=>button.textContent.trim()==='Planning').length,
        activeNavigationCount:[...document.querySelectorAll('#nav button')].filter(button=>button.classList.contains('active')||button.getAttribute('aria-current')==='page').length,
        localLogin:(()=>{const node=document.querySelector('.local-login-banner');if(!node)return null;const rect=node.getBoundingClientRect(),main=document.querySelector('#main')?.getBoundingClientRect();const overlapsMain=main?rect.left<main.right&&rect.right>main.left&&rect.top<main.bottom&&rect.bottom>main.top:false;return{width:Math.round(rect.width),height:Math.round(rect.height),position:getComputedStyle(node).position,overlapsMain}})(),
        dataCounts:{
          jobs:typeof jobs!=='undefined'&&Array.isArray(jobs)?jobs.length:null,
          assignments:typeof assignments!=='undefined'&&Array.isArray(assignments)?assignments.length:null,
          reminders:typeof reminders!=='undefined'&&Array.isArray(reminders)?reminders.length:null,
          tasks:typeof tasks!=='undefined'&&Array.isArray(tasks)?tasks.length:null,
          invoices:typeof accountingData!=='undefined'&&accountingData&&Array.isArray(accountingData.customerInvoices)?accountingData.customerInvoices.length:null,
          supplierBills:typeof accountingData!=='undefined'&&accountingData&&Array.isArray(accountingData.supplierBills)?accountingData.supplierBills.length:null
        }
      };
    })()`,'visual:'+role+':'+viewport.name);
    if((role==='OWNER'||role==='TEAM_LEAD')&&portals.rolePlanning?.managementDays){
      assert.equal(portals.rolePlanning.managementDays,5,'Planning gestion affiche cinq jours ouvrés par défaut '+viewport.name);
      assert.equal(portals.rolePlanning.managementColumns,viewport.mobile?1:5,'Planning gestion s’adapte en une colonne mobile et cinq colonnes desktop '+viewport.name+' (colonnes='+portals.rolePlanning.managementColumns+')');
      if(viewport.mobile)assert.ok(portals.rolePlanning.managementAssignmentWidthRatio>=.8,'Les affectations du Planning mobile utilisent la largeur du jour '+viewport.name+' (ratio='+portals.rolePlanning.managementAssignmentWidthRatio+')');
    }
    assert.equal(metrics.role,role,'Dashboard IA-A incorrect pour '+role+' en '+viewport.name);
    const expectedHeading={OWNER:'Votre journée',TEAM_LEAD:'Votre journée d’équipe',WORKER:'Votre chantier du jour',ACCOUNTING:'Centre financier'}[role];
    assert.equal(metrics.heading,expectedHeading,'Titre dashboard incorrect pour '+role+' en '+viewport.name);
    const overviewPortalsExpected=[];
    assert.equal(metrics.overviewPortalSections,0,'Les portails personnels restent hors Accueil '+role+' en '+viewport.name);
    assert.deepEqual(metrics.overviewPersonalLinks,overviewPortalsExpected,'Accueil ne contient aucun portail personnel '+role+' en '+viewport.name);
    assert.deepEqual(metrics.overviewCompanyLinks,[],'Accueil n’élargit pas les accès professionnels '+role+' en '+viewport.name);
    assert.equal(new Set(metrics.overviewPersonalLinks).size,metrics.overviewPersonalLinks.length,'Aucun doublon de portail sur Accueil '+role+' en '+viewport.name);
    assert.equal(metrics.overflowX,false,'Débordement horizontal '+role+' en '+viewport.name+' ('+metrics.scrollWidth+'>'+metrics.viewportWidth+')');
    assert.ok(metrics.planningCount<=1,'Planning en double pour '+role+' en '+viewport.name);
    if(role!=='ACCOUNTING')assert.equal(metrics.planningCount,1,'Planning accessible une fois pour '+role+' en '+viewport.name);
    assert.ok(metrics.activeNavigationCount<=1,'Plusieurs éléments actifs pour '+role+' en '+viewport.name);
    if(role==='OWNER'){
      assert.equal(ownerHome.heading,'Votre journée','Accueil patron centré sur la journée '+viewport.name);
      assert.equal(ownerHome.messagePanel,true,'Bloc des messages présent dans l’accueil patron '+viewport.name);
      assert.equal(ownerHome.taskPanel,true,'Bloc des tâches/demandes présent dans l’accueil patron '+viewport.name);
      assert.equal(ownerHome.weekCount,5,'Accueil patron montre cinq jours '+viewport.name);
      assert.deepEqual(ownerHome.weekdays,[1,2,3,4,5],'Calendrier patron lundi-vendredi '+viewport.name);
      assert.equal(ownerHome.financeHidden,true,'Aucun indicateur financier dans l’accueil patron '+viewport.name);
      assert.equal(ownerHome.noTeamAssignmentInventory,true,'Aucun inventaire équipes/chantiers dans l’accueil patron '+viewport.name);
      assert.equal(ownerHome.background,palette.bg,'Le canevas suit le thème actif '+viewport.name);
      assert.notEqual(ownerHome.background,ownerHome.cardBackground,'Le canevas reste distinct des cartes '+viewport.name);
      assert.ok(ownerHome.mainBackground==='rgba(0, 0, 0, 0)'||ownerHome.mainBackground===palette.bg,'Le canevas principal reste transparent ou suit le thème V3 '+viewport.name+' ('+ownerHome.mainBackground+')');
      assert.equal(ownerHome.brandColor,palette.text,'Logo suit la couleur d’encre du thème V3 '+viewport.name);
      assert.equal(ownerHome.cardBackground,palette.surface,'Panneau d’information lié au thème '+viewport.name);
      assert.equal(ownerHome.cardTextColor,palette.text,'Texte lié au thème de la carte '+viewport.name);
      assert.equal(ownerHome.emptyStateBackground,palette.surface,'État vide sur la surface du thème V3 '+viewport.name);
      assert.equal(ownerHome.emptyStateColor,palette.text,'Texte des états vides lié au thème '+viewport.name);
      assert.equal(ownerHome.backToTopVisible,true,'Flèche de retour visible après défilement '+viewport.name);
      assert.equal(ownerHome.scrollActuallyMoved,true,'Le conteneur de page a réellement défilé avant le contrôle de la flèche '+viewport.name);
      assert.equal(ownerHome.backToTopWorked,true,'Flèche remonte en haut '+viewport.name);
      assert.equal(ownerHome.pageChangeAtTop,true,'Le changement de page revient en haut '+viewport.name);
      if(viewport.mobile){
        assert.equal(planning.surface.bodyBackground,palette.bg,'Planning mobile utilise le canevas du thème');
        assert.equal(personal.surface.bodyBackground,palette.bg,'Mon espace mobile utilise le canevas du thème');
        assert.equal(jobs.surface.bodyBackground,palette.bg,'Chantiers mobile utilise le canevas du thème');
      }else{
        assert.equal(planning.surface.bodyBackground,palette.bg,'Planning desktop sur le fond du thème');
        assert.equal(planning.surface.controlsBackground,palette.surface,'Commandes Planning dans un panneau du thème');
        assert.equal(planning.surface.filtersBackground,palette.surface,'Filtres Planning dans un panneau du thème');
        assert.equal(planning.surface.dayBackground,palette.surface,'Journées Planning en panneaux du thème');
        assert.equal(planning.surface.slotBackground,palette.soft,'Affectations Planning sur surface secondaire');
        assert.equal(personal.surface.bodyBackground,palette.bg,'Mon espace desktop sur le fond du thème');
        assert.equal(personal.surface.headBackground,palette.surface,'En-tête Mon espace dans un panneau du thème');
        assert.equal(personal.surface.kpiBackground,palette.surface,'KPI Mon espace en panneaux du thème');
        assert.equal(personal.surface.todayBackground,palette.surface,'Bloc Aujourd’hui Mon espace en panneau du thème');
        assert.equal(jobs.surface.bodyBackground,palette.bg,'Chantiers desktop sur le fond du thème');
        assert.equal(jobs.surface.filtersBackground,palette.surface,'Recherche/filtres Chantiers en panneau du thème');
        assert.equal(jobs.surface.counterBackground,palette.surface,'Compteur/actions Chantiers en panneau du thème');
        assert.equal(jobs.surface.listBackground,palette.surface,'Liste Chantiers en panneau du thème');
        assert.equal(jobs.surface.rowBackground,palette.soft,'Lignes Chantiers sur surface secondaire');
      }
    }
    for(const summary of metrics.summaries)assert.ok(summary.visible<=5,'Résumé >5 éléments : '+role+' / '+summary.title);
    if(metrics.localLogin){
      assert.equal(metrics.localLogin.overlapsMain,false,'Le sélecteur local ne doit pas recouvrir le contenu principal');
      if(viewport.mobile){
        assert.equal(metrics.localLogin.position,'static','Le sélecteur local mobile doit rester dans le flux');
        assert.ok(metrics.localLogin.height<=80,'Sélecteur local trop haut sur mobile: '+metrics.localLogin.height);
      }else assert.ok(metrics.localLogin.width<=200&&metrics.localLogin.height<=150,'Sélecteur local trop encombrant sur desktop');
    }
    if(role==='OWNER'){
      const requiredRoutes=viewport.mobile?[['home','accueil'],['jobs','chantiers'],['planning','planning'],['accounting','comptabilite'],['personal','moi-theme']]:[['home','accueil'],['jobs','chantiers'],['planning','planning'],['accounting','comptabilite']];
      for(const [route,suffix] of requiredRoutes){
        const mission=await captureMissionView(tab,role,viewport,route,suffix);
        assert.equal(mission.overflow,false,'Aucun débordement horizontal '+route+' '+viewport.name);
        assert.equal(mission.surfaceDistinct,true,'Fond/panneau visuellement distincts '+route+' '+viewport.name);
        if(route==='home'){
          assert.ok(mission.weatherCount>=1,'Météo visible sur Accueil '+viewport.name);
          assert.equal(mission.weatherBeforeWork,true,'Météo placée avant le travail du jour '+viewport.name);
          if(viewport.mobile){
            for(const label of ['My FGTB','MyCareer','Forem','MyMinfin','MyPension'])assert.ok(mission.portalLabels.some(item=>item.includes(label)),'Portail '+label+' présent sur Accueil mobile');
          }
        }
        if(route==='jobs'){
          const jobsLayout=await tab.evaluate(`(()=>{const table=document.querySelector('#main .ia-jobs-table'),rows=[...document.querySelectorAll('#main .ia-job-row')],first=rows[0],title=first?.querySelector('.ia-job-identity'),panel=document.querySelector('#main .ia-jobs-list'),control=document.querySelector('#main .ia-b-filters input,#main .ia-b-filters select');return{table:Boolean(table),headers:table?.querySelectorAll('thead th').length||0,rowCount:rows.length,rowHeights:rows.map(row=>Math.round(row.getBoundingClientRect().height)),titleWidths:rows.map(row=>Math.round(row.querySelector('.ia-job-identity')?.getBoundingClientRect().width||0)),panelRadius:parseFloat(panel?getComputedStyle(panel).borderRadius:'0')||0,controlRadius:parseFloat(control?getComputedStyle(control).borderRadius:'0')||0,mobileMetaVisible:first?getComputedStyle(first.querySelector('.ia-job-mobile-meta')).display!=='none':false};})()`,'jobs-layout:'+viewport.name);
          assert.equal(jobsLayout.table,true,'Chantiers utilise une vraie table responsive '+viewport.name);
          assert.equal(jobsLayout.headers,7,'Chantiers conserve sept colonnes desktop structurées '+viewport.name);
          assert.ok(jobsLayout.panelRadius>=10,'Le conteneur Chantiers possède un arrondi cohérent '+viewport.name);
          assert.ok(jobsLayout.controlRadius>=7,'Les filtres Chantiers gardent l’arrondi compact du thème V3 '+viewport.name);
          if(viewport.mobile){
            assert.ok(mission.jobCards>0,'Les chantiers sont rendus comme cartes mobiles');
            assert.ok(mission.jobWidthRatios.every(value=>value>=.88),'Les cartes chantier utilisent la largeur utile');
            assert.ok(mission.jobWordBreaks.every(item=>item.wordBreak!=='break-all'&&item.width>=120&&item.scrollWidth<=item.clientWidth+2),'Les titres chantier restent lisibles sans mot cassé verticalement');
            assert.ok(jobsLayout.mobileMetaVisible,'Référence et localité restent visibles dans la carte mobile');
            assert.ok(jobsLayout.rowHeights.every(value=>value<220),'Les cartes chantier mobiles restent compactes');
          }else{
            assert.ok(jobsLayout.titleWidths.every(value=>value>=220),'La colonne titre reste suffisamment large sur desktop');
            assert.ok(jobsLayout.rowHeights.every(value=>value<100),'Les lignes chantier desktop restent denses');
          }
        }
        if(route==='accounting'&&viewport.mobile){
          assert.ok(mission.financeCards>0,'Les tableaux Finance deviennent des cartes mobiles');
          assert.equal(mission.amountsClipped,false,'Aucun montant financier tronqué');
        }
        if(route==='personal'&&viewport.mobile){
          const themeProbe=await tab.evaluate(`(()=>{const trigger=document.querySelector('.v3-theme-button'),menu=document.querySelector('#v3-theme-menu');if(!trigger||!menu)return null;trigger.click();const choices=[...menu.querySelectorAll('.v3-theme-choice')],beforeId=document.body.dataset.v3Theme||'',beforeBg=getComputedStyle(document.body).backgroundColor,opened=!menu.hidden,target=choices.find(choice=>choice.dataset.theme!==beforeId);if(!target)return{choices:choices.length,opened,beforeId,beforeBg,afterId:beforeId,afterBg:beforeBg};target.click();const afterId=document.body.dataset.v3Theme||'',afterBg=getComputedStyle(document.body).backgroundColor;choices.find(choice=>choice.dataset.theme===beforeId)?.click();return{choices:choices.length,opened,beforeId,beforeBg,afterId,afterBg};})()`,'mobile-theme-switch:'+role);
          assert.ok(themeProbe&&themeProbe.choices>=13,'Le sélecteur V3 propose au moins ses treize thèmes (obtenu '+(themeProbe?themeProbe.choices:'aucun')+')');
          assert.equal(themeProbe.opened,true,'Le bouton Apparence ouvre le sélecteur V3');
          assert.ok(themeProbe.afterId!==themeProbe.beforeId,'Le choix de thème mobile change réellement le thème actif');
          assert.notEqual(themeProbe.afterBg,themeProbe.beforeBg,'Le choix de thème mobile change réellement la couleur du shell');
        }
        if(viewport.mobile){
          assert.equal(mission.navButtons,6,'La navigation basse comporte six entrées');
          assert.ok(mission.navSafePadding>=70,'Le contenu réserve la hauteur de la navigation basse');
          assert.equal(mission.bottomClear,true,'Le dernier contenu reste au-dessus de la barre basse');
          assert.equal(mission.arrowClear,true,'La flèche de retour en haut ne recouvre pas la barre basse');
        }
      }
      if(viewport.mobile){
        const plus=await tab.evaluate(`(async()=>{navigate('home');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));document.querySelector('[data-mobile-menu-toggle]')?.click();await new Promise(resolve=>setTimeout(resolve,80));const dialog=document.querySelector('#socleMobileMoreDialog');return{open:Boolean(dialog?.open),overflow:document.documentElement.scrollWidth>window.innerWidth};})()`,'convergence-plus');
        assert.equal(plus.open,true,'Le menu Plus mobile s’ouvre');
        assert.equal(plus.overflow,false,'Le menu Plus ne provoque aucun débordement horizontal');
        const plusShot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
        writeFileSync(resolve(visualArtifacts,'convergence-owner-mobile-plus.png'),Buffer.from(plusShot.data,'base64'));
        await tab.evaluate(`(()=>{const dialog=document.querySelector('#socleMobileMoreDialog');if(dialog?.open)dialog.close()})()`,'convergence-plus-close');
      }
    }
    const shot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true});
    writeFileSync(resolve(visualArtifacts,role.toLowerCase()+'-'+viewport.name+'.png'),Buffer.from(shot.data,'base64'));
    metrics.portals=portals;
    outputs[viewport.name]={...metrics,workerWeather,ownerHome};
  }
  return outputs;
}

async function validateOwnerPlanningUi(tab){
  const viewports=[
    {name:'desktop-1440',width:1440,height:1000,mobile:false},
    {name:'mobile-375',width:375,height:844,mobile:true},
    {name:'mobile-390',width:390,height:844,mobile:true},
    {name:'mobile-430',width:430,height:900,mobile:true}
  ],results={};
  for(const viewport of viewports){
    await tab.call('Emulation.setDeviceMetricsOverride',{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:viewport.mobile,screenWidth:viewport.width,screenHeight:viewport.height});
    await tab.call('Emulation.setTouchEmulationEnabled',{enabled:viewport.mobile,maxTouchPoints:viewport.mobile?5:1});
    const probe=await tab.evaluate(`(async()=>{
      const wait=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      navigate('home');await wait();
      const homeWeather=document.querySelectorAll('#main .ia-home-weather,#main .personal-weather,#main .weather-dashboard').length;
      navigate('planning');await wait();
      const deadline=Date.now()+4000;while(!document.querySelector('#main .ia-b-view-switch')&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
      const week=[...document.querySelectorAll('#main .ia-b-view-switch button')].find(button=>button.textContent.trim()==='Semaine');if(week&&!week.classList.contains('selected')){week.click();await wait()}
      const group=document.querySelector('#main .ia-b-view-switch'),buttons=[...group?.querySelectorAll('button')||[]],rects=buttons.map(button=>button.getBoundingClientRect()),active=buttons.filter(button=>button.classList.contains('selected')||button.getAttribute('aria-pressed')==='true'),inactive=buttons.find(button=>!active.includes(button));
      return{homeWeather,planningWeather:document.querySelectorAll('#main .ia-home-weather,#main .personal-weather,#main .weather-dashboard').length,labels:buttons.map(button=>button.textContent.trim()),active:active.map(button=>button.textContent.trim()),sameLine:rects.length===3&&Math.max(...rects.map(rect=>rect.top))-Math.min(...rects.map(rect=>rect.top))<2,buttonsClipped:buttons.some(button=>button.scrollWidth>button.clientWidth+1),overflow:document.documentElement.scrollWidth>window.innerWidth,activeBg:active[0]?getComputedStyle(active[0]).backgroundColor:'',inactiveBg:inactive?getComputedStyle(inactive).backgroundColor:'',actions:[...document.querySelectorAll('#main .ia-b-actions>.btn')].map(button=>button.textContent.trim()),groupWidth:Math.round(group?.getBoundingClientRect().width||0),viewport:window.innerWidth};
    })()`,'planning-owner-ui-02:'+viewport.name);
    assert.ok(probe.homeWeather>=1,'OWNER Accueil conserve la météo '+viewport.name);
    assert.equal(probe.planningWeather,0,'OWNER Planning ne rend aucune météo '+viewport.name);
    assert.deepEqual(probe.labels,['Jour','Semaine','Mois'],'Sélecteur Planning complet '+viewport.name);
    assert.deepEqual(probe.active,['Semaine'],'Semaine reste l’état actif '+viewport.name);
    assert.equal(probe.sameLine,true,'Jour/Semaine/Mois restent sur une ligne '+viewport.name);
    assert.equal(probe.buttonsClipped,false,'Aucune option du sélecteur n’est coupée '+viewport.name);
    assert.equal(probe.overflow,false,'Planning OWNER sans débordement horizontal '+viewport.name);
    assert.notEqual(probe.activeBg,probe.inactiveBg,'L’état actif est visuellement distinct '+viewport.name);
    assert.deepEqual(probe.actions,['+ Affecter','+ Indisponibilité','Chef d’équipe','Bloquer chantier','Replanifier'],'Les actions OWNER Planning restent présentes '+viewport.name);
    const shot=await tab.call('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
    writeFileSync(resolve(visualArtifacts,'planning-owner-ui-02-'+viewport.name+'.png'),Buffer.from(shot.data,'base64'));
    results[viewport.name]=probe;
  }
  return results;
}
async function session(email,role){
  const tab=await browser.createSession(base);sessions.push(tab);
  await tab.navigate(base);
  const login=`fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:${JSON.stringify(email)}})}).then(response=>response.status)`;
  const logged=await tab.evaluate(login,'login:'+email);
  assert.equal(logged,204,'La session navigateur doit être confirmée par le serveur : '+email);
  await tab.reload();
  await waitForApp(tab);
  const expression=`(async()=>{
    console.info('IDENTITY_PROBE_STAGE=state');
    const stateResponse=await fetch('/api/state');
    const state=await stateResponse.json();
    console.info('IDENTITY_PROBE_STAGE=projects');
    const visibleIds=(state.state?.jobs||[]).map(job=>String(job.id)).sort();
    const visibleRefs=(state.state?.jobs||[]).map(job=>String(job.reference)).sort();
    const probes=['BATXL-PRJ-02000','BATXL-PRJ-02001','BATXL-PRJ-02002','BATXL-PRJ-02003','BATXL-PRJ-02007'];
    const projectStatuses=Object.fromEntries(await Promise.all(probes.map(async id=>[id,(await fetch('/api/projects/'+encodeURIComponent(id))).status])));
    const navButtons=[...document.querySelectorAll('#nav button')],planningButtons=navButtons.filter(button=>button.textContent.trim()==='Planning');
    const planningNavigation={planningCount:planningButtons.length,activeCount:navButtons.filter(button=>button.classList.contains('active')||button.getAttribute('aria-current')==='page').length,legacyActiveCount:0,available:planningButtons.length===1,opensCanonical:false,legacyRedirects:false};
    const expectedPlanningHeading=${JSON.stringify(role==='WORKER'?'Mon planning':'Planning')};
    if(planningNavigation.available){
      navigate('planning');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      planningNavigation.opensCanonical=view==='planning'&&document.querySelector('#main .heading h1')?.textContent.trim()===expectedPlanningHeading;
      planningNavigation.activeCount=[...document.querySelectorAll('#nav button')].filter(button=>button.classList.contains('active')||button.getAttribute('aria-current')==='page').length;
      navigate('schedule');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      planningNavigation.legacyRedirects=view==='planning'&&document.querySelector('#main .heading h1')?.textContent.trim()===expectedPlanningHeading;
      planningNavigation.legacyActiveCount=[...document.querySelectorAll('#nav button')].filter(button=>button.classList.contains('active')||button.getAttribute('aria-current')==='page').length;
    }
    console.info('IDENTITY_PROBE_STAGE=complete');
    return {
      stateStatus:stateResponse.status,
      visibleIds,
      visibleRefs,
      accounting:!!state.state?.accountingData,
      readOnly:state.readOnly,
      nav:[...document.querySelectorAll('#nav button')].map(x=>x.textContent.trim()),
      planningNavigation,
      projectStatuses
    };
  })()`;
  const result=await tab.evaluate(expression,'identity-probes:'+email);
  const visual=await captureVisual(tab,role);
  const planningOwnerUi=role==='OWNER'?await validateOwnerPlanningUi(tab):null;
  await tab.close();
  return {result,visual,planningOwnerUi};
}

try{
  const marc=await session('direction@batinova.example','OWNER');
  const david=await session('david.leclercq@batinova.example','TEAM_LEAD');
  const anthony=await session('anthony.simon@batinova.example','WORKER');
  const sophie=await session('batxl.accounting@simulation.invalid','ACCOUNTING');
  assert.equal(marc.result.stateStatus,200);
  assert.equal(marc.result.readOnly,false);
  assert.equal(marc.result.accounting,true);
  assert.equal(marc.result.visibleIds.length,15);
  assert.equal(marc.result.projectStatuses['BATXL-PRJ-02003'],200);

  for(const [role,result] of Object.entries({OWNER:marc.result,TEAM_LEAD:david.result,WORKER:anthony.result,ACCOUNTING:sophie.result})){
    assert.ok(result.planningNavigation.planningCount<=1,'Planning ne doit pas apparaître deux fois pour '+role);
    assert.ok(result.planningNavigation.activeCount<=1,'Une seule rubrique doit être active pour '+role);
    if(result.planningNavigation.available){assert.equal(result.planningNavigation.opensCanonical,true,'Le lien Planning ouvre la nouvelle vue pour '+role);assert.equal(result.planningNavigation.activeCount,1,'Un seul élément Planning est actif pour '+role);assert.equal(result.planningNavigation.legacyRedirects,true,'L’ancienne route schedule redirige vers Planning pour '+role);assert.equal(result.planningNavigation.legacyActiveCount,1,'La redirection active une seule rubrique pour '+role)}
  }

  const teamProjects=['BATXL-PRJ-02000','BATXL-PRJ-02001','BATXL-PRJ-02002','BATXL-PRJ-02007'];
  const teamRefs=['BATXL-CHANTIER-02000','BATXL-CHANTIER-02001','BATXL-CHANTIER-02002','BATXL-CHANTIER-02007'];

  assert.deepEqual(david.result.visibleIds,teamProjects);
  assert.deepEqual(david.result.visibleRefs,teamRefs);
  assert.equal(david.result.accounting,false);
  assert.equal(david.result.projectStatuses['BATXL-PRJ-02000'],200);
  assert.equal(david.result.projectStatuses['BATXL-PRJ-02007'],200);
  assert.equal(david.result.projectStatuses['BATXL-PRJ-02003'],403);
  assert.ok(david.result.nav.includes('Chantiers'));
  assert.ok(!david.result.nav.includes('Comptabilité'));

  assert.deepEqual(anthony.result.visibleIds,teamProjects);
  assert.deepEqual(anthony.result.visibleRefs,teamRefs);
  assert.equal(anthony.result.accounting,false);
  assert.equal(anthony.result.projectStatuses['BATXL-PRJ-02000'],200);
  assert.equal(anthony.result.projectStatuses['BATXL-PRJ-02003'],403);
  assert.ok(anthony.result.nav.includes('Chantiers'));
  assert.ok(!anthony.result.nav.includes('Comptabilité'));

  assert.deepEqual(sophie.result.visibleIds,[]);
  assert.deepEqual(sophie.result.visibleRefs,[]);
  assert.equal(sophie.result.accounting,true);
  assert.equal(sophie.result.projectStatuses['BATXL-PRJ-02000'],403);
  assert.equal(sophie.result.projectStatuses['BATXL-PRJ-02001'],403);
  assert.equal(sophie.result.projectStatuses['BATXL-PRJ-02002'],403);
  assert.equal(sophie.result.projectStatuses['BATXL-PRJ-02003'],403);
  assert.equal(sophie.result.projectStatuses['BATXL-PRJ-02007'],403);
  assert.ok(sophie.result.nav.includes('Comptabilité'));
  assert.ok(!sophie.result.nav.includes('Chantiers'));

  console.log('browser-identities-15: PASS — OWNER global; TEAM_LEAD/WORKER E1 scoped; ACCOUNTING Finance sans project_access');
  console.log('BROWSER_ROLE_RESULTS='+JSON.stringify({OWNER:marc.result,TEAM_LEAD:david.result,WORKER:anthony.result,ACCOUNTING:sophie.result}));
  console.log('IA_A_VISUAL_RESULTS='+JSON.stringify({OWNER:marc.visual,TEAM_LEAD:david.visual,WORKER:anthony.visual,ACCOUNTING:sophie.visual}));
}finally{
  try{await Promise.all(sessions.map(tab=>tab.close()))}finally{await browser.close()}
}
