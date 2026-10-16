import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/v3-themes.js',import.meta.url),'utf8');
const start=source.indexOf("const layoutKey='socle-v3.mobile-layout'");
const end=source.indexOf('\napply(selected);',start);
assert.ok(start>=0&&end>start);

async function enterWorkspace(preference,{authenticated=true,fail=false,cached='wide'}={}){
 const storage=new Map([['socle-v3.mobile-layout',cached]]);
 const context={document:{body:{dataset:{}},querySelectorAll:()=>[]},localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)}};
 if(authenticated)context.serverJson=async()=>{if(fail)throw Error('Unavailable');return {preference};};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+'\napplyLayout(mobileLayout);',context);
 const initial=context.document.body.dataset.mobileLayout;
 await context.loadLayoutPreference();
 return {initial,final:context.document.body.dataset.mobileLayout};
}
assert.deepEqual(await enterWorkspace(null),{initial:'standard',final:'standard'},'A missing workspace preference must not inherit the previous workspace cache.');
assert.deepEqual(await enterWorkspace({value:{density:'wide'}}),{initial:'standard',final:'wide'},'Explicit saved wide mode is preserved.');
assert.deepEqual(await enterWorkspace({value:{density:'standard'}}),{initial:'standard',final:'standard'});
assert.deepEqual(await enterWorkspace(null,{fail:true}),{initial:'standard',final:'standard'},'A failed read must not reuse another workspace layout.');
assert.deepEqual(await enterWorkspace(null,{authenticated:false}),{initial:'wide',final:'wide'},'Standalone previews keep their browser preference.');
console.log('v3-display-preferences-20261016: density defaults and cached settings remain isolated between workspaces.');
