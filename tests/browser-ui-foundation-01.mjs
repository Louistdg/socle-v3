import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import esbuild from 'esbuild';
import {connectBrowser,waitForApp} from './helpers/browser-cdp.mjs';
import {contrastRatio} from './helpers/color-contrast.mjs';

if(!process.env.SOCLE_CDP_URL){
  console.log('browser-ui-foundation-01: SKIP hors Browser Gate');
  process.exit(0);
}

const base=String(process.env.SOCLE_TEST_URL||'http://127.0.0.1:4386').replace(/\/$/,'');
const themes=['olive','forest','slate','night','graphite','earth','moss','aubergine','high-contrast','chalk'];
const widths=[[1440,1000],[430,844],[390,844],[375,667]];
const browser=await connectBrowser(base);
const tab=await browser.createSession(base);

function sameGeometry(actual,expected,label){
  assert.deepEqual(actual.rects,expected.rects,'géométrie identique entre thèmes: '+label);
  assert.deepEqual(actual.structure,expected.structure,'spacing/radius/typographie invariants: '+label);
}
function checkContrast(sample,label,minimum=4.5){
  const ratio=contrastRatio(sample.color,sample.background);
  assert.ok(ratio>=minimum,'contraste '+ratio.toFixed(2)+' < '+minimum+': '+label+' ('+sample.color+' sur '+sample.background+')');
}

try{
  await tab.navigate(base);
  const login=await tab.evaluate("fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'direction@batinova.example'})}).then(r=>r.status)",'ui-foundation-login');
  assert.equal(login,204);
  await tab.reload();
  await waitForApp(tab,'local-owner');

  const api=await tab.evaluate("Object.keys(SocleUI).filter(k=>k!=='version').sort()", 'ui-foundation-api');
  assert.deepEqual(api,['CompactFilterBar','ContentSection','ContentStage','ContextLine','DetailDrilldown','KpiStrip','PageHeader','PageShell','PrimaryAction','fromLegacyMarkup','renderHTML']);

  // Independent cascade contract: changing build order or omitting a source must fail.
const cssSources=['offline.css','design-tokens.css','style.css','organization.css','planning.css','ia-a-ui.css','ui-foundation.css','stock-catalog-v2.css','stock-barcode.css','profile-avatar.css','mobile-nav.css','v3.css','v3-themes.css','quote-roofing-metre.css','document-triage.css','task-board.css','field-journal.css','audit-release.css','mobile-audit.css','design-system.css'];
const cssSourceBodies=await Promise.all(cssSources.map(name=>readFile(new URL('../web/'+name,import.meta.url),'utf8').then(text=>text.replace(/\r\n/g,'\n'))));
const expectedCSS=(await esbuild.transform(cssSourceBodies.join('\n'),{loader:'css',minify:true,legalComments:'inline'})).code;
  const snapshots=new Map();
  const palettes=[];
  for(const [width,height] of widths){
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600,screenWidth:width,screenHeight:height});
    const pageIntegrity=await tab.evaluate(`(()=>{
      const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_TEXT);
      const parasite=[];
      for(let node=walker.nextNode();node;node=walker.nextNode()){
        if(node.nodeValue.includes(String.fromCharCode(92)+'n'))parasite.push(node.nodeValue);
      }
      const css=[...document.styleSheets];
      return{
        parasite,
        visibleParasite:document.body.innerText.includes(String.fromCharCode(92)+'n'),
        cssLoaded:css.some(sheet=>sheet.href&&new URL(sheet.href).pathname==='/socle.css'&&!sheet.disabled&&sheet.cssRules.length>0),
        hrefs:css.map(sheet=>sheet.href)

      };
    })()`,'ui-foundation-page-integrity-'+width);
    assert.deepEqual(pageIntegrity.parasite,[],'aucun text node parasite littéral \\n à '+width+'px');
    assert.equal(pageIntegrity.visibleParasite,false,'aucun littéral \\n visible à '+width+'px');
    assert.equal(pageIntegrity.cssLoaded,true,'CSS de base et Foundation chargés à '+width+'px');
    const servedCSS=await tab.evaluate(`fetch('/socle.css',{cache:'no-store'}).then(async response=>({status:response.status,type:response.headers.get('content-type'),body:await response.text()}))`,'ui-foundation-served-css-'+width);
    assert.equal(servedCSS.status,200,'CSS servi avec succès');
    assert.ok(servedCSS.type?.includes('text/css'),'Type CSS correct');
    assert.ok(servedCSS.body===expectedCSS,'Toutes les feuilles sources sont servies intégralement dans l’ordre canonique à '+width+'px');
    console.log('CSS_CASCADE_PROOF='+JSON.stringify({width,hrefs:pageIntegrity.hrefs,loaded:pageIntegrity.cssLoaded,sources:cssSources,exactBundleMatch:true}));
    for(const theme of themes){
      const result=await tab.evaluate(`(async()=>{
        iaAApplyTheme(${JSON.stringify(theme)},false);
        let host=document.querySelector('#ui-foundation-test-host');
        if(!host){
          host=document.createElement('div');
          host.id='ui-foundation-test-host';
          host.style.cssText='position:fixed;inset:0;z-index:2147483000;overflow:auto;box-sizing:border-box;background:var(--ds-background);color:var(--ds-text-primary)';
          document.body.appendChild(host);
        }
        host.replaceChildren();

        const search=document.createElement('input');
        search.type='search';
        search.placeholder='Rechercher';
        search.dataset.label='Recherche';

        const status=document.createElement('select');
        status.dataset.label='Statut';
        for(const value of ['Tous','Actifs','Terminés']){
          const option=document.createElement('option');
          option.value=value;option.textContent=value;status.appendChild(option);
        }

        const action=SocleUI.PrimaryAction({label:'Action principale',ariaLabel:'Action principale'});
        const header=SocleUI.PageHeader({
          title:'Fondation UI',
          subtitle:'Contrat commun sans logique métier',
          context:SocleUI.ContextLine({items:['Entreprise active','Période courante']}),
          actions:[action]
        });
        const filters=SocleUI.CompactFilterBar({label:'Filtres de démonstration',controls:[search,status]});
        const kpis=SocleUI.KpiStrip({items:[
          {label:'À traiter',value:'12',detail:'Priorité du jour',status:'warning'},
          {label:'En cours',value:'8',detail:'Éléments actifs',status:'info'},
          {label:'Terminés',value:'27',detail:'Ce mois',status:'success'}
        ]});

        const list=document.createElement('div');
        list.textContent='Contenu principal synthétique';
        const detailOpen=document.createElement('button');
        detailOpen.type='button';
        detailOpen.textContent='Ouvrir le détail';
        detailOpen.setAttribute('data-ui-detail-open','ui-foundation-detail');
        detailOpen.setAttribute('aria-controls','ui-foundation-detail');
        const content=SocleUI.ContentSection({title:'Section active',description:'Une seule section métier principale.',children:[list,detailOpen]});

        const detailCopy=document.createElement('p');
        detailCopy.textContent='Détail contextuel sans changer le contexte de page.';
        const detail=SocleUI.DetailDrilldown({id:'ui-foundation-detail',title:'Détail',description:'Drill-down canonique',children:[detailCopy]});
        const stage=SocleUI.ContentStage({content,detail});

        const shell=SocleUI.PageShell({label:'Fixture UI Foundation',children:[header,filters,kpis,stage]});
        host.appendChild(shell);
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

        function rect(selector){
          const node=host.querySelector(selector);
          if(!node)throw Error('Fixture UI Foundation incomplète: '+selector);
          const r=node.getBoundingClientRect();
          return{x:+r.x.toFixed(2),y:+r.y.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)};
        }
        function structural(selector){
          const node=host.querySelector(selector);
          if(!node)throw Error('Fixture UI Foundation incomplète: '+selector);
          const style=getComputedStyle(node);
          return{
            display:style.display,
            gap:style.gap,
            padding:style.padding,
            borderRadius:style.borderRadius,
            fontSize:style.fontSize,
            minHeight:style.minHeight
          };
        }
        function paintedBackground(node){
          for(let current=node;current;current=current.parentElement){
            const value=getComputedStyle(current).backgroundColor;
            if(value&&value!=='rgba(0, 0, 0, 0)'&&value!=='transparent')return value;
          }
          return getComputedStyle(document.body).backgroundColor;
        }
        function sample(selector){
          const node=host.querySelector(selector);
          if(!node)throw Error('Fixture UI Foundation incomplète: '+selector);
          const style=getComputedStyle(node);
          return{color:style.color,background:paintedBackground(node),border:style.borderTopColor};
        }

        const bodyStyle=getComputedStyle(document.body);
        const palette={};
        for(const name of ['background','surface-1','surface-2','surface-3','text-primary','text-secondary','border','accent','focus-ring']){
          palette[name]=bodyStyle.getPropertyValue('--ds-'+name).trim();
        }

        const selectors=['.ui-page-shell','.ui-page-header','.ui-page-title','.ui-context-line','.ui-primary-action','.ui-compact-filter-bar','.ui-kpi-strip','.ui-content-stage','.ui-content-section','.ui-detail-drilldown'];
        const detailClose=host.querySelector('.ui-detail-drilldown__close');
        const detailCloseDisplay=getComputedStyle(detailClose).display;
        const focusProbe=host.querySelector('[data-ui-detail-open]');
        focusProbe.focus();
        detailClose.focus();
        const detailCloseFocusable=document.activeElement===detailClose;
        focusProbe.blur();
        const rects=Object.fromEntries(selectors.map(selector=>[selector,rect(selector)]));
        const structure=Object.fromEntries(selectors.map(selector=>[selector,structural(selector)]));
        const controls=[...host.querySelectorAll('.ui-filter-control input,.ui-filter-control select')].map(node=>{
          const style=getComputedStyle(node),bounds=node.getBoundingClientRect();
          return{height:bounds.height,color:style.color,background:paintedBackground(node),border:style.borderTopColor};
        });
        return{
          width:innerWidth,
          theme:document.body.dataset.socleTheme,
          rects,
          structure,
          palette,
          controls,
          visual:{
            title:sample('.ui-page-title'),
            context:sample('.ui-context-line'),
            action:sample('.ui-primary-action'),
            content:sample('.ui-content-section'),
            detail:sample('.ui-detail-drilldown')
          },
          primaryCount:host.querySelectorAll('.ui-primary-action').length,
          overflow:host.scrollWidth>host.clientWidth+1,
          shellCount:host.querySelectorAll('[data-ui-foundation="PageShell"]').length,
          componentCount:host.querySelectorAll('[data-ui-foundation]').length,
          shellPadding:getComputedStyle(host.querySelector('.ui-page-shell')).paddingLeft,
          detailDisplay:getComputedStyle(host.querySelector('.ui-detail-drilldown')).display,
          detailCloseDisplay,
          detailCloseFocusable
        };
      })()`,'ui-foundation-'+theme+'-'+width);

      assert.equal(result.theme,theme,'thème appliqué: '+theme+'/'+width);
      assert.equal(result.overflow,false,'aucun overflow horizontal: '+theme+'/'+width);
      assert.equal(result.primaryCount,1,'une seule action primaire: '+theme+'/'+width);
      assert.equal(result.shellCount,1,'un seul PageShell canonique: '+theme+'/'+width);
      assert.ok(result.componentCount>=9,'primitives de page et composition rendues: '+theme+'/'+width);
      const expectedShellPadding=width<=375?12:width<761?16:24;
      assert.equal(Number.parseFloat(result.shellPadding),expectedShellPadding,'PageShell autonome porte son padding horizontal: '+theme+'/'+width);

      const actionHeight=result.rects['.ui-primary-action'].height;
      assert.ok(actionHeight>=44,'action primaire >=44px: '+theme+'/'+width);
      for(const control of result.controls){
        assert.ok(control.height>=44,'contrôle filtre >=44px: '+theme+'/'+width);
        checkContrast(control,'contrôle filtre '+theme+'/'+width);
        assert.ok(contrastRatio(control.border,control.background)>=3,'bordure contrôle >=3:1: '+theme+'/'+width);
      }
      if(width<600){
        assert.ok(actionHeight>=44,'action primaire mobile >=44px: '+theme+'/'+width);
        for(const control of result.controls)assert.ok(control.height>=44,'contrôle filtre mobile >=44px: '+theme+'/'+width);
      }

      for(const [name,value] of Object.entries(result.palette))assert.ok(value,'token palette résolu '+name+': '+theme+'/'+width);
      for(const [name,sample] of Object.entries(result.visual))checkContrast(sample,name+' '+theme+'/'+width);

      const contentRect=result.rects['.ui-content-section'],detailRect=result.rects['.ui-detail-drilldown'];
      if(width>=761){
        assert.ok(detailRect.x>contentRect.x,'drill-down latéral desktop: '+theme+'/'+width);
        assert.ok(Math.abs(detailRect.y-contentRect.y)<=1,'drill-down aligné desktop: '+theme+'/'+width);
        assert.equal(result.detailCloseDisplay,'none','retour masqué lorsque le détail est persistant: '+theme+'/'+width);
        assert.equal(result.detailCloseFocusable,false,'aucun bouton retour desktop sans action: '+theme+'/'+width);
      }else{
        assert.equal(result.detailDisplay,'none','drill-down mobile fermé par défaut: '+theme+'/'+width);
        assert.ok(detailRect.width===0&&detailRect.height===0,'détail mobile retiré du flux principal tant qu’il est fermé: '+theme+'/'+width);
      }

      const key=String(width);
      if(!snapshots.has(key))snapshots.set(key,result);
      else sameGeometry(result,snapshots.get(key),theme+'/'+width);
      palettes.push({width,theme,palette:result.palette});
    }
  }

  for(const width of [430,390,375]){
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:844});
    const drilldown=await tab.evaluate(`(async()=>{
      const trigger=document.querySelector('[data-ui-detail-open="ui-foundation-detail"]');
      const detail=document.querySelector('#ui-foundation-detail');
      const stage=detail.closest('.ui-content-stage');
      const initial=getComputedStyle(detail).display;
      trigger.click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const opened={display:getComputedStyle(detail).display,open:detail.dataset.mobileOpen,role:detail.getAttribute('role'),modal:detail.getAttribute('aria-modal'),stageOpen:stage.dataset.mobileDetailOpen,focus:document.activeElement.getAttribute('data-ui-detail-close'),contentInert:trigger.closest('.ui-content-section').inert,overflow:document.body.style.overflow};
      const close=detail.querySelector('[data-ui-detail-close]');
      const closeVisible=Boolean(close&&close.getClientRects().length);
      close.click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const buttonClose={open:detail.dataset.mobileOpen,role:detail.getAttribute('role'),stageClosed:!stage.hasAttribute('data-mobile-detail-open'),focusRestored:document.activeElement===trigger};
      trigger.click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      return{initial,opened,closeVisible,buttonClose,closed:detail.dataset.mobileOpen,focusRestored:document.activeElement===trigger,stageClosed:!stage.hasAttribute('data-mobile-detail-open'),triggerActive:!trigger.inert,overflowRestored:document.body.style.overflow!== 'hidden'};
    })()`,'ui-foundation-detail-mobile-'+width);
    assert.equal(drilldown.initial,'none','détail mobile hors du flux avant ouverture '+width);
    assert.equal(drilldown.opened.display,'block','détail mobile en plein écran '+width);
    assert.equal(drilldown.opened.open,'true','ouverture explicite du détail '+width);
    assert.equal(drilldown.opened.role,'dialog','sémantique dialog au drill-down '+width);
    assert.equal(drilldown.opened.modal,'true','contexte modal du détail '+width);
    assert.equal(drilldown.opened.stageOpen,'ui-foundation-detail','composition ContentStage progressive '+width);
    assert.equal(drilldown.opened.focus,'ui-foundation-detail','focus initial sur retour clair '+width);
    assert.equal(drilldown.closeVisible,true,'bouton retour visible dans le détail mobile ouvert '+width);
    assert.equal(drilldown.buttonClose.open,'false','bouton retour ferme réellement le détail '+width);
    assert.equal(drilldown.buttonClose.role,'region','retour bouton restaure le rôle non modal '+width);
    assert.equal(drilldown.buttonClose.stageClosed,true,'retour bouton restaure la liste '+width);
    assert.equal(drilldown.buttonClose.focusRestored,true,'retour bouton restaure le focus déclencheur '+width);
    assert.equal(drilldown.opened.contentInert,true,'liste inactive pendant le détail '+width);
    assert.equal(drilldown.closed,'false','Escape ferme le détail '+width);
    assert.equal(drilldown.focusRestored,true,'focus restauré sur la liste '+width);
    assert.equal(drilldown.stageClosed,true,'liste restaurée après détail '+width);
    assert.equal(drilldown.triggerActive,true,'liste de nouveau interactive '+width);
    assert.equal(drilldown.overflowRestored,true,'scroll restauré après détail '+width);
  }

  // Palette switching is verified by browser-v3-theme-visual-01.mjs against
  // the seven visible V3 themes. This fixture checks geometry and contrast of
  // the shared UI primitives; its legacy IA theme IDs are not the V3 picker.

  await tab.evaluate("document.querySelector('#ui-foundation-test-host')?.remove();true",'ui-foundation-fixture-cleanup');
  await tab.call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false,screenWidth:1440,screenHeight:1000});
  await tab.evaluate("resetAssetFilters();navigate('fleet');true",'ui-foundation-assets-desktop-open');
  const assetsDesktop=await tab.evaluate(`(()=>{
    const categories=document.querySelector('.asset-categories')?.getBoundingClientRect();
    const barNode=document.querySelector('.assets-filter-bar');
    const bar=barNode?.getBoundingClientRect();
    const action=document.querySelector('.assets-filter-bar .ui-primary-action');
    const toggle=document.querySelector('.assets-filter-bar .ui-filter-sheet-toggle');
    const labels=[...document.querySelectorAll('.assets-filter-bar label')].map(node=>node.textContent.trim());
    return{
      barHeight:bar?.height||0,
      gap:categories&&bar?bar.top-categories.bottom:999,
      actionText:action?.textContent.trim()||'',
      actionRight:action?.getBoundingClientRect().right||0,
      barRight:bar?.right||0,
      toggleDisplay:toggle?getComputedStyle(toggle).display:'',
      canonical:barNode?.dataset.uiFoundation||'',
      actionCanonical:action?.dataset.uiFoundation||'',
      contextCanonical:document.querySelector('.assets-filter-summary')?.dataset.uiFoundation||'',
      labels,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      rows:document.querySelectorAll('.ia-asset-list .ia-asset-row').length
    };
  })()`,'ui-foundation-assets-desktop-measure');
  assert.ok(assetsDesktop.gap<=20,'Biens & matériel: espace mort sous compteurs supprimé');
  assert.ok(assetsDesktop.barHeight>0&&assetsDesktop.barHeight<112,'Biens & matériel: CompactFilterBar reste compact desktop ('+assetsDesktop.barHeight+'px)');
  assert.equal(assetsDesktop.actionText,'+ Ajouter un bien','Biens & matériel: PrimaryAction stable');
  assert.equal(assetsDesktop.canonical,'CompactFilterBar','Biens & matériel: vraie structure CompactFilterBar consommée');
  assert.equal(assetsDesktop.actionCanonical,'PrimaryAction','Biens & matériel: vraie PrimaryAction consommée');
  assert.equal(assetsDesktop.contextCanonical,'ContextLine','Biens & matériel: vraie ContextLine consommée');
  assert.ok(Math.abs(assetsDesktop.barRight-assetsDesktop.actionRight)<=20,'Biens & matériel: PrimaryAction alignée à droite');
  assert.equal(assetsDesktop.toggleDisplay,'none','Biens & matériel: bottom-sheet toggle masqué desktop');
  for(const label of ['Recherche','Type','État','Rattachement','Suivi'])assert.ok(assetsDesktop.labels.includes(label),'Biens & matériel: filtre '+label+' présent');
  assert.equal(assetsDesktop.overflow,false,'Biens & matériel: aucun overflow desktop');
  assert.ok(assetsDesktop.rows>0,'Biens & matériel: lignes présentes avant filtrage');

  const searchFiltered=await tab.evaluate(`(()=>{
    setAssetSearch('Crafter');
    return{
      value:document.querySelector('#asset-search')?.value||'',
      rows:document.querySelectorAll('.ia-asset-list .ia-asset-row').length,
      names:[...document.querySelectorAll('.ia-asset-list .ia-asset-row .ia-asset-copy strong')].map(node=>node.textContent)
    };
  })()`,'ui-foundation-assets-search');
  assert.equal(searchFiltered.value,'Crafter','Biens & matériel: recherche conservée après rendu');
  assert.ok(searchFiltered.rows>=1&&searchFiltered.names.every(name=>/crafter/i.test(name)),'Biens & matériel: recherche texte filtre les lignes');

  await tab.evaluate("resetAssetFilters();true",'ui-foundation-assets-reset');
  for(const width of [430,390,375]){
    await tab.call('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:844});
    await tab.evaluate("resetAssetFilters();navigate('fleet');true",'ui-foundation-assets-mobile-open-'+width);
    const mobile=await tab.evaluate(`(async()=>{
      const toggle=document.querySelector('.assets-filter-bar .ui-filter-sheet-toggle');
      const sheet=document.querySelector('#asset-filter-sheet');
      const action=document.querySelector('.assets-filter-bar .ui-primary-action');
      const before=getComputedStyle(sheet).display;
      toggle.click();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const style=getComputedStyle(sheet);
      const labels=[...sheet.querySelectorAll('label')].map(node=>node.textContent.trim());
      const initial={
        toggleDisplay:getComputedStyle(toggle).display,
        before,
        open:sheet.dataset.open,
        display:style.display,
        position:style.position,
        role:sheet.getAttribute('role'),
        modal:sheet.getAttribute('aria-modal'),
        labelledBy:sheet.getAttribute('aria-labelledby'),
        ariaHidden:sheet.getAttribute('aria-hidden'),
        expanded:toggle.getAttribute('aria-expanded'),
        focus:document.activeElement.id,
        inert:document.querySelector('.asset-categories').inert,
        bodyOverflow:document.body.style.overflow,
        labels,
        actionText:action?.textContent.trim()||'',
        overflow:document.documentElement.scrollWidth>innerWidth+1
      };
      const close=sheet.querySelector('.ui-filter-sheet-close');
      const lastFocusable=[...sheet.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(node=>node.getClientRects().length>0).at(-1);
      close.focus();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
      const shiftWrap=document.activeElement===lastFocusable;
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
      const forwardWrap=document.activeElement===close;
      if(innerWidth===430)document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      else if(innerWidth===390)close.click();
      else sheet.querySelector('.ui-filter-sheet__backdrop').click();
      const closed={open:sheet.dataset.open,role:sheet.getAttribute('role'),modal:sheet.getAttribute('aria-modal'),ariaHidden:sheet.getAttribute('aria-hidden'),expanded:toggle.getAttribute('aria-expanded'),focusRestored:document.activeElement===toggle,inertRestored:!document.querySelector('.asset-categories').inert,bodyOverflow:document.body.style.overflow};
      let changed=null;
      if(innerWidth===430){
        toggle.click();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        const select=document.querySelector('#asset-filter-type');
        select.selectedIndex=1;
        const selected=select.value;
        select.dispatchEvent(new Event('change',{bubbles:true}));
        changed={selected,open:document.querySelector('#asset-filter-sheet').dataset.open,ariaModal:document.querySelector('#asset-filter-sheet').getAttribute('aria-modal'),bodyOverflow:document.body.style.overflow,inert:document.querySelector('.asset-categories').inert,selectedAfterRender:document.querySelector('#asset-filter-type').value};
      }
      return{initial,shiftWrap,forwardWrap,closed,changed};
    })()`,'ui-foundation-assets-mobile-measure-'+width);
    assert.notEqual(mobile.initial.toggleDisplay,'none','Biens & matériel: contrôle Filtres visible '+width);
    assert.equal(mobile.initial.before,'none','Biens & matériel: bottom sheet fermé par défaut '+width);
    assert.equal(mobile.initial.open,'true','Biens & matériel: bottom sheet ouvert '+width);
    assert.notEqual(mobile.initial.display,'none','Biens & matériel: bottom sheet rendu '+width);
    assert.equal(mobile.initial.position,'fixed','Biens & matériel: bottom sheet fixé '+width);
    assert.equal(mobile.initial.role,'dialog','Biens & matériel: bottom sheet dialog '+width);
    assert.equal(mobile.initial.modal,'true','Biens & matériel: bottom sheet modal '+width);
    assert.ok(mobile.initial.labelledBy,'Biens & matériel: bottom sheet titré accessible '+width);
    assert.equal(mobile.initial.ariaHidden,'false','Biens & matériel: dialogue exposé à l’ouverture '+width);
    assert.equal(mobile.initial.expanded,'true','Biens & matériel: bouton état ouvert '+width);
    assert.ok(mobile.initial.focus.startsWith('asset-filter-'),'Biens & matériel: focus initial dans un filtre '+width);
    assert.equal(mobile.initial.inert,true,'Biens & matériel: arrière-plan inert '+width);
    assert.equal(mobile.initial.bodyOverflow,'hidden','Biens & matériel: scroll arrière-plan bloqué '+width);
    for(const label of ['Type','État','Rattachement','Suivi'])assert.ok(mobile.initial.labels.includes(label),'Biens & matériel: '+label+' dans bottom sheet '+width);
    assert.equal(mobile.initial.actionText,'+ Ajouter un bien','Biens & matériel: PrimaryAction mobile stable '+width);
    assert.equal(mobile.initial.overflow,false,'Biens & matériel: aucun overflow mobile '+width);
    assert.equal(mobile.shiftWrap,true,'Biens & matériel: Shift+Tab reste dans le modal '+width);
    assert.equal(mobile.forwardWrap,true,'Biens & matériel: Tab reste dans le modal '+width);
    assert.equal(mobile.closed.open,'false','Biens & matériel: fermeture clavier/tactile '+width);
    assert.equal(mobile.closed.role,'group','Biens & matériel: sémantique restaurée à la fermeture '+width);
    assert.equal(mobile.closed.modal,null,'Biens & matériel: aria-modal retiré à la fermeture '+width);
    assert.equal(mobile.closed.ariaHidden,'true','Biens & matériel: sheet masqué après fermeture '+width);
    assert.equal(mobile.closed.expanded,'false','Biens & matériel: état du bouton restauré '+width);
    assert.equal(mobile.closed.focusRestored,true,'Biens & matériel: focus rendu au déclencheur '+width);
    assert.equal(mobile.closed.inertRestored,true,'Biens & matériel: arrière-plan réactivé '+width);
    assert.notEqual(mobile.closed.bodyOverflow,'hidden','Biens & matériel: scroll restauré '+width);
    if(width===430){
      assert.ok(mobile.changed.selected,'Biens & matériel: sélection de filtre effectuée');
      assert.equal(mobile.changed.open,'false','Biens & matériel: sélection ferme le sheet avant rendu');
      assert.equal(mobile.changed.ariaModal,null,'Biens & matériel: sélection libère le contexte modal');
      assert.notEqual(mobile.changed.bodyOverflow,'hidden','Biens & matériel: scroll libéré après rendu');
      assert.equal(mobile.changed.inert,false,'Biens & matériel: arrière-plan réactivé après rendu');
      assert.equal(mobile.changed.selectedAfterRender,mobile.changed.selected,'Biens & matériel: filtre conservé après rendu');
    }
  }

  await tab.evaluate("navigate('home');render();true", 'ui-foundation-restore-view');
  console.log('UI_FOUNDATION_BROWSER_01=PASS '+JSON.stringify({themes:themes.length,widths:widths.map(item=>item[0]),geometry:'invariant',palette:'theme-only',contrast:'PASS',responsive:'PASS',assetsFilters:'PASS',overflow:'PASS'}));
}finally{
  await browser.close();
}
