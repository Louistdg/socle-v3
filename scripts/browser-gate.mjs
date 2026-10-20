import {spawn,spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync,writeFileSync} from 'node:fs';
import {copyFile,mkdir,readFile,realpath,rm,stat} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const candidatePath=join(root,'data','socle.sqlite');
const artifactsPath=join(root,'tests','artifacts','browser-gate');
const browserSuites=[
  {name:'browser-theme-restore-01.mjs'},
  {name:'browser-team-composer.mjs'},
  {name:'browser-access-preview-theme-contrast-01.mjs'},
  {name:'browser-ui-frame-audit-01.mjs'},
  {name:'browser-v3-theme-visual-01.mjs'},
  {name:'browser-ui-foundation-01.mjs'},
  {name:'browser-design-catalogue-01.mjs'},
  {name:'browser-regression-116.mjs'},
  {name:'browser-mobile-navigation-129.mjs'},
  {name:'browser-navigation-convergence-01.mjs'},
  {name:'browser-mobile-density-162.mjs'},
  {name:'browser-stock-catalog-v2-01.mjs'},
  {name:'browser-stock-barcode-01.mjs'},
  {name:'browser-e2e-02-quote-preproject.mjs'},
  {name:'browser-bl-scan-01ab.mjs'},
  {name:'browser-home-person-scope-01.mjs'},
  {name:'browser-multi-org-isolation-01.mjs',runner:'multi-org'},
  {name:'browser-identities-15.mjs'},
  {name:'browser-15.mjs',capture:'purchases'},
  {name:'browser-document-triage-20261012.mjs'},
  {name:'browser-field-journal-01.mjs'},
  {name:'browser-search-01.mjs'},
  {name:'browser-didactic-layer-01.mjs'},
  {name:'browser-attention-01.mjs'},
  {name:'browser-task-folders-01.mjs'},
  {name:'browser-task-spatial-desk-01.mjs'},
  {name:'browser-document-folders-01.mjs'},
  {name:'browser-job-canvas-01.mjs'},
  {name:'browser-offline-01.mjs'},
  {name:'browser-job-tabs-01.mjs'},
  {name:'browser-jobs-order-01.mjs'},
  {name:'browser-planning-board-01.mjs'},
  {name:'browser-planning-drag-step2.mjs'}
];
const interruption=new AbortController();
const interrupt=signal=>interruption.abort(new Error('Browser Gate interrompu : '+signal));
const onSigint=()=>interrupt('SIGINT'),onSigterm=()=>interrupt('SIGTERM');

function options(){
  const values={runs:'3',port:'4386','cdp-port':'9222',chrome:process.env.SOCLE_CHROME||'',only:''};
  for(const argument of process.argv.slice(2)){
    if(argument==='--help'){
      console.log('Usage: node scripts/browser-gate.mjs [--runs=3] [--port=4386] [--cdp-port=9222] [--chrome=executable] [--only=browser-suite-name.mjs] [--list]');
      return null;
    }
    if(argument==='--list'){
      for(const suite of browserSuites)console.log(suite.name);
      return null;
    }
    const match=/^--(runs|port|cdp-port|chrome|only)=(.+)$/.exec(argument);
    if(!match)throw new Error('Option Browser Gate inconnue ou vide : '+argument);
    values[match[1]]=match[2];
  }
  if(values.only&&!browserSuites.some(suite=>suite.name===values.only))throw new Error('Test Browser Gate inconnu : --only='+values.only+' (nom attendu parmi les suites Browser Gate)');
  for(const name of ['runs','port','cdp-port']){
    if(!/^\d+$/.test(values[name]))throw new Error('Option entière invalide : --'+name);
    values[name]=Number(values[name]);
    const maximum=name==='runs'?Number.MAX_SAFE_INTEGER:65535;
    if(!Number.isSafeInteger(values[name])||values[name]<1||values[name]>maximum)throw new Error('Option hors limites : --'+name);
  }
  if(values.port===values['cdp-port'])throw new Error('Les ports SOCLE et CDP doivent être distincts.');
  return values;
}

function executablePath(name){
  if(existsSync(name))return resolve(name);
  const result=spawnSync(process.platform==='win32'?'where.exe':'which',[name],{encoding:'utf8',windowsHide:true,timeout:5000});
  if(result.status!==0)return null;
  return String(result.stdout||'').trim().split(/\r?\n/).find(path=>existsSync(path))||null;
}

function chromePath(requested){
  if(requested){
    const found=executablePath(requested);
    if(!found)throw new Error('Exécutable Chrome/Chromium introuvable : '+requested);
    return found;
  }
  const choices=process.platform==='win32'?[
    join(process.env.ProgramFiles||'C:\\Program Files','Google','Chrome','Application','chrome.exe'),
    join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Google','Chrome','Application','chrome.exe'),
    ...(process.env.LOCALAPPDATA?[join(process.env.LOCALAPPDATA,'Google','Chrome','Application','chrome.exe')]:[]),
    join(process.env['ProgramFiles(x86)']||'C:\\Program Files (x86)','Microsoft','Edge','Application','msedge.exe'),
    join(process.env.ProgramFiles||'C:\\Program Files','Microsoft','Edge','Application','msedge.exe')
  ]:['google-chrome','chromium','chromium-browser'];
  for(const choice of choices){const found=executablePath(choice);if(found)return found;}
  throw new Error('Chrome/Chromium indisponible. Fournissez --chrome=executable ou SOCLE_CHROME.');
}

function checkInterrupted(){if(interruption.signal.aborted)throw interruption.signal.reason;}

async function candidateSnapshot(){
  const suffixes=['-wal','-shm','-journal'];
  const sidecars=new Set(suffixes.filter(suffix=>existsSync(candidatePath+suffix)));
  const info=await stat(candidatePath);
  if(!info.isFile()||info.size===0)throw new Error('Candidate SQLite absente ou vide : '+candidatePath);
  const hash=createHash('sha256').update(await readFile(candidatePath)).digest('hex');
  for(const suffix of suffixes)if(existsSync(candidatePath+suffix))sidecars.add(suffix);
  if(sidecars.size)throw new Error('La candidate doit être inactive et sans fichier SQLite annexe (SHA256='+hash+') : '+[...sidecars].map(suffix=>candidatePath+suffix).join(', '));
  return hash;
}

function deadline(promise,milliseconds,label,signal){
  return new Promise((resolvePromise,reject)=>{
    let timer;
    const finish=(callback,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',aborted);callback(value);};
    const aborted=()=>finish(reject,signal.reason||new Error(label+' interrompu'));
    timer=setTimeout(()=>finish(reject,new Error(label+' timeout après '+milliseconds+'ms')),milliseconds);
    signal?.addEventListener('abort',aborted,{once:true});
    if(signal?.aborted){aborted();return;}
    Promise.resolve(promise).then(value=>finish(resolvePromise,value),error=>finish(reject,error));
  });
}

function startLogged(executable,args,logPath,{echo=false,env=process.env}={}){
  writeFileSync(logPath,'');
  const child=spawn(executable,args,{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const userDataArg=args.find(argument=>argument.startsWith('--user-data-dir='));
  const record={child,closed:false,spawnError:null,logError:null,logPath,done:null,profileDirectory:userDataArg?.slice('--user-data-dir='.length)||null};
  const log=(chunk,stream)=>{
    try{appendFileSync(logPath,chunk);}catch(error){record.logError||=error;}
    if(echo)stream.write(chunk);
  };
  child.stdout.on('data',chunk=>log(chunk,process.stdout));
  child.stderr.on('data',chunk=>log(chunk,process.stderr));
  child.once('error',error=>{record.spawnError=error;log(Buffer.from(error.message+'\n'),process.stderr);});
  record.done=new Promise(resolvePromise=>child.once('close',(code,signal)=>{
    record.closed=true;
    resolvePromise({code,signal,error:record.spawnError||record.logError});
  }));
  return record;
}

async function waitForPortFree(port){
  const probe=createServer();
  await new Promise((resolvePromise,reject)=>{
    probe.once('error',error=>reject(new Error('Port déjà utilisé ou indisponible '+port+' : '+error.message)));
    probe.listen(port,'127.0.0.1',()=>probe.close(error=>error?reject(error):resolvePromise()));
  });
}

async function waitForHttp(url,record,label,timeoutMs,{cdp=false}={}){
  const end=Date.now()+timeoutMs;
  let lastError='aucune réponse';
  while(Date.now()<end){
    checkInterrupted();
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(Math.min(2000,Math.max(1,end-Date.now())))});
      if(response.ok){
        if(cdp){const body=await response.json();if(typeof body.webSocketDebuggerUrl==='string')return;lastError='réponse CDP sans WebSocket';}
        else{await response.body?.cancel();return;}
      }else{lastError='HTTP '+response.status;await response.body?.cancel();}
    }catch(error){lastError=error.message;}
    // On Windows, chrome.exe may exit after starting its detached browser process.
    // A live CDP endpoint is authoritative; only treat the launcher as stopped after a failed probe.
    if(record.spawnError||((record.closed||record.child.exitCode!==null)&&!record.profileDirectory))throw new Error(label+' arrêté avant disponibilité ('+lastError+') ; voir '+record.logPath);
    if(Date.now()<end)await new Promise(resolvePromise=>setTimeout(resolvePromise,Math.min(100,end-Date.now())));
  }
  throw new Error(label+' indisponible après '+timeoutMs+'ms ('+lastError+(record.closed?' ; le processus de lancement Windows s’est détaché':'')+') ; voir '+record.logPath);
}

async function stop(record){
  if(!record)return;
  if(process.platform==='win32'&&record.profileDirectory){
    const profileLiteral="'"+record.profileDirectory.replaceAll("'","''")+"'";
    const script=`$profileArg=${profileLiteral}; $until=[DateTime]::UtcNow.AddSeconds(6); do { $targets=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -and $_.CommandLine.IndexOf($profileArg,[System.StringComparison]::OrdinalIgnoreCase) -ge 0 }); foreach($target in $targets){ Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue }; if($targets.Count -eq 0){ break }; Start-Sleep -Milliseconds 150 } while([DateTime]::UtcNow -lt $until); $left=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine -and $_.CommandLine.IndexOf($profileArg,[System.StringComparison]::OrdinalIgnoreCase) -ge 0 }); if($left.Count -gt 0){ exit 1 }`;
    const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{encoding:'utf8',windowsHide:true,timeout:12000});
    if(result.error||result.status!==0)throw new Error('Nettoyage du profil Chrome isolé incomplet : '+(result.error?.message||String(result.stderr||'processus encore actif')));
  }
  if(record.closed)return;
  const pid=record.child.pid;
  if(process.platform==='win32'&&Number.isInteger(pid)&&pid>0){
    const killer=spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    const killed=new Promise(resolvePromise=>{killer.once('error',()=>resolvePromise());killer.once('close',()=>resolvePromise());});
    try{await deadline(killed,5000,'taskkill du processus propre '+pid);}catch{try{killer.kill();}catch{}}
  }else{record.child.kill('SIGTERM');}
  try{await deadline(record.done,5000,'Arrêt du processus propre '+pid);return;}catch{}
  if(!record.closed)record.child.kill('SIGKILL');
  await deadline(record.done,5000,'Arrêt forcé du processus propre '+pid);
}

async function runTest(name,index,env,children){
  checkInterrupted();
  const logPath=join(artifactsPath,name.replace('.mjs','')+'-'+index+'.log');
  console.log('Browser Gate : '+name+' (passage '+index+')');
  const record=startLogged(process.execPath,[join(root,'tests',name)],logPath,{echo:true,env});
  children.push(record);
  let result;
  try{result=await deadline(record.done,180000,name,interruption.signal);}
  catch(error){appendFileSync(logPath,'\nBROWSER_GATE_PROCESS_FAILURE: '+error.message+'\n');throw error;}
  if(result.error)throw result.error;
  if(result.code!==0)throw new Error(name+' en échec (code '+result.code+', signal '+(result.signal||'aucun')+') ; voir '+logPath);
}

async function runMultiOrgBrowserTest(suiteName,index,env,children,runDirectory){
  const probe=createServer();
  const port=await new Promise((resolvePromise,reject)=>{
    probe.once('error',reject);
    probe.listen(0,'127.0.0.1',()=>{const selected=probe.address().port;probe.close(error=>error?reject(error):resolvePromise(selected))});
  });
  const databasePath=join(runDirectory,'multi-org.sqlite');
  const fixtureLog=join(artifactsPath,'multi-org-fixture-'+index+'.log');
  let fixture;
  for(let attempt=1;attempt<=2;attempt++){
    fixture=spawnSync(process.execPath,[join(root,'tests','fixtures','create-multi-org-isolation-db.mjs'),databasePath],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:8*1024*1024});
    writeFileSync(fixtureLog,String(fixture.stdout||'')+String(fixture.stderr||''));
    if(!fixture.error&&fixture.status===0)break;
    if(attempt<2)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(fixture.error||fixture.status!==0)throw new Error('Fixture navigateur multi-organisation en échec ; voir '+fixtureLog+' ; signal='+(fixture.signal||'aucun')+' ; erreur='+(fixture.error?fixture.error.message:'aucune'));
  const isolatedBase='http://127.0.0.1:'+port;
  const server=startLogged(process.execPath,[join(root,'scripts','local.mjs'),'--port='+port,'--db-path='+databasePath],join(artifactsPath,'multi-org-serveur-'+index+'.log'));
  children.push(server);
  try{
    await waitForHttp(isolatedBase+'/',server,'SOCLE local multi-organisation',60000);
    await runTest(suiteName,index,{...env,SOCLE_TEST_URL:isolatedBase},children);
  }finally{
    await stop(server);
  }
}

async function removeRunDirectory(runDirectory,parentPath=artifactsPath){
  if(!existsSync(runDirectory))return;
  const parent=await realpath(parentPath),target=await realpath(runDirectory),within=relative(parent,target);
  if(!within||within.startsWith('..')||isAbsolute(within)||!/^run-[0-9a-f-]+$/i.test(within))throw new Error('Nettoyage refusé hors du répertoire jetable Browser Gate : '+target);
  await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:200});
}

async function run(index,configuration,chrome,originalHash){
  const runDirectory=join(artifactsPath,'run-'+randomUUID());
  // Chrome's Windows cache paths exceed MAX_PATH in deeply nested worktrees.
  const profileParent=process.platform==='win32'?join(tmpdir(),'socle-browser-gate'):artifactsPath;
  const profileDirectory=join(profileParent,'run-'+randomUUID());
  const children=[],errors=[];
  const baseUrl='http://127.0.0.1:'+configuration.port;
  const cdpUrl='http://127.0.0.1:'+configuration['cdp-port'];
  const env={...process.env,SOCLE_TEST_URL:baseUrl,SOCLE_CDP_URL:cdpUrl};
  let testSucceeded=false;
  try{
    checkInterrupted();
    const before=await candidateSnapshot();
    if(before!==originalHash)throw new Error('La candidate a changé avant le passage '+index+'.');
    console.log('Browser Gate : passage '+index+', candidate SHA256='+before);
    await waitForPortFree(configuration.port);
    await waitForPortFree(configuration['cdp-port']);
    await mkdir(runDirectory,{recursive:false});
    await mkdir(profileParent,{recursive:true});
    await mkdir(profileDirectory,{recursive:false});
    const copyPath=join(runDirectory,'socle.sqlite');
    await copyFile(candidatePath,copyPath);
    const copyHash=createHash('sha256').update(await readFile(copyPath)).digest('hex');
    if(copyHash!==originalHash)throw new Error('La copie jetable diffère de la candidate avant le passage '+index+'.');
    const server=startLogged(process.execPath,[join(root,'scripts','local.mjs'),'--port='+configuration.port,'--db-path='+copyPath],join(artifactsPath,'serveur-'+index+'.log'));
    children.push(server);
    await waitForHttp(baseUrl+'/',server,'SOCLE local',60000);
    checkInterrupted();
    const browser=startLogged(chrome,[
      '--headless=new','--no-sandbox','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check',
      '--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2',
      '--disable-background-networking','--disable-component-update','--disable-default-apps','--disable-extensions','--disable-sync',
      '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      '--remote-debugging-address=127.0.0.1','--remote-debugging-port='+configuration['cdp-port'],
      '--user-data-dir='+profileDirectory,baseUrl+'/'
    ],join(artifactsPath,'chrome-'+index+'.log'));
    children.push(browser);
    await waitForHttp(cdpUrl+'/json/version',browser,'Chromium CDP',30000,{cdp:true});
    const runSuite=async suite=>{
      if(suite.runner==='multi-org')await runMultiOrgBrowserTest(suite.name,index,env,children,runDirectory);
      else await runTest(suite.name,index,env,children);
    };
    if(configuration.only){
      const suite=browserSuites.find(candidate=>candidate.name===configuration.only);
      const suiteStarted=Date.now();
      await runSuite(suite);
      if(suite.capture){
        const screenshot=join(root,'tests','artifacts','batinova-15-purchases.png');
        if(existsSync(screenshot)&&(await stat(screenshot)).mtimeMs>=suiteStarted-1000)await copyFile(screenshot,join(artifactsPath,'purchases-'+index+'.png'));
      }
      testSucceeded=true;
      return;
    }
    for(const suite of browserSuites){
      const suiteStarted=Date.now();
      await runSuite(suite);
      if(suite.capture){
        const screenshot=join(root,'tests','artifacts','batinova-15-purchases.png');
        if(existsSync(screenshot)&&(await stat(screenshot)).mtimeMs>=suiteStarted-1000)await copyFile(screenshot,join(artifactsPath,'purchases-'+index+'.png'));
      }
    }
    testSucceeded=true;
  }catch(error){errors.push(error);}
  finally{
    for(const child of [...children].reverse()){
      try{await stop(child);}catch(error){errors.push(error);}
    }
    try{
      const after=await candidateSnapshot();
      if(after!==originalHash)throw new Error('Isolation en échec : candidate modifiée au passage '+index+' (SHA256='+after+').');
      console.log('BROWSER_CANDIDATE_ISOLATION_'+index+'=PASS SHA256='+after);
    }catch(error){errors.push(error);}
    if(children.every(child=>child.closed)){
      try{await removeRunDirectory(runDirectory);}catch(error){errors.push(error);}
      try{await removeRunDirectory(profileDirectory,profileParent);}catch(error){errors.push(error);}
    }else{errors.push(new Error('Processus encore actif : copie conservée dans '+runDirectory));}
  }
  if(errors.length)throw new AggregateError(errors,'Browser Gate passage '+index+' : '+errors.map(error=>error.message).join(' | '));
  if(!testSucceeded)throw new Error('Browser Gate passage '+index+' sans tests complets.');
}

async function main(){
  const configuration=options();
  if(!configuration)return;
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Browser Gate requiert Node 22+.');
  const chrome=chromePath(configuration.chrome);
  await mkdir(artifactsPath,{recursive:true});
  const originalHash=await candidateSnapshot();
  console.log('Browser Gate : candidate inactive requise '+candidatePath);
  console.log('Browser Gate : logs et captures '+artifactsPath);
  process.once('SIGINT',onSigint);
  process.once('SIGTERM',onSigterm);
  try{
    for(let index=1;index<=configuration.runs;index++)await run(index,configuration,chrome,originalHash);
    console.log(configuration.only?'BROWSER_GATE=PASS — '+configuration.only+' x'+configuration.runs+' / candidate isolation x'+configuration.runs:'BROWSER_GATE=PASS — identities x'+configuration.runs+' / smoke x'+configuration.runs+' / candidate isolation x'+configuration.runs);
  }finally{
    process.removeListener('SIGINT',onSigint);
    process.removeListener('SIGTERM',onSigterm);
  }
}

try{await main();}
catch(error){console.error('BROWSER_GATE=FAIL');console.error(error.stack||error.message);process.exitCode=1;}
