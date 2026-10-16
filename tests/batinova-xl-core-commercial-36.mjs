import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {runCoreClientsProjectsCommercialPack} from '../scripts/simulation/batinova-xl/core-clients-projects-commercial-pack.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
db.exec(`
CREATE TABLE organizations(id TEXT PRIMARY KEY,name TEXT);
CREATE TABLE profiles(id TEXT PRIMARY KEY);
CREATE TABLE roles(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),code TEXT NOT NULL,name TEXT);
CREATE TABLE organization_members(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),user_id TEXT NOT NULL REFERENCES profiles(id),role_id TEXT NOT NULL REFERENCES roles(id),status TEXT NOT NULL,joined_at TEXT,created_at TEXT);
CREATE TABLE organization_workspace_state(organization_id TEXT PRIMARY KEY REFERENCES organizations(id),payload TEXT NOT NULL,revision INTEGER NOT NULL,source_user_id TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE simulation_runs(id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id),script_code TEXT NOT NULL,version INTEGER NOT NULL,applied_at TEXT NOT NULL,applied_by TEXT NOT NULL REFERENCES profiles(id),summary_json TEXT NOT NULL,UNIQUE(organization_id,script_code,version));
`);
db.prepare('INSERT INTO organizations(id,name) VALUES(?,?)').run('org-local-owner','BatiNova XL');
db.prepare('INSERT INTO profiles(id) VALUES(?)').run('local-owner');
db.prepare('INSERT INTO roles(id,organization_id,code,name) VALUES(?,?,?,?)').run('role-owner','org-local-owner','OWNER','Patron');
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at) VALUES(?,?,?,?,?,?,?)').run('member-owner','org-local-owner','local-owner','role-owner','active','2026-01-01','2026-01-01');
const initial={
  company:{name:'BatiNova XL'},
  contacts:[
    {id:'legacy-client',name:'Ancien client',roles:['Client']},
    {id:'supplier-1',name:'Fournisseur historique',roles:['Fournisseur']},
    {id:'sub-1',name:'Sous-traitant historique',roles:['Sous-traitant']}
  ],
  jobs:[{id:'1',name:'Ancien chantier'}],
  quotes:[{id:'old-q',job:'1',status:'accepté',lines:[]}],
  people:[],teams:[],assets:[]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org-local-owner',JSON.stringify(initial),1,'local-owner','2026-01-01','2026-01-01');

const first=runCoreClientsProjectsCommercialPack({database:db,organizationId:'org-local-owner'});
const row1=db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get('org-local-owner');
const state1=JSON.parse(row1.payload);
assert.equal(state1.contacts.filter(c=>(c.roles||[]).includes('Client')).length,20);
assert.equal(state1.contacts.filter(c=>(c.roles||[]).includes('Fournisseur')).length,1,'fournisseur historique préservé');
assert.equal(state1.contacts.filter(c=>(c.roles||[]).includes('Sous-traitant')).length,1,'sous-traitant historique préservé');
assert.equal(state1.jobs.length,15);
assert.equal(state1.quotes.length,27);
assert.ok(state1.jobs.every(p=>String(p.id).startsWith('BATXL-PRJ-')));
assert.ok(state1.contacts.filter(c=>(c.roles||[]).includes('Client')).every(c=>String(c.id).startsWith('BATXL-CLI-')));
assert.ok(state1.quotes.every(q=>String(q.id).startsWith('BATXL-QUOTE-')));
assert.ok(state1.quotes.some(q=>q.status==='accepté'));
assert.ok(state1.quotes.flatMap(q=>q.lines||[]).some(line=>/Ardoise naturelle/i.test(line.label)));
assert.ok(state1.quotes.flatMap(q=>q.lines||[]).some(line=>/Crochets inox/i.test(line.label)));
assert.ok(state1.quotes.flatMap(q=>q.lines||[]).some(line=>/Mortier/i.test(line.label)));
assert.ok(state1.quotes.flatMap(q=>q.lines||[]).some(line=>/EPDM/i.test(line.label)));
assert.ok(state1.quotes.flatMap(q=>q.lines||[]).every(line=>line.price>=0));
assert.ok(state1.quotes.flatMap(q=>q.lines||[]).filter(line=>line.price===0).every(line=>line.supplierQuoteRequired===true));
assert.equal(first.clients,20);
assert.equal(first.projects,15);
assert.equal(first.quotes,27);

const snapshot=JSON.stringify({contacts:state1.contacts,jobs:state1.jobs,quotes:state1.quotes});
const second=runCoreClientsProjectsCommercialPack({database:db,organizationId:'org-local-owner'});
const state2=JSON.parse(db.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get('org-local-owner').payload);
assert.equal(JSON.stringify({contacts:state2.contacts,jobs:state2.jobs,quotes:state2.quotes}),snapshot,'replay x2 déterministe');
assert.equal(second.fingerprint,first.fingerprint,'fingerprint stable');
assert.equal(Number(db.prepare("SELECT COUNT(*) n FROM simulation_runs WHERE organization_id='org-local-owner' AND script_code='BATXL-CORE-COMMERCIAL-V1'").get().n),1);
assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
console.log('BATXL_CORE_COMMERCIAL_TEST=PASS');
console.log(JSON.stringify(first));
