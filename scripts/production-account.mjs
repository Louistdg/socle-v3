// Offline operator command: never creates a profile, organization, role or tenant.
import {productionConfig} from './production-config.mjs';
import {openProductionDatabase} from './production-db.mjs';
import {provisionCredential} from './production-auth.mjs';
import {fileURLToPath} from 'node:url';

try {
  const config = productionConfig(process.env);
  const userId = process.argv[2];
  if (!userId || process.argv.length !== 3 || process.stdin.isTTY) throw new Error('Usage: node scripts/production-account.mjs EXISTING_PROFILE_ID < password-file (stdin only).');
  let bytes = 0; const chunks = [];
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 1026) throw new Error('Password input too large.');
    chunks.push(chunk);
  }
  const password = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  const storage = openProductionDatabase({databasePath: config.databasePath, migrationsDirectory: fileURLToPath(new URL('../drizzle/', import.meta.url))});
  try { await provisionCredential(storage.database, {userId, password, secret: config.sessionSecret}); }
  finally { storage.close(); }
  console.log('Production credential provisioned; previous sessions revoked. No business data or role changed.');
} catch (error) { console.error('Provisioning refused:', error.message); process.exitCode = 1; }
