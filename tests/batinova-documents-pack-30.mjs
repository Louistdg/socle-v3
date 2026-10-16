import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
import {runDocumentsPack,TARGET_TOTAL,TARGET_PHOTOS,TARGET_DOCUMENTS} from '../scripts/simulation/batinova-xl/documents-pack.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}

const stamp='2026-09-29T18:30:00.000Z';
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('owner','Marc','Delcourt','marc@batinova.invalid',stamp,stamp);
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova XL','BatiNova XL','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Patron',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('member-owner','org','owner','role-owner','active',stamp,stamp,stamp);

const state={
  version:3,
  company:{name:'BatiNova XL',morningBreakMinutes:15,lunchBreakMinutes:30},
  people:[
    {id:'person-1',name:'Personne 1'},
    {id:'person-2',name:'Personne 2'},
    {id:'person-3',name:'Personne 3'},
    {id:'person-4',name:'Personne 4'}
  ],
  teams:[],
  jobs:[
    {id:'project-1',name:'Chantier 1'},
    {id:'project-2',name:'Chantier 2'},
    {id:'project-3',name:'Chantier 3'},
    {id:'project-4',name:'Chantier 4'}
  ],
  assignments:[],
  quotes:[
    {id:'quote-1',number:'DEV-1'},
    {id:'quote-2',number:'DEV-2'},
    {id:'quote-3',number:'DEV-3'}
  ],
  assets:[
    {id:'asset-1',name:'Camionnette 1'},
    {id:'asset-2',name:'Échafaudage'},
    {id:'asset-3',name:'Remorque'}
  ],
  tasks:[],
  dossiers:[],
  reminders:[],
  contacts:[],
  purchaseOrders:[]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('org',JSON.stringify(state),1,'owner',stamp,stamp);

const first=await runDocumentsPack({database:db,organizationId:'org',worker});
assert.equal(first.total,TARGET_TOTAL,'180 fichiers BATXL');
assert.equal(first.documents,TARGET_DOCUMENTS,'70 documents hors photos');
assert.equal(first.photos,TARGET_PHOTOS,'110 photos');
assert.equal(first.blobs,TARGET_TOTAL,'un blob privé par fichier');
assert.equal(first.publicStorage,0,'aucun storage_key public');
assert.equal(first.idempotencyKeys,TARGET_TOTAL,'clés idempotence uniques');
assert.ok(first.archived>=6,'documents archivés présents');
assert.ok(first.confidential>=8,'documents confidentiels/restreints présents');
assert.equal(first.security.executed,true,'probe sécurité exécuté');
assert.equal(first.security.ownerConfidential,200,'OWNER voit le confidentiel');
assert.deepEqual(first.security.teamLead,{assigned:200,blocked:404,confidential:404},'TEAM_LEAD limité au périmètre');
assert.deepEqual(first.security.worker,{assigned:200,blocked:404,confidential:404},'WORKER limité au périmètre');
assert.equal(first.security.search.status,200,'recherche serveur OK');
assert.equal(first.security.search.nextCursor,true,'pagination présente sur la bibliothèque');
assert.equal(first.security.pagination.secondPageStatus,200,'deuxième page lisible');
assert.equal(first.security.archive.status,200,'filtre archives OWNER OK');
assert.ok(first.security.archive.count>=1,'archives retournées');
assert.equal(first.security.confidentialAuditRecorded,true,'la sonde doit vérifier un véritable audit dans sa copie');
assert.equal(Number(db.prepare('SELECT COUNT(*) count FROM document_access_logs').get().count),0,'la sonde ne doit pas ajouter de faux accès à la base de simulation');

// Une lecture réelle reste auditée et son journal doit survivre au replay du pack.
const confidentialDocument=db.prepare("SELECT id FROM secure_documents WHERE organization_id='org' AND sensitivity='confidential' AND archived_at IS NULL ORDER BY id LIMIT 1").get();
const env={DB:{prepare(sql){let values=[];return{
  bind(...args){values=args;return this},
  async first(){return db.prepare(sql).get(...values)??null},
  async all(){return{results:db.prepare(sql).all(...values)}},
  async run(){return{meta:{changes:Number(db.prepare(sql).run(...values).changes)}}}
}}}};
const actualRead=await worker.fetch(new Request('https://socle.test/api/documents/'+encodeURIComponent(confidentialDocument.id),{headers:{'oai-authenticated-user-id':'owner','x-socle-organization-id':'org','origin':'https://socle.test'}}),env);
assert.equal(actualRead.status,200,'une lecture réelle confidentielle doit rester autorisée pour OWNER');
const auditBeforeReplay=db.prepare('SELECT * FROM document_access_logs ORDER BY id').all();
assert.equal(auditBeforeReplay.length,1,'la lecture réelle doit produire sa trace');
assert.equal(auditBeforeReplay[0].document_id,confidentialDocument.id);
assert.equal(auditBeforeReplay[0].user_id,'owner');

const beforeCounts={
  documents:Number(db.prepare("SELECT COUNT(*) n FROM secure_documents WHERE organization_id='org' AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%')").get().n),
  relations:Number(db.prepare("SELECT COUNT(*) n FROM document_relations WHERE organization_id='org' AND (document_id LIKE 'BATXL-DOC-%' OR document_id LIKE 'BATXL-PHO-%')").get().n),
  blobs:Number(db.prepare("SELECT COUNT(*) n FROM secure_document_blobs WHERE organization_id='org' AND (document_id LIKE 'BATXL-DOC-%' OR document_id LIKE 'BATXL-PHO-%')").get().n)
};
const second=await runDocumentsPack({database:db,organizationId:'org',worker});
const afterCounts={
  documents:Number(db.prepare("SELECT COUNT(*) n FROM secure_documents WHERE organization_id='org' AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%')").get().n),
  relations:Number(db.prepare("SELECT COUNT(*) n FROM document_relations WHERE organization_id='org' AND (document_id LIKE 'BATXL-DOC-%' OR document_id LIKE 'BATXL-PHO-%')").get().n),
  blobs:Number(db.prepare("SELECT COUNT(*) n FROM secure_document_blobs WHERE organization_id='org' AND (document_id LIKE 'BATXL-DOC-%' OR document_id LIKE 'BATXL-PHO-%')").get().n)
};
assert.deepEqual(afterCounts,beforeCounts,'replay x2 sans duplication');
assert.equal(second.fingerprint,first.fingerprint,'fingerprint logique stable au replay');
assert.equal(second.security.confidentialAuditRecorded,true,'la sonde rejouée doit encore vérifier l’audit serveur');
assert.deepEqual(db.prepare('SELECT * FROM document_access_logs ORDER BY id').all(),auditBeforeReplay,'le replay conserve intégralement la trace réelle et ne crée aucun faux accès');

const fk=db.prepare('PRAGMA foreign_key_check').all();
assert.equal(fk.length,0,'foreign_key_check vide');
assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity_check ok');

const keys=db.prepare("SELECT id,idempotency_key,storage_key FROM secure_documents WHERE organization_id='org' AND (id LIKE 'BATXL-DOC-%' OR id LIKE 'BATXL-PHO-%') ORDER BY id").all();
assert.equal(keys.length,TARGET_TOTAL,'volume SQL final exact');
assert.ok(keys.every(row=>String(row.storage_key).startsWith('private/org/')),'storage privé');
assert.ok(keys.every(row=>/^BATXL-OP-(DOCUMENT|PHOTO)-\d{5}-UPSERT$/.test(String(row.idempotency_key))),'operationKeys BATXL déterministes');
assert.ok(keys.every(row=>!/^https?:/i.test(String(row.storage_key))),'aucune URL permanente publique');

for(const label of ['Bon de livraison','PV de réception','Devis','Facture fournisseur','Contrat','Attestation','Dossier matériel','Maintenance véhicule','Plan simulé','Autorisation','Document technique']){
  const count=Number(db.prepare("SELECT COUNT(*) n FROM secure_documents WHERE organization_id='org' AND title LIKE ?").get('%'+label+'%').n);
  assert.ok(count>0,'catégorie présente: '+label);
}
for(const phase of ['Avant travaux','Pendant travaux','Réception','Problème chantier']){
  const count=Number(db.prepare("SELECT COUNT(*) n FROM secure_documents WHERE organization_id='org' AND id LIKE 'BATXL-PHO-%' AND title LIKE ?").get('%'+phase+'%').n);
  assert.ok(count>0,'phase photo présente: '+phase);
}

await import('./document-registry-pagination-30.mjs');
await import('./document-registry-ui-contexts-30.mjs');

console.log('batinova-documents-pack-30: PASS',JSON.stringify({
  total:first.total,
  photos:first.photos,
  archived:first.archived,
  confidential:first.confidential,
  relations:first.relations,
  fingerprint:first.fingerprint
}));
