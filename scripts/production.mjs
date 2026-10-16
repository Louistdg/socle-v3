import http from 'node:http';
import {join, dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {mkdir, readFile, writeFile, unlink, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {productionConfig} from './production-config.mjs';
import {openProductionDatabase} from './production-db.mjs';
import {productionAuth} from './production-auth.mjs';
import {prepareAssetResponse} from './http-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_BODY = 16 * 1024 * 1024;
const loginPage = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion — SOCLE</title><style>body{font:16px system-ui;background:#eef3f3;color:#163240;display:grid;place-items:center;min-height:95vh}main{background:white;padding:2rem;border-radius:12px;width:min(360px,80vw)}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{padding:12px;margin:8px 0 20px}button{background:#163240;color:white;border:0;border-radius:6px}p{line-height:1.5}</style><main><h1>Se connecter à SOCLE</h1><form action="/auth/login" method="post"><label>E-mail<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Mot de passe<input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label><button>Se connecter</button></form><p>Utilisez le compte qui vous a été attribué par votre entreprise.</p></main></html>`;
const activationPage = authenticated => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Invitation — SOCLE</title></head><body><main><h1>Rejoindre une entreprise sur SOCLE</h1><p id="activation-status">Vérification du lien d’invitation…</p><form id="activation-form" data-authenticated="${authenticated ? 'true' : 'false'}"><label>Prénom<input name="firstName" autocomplete="given-name" maxlength="80"></label><label>Nom<input name="lastName" autocomplete="family-name" maxlength="100"></label><label>Mot de passe<input name="password" type="password" autocomplete="new-password" minlength="15" maxlength="1024"></label><button type="submit">${authenticated ? 'Confirmer mon accès' : 'Activer mon compte'}</button></form><p>Si vous avez déjà un compte SOCLE, connectez-vous puis rouvrez ce lien d’invitation.</p><a href="/login">Se connecter</a></main><script src="/invite-activation.js" defer></script></body></html>`;
const runtimeScript = `globalThis.SOCLE_PRODUCTION=true;globalThis.SOCLE_BLANK=true;
const productionFetch=globalThis.fetch;globalThis.fetch=async function(...args){const response=await productionFetch(...args);if(response.status===401&&new URL(typeof args[0]==='string'?args[0]:args[0].url,location.href).origin===location.origin)location.replace('/login');return response;};
document.addEventListener('DOMContentLoaded',()=>{const host=document.querySelector('.header-right');if(!host)return;const form=document.createElement('form');form.method='post';form.action='/auth/logout';const button=document.createElement('button');button.textContent='Se déconnecter';button.className='btn';form.append(button);host.append(form);});`;


const AVATAR_MAX_BYTES = 1_500_000;
const AVATAR_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);
function avatarDescriptor(value) {
  const match = /^avatar:(jpg|png|webp):([a-f0-9]{16})$/.exec(String(value || ''));
  return match ? {ext: match[1], version: match[2]} : null;
}
function detectAvatarMime(bytes) {
  const b = new Uint8Array(bytes);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}
function avatarFile(config, userId, ext) {
  const key = createHash('sha256').update(String(userId)).digest('hex');
  return join(config.volume, 'avatars', key + '.' + ext);
}
function avatarMime(ext) {
  return ext === 'jpg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/webp';
}
function avatarInitials(profile) {
  const parts = [profile?.first_name, profile?.last_name].filter(Boolean);
  return (parts.length ? parts.map(part => String(part).trim()[0]).join('') : String(profile?.email || '?')[0]).slice(0, 2).toUpperCase();
}
function canReadAvatar(database, viewerId, targetId) {
  if (String(viewerId) === String(targetId)) return true;
  return Boolean(database.prepare(`
    SELECT 1
    FROM organization_members viewer
    JOIN organization_members target ON target.organization_id=viewer.organization_id
    WHERE viewer.user_id=? AND target.user_id=?
      AND viewer.status='active' AND target.status='active'
    LIMIT 1
  `).get(String(viewerId), String(targetId)));
}

function response(body, status = 200, headers = {}) {
  return new Response(body, {status, headers: {'content-type': 'application/json;charset=utf-8', ...headers}});
}
function errorResponse(status, message) { return response(JSON.stringify({error: message}), status); }
const redirect = (location, headers = {}) => response(null, 303, {location, ...headers});

function htmlText(value) { return String(value || '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }

function createInvitationMailer(env, override) {
  if (typeof override === 'function') return override;
  if (!env.RESEND_API_KEY || !env.SOCLE_EMAIL_FROM) return null;
  return async ({to, token, expiresAt, organizationName, roleName, personName}) => {
    const activation = new URL('/invite/activate', env.SOCLE_PUBLIC_URL);
    activation.hash = token;
    const organization = htmlText(organizationName || 'votre entreprise');
    const subjectOrganization = String(organizationName || 'SOCLE').replace(/[\r\n]+/g, ' ').slice(0, 120);
    const role = htmlText(roleName || 'collaborateur');
    const greeting = personName ? `Bonjour ${htmlText(personName)},` : 'Bonjour,';
    const link = htmlText(activation.href);
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {'authorization': `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json'},
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({from: env.SOCLE_EMAIL_FROM, to: [to], subject: `Invitation à rejoindre ${subjectOrganization}`, html: `<p>${greeting}</p><p>Vous êtes invité(e) à rejoindre <strong>${organization}</strong> avec le rôle <strong>${role}</strong>.</p><p><a href="${link}">Activer votre accès à SOCLE</a></p><p>Ce lien expire le ${htmlText(expiresAt)}. Si vous n’attendiez pas cette invitation, ignorez ce message.</p>`})
    });
    if (!response.ok) throw new Error('Invitation email delivery failed.');
  };
}

async function acceptInvitationWithWorker(worker, workerEnv, origin, token, identity) {
  const result = await worker.fetch(new Request(new URL('/api/invitations/accept', origin), {
    method: 'POST',
    headers: {'origin': origin, 'content-type': 'application/json', 'oai-authenticated-user-id': identity.userId, 'oai-authenticated-user-email': identity.email},
    body: JSON.stringify({token})
  }), workerEnv);
  let body = {}; try { body = await result.json(); } catch {}
  return {status: result.status, body};
}

async function bodyOf(incoming, limit = MAX_BODY) {
  if (Number(incoming.headers['content-length'] || 0) > limit) throw Object.assign(new Error('Payload too large'), {status: 413});
  const chunks = []; let size = 0;
  for await (const chunk of incoming) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Payload too large'), {status: 413});
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function startProduction({env = process.env, logger = console, invitationMailer} = {}) {
  const config = productionConfig(env);
  // Import the source-built worker before creating/modifying the volume database.
  const worker = (await import(pathToFileURL(join(root, 'dist/server/index.js')).href)).default;
  const storage = openProductionDatabase({databasePath: config.databasePath, migrationsDirectory: join(root, 'drizzle')});
  const auth = productionAuth(storage.database, config.sessionSecret);
  const mailer = createInvitationMailer(env, invitationMailer);
  const workerEnv = {DB: storage.DB, SOCLE_ALLOW_BOOTSTRAP: '0', SOCLE_INVITATION_TEST_MODE: env.SOCLE_INVITATION_TEST_MODE === '1' ? '1' : '0', SOCLE_V3_MANUAL_INVITATIONS: env.SOCLE_V3_MANUAL_INVITATIONS === '1' ? '1' : '0', SOCLE_V3_MANUAL_ORGANIZATION_ID: env.SOCLE_V3_MANUAL_ORGANIZATION_ID || '', RAILWAY_PROJECT_ID: env.RAILWAY_PROJECT_ID || '', ...(mailer ? {sendInvitationEmail: mailer} : {})};
  const pending = new Set(); let stopping = false;

  async function dispatch(incoming) {
    if (stopping) return errorResponse(503, 'Service stopping');
    if (!incoming.url?.startsWith('/') || incoming.url.startsWith('//')) return errorResponse(400, 'Invalid path');
    const url = new URL(incoming.url, config.origin);
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return errorResponse(400, 'Invalid path'); }
    if (path.startsWith('/__local-test') || path.includes('\\')) return errorResponse(404, 'Not found');
    if (path === '/health') {
      if (!['GET', 'HEAD'].includes(incoming.method)) return errorResponse(405, 'Method not allowed');
      storage.database.prepare('SELECT 1').get();
      return response(incoming.method === 'HEAD' ? null : '{"status":"ok"}');
    }
    if (unsafeMethods.has(incoming.method) && !config.trustedOrigins.has(incoming.headers.origin)) return errorResponse(403, 'Origin refused');
    const identity = auth.session(incoming.headers.cookie);
    if (path === '/invite/activate') {
      if (incoming.method !== 'GET') return errorResponse(405, 'Method not allowed');
      return new Response(activationPage(Boolean(identity)), {status: 200, headers: {'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
    }
    if (path === '/invite-activation.js') {
      if (!['GET', 'HEAD'].includes(incoming.method)) return errorResponse(405, 'Method not allowed');
      return worker.fetch(new Request(url, {method: incoming.method}), workerEnv);
    }
    if (path === '/login') {
      if (incoming.method !== 'GET') return errorResponse(405, 'Method not allowed');
      return identity ? redirect('/') : response(loginPage, 200, {'content-type': 'text/html;charset=utf-8'});
    }
    if (path === '/auth/login') {
      if (incoming.method !== 'POST') return errorResponse(405, 'Method not allowed');
      const bytes = await bodyOf(incoming, 4096);
      const json = incoming.headers['content-type']?.split(';')[0] === 'application/json';
      let value;
      try { value = json ? JSON.parse(bytes.toString()) : Object.fromEntries(new URLSearchParams(bytes.toString())); }
      catch { return errorResponse(400, 'Invalid request'); }
      const result = await auth.login(value?.email, value?.password);
      if (result.status !== 200) return errorResponse(result.status, 'Connexion refusée. Vérifiez vos identifiants ou réessayez plus tard.');
      return json ? response('{"authenticated":true}', 200, {'set-cookie': result.cookie}) : redirect('/', {'set-cookie': result.cookie});
    }
    if (path === '/auth/activate') {
      if (incoming.method !== 'POST') return errorResponse(405, 'Method not allowed');
      const bytes = await bodyOf(incoming, 4096);
      let value;
      try { value = JSON.parse(bytes.toString()); } catch { return errorResponse(400, 'Invalid request'); }
      const token = typeof value?.token === 'string' ? value.token : '';
      if (identity) {
        const accepted = await acceptInvitationWithWorker(worker, workerEnv, config.origin, token, identity);
        return accepted.status === 200 ? response('{"activated":true}', 200) : errorResponse(accepted.status, accepted.body.error || 'Activation refusée.');
      }
      if (token.length < 20 || token.length > 200) return errorResponse(400, 'Invitation invalide.');
      const digest = createHash('sha256').update(token).digest('hex');
      const invitation = storage.database.prepare("SELECT i.email FROM organization_invitations i WHERE i.token_hash=? AND i.status='pending'").get(digest);
      if (!invitation) return errorResponse(404, 'Invitation introuvable ou déjà utilisée.');
      const email = String(invitation.email || '').trim().toLowerCase();
      const existing = storage.database.prepare('SELECT p.id,p.identity_kind,c.user_id FROM profiles p LEFT JOIN production_credentials c ON c.user_id=p.id WHERE lower(p.email)=? LIMIT 1').get(email);
      if (existing?.identity_kind === 'provenance') return errorResponse(403, 'Un profil de provenance ne peut pas devenir un compte.');
      if (existing?.user_id) {
        const login = await auth.login(email, value?.password);
        if (login.status !== 200) return errorResponse(login.status, 'Connexion refusée. Vérifiez votre mot de passe ou réessayez plus tard.');
        const accepted = await acceptInvitationWithWorker(worker, workerEnv, config.origin, token, login);
        if (accepted.status !== 200) { auth.logout(login.cookie); return errorResponse(accepted.status, accepted.body.error || 'Activation refusée.'); }
        return response('{"activated":true}', 200, {'set-cookie': login.cookie});
      }
      if (existing) return errorResponse(409, 'Un profil existe déjà pour cette adresse sans compte activable. Contactez le propriétaire de l’entreprise.');
      const activated = await auth.activateInvitation({token, password: value?.password, firstName: value?.firstName, lastName: value?.lastName});
      if (activated.status !== 200) return errorResponse(activated.status, activated.error || 'Activation refusée.');
      return response('{"activated":true}', 200, {'set-cookie': activated.cookie});
    }
    if (path === '/auth/logout') {
      if (incoming.method !== 'POST') return errorResponse(405, 'Method not allowed');
      return redirect('/login', {'set-cookie': auth.logout(incoming.headers.cookie)});
    }
    if (path.startsWith('/auth/')) return errorResponse(404, 'Not found');
    if (!identity) return path.startsWith('/api/') ? errorResponse(401, 'Authentication required') : redirect('/login');

    if (path === '/api/profile/avatar/meta') {
      if (incoming.method !== 'GET') return errorResponse(405, 'Method not allowed');
      const profile = storage.database.prepare('SELECT id,first_name,last_name,email,avatar_url FROM profiles WHERE id=?').get(identity.userId);
      if (!profile) return errorResponse(404, 'Profil introuvable.');
      const avatar = avatarDescriptor(profile.avatar_url);
      return response(JSON.stringify({
        hasAvatar: Boolean(avatar),
        avatarUrl: avatar ? '/api/profile/avatar?v=' + avatar.version : null,
        initials: avatarInitials(profile),
        displayName: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || ''
      }));
    }
    if (path === '/api/profile/avatar') {
      const targetId = String(url.searchParams.get('user') || identity.userId);
      if (incoming.method === 'GET' || incoming.method === 'HEAD') {
        if (!canReadAvatar(storage.database, identity.userId, targetId)) return errorResponse(404, 'Photo introuvable.');
        const profile = storage.database.prepare('SELECT avatar_url FROM profiles WHERE id=?').get(targetId);
        const avatar = avatarDescriptor(profile?.avatar_url);
        if (!avatar) return errorResponse(404, 'Photo introuvable.');
        let bytes;
        try { bytes = await readFile(avatarFile(config, targetId, avatar.ext)); }
        catch (error) { if (error?.code === 'ENOENT') return errorResponse(404, 'Photo introuvable.'); throw error; }
        return new Response(incoming.method === 'HEAD' ? null : bytes, {status: 200, headers: {
          'content-type': avatarMime(avatar.ext),
          'content-length': String(bytes.byteLength),
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'none'",
          'referrer-policy': 'no-referrer'
        }});
      }
      if (targetId !== String(identity.userId)) return errorResponse(403, 'Vous pouvez modifier uniquement votre photo.');
      if (incoming.method === 'PUT') {
        const declared = String(incoming.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!AVATAR_TYPES.has(declared)) return errorResponse(415, 'Format accepté : JPEG, PNG ou WEBP.');
        let bytes;
        try { bytes = await bodyOf(incoming, AVATAR_MAX_BYTES); }
        catch (error) { return errorResponse(error.status || 400, error.status === 413 ? 'Photo trop volumineuse.' : 'Photo illisible.'); }
        if (!bytes.length) return errorResponse(400, 'Photo vide.');
        const detected = detectAvatarMime(bytes);
        if (!detected || detected !== declared) return errorResponse(415, 'Le contenu du fichier ne correspond pas au format annoncé.');
        const ext = AVATAR_TYPES.get(detected);
        const checksum = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
        const directory = join(config.volume, 'avatars');
        await mkdir(directory, {recursive: true});
        const destination = avatarFile(config, identity.userId, ext);
        const temporary = destination + '.tmp-' + process.pid + '-' + Date.now();
        try {
          await writeFile(temporary, bytes, {flag: 'wx'});
          await rename(temporary, destination);
        } catch (error) {
          await unlink(temporary).catch(() => {});
          throw error;
        }
        for (const other of ['jpg', 'png', 'webp']) if (other !== ext) await unlink(avatarFile(config, identity.userId, other)).catch(() => {});
        const stamp = new Date().toISOString();
        const reference = 'avatar:' + ext + ':' + checksum;
        const changed = storage.database.prepare('UPDATE profiles SET avatar_url=?,updated_at=? WHERE id=?').run(reference, stamp, identity.userId);
        if (!Number(changed.changes)) {
          await unlink(destination).catch(() => {});
          return errorResponse(404, 'Profil introuvable.');
        }
        return response(JSON.stringify({saved: true, avatarUrl: '/api/profile/avatar?v=' + checksum}));
      }
      if (incoming.method === 'DELETE') {
        const profile = storage.database.prepare('SELECT avatar_url FROM profiles WHERE id=?').get(identity.userId);
        if (!profile) return errorResponse(404, 'Profil introuvable.');
        const avatar = avatarDescriptor(profile.avatar_url);
        storage.database.prepare('UPDATE profiles SET avatar_url=NULL,updated_at=? WHERE id=?').run(new Date().toISOString(), identity.userId);
        if (avatar) await unlink(avatarFile(config, identity.userId, avatar.ext)).catch(() => {});
        return response(JSON.stringify({removed: true}));
      }
      return errorResponse(405, 'Method not allowed');
    }

    if (path === '/production-runtime.js') {
      return ['GET', 'HEAD'].includes(incoming.method) ? response(runtimeScript, 200, {'content-type': 'application/javascript;charset=utf-8'}) : errorResponse(405, 'Method not allowed');
    }
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (value !== undefined && !name.startsWith('oai-') && !['host', 'connection', 'cookie', 'content-length', 'transfer-encoding', 'forwarded'].includes(name) && !name.startsWith('x-forwarded-')) headers.set(name, Array.isArray(value) ? value.join(',') : value);
    }
    headers.set('oai-authenticated-user-id', identity.userId);
    headers.set('oai-authenticated-user-email', identity.email);
    const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : await bodyOf(incoming);
    const workerMethod = incoming.method === 'HEAD' && !path.startsWith('/api/') && /\.(?:js|mjs|css)$/.test(path) ? 'GET' : incoming.method;
    let result = await worker.fetch(new Request(url, {method: workerMethod, headers, body}), workerEnv);
    if (incoming.method === 'GET' && result.headers.get('content-type')?.includes('text/html')) {
      const sourceHtml = await result.text();
      const hasProductionRuntime = /<script\b[^>]*\bsrc\s*=\s*["']\/?production-runtime\.js(?:\?[^"']*)?["']/i.test(sourceHtml);
      const html = hasProductionRuntime ? sourceHtml : sourceHtml.replace('<script ', '<script src="/production-runtime.js"></script><script ');
      result = new Response(html, {status: result.status, headers: result.headers});
      result.headers.delete('content-length');
      result.headers.delete('etag');
    }
    return result;
  }

  const server = http.createServer((incoming, outgoing) => {
    const task = (async () => {
      try {
        const result = await prepareAssetResponse(incoming, await dispatch(incoming));
        const headers = Object.fromEntries(result.headers);
        Object.assign(headers, {'cache-control': result.headers.get('etag') ? headers['cache-control'] : 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': headers['referrer-policy'] || 'same-origin', 'strict-transport-security': 'max-age=31536000', 'x-frame-options': 'DENY'});
        outgoing.writeHead(result.status, headers);
        if (incoming.method === 'HEAD' || !result.body) outgoing.end();
        else await pipeline(Readable.fromWeb(result.body), outgoing);
      } catch (error) {
        logger.error('Production request failed', {status: error.status || 500, name: error.name});
        if (!outgoing.headersSent) { outgoing.writeHead(error.status || 500, {'content-type': 'application/json', 'cache-control': 'no-store'}); outgoing.end('{"error":"Request failed"}'); }
        else outgoing.destroy();
      }
    })();
    pending.add(task); task.finally(() => pending.delete(task));
  });
  server.requestTimeout = 30_000; server.headersTimeout = 15_000;
  try {
    await new Promise((done, fail) => { server.once('error', fail); server.listen(config.port, '0.0.0.0', done); });
  } catch (error) { storage.close(); throw error; }
  let closePromise;
  function close() {
    return closePromise ||= (async () => {
      stopping = true;
      const timer = setTimeout(() => server.closeAllConnections(), 10_000); timer.unref();
      await new Promise(done => server.close(done));
      await Promise.allSettled([...pending]);
      clearTimeout(timer); storage.close();
    })();
  }
  logger.log(`SOCLE production listening on 0.0.0.0:${config.port}`);
  return {server, close};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startProduction().then(runtime => {
    for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => runtime.close().then(() => process.exit(0)));
  }).catch(error => { console.error('SOCLE production startup refused:', error.message); process.exitCode = 1; });
}
