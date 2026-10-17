import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backupConfig,listS3Objects,s3Request} from './production-backup.mjs';

const config=backupConfig(process.env);
if(!config||config.kind!=='s3')throw new Error('S3 backup configuration is unavailable.');
const objects=(await listS3Objects(config)).sort((a,b)=>b.lastModified-a.lastModified).slice(0,12);
const dir=await mkdtemp(join(tmpdir(),'socle-org-audit-'));
try{
  for(const [index,object] of objects.entries()){
    const response=await s3Request(config,'GET',object.key);
    const path=join(dir,`${index}.sqlite`);
    await writeFile(path,Buffer.from(await response.arrayBuffer()));
    const db=new DatabaseSync(path,{readOnly:true});
    try{
      const rows=db.prepare('SELECT id,name,legal_name FROM organizations ORDER BY id').all();
      console.log(JSON.stringify({key:object.key,lastModified:new Date(object.lastModified).toISOString(),count:rows.length,organizations:rows}));
    }finally{db.close();await rm(path,{force:true});}
  }
}finally{await rm(dir,{recursive:true,force:true});}
