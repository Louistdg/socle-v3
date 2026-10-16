import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (['NODE_ENV', 'RUNTIME_ENV', 'SOCLE_RUNTIME_ENV'].some(name => process.env[name]?.toLowerCase() === 'production')) throw new Error('Le serveur local et son authentification de test sont interdits en production.');
const host = '127.0.0.1';
const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.slice(7) || 4281);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port local invalide.');
const address = `http://${host}:${port}`;
const lanMode = process.argv.includes('--lan');
const lanAddresses = lanMode ? Object.values(networkInterfaces()).flat().filter(info => info.family === 'IPv4' && !info.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(info.address)).map(info => info.address) : [];
const allowedHosts = new Set([`${host}:${port}`, `localhost:${port}`, ...lanAddresses.map(ip => `${ip}:${port}`)]);
const databaseArgument = process.argv.find(arg => arg.startsWith('--db-path='));
if (databaseArgument === '--db-path=') throw new Error('Chemin de base locale vide.');
const databasePath = resolve(databaseArgument?.slice('--db-path='.length) || join(root, 'data', 'socle.sqlite'));
const dataDirectory = dirname(databasePath);

const build = spawnSync(process.execPath, [join(root, 'scripts', 'build.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status || 1);

mkdirSync(dataDirectory, { recursive: true });
const database = new DatabaseSync(databasePath);
database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
const migrations = readdirSync(join(root, 'drizzle'))
  .filter(name => /^\d+.*\.sql$/.test(name))
  .sort();
for (const name of migrations) {
  const applied = database.prepare('SELECT 1 FROM local_migrations WHERE name = ?').get(name);
  if (applied) continue;
  const sql = readFileSync(join(root, 'drizzle', name), 'utf8');
  database.exec('BEGIN');
  try {
    database.exec(sql);
    database.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

const stamp=()=>new Date().toISOString();
const sha256=value=>createHash('sha256').update(value).digest('hex');
function audit(userId,action,entityType,entityId,newValues={}){database.prepare('INSERT INTO audit_logs(id,organization_id,user_id,action,entity_type,entity_id,new_values,created_at) VALUES(?,?,?,?,?,?,?,?)').run(`audit-${randomUUID()}`,'org-local-owner',userId,action,entityType,entityId,JSON.stringify(newValues),stamp())}
function auditOnce(action,entityType,entityId,newValues){if(!database.prepare('SELECT 1 FROM audit_logs WHERE action=? AND entity_type=? AND entity_id=?').get(action,entityType,entityId))audit('local-owner',action,entityType,entityId,newValues)}
function seedLocalTestIdentities(){
  const owner=database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get('org-local-owner')||database.prepare('SELECT payload FROM workspace_state WHERE user_id=?').get('local-owner');if(!owner)return;
  const state=JSON.parse(owner.payload),people=state.people||[],findPerson=name=>people.find(person=>person.name===name);
  const identities=[
    {id:'test-marc',profileId:'local-owner',name:'Marc Delcourt',email:'direction@batinova.example',role:'OWNER',roleId:'role-owner-local-owner',permissions:[],projects:[]},
    {id:'test-anthony',profileId:'test-anthony',name:'Anthony Simon',email:'anthony.simon@batinova.example',role:'WORKER',roleId:'role-worker-local-owner',permissions:[],projects:[]},
    {id:'test-unlinked-worker',profileId:'test-unlinked-worker',name:'Profil Sans Roster',email:'unlinked.worker@batinova.example',role:'WORKER',roleId:'role-worker-local-owner',permissions:[],projects:[],unlinked:true}
  ];
  const teamLeadMember=database.prepare("SELECT om.user_id,om.person_id,r.id role_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='TEAM_LEAD' AND om.person_id=? LIMIT 1").get('org-local-owner',String(findPerson('David Leclercq')?.id||''));
  if(teamLeadMember?.user_id&&teamLeadMember?.person_id){
    const person=people.find(candidate=>String(candidate.id)===String(teamLeadMember.person_id));
    if(!person)throw Error('Personne BatiNova TEAM_LEAD introuvable.');
    identities.push({id:'test-david',profileId:String(teamLeadMember.user_id),name:String(person.name),email:'david.leclercq@batinova.example',role:'TEAM_LEAD',roleId:String(teamLeadMember.role_id),permissions:[],projects:[]});
  }
  const accountingMember=database.prepare("SELECT om.user_id,om.person_id,r.id role_id,p.first_name,p.last_name,p.email FROM organization_members om JOIN roles r ON r.id=om.role_id JOIN profiles p ON p.id=om.user_id WHERE om.organization_id=? AND om.status='active' AND r.code='ACCOUNTING' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get('org-local-owner');
  if(accountingMember?.user_id){
    const accountingName=[accountingMember.first_name,accountingMember.last_name].filter(Boolean).join(' ').trim()||String(state.company?.accountant||'Comptable BatiNova');
    const accountingEmail=String(accountingMember.email||state.company?.accountantEmail||'batxl.accounting@simulation.invalid');
    identities.push({id:'test-accounting',profileId:String(accountingMember.user_id),name:accountingName,email:accountingEmail,role:'ACCOUNTING',roleId:String(accountingMember.role_id),permissions:[],projects:[],standalone:true,loginEmail:'batxl.accounting@simulation.invalid'});
  }
  database.prepare('UPDATE organizations SET name=?,legal_name=?,updated_at=? WHERE id=?').run(state.company?.name||'BatiNova Entreprise Générale SRL',state.company?.name||'BatiNova Entreprise Générale SRL',stamp(),'org-local-owner');
  for(const entry of identities){
    const person=entry.standalone||entry.unlinked?null:entry.personId?people.find(candidate=>String(candidate.id)===String(entry.personId)):findPerson(entry.name);
    if(!entry.standalone&&!entry.unlinked&&!person)throw Error(`Personne BatiNova introuvable : ${entry.name}`);
    const personId=entry.unlinked?null:entry.standalone?'BATXL-ACCOUNTING-EXTERNAL':String(person.id);
    const loginEmail=String(entry.loginEmail||entry.email).toLowerCase();
    const existed=database.prepare('SELECT 1 FROM local_test_identities WHERE id=?').get(entry.id);
    const [firstName,...lastName]=entry.name.split(' ');
    database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,updated_at=excluded.updated_at').run(entry.profileId,firstName,lastName.join(' '),entry.email,stamp(),stamp());
    database.prepare('INSERT OR IGNORE INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(entry.roleId,'org-local-owner',entry.role,entry.role==='OWNER'?'Propriétaire':entry.role==='TEAM_LEAD'?'Chef d’équipe':entry.role==='ACCOUNTING'?'Comptable':'Ouvrier',stamp());
    database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role_id=excluded.role_id,status=excluded.status,updated_at=excluded.updated_at').run(`member-${entry.profileId}`,'org-local-owner',entry.profileId,entry.roleId,'active',stamp(),stamp(),stamp());
    const membershipPersonId=entry.standalone?null:personId;
    database.prepare('UPDATE organization_members SET person_id=? WHERE organization_id=? AND user_id=?').run(entry.unlinked?null:membershipPersonId,'org-local-owner',entry.profileId);
    auditOnce('local_test_role.assigned','organization_member',entry.profileId,{role:entry.role});
    for(const permission of entry.permissions){database.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(entry.roleId,permission);auditOnce('local_test_permission.granted','role_permission',`${entry.roleId}:${permission}`,{permission})}
    for(const projectId of entry.projects){database.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org-local-owner',entry.profileId,String(projectId),'local-owner',stamp());auditOnce('local_test_scope.granted','project_access',`${entry.profileId}:${projectId}`,{project_id:String(projectId)})}
    const localIdentityPersonId=entry.unlinked?'UNLINKED-WORKER-SENTINEL':personId;
    database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET profile_id=excluded.profile_id,person_id=excluded.person_id,email=excluded.email,display_name=excluded.display_name,updated_at=excluded.updated_at').run(entry.id,'org-local-owner',entry.profileId,localIdentityPersonId,loginEmail,entry.name,'simulation_not_sent',stamp(),stamp());
    if(entry.unlinked)database.prepare('UPDATE organization_members SET person_id=NULL WHERE organization_id=? AND user_id=?').run('org-local-owner',entry.profileId);
    if(!existed)audit('local-owner','local_test_identity.created','local_test_identity',entry.id,{email:loginEmail,person_id:localIdentityPersonId,invitation_status:'simulation_not_sent'});
  }
}

function setHomePersonScopeHomonymFixture(enabled){
  const organizationId='org-local-owner',identityId='test-anthony-homonym',profileId='test-anthony-homonym',personId='HPS-HOMONYM-PERSON',email='anthony.homonym@batinova.example',roleId='role-worker-local-owner';
  const owner=database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId)||database.prepare('SELECT payload FROM workspace_state WHERE user_id=?').get('local-owner');
  if(!owner){
    if(!enabled)return{enabled:false,people:0,personId};
    throw Error('Workspace BatiNova introuvable pour la fixture homonyme.');
  }
  const state=JSON.parse(owner.payload),people=Array.isArray(state.people)?state.people:[];
  state.people=people.filter(person=>String(person.id)!==personId);
  if(enabled)state.people.push({id:personId,name:'Anthony Simon',category:'Ouvrier',trade:'Test homonyme HOME-PERSON-SCOPE',training:[],hr:{permits:[]}});
  database.prepare('UPDATE organization_workspace_state SET payload=?,updated_at=? WHERE organization_id=?').run(JSON.stringify(state),stamp(),organizationId);

  if(enabled){
    database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,updated_at=excluded.updated_at').run(profileId,'Anthony','Simon',email,stamp(),stamp());
    database.prepare('INSERT OR IGNORE INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(roleId,organizationId,'WORKER','Ouvrier',stamp());
    database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role_id=excluded.role_id,status=excluded.status,person_id=excluded.person_id,updated_at=excluded.updated_at').run('member-'+profileId,organizationId,profileId,roleId,'active',stamp(),stamp(),stamp());
    database.prepare('UPDATE organization_members SET person_id=? WHERE organization_id=? AND user_id=?').run(personId,organizationId,profileId);
    database.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,invitation_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET profile_id=excluded.profile_id,person_id=excluded.person_id,email=excluded.email,display_name=excluded.display_name,invitation_status=excluded.invitation_status,updated_at=excluded.updated_at').run(identityId,organizationId,profileId,personId,email,'Anthony Simon','simulation_not_sent',stamp(),stamp());
  }else{
    database.prepare('DELETE FROM local_test_sessions WHERE identity_id=?').run(identityId);
    database.prepare('DELETE FROM local_test_identities WHERE id=?').run(identityId);
    database.prepare('DELETE FROM project_access WHERE organization_id=? AND user_id=?').run(organizationId,profileId);
    database.prepare('DELETE FROM organization_members WHERE organization_id=? AND user_id=?').run(organizationId,profileId);
    database.prepare('DELETE FROM profiles WHERE id=?').run(profileId);
  }
  return{enabled,people:state.people.length,personId};
}
seedLocalTestIdentities();
setHomePersonScopeHomonymFixture(false);

const { default: worker } = await import('../dist/server/index.js');
const env = {
  LOCAL_TEST_MODE: true,
  DB: {
    prepare(sql) {
      let values = [];
      return {
        _sql: sql,
        get _values(){ return values; },
        bind(...args) { values = args; return this; },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async all() { return { results: database.prepare(sql).all(...values) }; },
        async run() {
          const result = database.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results=[];
        for(const statement of statements){const result=database.prepare(statement._sql).run(...statement._values);results.push({meta:{changes:Number(result.changes)}})}
        database.exec('COMMIT');
        return results;
      } catch(error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  },
};

const cookieValue=(headers,name)=>String(headers.get('cookie')||'').split(';').map(value=>value.trim()).find(value=>value.startsWith(name+'='))?.slice(name.length+1)||'';
function sessionIdentity(headers){const token=cookieValue(headers,'socle_test_session');if(!token)return null;return database.prepare("SELECT i.profile_id,p.email FROM local_test_sessions s JOIN local_test_identities i ON i.id=s.identity_id JOIN profiles p ON p.id=i.profile_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1").get(sha256(token),stamp())||null}

const server = createServer(async (incoming, outgoing) => {
  try {
    if (!allowedHosts.has(incoming.headers.host)) {
      outgoing.writeHead(403).end('Adresse du serveur non autorisée');
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 10_000_000) {
        outgoing.writeHead(413).end('Requête trop volumineuse');
        return;
      }
      chunks.push(chunk);
    }
    const headers = new Headers(incoming.headers);
    if(incoming.url==='/__local-test/production-runtime.js'&&['GET','HEAD'].includes(incoming.method)){const source=`globalThis.SOCLE_PRODUCTION=true;globalThis.SOCLE_BLANK=true;document.addEventListener('DOMContentLoaded',()=>{const host=document.querySelector('.header-right');if(!host)return;const form=document.createElement('form');form.method='post';form.action='/auth/logout';const button=document.createElement('button');button.textContent='Se déconnecter';button.className='btn';form.append(button);host.append(form)});`;outgoing.writeHead(200,{'content-type':'application/javascript;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}).end(incoming.method==='HEAD'?undefined:source);return;}
    if(incoming.url==='/__local-test/identities'&&incoming.method==='GET'){const identities=database.prepare('SELECT email,display_name displayName,invitation_status invitationStatus FROM local_test_identities ORDER BY display_name').all();outgoing.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({identities}));return;}
    if(incoming.url==='/__local-test/home-person-scope-homonym'&&incoming.method==='POST'){const data=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'),result=setHomePersonScopeHomonymFixture(data.enabled!==false);outgoing.writeHead(204,{'cache-control':'no-store','x-socle-fixture-people':String(result.people)}).end();return;}
    if(incoming.url==='/__local-test/login'&&incoming.method==='POST'){const data=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'),identity=database.prepare('SELECT id FROM local_test_identities WHERE email=? AND invitation_status=?').get(String(data.email||'').toLowerCase(),'simulation_not_sent');if(!identity){outgoing.writeHead(403,{'content-type':'application/json'}).end(JSON.stringify({error:'Identité locale inconnue.'}));return}const token=randomBytes(32).toString('base64url'),expires=new Date(Date.now()+8*60*60*1000).toISOString();database.prepare('INSERT INTO local_test_sessions(id,identity_id,token_hash,created_at,expires_at) VALUES(?,?,?,?,?)').run(`session-${randomUUID()}`,identity.id,sha256(token),stamp(),expires);outgoing.writeHead(204,{'set-cookie':`socle_test_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`}).end();return;}
    if((incoming.url==='/__local-test/logout'||incoming.url==='/auth/logout')&&incoming.method==='POST'){const token=cookieValue(headers,'socle_test_session');if(token)database.prepare('UPDATE local_test_sessions SET revoked_at=? WHERE token_hash=?').run(stamp(),sha256(token));outgoing.writeHead(204,{'set-cookie':'socle_test_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}).end();return;}
    headers.delete('oai-authenticated-user-id');headers.delete('oai-authenticated-user-email');const identity=sessionIdentity(headers);if(identity){headers.set('oai-authenticated-user-id',identity.profile_id);if(identity.email)headers.set('oai-authenticated-user-email',identity.email)}
    const url = new URL(incoming.url || '/', `http://${incoming.headers.host}`);
    const request = new Request(url, {
      method: incoming.method,
      headers,
      ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Buffer.concat(chunks) } : {}),
    });
    const response = await worker.fetch(request, env);
    let body=Buffer.from(await response.arrayBuffer());
    if((url.pathname==='/'||url.pathname==='/index.html')&&response.headers.get('content-type')?.includes('text/html')){
      const html=body.toString('utf8').replace('<script src="/production-runtime.js"></script>','<script src="/__local-test/production-runtime.js"></script>');
      if(html===body.toString('utf8'))throw Error('Le runtime de test local ne peut pas être installé dans index.html.');
      body=Buffer.from(html);
    }
    const responseHeaders=Object.fromEntries(response.headers);delete responseHeaders['content-length'];
    outgoing.writeHead(response.status,responseHeaders);
    outgoing.end(incoming.method==='HEAD'?undefined:body);
  } catch (error) {
    console.error(error);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end('Erreur du serveur local');
  }
});

server.on('error', error => {
  console.error(`Impossible de démarrer le site local : ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, lanAddresses.length ? '0.0.0.0' : host, () => {
  console.log(`Socle est prêt : ${address}`);
  for (const ip of lanAddresses) console.log(`Téléphone sur le même Wi-Fi : http://${ip}:${port}/`);
  console.log(`Les données sont enregistrées dans ${databasePath}`);
  console.log('Fermez cette fenêtre pour arrêter le site.');
  if (process.argv.includes('--open') && process.platform === 'win32') {
    const browser = spawn('cmd.exe', ['/c', 'start', '', address], {
      windowsHide: true,
      stdio: 'ignore',
      detached: true,
    });
    browser.on('error', () => console.log(`Ouvrez ${address} dans votre navigateur.`));
    browser.unref();
  }
});
