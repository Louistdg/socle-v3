import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const ui=readFileSync(new URL('../web/ia-a-ui.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../web/ia-a-ui.css',import.meta.url),'utf8');
const v3Css=readFileSync(new URL('../web/v3.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');

const ctx={
  console,
  Intl,
  setTimeout,
  queueMicrotask:function(fn){fn()},
  view:'planning',
  sessionAccessKey:'owner',
  socleCurrentAccess:{userId:'owner',roleCode:'OWNER',owner:true},
  accessAssignments:{owner:{profile:'Patron',modules:{}}},
  serverAccessMembers:[],
  jobs:[],
  assignments:[],
  teams:[],
  people:[],
  reminders:[],
  tasks:[],
  accountingData:{customerInvoices:[],supplierBills:[]},
  stockItems:[{id:'fractional-stock',reference:'ST-1',name:'Pièces de test',quantity:104.80000000000001,unit:'pièce',unitCost:2,minimum:5,balances:[{location:'Dépôt',quantity:47.400000000000006}]}],
  stockLocations:[{id:'location-1',name:'Dépôt',type:'warehouse',status:'active'}],
  purchaseOrders:[],deliveryNotes:[],assets:[],
  iaAPersonalPortalSection:function(){return '<section class="ia-overview-personal-portals">Vos portails essentiels</section>'},
  personalPortalLinks:[
    {name:'My FGTB',url:'https://fgtb.example/'},{name:'Ma CSC',url:'https://csc.example/'},
    {name:'CGSLB — accès/dossier en ligne',url:'https://cgslb.example/'},{name:'MyCareer',url:'https://career.example/'},
    {name:'MyPension',url:'https://pension.example/'},{name:'My FGTB doublon',url:'https://fgtb.example/'}
  ],
  serverFinanceState:'ready',
  serverInvoices:[],
  serverExpenses:[],
  day:'2026-10-01',
  reference:'2026-10-01',
  tabs2:[['planning','Accueil'],['jobs','Chantiers'],['accounting','Comptabilité']],
  esc:function(value){return String(value)},
  jsString:function(value){return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'")},
  money:function(value){return String(value)},
  heading:function(title){return '<h1>'+title+'</h1>'},
  stockView:function(){return '<div>stock legacy</div>'},
  planning:function(){return'legacy'},
  navigate:function(){},
  canViewModule:function(){return true},
  render:function(){},
  document:{
    readyState:'complete',
    body:{dataset:{}},
    querySelector:function(){return null},
    querySelectorAll:function(){return[]},
    addEventListener:function(){}
  }
};
const storedThemes=new Map();
ctx.localStorage={getItem(key){return storedThemes.get(key)||null},setItem(key,value){storedThemes.set(key,String(value))}};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(ui,ctx);
assert.equal(ctx.iaAThemeId(),'moss','Mousse est le thème initial quand aucun choix n’est enregistré');
assert.equal(ctx.document.body.dataset.socleTheme,'moss','l’interface démarre avec la palette Mousse');
const stockHtml=ctx.stockView();
assert.ok(stockHtml.includes('104,8 pièce')&&stockHtml.includes('47,4'),'la liste Stock affiche des quantités lisibles');
assert.ok(!stockHtml.includes('104.80000000000001')&&!stockHtml.includes('47.400000000000006'),'la liste Stock masque les artefacts flottants');
ctx.localStorage.setItem('socle.theme','forest');
assert.equal(ctx.iaAThemeId(),'forest','le choix personnel enregistré reste prioritaire');
assert.equal(ctx.iaAApplyTheme(ctx.iaAThemeId(),false),'forest','le thème sélectionné reste applicable');
for(const theme of ['olive','forest','slate','night','graphite','earth','moss','aubergine','high-contrast'])assert.ok(ui.includes("id:'"+theme+"'"),'le choix de thème '+theme+' reste disponible');

function check(count,visible,hidden,hasMore){
  const result=ctx.iaASliceSummary(Array.from({length:count},(_,index)=>index));
  assert.equal(result.visible.length,visible,'visible '+count);
  assert.equal(result.hiddenCount,hidden,'hidden '+count);
  assert.equal(result.hasMore,hasMore,'hasMore '+count);
}
check(0,0,0,false);
check(1,1,0,false);
check(5,5,0,false);
check(6,5,1,true);
check(25,5,20,true);

assert.equal(ctx.IA_A_SUMMARY_LIMIT,5);
assert.equal(ctx.iaARoleCode(),'OWNER');
ctx.sessionAccessKey='person:1';
ctx.socleCurrentAccess={userId:'lead',personId:1,roleCode:'TEAM_LEAD',owner:false};
ctx.accessAssignments['person:1']={profile:'Chef d’équipe',modules:{}};
assert.equal(ctx.iaARoleCode(),'TEAM_LEAD');
ctx.accessAssignments['person:1']={profile:'Ouvrier',modules:{}};
ctx.socleCurrentAccess={userId:'worker',personId:1,roleCode:'WORKER',owner:false};
assert.equal(ctx.iaARoleCode(),'WORKER');
ctx.accessAssignments['person:1']={profile:'Comptable',modules:{accounting:{view:true},planning:{view:false}}};
ctx.socleCurrentAccess={userId:'accountant',roleCode:'ACCOUNTING',owner:false};
assert.equal(ctx.iaARoleCode(),'ACCOUNTING');

for(const role of ['OWNER','TEAM_LEAD','WORKER','ACCOUNTING']){
  const page=ctx.iaADashboardForRole(role);
  assert.match(page,new RegExp(role==='OWNER'?'Votre journée':role==='TEAM_LEAD'?'Votre journée d’équipe':role==='WORKER'?'Votre chantier du jour':'Centre financier'));
  assert.ok(page.length>100,'dashboard '+role+' rendu');
  assert.equal(page.includes('ia-home-portals'),role!=='ACCOUNTING','les portails compacts apparaissent uniquement dans les accueils qui les composent: '+role);
}
const worker=ctx.iaADashboardForRole('WORKER');
assert.doesNotMatch(worker,/Facturé|À recevoir|Finance/,'WORKER ne doit pas exposer Finance');
assert.equal((worker.match(/class="ia-home-portal-links"/g)||[]).length,1,'les portails utiles sont regroupés en un seul widget');
assert.equal((worker.match(/<a [^>]*href=/g)||[]).length,5,'les liens personnels en double sont supprimés');
assert.match(worker,/CGSLB/,'le libellé CGSLB reste court sur téléphone');
ctx.canViewModule=()=>false;
assert.doesNotMatch(ctx.iaADashboardForRole('WORKER'),/ia-home-portals/,'les portails restent masqués si Mon espace est interdit');
ctx.canViewModule=()=>true;
const accounting=ctx.iaADashboardForRole('ACCOUNTING');
assert.match(accounting,/Factures|Comptabilité|Centre financier/,'ACCOUNTING reçoit son espace financier');
const owner=ctx.iaADashboardForRole('OWNER');
assert.match(owner,/Messages récents[\s\S]*À traiter[\s\S]*Votre semaine/,'accueil OWNER priorise messages, actions et calendrier');
assert.equal((owner.match(/class="ia-owner-week-day"/g)||[]).length,5,'semaine patron limitée au lundi-vendredi');
assert.doesNotMatch(owner,/ia-kpi-grid|ia-finance-overview|Facturé|À recevoir|Équipes actives|Chantiers actifs|Aucune équipe planifiée/,'accueil patron ne révèle plus les KPI finance ou les détails équipes/chantiers');
assert.match(css,/--page-bg:var\(--ia-bg\)/,'fond de page lié au thème actif');
assert.match(css,/--ia-desktop-canvas:var\(--ia-bg\)/,'fond desktop lié au thème actif');
assert.match(css,/--text:var\(--ia-text\)/,'texte principal lié au thème actif');
assert.match(css,/--surface:var\(--ia-surface\)/,'cartes liées au thème actif');
assert.match(css,/--surface-soft:var\(--ia-surface-soft\)/,'surfaces secondaires liées au thème actif');
assert.match(css,/\.ia-state\{border-color:var\(--ia-line\);background:var\(--ia-surface-soft\);color:var\(--ia-text\)\}/,'états vides et messages utilisent des surfaces crème contrastées');
assert.match(css,/\.brand,body\[data-ia-a-role\] \.workspace\{color:#fffdf7\}/,'marque claire sur la barre de navigation sombre');
assert.match(css,/\.ia-back-to-top/,'flèche de retour en haut stylée');
assert.match(ui,/ia-back-to-top/,'flèche de retour en haut créée par l’interface');
assert.match(ui,/window\.scrollTo\(\{top:0/,'remontée en haut fonctionnelle');

// Home and weather share one authenticated, server-scoped weekly overview.
ctx.socleCurrentAccess={userId:'worker-7',personId:'7',roleCode:'WORKER',owner:false};
ctx.day='2026-10-05';ctx.reference=ctx.day;ctx.socleCurrentOrganizationId='tenant-one';ctx.view='home';
const planningRequests=[],weatherRequests=[];
ctx.serverJson=async function(path){planningRequests.push(path);return{access:{userId:'worker-7',personId:'7',roleCode:'WORKER',owner:false},tasks:[],obligations:[],absences:[],assignments:[
  {id:'own',date:ctx.day,projectId:'project-own',people:['7'],status:'planned'},
  {id:'other',date:ctx.day,projectId:'project-other',people:['8'],status:'planned'},
  {id:'cancelled',date:ctx.day,projectId:'project-cancelled',people:['7'],status:'cancelled'}
],projects:[{id:'project-own',name:'Chantier Namur',town:'Namur'},{id:'project-other',name:'Chantier Liège',town:'Liège'},{id:'project-cancelled',name:'Chantier Bruxelles',town:'Bruxelles'}]}};
ctx.weatherByTown={};ctx.weatherLoading=false;
ctx.weatherIcon=()=> '☀️';ctx.weatherLabel=()=> 'Ensoleillé';
ctx.loadJobWeather=function(force,towns){weatherRequests.push({force,towns});for(const town of towns||[])ctx.weatherByTown[town]={daily:{weather_code:[0],temperature_2m_max:[17],temperature_2m_min:[9]}}};
ctx.iaADashboardForRole('WORKER');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(planningRequests.length,1,'une seule lecture Home scoppée charge les widgets personnels et météo');
assert.match(planningRequests[0],/\/api\/home-overview\?from=2026-10-05&to=2026-10-09/,'le Home charge une seule semaine serveur puis filtre la météo au jour courant');
const workerWithWeather=ctx.iaADashboardForRole('WORKER');
assert.match(workerWithWeather,/ia-home-weather/,'la météo est visible sur l’accueil ouvrier');
assert.match(workerWithWeather,/Namur/,'la météo du chantier affecté est affichée');
assert.doesNotMatch(workerWithWeather,/Liège|Bruxelles/,'les autres affectations et l’affectation annulée restent hors du widget');
assert.deepEqual(weatherRequests,[{force:false,towns:['Namur']}],'seule la ville du chantier personnel est demandée au fournisseur météo');
const workerWithForecast=ctx.iaADashboardForRole('WORKER');
assert.match(workerWithForecast,/Ensoleillé · 17°/,'la prévision est rendue dans le widget compact');
assert.match(css,/\.ia-home-portal-links\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/,'les portails restent compacts sur écran large');
assert.match(css,/\.ia-home-portal-links\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'les liens restent en tuiles compactes sur téléphone');
for(const brand of ['fgtb','career','forem','minfin','pension','csc','cgslb'])assert.ok(v3Css.includes('data-portal="'+brand+'"'),'couleur d’accès officielle individualisée : '+brand);
assert.ok(ui.includes('class="ia-home-portal-mark"')&&ui.includes('ia-home-portal-arrow'),'les accès officiels ont une tuile identifiante et une flèche');
assert.match(css,/\.ia-worker-actions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,'les actions ouvriers restent sur deux colonnes en petit écran');

for(const width of ['1100px','760px','430px','390px','375px'])assert.ok(css.includes(width),'responsive '+width);
assert.ok(css.includes('prefers-reduced-motion'),'réduction des animations');
assert.ok(css.includes('focus-visible'),'focus clavier');
assert.ok(css.includes('min-height:44px'),'cibles tactiles');
assert.ok(css.includes('--page-bg:var(--ia-bg)'),'fond de page piloté par le thème');
assert.ok(css.includes('--ia-desktop-canvas:var(--ia-bg)'),'canevas desktop piloté par le thème');
assert.ok(css.includes('Desktop surface hierarchy 2026-10-04'),'hiérarchie desktop ciblée présente');
assert.ok(css.includes('.compact-jobs .compact-job')&&css.includes('background:var(--ia-surface-soft)!important'),'lignes Chantiers secondaires sur panneau crème');
assert.ok(css.includes('.ia-b-planning-head')&&css.includes('.toolbar.ia-b-filters'),'Planning et filtres ont des panneaux desktop distincts');
assert.ok(css.includes('--ia-paper:var(--ia-surface)'),'surfaces legacy liées à la palette commune');
assert.ok(css.includes('.server-finance-grid article'),'contraste live: cartes finance traitées');
assert.ok(css.includes('background:var(--ia-paper-soft)'),'contraste live: finance sans blanc pur');
assert.ok(css.includes('.access-owner-note'),'contraste live: écran accès couvert');

assert.ok(html.includes('id="socleThemeButton"'),'sélecteur de thème présent');
assert.ok(ui.includes("IA_A_THEME_KEY='socle.theme'"),'thème persisté localement');
assert.ok(ui.includes("label:'Forêt'")&&ui.includes("label:'Graphite'")&&ui.includes("label:'Contraste'"),'plusieurs palettes disponibles');
assert.ok(css.includes('[data-socle-theme="forest"]')&&css.includes('[data-socle-theme="night"]'),'palettes CSS disponibles');
assert.ok(css.includes('dialog{')&&css.includes('background:var(--ia-paper)'),'modal harmonisé avec fond papier');
assert.ok(css.includes('dialog input')&&css.includes('background:var(--ia-paper-soft)'),'champs du modal lisibles');

assert.ok(css.includes('.ia-b-slot')&&css.includes('color:var(--ia-paper-text)'),'cartes Planning lisibles');
assert.ok(css.includes('.project-row')&&css.includes('.ledger-list>button'),'surfaces legacy normalisées');
assert.ok(css.includes('.search-results')&&css.includes('.quick-create-menu'),'menus clairs normalisés');
assert.ok(css.includes('Full legacy light-surface pass 2026-10-02'),'passe globale de contraste présente');

assert.ok(ui.includes('IA_A_LIST_LIMIT=10'),'listes opérationnelles limitées par défaut');
assert.ok(ui.includes('iaAShowPurchaseOrder'),'détail commande au clic');
assert.ok(ui.includes('iaAShowStockItem'),'détail stock au clic');
assert.ok(ui.includes('iaAShowStockLocation'),'détail emplacement au clic');
assert.ok(ui.includes('iaAAssetHealth'),'statut OK / problème des biens');
assert.ok(ui.includes('iaAReportAssetIssue'),'signalement problème depuis le dossier bien');
assert.ok(ui.includes('Un clic ouvre le dossier. Aucun mode de sélection'),'biens sans sélection parasite');
assert.ok(css.includes('.ia-click-row')&&css.includes('.ia-asset-row'),'lignes cliquables et compactes stylées');
assert.ok(css.includes('.ia-compact-footer')&&css.includes('.ia-list-more'),'afficher plus/réduire couvert');

assert.ok(css.includes('Interaction harmony 2026-10-03'),'passe harmonie interactions présente');
assert.ok(css.includes('.project-row:hover')&&css.includes('background:var(--ia-surface-soft)!important'),'chantiers restent lisibles au survol');
assert.ok(css.includes('.server-invoices tbody tr:hover'),'factures restent lisibles au survol');
assert.ok(css.includes('dialog .link')&&css.includes('color:var(--ia-accent-strong)!important'),'liens de modal liés au contraste du thème');
assert.ok(css.includes('.people-table tbody tr:hover'),'personnel reste lisible au survol');

assert.ok(css.includes('Interaction contrast pass 2026-10-02'),'passe interaction/contraste présente');
assert.ok(css.includes('.people-table tbody tr:hover'),'personnel hover lisible');
assert.ok(css.includes('.project-row:hover')&&css.includes('color:var(--ia-paper-text)!important'),'chantiers hover lisible');
assert.ok(css.includes('.ia-click-row:hover')&&css.includes('.ia-click-row:focus-visible'),'stock/achats hover et focus lisibles');
assert.ok(css.includes('.module-switch button.selected'),'menus sélectionnés contrastés');

assert.ok(css.includes('Final harmony pass 2026-10-02'),'harmonie finale présente');
assert.ok(css.includes('background:var(--ia-surface-raised)!important'),'hover sombre sans flash blanc');
assert.ok(css.includes('.project-row:hover')&&css.includes('.people-table tbody tr:hover'),'chantiers/personnel interactifs');
assert.ok(ui.includes('iaAEnhanceOperationalLists'),'enhancement des listes rendu');
assert.ok(ui.includes("people:false,jobs:false"),'personnel et chantiers compactables');
assert.ok(ui.includes("iaAApplyRenderedListLimit('jobs'"),'chantiers limités à 10 par défaut');
assert.ok(ui.includes("iaAApplyRenderedListLimit('people'"),'personnel limité à 10 par défaut');

assert.ok(css.includes('Readability + interaction patch 2026-10-03'),'correctif lisibilité chantier/personnel présent');
assert.ok(css.includes('.compact-job:hover')&&css.includes('background:var(--ia-surface-raised)!important'),'chantiers lisibles au survol');
assert.ok(css.includes('dialog .person-section')&&css.includes('color:var(--ia-paper-text)!important'),'dossier personnel texte foncé');
assert.ok(css.includes('dialog .link')&&css.includes('color:var(--ia-accent-strong)!important'),'liens de modal contrastés selon le thème');
assert.ok(html.includes('ia-a-ui.css'),'CSS IA-A chargé');
assert.ok(html.includes('ia-a-ui.js'),'JS IA-A chargé');
assert.ok(build.includes("'ia-a-ui.css'"),'CSS IA-A inclus au build');
assert.ok(build.includes("'ia-a-ui.js'"),'JS IA-A inclus au build');

for(const forbidden of ['postgres','railway','batinova'])assert.equal(ui.toLowerCase().includes(forbidden),false,'IA-A reste hors '+forbidden);
console.log('IA-A UI contract: PASS');
