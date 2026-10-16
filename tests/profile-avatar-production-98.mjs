import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import {openProductionDatabase} from '../scripts/production-db.mjs';
import {provisionCredential} from '../scripts/production-auth.mjs';
import {startProduction} from '../scripts/production.mjs';

const temporary=mkdtempSync(join(tmpdir(),'socle-avatar-')),volume=join(temporary,'volume');mkdirSync(volume);
const origin='https://socle-avatar.example.test',secret=randomBytes(32).toString('base64url'),password='Avatar production password 2026!';
const migrationsDirectory=fileURLToPath(new URL('../drizzle/',import.meta.url));
async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const value=server.address().port;await new Promise(done=>server.close(done));return value}
const env={PORT:String(await freePort()),SOCLE_PUBLIC_URL:origin,SOCLE_SESSION_SECRET:secret,SOCLE_DATA_DIR:volume};
const dbPath=join(volume,'socle.sqlite'),storage=openProductionDatabase({databasePath:dbPath,migrationsDirectory});
const db=storage.database,stamp='2026-10-03T12:00:00.000Z';
for(const org of ['a','b']){db.prepare('INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)').run('org-'+org,'Org '+org,stamp,stamp);db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-'+org,'org-'+org,'WORKER','Ouvrier',stamp)}
for(const [id,org] of [['alice','a'],['bob','a'],['mallory','b']]){db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(id,id,'Test',id+'@example.test',stamp,stamp);db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-'+id,'org-'+org,id,'role-'+org,'active',stamp,stamp,stamp);await provisionCredential(db,{userId:id,password,secret})}
storage.close();

const runtime=await startProduction({env,logger:{log(){},error(){}}}),base='http://127.0.0.1:'+env.PORT;
async function login(email){const response=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0]}
const alice=await login('alice@example.test'),bob=await login('bob@example.test'),mallory=await login('mallory@example.test');
const req=(cookie,path,options={})=>fetch(base+path,{redirect:'manual',...options,headers:{origin,cookie,...(options.headers||{})}});
let response=await req(alice,'/api/profile/avatar/meta');assert.equal(response.status,200);let meta=await response.json();assert.equal(meta.hasAvatar,false);assert.equal(meta.initials,'AT');

const png=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
response=await req(alice,'/api/profile/avatar',{method:'PUT',headers:{'content-type':'image/png'},body:png});assert.equal(response.status,200);const saved=await response.json();assert.match(saved.avatarUrl,/^\/api\/profile\/avatar\?v=[a-f0-9]{16}$/);
response=await req(alice,'/api/profile/avatar');assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
response=await req(bob,'/api/profile/avatar?user=alice');assert.equal(response.status,200,'collègue du même tenant autorisé');
response=await req(mallory,'/api/profile/avatar?user=alice');assert.equal(response.status,404,'aucune fuite cross-tenant');
response=await req(alice,'/api/profile/avatar',{method:'PUT',headers:{'content-type':'image/jpeg'},body:png});assert.equal(response.status,415,'MIME incohérent refusé');
response=await req(alice,'/api/profile/avatar',{method:'PUT',headers:{'content-type':'image/svg+xml'},body:Buffer.from('<svg/>')});assert.equal(response.status,415,'SVG refusé');
response=await req(alice,'/api/profile/avatar?user=bob',{method:'DELETE'});assert.equal(response.status,403,'impossible de modifier la photo d’un autre profil');
response=await req(alice,'/api/profile/avatar',{method:'DELETE'});assert.equal(response.status,200);
response=await req(alice,'/api/profile/avatar');assert.equal(response.status,404);
const reopened=openProductionDatabase({databasePath:dbPath,migrationsDirectory});assert.equal(reopened.database.prepare('SELECT avatar_url FROM profiles WHERE id=?').get('alice').avatar_url,null);reopened.close();
assert.ok(existsSync(join(volume,'avatars')),'dossier persistant avatars');
await runtime.close();
console.log('profile-avatar-production-98: 14 assertions passed');
