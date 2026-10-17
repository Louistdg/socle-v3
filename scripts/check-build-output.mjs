import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const [mode,snapshot]=process.argv.slice(2);
if(!['capture','verify'].includes(mode)||!snapshot)throw new Error('Usage: node scripts/check-build-output.mjs <capture|verify> <snapshot.json>');
const tracked=execFileSync('git',['ls-files','-z','--','web','dist'],{encoding:'utf8'}).split('\0').filter(Boolean);
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(mode==='capture'){
  writeFileSync(snapshot,JSON.stringify(Object.fromEntries(tracked.map(path=>[path,digest(path)]))));
  console.log(`Captured raw bytes for ${tracked.length} tracked files under web/ and dist/.`);
}else{
  const before=JSON.parse(readFileSync(snapshot,'utf8'));
  const changed=tracked.filter(path=>before[path]!==digest(path));
  if(changed.length){console.error('Build modified tracked bytes under web/ or dist/:');for(const path of changed)console.error(`  ${path}`);process.exitCode=1;}
  else console.log(`Build output byte check passed (${tracked.length} tracked files under web/ and dist/).`);
}
