import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=name=>readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
const commercial=source('server-modules.js');
const commercialUi=commercial.slice(commercial.indexOf('/* IA-C — commercial/finance UX:'));
assert.ok(commercialUi.length>1000,'commercial UI entry point exists');
const main={innerHTML:'',setAttribute(){}};
const microtasks=[];
const ctx={
  console,Intl,Date,setTimeout,
  queueMicrotask:fn=>microtasks.push(fn),
  view:'planning',day:'2026-10-01',reference:'2026-10-01',
  socleCurrentAccess:{userId:'owner',roleCode:'OWNER',owner:true},
  sessionAccessKey:'owner',accessAssignments:{owner:{profile:'Patron',modules:{}}},
  serverAccessMembers:[{userId:'owner',owner:true,roleCode:'OWNER'},{userId:'worker',personId:7,roleCode:'WORKER'}],
  jobs:[],teams:[],people:[],assignments:[],quotes:[],tasks:[],reminders:[],
  accountingData:{customerInvoices:[{amount:99999,status:'À payer'}],supplierBills:[{amount:88888}]},
  serverFinanceState:'ready',serverInvoices:[],serverExpenses:[],
  tabs2:[['planning','Accueil'],['jobs','Chantiers'],['accounting','Comptabilité']],
  esc:value=>String(value),jsString:value=>String(value),money:value=>String(value),centsMoney:value=>String(value/100),
  fullDate:value=>String(value||''),quoteGross:quote=>quote.totalCents/100,
  heading:title=>'<h1>'+title+'</h1>',
  invoiceStatusLabel:status=>status,
  managementTabs:()=>'',simulationStatusPanel:()=>'',serverFinancePanel:()=>'<section class="server-finance"></section>',jobProgressAccountingView:()=>'',
  restoreWorkspace(){},workspaceSnapshot:()=> '{}',ensureConnectedAccounting(){},
  showQuote(){},showJob(){},accountingView:()=>'<div>original finance</div>',
  canViewModule(target){
    const role=ctx.socleCurrentAccess?.roleCode;
    return role==='OWNER'||(role==='ACCOUNTING'?['accounting','documents','company'].includes(target):['WORKER','TEAM_LEAD'].includes(role)&&['planning','jobs','actions','documents'].includes(target));
  },
  navigate(target){if(ctx.canViewModule(target)){ctx.view=target;ctx.render()}},
  planning:()=>'<div>original planning</div>',
  render(){
    if(!ctx.canViewModule(ctx.view))ctx.view=ctx.canViewModule('planning')?'planning':'personal';
    main.innerHTML=ctx.view==='accounting'?ctx.accountingView():ctx.planning();
  },
  document:{readyState:'complete',body:{dataset:{}},querySelector:selector=>selector==='#main'?main:null,addEventListener(){}},
};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(commercialUi,ctx,{filename:'server-modules-commercial-ui.js'});
vm.runInContext(source('planning.js'),ctx,{filename:'planning.js'});
const operationalPlanning=ctx.planning;
// Execute the actual historical controls and opening wrappers loaded after C.
const blank=source('blank-workspace.js');
vm.runInContext(blank.slice(blank.indexOf("let financeQuery=''"),blank.indexOf('let assetQuery=')),ctx,{filename:'blank-workspace-finance-controls.js'});
const procurement=source('procurement.js');
vm.runInContext(procurement.slice(procurement.indexOf('const accountingBeforeOpening=accountingView;')).split(/\r?\n/).slice(0,2).join('\n'),ctx,{filename:'procurement-opening-controls.js'});
const financeWithControls=ctx.accountingView;
vm.runInContext(source('ia-a-ui.js'),ctx,{filename:'ia-a-ui.js'});

assert.equal(ctx.planning,operationalPlanning,'A preserves the B Planning function');
assert.equal(ctx.accountingView,financeWithControls,'A preserves saved filters, batch actions and opening controls');
ctx.navigate('home');
assert.equal(ctx.view,'home');
assert.match(main.innerHTML,/Votre journée/,'A dashboard is reachable independently');
ctx.navigate('planning');
assert.equal(ctx.view,'planning');
assert.match(main.innerHTML,/<h1>Planning<\/h1>/,'Planning route renders B operational view');
assert.doesNotMatch(main.innerHTML,/Votre journée/);

for(const role of ['WORKER','TEAM_LEAD']){
  ctx.socleCurrentAccess={userId:role.toLowerCase(),personId:7,roleCode:role,owner:false};
  ctx.sessionAccessKey='owner'; // Deliberately stale privileged frontend key.
  assert.equal(ctx.iaARoleCode(),role,'authoritative role ignores the stale owner key and other owners');
  ctx.navigate('home');
  assert.equal(ctx.document.body.dataset.iaARole,role);
  assert.doesNotMatch(main.innerHTML,/Facturé|À recevoir|Ouvrir Finance/);
}
ctx.jobs=[{id:'renfort-project',name:'Chantier renfort'}];
ctx.assignments=[{date:ctx.day,job:'renfort-project',team:'other-team',people:['7']}];
ctx.teams=[{id:'other-team',members:['8']}];
ctx.socleCurrentAccess={userId:'worker',personId:7,roleCode:'WORKER',owner:false};
ctx.navigate('home');
assert.match(main.innerHTML,/Chantier renfort/,'an explicitly assigned reinforcement appears on the worker home');
ctx.assignments[0].people=['8'];
ctx.teams[0].members=['7'];
ctx.navigate('home');
assert.doesNotMatch(main.innerHTML,/Chantier renfort/,'team membership alone does not replace explicit assignment people');

ctx.socleCurrentAccess=null;
assert.equal(ctx.iaARoleCode(),'PENDING');
assert.equal(ctx.canViewModule('home'),false);
assert.equal(ctx.navigate('home'),false);
assert.doesNotMatch(ctx.iaADashboardForRole(ctx.iaARoleCode()),/Votre journée|Centre financier/);

ctx.socleCurrentAccess={userId:'accountant',roleCode:'ACCOUNTING',owner:false};
assert.equal(ctx.canViewModule('planning'),false);
ctx.navigate('home');
assert.equal(ctx.view,'home','accountant home does not require operational Planning permission');
assert.match(main.innerHTML,/Centre financier/);
ctx.navigate('planning');
assert.equal(ctx.view,'home','accountant cannot enter operational Planning');

ctx.serverInvoices=[
  {id:'partial',invoiceNumber:'INV-PARTIAL',status:'partially_paid',totalCents:10000,paidCents:7000,creditNoteCents:0,remainingCents:3000,dueDate:'2026-09-01'},
  {id:'paid',invoiceNumber:'INV-PAID',status:'paid',totalCents:5000,paidCents:5000,creditNoteCents:0,remainingCents:0,dueDate:'2026-09-01'},
];
ctx.serverExpenses=[{id:'expense',description:'Matériaux',expense_date:'2026-10-01',total_cents:1000,payment_status:'unpaid'}];
const finance=ctx.iaAFinanceModel();
assert.equal(finance.billedCents,15000);
assert.equal(finance.outstandingCents,3000,'home uses remaining server cents after partial payments');
assert.equal(finance.unpaid.length,1);
ctx.navigate('home');
assert.match(main.innerHTML,/INV-PARTIAL/);
assert.doesNotMatch(main.innerHTML,/99999|88888/,'historical workspace amounts are not used as a finance fallback');
vm.runInContext("iaCBankState='ready'",ctx);
ctx.navigate('accounting');
assert.match(main.innerHTML,/ia-c-bank-panel/,'C Finance remains active after later historical wrappers');
assert.match(main.innerHTML,/finance-control-panel/,'the established Finance controls remain available');
assert.match(main.innerHTML,/Enregistrer cette vue|saved-view-bar/,'saved Finance views remain available');
assert.match(main.innerHTML,/SITUATION D’OUVERTURE V2/,'the opening position wrapper is retained');
assert.match(main.innerHTML,/INV-PARTIAL/);
ctx.serverInvoices[0].remainingCents=1000;
assert.equal(ctx.iaAFinanceModel().outstandingCents,1000,'home reflects updated authoritative payment balance');
ctx.serverFinanceState='error';
assert.equal(ctx.iaAFinanceModel().ready,false);
ctx.navigate('home');
assert.match(main.innerHTML,/Données financières indisponibles/);
assert.doesNotMatch(main.innerHTML,/INV-PARTIAL|99999|88888/,'failed reads do not expose stale financial values');

ctx.serverFinanceState='ready';
ctx.serverInvoices=Array.from({length:25},(_,i)=>({id:'inv'+i,invoiceNumber:'INV-'+i,status:'unpaid',totalCents:1000,paidCents:0,creditNoteCents:0,remainingCents:1000,dueDate:'2026-11-01'}));
vm.runInContext("financeQuery='';financeStatus='Tous';financeKind='Client';financeVisibleCount=10",ctx);
ctx.navigate('accounting');
const controlsHtml=()=>main.innerHTML.slice(main.innerHTML.indexOf('<section class="panel finance-control-panel">'));
const controlRows=()=> (controlsHtml().match(/<tr><td><input type="checkbox"/g)||[]).length;
assert.equal(controlRows(),10,'the established Finance first page retains ten rows');
assert.ok(main.innerHTML.indexOf('class="server-finance"')<main.innerHTML.indexOf('class="panel finance-control-panel"'),'the server summary precedes invoice controls');
ctx.showMoreFinance();
assert.equal(controlRows(),20,'the established Finance pagination still advances from ten to twenty rows');
vm.runInContext("financeQuery='INV-24';resetFinanceList()",ctx);
assert.equal(controlRows(),1,'the established Finance search remains functional');

vm.runInContext("iaCQuotesState='ready';quotes=Array.from({length:7},(_,i)=>({id:'q'+i,ref:'QUO-'+i,status:'Brouillon',client:'Client',date:'2026-10-01',validUntil:'2026-11-01',totalCents:1000}));",ctx);
const quotePage=ctx.quotesView();
assert.equal((quotePage.match(/class="quote-list-row"/g)||[]).length,5,'loaded Quotes render the five-row summary without ReferenceError');
assert.match(quotePage,/Afficher les 2 autres/);
vm.runInContext("iaCQuoteVisibleCount=quotes.length",ctx);
assert.equal((ctx.quotesView().match(/class="quote-list-row"/g)||[]).length,7,'Quotes show-more retains every server quote');

let financeRenders=0;
const loaderContext={view:'home',serverFinanceState:'idle',serverFinanceError:'',serverInvoices:[],serverExpenses:[],serverFinance:null,
  serverJson:async()=>({invoices:[],expenses:[]}),render:()=>{financeRenders++}};
vm.createContext(loaderContext);
vm.runInContext(commercial.split(/\r?\n/).find(line=>line.startsWith('async function loadServerFinance()')),loaderContext);
await loaderContext.loadServerFinance();
assert.equal(loaderContext.serverFinanceState,'ready');
assert.equal(financeRenders,1,'Finance completion refreshes home even when the request began on another screen');
loaderContext.serverJson=async()=>{throw Error('Server unavailable')};
await loaderContext.loadServerFinance();
assert.equal(loaderContext.serverFinanceState,'error');
assert.equal(financeRenders,2,'Finance errors also refresh the home state');

console.log('abc-ui-integration: PASS — authoritative role, separate home/Planning, C Finance, server cents, loaded Quotes');
