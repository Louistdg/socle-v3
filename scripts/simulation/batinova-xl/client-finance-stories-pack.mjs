import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

export const PACK_CODE='BATXL-CLIENT-FINANCE-STORIES-V1';
export const PACK_VERSION=1;
export const DEFAULT_ORGANIZATION_ID='org-local-owner';
const DEFAULT_DB=fileURLToPath(new URL('../../../data/socle.sqlite',import.meta.url));
const scenarios=JSON.parse(readFileSync(new URL('./project-scenarios-2026-09-29.json',import.meta.url),'utf8'));

const INVOICE_PLAN=Object.freeze({
  'BATXL-PRJ-001':[['progress',45],['final',55]],
  'BATXL-PRJ-002':[['progress',50],['progress',35]],
  'BATXL-PRJ-003':[['progress',40],['progress',35]],
  'BATXL-PRJ-004':[['progress',35]],
  'BATXL-PRJ-005':[['deposit',30]],
  'BATXL-PRJ-006':[['final',100]],
  'BATXL-PRJ-007':[['progress',40],['progress',35]],
  'BATXL-PRJ-008':[['final',100]],
  'BATXL-PRJ-009':[],
  'BATXL-PRJ-010':[['progress',40],['progress',35]],
  'BATXL-PRJ-011':[['final',100]],
  'BATXL-PRJ-012':[['deposit',20]],
  'BATXL-PRJ-013':[['progress',25],['progress',25]],
  'BATXL-PRJ-014':[['progress',10],['progress',15],['progress',20],['progress',20]],
  'BATXL-PRJ-015':[['deposit',30],['progress',40],['final',30]]
});

const ISSUE_DATES=Object.freeze([
  '2026-08-18','2026-08-20','2026-08-24','2026-08-27','2026-08-31',
  '2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-09-07',
  '2026-09-08','2026-09-09','2026-09-10','2026-09-11','2026-09-14',
  '2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-21',
  '2026-09-21','2026-09-22','2026-09-22','2026-09-23','2026-09-23'
]);

const PAYMENT_RULES=Object.freeze({
  'BATXL-PRJ-001':[1,1],
  'BATXL-PRJ-002':[0,0.5],
  'BATXL-PRJ-003':[1,0.6],
  'BATXL-PRJ-004':[0],
  'BATXL-PRJ-005':[1],
  'BATXL-PRJ-006':[1],
  'BATXL-PRJ-007':[1,0],
  'BATXL-PRJ-008':[1],
  'BATXL-PRJ-010':[1,0],
  'BATXL-PRJ-011':[1],
  'BATXL-PRJ-012':[0],
  'BATXL-PRJ-013':[1,0],
  'BATXL-PRJ-014':[1,0.5,0,0],
  'BATXL-PRJ-015':[1,1,1]
});

function pad(n){return String(n).padStart(5,'0')}
function invoiceId(n){return 'BATXL-INV-'+pad(38000+n-1)}
function paymentId(n){return 'BATXL-CPAY-'+pad(n)}
function creditId(n){return 'BATXL-CNOTE-'+pad(n)}
function invoiceNumber(n){return 'FAC-BATXL-'+String(n).padStart(3,'0')}
function cents(value){return Math.max(1,Math.round(Number(value)||0))}
function addDays(date,days){const d=new Date(date+'T00:00:00.000Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function quoteSubtotalCents(quote){
  return cents((quote?.lines||[]).reduce((sum,line)=>sum+(Number(line.qty||0)*Number(line.price||0)*100),0));
}
function vatRate(project){return String(project?.vatProfile||'').includes('_6_')?6:21}
function sourceProjectByCanonical(project){
  return (scenarios.projects||[]).find(item=>String(item.id)===String(project?.sourceScenarioId||project?.id))||
    (scenarios.projects||[]).find(item=>String(item.financialStory)===String(project?.financialStory)&&String(item.name)===String(project?.name));
}
function primaryAcceptedQuote(state,project){
  return (state.quotes||[]).find(q=>String(q.job)===String(project.id)&&String(q.status).toLowerCase().includes('accept'))||
    (state.quotes||[]).find(q=>String(q.job)===String(project.id));
}
function contractCents(state,project,source){
  const quote=primaryAcceptedQuote(state,project);
  let value=quoteSubtotalCents(quote);
  const min=Number(source?.compliance?.minimumContractExVatEur||0);
  if(min>0)value=Math.max(value,Math.round(min*100));
  if(value<=1)throw new Error('BATXL CLIENT FINANCE: CA contractuel introuvable pour '+project.id);
  return value;
}
function ownerId(db,organizationId){
  return db.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId)?.user_id||null;
}
function exactInvoice(row,input){
  return String(row.organization_id)===String(input.organizationId)&&
    String(row.invoice_number)===String(input.invoiceNumber)&&
    String(row.legacy_project_id||'')===String(input.projectId)&&
    String(row.invoice_type)===String(input.type)&&
    String(row.issue_date)===String(input.issueDate)&&
    String(row.due_date)===String(input.dueDate)&&
    Number(row.subtotal_cents)===input.subtotal&&
    Number(row.vat_amount_cents)===input.vat&&
    Number(row.total_cents)===input.total&&
    String(row.notes||'')===String(input.notes);
}
function ensureInvoice(db,input){
  const byId=db.prepare('SELECT * FROM invoices WHERE id=?').get(input.id);
  const byNumber=db.prepare('SELECT * FROM invoices WHERE organization_id=? AND invoice_number=?').get(input.organizationId,input.invoiceNumber);
  const existing=byId||byNumber;
  if(existing){
    if(!exactInvoice(existing,input))throw new Error('BATXL CLIENT FINANCE: facture existante divergente '+input.invoiceNumber);
    return {row:existing,replayed:true};
  }
  db.prepare('INSERT INTO invoices(id,organization_id,customer_id,project_id,quote_id,invoice_number,invoice_type,status,issue_date,due_date,currency,subtotal_cents,vat_amount_cents,total_cents,amount_paid_cents,notes,created_by,created_at,updated_at,legacy_project_id,legacy_source_id,legacy_paid_cents) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(input.id,input.organizationId,null,null,null,input.invoiceNumber,input.type,'unpaid',input.issueDate,input.dueDate,'EUR',input.subtotal,input.vat,input.total,0,input.notes,input.actor,input.createdAt,input.createdAt,input.projectId,input.id,0);
  return {row:db.prepare('SELECT * FROM invoices WHERE id=?').get(input.id),replayed:false};
}
function ensureCredit(db,{organizationId,invoice,actor,amount,index,date}){
  const id=creditId(index),key='BATXL-CLIENT-CREDIT-'+pad(index),reference='AV-BATXL-'+String(index).padStart(3,'0');
  const existing=db.prepare('SELECT * FROM credit_notes WHERE organization_id=? AND idempotency_key=?').get(organizationId,key);
  if(existing){
    if(String(existing.invoice_id)!==String(invoice.id)||Number(existing.amount_cents)!==amount)throw new Error('BATXL CLIENT FINANCE: avoir divergent '+key);
    return {id:existing.id,replayed:true};
  }
  db.prepare('INSERT INTO credit_notes(id,organization_id,invoice_id,amount_cents,credit_date,reason,reference,note,idempotency_key,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,organizationId,invoice.id,amount,date,'Ajustement commercial BatiNova XL',reference,'Simulation BATXL — avoir 3% TTC situation 1',key,actor,date+'T12:00:00.000Z');
  return {id,replayed:false};
}
function ensurePayment(db,{organizationId,invoice,actor,amount,index,date,note}){
  if(amount<=0)return null;
  const id=paymentId(index),key='BATXL-CLIENT-PAY-'+pad(index),reference='VIR-BATXL-'+String(index).padStart(3,'0');
  const existing=db.prepare('SELECT * FROM payments WHERE organization_id=? AND idempotency_key=?').get(organizationId,key);
  if(existing){
    if(String(existing.invoice_id)!==String(invoice.id)||Number(existing.amount_cents)!==amount)throw new Error('BATXL CLIENT FINANCE: paiement divergent '+key);
    return {id:existing.id,replayed:true};
  }
  db.prepare('INSERT INTO payments(id,organization_id,invoice_id,customer_id,amount_cents,payment_date,payment_method,reference,created_by,created_at,note,idempotency_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,organizationId,invoice.id,null,amount,date,'bank_transfer',reference,actor,date+'T14:00:00.000Z',note,key);
  return {id,replayed:false};
}
function fingerprint(db,organizationId){
  const invoices=db.prepare("SELECT id,invoice_number,legacy_project_id,status,total_cents,amount_paid_cents FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' ORDER BY invoice_number").all(organizationId);
  const payments=db.prepare("SELECT invoice_id,amount_cents,idempotency_key FROM payments WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-PAY-%' ORDER BY idempotency_key").all(organizationId);
  const credits=db.prepare("SELECT invoice_id,amount_cents,idempotency_key FROM credit_notes WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-CREDIT-%' ORDER BY idempotency_key").all(organizationId);
  return createHash('sha256').update(JSON.stringify({invoices,payments,credits})).digest('hex');
}

export function runClientFinanceStoriesPack({database,organizationId=DEFAULT_ORGANIZATION_ID}={}){
  const ownDatabase=!database;
  const db=database||new DatabaseSync(DEFAULT_DB);
  db.exec('PRAGMA foreign_keys=ON');
  const actor=ownerId(db,organizationId);
  if(!actor)throw new Error('BATXL CLIENT FINANCE: propriétaire introuvable.');
  const row=db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  if(!row)throw new Error('BATXL CLIENT FINANCE: workspace introuvable.');
  const state=JSON.parse(row.payload);
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw new Error('BATXL CLIENT FINANCE: société active non BatiNova.');

  let invoiceSeq=1,paymentSeq=1,creditSeq=1;
  const created={invoices:0,payments:0,credits:0};
  const replayed={invoices:0,payments:0,credits:0};

  for(const project of state.jobs||[]){
    const source=sourceProjectByCanonical(project);
    if(!source)continue;
    const plan=INVOICE_PLAN[source.id];
    if(!plan)continue;
    if(source.id==='BATXL-PRJ-009'&&plan.length!==0)throw new Error('BATXL CLIENT FINANCE: PRJ-009 doit rester sans facture.');
    const contract=contractCents(state,project,source),rate=vatRate(source),paymentRules=PAYMENT_RULES[source.id]||[];
    for(let localIndex=0;localIndex<plan.length;localIndex++){
      const [type,percent]=plan[localIndex];
      const subtotal=cents(contract*percent/100),vat=Math.round(subtotal*rate/100),total=subtotal+vat;
      const issueDate=ISSUE_DATES[invoiceSeq-1];
      if(!issueDate)throw new Error('BATXL CLIENT FINANCE: date de facture manquante pour la séquence '+invoiceSeq);
      const dueDate=addDays(issueDate,30);
      const timelineClass=issueDate<'2026-09-01'?'opening_2026-09-01':'september_2026';
      const notes='BATXL financialStory='+source.financialStory+'; tranche='+percent+'%; sourceContractCents='+contract+'; period='+timelineClass+'; simulation-only';
      const input={id:invoiceId(invoiceSeq),organizationId,invoiceNumber:invoiceNumber(invoiceSeq),projectId:project.id,type,issueDate,dueDate,subtotal,vat,total,notes,actor,createdAt:issueDate+'T09:00:00.000Z'};
      const inv=ensureInvoice(db,input); if(inv.replayed)replayed.invoices++; else created.invoices++;
      let current=db.prepare('SELECT * FROM invoices WHERE id=?').get(input.id);
      if(source.id==='BATXL-PRJ-007'&&localIndex===0){
        const creditAmount=Math.max(1,Math.round(total*0.03));
        const credit=ensureCredit(db,{organizationId,invoice:current,actor,amount:creditAmount,index:creditSeq++,date:addDays(issueDate,4)});
        credit.replayed?replayed.credits++:created.credits++;
        current=db.prepare('SELECT * FROM invoices WHERE id=?').get(input.id);
      }
      const ratio=Number(paymentRules[localIndex]||0);
      if(ratio>0){
        const netAfterCredits=Number(current.total_cents)-Number(db.prepare('SELECT COALESCE(SUM(amount_cents),0) s FROM credit_notes WHERE organization_id=? AND invoice_id=?').get(organizationId,current.id)?.s||0);
        const amount=Math.max(1,Math.min(netAfterCredits,Math.round(netAfterCredits*ratio)));
        const payDate=source.id==='BATXL-PRJ-005'?addDays(issueDate,1):addDays(issueDate,7);
        const payment=ensurePayment(db,{organizationId,invoice:current,actor,amount,index:paymentSeq++,date:payDate,note:ratio===1?'Règlement complet simulation BATXL':'Paiement partiel simulation BATXL'});
        if(payment)payment.replayed?replayed.payments++:created.payments++;
      }
      invoiceSeq++;
    }
  }

  const totalInvoices=invoiceSeq-1;
  if(totalInvoices!==25)throw new Error('BATXL CLIENT FINANCE: 25 factures attendues, générées '+totalInvoices);
  const prj9=state.jobs?.find(p=>String(p.sourceScenarioId||'')==='BATXL-PRJ-009'||String(p.id)==='BATXL-PRJ-009');
  if(prj9){
    const count=Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND legacy_project_id=? AND invoice_number LIKE 'FAC-BATXL-%'").get(organizationId,String(prj9.id))?.c||0);
    if(count!==0)throw new Error('BATXL CLIENT FINANCE: PRJ-009 contient une facture.');
  }
  const dbCount=Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%'").get(organizationId)?.c||0);
  if(dbCount!==25)throw new Error('BATXL CLIENT FINANCE: compteur serveur inattendu '+dbCount);
  const openingInvoices=Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND issue_date<'2026-09-01'").get(organizationId)?.c||0);
  const septemberInvoices=Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND issue_date>='2026-09-01' AND issue_date<='2026-09-30'").get(organizationId)?.c||0);
  const afterClosing=Number(db.prepare("SELECT COUNT(*) c FROM invoices WHERE organization_id=? AND invoice_number LIKE 'FAC-BATXL-%' AND issue_date>'2026-09-30'").get(organizationId)?.c||0);
  const afterClosingPayments=Number(db.prepare("SELECT COUNT(*) c FROM payments WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-PAY-%' AND payment_date>'2026-09-30'").get(organizationId)?.c||0);
  const afterClosingCredits=Number(db.prepare("SELECT COUNT(*) c FROM credit_notes WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-CREDIT-%' AND credit_date>'2026-09-30'").get(organizationId)?.c||0);
  if(openingInvoices!==5||septemberInvoices!==20||afterClosing!==0||afterClosingPayments!==0||afterClosingCredits!==0){
    throw new Error('BATXL CLIENT FINANCE: chronologie 01/09→30/09 incohérente '+JSON.stringify({openingInvoices,septemberInvoices,afterClosing,afterClosingPayments,afterClosingCredits}));
  }

  const summary={pack:PACK_CODE,version:PACK_VERSION,invoices:dbCount,payments:Number(db.prepare("SELECT COUNT(*) c FROM payments WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-PAY-%'").get(organizationId)?.c||0),credits:Number(db.prepare("SELECT COUNT(*) c FROM credit_notes WHERE organization_id=? AND idempotency_key LIKE 'BATXL-CLIENT-CREDIT-%'").get(organizationId)?.c||0),timeline:{openingInvoices,septemberInvoices,afterClosing,afterClosingPayments,afterClosingCredits},created,replayed,fingerprint:fingerprint(db,organizationId)};
  const runId='BATXL-RUN-CLIENT-FINANCE-V1',stamp='2026-09-30T04:00:00.000Z';
  db.prepare('INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json')
    .run(runId,organizationId,PACK_CODE,PACK_VERSION,stamp,actor,JSON.stringify(summary));
  if(ownDatabase)db.close();
  return summary;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const database=new DatabaseSync(process.env.BATXL_DB_PATH||DEFAULT_DB);
  try{
    const summary=runClientFinanceStoriesPack({database,organizationId:process.env.BATXL_ORGANIZATION_ID||DEFAULT_ORGANIZATION_ID});
    console.log('BATXL_CLIENT_FINANCE_STORIES=PASS');
    console.log(JSON.stringify(summary,null,2));
  }finally{database.close()}
}
