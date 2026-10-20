import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const read=path=>readFileSync(join(root,path),'utf8');
let assertions=0;
const ok=(value,message)=>{assert.ok(value,message);assertions++};
const equal=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const match=(actual,expected,message)=>{assert.match(actual,expected,message);assertions++};
const rejects=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};

const hostile=[
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><script>alert(1)</script>',
  `quotes ' " & attribute`,
  '</script><script>alert(1)</script>',
];
const localAuth=read('web/local-test-auth.js');
const pickerScript=localAuth.slice(0,localAuth.indexOf('// Dernier filet'));
ok(!/\.innerHTML\b/.test(pickerScript),'The local identity picker must not render API data via innerHTML');
ok(!/\.onclick\s*=/.test(pickerScript),'The local identity picker must use event listeners');
ok(/\.addEventListener\(['"]click['"]/.test(pickerScript),'The local identity picker uses addEventListener');
ok(/option\.textContent\s*=\s*identity\.displayName/.test(pickerScript),'Identity display names are inserted as text');
ok(/option\.value\s*=\s*identity\.email/.test(pickerScript),'Identity emails are assigned through the option value property');

class Element {
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.listeners={};this.className='';this.value='';this.textContent='';this.style={}}
  append(...children){this.children.push(...children)}
  prepend(child){this.children.unshift(child)}
  setAttribute(name,value){this.attributes[name]=String(value)}
  addEventListener(name,listener){this.listeners[name]=listener}
}
const elements=[];
const document={createElement(tag){const element=new Element(tag);elements.push(element);return element},body:new Element('body')};
const localStorage={removeItem(){}};
const fetch=async()=>({ok:true,json:async()=>({identities:hostile.map((payload,index)=>({email:`test-${index}@example.test`,displayName:payload}))})});
vm.runInNewContext(pickerScript,{fetch,document,localStorage,location:{assign(){}},alert(){}});
await new Promise(resolve=>setTimeout(resolve,0));
const options=elements.filter(element=>element.tagName==='OPTION'&&element.value);
equal(options.length,hostile.length,'Each API identity creates one option element');
for(let index=0;index<hostile.length;index++)equal(options[index].textContent,hostile[index],`Hostile XSS payload ${index+1} remains inert option text`);
equal(document.body.children.length,1,'The identity picker mounts as one DOM subtree');

const app=read('web/app.js');
const helperLine=name=>app.split(/\r?\n/).find(line=>line.startsWith(`const ${name}=`));
const escLine=helperLine('esc'),jsStringLine=helperLine('jsString'),documentUrlLine=helperLine('safeDocumentUrl'),imageUrlLine=helperLine('safeImageUrl');
ok(Boolean(escLine&&jsStringLine&&documentUrlLine&&imageUrlLine),'Frontend provides the audited escaping and URL helper functions');
const helpers=vm.runInNewContext(`${escLine}\n${jsStringLine}\n${documentUrlLine}\n${imageUrlLine}\n({jsString,safeDocumentUrl,safeImageUrl})`,{URL});
for(let index=0;index<hostile.length;index++){
  const encoded=helpers.jsString(hostile[index]);
  ok(!/[<>'"]/.test(encoded),`Dynamic handler argument ${index+1} escapes markup and quotes`);
  ok(!encoded.toLowerCase().includes('</script'),`Dynamic handler argument ${index+1} cannot terminate a script element`);
}
const origin='https://socle.test';
ok(Boolean(helpers.safeDocumentUrl('/api/documents/id/preview',origin)),'Same-origin document URLs remain usable');
rejects(helpers.safeDocumentUrl('javascript:alert(1)',origin),'','javascript: document URL is rejected');
rejects(helpers.safeDocumentUrl('data:text/html,<script>alert(1)</script>',origin),'','data: document URL is rejected');
rejects(helpers.safeDocumentUrl('https://attacker.test/document.pdf',origin),'','External document URL is rejected');
rejects(helpers.safeDocumentUrl('/api/documents/id/download?access_token=secret',origin),'','Token query strings are rejected');
rejects(helpers.safeDocumentUrl('/api/documents/id/download#session=secret',origin),'','Session fragments are rejected');
rejects(helpers.safeDocumentUrl('https://user:password@socle.test/private',origin),'','Credential-bearing URL is rejected');
ok(Boolean(helpers.safeImageUrl('data:image/png;base64,iVBORw0KGgo=',origin)),'Canvas-generated PNG data URLs remain usable for quote sketches');
ok(Boolean(helpers.safeImageUrl('blob:https://socle.test/1234',origin)),'Same-origin object URLs remain usable for photo previews');
rejects(helpers.safeImageUrl('data:image/svg+xml,<svg onload=alert(1)>',origin),'','Active SVG data URLs are rejected');
rejects(helpers.safeImageUrl('javascript:alert(1)',origin),'','javascript: image URL is rejected');
rejects(helpers.safeImageUrl('https://attacker.test/image.png',origin),'','External image URL is rejected');

const quoteUi=read('web/workflow-improvements.js');
ok(/safeImageUrl\(sketch\.data\|\|/.test(quoteUi),'Quote sketch previews validate their image source');
ok(/safeImageUrl\(photo\.url\|\|/.test(quoteUi),'Quote photo previews validate their image source');
ok(/openQuoteDraftFolder\('\$\{jsString\(draft\.id\)\}'\)/.test(quoteUi),'Draft folder IDs are escaped in dynamic handlers');
ok(/quoteFormFromDraft\('\$\{jsString\(draft\.id\)\}'\)/.test(quoteUi),'Draft conversion IDs are escaped in dynamic handlers');

const webFiles=readdirSync(join(root,'web')).filter(name=>name.endsWith('.js')||name.endsWith('.html'));
const webSource=webFiles.map(name=>read(`web/${name}`)).join('\n');
const storageKeys=new Set([...webSource.matchAll(/localStorage\.(?:getItem|setItem|removeItem)\(['"]([^'"]+)['"]/g)].map(match=>match[1]));
equal([...storageKeys].sort().join(','),'socle-personal-weather,socle-v3.theme,socle-v3.theme-choice,socle.activeOrganizationId,socle.sessionUserId,socle.time-report.','Only documented non-authentication localStorage keys are used');
ok(!/\bsessionStorage\b/.test(webSource),'Frontend does not use sessionStorage');
ok(!/\bdocument\.cookie\b/.test(webSource),'Frontend cannot read cookies through document.cookie');
ok(!/(?:[?&#]|\\b)(?:access_token|auth_token|session_token|token)=/i.test(webSource),'No static frontend URL contains an authentication token parameter');

const worker=read('worker/index.js');
match(worker,/default-src 'self';[^}]*style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'/,'The current CSP remains explicit and is not weakened beyond its existing inline allowances');
const handlerCount=(webSource.match(/\bon[a-z]+\s*=/gi)||[]).length;
ok(handlerCount>0,'Legacy inline handlers remain inventoried as the current script-src unsafe-inline dependency');
match(worker,/inline event attributes, including generated controls/,'The reason script-src unsafe-inline cannot yet be removed is documented beside the CSP source');
const builtBundle=read('dist/server/index.js');
ok(!builtBundle.includes('socle_test_session'),'The local authentication session cookie name is absent from the public worker bundle');
const {default:publicWorker}=await import('../dist/server/index.js');
const localIdentitiesResponse=await publicWorker.fetch(new Request('https://socle.test/__local-test/identities'),{});
equal(localIdentitiesResponse.status,404,'The production worker does not expose local test identity routes');
const localLoginResponse=await publicWorker.fetch(new Request('https://socle.test/__local-test/login',{method:'POST'}),{});
equal(localLoginResponse.status,405,'The production worker does not expose local test login routes');

const localServer=read('scripts/local.mjs');
for(const envName of ['NODE_ENV','RUNTIME_ENV','SOCLE_RUNTIME_ENV'])match(localServer,new RegExp(`['"]${envName}['"]`),`The local test server checks ${envName}`);
match(localServer,/interdits en production/,'The local test server rejects production startup');
ok(/headers\.delete\('oai-authenticated-user-id'\).*headers\.delete\('oai-authenticated-user-email'\)/.test(localServer),'Browser-supplied identity ID and email headers are both removed');
ok(/headers\.set\('oai-authenticated-user-id',identity\.profile_id\).*headers\.set\('oai-authenticated-user-email',identity\.email\)/.test(localServer),'Identity headers are restored only from the server-side session profile');
match(localServer,/socle_test_session=\$\{token\}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=28800/,'Local test sessions remain HttpOnly and scoped to the site root');
ok(!/socle_test_session[^`'"]*Secure/.test(localServer),'The HTTP-only local server does not set Secure on its HTTP cookie');

console.log(`frontend-security-26: ${assertions} assertions passed; ${handlerCount} inline handler occurrences remain in web sources.`);
