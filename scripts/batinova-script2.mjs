import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const dataDirectory=join(root,'data');
mkdirSync(dataDirectory,{recursive:true});
const databasePath=join(dataDirectory,'socle.sqlite');
const database=new DatabaseSync(databasePath);
database.exec('PRAGMA foreign_keys=ON');
database.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)');
for(const name of readdirSync(join(root,'drizzle')).filter(name=>/^\d+.*\.sql$/.test(name)).sort()){
  if(database.prepare('SELECT 1 FROM local_migrations WHERE name=?').get(name))continue;
  database.exec('BEGIN');
  try{database.exec(readFileSync(join(root,'drizzle',name),'utf8'));database.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);database.exec('COMMIT')}
  catch(error){database.exec('ROLLBACK');throw error}
}

if(process.argv.includes('--migrate-only')){
  const workspaceCount=Number(database.prepare("SELECT COUNT(*) c FROM organization_workspace_state").get()?.c||0);
  console.log('BATINOVA_SCRIPT_2_MIGRATIONS=PASS');
  console.log(JSON.stringify({workspaceCount,migrations:Number(database.prepare('SELECT COUNT(*) c FROM local_migrations').get()?.c||0)}));
  database.close();
  process.exit(0);
}

const organizationId='org-local-owner';
const scriptCode='BATINOVA_SCRIPT_2';
const scriptVersion=2;
const workspaceRow=database.prepare('SELECT payload,revision FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
if(!workspaceRow)throw Error('BatiNova introuvable dans organization_workspace_state. Lancez d’abord SOCLE local sur la base BatiNova.');
const initialState=JSON.parse(workspaceRow.payload);
if(!/BatiNova/i.test(initialState.company?.name||''))throw Error('La base locale active ne correspond pas à BatiNova.');

const already=database.prepare('SELECT applied_at,summary_json FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=?').get(organizationId,scriptCode,scriptVersion);
if(already){console.log('Script n°2 déjà appliqué : '+already.applied_at);console.log(already.summary_json);process.exit(0)}

const stamp=()=>new Date().toISOString();
function ensureIdentity({id,name,email,role,roleId,permissions=[],projects=[]}){
  const state=JSON.parse(database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId).payload),person=(state.people||[]).find(item=>item.name===name);
  if(!person)throw Error('Personne BatiNova introuvable : '+name);
  const [firstName,...last]=name.split(' ');
  database.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name,last_name=excluded.last_name,email=excluded.email,updated_at=excluded.updated_at').run(id,firstName,last.join(' '),email,stamp(),stamp());
  database.prepare('INSERT OR IGNORE INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)').run(roleId,organizationId,role,role,stamp());
  database.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at,person_id) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role_id=excluded.role_id,status=excluded.status,updated_at=excluded.updated_at,person_id=excluded.person_id').run('member-'+id,organizationId,id,roleId,'active',stamp(),stamp(),stamp(),String(person.id));
  for(const permission of permissions)database.prepare('INSERT OR IGNORE INTO role_permissions(role_id,permission_code) VALUES(?,?)').run(roleId,permission);
  for(const projectId of projects)database.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)').run(organizationId,id,String(projectId),'local-owner',stamp());
  return person;
}
const owner={id:'local-owner',name:'Marc Delcourt'};
const julien=ensureIdentity({id:'test-julien',name:'Julien Lambert',email:'julien.lambert@batinova.example',role:'TEAM_LEAD',roleId:'role-team-lead-local-owner',permissions:['workspace.view','projects.view.assigned','tasks.view.assigned','tasks.manage.project','tasks.comment.create','time_entries.view.own','time_entries.create.own','time_entries.view.team','time_entries.create.team','time_entries.view.all','time_entries.correction.request','time_entries.correction.review','project_materials.create','project_execution.edit','project_notes.create','planning.assignments.manage','fuel.create','asset_issues.create','messages.view','messages.send'],projects:[]});
const alex=ensureIdentity({id:'test-alex',name:'Alex Marchal',email:'alex.marchal@batinova.example',role:'TEAM_LEAD',roleId:'role-team-lead-local-owner',permissions:[],projects:[]});
const anthony=ensureIdentity({id:'test-anthony',name:'Anthony Simon',email:'anthony.simon@batinova.example',role:'WORKER',roleId:'role-worker-local-owner',permissions:['workspace.view','projects.view.assigned','time_entries.view.own','time_entries.create.own','time_entries.correction.request','tasks.view.assigned','tasks.update.assigned','tasks.comment.create','assets.view','fuel.create','asset_issues.create','project_materials.create','project_notes.create','documents.view.assigned','messages.view','messages.send'],projects:[]});
const procurementActor=owner.id; // Les achats/stock restent sous autorité OWNER; Alex reste demandeur métier.

const env={DB:{
  prepare(sql){let values=[];return{_sql:sql,get _values(){return values},bind(...args){values=args;return this},async first(){return database.prepare(sql).get(...values)??null},async all(){return{results:database.prepare(sql).all(...values)}},async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}}},
  async batch(statements){database.exec('BEGIN IMMEDIATE');try{const out=[];for(const statement of statements){const result=database.prepare(statement._sql).run(...statement._values);out.push({meta:{changes:Number(result.changes)}})}database.exec('COMMIT');return out}catch(error){database.exec('ROLLBACK');throw error}}
}};
const {default:worker}=await import('../worker/index.js');
async function api(uid,method,path,payload){
  const headers={'oai-authenticated-user-id':uid,'x-socle-organization-id':organizationId,'origin':'https://socle.simulation'};
  if(payload!==undefined)headers['content-type']='application/json';
  const response=await worker.fetch(new Request('https://socle.simulation'+path,{method,headers,...(payload!==undefined?{body:JSON.stringify(payload)}:{})}),env);
  let body={};try{body=await response.json()}catch{}
  if(!response.ok)throw Error(method+' '+path+' → '+response.status+' '+(body.error||''));
  return body;
}
await api(owner.id,'POST','/api/legacy-upgrade',{domains:['invoices','time_entries','field_data','hr']});

let ownerState=await api(owner.id,'GET','/api/state'),state=ownerState.state;
const jobs=state.jobs||[],projectA=jobs.find(job=>String(job.id)==='1')||jobs[0],projectB=jobs.find(job=>String(job.id)!==String(projectA.id))||projectA;
if(!projectA)throw Error('Aucun chantier BatiNova disponible.');

function resetSimulationProjectAccess(userId,projectIds){
  database.prepare('DELETE FROM project_access WHERE organization_id=? AND user_id=?').run(organizationId,userId);
  for(const projectId of [...new Set(projectIds.filter(Boolean).map(String))]){
    database.prepare('INSERT OR IGNORE INTO project_access(organization_id,user_id,project_id,granted_by,created_at) VALUES(?,?,?,?,?)')
      .run(organizationId,userId,projectId,owner.id,stamp());
  }
}
resetSimulationProjectAccess('test-julien',[projectA.id,jobs[3]?.id||projectB.id]);
resetSimulationProjectAccess('test-alex',jobs.slice(0,5).map(job=>job.id));
resetSimulationProjectAccess('test-anthony',[projectA.id]);

const teams=(state.teams||[]).slice(0,4);
if(teams.length<4)throw Error('Le Script n°2 attend les 4 équipes BatiNova.');
const anthonyTeam=teams.find(item=>(item.members||[]).map(String).includes(String(anthony.id)));
if(!anthonyTeam)throw Error('Équipe d’Anthony Simon introuvable.');
const anthonyTeamIndex=teams.findIndex(item=>String(item.id)===String(anthonyTeam.id));

function weekdays(from,to){
  const out=[];for(let d=new Date(from+'T12:00:00Z'),end=new Date(to+'T12:00:00Z');d<=end;d.setUTCDate(d.getUTCDate()+1)){const day=d.getUTCDay();if(day!==0&&day!==6)out.push(d.toISOString().slice(0,10))}return out;
}
const teamIds=new Set(teams.map(team=>String(team.id))),simulationPeople=new Set(teams.flatMap(team=>(team.members||[]).map(String)));
const assignmentRows=database.prepare('SELECT assignment_date,team_id,people_json,subcontractor FROM field_assignments WHERE organization_id=?').all(organizationId);
const dates=weekdays('2026-07-01','2026-09-28').filter(date=>!assignmentRows.some(row=>row.assignment_date===date&&row.subcontractor!=='SIM2'&&(teamIds.has(String(row.team_id))||JSON.parse(row.people_json||'[]').map(String).some(id=>simulationPeople.has(id))))).slice(-10);
if(dates.length<10)throw Error('Impossible de trouver 10 jours ouvrés libres pour les 4 équipes BatiNova.');

for(let dayIndex=0;dayIndex<dates.length;dayIndex++){
  const date=dates[dayIndex];
  for(let teamIndex=0;teamIndex<teams.length;teamIndex++){
    const team=teams[teamIndex],people=(team.members||[]).map(String);
    if(!people.length)continue;
    let project=jobs[(teamIndex+Math.floor(dayIndex/2))%jobs.length];
    if(dayIndex===2&&teamIndex===anthonyTeamIndex)project=projectA;
    const marker='SIM2-J'+String(dayIndex+1).padStart(2,'0')+'-T'+String(teamIndex+1).padStart(2,'0');

    if(!database.prepare('SELECT 1 FROM field_assignments WHERE organization_id=? AND assignment_date=? AND project_id=? AND team_id=?').get(organizationId,date,String(project.id),String(team.id))){
      await api(owner.id,'POST','/api/assignments',{projectId:String(project.id),teamId:String(team.id),date,people,vehicleId:null,packId:null,subcontractor:'SIM2'});
    }

    let existingEntries=database.prepare('SELECT id,departure,people_json FROM time_entries WHERE organization_id=? AND project_id=? AND team_id=? AND work_date=? AND note=?').all(organizationId,String(project.id),String(team.id),date,marker);
    if(!existingEntries.length){
      const standardArrival=['07:20','07:25','07:30','07:35'][teamIndex]||'07:30';
      const arrival=dayIndex===2&&teamIndex===anthonyTeamIndex?'07:42':standardArrival;
      const created=await api(owner.id,'POST','/api/time-entries/arrival',{projectId:String(project.id),teamId:String(team.id),date,people:people.map(personId=>({personId,arrival})),note:marker});
      existingEntries=(created.ids||[]).map(entryId=>database.prepare('SELECT id,departure,people_json FROM time_entries WHERE id=?').get(entryId)).filter(Boolean);
    }
    const departure=(dayIndex===7&&teamIndex===1)?'15:35':(dayIndex===9?'15:55':'16:05');
    for(const entry of existingEntries){
      if(entry.departure)continue;
      const persons=JSON.parse(entry.people_json||'[]');
      await api(owner.id,'POST','/api/time-entries/'+encodeURIComponent(entry.id)+'/departure',{departure,personIds:persons,note:'SIM2 · fin de journée'});
    }
  }
}

const correctionDay=dates[2],correctionMarker='SIM2-J03-T'+String(anthonyTeamIndex+1).padStart(2,'0');
const correctionEntry=database.prepare('SELECT id,departure FROM time_entries WHERE organization_id=? AND work_date=? AND team_id=? AND note LIKE ? AND people_json LIKE ? LIMIT 1').get(organizationId,correctionDay,String(anthonyTeam.id),correctionMarker+'%','%"'+String(anthony.id)+'"%');
if(correctionEntry&&!database.prepare('SELECT 1 FROM time_entry_corrections WHERE organization_id=? AND time_entry_id=? AND person_id=?').get(organizationId,correctionEntry.id,String(anthony.id))){
  const correction=await api('test-anthony','POST','/api/time-entries/'+encodeURIComponent(correctionEntry.id)+'/corrections',{personId:String(anthony.id),arrival:'07:32',departure:correctionEntry.departure||'16:05',reason:'SIM2 · heure d’arrivée corrigée après vérification chantier'});
  await api(owner.id,'POST','/api/time-entry-corrections/'+encodeURIComponent(correction.id)+'/review',{approved:true});
}

const taskSpecs=[
  ['[SIM2] Réceptionner la commande couverture','Contrôler quantités et état à la livraison','high'],
  ['[SIM2] Terminer les rives du versant rue','Vérifier finition et photos avant départ','normal'],
  ['[SIM2] Signaler le matériel à contrôler','Faire remonter le problème au responsable matériel','normal']
];
for(const [title,description,priority] of taskSpecs){
  if(!database.prepare('SELECT 1 FROM project_tasks WHERE organization_id=? AND project_id=? AND title=?').get(organizationId,String(projectA.id),title)){
    await api('test-julien','POST','/api/projects/'+encodeURIComponent(projectA.id)+'/tasks',{title,description,priority,assignedTo:'test-anthony'});
  }
}
for(const title of [taskSpecs[0][0],taskSpecs[1][0]]){
  const task=database.prepare('SELECT id,status FROM project_tasks WHERE organization_id=? AND title=?').get(organizationId,title);
  if(task?.status==='todo')await api('test-anthony','PATCH','/api/tasks/'+encodeURIComponent(task.id),{status:'in_progress'});
  const refreshed=database.prepare('SELECT id,status FROM project_tasks WHERE id=?').get(task.id);
  if(refreshed?.status==='in_progress')await api('test-anthony','PATCH','/api/tasks/'+encodeURIComponent(task.id),{status:'done'});
}

const notes=[
  ['test-julien','Retard partiel du fournisseur : livraison principale attendue avec reliquat.'],
  ['test-anthony','Client demande de vérifier la finition de rive côté rue avant réception.'],
  ['test-julien','Météo changeante : organisation adaptée pour terminer les zones ouvertes en priorité.']
];
for(const [uid,text] of notes)if(!database.prepare('SELECT 1 FROM field_project_notes WHERE organization_id=? AND project_id=? AND body=?').get(organizationId,String(projectA.id),'SIM2 · '+text))await api(uid,'POST','/api/projects/'+encodeURIComponent(projectA.id)+'/notes',{visibility:'Équipe et patron',text:'SIM2 · '+text,photoName:''});

ownerState=await api(owner.id,'GET','/api/state');state=ownerState.state;
const supplierContacts=(state.contacts||[]).filter(contact=>(contact.roles||[]).includes('Fournisseur'));
const supplierA=supplierContacts[0],supplierB=supplierContacts[1]||supplierA;
if(!supplierA)throw Error('Aucun fournisseur BatiNova disponible pour la simulation.');
const order1=(await api(procurementActor,'POST','/api/purchase-orders',{number:'BC-SIM2-001',supplierId:String(supplierA.id),date:dates[2],expectedDate:dates[4],projectId:String(projectA.id),requester:'Alex Marchal',status:'commandée',operationKey:'sim2-purchase-order-001',lines:[
  {reference:'SIM2-ZINC-01',label:'Zinc quartz 0,8 mm',quantity:20,unit:'feuille',unitPrice:85,vatRate:21},
  {reference:'SIM2-LATTE-01',label:'Liteaux traités',quantity:100,unit:'pièce',unitPrice:18,vatRate:21}
]})).order;
const order2=(await api(procurementActor,'POST','/api/purchase-orders',{number:'BC-SIM2-002',supplierId:String((supplierB||supplierA).id),date:dates[5],expectedDate:dates[7],projectId:String(projectA.id),requester:'Alex Marchal',status:'commandée',operationKey:'sim2-purchase-order-002',lines:[
  {reference:'SIM2-ISO-01',label:'Isolation toiture 120 mm',quantity:30,unit:'paquet',unitPrice:60,vatRate:21}
]})).order;
const orderStock=(await api(procurementActor,'POST','/api/purchase-orders',{number:'BC-SIM2-STOCK-001',supplierId:String(supplierA.id),date:dates[3],expectedDate:dates[5],requester:'Alex Marchal',status:'commandée',operationKey:'sim2-purchase-order-stock-001',lines:[
  {reference:'SIM2-STOCK-MEM-01',label:'Membrane sous-toiture stock dépôt',quantity:100,unit:'rouleau',unitPrice:30,vatRate:21}
]})).order;
const orderVariance=(await api(procurementActor,'POST','/api/purchase-orders',{number:'BC-SIM2-VAR-001',supplierId:String((supplierB||supplierA).id),date:dates[4],expectedDate:dates[6],projectId:String(projectA.id),requester:'Alex Marchal',status:'commandée',operationKey:'sim2-purchase-order-var-001',lines:[
  {reference:'SIM2-FIX-01',label:'Fixations spéciales chantier',quantity:10,unit:'boîte',unitPrice:50,vatRate:21}
]})).order;
const orderCancelled=(await api(procurementActor,'POST','/api/purchase-orders',{number:'BC-SIM2-CANCEL-001',supplierId:String(supplierA.id),date:dates[4],expectedDate:dates[8],requester:'Alex Marchal',status:'commandée',operationKey:'sim2-purchase-order-cancel-001',lines:[
  {reference:'SIM2-CANCEL-01',label:'Commande de simulation annulée',quantity:5,unit:'pièce',unitPrice:40,vatRate:21}
]})).order;
await api(procurementActor,'POST','/api/purchase-orders/'+encodeURIComponent(orderCancelled.id)+'/cancel',{reason:'SIM2 · besoin annulé avant réception'});

let locations=await api(procurementActor,'GET','/api/stock-locations');
let depot=locations.locations.find(item=>item.name==='Dépôt principal');
if(!depot){const created=await api(procurementActor,'POST','/api/stock-locations',{name:'Dépôt principal',type:'warehouse'});locations=await api(procurementActor,'GET','/api/stock-locations');depot=locations.locations.find(item=>item.id===created.id)}
if(!depot)throw Error('Dépôt principal introuvable.');

await api(procurementActor,'POST','/api/purchase-orders/'+encodeURIComponent(order1.id)+'/deliveries',{number:'BL-SIM2-001-A',date:dates[4],comment:'Livraison partielle, reliquat zinc annoncé.',fileName:'SIMULATION-BL-SIM2-001-A.pdf',locationId:depot.id,operationKey:'sim2-delivery-001-a',lines:[
  {orderLineId:order1.lines[0].id,received:12,condition:'Reliquat',stock:true},
  {orderLineId:order1.lines[1].id,received:100,condition:'Conforme',stock:true}
]});
await api(procurementActor,'POST','/api/purchase-orders/'+encodeURIComponent(order1.id)+'/deliveries',{number:'BL-SIM2-001-B',date:dates[6],comment:'Reliquat zinc reçu.',fileName:'SIMULATION-BL-SIM2-001-B.pdf',locationId:depot.id,operationKey:'sim2-delivery-001-b',lines:[
  {orderLineId:order1.lines[0].id,received:8,condition:'Conforme',stock:true}
]});
await api(procurementActor,'POST','/api/purchase-orders/'+encodeURIComponent(order2.id)+'/deliveries',{number:'BL-SIM2-002',date:dates[7],comment:'Livraison complète isolation.',fileName:'SIMULATION-BL-SIM2-002.pdf',locationId:depot.id,operationKey:'sim2-delivery-002',lines:[
  {orderLineId:order2.lines[0].id,received:30,condition:'Conforme',stock:true}
]});
await api(procurementActor,'POST','/api/purchase-orders/'+encodeURIComponent(orderStock.id)+'/deliveries',{number:'BL-SIM2-STOCK-001',date:dates[5],comment:'Réassort dépôt sans chantier.',fileName:'SIMULATION-BL-SIM2-STOCK-001.pdf',locationId:depot.id,operationKey:'sim2-delivery-stock-001',lines:[
  {orderLineId:orderStock.lines[0].id,received:100,condition:'Conforme',stock:true}
]});
await api(procurementActor,'POST','/api/purchase-orders/'+encodeURIComponent(orderVariance.id)+'/deliveries',{number:'BL-SIM2-VAR-001',date:dates[6],comment:'Livraison complète, facture avec écart ultérieur.',fileName:'SIMULATION-BL-SIM2-VAR-001.pdf',operationKey:'sim2-delivery-var-001',lines:[
  {orderLineId:orderVariance.lines[0].id,received:10,condition:'Conforme',stock:false}
]});

let field=await api(procurementActor,'GET','/api/field-data');
const zinc=field.stockItems.find(item=>item.reference==='SIM2-ZINC-01'),lattes=field.stockItems.find(item=>item.reference==='SIM2-LATTE-01'),isolant=field.stockItems.find(item=>item.reference==='SIM2-ISO-01');
if(zinc&&!database.prepare("SELECT 1 FROM field_stock_movements WHERE organization_id=? AND idempotency_key='sim2-move-zinc'").get(organizationId))await api(procurementActor,'POST','/api/stock-items/'+encodeURIComponent(zinc.id)+'/movements',{type:'sortie chantier',quantity:14,date:dates[8],projectId:String(projectA.id),reason:'SIM2 · zinc utilisé sur rives et finitions',reference:'CH-'+String(projectA.reference||projectA.id),sourceLocationId:depot.id,destinationLocationId:null,operationKey:'sim2-move-zinc'});
if(lattes&&!database.prepare("SELECT 1 FROM field_stock_movements WHERE organization_id=? AND idempotency_key='sim2-move-lattes'").get(organizationId))await api(procurementActor,'POST','/api/stock-items/'+encodeURIComponent(lattes.id)+'/movements',{type:'sortie chantier',quantity:65,date:dates[5],projectId:String(projectA.id),reason:'SIM2 · pose du lattage versant principal',reference:'CH-'+String(projectA.reference||projectA.id),sourceLocationId:depot.id,destinationLocationId:null,operationKey:'sim2-move-lattes'});
if(isolant&&!database.prepare("SELECT 1 FROM field_stock_movements WHERE organization_id=? AND idempotency_key='sim2-move-isolant'").get(organizationId))await api(procurementActor,'POST','/api/stock-items/'+encodeURIComponent(isolant.id)+'/movements',{type:'sortie chantier',quantity:18,date:dates[9],projectId:String(projectA.id),reason:'SIM2 · isolation consommée sur chantier',reference:'CH-'+String(projectA.reference||projectA.id),sourceLocationId:depot.id,destinationLocationId:null,operationKey:'sim2-move-isolant'});
const membrane=field.stockItems.find(item=>item.reference==='SIM2-STOCK-MEM-01');
if(!membrane)throw Error('Article de réassort SIM2-STOCK-MEM-01 introuvable après livraison.');
if(!database.prepare("SELECT 1 FROM field_stock_movements WHERE organization_id=? AND idempotency_key='sim2-move-stock-membrane'").get(organizationId))await api(procurementActor,'POST','/api/stock-items/'+encodeURIComponent(membrane.id)+'/movements',{type:'sortie chantier',quantity:20,date:dates[8],projectId:String(projectA.id),reason:'SIM2 · consommation depuis stock de dépôt',reference:'CH-'+String(projectA.reference||projectA.id),sourceLocationId:depot.id,destinationLocationId:null,operationKey:'sim2-move-stock-membrane'});

const delivery1Link=database.prepare("SELECT id FROM field_delivery_notes WHERE organization_id=? AND order_id=? AND number='BL-SIM2-001-B' LIMIT 1").get(organizationId,String(order1.id));
const delivery2Link=database.prepare("SELECT id FROM field_delivery_notes WHERE organization_id=? AND order_id=? AND number='BL-SIM2-002' LIMIT 1").get(organizationId,String(order2.id));
const deliveryStockLink=database.prepare("SELECT id FROM field_delivery_notes WHERE organization_id=? AND order_id=? AND number='BL-SIM2-STOCK-001' LIMIT 1").get(organizationId,String(orderStock.id));
const deliveryVarianceLink=database.prepare("SELECT id FROM field_delivery_notes WHERE organization_id=? AND order_id=? AND number='BL-SIM2-VAR-001' LIMIT 1").get(organizationId,String(orderVariance.id));
const supplierList=await api(owner.id,'GET','/api/suppliers'),serverSupplier=supplierList.suppliers?.[0]||null;
async function ensureExpense(spec){return (await api(owner.id,'POST','/api/expenses',spec)).id}
const expense1=await ensureExpense({supplierId:serverSupplier?.id||null,supplierReference:'FF-SIM2-001',projectId:null,purchaseOrderId:String(order1.id),deliveryNoteId:delivery1Link?.id||null,category:'materials',description:'SIM2 · facture zinc et liteaux liée à BC-SIM2-001',expenseDate:dates[6],total:4235,vatAmount:735,paymentStatus:'unpaid',paymentDate:null,documentName:'SIMULATION-FF-SIM2-001.pdf',operationKey:'sim2-expense-001'});
const expense2=await ensureExpense({supplierId:serverSupplier?.id||null,supplierReference:'FF-SIM2-002',projectId:String(projectA.id),purchaseOrderId:String(order2.id),deliveryNoteId:delivery2Link?.id||null,category:'materials',description:'SIM2 · facture isolation liée à BC-SIM2-002',expenseDate:dates[8],total:2178,vatAmount:378,paymentStatus:'paid',paymentDate:dates[9],documentName:'SIMULATION-FF-SIM2-002.pdf',operationKey:'sim2-expense-002'});
const expenseStock=await ensureExpense({supplierId:serverSupplier?.id||null,supplierReference:'FF-SIM2-STOCK-001',projectId:null,purchaseOrderId:String(orderStock.id),deliveryNoteId:deliveryStockLink?.id||null,category:'materials',description:'SIM2 · réassort stock dépôt sans chantier',expenseDate:dates[6],dueDate:'2026-10-20',total:3630,vatAmount:630,vatRate:21,paymentStatus:'unpaid',documentName:'SIMULATION-FF-SIM2-STOCK-001.pdf',operationKey:'sim2-expense-stock-001'});
const expenseVariance=await ensureExpense({supplierId:serverSupplier?.id||null,supplierReference:'FF-SIM2-VAR-001',projectId:String(projectA.id),purchaseOrderId:String(orderVariance.id),deliveryNoteId:deliveryVarianceLink?.id||null,category:'materials',description:'SIM2 · facture avec écart +20 EUR HT vs commande',expenseDate:dates[7],dueDate:'2026-09-20',total:629.20,vatAmount:109.20,vatRate:21,paymentStatus:'unpaid',documentName:'SIMULATION-FF-SIM2-VAR-001.pdf',operationKey:'sim2-expense-var-001'});
const expenseNoOrder=await ensureExpense({supplierId:serverSupplier?.id||null,supplierReference:'FF-SIM2-SANS-BC-001',projectId:String(projectA.id),category:'other',description:'SIM2 · petite facture fournisseur sans commande préalable',expenseDate:dates[7],dueDate:'2026-10-15',total:242,vatAmount:42,vatRate:21,paymentStatus:'unpaid',documentName:'SIMULATION-FF-SIM2-SANS-BC-001.pdf',operationKey:'sim2-expense-no-order-001'});

if(!database.prepare("SELECT 1 FROM supplier_allocations WHERE organization_id=? AND idempotency_key='sim2-allocation-a'").get(organizationId))await api(owner.id,'POST','/api/expenses/'+encodeURIComponent(expense1)+'/allocations',{destinationType:'project',destinationId:String(projectA.id),amountCents:220000,label:'Couverture et zinguerie',note:'SIM2 · part principale chantier',reference:'BC-SIM2-001',operationKey:'sim2-allocation-a'});
if(projectB&&String(projectB.id)!==String(projectA.id)&&!database.prepare("SELECT 1 FROM supplier_allocations WHERE organization_id=? AND idempotency_key='sim2-allocation-b'").get(organizationId))await api(owner.id,'POST','/api/expenses/'+encodeURIComponent(expense1)+'/allocations',{destinationType:'project',destinationId:String(projectB.id),amountCents:130000,label:'Matériaux répartis second chantier',note:'SIM2 · ventilation multi-chantier',reference:'BC-SIM2-001',operationKey:'sim2-allocation-b'});
if(!database.prepare("SELECT 1 FROM supplier_allocations WHERE organization_id=? AND idempotency_key='sim2-allocation-stock'").get(organizationId))await api(owner.id,'POST','/api/expenses/'+encodeURIComponent(expenseStock)+'/allocations',{destinationType:'stock',destinationId:null,amountCents:300000,label:'Réassort stock dépôt',note:'SIM2 · coût conservé en stock jusqu’à consommation chantier',reference:'BC-SIM2-STOCK-001',operationKey:'sim2-allocation-stock'});
if(!database.prepare("SELECT 1 FROM supplier_allocations WHERE organization_id=? AND idempotency_key='sim2-allocation-var'").get(organizationId))await api(owner.id,'POST','/api/expenses/'+encodeURIComponent(expenseVariance)+'/allocations',{destinationType:'project',destinationId:String(projectA.id),amountCents:52000,label:'Fixations spéciales',note:'SIM2 · facture 20 EUR HT au-dessus de la commande',reference:'BC-SIM2-VAR-001',operationKey:'sim2-allocation-var'});
if(!database.prepare("SELECT 1 FROM supplier_allocations WHERE organization_id=? AND idempotency_key='sim2-allocation-no-order'").get(organizationId))await api(owner.id,'POST','/api/expenses/'+encodeURIComponent(expenseNoOrder)+'/allocations',{destinationType:'project',destinationId:String(projectA.id),amountCents:20000,label:'Achat direct sans commande',note:'SIM2 · dépense ponctuelle hors processus commande',reference:'FF-SIM2-SANS-BC-001',operationKey:'sim2-allocation-no-order'});

// Rapprochements facture → ventilation projet → commande → livraison.
const allocationA=database.prepare("SELECT id FROM supplier_allocations WHERE organization_id=? AND idempotency_key='sim2-allocation-a'").get(organizationId);
const delivery1Line=database.prepare("SELECT dl.id FROM field_delivery_lines dl JOIN field_delivery_notes dn ON dn.id=dl.delivery_note_id WHERE dl.organization_id=? AND dn.id=? AND dl.order_line_id=? LIMIT 1").get(organizationId,delivery1Link?.id||'',String(order1.lines[0].id));
if(allocationA&&delivery1Link&&delivery1Line&&!database.prepare("SELECT 1 FROM supplier_invoice_matches WHERE organization_id=? AND operation_key='sim2-match-expense1-zinc'").get(organizationId))await api(owner.id,'POST','/api/supplier-invoices/'+encodeURIComponent(expense1)+'/matches',{allocationId:allocationA.id,projectId:String(projectA.id),orderId:String(order1.id),orderLineId:String(order1.lines[0].id),deliveryNoteId:delivery1Link.id,deliveryLineId:delivery1Line.id,matchedCents:68000,matchedQuantityMilli:8000,operationKey:'sim2-match-expense1-zinc'});
const allocationVar=database.prepare("SELECT id FROM supplier_allocations WHERE organization_id=? AND idempotency_key='sim2-allocation-var'").get(organizationId);
const deliveryVarLine=database.prepare("SELECT dl.id FROM field_delivery_lines dl JOIN field_delivery_notes dn ON dn.id=dl.delivery_note_id WHERE dl.organization_id=? AND dn.id=? AND dl.order_line_id=? LIMIT 1").get(organizationId,deliveryVarianceLink?.id||'',String(orderVariance.lines[0].id));
if(allocationVar&&deliveryVarianceLink&&deliveryVarLine&&!database.prepare("SELECT 1 FROM supplier_invoice_matches WHERE organization_id=? AND operation_key='sim2-match-var'").get(organizationId))await api(owner.id,'POST','/api/supplier-invoices/'+encodeURIComponent(expenseVariance)+'/matches',{allocationId:allocationVar.id,projectId:String(projectA.id),orderId:String(orderVariance.id),orderLineId:String(orderVariance.lines[0].id),deliveryNoteId:deliveryVarianceLink.id,deliveryLineId:deliveryVarLine.id,matchedCents:50000,matchedQuantityMilli:10000,operationKey:'sim2-match-var'});

// Paiements fournisseur: complet, partiel et factures restant impayées/échues.
if(!database.prepare("SELECT 1 FROM supplier_payments WHERE organization_id=? AND idempotency_key='sim2-supplier-payment-expense1'").get(organizationId))await api(owner.id,'POST','/api/expenses/'+encodeURIComponent(expense1)+'/payments',{amountCents:423500,paymentDate:dates[9],paymentMethod:'bank_transfer',reference:'VIR-FF-SIM2-001',note:'SIM2 · règlement complet fournisseur',operationKey:'sim2-supplier-payment-expense1'});
if(!database.prepare("SELECT 1 FROM supplier_payments WHERE organization_id=? AND idempotency_key='sim2-supplier-payment-stock-partial'").get(organizationId))await api(owner.id,'POST','/api/expenses/'+encodeURIComponent(expenseStock)+'/payments',{amountCents:100000,paymentDate:dates[9],paymentMethod:'bank_transfer',reference:'VIR-FF-SIM2-STOCK-001-A',note:'SIM2 · acompte fournisseur stock',operationKey:'sim2-supplier-payment-stock-partial'});

field=await api(procurementActor,'GET','/api/field-data');
const vehicle=field.assets.find(asset=>asset.group==='vehicles'),issueAsset=field.assets.find(asset=>asset.group!=='vehicles')||vehicle;
if(vehicle&&!database.prepare("SELECT 1 FROM field_fuel_entries WHERE organization_id=? AND asset_id=? AND pump_name='SIM2'").get(organizationId,String(vehicle.id)))await api(procurementActor,'POST','/api/assets/'+encodeURIComponent(vehicle.id)+'/fuel',{date:dates[5],odometer:Number(vehicle.vehicle?.mileage||100000)+126,liters:52.4,total:93.84,pumpName:'SIM2',receiptName:'SIMULATION-CARBURANT.pdf'});
if(issueAsset&&!database.prepare("SELECT 1 FROM field_asset_issues WHERE organization_id=? AND asset_id=? AND description LIKE 'SIM2 %'").get(organizationId,String(issueAsset.id)))await api('test-anthony','POST','/api/assets/'+encodeURIComponent(issueAsset.id)+'/issues',{severity:'À contrôler',description:'SIM2 · bruit anormal signalé pendant l’utilisation, contrôle atelier demandé.'});

let invoice=database.prepare("SELECT id FROM invoices WHERE organization_id=? AND invoice_number='SIM2-FAC-2026-001'").get(organizationId);
if(!invoice){const created=await api(owner.id,'POST','/api/invoices',{customerId:null,projectId:String(projectA.id),invoiceNumber:'SIM2-FAC-2026-001',issueDate:dates[8],dueDate:'2026-10-15',subtotalCents:1250000,vatAmountCents:75000,notes:'SIM2 · situation d’avancement chantier '+String(projectA.reference||projectA.name)});invoice={id:created.invoice.id}}
if(!database.prepare("SELECT 1 FROM payments WHERE organization_id=? AND idempotency_key='sim2-payment-001'").get(organizationId))await api(owner.id,'POST','/api/invoices/'+encodeURIComponent(invoice.id)+'/payments',{amountCents:500000,paymentDate:dates[9],paymentMethod:'bank_transfer',reference:'VIR-SIM2-001',note:'SIM2 · acompte client',operationKey:'sim2-payment-001'});
if(!database.prepare("SELECT 1 FROM credit_notes WHERE organization_id=? AND idempotency_key='sim2-credit-001'").get(organizationId))await api(owner.id,'POST','/api/invoices/'+encodeURIComponent(invoice.id)+'/credit-notes',{amountCents:25000,creditDate:dates[9],reason:'SIM2 · correction quantité sur finition',reference:'AV-SIM2-001',note:'Avoir de simulation',operationKey:'sim2-credit-001'});

const financialForecast=await api(owner.id,'GET','/api/projects/'+encodeURIComponent(projectA.id)+'/financial-forecast');
const supplierExpenseState=await api(owner.id,'GET','/api/expenses');
const summary={
  period:{from:dates[0],to:dates.at(-1)},
  projects:[String(projectA.id),String(projectB?.id||projectA.id)],
  assignments:database.prepare("SELECT COUNT(*) count FROM field_assignments WHERE organization_id=? AND assignment_date BETWEEN ? AND ?").get(organizationId,dates[0],dates.at(-1)).count,
  timeEntries:database.prepare("SELECT COUNT(*) count FROM time_entries WHERE organization_id=? AND note LIKE 'SIM2-%'").get(organizationId).count,
  tasks:database.prepare("SELECT COUNT(*) count FROM project_tasks WHERE organization_id=? AND title LIKE '[SIM2]%'").get(organizationId).count,
  deliveries:database.prepare("SELECT COUNT(*) count FROM field_delivery_notes WHERE organization_id=? AND idempotency_key LIKE 'sim2-%'").get(organizationId).count,
  stockMovements:database.prepare("SELECT COUNT(*) count FROM field_stock_movements WHERE organization_id=? AND idempotency_key LIKE 'sim2-%'").get(organizationId).count,
  supplierExpenses:database.prepare("SELECT COUNT(*) count FROM expenses WHERE organization_id=? AND idempotency_key LIKE 'sim2-%'").get(organizationId).count,
  allocations:database.prepare("SELECT COUNT(*) count FROM supplier_allocations WHERE organization_id=? AND idempotency_key LIKE 'sim2-%'").get(organizationId).count,
  supplierPayments:database.prepare("SELECT COUNT(*) count FROM supplier_payments WHERE organization_id=? AND idempotency_key LIKE 'sim2-%'").get(organizationId).count,
  supplierMatches:database.prepare("SELECT COUNT(*) count FROM supplier_invoice_matches WHERE organization_id=? AND operation_key LIKE 'sim2-%'").get(organizationId).count,
  purchaseOrderNoProject:String(orderStock.id),
  cancelledPurchaseOrder:String(orderCancelled.id),
  overdueSupplierInvoices:(supplierExpenseState.expenses||[]).filter(item=>item.overdue).map(item=>item.supplier_reference),
  stockConsumedCents:financialForecast.realized?.stockConsumedCents||0,
  realized:financialForecast.realized||null,
  customerInvoice:'SIM2-FAC-2026-001'
};
await api(owner.id,'POST','/api/simulation-runs',{scriptCode,version:scriptVersion,summary});
console.log('BatiNova Script n°2 appliqué avec succès.');
console.log(JSON.stringify(summary,null,2));
console.log('Base locale : '+databasePath);
