import {DatabaseSync} from 'node:sqlite';
import {chmodSync,mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';

function assertIntegrity(database){
  if(Number(database.prepare('PRAGMA foreign_keys').get().foreign_keys)!==1){
    throw Error('SOCLE production: les contraintes de clés étrangères sont désactivées.');
  }
  if(database.prepare('PRAGMA foreign_key_check').all().length){
    throw Error('SOCLE production: violation de clé étrangère dans la base.');
  }
  const integrity=database.prepare('PRAGMA integrity_check').all();
  if(integrity.length!==1||integrity[0].integrity_check!=='ok'){
    throw Error('SOCLE production: intégrité SQLite invalide.');
  }
}

function transaction(database,operation){
  // Aucun await entre BEGIN et COMMIT : aucune autre requête ne peut intercaler
  // ses écritures dans ce batch sur la connexion partagée.
  database.exec('BEGIN IMMEDIATE');
  try{
    const result=operation();
    database.exec('COMMIT');
    return result;
  }catch(error){
    try{database.exec('ROLLBACK');}
    catch(rollbackError){
      throw new AggregateError([error,rollbackError],'SOCLE production: échec de transaction et du rollback.',{cause:error});
    }
    throw error;
  }
}

function copyBinding(value){
  if(value instanceof ArrayBuffer)return new Uint8Array(value.slice(0));
  if(ArrayBuffer.isView(value)){
    return new Uint8Array(value.buffer,value.byteOffset,value.byteLength).slice();
  }
  return value;
}

function createAdapter(database){
  const statements=new WeakMap();
  const statistics=database.prepare('SELECT total_changes() total_changes,changes() changes,last_insert_rowid() last_row_id');
  statistics.setReadBigInts(true);

  function execute({sql,values}){
    const before=statistics.get();
    const results=database.prepare(sql).all(...values);
    const after=statistics.get();
    return {
      success:true,
      results,
      // changes() garde la valeur précédente après un SELECT. total_changes()
      // distingue une lecture et préserve le nombre de lignes du DML principal,
      // sans additionner les écritures de ses triggers.
      meta:{
        changes:after.total_changes===before.total_changes?0:Number(after.changes),
        last_row_id:Number(after.last_row_id)
      }
    };
  }

  function prepare(sql,values=[]){
    if(typeof sql!=='string'||!sql.trim())throw TypeError('Requête SQL obligatoire.');
    const command=sql.replace(/^(?:\s|;|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*/,'').match(/^[A-Za-z]+/)?.[0].toUpperCase();
    if(['BEGIN','COMMIT','END','ROLLBACK','SAVEPOINT','RELEASE'].includes(command)){
      throw Error('SOCLE production: les transactions SQL sont gérées par DB.batch.');
    }
    const data={sql,values:Object.freeze(values.map(copyBinding))};
    const statement=Object.freeze({
      bind(...bindings){return prepare(sql,bindings);},
      async first(column){
        if(column!==undefined&&typeof column!=='string')throw TypeError('Nom de colonne invalide.');
        const row=execute(data).results[0]??null;
        if(column===undefined||row===null)return row;
        if(!Object.hasOwn(row,column))throw Error('Colonne SQL introuvable : '+column);
        return row[column];
      },
      async all(){return execute(data);},
      async run(){return execute(data);}
    });
    statements.set(statement,data);
    return statement;
  }

  return Object.freeze({
    prepare,
    async batch(batch){
      if(!Array.isArray(batch))throw TypeError('Liste de requêtes obligatoire.');
      const entries=batch.map(statement=>{
        const data=statements.get(statement);
        if(!data)throw TypeError('Requête étrangère à cette connexion SQLite.');
        return data;
      });
      if(!entries.length)return [];
      return transaction(database,()=>entries.map(execute));
    }
  });
}

export function openProductionDatabase({databasePath,migrationsDirectory}={}){
  if(typeof databasePath!=='string'||!databasePath.trim())throw TypeError('Chemin SQLite de production obligatoire.');
  if(typeof migrationsDirectory!=='string'||!migrationsDirectory.trim())throw TypeError('Répertoire des migrations obligatoire.');
  const migrationsPath=resolve(migrationsDirectory);
  const migrations=readdirSync(migrationsPath,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&/^\d+.*\.sql$/.test(entry.name))
    .map(entry=>entry.name).sort();
  if(!migrations.length)throw Error('SOCLE production: aucune migration SQL trouvée.');

  // Le runtime vérifie le volume persistant ; :memory: reste disponible pour
  // les tests hermétiques de cet adapter, sans ouvrir de base BatiNova.
  const inMemory=databasePath===':memory:';
  const path=inMemory?databasePath:resolve(databasePath);
  if(!inMemory)mkdirSync(dirname(path),{recursive:true,mode:0o700});
  const database=new DatabaseSync(path);
  try{
    if(!inMemory)chmodSync(path,0o600);
    database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    const journal=database.prepare('PRAGMA journal_mode=WAL').get().journal_mode;
    if(!inMemory&&journal!=='wal')throw Error('SOCLE production: mode WAL SQLite indisponible.');
    assertIntegrity(database);
    // Ce registre est partagé avec les bases déjà migrées. Aucun seed local,
    // script de simulation ou changement d'une migration historique ici.
    database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
    for(const name of migrations){
      if(database.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
      try{
        transaction(database,()=>{
          database.exec(readFileSync(join(migrationsPath,name),'utf8'));
          database.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
          assertIntegrity(database);
        });
      }catch(error){
        throw new Error('SOCLE production: échec de la migration '+name,{cause:error});
      }
    }
    assertIntegrity(database);
    const DB=createAdapter(database);
    let closed=false;
    return {
      database,
      DB,
      close(){
        if(closed)return;
        database.close();
        closed=true;
      }
    };
  }catch(error){
    database.close();
    throw error;
  }
}
