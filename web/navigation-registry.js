(function(){
'use strict';

var ROOT_TYPES=new Set(['ROOT_MODULE','SUPPORT','SETTINGS']);
var ENTRIES=[
  {route:'home',label:'Accueil',short:'Accueil',icon:'⌂',group:'priority',order:10,mobileOrder:10,permission:'home',type:'ROOT_MODULE',primaryRoles:['OWNER','TEAM_LEAD','WORKER','ACCOUNTING'],purpose:"Ce qui compte aujourd'hui, pour vous, dans l'ordre."},
  {route:'planning',label:'Planning',short:'Planning',icon:'◷',group:'priority',order:20,mobileOrder:30,permission:'planning',type:'ROOT_MODULE',primaryRoles:['OWNER','TEAM_LEAD','WORKER'],purpose:'Qui travaille où, et ce qui reste à caser.'},
  {route:'timeEntries',label:'Pointages',short:'Pointages',purpose:'Arrivées, départs et heures à corriger.',icon:'◷',group:'priority',order:25,permission:'timeEntries',type:'ROOT_MODULE'},
  {route:'personal',label:'Mon espace',short:'Moi',icon:'●',group:'priority',order:30,mobileOrder:50,permission:'personal',type:'ROOT_MODULE',primaryRoles:['OWNER','TEAM_LEAD','WORKER'],purpose:'Vos chantiers, vos heures et vos documents.'},
  {route:'jobs',label:'Chantiers',short:'Chantiers',icon:'▣',group:'priority',order:40,mobileOrder:20,permission:'jobs',type:'ROOT_MODULE',primaryRoles:['OWNER','TEAM_LEAD','WORKER'],purpose:'Tous vos chantiers, leur avancement et ce qui bloque.'},
  {route:'contacts',label:'Contacts',short:'Contacts',purpose:'Retrouvez les clients, fournisseurs et personnes à joindre.',icon:'',group:'support',order:50,permission:'contacts',type:'SUPPORT'},
  {route:'messages',label:'Messages',short:'Messages',purpose:'Suivez les échanges utiles aux équipes et aux chantiers.',icon:'',group:'support',order:60,permission:'messages',type:'SUPPORT'},
  {route:'people',label:'Personnel & équipes',short:'Personnel',purpose:'Organisez les équipes, les rôles et les formations.',icon:'',group:'operations',order:70,permission:'people',type:'ROOT_MODULE'},
  {route:'quotes',label:'Devis',short:'Devis',purpose:'Préparez les offres et suivez les réponses des clients.',icon:'',group:'operations',order:80,permission:'quotes',type:'ROOT_MODULE'},
  {route:'gallery',label:'Réalisations',short:'Réalisations',purpose:'Montrez les travaux terminés et leur histoire.',icon:'',group:'operations',order:90,permission:'gallery',type:'ROOT_MODULE'},
  {route:'purchases',label:'Achats',short:'Achats',purpose:'Préparez les commandes et suivez les livraisons.',icon:'',group:'operations',order:100,permission:'purchases',type:'ROOT_MODULE'},
  {route:'stock',label:'Stock',short:'Stock',purpose:'Suivez les quantités disponibles et les besoins à venir.',icon:'',group:'operations',order:110,permission:'stock',type:'ROOT_MODULE'},
  {route:'fleet',label:'Biens & matériel',short:'Matériel',purpose:'Suivez les véhicules, le matériel et leurs coûts.',icon:'',group:'operations',order:120,permission:'fleet',type:'ROOT_MODULE'},
  {route:'accounting',label:'Comptabilité',short:'Finance',icon:'€',group:'management',order:130,mobileOrder:20,permission:'accounting',type:'ROOT_MODULE',primaryRoles:['ACCOUNTING'],purpose:'Suivez les factures, les paiements et les dépenses.'},
  {route:'actions',label:'Tâches générales',short:'Tâches',purpose:'Retrouvez les actions à faire et leur prochaine étape.',icon:'',group:'support',order:140,permission:'actions',type:'SUPPORT'},
  {route:'documents',label:'Documents',short:'Docs',icon:'▤',group:'priority',order:150,mobileOrder:40,permission:'documents',type:'ROOT_MODULE',primaryRoles:['OWNER','TEAM_LEAD','WORKER','ACCOUNTING'],purpose:'Retrouvez les pièces utiles aux personnes et aux chantiers.'},
  {route:'permissions',label:'Droits d’accès',short:'Droits',purpose:'Choisissez qui peut voir et faire chaque action.',icon:'',group:'settings',order:160,permission:'permissions',type:'SETTINGS'},
  {route:'partners',label:'Partenaires',short:'Partenaires',purpose:'Suivez les partenaires et les chantiers partagés.',icon:'',group:'settings',order:170,permission:'partners',type:'SETTINGS'},
  {route:'company',label:'Entreprise',short:'Entreprise',purpose:'Mettez à jour les coordonnées et les règles de l’entreprise.',icon:'',group:'settings',order:180,permission:'company',type:'SETTINGS'},
  {route:'profitability',label:'Rentabilité des chantiers',group:'internal',order:1000,permission:'profitability',type:'INTERNAL_VIEW',parent:'accounting'},
  {route:'training',label:'Formations',group:'internal',order:1010,permission:'training',type:'INTERNAL_VIEW',parent:'people'},
  {route:'news',label:'Actualités & règles',group:'internal',order:1020,permission:'news',type:'INTERNAL_VIEW',parent:'home'},
  {route:'jobWorkspace',label:'Hub chantier',group:'internal',order:1030,permission:'jobs',type:'INTERNAL_VIEW',parent:'jobs'},
  {route:'contact',label:'Fiche contact',group:'internal',order:1040,permission:'contacts',type:'INTERNAL_VIEW',parent:'contacts'},
  {route:'partner',label:'Mandat partenaire',group:'internal',order:1050,permission:'partners',type:'INTERNAL_VIEW',parent:'partners'},
  {route:'partnerDashboard',label:'Tableau partenaire',group:'internal',order:1060,permission:'partners',type:'INTERNAL_VIEW',parent:'partners'},
  {route:'personal-time-history',label:'Mes pointages',group:'internal',order:1070,permission:'personal',type:'INTERNAL_VIEW',parent:'personal'}
];

function byRoute(route){return ENTRIES.find(function(entry){return entry.route===route})||null}
function routeIsRegistered(route){return typeof tabs2!=='undefined'&&tabs2.some(function(tab){return tab[0]===route})}
function available(route){
  var entry=byRoute(route);
  if(!entry)return false;
  if(entry.type==='INTERNAL_VIEW')return true;
  return route==='home'||routeIsRegistered(route);
}
function allowed(route){
  var entry=byRoute(route);
  if(!entry||!available(route))return false;
  if(typeof canViewModule!=='function')return true;
  return Boolean(canViewModule(entry.permission||entry.route));
}
function roots(){
  return ENTRIES.filter(function(entry){return ROOT_TYPES.has(entry.type)&&available(entry.route)}).sort(function(a,b){return a.order-b.order});
}
function desktopEntries(){
  return roots().filter(function(entry){return allowed(entry.route)});
}
function mobilePrimary(role){
  return desktopEntries().filter(function(entry){return Array.isArray(entry.primaryRoles)&&entry.primaryRoles.includes(role)}).sort(function(a,b){return Number(a.mobileOrder??a.order)-Number(b.mobileOrder??b.order)});
}
function mobileMore(role){
  var primary=new Set(mobilePrimary(role).map(function(entry){return entry.route}));
  return desktopEntries().filter(function(entry){return !primary.has(entry.route)});
}
function renderDesktop(){
  var nav=document.querySelector('#nav');if(!nav)return;
  nav.innerHTML=desktopEntries().map(function(entry){
    var active=typeof view!=='undefined'&&view===entry.route;
    var symbols={home:'home',planning:'calendar',timeEntries:'clock',personal:'user',jobs:'briefcase',contacts:'user',messages:'message',people:'users',quotes:'file',gallery:'box',purchases:'cart',stock:'box',fleet:'tool',accounting:'euro',actions:'check',documents:'file',permissions:'shield',partners:'users',company:'settings'};
    var pictogram=globalThis.sxIcon?globalThis.sxIcon(symbols[entry.route]||'box','nav-pictogram'):'';
    return '<button type="button" data-nav-route="'+entry.route+'" data-nav-type="'+entry.type+'" data-nav-group="'+entry.group+'" class="'+(active?'active':'')+'" '+(active?'aria-current="page"':'')+' onclick="navigate(\''+entry.route+'\')">'+pictogram+'<span class="nav-label">'+entry.label+'</span></button>';
  }).join('');
}
function rootRoutes(){return roots().map(function(entry){return entry.route})}

globalThis.SOCLE_NAVIGATION={
  version:1,
  entries:ENTRIES,
  item:byRoute,
  available:available,
  allowed:allowed,
  roots:roots,
  rootRoutes:rootRoutes,
  desktopEntries:desktopEntries,
  mobilePrimary:mobilePrimary,
  mobileMore:mobileMore,
  renderDesktop:renderDesktop
};
globalThis.syncSocleDesktopNavigation=renderDesktop;
})();
