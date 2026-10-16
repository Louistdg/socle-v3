import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations, seedBatiNova } from './multi-org-isolation-01.mjs';

const output = resolve(process.argv[2] || 'multi-org-isolation-01.sqlite');
mkdirSync(dirname(output), { recursive: true });
const database = new DatabaseSync(output);
applyMigrations(database);
seedBatiNova(database, { localIdentities: true });
const foreignKeys = database.prepare('PRAGMA foreign_key_check').all();
const integrity = database.prepare('PRAGMA integrity_check').get().integrity_check;
if (foreignKeys.length || integrity !== 'ok') throw Error(`Fixture SQLite invalide: FK=${foreignKeys.length}, integrity=${integrity}`);
database.close();
console.log(`Fixture multi-org créée: ${output}`);
