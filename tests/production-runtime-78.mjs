import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readFileSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import net from 'node:net';
import {randomBytes} from 'node:crypto';
import {productionConfig} from '../scripts/production-config.mjs';
import {openProductionDatabase} from '../scripts/production-db.mjs';
import {provisionCredential} from '../scripts/production-auth.mjs';
import {startProduction} from '../scripts/production.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'socle-production-'));
const volume = join(temporary, 'volume');
const {mkdirSync} = await import('node:fs'); mkdirSync(volume);
const origin = 'https://socle.example.test';
const proxyOrigin = 'https://soclev2-dcjjdh8qz7-8320.vercel.app';
const secret = randomBytes(32).toString('base64url');
const password = 'A unique production password 2026!';
const env = {PORT: '43801', SOCLE_PUBLIC_URL: origin, SOCLE_TRUSTED_ORIGINS: proxyOrigin, SOCLE_SESSION_SECRET: secret, SOCLE_DATA_DIR: volume};
const dbPath = join(volume, 'socle.sqlite');
let runtime, child;
async function freePort() {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(done => probe.close(done)); return port;
}
async function api(base, path, options = {}) { return fetch(base + path, {redirect: 'manual', ...options}); }
async function login(base, email, supplied = password) {
  return api(base, '/auth/login', {method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: JSON.stringify({email, password: supplied})});
}
function reopen() { return openProductionDatabase({databasePath: dbPath, migrationsDirectory: join(root, 'drizzle')}); }

try {
  for (const key of ['PORT', 'SOCLE_PUBLIC_URL', 'SOCLE_SESSION_SECRET', 'SOCLE_DATA_DIR']) {
    const missing = {...env}; delete missing[key]; assert.throws(() => productionConfig(missing), /configuration/);
  }
  for (const override of [{PORT: '0'}, {SOCLE_PUBLIC_URL: 'http://socle.test'}, {SOCLE_PUBLIC_URL: origin + '/path'}, {SOCLE_TRUSTED_ORIGINS: 'http://proxy.test'}, {SOCLE_TRUSTED_ORIGINS: 'https://proxy.test/path'}, {SOCLE_SESSION_SECRET: 'short'}, {LOCAL_TEST_MODE: '0'}, {DATABASE_URL: 'postgres://invalid'}, {WEB_CONCURRENCY: '2'}, {SOCLE_ALLOW_BOOTSTRAP: '1'}, {SOCLE_DB_PATH: ':memory:'}, {SOCLE_DB_PATH: join(temporary, 'outside.sqlite')}]) assert.throws(() => productionConfig({...env, ...override}));
  if (process.platform !== 'win32') {
    symlinkSync(temporary, join(volume, 'escape')); assert.throws(() => productionConfig({...env, SOCLE_DB_PATH: join(volume, 'escape', 'outside.sqlite')}));
  }
  assert.throws(() => productionConfig({...env, RAILWAY_PROJECT_ID:'railway-project'}), /attached volume/);
  const configured = productionConfig({...env, RAILWAY_PROJECT_ID:'railway-project',RAILWAY_VOLUME_MOUNT_PATH:volume});
  assert.equal(configured.databasePath, dbPath);
  assert.ok(configured.trustedOrigins.has(origin));
  assert.ok(configured.trustedOrigins.has(proxyOrigin));
  // Start from a genuinely empty volume: schema only, zero companies/users/demo.
  env.PORT = String(await freePort());
  runtime = await startProduction({env, logger: {log(){}, error(){}}});
  assert.equal(runtime.server.address().address, '0.0.0.0');
  let base = 'http://127.0.0.1:' + env.PORT;
  assert.equal((await api(base, '/health')).status, 200);
  assert.equal((await api(base, '/health', {method: 'HEAD'})).status, 200);
  assert.equal((await api(base, '/')).headers.get('location'), '/login');
  const loginHtml = await (await api(base, '/login')).text();
  assert.match(loginHtml, /type="password"/); assert.doesNotMatch(loginHtml, /Marc|David|Anthony|ACCOUNTING|__local-test/);
  for (const path of ['/__local-test/identities', '/__local-test/login', '/__local-test/logout', '/%5f%5flocal-test/login']) {
    assert.equal((await api(base, path)).status, 404);
    assert.equal((await api(base, path, {method: 'POST', headers: {origin}})).status, 404);
  }
  assert.equal((await api(base, '/api/bootstrap', {headers: {'oai-authenticated-user-id': 'owner-a', 'oai-authenticated-user-email': 'owner-a@example.test'}})).status, 401);
  assert.equal((await login(base, 'unknown@example.test')).status, 401);
  await runtime.close(); runtime = null;
  let storage = reopen();
  for (const table of ['profiles', 'organizations', 'production_credentials', 'production_sessions', 'local_test_identities', 'simulation_runs']) assert.equal(storage.database.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n, 0, table);
  const db = storage.database, stamp = '2026-10-01T00:00:00Z';
  for (const org of ['a', 'b']) {
    db.prepare('INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)').run('org-' + org, 'Real organization ' + org, stamp, stamp);
    for (const role of ['OWNER', 'WORKER']) db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(role + org, 'org-' + org, role, role, stamp);
  }
  for (const [id, org, role] of [['owner-a','a','OWNER'], ['owner-b','b','OWNER'], ['worker-a','a','WORKER'], ['simulation-a','a','OWNER']]) {
    db.prepare('INSERT INTO profiles(id,email,created_at,updated_at) VALUES(?,?,?,?)').run(id, id + '@example.test', stamp, stamp);
    db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id, 'org-' + org, id, role + org, 'active', stamp, stamp, stamp);
  }
  db.prepare('INSERT INTO local_test_identities(id,organization_id,profile_id,person_id,email,display_name,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('simulation-id','org-a','simulation-a','sim-person','simulation-a@example.test','Simulation',stamp,stamp);
  db.prepare("INSERT INTO profiles(id,first_name,last_name,created_at,updated_at,identity_kind) VALUES(?,?,?,?,?,'provenance')").run('history-actor','Historical','Actor',stamp,stamp);
  assert.throws(()=>db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('history-member','org-a','history-actor','OWNERa','active',stamp,stamp),/provenance actor/);
  assert.throws(()=>db.prepare('INSERT INTO production_credentials(user_id,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').run('history-actor','history@example.test','invalid',stamp,stamp),/provenance actor/);
  await assert.rejects(provisionCredential(db, {userId:'history-actor', password, secret}), /existing real profile/);
  await assert.rejects(provisionCredential(db, {userId:'simulation-a', password, secret}), /simulation/);
  await assert.rejects(provisionCredential(db, {userId:'missing', password, secret}), /existing/);
  for (const userId of ['owner-a','owner-b','worker-a']) await provisionCredential(db, {userId, password, secret});
  assert.equal(db.prepare('SELECT COUNT(*) n FROM profiles').get().n, 5);
  db.prepare('INSERT INTO projects(id,organization_id,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('project-b','org-b','Foreign project','active',stamp,stamp);
  storage.close();
  env.PORT = String(await freePort()); base = 'http://127.0.0.1:' + env.PORT;
  runtime = await startProduction({env, logger: {log(){}, error(){}}});
  assert.equal((await api(base, '/auth/login', {method:'POST', headers:{origin:'https://attacker.test'}, body:'{}'})).status, 403);
  assert.equal((await api(base, '/auth/login', {method:'POST', body:'{}'})).status, 403);
  assert.equal((await api(base, '/auth/login', {method:'POST', headers:{origin:proxyOrigin,'content-type':'application/json'}, body:'{}'})).status, 401);
  assert.equal((await login(base, 'owner-a@example.test', 'incorrect password')).status, 401);
  const signed = await login(base, 'owner-a@example.test'); assert.equal(signed.status, 200);
  const setCookie = signed.headers.get('set-cookie');
  for (const flag of ['__Host-socle_session=', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(setCookie.includes(flag), flag);
  const cookie = setCookie.split(';')[0];
  let result = await api(base, '/api/bootstrap', {headers:{cookie, 'oai-authenticated-user-id':'owner-b', 'oai-authenticated-user-email':'owner-b@example.test', 'x-forwarded-host':'attacker.test'}});
  assert.equal(result.status, 200); assert.equal((await result.json()).organization.id, 'org-a');
  assert.equal((await api(base, '/api/bootstrap', {headers:{cookie, 'x-socle-organization-id':'org-b'}})).status, 403);
  assert.equal((await api(base, '/api/projects/project-b/hub', {headers:{cookie}})).status, 404);
  const workerSigned = await login(base, 'worker-a@example.test'); assert.equal(workerSigned.status,200);
  const workerCookie = workerSigned.headers.get('set-cookie').split(';')[0];
  assert.equal((await api(base, '/api/accounting/summary', {headers:{cookie:workerCookie, 'oai-authenticated-user-id':'owner-a'}})).status, 403);
  const html = await (await api(base, '/', {headers:{cookie}})).text();
  assert.ok(html.indexOf('/production-runtime.js') < html.indexOf('workspace-config.js'));
  assert.equal((html.match(/<script\b[^>]*\bsrc=["']\/?production-runtime\.js["']/g)||[]).length,1,'The production runtime must execute once, including when the built page already contains it.');
  const configScript = await (await api(base, '/production-runtime.js', {headers:{cookie}})).text();
  assert.match(configScript, /SOCLE_PRODUCTION=true/);
  assert.equal((await api(base, '/api/state', {method:'PUT', headers:{cookie, origin:'https://attacker.test'}, body:'{}'})).status, 403);
  assert.equal((await api(base, '/api/state', {method:'PUT', headers:{cookie}, body:'{}'})).status, 403);
  await runtime.close(); runtime = null;
  // Session and database survive process restart; then expiry and membership revocation take effect.
  env.PORT = String(await freePort()); base = 'http://127.0.0.1:' + env.PORT;
  runtime = await startProduction({env, logger:{log(){},error(){}}});
  assert.equal((await api(base, '/api/bootstrap', {headers:{cookie}})).status,200);
  storage = reopen();
  assert.notEqual(storage.database.prepare('SELECT token_hash FROM production_sessions WHERE user_id=?').get('owner-a').token_hash, cookie.split('=')[1]);
  storage.database.prepare("UPDATE production_sessions SET expires_at=created_at+1 WHERE user_id='owner-a'").run();
  assert.equal((await api(base, '/api/bootstrap', {headers:{cookie}})).status,401);
  const fresh = await login(base,'owner-a@example.test'); const freshCookie=fresh.headers.get('set-cookie').split(';')[0];
  await api(base, '/auth/logout', {method:'POST', headers:{cookie:freshCookie, origin}});
  assert.equal((await api(base,'/api/bootstrap',{headers:{cookie:freshCookie}})).status,401);
  storage.database.prepare("UPDATE organization_members SET status='disabled' WHERE user_id='worker-a'").run();
  assert.equal((await api(base,'/api/bootstrap',{headers:{cookie:workerCookie}})).status,401);
  for(let i=0;i<5;i++) assert.equal((await login(base,'owner-a@example.test','wrong password')).status,401);
  assert.equal((await login(base,'owner-a@example.test')).status,401);
  await provisionCredential(storage.database,{userId:'owner-a',password,secret});
  assert.equal((await login(base,'owner-a@example.test')).status,200);
  assert.deepEqual(storage.database.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(storage.database.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  storage.close();
  // Offline provisioning preserves UTF-8 even when stdin splits an emoji byte sequence.
  const unicodePassword = 'Un mot de passe réel avec 🔑 sécurisé';
  const input = Buffer.from(unicodePassword + '\n');
  const cut = input.indexOf(Buffer.from('🔑')) + 1;
  const provisioner = spawn(process.execPath, ['scripts/production-account.mjs', 'owner-a'], {cwd: root, env: {...process.env,...env,LOCAL_TEST_MODE:undefined,DATABASE_URL:undefined,RAILWAY_VOLUME_MOUNT_PATH:undefined,SOCLE_ALLOW_BOOTSTRAP:'0'}, stdio:['pipe','pipe','pipe']});
  let provisionLogs = ''; provisioner.stdout.on('data', value => provisionLogs += value); provisioner.stderr.on('data', value => provisionLogs += value);
  provisioner.stdin.write(input.subarray(0, cut));
  await new Promise(done => setTimeout(done, 100));
  provisioner.stdin.end(input.subarray(cut));
  const [provisionExit] = await once(provisioner, 'exit'); assert.equal(provisionExit, 0, provisionLogs);
  assert.equal((await login(base,'owner-a@example.test',unicodePassword)).status,200);
  await runtime.close(); runtime=null;
  // Exercise exactly the package start command as a child process, independently of import tests.
  assert.equal(JSON.parse(readFileSync(join(root,'package.json'))).scripts.start,'node scripts/production.mjs');
  env.PORT = String(await freePort()); base='http://127.0.0.1:'+env.PORT;
  child=spawn(process.execPath,['scripts/production.mjs'],{cwd:root,env:{...process.env,...env,LOCAL_TEST_MODE:undefined,DATABASE_URL:undefined,SOCLE_ALLOW_BOOTSTRAP:'0',RAILWAY_VOLUME_MOUNT_PATH:undefined},stdio:['ignore','pipe','pipe']});
  let logs=''; child.stdout.on('data',bytes=>logs+=bytes); child.stderr.on('data',bytes=>logs+=bytes);
  const deadline=Date.now()+15_000;
  while(Date.now()<deadline&&!logs.includes('listening')) {if(child.exitCode!==null)throw new Error(logs);await new Promise(done=>setTimeout(done,100));}
  assert.match(logs,new RegExp('0.0.0.0:'+env.PORT));
  assert.equal((await api(base,'/health')).status,200);
  child.kill('SIGTERM'); await once(child,'exit'); child=null;
  console.log('Production runtime: startup configuration, empty persistent volume, auth/CSRF/spoofing/RBAC/tenant refusals, sessions/restart/logout/expiry, CLI start and health PASS.');
} finally {
  if(child){child.kill();await once(child,'exit').catch(()=>{});}
  if(runtime)await runtime.close();
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + (await import('node:path')).sep));
  rmSync(temporary,{recursive:true,force:true});
}
