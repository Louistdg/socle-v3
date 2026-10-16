import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {waitFor} from './helpers/browser-cdp.mjs';

const helper=new URL('./helpers/browser-cdp.mjs',import.meta.url).href;
for(const operation of [
  "await withTimeout(Promise.resolve(42),'successful-command',60000)",
  "try{await withTimeout(Promise.reject(Error('command failed')),'failed-command',60000)}catch(error){if(error.message!=='command failed')throw error}"
]){
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import {withTimeout} from ${JSON.stringify(helper)};${operation}`],{encoding:'utf8',timeout:3000,windowsHide:true});
  assert.equal(child.error,undefined,'Une commande terminée ne doit laisser aucun timer maintenant le processus en vie.');
  assert.equal(child.status,0,child.stderr);
}

let probes=0;
assert.equal(await waitFor(()=>{if(++probes===1)throw Error('Execution context was destroyed');return 'new document'},'reload',500),'new document');
assert.equal(probes,2,'Le polling reprend dans le contexte reconstruit après reload.');
let permanentProbes=0;
await assert.rejects(waitFor(()=>{permanentProbes++;throw Error('Forbidden')},'authorization',500),/Forbidden/);
assert.equal(permanentProbes,1,'Une erreur réelle ne doit pas être masquée par le polling.');
await assert.rejects(waitFor(()=>new Promise(()=>{}),'stalled-probe',20),/stalled-probe: timeout/);
console.log('browser-harness-timeouts-76: timers libérés après succès/échec, reload transitoire et polling borné vérifiés');
