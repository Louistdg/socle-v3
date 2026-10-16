import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';

const database=new DatabaseSync(':memory:');
for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  database.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const env={DB:{prepare(sql){let values=[];return{bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}}}};
const stamp='2026-09-25T12:00:00.000Z';
const state={
  version:3,
  company:{name:'BatiNova',sector:'Construction',region:'Wallonie',size:'25',bank:'SECRET',marginRules:{default:22}},
  people:[{id:1,name:'Anthony Simon',role:'Ouvrier',employment:{grossHourly:25},hr:{paySlips:[{id:'pay-1'}]}}],
  teams:[{id:1,name:'Équipe 1',members:[1]}],
  jobs:[
    {id:1,reference:'CH-1',name:'Chantier autorisé',finance:{materials:1000},contractAmount:50000,contacts:[{name:'Secret'}],contactIds:['contact-1']},
    {id:2,reference:'CH-2',name:'Chantier interdit',finance:{materials:2000},confidentialProjectNote:'NE PAS DIVULGUER'}
  ],
  assignments:[{id:1,job:1,team:1},{id:2,job:2,team:1}],
  quotes:[
    {id:1,job:1,ref:'DEV-1',title:'Toiture',amount:12500,total:13250,lines:[{label:'Ardoises',qty:100,unit:'m²',price:125,vat:6}]},
    {id:2,job:2,ref:'DEV-2',title:'Secret',amount:99999,lines:[{label:'Secret',qty:1,unit:'forfait',price:99999,vat:21}]}
  ],
  assets:[{id:1,name:'Camionnette',category:'Véhicule',monthly:850,purchasePrice:42000,currentValue:33000,provider:'Financeur',reference:'LEASE-SECRET'}],
  tasks:[{id:'legacy-secret',title:'Tâche globale secrète'}],
  dossiers:[{id:'d-secret',name:'Dossier secret'}],
  reminders:[
    {id:'r-job',title:'Préparer le chantier',state:'todo',linkType:'job',linkId:1},
    {id:'r-company',title:'Secret direction',state:'todo',linkType:'company',linkId:0}
  ],
  contacts:[{id:'contact-1',name:'Contact confidentiel'}],
  accountingData:{customerInvoices:[{id:1,amount:1000}],bankTransactions:[{id:1,amount:2000}],openingPosition:{bank:2000},payments:[{id:1}]},
  priceCatalog:[{id:'p1',name:'Ardoise',price:125,purchasePrice:80}],
  stockItems:[{id:'s1',name:'Ardoise',quantity:50,unitCost:80,movements:[{id:'m1',quantity:2,unitCost:80}]}],
  purchaseOrders:[{id:'po1',number:'BC-1',netAmount:8000,vatAmount:1680,lines:[{id:'l1',label:'Ardoise',quantity:100,unitPrice:80,vatRate:21}]}],
  deliveryNotes:[{id:'dn1',number:'BL-1',lines:[{label:'Ardoise',received:100}]}],
  recurringCharges:[{id:'charge-1',label:'Leasing',amount:850}],
  accessAssignments:{'person:1':{profile:'Ouvrier'}},
  partners:[{id:'partner-secret',email:'cabinet@example.test'}],
  partnerRequests:[{id:'request-secret'}],
  documentArchives:{secret:true},
  futureSecret:{token:'must-never-leak'},
  newsItems:[{id:'news-1',title:'Info publique'}]
};

for(const [id,first,last] of [['owner','Owner','Test'],['worker','Anthony','Simon']])database.prepare('INSERT INTO profiles(id,first_name,last_name,created_at,updated_at) VALUES(?,?,?,?,?)').run(id,first,last,stamp,stamp);
database.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run('org','BatiNova','BatiNova','BE','EUR',stamp,stamp);
database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-owner','org','OWNER','Propriétaire',stamp);
database.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run('role-worker','org','WORKER','Ouvrier',stamp);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('m-owner','org','owner','role-owner','active',stamp,stamp,stamp);
database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run('m-worker','org','worker','role-worker','active',stamp,stamp,stamp);
database.prepare('INSERT INTO workspace_state(user_id,payload,revision,updated_at) VALUES(?,?,?,?)').run('owner',JSON.stringify(state),1,stamp);
for(const permission of ['workspace.view','projects.view.assigned','assets.view'])database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker',permission);
database.prepare('INSERT INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run('org','worker','1','owner',stamp);

const call=(uid,path='/api/state')=>worker.fetch(new Request('https://socle.test'+path,{headers:{'oai-authenticated-user-id':uid,'x-socle-organization-id':'org','origin':'https://socle.test'}}),env);
let response=await call('worker');assert.equal(response.status,200);let payload=await response.json();const limited=payload.state;
assert.deepEqual(limited.jobs.map(job=>job.id),[1],'Seul le chantier autorisé est renvoyé');
assert.deepEqual(limited.assignments.map(item=>item.job),[1],'Les affectations hors périmètre sont retirées');
assert.deepEqual(limited.quotes.map(item=>item.id),[1],'Les devis hors périmètre sont retirés');
assert.equal(limited.quotes[0].lines[0].price,undefined,'Le prix unitaire est retiré sans permission prix');
assert.equal(limited.quotes[0].amount,undefined,'Le montant du devis est retiré sans permission prix');
assert.equal(limited.quotes[0].total,undefined,'Le total du devis est retiré sans permission prix');
assert.equal(limited.quotes[0].lines[0].qty,100,'Les quantités restent disponibles pour la fiche terrain');
assert.equal(limited.quotes[0].lines[0].vat,6,'Le taux de TVA non monétaire reste disponible');
assert.equal(limited.jobs[0].finance,undefined,'Les coûts chantier sont retirés sans permission marge');
assert.equal(limited.people[0].employment,undefined,'Les données RH sont retirées sans permission RH');
assert.equal(limited.company.bank,undefined,'Les paramètres complets société sont retirés');
assert.equal(limited.accountingData,undefined,'La comptabilité est absente sans permission');
assert.deepEqual(limited.reminders.map(item=>item.id),['r-job'],'Seuls les rappels liés au périmètre chantier sont conservés');
assert.equal(limited.tasks.length,0,'Les anciennes tâches globales ne sont pas divulguées');
assert.equal(limited.dossiers.length,0,'Les anciens dossiers globaux ne sont pas divulgués');
assert.equal(limited.accessAssignments,undefined,'La configuration des droits frontend n’est pas divulguée');
assert.equal(limited.partners,undefined,'Les partenaires ne sont pas divulgués par défaut');
assert.equal(limited.partnerRequests,undefined,'Les demandes partenaires ne sont pas divulguées par défaut');
assert.equal(limited.documentArchives,undefined,'Les métadonnées documentaires globales ne sont pas divulguées');
assert.equal(limited.futureSecret,undefined,'Une nouvelle clé inconnue reste privée par défaut');
assert.equal(limited.stockItems,undefined,'Le stock n’est pas renvoyé sans permission stock');
assert.equal(limited.purchaseOrders,undefined,'Les commandes ne sont pas renvoyées sans permission livraison');
assert.equal(limited.recurringCharges,undefined,'Les charges récurrentes ne sont pas renvoyées sans permission comptable');
assert.equal(limited.assets[0].monthly,undefined,'Les coûts de leasing sont retirés des biens terrain');
assert.equal(limited.assets[0].purchasePrice,undefined,'Le prix d’achat est retiré des biens terrain');
assert.equal(limited.assets[0].name,'Camionnette','Le bien reste identifiable avec assets.view');
assert.deepEqual(limited.newsItems.map(item=>item.id),['news-1'],'Les actualités non sensibles explicitement autorisées restent visibles');

// Un WORKER reste sans prix même si quotes.prices.view lui est accordé par erreur.
database.prepare('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)').run('role-worker','quotes.prices.view');
response=await call('worker');payload=await response.json();assert.equal(payload.state.quotes[0].lines[0].price,undefined,'WORKER reste sans prix même avec quotes.prices.view');assert.equal(payload.state.priceCatalog,undefined,'WORKER ne reçoit jamais le catalogue tarifaire');assert.equal(payload.state.futureSecret,undefined,'La liste blanche reste active avec le droit prix accidentel');

// Le propriétaire conserve exactement l’état complet historique.
response=await call('owner');payload=await response.json();assert.equal(payload.state.futureSecret.token,'must-never-leak');assert.equal(payload.state.quotes[0].lines[0].price,125);assert.ok(payload.state.accessAssignments);

console.log('security-hardening-15: 33 assertions réussies');
