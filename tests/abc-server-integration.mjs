import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import worker from '../worker/index.js';

// SQLite/D1 adapter and identities follow planning-operations-80 and
// ia-c-commercial-finance-02. Every case gets a fresh in-memory database.
function fixture(){
  const db=new DatabaseSync(':memory:');
  for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
    db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  }
  const stamp='2026-10-01T06:00:00.000Z',org='abc-org';
  db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(org,'ABC Test','ABC Test','BE','EUR',stamp,stamp);
  for(const [uid,code,person] of [['owner','OWNER','person-owner'],['lead','TEAM_LEAD','person-lead'],['worker','WORKER',null],['accountant','ACCOUNTING',null]]){
    db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(uid,uid,'Test',stamp,stamp);
    db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,org,code,code,stamp);
    db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+uid,org,uid,'role-'+uid,'active',stamp,stamp,stamp,person);
  }
  const rolePermissions={
    lead:['workspace.view','projects.view.assigned','planning.assignments.manage'],
    worker:['workspace.view','projects.view.assigned','time_entries.view.own'],
    accountant:['accounting.view','quotes.view','quotes.prices.view','quote_amendments.view','quote_amendments.create']
  };
  for(const [uid,permissions] of Object.entries(rolePermissions))for(const permission of permissions){
    db.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-'+uid,permission);
  }
  const people=[{id:'person-owner',name:'Owner Test'},{id:'person-lead',name:'Lead Test'},{id:'person-other',name:'Other Test'}];
  const teams=[{id:'team',name:'Équipe',members:['person-lead','person-other']}];
  const jobs=['project-open','project-private'].map(id=>({id,name:id,client:'Client ABC',phase:'En cours',materials:[],execution:[],notes:[],timeEntries:[]}));
  const state={version:3,company:{name:'ABC Test'},people,teams,jobs,assignments:[],quotes:[],assets:[],tasks:[],dossiers:[],reminders:[]};
  db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),1,'owner',stamp,stamp);
  for(const person of people){
    db.prepare("INSERT INTO hr_people(organization_id,id,display_name,role_title,category,active,source,created_at,updated_at) VALUES(?,?,?,'Ouvrier','Ouvrier',1,'server',?,?)").run(org,person.id,person.name,stamp,stamp);
  }
  db.prepare("INSERT INTO hr_teams(organization_id,id,name,active,source,created_at,updated_at) VALUES(?,'team','Équipe',1,'server',?,?)").run(org,stamp,stamp);
  for(const job of jobs){
    db.prepare("INSERT INTO projects(id,organization_id,name,reference,status,country,quoted_amount_cents,created_at,updated_at) VALUES(?,?,?,?,'draft','BE',0,?,?)").run(job.id,org,job.name,job.id,stamp,stamp);
  }
  for(const uid of ['lead','worker']){
    db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,uid,'project-open','owner',stamp);
  }
  const env={DB:{
    prepare(sql){
      let values=[];
      return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}};
    },
    async batch(statements){
      db.exec('BEGIN IMMEDIATE');
      try{
        const result=statements.map(statement=>({meta:{changes:Number(db.prepare(statement._sql).run(...statement._values).changes)}}));
        db.exec('COMMIT');return result;
      }catch(error){db.exec('ROLLBACK');throw error}
    }
  }};
  async function request(uid,method,path,payload){
    const headers={origin:'https://socle.test','x-socle-organization-id':org};
    if(uid)headers['oai-authenticated-user-id']=uid;
    if(payload!==undefined)headers['content-type']='application/json';
    const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload===undefined?{}:{body:JSON.stringify(payload)})}),env);
    return{status:response.status,body:await response.json()};
  }
  return{db,request,org,stamp};
}

const quoteInput={projectId:'project-open',title:'Toiture ABC',client:'Client ABC',date:'2026-10-01',validUntil:'2026-11-01',lines:[{label:'Toiture',qty:10,unit:'m²',price:100,vat:21}]};
const amendmentInput={reference:'AV-ABC',title:'Isolation',reason:'Demande client',amountCents:10000,vatAmountCents:2100,status:'accepted',effectiveDate:'2026-10-01'};
const quotedAmount=db=>db.prepare("SELECT quoted_amount_cents FROM projects WHERE id='project-open'").get().quoted_amount_cents;

await test('Planning: WORKER without person link receives no operational data',async()=>{
  const{db,request,org,stamp}=fixture();
  try{
    db.prepare("INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,created_by,created_at,updated_by,updated_at) VALUES('assignment-other',?,'2026-10-02','team','project-open',?,'owner',?,'owner',?)").run(org,JSON.stringify(['person-other']),stamp,stamp);
    db.prepare("INSERT INTO planning_absences(organization_id,id,person_id,absence_type,starts_at,ends_at,status,reason,created_by,created_at,updated_by,updated_at) VALUES(?,'absence-other','person-other','sickness','2026-10-03T07:00','2026-10-03T16:00','approved','Private reason','owner',?,'owner',?)").run(org,stamp,stamp);
    db.prepare("INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES('time-other',?,'project-open','team',?,'2026-10-02','07:00','16:00',45,'','owner',?,'owner',?)").run(org,JSON.stringify(['person-other']),stamp,stamp);
    const result=await request('worker','GET','/api/planning?from=2026-10-01&to=2026-10-07');
    assert.equal(result.status,403,'A WORKER without a server person link must fail closed');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM field_assignments').get().n,1);
  }finally{db.close()}
});

await test('Planning: block update validates original project scope before reassignment',async()=>{
  const{db,request}=fixture();
  try{
    const block={projectId:'project-private',startsAt:'2026-10-04T07:00',endsAt:'2026-10-04T16:00',type:'weather',status:'active',reason:'Private project'};
    const created=await request('owner','POST','/api/planning/blocks',block);
    assert.equal(created.status,201);
    const beforeAudit=db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n;
    const result=await request('lead','PUT','/api/planning/blocks/'+created.body.id,{...block,projectId:'project-open'});
    assert.equal(result.status,403,'Allowed destination cannot authorize modification of a forbidden source');
    assert.equal(db.prepare('SELECT project_id FROM project_planning_blocks WHERE id=?').get(created.body.id).project_id,'project-private');
    assert.equal(db.prepare('SELECT COUNT(*) n FROM audit_logs').get().n,beforeAudit,'Denied change does not create successful audit');
    const allowed=await request('owner','PUT','/api/planning/blocks/'+created.body.id,{...block,projectId:'project-open'});
    assert.equal(allowed.status,200,'Owner can reassign a block');
  }finally{db.close()}
});

await test('Commercial: saving accepted quote preserves accepted amendments',async()=>{
  const{db,request}=fixture();
  try{
    const quote=await request('owner','POST','/api/quotes',{...quoteInput,status:'draft'});
    assert.equal(quote.status,201);
    const accepted=await request('owner','PUT','/api/quotes/'+quote.body.quote.id,{...quoteInput,status:'accepted'});
    assert.equal(accepted.status,200);
    assert.equal(quotedAmount(db),121000);
    const amendment=await request('owner','POST','/api/quotes/'+quote.body.quote.id+'/amendments',amendmentInput);
    assert.equal(amendment.status,201);
    assert.equal(quotedAmount(db),133100);
    const saved=await request('owner','PUT','/api/quotes/'+quote.body.quote.id,{...quoteInput,status:'accepted'});
    assert.equal(saved.status,200);
    assert.equal(quotedAmount(db),133100,'Accepted amendment survives an unchanged quote save');
    const savedAgain=await request('owner','PUT','/api/quotes/'+quote.body.quote.id,{...quoteInput,status:'accepted'});
    assert.equal(savedAgain.status,200);
    assert.equal(quotedAmount(db),133100,'Repeated save does not duplicate accepted amendment');
  }finally{db.close()}
});

await test('Commercial: quote created directly accepted updates project contract amount',async()=>{
  const{db,request}=fixture();
  try{
    const created=await request('owner','POST','/api/quotes',{...quoteInput,status:'accepted'});
    assert.equal(created.status,201);
    assert.equal(quotedAmount(db),121000,'Direct accepted creation synchronizes project financial amount');
  }finally{db.close()}
});

await test('ACCOUNTING: amendment permissions work without granting operational planning access',async()=>{
  const{db,request}=fixture();
  try{
    const quote=await request('owner','POST','/api/quotes',{...quoteInput,status:'draft'});
    assert.equal(quote.status,201);
    assert.equal((await request('accountant','GET','/api/quotes')).status,200,'Finance can read tenant quotes without project_access');
    const amendments=await request('accountant','GET','/api/quotes/'+quote.body.quote.id+'/amendments');
    assert.equal(amendments.status,200,'Finance amendment view follows the same tenant financial scope');
    const created=await request('accountant','POST','/api/quotes/'+quote.body.quote.id+'/amendments',{...amendmentInput,status:'draft'});
    assert.equal(created.status,201,'Explicit amendment permission permits finance creation');
    assert.equal((await request('worker','GET','/api/quotes/'+quote.body.quote.id+'/amendments')).status,403,'Assigned field worker receives no amendment financial data');
    assert.equal((await request(null,'GET','/api/quotes/'+quote.body.quote.id+'/amendments')).status,401,'No session receives no financial data');
    db.prepare("DELETE FROM role_permissions WHERE role_id='role-accountant' AND permission_code='quote_amendments.create'").run();
    assert.equal((await request('accountant','POST','/api/quotes/'+quote.body.quote.id+'/amendments',{...amendmentInput,reference:'AV-DENIED',status:'draft'})).status,403,'Finance scope does not bypass action permission');
    assert.equal((await request('accountant','GET','/api/planning?from=2026-10-01&to=2026-10-07')).status,403,'Finance scope does not grant field planning');
  }finally{db.close()}
});
