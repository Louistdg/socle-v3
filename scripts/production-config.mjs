import {statSync, realpathSync, existsSync} from 'node:fs';
import {isAbsolute, join, dirname, basename, relative, sep} from 'node:path';

export function productionConfig(env = process.env) {
  const fail = message => { throw new Error('Production configuration: ' + message); };
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 13)) fail('Node 22.13+ required.');
  if (env.LOCAL_TEST_MODE !== undefined) fail('LOCAL_TEST_MODE must be absent.');
  if (env.DATABASE_URL) fail('PostgreSQL DATABASE_URL is unsupported; configure the persistent SQLite volume.');
  for (const key of ['RAILWAY_REPLICA_COUNT', 'WEB_CONCURRENCY']) {
    if (env[key] && env[key] !== '1') fail('Exactly one process/replica is supported.');
  }
  const port = Number(env.PORT);
  if (!/^\d+$/.test(env.PORT || '') || !Number.isInteger(port) || port < 1 || port > 65535) fail('PORT (1-65535) required.');
  let publicUrl;
  try { publicUrl = new URL(env.SOCLE_PUBLIC_URL); } catch { fail('SOCLE_PUBLIC_URL required.'); }
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash) fail('SOCLE_PUBLIC_URL must be an HTTPS origin.');
  const trustedOrigins = new Set([publicUrl.origin]);
  for (const value of String(env.SOCLE_TRUSTED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean)) {
    let trusted;
    try { trusted = new URL(value); } catch { fail('SOCLE_TRUSTED_ORIGINS must contain HTTPS origins.'); }
    if (trusted.protocol !== 'https:' || trusted.username || trusted.password || trusted.pathname !== '/' || trusted.search || trusted.hash) fail('SOCLE_TRUSTED_ORIGINS must contain HTTPS origins.');
    trustedOrigins.add(trusted.origin);
  }
  const sessionSecret = env.SOCLE_SESSION_SECRET || '';
  if (!/^[A-Za-z0-9_-]{43,}$/.test(sessionSecret) || Buffer.from(sessionSecret, 'base64url').length < 32) fail('SOCLE_SESSION_SECRET requires at least 32 random bytes in base64url.');
  const volumePath = env.RAILWAY_VOLUME_MOUNT_PATH || env.SOCLE_DATA_DIR;
  if ((env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID) && !env.RAILWAY_VOLUME_MOUNT_PATH) fail('Railway requires an attached volume, not SOCLE_DATA_DIR on the container disk.');
  if (!volumePath || !isAbsolute(volumePath) || !statSync(volumePath, {throwIfNoEntry: false})?.isDirectory()) fail('An existing absolute persistent volume directory is required.');
  const volume = realpathSync(volumePath);
  const requested = env.SOCLE_DB_PATH || join(volume, 'socle.sqlite');
  if (!isAbsolute(requested)) fail('SOCLE_DB_PATH must be absolute.');
  const databasePath = existsSync(requested) ? realpathSync(requested) : join(realpathSync(dirname(requested)), basename(requested));
  const inside = relative(volume, databasePath);
  if (!inside || inside === '..' || inside.startsWith('..' + sep) || isAbsolute(inside)) fail('SOCLE_DB_PATH must stay inside the volume.');
  if (env.SOCLE_ALLOW_BOOTSTRAP && !['0', 'false'].includes(env.SOCLE_ALLOW_BOOTSTRAP)) fail('Automatic organization bootstrap is disabled in this runtime.');
  return {port, origin: publicUrl.origin, trustedOrigins, sessionSecret, databasePath, volume};
}
