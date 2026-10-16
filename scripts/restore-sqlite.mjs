import {backup,DatabaseSync} from 'node:sqlite';
import {copyFileSync,existsSync,mkdirSync,openSync,closeSync,rmSync,statSync} from 'node:fs';
import {basename,dirname,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';

const [sourceArg,destinationArg]=process.argv.slice(2);
if(!sourceArg||!destinationArg){
  console.error('RESTORE_SQLITE=FAIL');
  console.error('Usage: node --experimental-sqlite scripts/restore-sqlite.mjs <copie.sqlite> <nouvelle-base.sqlite>');
  process.exit(2);
}

const sourcePath=resolve(sourceArg),destinationPath=resolve(destinationArg);
const sidecars=['-wal','-shm','-journal'];
const temporaryPath=resolve(dirname(destinationPath),'.'+basename(destinationPath)+'.restore-'+randomUUID()+'.partial');
let destinationCreated=false;

function quoteIdentifier(value){return '"'+String(value).replaceAll('"','""')+'"'}

function inspectDatabase(path,label){
  let database;
  try{database=new DatabaseSync(path,{readOnly:true})}
  catch(error){throw Error(label+' illisible : '+error.message,{cause:error})}
  try{
    const integrity=database.prepare('PRAGMA integrity_check').all().map(row=>row.integrity_check);
    if(integrity.length!==1||integrity[0]!=='ok')throw Error(label+' : PRAGMA integrity_check = '+JSON.stringify(integrity));
    const tables=database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>row.name);
    const required=['local_migrations','organization_workspace_state','organizations'];
    const missing=required.filter(name=>!tables.includes(name));
    if(missing.length)throw Error(label+' incomplet : tables métier manquantes '+missing.join(', '));
    const counts={};
    for(const table of tables){
      const statement=database.prepare('SELECT COUNT(*) AS count FROM '+quoteIdentifier(table));
      statement.setReadBigInts(true);
      const result=statement.get();
      counts[table]=String(result.count);
    }
    if(counts.organizations==='0'||counts.organization_workspace_state==='0')throw Error(label+' incomplet : aucune organisation ou donnée espace de travail.');
    const organization=database.prepare('SELECT id,name FROM organizations ORDER BY id LIMIT 1').get();
    if(!organization)throw Error(label+' : lecture métier impossible dans organizations.');
    return {database,tables,counts,integrity:integrity[0],organization:{id:organization.id,name:organization.name}};
  }catch(error){database.close();throw error}
}

function closeSnapshot(snapshot){snapshot?.database.close()}
function removeOwnedFile(path){
  if(existsSync(path))rmSync(path,{force:true});
  for(const suffix of sidecars)if(existsSync(path+suffix))rmSync(path+suffix,{force:true});
}

async function restore(){
  if(sourcePath===destinationPath)throw Error('La source et la destination doivent être deux fichiers différents.');
  if(!existsSync(sourcePath)||!statSync(sourcePath).isFile())throw Error('Copie SQLite introuvable : '+sourcePath);
  if(existsSync(destinationPath)||sidecars.some(suffix=>existsSync(destinationPath+suffix)))throw Error('La destination existe déjà. Choisis un nouveau chemin ; aucune donnée n’a été remplacée.');
  mkdirSync(dirname(destinationPath),{recursive:true});
  const source=inspectDatabase(sourcePath,'Copie source');
  try{
    await backup(source.database,temporaryPath);
  }finally{closeSnapshot(source)}

  const restored=inspectDatabase(temporaryPath,'Base restaurée');
  try{
    if(JSON.stringify(restored.tables)!==JSON.stringify(source.tables))throw Error('La restauration ne contient pas les mêmes tables que la copie source.');
    if(JSON.stringify(restored.counts)!==JSON.stringify(source.counts))throw Error('La restauration ne contient pas les mêmes nombres de lignes que la copie source.');
    if(JSON.stringify(restored.organization)!==JSON.stringify(source.organization))throw Error('La lecture métier organizations diffère de la copie source.');
  }finally{closeSnapshot(restored)}

  const reservation=openSync(destinationPath,'wx');
  destinationCreated=true;
  closeSync(reservation);
  copyFileSync(temporaryPath,destinationPath);
  const installed=inspectDatabase(destinationPath,'Fichier installé');
  try{
    if(JSON.stringify(installed.tables)!==JSON.stringify(source.tables)||JSON.stringify(installed.counts)!==JSON.stringify(source.counts)||JSON.stringify(installed.organization)!==JSON.stringify(source.organization))throw Error('Le fichier installé ne correspond pas à la copie source.');
  }finally{closeSnapshot(installed)}

  removeOwnedFile(temporaryPath);
  destinationCreated=false;
  const totalRows=Object.values(source.counts).reduce((sum,count)=>sum+BigInt(count),0n).toString();
  console.log('RESTORE_SQLITE=PASS');
  console.log('SOURCE_TABLES='+source.tables.length+' RESTORED_TABLES='+installed.tables.length);
  console.log('TABLE_ROW_COUNTS='+JSON.stringify(source.counts));
  console.log('SOURCE_ROWS='+totalRows+' RESTORED_ROWS='+totalRows);
  console.log('INTEGRITY_SOURCE=ok INTEGRITY_RESTORED=ok');
  console.log('READ_ORGANIZATION='+JSON.stringify(source.organization));
  console.log('DESTINATION='+destinationPath);
}

try{await restore()}
catch(error){
  removeOwnedFile(temporaryPath);
  if(destinationCreated)removeOwnedFile(destinationPath);
  console.error('RESTORE_SQLITE=FAIL');
  console.error('CAUSE='+error.message);
  process.exitCode=1;
}
