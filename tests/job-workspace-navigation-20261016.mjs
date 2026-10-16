import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/blank-workspace.js',import.meta.url),'utf8');
const start=source.indexOf('function openJobWorkspace('),end=source.indexOf('\n',start);
assert.ok(start>=0&&end>start);
const modal={open:true};let closed=0,renders=0;
const ctx={currentJobId:null,jobWorkspaceTab:'finance',view:'jobs',document:{querySelector:selector=>selector==='#modal'?modal:null},closeModal(){modal.open=false;closed++;},render(){assert.equal(modal.open,false,'The previous summary must not cover the full workspace.');renders++;}};
vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);
ctx.openJobWorkspace('legacy-project-1');
assert.equal(closed,1);assert.equal(renders,1);
assert.equal(ctx.currentJobId,'legacy-project-1');assert.equal(ctx.jobWorkspaceTab,'summary');assert.equal(ctx.view,'jobWorkspace');
ctx.openJobWorkspace(42);
assert.equal(closed,1,'An already closed dialog needs no second close.');assert.equal(ctx.currentJobId,42);assert.equal(renders,2);
console.log('job-workspace-navigation-20261016: summary closes before the full workspace renders; exact project ID preserved.');
