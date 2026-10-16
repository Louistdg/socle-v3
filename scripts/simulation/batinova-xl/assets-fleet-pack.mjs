import {DatabaseSync} from 'node:sqlite';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {id as batxlId,references as batxlReferences} from './manifest.mjs';

export const PACK_CODE='BATXL-ASSETS-FLEET-V1';
export const PACK_VERSION=1;
export const DEFAULT_ORGANIZATION_ID='org-local-owner';
const TARGET_VEHICLES=10;
const TARGET_TOOLS=55;
const STAMP='2026-09-29T13:15:00.000Z';

function parseJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function groupCount(assets,group){return assets.filter(item=>String(item?.group||'').toLowerCase()===group).length}
function ownerId(database,organizationId){
  const row=database.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId);
  if(!row?.user_id)throw Error('BATXL Assets: OWNER actif introuvable.');
  return String(row.user_id);
}
function persistRun(database,organizationId,owner,summary){
  if(!database.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='simulation_runs'").get())return;
  database.prepare('INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json')
    .run('BATXL-RUN-ASSETS-FLEET-V1',organizationId,PACK_CODE,PACK_VERSION,STAMP,owner,JSON.stringify(summary));
}
export function runAssetsFleetPack({database,organizationId=DEFAULT_ORGANIZATION_ID}={}){
  if(!database)throw Error('BATXL Assets: database obligatoire.');
  database.exec('PRAGMA foreign_keys=ON');
  const row=database.prepare('SELECT payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  if(!row)throw Error('BATXL Assets: workspace introuvable.');
  const state=parseJson(row.payload,{});
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw Error('BATXL Assets: société non BatiNova.');
  const owner=ownerId(database,organizationId);
  state.assets=Array.isArray(state.assets)?state.assets:[];
  let vehiclesAdded=0,toolsAdded=0,changed=false;
  const vehicleModels=[
    ['Volkswagen','Crafter plateau double cabine'],['Ford','Transit 350 L3H2'],['Mercedes-Benz','Sprinter 317 CDI'],
    ['Renault','Master L3H2'],['Iveco','Daily 35S16'],['Volkswagen','Transporter'],['Ford','Transit Custom'],['Renault','Trafic'],['Peugeot','Boxer'],['Citroën','Jumper']
  ];
  for(let index=1;groupCount(state.assets,'vehicles')<TARGET_VEHICLES;index++){
    const aid=batxlId('vehicle',index);
    if(state.assets.some(item=>String(item.id)===aid))continue;
    const [make,model]=vehicleModels[(index-1)%vehicleModels.length];
    state.assets.push({id:aid,reference:batxlReferences.vehicle(index),group:'vehicles',name:make+' '+model+' · BATXL '+String(index).padStart(2,'0'),type:'Véhicule utilitaire',status:'En service',make,model,vehicle:{plate:'BATXL-'+String(index).padStart(3,'0'),mileage:42000+index*7300,fuel:'Diesel',inspectionDue:'2027-'+String(1+(index%9)).padStart(2,'0')+'-15'},history:[],simulation:true});
    vehiclesAdded++;changed=true;
  }
  const toolFamilies=[
    ['Visseuse/perceuse','Makita 18V'],['Cloueur','Paslode'],['Scie circulaire','Makita 190 mm'],['Meuleuse','Bosch Pro 125 mm'],
    ['Marteau perforateur','Hilti SDS+'],['Plieuse zinc','Outillage zinguerie'],['Échelle','Échelle aluminium'],['Ligne de vie','EPI antichute'],
    ['Aspirateur chantier','Classe M'],['Laser rotatif','Laser chantier'],['Bétonnière','Bétonnière compacte']
  ];
  for(let index=1;groupCount(state.assets,'tools')<TARGET_TOOLS;index++){
    const aid=batxlId('asset',index);
    if(state.assets.some(item=>String(item.id)===aid))continue;
    const [type,model]=toolFamilies[(index-1)%toolFamilies.length];
    state.assets.push({id:aid,reference:batxlReferences.asset(index),group:'tools',name:type+' · '+model+' · '+String(index).padStart(2,'0'),type,status:index%17===0?'À contrôler':'Disponible',serial:'BATXL-TOOL-'+String(index).padStart(4,'0'),location:index%5===0?'Camionnette':'Dépôt',purchaseDate:'202'+String(1+(index%5))+'-'+String(1+(index%9)).padStart(2,'0')+'-15',history:[],simulation:true});
    toolsAdded++;changed=true;
  }
  if(changed)database.prepare('UPDATE organization_workspace_state SET payload=?,revision=revision+1,source_user_id=?,updated_at=? WHERE organization_id=?').run(JSON.stringify(state),owner,STAMP,organizationId);

  if(database.prepare("SELECT 1 ok FROM sqlite_master WHERE type='table' AND name='field_assets'").get()){
    const upsert=database.prepare(`INSERT INTO field_assets(id,organization_id,payload_json,created_by,created_at,updated_by,updated_at,archived_at)
      VALUES(?,?,?,?,?,?,?,NULL)
      ON CONFLICT(organization_id,id) DO UPDATE SET payload_json=excluded.payload_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at,archived_at=NULL`);
    for(const asset of state.assets)upsert.run(String(asset.id),organizationId,JSON.stringify(asset),owner,STAMP,owner,STAMP);
  }

  const relationalAssets=database.prepare("SELECT payload_json FROM field_assets WHERE organization_id=? AND archived_at IS NULL").all(organizationId).map(row=>parseJson(row.payload_json,{}));
  const summary={
    pack:PACK_CODE,
    version:PACK_VERSION,
    vehicles:groupCount(state.assets,'vehicles'),
    tools:groupCount(state.assets,'tools'),
    relationalVehicles:groupCount(relationalAssets,'vehicles'),
    relationalTools:groupCount(relationalAssets,'tools'),
    created:{vehicles:vehiclesAdded,tools:toolsAdded}
  };
  if(summary.vehicles!==TARGET_VEHICLES||summary.tools!==TARGET_TOOLS)throw Error('BATXL Assets: volumes workspace calibrés inattendus '+JSON.stringify(summary));
  if(summary.relationalVehicles!==TARGET_VEHICLES||summary.relationalTools!==TARGET_TOOLS)throw Error('BATXL Assets: volumes relationnels calibrés inattendus '+JSON.stringify(summary));
  persistRun(database,organizationId,owner,summary);
  return summary;
}
function openDatabase(){
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
  return new DatabaseSync(process.env.BATXL_DB_PATH?resolve(process.env.BATXL_DB_PATH):join(root,'data','socle.sqlite'));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const database=openDatabase();
  const summary=runAssetsFleetPack({database,organizationId:process.env.BATXL_ORGANIZATION_ID||DEFAULT_ORGANIZATION_ID});
  console.log('BATINOVA XL — Assets/flotte appliqué.');
  console.log(JSON.stringify(summary,null,2));
}
