import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DEFAULT_BATINOVA_ORGANIZATION_ID,parseImportCliArgs} from '../scripts/import-batinova-tenant-only.mjs';

const provided=parseImportCliArgs([
  '--source','batinova.sqlite',
  '--target','production-copy.sqlite',
  '--organization-id','org-custom-batinova'
]);
assert.deepEqual(provided,{
  sourcePath:'batinova.sqlite',
  targetPath:'production-copy.sqlite',
  organizationId:'org-custom-batinova'
},'un identifiant tenant explicit est associé à la bonne option');

const defaulted=parseImportCliArgs(['--source','batinova.sqlite','--target','production-copy.sqlite']);
assert.equal(defaulted.organizationId,DEFAULT_BATINOVA_ORGANIZATION_ID,'l’absence de --organization-id utilise exactement le tenant BatiNova canonique');
assert.equal(defaulted.organizationId,'org-batinova-iae-2026-10-01');

const reordered=parseImportCliArgs([
  '--target','production-copy.sqlite',
  '--organization-id','org-reordered',
  '--source','batinova.sqlite'
]);
assert.deepEqual(reordered,{
  sourcePath:'batinova.sqlite',
  targetPath:'production-copy.sqlite',
  organizationId:'org-reordered'
},'l’ordre des options ne change pas leur association');

assert.throws(
  ()=>parseImportCliArgs(['--source','batinova.sqlite','--organization-id','--target','production-copy.sqlite']),
  /Valeur manquante ou invalide pour --organization-id/,
  'un flag suivant n’est jamais interprété comme la valeur du tenant'
);
assert.throws(
  ()=>parseImportCliArgs(['--source','batinova.sqlite','--target','production-copy.sqlite','--organization-id']),
  /Valeur manquante ou invalide pour --organization-id/,
  'une valeur absente à la fin de la ligne est rejetée explicitement'
);
assert.throws(
  ()=>parseImportCliArgs(['--source','batinova.sqlite','--target','production-copy.sqlite','--organization-id','../bad']),
  /identifiant tenant mal formé/,
  'un identifiant tenant mal formé est rejeté'
);
assert.throws(
  ()=>parseImportCliArgs(['--source','--target','production-copy.sqlite']),
  /Valeur manquante ou invalide pour --source/,
  'un flag ne peut pas être consommé comme chemin source'
);

const importerPath=fileURLToPath(new URL('../scripts/import-batinova-tenant-only.mjs',import.meta.url));
const cliMissing=spawnSync(process.execPath,[importerPath,'--source','batinova.sqlite','--organization-id','--target','production-copy.sqlite'],{encoding:'utf8'});
assert.notEqual(cliMissing.status,0,'le CLI quitte avec erreur pour une valeur manquante');
assert.match(cliMissing.stderr,/Valeur manquante ou invalide pour --organization-id/,'le CLI affiche une erreur explicite');
assert.doesNotMatch(cliMissing.stderr,/\n\s+at /,'le CLI n’expose pas une pile d’erreur confuse');

console.log('tenant-only-import-cli-args-36: PASS options fournies/absentes/réordonnées et valeurs manquantes/invalides rejetées.');
