import {DatabaseSync} from 'node:sqlite';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PACK_CODE='BATXL-CLIENT-FINANCE-V1';
export const PACK_VERSION=1;
export const DEFAULT_ORGANIZATION_ID='org-local-owner';
const STAMP='2026-09-29T14:00:00.000Z';
const DEFAULT_DB=fileURLToPath(new URL('../../../data/socle.sqlite',import.meta.url));

function normalizeStatus(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
}
function accepted(value){
  return ['accepte','accepted','approuve','approved','signe','signed'].includes(normalizeStatus(value));
}
function contractCents(state,projectId){
  const quotes=(state.quotes||[]).filter(q=>String(q.job)===String(projectId)&&accepted(q.status));
  const quotesCents=quotes.reduce((total,q)=>total+Math.round((q.lines||[]).reduce((sum,line)=>sum+Math.max(0,Number(line.qty||0))*Math.max(0,Number(line.price||0)),0)*100),0);
  const project=(state.jobs||[]).find(job=>String(job.id)===String(projectId));
  const amendments=(project?.contractAmendments||[]).filter(a=>accepted(a.status)||a.approved===true).reduce((total,a)=>total+Math.round(Math.max(0,Number(a.amount||0))*100),0);
  return quotesCents+amendments;
}
function addDays(date,days){
  const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
function businessDates(from,count){
  const out=[];for(let d=new Date(from+'T12:00:00Z');out.length<count;d.setUTCDate(d.getUTCDate()+1)){const day=d.getUTCDay();if(day!==0&&day!==6)out.push(d.toISOString().slice(0,10))}return out;
}
function vatRate(project){
  return String(project?.vatProfile||'').includes('_6_')?6:21;
}
function ownerId(database,organizationId){
  const row=database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId);
  if(!row?.user_id)throw Error('BATXL Client Finance: OWNER actif introuvable.');
  return String(row.user_id);
}
function makeEnv(database){
  return {DB:{
    prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
    async batch(statements){database.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=database.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}database.exec('COMMIT');return out}catch(error){database.exec('ROLLBACK');throw error}}
  }};
}
async function apiFactory(database,organizationId,owner,worker){
  const env=makeEnv(database);
  return async(method,path,payload)=>{
    const headers={'oai-authenticated-user-id':owner,'x-socle-organization-id':organizationId,'origin':'https://socle.simulation'};
    if(payload!==undefined)headers['content-type']='application/json';
    const response=await worker.fetch(new Request('https://socle.simulation'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
    let body={};try{body=await response.json()}catch{}
    if(!response.ok)throw Error(method+' '+path+' → '+response.status+' '+(body.error||''));
    return body;
  };
}

const SPECS=[
  [1,.25,1,'acompte'],[1,.35,.50,'situation-1'],
  [2,.20,1,'acompte'],[2,.45,0,'situation-1'],
  [3,.20,1,'acompte'],[3,.45,.70,'situation-apres-avenant'],
  [4,.30,1,'acompte'],[4,.30,.25,'situation-1'],
  [5,.30,1,'acompte'],
  [6,1,1,'finale'],
  [7,.25,1,'acompte'],[7,.40,.40,'situation-1'],
  [8,.25,1,'acompte'],[8,.65,1,'situation-partielle'],
  [10,.20,1,'acompte'],[10,.50,1,'situation-1'],
  [11,1,1,'finale'],
  [12,.25,1,'acompte'],
  [13,.20,1,'acompte'],[13,.35,.60,'situation-1'],
  [14,.10,1,'acompte'],[14,.15,1,'situation-1'],[14,.20,.50,'situation-2'],[14,.20,0,'situation-3'],
  [15,1,1,'finale-historique']
];

export async function runClientFinancePack({database,organizationId=DEFAULT_ORGANIZATION_ID,worker}={}){
  if(!database)throw Error('BATXL Client Finance: database obligatoire.');
  database.exec('PRAGMA foreign_keys=ON');
  const ws=database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  if(!ws)throw Error('BATXL Client Finance: workspace introuvable.');
  const state=JSON.parse(ws.payload);
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw Error('BATXL Client Finance: société non BatiNova.');
  const projects=state.jobs||[];
  if(projects.length!==15)throw Error('BATXL Client Finance: 15 chantiers calibrés requis, obtenu='+projects.length);
  const owner=ownerId(database,organizationId);
  if(!worker)worker=(await import('../../../worker/index.js')).default;
  const api=await apiFactory(database,organizationId,owner,worker);
  const dates=businessDates('2026-08-18',SPECS.length);
  const created=[];
  for(let index=0;index<SPECS.length;index++){
    const [projectNumber,share,paymentFraction,kind]=SPECS[index];
    const project=projects[projectNumber-1];
    if(!project)throw Error('BATXL Client Finance: projet '+projectNumber+' introuvable.');
    const contract=contractCents(state,project.id);
    if(contract<=0)throw Error('BATXL Client Finance: contrat HTVA nul pour '+project.reference+' / '+project.financialStory);
    const subtotal=Math.max(1,Math.round(contract*share));
    const rate=vatRate(project);
    const vat=Math.round(subtotal*rate/100);
    const issueDate=dates[index];
    let dueDate=addDays(issueDate,30);
    if(index===1)dueDate='2026-09-18';
    if(index===3)dueDate='2026-09-15';
    if(index===23)dueDate='2026-09-28';
    const number='FAC-BATXL-'+String(index+1).padStart(3,'0');
    const invoiceResult=await api('POST','/api/invoices',{
      customerId:null,
      projectId:String(project.id),
      invoiceNumber:number,
      issueDate,
      dueDate,
      subtotalCents:subtotal,
      vatAmountCents:vat,
      notes:'BATXL · '+kind+' · '+String(project.financialStory||'simulation')
    });
    let invoice=invoiceResult.invoice;
    const total=Number(invoice.totalCents||subtotal+vat);
    if(paymentFraction>0){
      const amount=Math.max(1,Math.min(total,Math.round(total*paymentFraction)));
      const payment=await api('POST','/api/invoices/'+encodeURIComponent(invoice.id)+'/payments',{
        amountCents:amount,
        paymentDate:addDays(issueDate,Math.min(12,5+(index%5))),
        paymentMethod:'bank_transfer',
        reference:'VIR-BATXL-'+String(index+1).padStart(3,'0'),
        note:'BATXL · paiement client simulation',
        operationKey:'BATXL-CLIENT-PAYMENT-OP-'+String(index+1).padStart(3,'0')
      });
      invoice=payment.invoice;
    }
    created.push({index:index+1,projectNumber,invoiceId:invoice.id,invoiceNumber:number,share,paymentFraction,totalCents:total,dueDate,status:invoice.status});
  }

  const creditTarget=created[11];
  const creditInvoice=(await api('GET','/api/invoices/'+encodeURIComponent(creditTarget.invoiceId))).invoice;
  const creditAmount=Math.max(1,Math.round(Number(creditInvoice.totalCents||0)*.03));
  await api('POST','/api/invoices/'+encodeURIComponent(creditTarget.invoiceId)+'/credit-notes',{
    amountCents:creditAmount,
    creditDate:'2026-09-24',
    reason:'Geste commercial après correction esthétique de finition',
    reference:'AV-BATXL-001',
    note:'BATXL · avoir client simulation',
    operationKey:'BATXL-CLIENT-CREDIT-OP-001'
  });

  const all=(await api('GET','/api/invoices')).invoices||[];
  const packInvoices=all.filter(invoice=>String(invoice.invoiceNumber||'').startsWith('FAC-BATXL-'));
  if(packInvoices.length!==25)throw Error('BATXL Client Finance: 25 factures serveur attendues, obtenu='+packInvoices.length);
  const paid=packInvoices.filter(invoice=>Number(invoice.remainingCents||0)===0).length;
  const partial=packInvoices.filter(invoice=>Number(invoice.paidCents||0)>0&&Number(invoice.remainingCents||0)>0).length;
  const overdue=packInvoices.filter(invoice=>Number(invoice.remainingCents||0)>0&&String(invoice.dueDate||'')<'2026-09-30').length;
  const credits=packInvoices.filter(invoice=>Number(invoice.creditNoteCents||0)>0).length;
  if(paid<10||partial<4||overdue<2||credits<1)throw Error('BATXL Client Finance: matrice causale insuffisante '+JSON.stringify({paid,partial,overdue,credits}));

  const summary={pack:PACK_CODE,version:PACK_VERSION,invoices:packInvoices.length,paid,partial,overdue,credits,payments:packInvoices.reduce((n,invoice)=>n+(invoice.payments||[]).length,0),creditNotes:packInvoices.reduce((n,invoice)=>n+(invoice.creditNotes||[]).length,0)};
  if(database.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='simulation_runs'").get()){
    database.prepare('INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json')
      .run('BATXL-RUN-CLIENT-FINANCE-V1',organizationId,PACK_CODE,PACK_VERSION,STAMP,owner,JSON.stringify(summary));
  }
  return summary;
}
function openDatabase(){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
  return new DatabaseSync(process.env.BATXL_DB_PATH?resolve(process.env.BATXL_DB_PATH):join(root,'data','socle.sqlite'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const database=openDatabase();
  try{
    const summary=await runClientFinancePack({database,organizationId:process.env.BATXL_ORGANIZATION_ID||DEFAULT_ORGANIZATION_ID});
    console.log('BATXL_CLIENT_FINANCE=PASS');
    console.log(JSON.stringify(summary,null,2));
  }finally{database.close()}
}
