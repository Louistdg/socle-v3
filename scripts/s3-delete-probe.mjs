import {randomUUID} from 'node:crypto';
import {backupConfig,s3Request} from './production-backup.mjs';

const config=backupConfig(process.env);
if(!config||config.kind!=='s3')throw new Error('S3 backup configuration is unavailable.');
const key=`daily/socle-delete-probe-${randomUUID()}.txt`;
const payload=Buffer.from(`temporary DELETE probe ${new Date().toISOString()}`);
let uploaded=false;
try{
  await s3Request(config,'PUT',key,payload);uploaded=true;
  const read=Buffer.from(await (await s3Request(config,'GET',key)).arrayBuffer());
  if(!read.equals(payload))throw new Error('Probe object read-back did not match.');
  await s3Request(config,'DELETE',key);uploaded=false;
  let remains=false;
  try{await s3Request(config,'GET',key);remains=true;}catch(error){if(!String(error.message).includes('HTTP 404'))throw error;}
  if(remains)throw new Error('Object still exists after DELETE.');
  console.log('S3_DELETE_PROBE=PASS');
  console.log(`S3_DELETE_PROBE_KEY=${key}`);
}finally{
  if(uploaded)try{await s3Request(config,'DELETE',key);console.log('S3_DELETE_PROBE_CLEANUP=PASS');}catch(error){console.error('S3_DELETE_PROBE_CLEANUP=FAIL',error.message);}
}
