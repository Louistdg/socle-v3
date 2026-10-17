import {backupConfig,listS3Objects} from './production-backup.mjs';

const config=backupConfig(process.env);
if(!config||config.kind!=='s3')throw new Error('S3 backup configuration is unavailable.');
const objects=await listS3Objects(config);
console.log(`S3_BACKUP_OBJECTS=${objects.length}`);
if(objects.length)console.log(`S3_BACKUP_OLDEST=${new Date(Math.min(...objects.map(object=>object.lastModified))).toISOString()}`);
if(objects.length)console.log(`S3_BACKUP_NEWEST=${new Date(Math.max(...objects.map(object=>object.lastModified))).toISOString()}`);
