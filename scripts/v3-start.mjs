// Explicit one-time provisioning for the isolated V3 project only; no HTTP bootstrap.
import {randomUUID} from 'node:crypto';
import {mkdirSync, existsSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openProductionDatabase} from './production-db.mjs';
import {provisionCredential} from './production-auth.mjs';
import {productionConfig} from './production-config.mjs';
import {startProduction} from './production.mjs';

const config=productionConfig(process.env);
if(process.env.SOCLE_V3_PROVISION_OWNER==='1'){
 if(process.env.RAILWAY_PROJECT_ID!=='7a1eaac4-1d0d-469d-bab2-94dc4493c5e8')throw Error('V3 provisioning refused outside the explicitly authorized project.');
 const marker=join(config.volume,'v3-provisioned');
 if(!existsSync(marker)){
  const email=process.env.SOCLE_V3_OWNER_EMAIL,password=process.env.SOCLE_V3_OWNER_PASSWORD;
  if(!email||!password||password.length<15)throw Error('Explicit V3 owner credentials required.');
  const storage=openProductionDatabase({databasePath:config.databasePath,migrationsDirectory:fileURLToPath(new URL('../drizzle/',import.meta.url))});
  try{
   const db=storage.database;
   if(db.prepare('SELECT COUNT(*) count FROM profiles').get().count!==0||db.prepare('SELECT COUNT(*) count FROM organizations').get().count!==0)throw Error('V3 owner provisioning requires an empty database.');
   const stamp=new Date().toISOString(),org=randomUUID(),owner=randomUUID();
   db.exec('BEGIN IMMEDIATE');
   try{
    db.prepare('INSERT INTO organizations(id,name,created_at,updated_at) VALUES(?,?,?,?)').run(org,'SOCLE V3 · Atelier de recherche',stamp,stamp);
    for(const code of ['OWNER','TEAM_LEAD','WORKER','ACCOUNTING'])db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(code+'-'+org,org,code,code,stamp);
    db.prepare('INSERT INTO profiles(id,email,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(owner,email,'Louis','Masson',stamp,stamp);
    db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(),org,owner,'OWNER-'+org,'active',stamp,stamp,stamp);
    db.exec('COMMIT');
   }catch(error){db.exec('ROLLBACK');throw error;}
   await provisionCredential(db,{userId:owner,password,secret:config.sessionSecret});
   writeFileSync(marker,JSON.stringify({organizationId:org,userId:owner,provisionedAt:stamp}),{mode:0o600});
   console.log('SOCLE V3: explicit owner provisioned in the separate database.');
  }finally{storage.close();}
 }
}
const runtime=await startProduction();
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>runtime.close().then(()=>process.exit(0)));
