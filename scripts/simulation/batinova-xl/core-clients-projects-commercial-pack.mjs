import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {id as batxlId,references as batxlReferences} from './manifest.mjs';

export const PACK_CODE='BATXL-CORE-COMMERCIAL-V1';
export const PACK_VERSION=1;
export const DEFAULT_ORGANIZATION_ID='org-local-owner';
const DEFAULT_DB=fileURLToPath(new URL('../../../data/socle.sqlite',import.meta.url));

const scenarios=JSON.parse(readFileSync(new URL('./project-scenarios-2026-09-29.json',import.meta.url),'utf8'));
const bomSource=JSON.parse(readFileSync(new URL('./bom-templates-2026-09-29.json',import.meta.url),'utf8'));
const materialSource=JSON.parse(readFileSync(new URL('./materials-catalog-2026-09-29.json',import.meta.url),'utf8'));

const bomById=new Map((bomSource.templates||[]).map(item=>[String(item.id),item]));
const materialByCode=new Map((materialSource.benchmarks||[]).map(item=>[String(item.code),item]));

function round(value,digits=2){
  const factor=10**digits;
  return Math.round((Number(value)||0)*factor)/factor;
}
function sum(values){return (Array.isArray(values)?values:[]).reduce((total,value)=>total+Number(value||0),0)}
function area(params={}){
  return Number(params.roofAreaM2||params.facadeNetAreaM2||params.wallNetAreaM2||params.insulatedAreaM2||params.repairAreaM2||params.masonryAreaM2||params.finishedSurfaceM2||0);
}
function linearFallback(params={}){
  return Number(params.gutterLengthM||params.flashingLengthM||params.ridgeLengthM||params.vergeLengthM||params.perimeterM||params.baseLengthM||params.wallLengthM||params.airTightnessPerimeterM||0);
}
function lintelCount(params={}){
  return (params.lintelSchedule||[]).reduce((total,item)=>total+Number(item?.count||0),0);
}
function quantityFor(line,params={}){
  const label=String(line.label||'').toLowerCase(),code=String(line.catalogCode||''),unit=String(line.unit||'piece');
  const a=area(params);
  if(code==='ROOF-SLATE-NAT-3222')return round(a*39.6*1.05,0);
  if(code==='ROOF-HOOK-INOX-92')return round(a*39.6*1.05,0);
  if(code==='ROOF-TILE-ACTUA-RED')return round(Number(params.roofAreaM2||a)*11.2*1.05,0);
  if(code==='ROOF-TILE-ACTUA-RIDGE')return round(Number(params.ridgeLengthM||0)*3*1.05,0);
  if(code==='ROOF-TILE-ACTUA-EDGE')return round(Number(params.vergeLengthM||0)*1.4*1.05,0);
  if(code==='WOOD-BATTEN-32X38'){
    if(params.selectedBattenSpacingMm)return round(Number(params.roofAreaM2||a)/(Number(params.selectedBattenSpacingMm)/1000)*1.07,1);
    return round(Number(params.roofAreaM2||a)*8.7*1.07,1);
  }
  if(code==='WOOD-COUNTERBATTEN-15X22')return round(Number(params.roofAreaM2||a)/Math.max(0.1,Number(params.rafterSpacingM||0.45))*1.07,1);
  if(code==='WOOD-VOLIGE-25X180')return round(Number(params.roofAreaM2||a)/Math.max(0.1,Number(params.boardEffectiveWidthM||0.18))*1.08,1);
  if(code==='FLAT-EPDM-12')return round((Number(params.roofAreaM2||a)+Number(params.upstandAreaM2||0))*1.08,1);
  if(code==='ZINC-GUTTER-ANTH-360')return round(Number(params.gutterLengthM||0)*1.07,1);
  if(code==='ZINC-GUTTER-HOOK-333')return Math.max(2,Math.ceil(Number(params.gutterLengthM||0)/Math.max(0.2,Number(params.gutterHookSpacingM||0.5)))+2);
  if(code==='ZINC-DOWNPIPE-80')return round(sum(params.downpipeHeightsM)*1.05,1);
  if(code==='MASON-ARGEX-391419')return round(Number(params.wallNetAreaM2||a)*12.5*1.05,0);
  if(code==='MASON-MORTAR-M10-25')return Math.ceil(Number(params.wallNetAreaM2||params.masonryAreaM2||a)*1.07);
  if(code==='MASON-WALLTIE-210')return round(Number(params.wallNetAreaM2||a)*Number(params.wallTieDensityPerM2||5)*1.05,0);
  if(code==='MASON-FACING-BRICK-ARTIZA'||code==='MASON-FACING-BRICK-M65-3G')return round(Number(params.wallNetAreaM2||params.masonryAreaM2||a)*Number(params.selectedFacingBrickPiecesPerM2||58)*1.07,0);
  if(code.startsWith('MASON-LINTEL-'))return Math.max(1,lintelCount(params));
  if(label.includes('avaloir')||label.includes('naissance'))return Math.max(1,Number(params.outlets||1));
  if(label.includes('manchette'))return Math.max(1,Number(params.penetrations||1));
  if(label.includes('coude'))return Math.max(2,Number(params.outlets||params.corners||1)*2);
  if(label.includes('collier'))return Math.max(2,Math.ceil(sum(params.downpipeHeightsM)/2));
  if(label.includes('chatière'))return Math.max(2,Math.ceil(Number(params.roofAreaM2||a)/80));
  if(label.includes('linteau'))return Math.max(1,lintelCount(params));
  if(label.includes('ardoises/tuiles de remplacement'))return Math.max(1,Number(params.repairUnits||10)+8);
  if(label.includes('crochets/clips/pointes'))return Math.max(1,Number(params.repairUnits||10)+8);
  if(unit==='square_metre')return round(Math.max(1,a)*1.05,1);
  if(unit==='linear_metre')return round(Math.max(1,linearFallback(params))*1.05,1);
  if(unit==='bag_25kg')return Math.max(1,Math.ceil(Math.max(1,a)/12));
  if(unit.startsWith('can_'))return Math.max(1,Math.ceil(Math.max(1,a)/45));
  if(unit==='litre')return Math.max(1,Math.ceil(Math.max(1,a)/80));
  if(unit==='roll')return Math.max(1,Math.ceil(Math.max(1,a)/75));
  if(unit==='lot')return 1;
  if(unit==='piece')return Math.max(1,Math.ceil(Number(params.repairUnits||params.outlets||params.corners||params.openings||params.penetrations||params.roofWindows||params.chimneys||1)));
  return Math.max(1,round(a||1,1));
}
function unitPriceHt(material){
  const raw=Number(material?.price);
  if(!Number.isFinite(raw)||raw<0)return 0;
  return round(material.vatIncluded?raw/1.21:raw,4);
}
function materialUnitQuantity(line,quantity,material){
  const materialUnit=String(material?.unit||line.unit||'unit');
  if(materialUnit==='box_700')return round(quantity/700,2);
  if(materialUnit==='box_500')return round(quantity/500,2);
  if(materialUnit==='box_100')return round(quantity/100,2);
  if(materialUnit.startsWith('pack_'))return Math.max(1,Math.ceil(quantity/100));
  return quantity;
}
function quoteLinesFor(project){
  const result=[];
  for(const instance of project.bomInstances||[]){
    const template=bomById.get(String(instance.templateId));
    if(!template)continue;
    for(const line of template.lines||[]){
      const rawQty=quantityFor(line,instance.parameters||{});
      const material=materialByCode.get(String(line.catalogCode||''));
      const qty=materialUnitQuantity(line,rawQty,material);
      result.push({
        ref:String(line.catalogCode||('BATXL-QUOTE-REQ-'+String(line.seq||0))),
        label:String(material?.label||line.label||'Article à chiffrer'),
        qty,
        unit:String(material?.unit||line.unit||'unit'),
        price:unitPriceHt(material),
        vatRate:String(project.vatProfile||'').includes('_6_')?6:21,
        source:material?.source||null,
        sourcePriceObserved:Number.isFinite(Number(material?.price))?Number(material.price):null,
        sourceVatIncluded:material?.vatIncluded??null,
        supplierQuoteRequired:Boolean(line.supplierQuoteRequired||!Number.isFinite(Number(material?.price))),
        quantitySource:String(line.quantityFormula||'project_takeoff'),
        bomTemplateId:String(template.id),
        simulation:true
      });
    }
  }
  return result;
}
function quoteStatus(project,index,secondary=false){
  if(secondary)return ['brouillon','envoyé','refusé'][index%3];
  if(['active','completed','blocked'].includes(String(project.status)))return 'accepté';
  if(project.status==='planned')return 'accepté';
  return 'brouillon';
}
function fingerprintPayload(state){
  return {
    clients:(state.contacts||[]).filter(c=>(c.roles||[]).includes('Client')).map(c=>[c.id,c.name||c.company,c.city||c.town]),
    projects:(state.jobs||[]).map(p=>[p.id,p.reference,p.clientId,p.status,p.projectFamily]),
    quotes:(state.quotes||[]).map(q=>[q.id,q.ref,q.job,q.status,(q.lines||[]).length])
  };
}
function fingerprint(state){
  return createHash('sha256').update(JSON.stringify(fingerprintPayload(state))).digest('hex');
}
function ownerId(database,organizationId){
  return database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId)?.user_id||null;
}
function ensureSimulationRun(database,organizationId,actor,summary){
  const stamp='2026-09-29T20:00:00.000Z';
  database.prepare('INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json')
    .run(batxlId('simulationRun',21),organizationId,PACK_CODE,PACK_VERSION,stamp,actor,JSON.stringify(summary));
}

export function runCoreClientsProjectsCommercialPack({database,organizationId=DEFAULT_ORGANIZATION_ID}={}){
  const ownDatabase=!database;
  const db=database||new DatabaseSync(DEFAULT_DB);
  db.exec('PRAGMA foreign_keys=ON');
  const row=db.prepare('SELECT payload,revision FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  if(!row)throw new Error('BATXL CORE: organization_workspace_state introuvable pour '+organizationId);
  const state=JSON.parse(row.payload);
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw new Error('BATXL CORE: la société active n’est pas BatiNova.');
  if((scenarios.clients||[]).length!==20||(scenarios.projects||[]).length!==15)throw new Error('BATXL CORE: source scénario invalide, attendu 20 clients / 15 chantiers.');

  const sourceClientToCanonical=new Map();
  const clients=(scenarios.clients||[]).map((client,index)=>{
    const id=batxlId('client',index+1);
    sourceClientToCanonical.set(String(client.id),id);
    const business=client.type==='business';
    return {
      id,
      reference:batxlReferences.client(index+1),
      name:String(client.name),
      company:business?String(client.name):'',
      type:business?'Entreprise':'Particulier',
      roles:['Client'],
      city:String(client.city||''),
      town:String(client.city||''),
      email:'batxl.client.'+String(index+1).padStart(2,'0')+'@simulation.invalid',
      phone:'',
      returning:Boolean(client.returning),
      sourceScenarioId:String(client.id),
      simulation:true
    };
  });

  const projects=(scenarios.projects||[]).map((project,index)=>{
    const clientId=sourceClientToCanonical.get(String(project.clientId));
    const client=clients.find(item=>item.id===clientId);
    return {
      id:batxlId('project',index+1),
      reference:batxlReferences.project(index+1),
      name:String(project.name),
      clientId,
      client:client?.name||'',
      town:String(project.city||''),
      city:String(project.city||''),
      address:'Simulation BATXL — '+String(project.city||'Belgique'),
      type:String(project.projectFamily||''),
      phase:String(project.status||''),
      status:String(project.status||''),
      progress:project.status==='completed'?100:project.status==='planned'?0:project.status==='waiting'?5:project.status==='blocked'?35:55,
      vatProfile:String(project.vatProfile||'standard_21'),
      projectFamily:String(project.projectFamily||''),
      financialStory:String(project.financialStory||''),
      weatherExposure:String(project.weatherExposure||''),
      compliance:project.compliance||null,
      bomInstances:structuredClone(project.bomInstances||[]),
      sourceScenarioId:String(project.id),
      required:[],photos:[],notes:[],timeEntries:[],documents:[],
      simulation:true
    };
  });

  const quotes=[];
  let quoteIndex=1;
  for(let index=0;index<projects.length;index++){
    const project=projects[index],source=scenarios.projects[index],lines=quoteLinesFor(source);
    quotes.push({
      id:batxlId('quote',quoteIndex),
      ref:'DEV-BATXL-'+String(quoteIndex).padStart(3,'0'),
      title:'Offre principale — '+project.name,
      job:project.id,
      client:project.clientId,
      date:'2026-08-'+String(4+(index%14)).padStart(2,'0'),
      validUntil:'2026-10-'+String(4+(index%14)).padStart(2,'0'),
      status:quoteStatus(source,index,false),
      lines,
      operationKey:'BATXL-QUOTE-OP-'+String(quoteIndex).padStart(3,'0'),
      sourceScenarioId:String(source.id),
      simulation:true
    });
    quoteIndex++;
  }
  for(let index=0;index<12;index++){
    const project=projects[index],source=scenarios.projects[index],base=quoteLinesFor(source);
    quotes.push({
      id:batxlId('quote',quoteIndex),
      ref:'DEV-BATXL-'+String(quoteIndex).padStart(3,'0'),
      title:'Variante / option — '+project.name,
      job:project.id,
      client:project.clientId,
      date:'2026-09-'+String(1+(index%20)).padStart(2,'0'),
      validUntil:'2026-10-'+String(1+(index%20)).padStart(2,'0'),
      status:quoteStatus(source,index,true),
      lines:base.slice(0,Math.max(2,Math.ceil(base.length/2))).map(line=>({...line,qty:round(Number(line.qty||0)*0.35,2)})),
      operationKey:'BATXL-QUOTE-OP-'+String(quoteIndex).padStart(3,'0'),
      sourceScenarioId:String(source.id),
      simulation:true
    });
    quoteIndex++;
  }
  if(quotes.length!==27)throw new Error('BATXL CORE: 27 devis attendus, trouvés '+quotes.length);

  const remainingClients=new Map(clients.map(client=>[String(client.id),client]));
  const contacts=[];
  for(const contact of state.contacts||[]){
    if(!(contact.roles||[]).some(role=>String(role).toLowerCase()==='client')){contacts.push(contact);continue;}
    const replacement=remainingClients.get(String(contact.id));
    if(replacement){contacts.push(replacement);remainingClients.delete(String(contact.id));}
  }
  // Remplacer les clients déjà présents sur place conserve l'ordre au replay,
  // y compris les fournisseurs ajoutés ensuite par le pack finance-stock.
  state.contacts=[...contacts,...remainingClients.values()];
  state.jobs=projects;
  state.quotes=quotes;
  state.batxl={...(state.batxl||{}),coreCommercial:{source:'BATXL-SCENARIOS-BE-2026-09-29',profile:'20-clients-15-projects-27-quotes',updatedAt:'2026-09-29T20:00:00.000Z'}};

  const nextRevision=Number(row.revision||0)+1;
  db.prepare('UPDATE organization_workspace_state SET payload=?,revision=?,source_user_id=COALESCE(source_user_id,?),updated_at=? WHERE organization_id=?')
    .run(JSON.stringify(state),nextRevision,ownerId(db,organizationId),'2026-09-29T20:00:00.000Z',organizationId);

  const actor=ownerId(db,organizationId);
  const summary={
    pack:PACK_CODE,
    version:PACK_VERSION,
    clients:clients.length,
    projects:projects.length,
    quotes:quotes.length,
    acceptedQuotes:quotes.filter(q=>q.status==='accepté').length,
    quoteLines:quotes.reduce((total,q)=>total+(q.lines||[]).length,0),
    pricedLines:quotes.reduce((total,q)=>total+(q.lines||[]).filter(line=>Number(line.price)>0).length,0),
    supplierQuoteRequiredLines:quotes.reduce((total,q)=>total+(q.lines||[]).filter(line=>line.supplierQuoteRequired).length,0),
    fingerprint:fingerprint(state)
  };
  if(actor)ensureSimulationRun(db,organizationId,actor,summary);
  if(ownDatabase)db.close();
  return summary;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const database=new DatabaseSync(process.env.BATXL_DB_PATH||DEFAULT_DB);
  try{
    const summary=runCoreClientsProjectsCommercialPack({database,organizationId:process.env.BATXL_ORGANIZATION_ID||DEFAULT_ORGANIZATION_ID});
    console.log('BATXL_CORE_COMMERCIAL=PASS');
    console.log(JSON.stringify(summary,null,2));
  }finally{database.close()}
}
