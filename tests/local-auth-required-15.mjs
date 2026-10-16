import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {cpSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),port=4319,dataPath=resolve(root,'data'),backupRoot=mkdtempSync(join(tmpdir(),'socle-local-auth-')),backupData=join(backupRoot,'data'),hadData=existsSync(dataPath);
for(const variable of ['NODE_ENV','RUNTIME_ENV','SOCLE_RUNTIME_ENV']){const blocked=spawnSync(process.execPath,['scripts/local.mjs',`--port=${port}`],{cwd:root,encoding:'utf8',env:{...process.env,[variable]:'production'}});assert.notEqual(blocked.status,0,`Le serveur local refuse ${variable}=production`);assert.match(blocked.stderr,/interdits en production/)}
if(hadData)cpSync(dataPath,backupData,{recursive:true});rmSync(dataPath,{recursive:true,force:true});
const child=spawn(process.execPath,['scripts/local.mjs',`--port=${port}`],{cwd:root,stdio:['ignore','pipe','pipe']});
let output='',errors='';child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>errors+=chunk);
try{
  const deadline=Date.now()+60000;while(!output.includes('Socle est prêt')){if(child.exitCode!==null)throw Error(`Serveur local arrêté (${child.exitCode})\n${output}\n${errors}`);if(Date.now()>deadline)throw Error(`Démarrage local trop long\n${output}\n${errors}`);await new Promise(resolve=>setTimeout(resolve,80));}
  const page=await fetch(`http://127.0.0.1:${port}/`);assert.equal(page.status,200,'Les fichiers statiques restent accessibles avant connexion');
  const api=await fetch(`http://127.0.0.1:${port}/api/state`);assert.equal(api.status,401,'Sans cookie de session, /api/state doit répondre 401 et jamais injecter local-owner');const body=await api.json();assert.match(body.error,/Connexion requise/);
  const forged=await fetch(`http://127.0.0.1:${port}/api/state`,{headers:{'oai-authenticated-user-id':'local-owner','oai-authenticated-user-email':'direction@batinova.example'}});assert.equal(forged.status,401,'Un navigateur ne peut pas réinjecter local-owner ou son e-mail via des en-têtes forgés');
  const bootstrap=await fetch(`http://127.0.0.1:${port}/api/bootstrap`);assert.equal(bootstrap.status,401,'Toutes les routes API protégées exigent une session locale');
  const identities=await fetch(`http://127.0.0.1:${port}/__local-test/identities`);assert.equal(identities.status,200,'La route de choix de session reste disponible avant connexion');assert.ok(Array.isArray((await identities.json()).identities),'La route d’identités expose une liste structurée même avec une base locale vierge');
  const invalidLogin=await fetch(`http://127.0.0.1:${port}/__local-test/login`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'unknown@example.test'})});assert.equal(invalidLogin.status,403,'Une identité inconnue ne peut pas ouvrir de session locale');assert.equal(invalidLogin.headers.get('set-cookie'),null,'Un login refusé ne crée pas de cookie de session');
  console.log('local-auth-required-15: production guard, forged identity headers et login invalide vérifiés');
}finally{
  child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)return resolve();child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve()},1500)});rmSync(dataPath,{recursive:true,force:true});if(hadData)cpSync(backupData,dataPath,{recursive:true});rmSync(backupRoot,{recursive:true,force:true});
}
