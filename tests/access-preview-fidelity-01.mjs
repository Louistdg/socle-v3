import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
const previewUi=readFileSync(new URL('../web/workflow-improvements.js',import.meta.url),'utf8');

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const stamp='2026-10-07T08:00:00.000Z',org='org-preview-a',otherOrg='org-preview-b';
for(const id of [org,otherOrg])db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(id,id,id,'BE','EUR',stamp,stamp);
const roleRows=[['role-owner-preview',org,'OWNER'],['role-worker-preview',org,'WORKER'],['role-lead-preview',org,'TEAM_LEAD'],['role-accounting-preview',org,'ACCOUNTING'],['role-owner-other',otherOrg,'OWNER']];
for(const [id,organizationId,code] of roleRows)db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(id,organizationId,code,code,stamp);
const memberRows=[['owner-preview',org,'role-owner-preview',null],['worker-preview',org,'role-worker-preview','person-worker'],['lead-preview',org,'role-lead-preview','person-lead'],['lead-preview-2',org,'role-lead-preview','person-lead-2'],['unlinked-preview',org,'role-worker-preview',null],['accounting-preview',org,'role-accounting-preview',null],['foreign-preview',otherOrg,'role-owner-other',null]];
for(const [uid,organizationId,roleId,personId] of memberRows){db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(uid,uid,'Test',uid+'@example.test',stamp,stamp);db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?)').run('member-'+uid,organizationId,uid,roleId,'active',stamp,stamp,stamp,personId)}
for(const [roleId,codes] of [['role-worker-preview',['workspace.view','projects.view.assigned']],['role-lead-preview',['workspace.view','projects.view.assigned']],['role-accounting-preview',['accounting.view','financial.dashboard.view','invoices.view']]])for(const code of codes)if(db.prepare('SELECT 1 ok FROM permissions WHERE code=?').get(code))db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(roleId,code);
const state={version:3,company:{name:'Preview',currency:'EUR'},people:[{id:'person-worker',name:'Ouvrier Test'},{id:'person-lead',name:'Chef Test'},{id:'person-lead-2',name:'Chef Test Deux'}],teams:[{id:'team-a',name:'Équipe A',members:['person-lead']},{id:'team-b',name:'Équipe B',members:['person-lead-2']}],jobs:[{id:'job-a',name:'Chantier A'},{id:'job-b',name:'Chantier B'}],assignments:[{id:'as-a',date:'2026-10-17',job:'job-a',team:'team-a',people:['person-lead'],startTime:'07:00',endTime:'16:00',status:'planned'},{id:'as-b',date:'2026-10-17',job:'job-b',team:'team-b',people:['person-lead-2'],startTime:'07:00',endTime:'16:00',status:'planned'}],quotes:[{id:'q-1',job:'job-1',title:'Offre',total:1200}],assets:[],tasks:[],dossiers:[],reminders:[],accountingData:{customerInvoices:[{id:'private-invoice',ref:'INV-1',amount:1200}]}};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(org,JSON.stringify(state),3,'owner-preview',stamp,stamp);
for(const [userId,projectId] of [['lead-preview','job-a'],['lead-preview-2','job-b']])db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(org,userId,projectId,'owner-preview',stamp);
const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const result=db.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){db.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=db.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}
}};
async function call(uid,method,path,{preview='',organization=org,payload}={}){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':organization,'origin':'https://socle.test'};
  if(preview)headers['x-socle-access-preview-user-id']=preview;
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.test'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  return{status:response.status,body:await response.json().catch(()=>({}))};
}
const before=db.prepare('SELECT total_changes() count').get().count;
const previewMeasurements=[];
for(const [target,role,personId] of [['worker-preview','WORKER','person-worker'],['lead-preview','TEAM_LEAD','person-lead'],['lead-preview-2','TEAM_LEAD','person-lead-2'],['accounting-preview','ACCOUNTING',null]]){
  const result=await call('owner-preview','GET','/api/state',{preview:target});
  const actual=await call(target,'GET','/api/state');
  assert.equal(result.status,200,role+' preview loads');
  assert.equal(result.body.preview,true,role+' response is explicitly marked as preview');
  assert.equal(result.body.previewedBy,'owner-preview',role+' records only the acting OWNER identity');
  assert.equal(result.body.role,role,role+' effective role is server-resolved');
  assert.equal(result.body.access.userId,target,role+' effective user is server-resolved');
  assert.equal(result.body.access.personId,personId,role+' roster identity is correct, including roster-free ACCOUNTING');
  assert.equal(result.body.readOnly,true,role+' is read-only in the legacy workspace response');
  assert.equal(actual.status,200,role+' actual session loads');
  assert.deepEqual(result.body.state,actual.body.state,role+' previewed data equals the actual session data');
  assert.deepEqual(result.body.access,actual.body.access,role+' previewed access equals the actual session access');
  previewMeasurements.push({role:target,workspaceEqual:true,accessEqual:true,readOnly:result.body.readOnly,workspaceKeys:Object.keys(result.body.state||{}).sort(),projectIds:result.body.access.projectIds});
}
assert.notEqual(previewMeasurements.find(item=>item.role==='lead-preview').role,previewMeasurements.find(item=>item.role==='lead-preview-2').role,'Two TEAM_LEAD identities stay distinct.');
const leadOne=await call('owner-preview','GET','/api/state',{preview:'lead-preview'}),leadTwo=await call('owner-preview','GET','/api/state',{preview:'lead-preview-2'});
assert.deepEqual(leadOne.body.state.jobs.map(job=>job.id),['job-a'],'TEAM_LEAD 1 sees only its granted project.');
assert.deepEqual(leadTwo.body.state.jobs.map(job=>job.id),['job-b'],'TEAM_LEAD 2 sees only its distinct granted project.');
let workerRead=await call('owner-preview','GET','/api/state',{preview:'worker-preview'});
assert.equal(workerRead.body.state.quotes.length,0,'WORKER sees only scoped legacy quotes');
assert.equal(workerRead.body.state.accountingData,undefined,'WORKER does not receive financial legacy data');
assert.equal((await call('owner-preview','GET','/api/accounting/summary',{preview:'worker-preview'})).status,403,'WORKER cannot read finance through preview');
assert.equal((await call('owner-preview','GET','/api/accounting/summary',{preview:'accounting-preview'})).status,200,'ACCOUNTING retains its authorized accounting summary');
assert.equal((await call('owner-preview','GET','/api/access-control',{preview:'accounting-preview'})).status,403,'ACCOUNTING cannot read OWNER access administration');
assert.equal((await call('owner-preview','GET','/api/state',{preview:'owner-preview'})).status,403,'OWNER itself is not a preview target.');
assert.equal((await call('owner-preview','GET','/api/state',{preview:'unlinked-preview'})).status,403,'Unlinked field account is rejected.');
assert.match(previewUi,/member&&!member\.owner\?eligible\?/,'OWNER is not offered as a preview action in selector.');
assert.match(previewUi,/\['TEAM_LEAD','WORKER'\]\.includes\(role\)\|\|member\.id!=null/,'Unlinked roster accounts are visibly disabled in selector.');
for(const path of ['/api/state','/api/projects'])assert.equal((await call('owner-preview','POST',path,{preview:'worker-preview',payload:{}})).status,403,'Preview blocks server-side writes to '+path);
assert.equal((await call('worker-preview','GET','/api/state',{preview:'accounting-preview'})).status,403,'Non-OWNER cannot select another preview role');
assert.equal((await call('owner-preview','GET','/api/state',{preview:'foreign-preview',organization:org})).status,404,'Preview cannot resolve an account from another tenant');
assert.equal((await call('owner-preview','GET','/api/state',{preview:'worker-preview',organization:otherOrg})).status,403,'Changing the organization header cannot bypass OWNER membership');
const ownerAfter=await call('owner-preview','GET','/api/state');
assert.equal(ownerAfter.body.role,'OWNER','ending preview restores the authenticated OWNER context');
assert.equal(ownerAfter.body.preview,false,'normal OWNER context is not marked preview');
assert.equal(db.prepare('SELECT role_id FROM organization_members WHERE organization_id=? AND user_id=?').get(org,'owner-preview').role_id,'role-owner-preview','preview does not change the OWNER membership');
assert.equal(db.prepare('SELECT role_id FROM organization_members WHERE organization_id=? AND user_id=?').get(org,'worker-preview').role_id,'role-worker-preview','preview does not change the target membership');
assert.equal(db.prepare('SELECT revision FROM organization_workspace_state WHERE organization_id=?').get(org).revision,3,'preview does not write workspace data');
assert.equal(db.prepare('SELECT total_changes() count').get().count,before,'read-only preview performed no database writes');

const css=readFileSync(new URL('../web/ia-a-ui.css',import.meta.url),'utf8');
const selected=css.match(/body\[data-ia-a-role\] \.access-member-list>button\.selected\{([^}]+)\}/g)?.at(-1)||'';
assert.match(selected,/background:var\(--ia-surface-raised\)/,'selected access row uses a themed raised surface');
assert.match(selected,/color:var\(--ia-text\)/,'selected access row uses readable themed text');
for(const stateName of ['hover','active','focus-visible','disabled'])assert.match(css,new RegExp(`access-member-list>button:${stateName}`),'access member row defines '+stateName+' state');
assert.match(css,/access-preview-actions button:disabled\{[^}]*background:var\(--ia-surface-soft\)[^}]*color:var\(--ia-muted\)/,'unavailable preview explanation remains theme readable');
function rgb(value){const hex=value.slice(1);return[0,2,4].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4)}
function ratio(foreground,background){const luminance=color=>{const [r,g,b]=rgb(color);return .2126*r+.7152*g+.0722*b};const first=luminance(foreground),second=luminance(background);return(Math.max(first,second)+.05)/(Math.min(first,second)+.05)}
for(const theme of ['olive','forest','slate','night','graphite','earth','moss','aubergine','high-contrast','chalk']){
  const block=css.match(new RegExp(`body\\[data-ia-a-role\\]\\[data-socle-theme="${theme}"\\]\\{([^}]+)\\}`))?.[1];
  assert.ok(block,theme+' theme token block exists');
  const token=name=>block.match(new RegExp(`--ia-${name}:(#[0-9a-fA-F]{6})`))?.[1];
  const text=token('text'),raised=token('surface-raised'),surface=token('surface'),soft=token('surface-soft'),bg=token('bg');
  assert.ok(text&&raised&&surface&&soft&&bg,theme+' defines all access surface tokens');
  assert.ok(ratio(text,raised)>=4.5,theme+' selected row text contrast >= 4.5:1');
  if(['forest','earth','high-contrast','chalk'].includes(theme))assert.ok(new Set([bg,surface,soft,raised]).size>=3,theme+' light palette uses multiple distinct tinted surfaces');
}
assert.doesNotMatch(selected,/#(?:[0-9a-f]{3,8})|rgb\(/i,'selected access state has no hard-coded color');
console.log('access-preview-fidelity-01: PASS — '+JSON.stringify(previewMeasurements));
