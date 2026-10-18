import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
const db=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort())db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
let writes=0;
const env={DB:{prepare(sql){let values=[];return{_sql:sql,_values:values,bind(...args){values=args;this._values=args;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){writes++;return{meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}}},async batch(){writes++;throw Error('Search must not write')}}};
const stamp='2026-10-18T10:00:00.000Z';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','Test','Test','BE','EUR',stamp,stamp);
for(const [uid,code] of [['owner','OWNER'],['lead','TEAM_LEAD']]){db.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(uid,uid,'Test',stamp,stamp);db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+uid,'org',code,code,stamp);db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+uid,'org',uid,'role-'+uid,'active',stamp,stamp,stamp)}
db.prepare("UPDATE organization_members SET person_id='person-lead' WHERE user_id='lead'").run();
for(const permission of ['workspace.view','projects.view.assigned','contacts.view.assigned'])db.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-lead',permission);
db.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','lead','p1','owner',stamp);
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify({version:3,company:{name:'Test'},jobs:[{id:'p1',name:'Toiture attribuée',phase:'En cours',contactIds:[]},{id:'p2',name:'BATXL-CHANTIER-SECRET',phase:'En cours',contactIds:[]}],people:[],contacts:[],quotes:[]}),1,'owner',stamp,stamp);
async function search(uid,q,extra={}){const response=await worker.fetch(new Request('https://socle.test/api/search?q='+encodeURIComponent(q),{headers:{'oai-authenticated-user-id':uid,'x-socle-organization-id':'org',origin:'https://socle.test',...extra}}),env);return{status:response.status,body:await response.json()}}
const visible=await search('lead','Toiture attribuée');assert.equal(visible.status,200);assert.ok(visible.body.groups[0].items.some(item=>item.label==='Toiture attribuée'));
const negative=await search('lead','BATXL-CHANTIER-SECRET');assert.equal(negative.status,200);assert.ok(!negative.body.groups[0].items.some(item=>item.label==='BATXL-CHANTIER-SECRET'),'Un chef d’équipe ne retrouve jamais un chantier hors attribution.');
const tooShort=await search('lead','x');assert.equal(tooShort.status,400,'La recherche refuse moins de deux caractères.');
const tooLong=await search('lead','x'.repeat(81));assert.equal(tooLong.status,400,'La recherche refuse plus de 80 caractères.');
const preview=await search('owner','BATXL-CHANTIER-SECRET',{'x-socle-access-preview-user-id':'lead'});assert.equal(preview.status,200);assert.ok(!preview.body.groups[0].items.some(item=>item.label==='BATXL-CHANTIER-SECRET'),'L’aperçu applique les droits du membre testé.');
assert.equal(writes,0,'La recherche ne réalise aucune écriture.');
console.log('search-scope-01: PASS équipe attribuée visible, chantier non attribué absent, aperçu fidèle, bornes q, lecture seule');
