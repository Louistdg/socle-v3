import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';

const webUrl=new URL('../web/',import.meta.url);
const app=readFileSync(new URL('app.js',webUrl),'utf8');
const helperSource=app.split('\n').slice(0,8).join('\n');
const context=vm.createContext({URL,location:{origin:'https://socle.test'}});
vm.runInContext(helperSource,context);
const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const attacks=[
  "x');globalThis.__soclePwned=true;//<>&\\\nline",
  '<img src=x onerror=globalThis.__soclePwned=true>',
  '<svg onload=globalThis.__soclePwned=true>',
  '"><script>globalThis.__soclePwned=true</script>',
  `apostrophe ' et guillemets " dans attribut`,
  '</script><script>globalThis.__soclePwned=true</script>'
];
for(const attack of attacks){
  const attackContext=vm.createContext({URL,location:{origin:'https://socle.test'}});
  vm.runInContext(helperSource+`\nglobalThis.__encoded=jsString(${JSON.stringify(attack)});`,attackContext);
  const decoded=decode(attackContext.__encoded);let captured='';
  const handlerContext=vm.createContext({capture:value=>{captured=value}});
  vm.runInContext(`capture('${decoded}')`,handlerContext);
  assert.equal(captured,attack,`jsString doit préserver cette charge sans sortir du littéral JS: ${attack}`);
  assert.equal(handlerContext.__soclePwned,undefined,'La charge injectée ne doit pas être exécutée');
}
assert.equal(vm.runInContext("safeDocumentUrl('/api/documents/id/preview')",context),'https://socle.test/api/documents/id/preview');
for(const url of ['javascript:alert(1)','data:text/html,<svg onload=alert(1)>','https://evil.test/document','//evil.test/document','/api/document?id=x#token','https://user:pass@socle.test/document']){
  assert.equal(vm.runInContext(`safeDocumentUrl(${JSON.stringify(url)})`,context),'',`URL documentaire refusée: ${url}`);
}
assert.equal(vm.runInContext("safeImageUrl('data:image/png;base64,AAAA')",context),'data:image/png;base64,AAAA');
assert.equal(vm.runInContext("safeImageUrl('blob:https://socle.test/123')",context),'blob:https://socle.test/123');
for(const url of ['data:image/svg+xml,<svg onload=alert(1)>','data:text/html,<script>alert(1)</script>','javascript:alert(1)','https://evil.test/image','blob:https://evil.test/123','/image.png?token=secret']){
  assert.equal(vm.runInContext(`safeImageUrl(${JSON.stringify(url)})`,context),'',`Source image refusée: ${url}`);
}

let vulnerableEventEscapes=[];
for(const name of readdirSync(webUrl).filter(name=>name.endsWith('.js'))){
  const source=readFileSync(new URL(name,webUrl),'utf8');
  const event=/on(?:click|change|submit|input)="[^"]*"/g;
  for(const match of source.matchAll(event))if(match[0].includes('${esc('))vulnerableEventEscapes.push(`${name}: ${match[0].slice(0,160)}`);
}
assert.deepEqual(vulnerableEventEscapes,[],'Les valeurs dynamiques dans les handlers inline doivent utiliser jsString, pas esc');
const localAuth=readFileSync(new URL('local-test-auth.js',webUrl),'utf8');
assert.doesNotMatch(localAuth.slice(0,localAuth.indexOf('// Dernier filet')),/innerHTML/,'Le sélecteur d’identités locales ne doit pas parser des champs d’API en HTML');
assert.match(localAuth,/function appendLocalTestIdentities/,'Les options d’identité passent par le constructeur DOM');
assert.match(localAuth,/option\.textContent=identity\.displayName/,'Le nom d’identité est injecté comme texte');
assert.doesNotMatch(localAuth,/openTaskComments\([^)]*task\.title/,'Le titre utilisateur d’une tâche ne doit plus être injecté dans onclick');
assert.match(localAuth,/async function openTaskComments\(taskId\)/,'Le titre de la tâche doit être retrouvé depuis l’état, hors du handler inline');

const identityOptions=localAuth.match(/function appendLocalTestIdentities[\s\S]*?\n/)[0];
const optionsContext=vm.createContext({document:{createElement:()=>({})}});
let optionCount=0;
const select={append(option){optionCount++;assert.equal(option.value,attacks[1]);assert.equal(option.textContent,attacks[2])}};
vm.runInContext(identityOptions+`\nappendLocalTestIdentities(select, identities, document);`,vm.createContext({document:{createElement:()=>({})},select,identities:[{email:attacks[1],displayName:attacks[2]}]}));
assert.equal(optionCount,1,'Valeurs de test XSS conservées comme valeur et texte DOM, sans parseur HTML');

const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
const csp=worker.match(/content-security-policy':['"]([^'"]*(?:'[^']*'[^'"]*)*)['"]/i)?.[1]||'';
assert.match(worker,/script-src 'self' 'unsafe-inline'/,'La CSP garde le script unsafe-inline tant que les attributs handlers legacy sont présents');
assert.match(worker,/style-src 'self' 'unsafe-inline'/,'La politique CSS inline existante est conservée');
const scriptAttributes=(readFileSync(new URL('index.html',webUrl),'utf8').match(/\son[a-z]+\s*=/gi)||[]).length;
assert.ok(scriptAttributes>0,'La page d’entrée contient encore des handlers inline');
const storageFiles=readdirSync(webUrl).filter(name=>name.endsWith('.js')).map(name=>readFileSync(new URL(name,webUrl),'utf8')).join('\n');
assert.doesNotMatch(storageFiles,/localStorage\.(?:getItem|setItem)\(\s*['"][^'"]*(?:token|password|secret|auth)/i,'Aucun jeton, mot de passe ou secret ne doit entrer dans localStorage');
assert.doesNotMatch(storageFiles,/sessionStorage\.(?:getItem|setItem)\(\s*['"][^'"]*(?:token|password|secret|auth)/i,'Aucun jeton, mot de passe ou secret ne doit entrer dans sessionStorage');
assert.doesNotMatch(storageFiles,/document\.cookie/,'Aucun cookie de session ne doit être lisible depuis le JavaScript frontend');

console.log(`xss-inline-15: charges XSS, handlers, URLs, stockage, DOM identités et CSP vérifiés (${scriptAttributes} handlers inline statiques dans index.html)`);
