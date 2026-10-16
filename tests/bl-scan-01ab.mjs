import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openProductionDatabase} from '../scripts/production-db.mjs';
import {seedBlScanFixture} from './helpers/bl-scan-fixture.mjs';
import worker from '../worker/index.js';

const runtime=openProductionDatabase({databasePath:':memory:',migrationsDirectory:fileURLToPath(new URL('../drizzle/',import.meta.url))});
const db=runtime.database;seedBlScanFixture(db);
const env={DB:runtime.DB};
const pdf=new TextEncoder().encode('%PDF-1.4\nFixture livraison originale\n%%EOF');
const endpoint='/api/purchase-orders/shared-order/delivery-scans';
async function call(uid,method,path,body,org='org-a'){
  const headers={'origin':'https://socle.test','x-socle-organization-id':org};if(uid)headers['oai-authenticated-user-id']=uid;
  if(body && !(body instanceof FormData)){headers['content-type']='application/json';body=JSON.stringify(body)}
  return worker.fetch(new Request('https://socle.test'+path,{method,headers,...(body?{body}:{})}),env);
}
function upload(bytes=pdf,key='scan-operation-001',name='livraison.pdf',type='application/pdf',extra={}){const form=new FormData();form.append('file',new Blob([bytes],{type}),name);form.append('operationKey',key);for(const [k,v] of Object.entries(extra))form.append(k,v);return form}
let checks=0;function eq(a,b,msg){assert.equal(a,b,msg);checks++}function ok(v,msg){assert.ok(v,msg);checks++}
const snapshot=()=>({workspace:db.prepare('SELECT * FROM organization_workspace_state ORDER BY organization_id').all(),deliveries:db.prepare('SELECT * FROM field_delivery_notes').all(),movements:db.prepare('SELECT * FROM field_stock_movements').all(),items:db.prepare('SELECT * FROM field_stock_items').all(),balances:db.prepare('SELECT * FROM stock_balances').all()});
const before=snapshot();
try{
  eq((await call(null,'POST',endpoint,upload())).status,401,'anonymous');
  for(const uid of ['no-view','no-receive','worker','accounting','documents-only','out-of-scope'])eq((await call(uid,'POST',endpoint,upload())).status,403,'upload denied '+uid);
  eq((await call('owner-a','POST',endpoint,upload(),'org-b')).status,403,'wrong active tenant');
  eq((await call('owner-a','POST',endpoint.replace('shared-order','forged'),upload())).status,404,'forged order');
  eq((await call('owner-a','POST',endpoint,upload(pdf,'unsafe-fields-01','livraison.pdf','application/pdf',{documentId:'forged'}))).status,400,'forged document field');
  eq((await call('owner-a','POST',endpoint,{file:'no multipart'})).status,415,'multipart required');
  eq((await call('owner-a','POST',endpoint,upload(pdf,'mime-mismatch-01','livraison.png','image/png'))).status,415,'magic and MIME mismatch');
  eq((await call('owner-a','POST',endpoint,upload(new Uint8Array(1800001),'oversize-upload-01'))).status,413,'size bound without trusted Content-Length');
  let response=await call('receiver','POST',endpoint,upload());eq(response.status,201,'explicit receiver uploads without documents.secure.manage');
  const first=await response.json(),scan=first.scan;
  eq(scan.status,'uploaded','initial status');eq(scan.checksumSha256,createHash('sha256').update(pdf).digest('hex'),'SHA256 exact');
  eq(db.prepare('SELECT ocr_status FROM secure_documents WHERE id=?').get(scan.documentId).ocr_status,'not_requested','no OCR requested');
  eq(db.prepare("SELECT relation_id FROM document_relations WHERE document_id=? AND relation_type='purchase_order'").get(scan.documentId).relation_id,'shared-order','order relation');
  eq((await call('receiver','GET',endpoint+'/'+scan.id+'/original')).status,200,'contextual original without global Documents permission');
  response=await call('owner-a','GET',endpoint+'/'+scan.id+'/original');assert.deepEqual(new Uint8Array(await response.arrayBuffer()),pdf);checks++;
  for(const key of ['scan-operation-001','scan-operation-002']){response=await call('receiver','POST',endpoint,upload(pdf,key));eq(response.status,200,'duplicate key '+key);eq((await response.json()).scan.id,scan.id,'same session');}
  eq(db.prepare('SELECT COUNT(*) n FROM field_delivery_scans').get().n,1,'one session');eq(db.prepare('SELECT COUNT(*) n FROM secure_documents').get().n,1,'one document');
  eq(db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='delivery_scan.uploaded'").get().n,1,'single upload audit');
  eq((await call('receiver','POST',endpoint,upload(new TextEncoder().encode('%PDF-new content'),'scan-operation-001'))).status,409,'operation key collision different bytes');
  eq((await call('owner-a','POST',endpoint.replace('shared-order','other-order'),upload(pdf,'scan-operation-001'))).status,409,'operation key collision other order');
  response=await call('owner-a','POST',endpoint.replace('shared-order','other-order'),upload(pdf,'different-order-01'));eq(response.status,201,'same file different order');
  const otherScan=(await response.json()).scan;
  eq((await call('owner-a','GET',endpoint+'/'+otherScan.id+'/original')).status,404,'forged scan belongs to another order');
  response=await call('owner-b','POST',endpoint,upload(pdf,'scan-operation-001'),'org-b');eq(response.status,201,'same file and same order ID other tenant');
  const tenantB=(await response.json()).scan;ok(tenantB.id!==scan.id,'independent tenant session');
  eq((await call('owner-a','GET',endpoint+'/'+tenantB.id+'/original')).status,404,'forged other tenant scan');
  eq((await call('owner-a','GET','/api/documents/'+tenantB.documentId+'/download')).status,404,'forged other tenant document');
  eq((await call('accounting','GET',endpoint+'/'+scan.id+'/original')).status,200,'accounting contextual read');
  for(const uid of ['out-of-scope','documents-only','worker']){
    eq((await call(uid,'GET',endpoint+'/'+scan.id+'/original')).status,403,'context denies '+uid);
    eq((await call(uid,'GET','/api/documents/'+scan.documentId+'/download')).status,404,'generic download denies '+uid);
    response=await call(uid,'GET','/api/documents');eq(response.status,200,'global registry accessible '+uid);
    const docs=(await response.json()).documents;ok(!docs.some(d=>d.id===scan.documentId),'no global registry leak '+uid);
  }
  eq((await call('owner-a','GET','/api/documents/'+scan.documentId+'/download')).status,200,'owner global authorized read');
  for(const [method,suffix,body] of [['POST','/archive',{}],['PATCH','',{title:'changed'}],['POST','/relations',{type:'project',targetId:'project-b'}]])eq((await call('owner-a',method,'/api/documents/'+scan.documentId+suffix,body)).status,409,'original immutable '+suffix);
  for(const sql of ["DELETE FROM secure_documents WHERE id=?","DELETE FROM secure_document_blobs WHERE document_id=?","UPDATE secure_document_blobs SET content=x'00' WHERE document_id=?","DELETE FROM document_relations WHERE document_id=?","UPDATE secure_documents SET checksum_sha256='tampered' WHERE id=?"]){assert.throws(()=>db.prepare(sql).run(scan.documentId));checks++;}
  assert.throws(()=>db.prepare('UPDATE field_delivery_scans SET order_id=? WHERE id=?').run('other-order',scan.id));checks++;
  for(let i=0;i<2;i++)eq((await call('owner-a','POST',endpoint+'/'+scan.id+'/confirm',{})).status,404,'confirmation unavailable');
  // Race: both requests see an empty checksum before atomic DB.batch writes.
  const raceBytes=new TextEncoder().encode('%PDF-race fixture');
  const race=await Promise.all(['race-operation-01','race-operation-02'].map(key=>call('owner-a','POST',endpoint,upload(raceBytes,key))));
  const raceBodies=await Promise.all(race.map(r=>r.json()));eq(raceBodies[0].scan.id,raceBodies[1].scan.id,'concurrent upload dedup');
  eq(db.prepare('SELECT COUNT(*) n FROM field_delivery_scans WHERE checksum_sha256=?').get(createHash('sha256').update(raceBytes).digest('hex')).n,1,'race unique');
  for(const [name,type,bytes] of [['photo.jpg','image/jpeg',new Uint8Array([255,216,255,1])],['photo.png','image/png',new Uint8Array([137,80,78,71,13,10,26,10,1])],['photo.webp','image/webp',new TextEncoder().encode('RIFF1234WEBPfixture')]])eq((await call('owner-a','POST',endpoint,upload(bytes,'format-'+name,name,type))).status,201,'format '+type);
  // Rollback all payloads when an audit write fails after document insertion.
  const counts=()=>['field_delivery_scans','secure_documents','secure_document_blobs','document_relations','audit_logs'].map(t=>db.prepare('SELECT COUNT(*) n FROM '+t).get().n);
  const saved=counts();db.exec("CREATE TRIGGER inject_scan_audit_failure BEFORE INSERT ON audit_logs WHEN NEW.action='delivery_scan.uploaded' BEGIN SELECT RAISE(ABORT,'injected scan audit failure'); END");
  eq((await call('owner-a','POST',endpoint,upload(new TextEncoder().encode('%PDF-rollback'),'rollback-operation-01'))).status,500,'transaction failure');
  assert.deepEqual(counts(),saved);checks++;db.exec('DROP TRIGGER inject_scan_audit_failure');
  assert.deepEqual(snapshot(),before,'upload never changes order, delivery, stock item, balances or movements');checks++;
  eq(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);checks++;
  console.log('BL_SCAN_01AB=PASS '+checks+' checks: tenant/scope, contextual Documents, immutable original, dedup/race, rollback, no reception/stock/OCR.');
}finally{runtime.close();}
