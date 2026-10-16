import {readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../../..');
const DEFAULT_DB=join(ROOT,'data','socle.sqlite');
const STAMP='2026-09-30T04:15:00.000Z';
const PACK_CODE='BATXL-IA2-LABOR-COST-BASELINE';
const PACK_VERSION=1;
const STANDARD_PLANNED_MINUTES_PER_PERSON_DAY=495;
const CATEGORIES=['LABOUR','MATERIALS','SUBCONTRACTING','EQUIPMENT','OTHER'];

const SCENARIOS=JSON.parse(readFileSync(new URL('./project-scenarios-2026-09-29.json',import.meta.url),'utf8'));
const SCENARIO_BY_ID=new Map((SCENARIOS.projects||[]).map(project=>[String(project.id),project]));

export const CP124_GROSS_HOURLY_EUR=Object.freeze({
  CAT_I:18.592,
  CAT_II:19.820,
  CAT_III:21.078,
  CAT_IV:22.374,
  TEAM_LEAD_III:23.186,
  TEAM_LEAD_IV:24.597
});

export const LABOR_COST_MODEL_ASSUMPTIONS=Object.freeze({
  grossRateEffectiveDate:'2026-07-01',
  observedAt:'2026-09-29',
  socialContributionBaseFactor:1.08,
  assumedEmployerContributionRate:0.25,
  mealVoucherEmployerPerDayEur:2.00,
  paidHoursPerDay:8,
  productiveUtilizationRate:0.82,
  directOperationalCostPerHourEur:2.50,
  overheadRateOnInternalCost:0.12,
  targetCommercialMarginRate:0.15,
  standardPlannedMinutesPerPersonDay:STANDARD_PLANNED_MINUTES_PER_PERSON_DAY,
  disclaimer:'Simulation model only. CP124 gross rates are reference minima; employer contribution rate, productivity, direct cost, overhead and margin are explicit modelling assumptions, not official rates.',
  sources:[
    'https://www.salairesminimums.be/document.html?jcId=c206d961982d4ec6b997c7a485e0bf32',
    'https://www.socialsecurity.be/employer/instructions/dmfa/fr/latest/instructions/socialsecuritycontributions/contributions.html',
    'https://www.sodibe.be/nieuws/pc-124-sectorakkoord-2025-2026'
  ]
});

const STORY_PLANNING_FACTORS=Object.freeze({
  tight_margin_due_to_labor:0.82,
  hours_overrun:0.78,
  planned_margin_recovery:1.08
});

function parseJson(value,fallback){try{return JSON.parse(value)}catch{return fallback}}
function round(value,digits=4){return Number(Number(value||0).toFixed(digits))}
function clamp(value,min,max){return Math.min(max,Math.max(min,value))}
function clockMinutes(value){
  const [h,m]=String(value||'').split(':').map(Number);
  return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:0;
}
function personIds(value){return parseJson(value,[]).map(String).filter(Boolean)}
function scenarioFor(projectId){return SCENARIO_BY_ID.get(String(projectId))||null}

export function qualificationCostModel(qualification){
  const grossHourlyOfficial=Number(CP124_GROSS_HOURLY_EUR[qualification]);
  if(!Number.isFinite(grossHourlyOfficial))throw Error('BATXL labour: qualification CP124 inconnue '+qualification);
  const a=LABOR_COST_MODEL_ASSUMPTIONS;
  const contributionBaseHourly=grossHourlyOfficial*a.socialContributionBaseFactor;
  const assumedEmployerContributionHourly=contributionBaseHourly*a.assumedEmployerContributionRate;
  const mealVoucherHourly=a.mealVoucherEmployerPerDayEur/a.paidHoursPerDay;
  const loadedPayrollHourlyModel=contributionBaseHourly+assumedEmployerContributionHourly+mealVoucherHourly;
  const productiveInternalHourlyCost=loadedPayrollHourlyModel/a.productiveUtilizationRate+a.directOperationalCostPerHourEur;
  const sellingHourlyRate=(productiveInternalHourlyCost*(1+a.overheadRateOnInternalCost))/(1-a.targetCommercialMarginRate);
  return {
    qualification,
    grossHourlyOfficial:round(grossHourlyOfficial),
    contributionBaseHourly:round(contributionBaseHourly),
    assumedEmployerContributionHourly:round(assumedEmployerContributionHourly),
    mealVoucherHourly:round(mealVoucherHourly),
    loadedPayrollHourlyModel:round(loadedPayrollHourlyModel),
    productiveInternalHourlyCost:round(productiveInternalHourlyCost),
    productiveInternalHourlyCostCents:Math.round(productiveInternalHourlyCost*100),
    sellingHourlyRate:round(sellingHourlyRate)
  };
}

function qualificationMap(state){
  const out=new Map();
  for(const team of (state.teams||[]).slice(0,4)){
    const members=(team.members||[]).map(String);
    for(let index=0;index<members.length;index++){
      const id=members[index];
      if(out.has(id))continue;
      const qualification=index===0
        ?'TEAM_LEAD_IV'
        :(['CAT_III','CAT_II','CAT_IV'][(index-1)%3]);
      out.set(id,qualification);
    }
  }
  return out;
}

function assignmentRows(database,organizationId,projectId){
  return database.prepare("SELECT assignment_date,people_json FROM field_assignments WHERE organization_id=? AND project_id=? AND id LIKE 'BATXL-%' ORDER BY assignment_date,id")
    .all(organizationId,String(projectId));
}

function actualMinutesForProject(database,organizationId,projectId){
  const rows=database.prepare("SELECT people_json,arrival,departure,break_minutes FROM time_entries WHERE organization_id=? AND project_id=? AND archived_at IS NULL AND departure IS NOT NULL ORDER BY work_date,id")
    .all(organizationId,String(projectId));
  let minutes=0;
  for(const row of rows){
    const people=personIds(row.people_json).length||1;
    minutes+=Math.max(0,clockMinutes(row.departure)-clockMinutes(row.arrival)-Number(row.break_minutes||0))*people;
  }
  return minutes;
}

function assignmentWeights(rows){
  const weights=new Map();
  for(const row of rows){
    for(const id of personIds(row.people_json))weights.set(id,(weights.get(id)||0)+1);
  }
  return weights;
}

function estimateBomHours(project){
  let total=0;
  for(const instance of project?.bomInstances||[]){
    const id=String(instance.templateId||'');
    const p=instance.parameters||{};
    if(id==='BATXL-BOM-ROOF-SLATE-NATURAL')total+=Number(p.roofAreaM2||0)*0.72+Number(p.chimneys||0)*6+Number(p.roofWindows||0)*2;
    else if(id==='BATXL-BOM-ROOF-TILE-ACTUA10')total+=Number(p.roofAreaM2||0)*0.48;
    else if(id==='BATXL-BOM-SARKING-SLATE')total+=Number(p.roofAreaM2||0)*0.90;
    else if(id==='BATXL-BOM-FLAT-EPDM')total+=Number(p.roofAreaM2||0)*0.50;
    else if(id==='BATXL-BOM-ZINC-RAINWATER')total+=Number(p.gutterLengthM||0)*0.45+(Array.isArray(p.downpipeHeightsM)?p.downpipeHeightsM.length*2:0);
    else if(id==='BATXL-BOM-CLADDING-CEDRAL')total+=Number(p.facadeNetAreaM2||0)*0.62;
    else if(id==='BATXL-BOM-MASONRY-CAVITY-WALL')total+=Number(p.wallNetAreaM2||0)*1.35;
    else if(id==='BATXL-BOM-MASONRY-BLOCK-WALL')total+=Number(p.wallNetAreaM2||0)*0.85;
    else if(id==='BATXL-BOM-AAC-PARTITION')total+=Number(p.wallNetAreaM2||0)*0.62;
    else if(id==='BATXL-BOM-ROOF-REPAIR')total+=Number(p.repairAreaM2||0)*2.40;
    else if(id==='BATXL-BOM-CHIMNEY-REBUILD')total+=Number(p.masonryAreaM2||0)*4.50;
    else if(id==='BATXL-BOM-ATTIC-INSULATION')total+=Number(p.insulatedAreaM2||0)*0.42;
  }
  return Math.max(0,total);
}

function plannedMinutesForProject(database,organizationId,project){
  const rows=assignmentRows(database,organizationId,project.id);
  const storyFactor=Number(STORY_PLANNING_FACTORS[project.financialStory]||1);
  if(rows.length){
    const raw=rows.reduce((sum,row)=>sum+personIds(row.people_json).length*STANDARD_PLANNED_MINUTES_PER_PERSON_DAY,0);
    return {
      source:'PLANNING_ASSIGNMENTS',
      rawPlannedMinutes:raw,
      storyFactor,
      plannedMinutes:Math.max(1,Math.round(raw*storyFactor)),
      assignmentRows:rows
    };
  }
  const hours=estimateBomHours(project);
  if(hours<=0)return null;
  const raw=Math.round(hours*60);
  return {
    source:'BOM_PRODUCTIVITY_FALLBACK',
    rawPlannedMinutes:raw,
    storyFactor,
    plannedMinutes:Math.max(1,Math.round(raw*storyFactor)),
    assignmentRows:[]
  };
}

function blendedModel(state,planning){
  const qualByPerson=qualificationMap(state);
  const weights=assignmentWeights(planning.assignmentRows);
  const weighted=[];
  if(weights.size){
    for(const [personId,weight] of weights){
      const qualification=qualByPerson.get(personId)||'CAT_III';
      weighted.push({personId,weight,model:qualificationCostModel(qualification)});
    }
  }else{
    const fallback=[
      ['SIM-LEAD',1,'TEAM_LEAD_IV'],
      ['SIM-W-01',1,'CAT_III'],
      ['SIM-W-02',1,'CAT_III'],
      ['SIM-W-03',1,'CAT_II']
    ];
    for(const [personId,weight,qualification] of fallback)weighted.push({personId,weight,model:qualificationCostModel(qualification)});
  }
  const totalWeight=weighted.reduce((sum,row)=>sum+row.weight,0);
  const mean=key=>weighted.reduce((sum,row)=>sum+row.model[key]*row.weight,0)/totalWeight;
  return {
    crewSource:weights.size?'PLANNING_ASSIGNMENTS':'DEFAULT_SIMULATION_CREW',
    people:weighted.map(row=>({personId:row.personId,weight:row.weight,qualification:row.model.qualification})),
    grossHourlyOfficial:round(mean('grossHourlyOfficial')),
    loadedPayrollHourlyModel:round(mean('loadedPayrollHourlyModel')),
    productiveInternalHourlyCost:round(mean('productiveInternalHourlyCost')),
    productiveInternalHourlyCostCents:Math.round(mean('productiveInternalHourlyCost')*100),
    sellingHourlyRate:round(mean('sellingHourlyRate'))
  };
}

function activeBaseline(database,organizationId,projectId){
  return database.prepare("SELECT * FROM project_financial_baselines WHERE organization_id=? AND project_id=? AND status='active' ORDER BY version DESC LIMIT 1")
    .get(organizationId,String(projectId))||null;
}

function budgetsForBaseline(database,baselineId){
  const out=Object.fromEntries(CATEGORIES.map(category=>[category,null]));
  if(!baselineId)return out;
  for(const row of database.prepare('SELECT category,budget_cents FROM project_cost_budgets WHERE baseline_id=?').all(baselineId)){
    if(CATEGORIES.includes(row.category))out[row.category]=row.budget_cents===null?null:Number(row.budget_cents);
  }
  return out;
}

function baselineIdFor(projectId){
  const suffix=String(projectId).replace(/^BATXL-PRJ-/,'').replace(/[^A-Za-z0-9_-]/g,'-');
  return 'BATXL-LABOUR-BASE-'+suffix;
}

function ensureBaseline(database,{organizationId,ownerId,project,planning,model}){
  const desiredId=baselineIdFor(project.id);
  const desiredLabour=Math.round(planning.plannedMinutes*model.productiveInternalHourlyCostCents/60);
  const existing=database.prepare('SELECT * FROM project_financial_baselines WHERE id=? AND organization_id=?').get(desiredId,organizationId)||null;
  const current=activeBaseline(database,organizationId,project.id);

  if(existing){
    const existingBudget=budgetsForBaseline(database,desiredId);
    if(Number(existing.planned_minutes)!==planning.plannedMinutes||Number(existing.hourly_cost_cents)!==model.productiveInternalHourlyCostCents||Number(existingBudget.LABOUR)!==desiredLabour){
      throw Error('BATXL labour: dérive baseline détectée pour '+project.id);
    }
    if(existing.status!=='active'){
      if(current&&current.id!==desiredId)database.prepare("UPDATE project_financial_baselines SET status='superseded',updated_by=?,updated_at=? WHERE id=?").run(ownerId,STAMP,current.id);
      database.prepare("UPDATE project_financial_baselines SET status='active',updated_by=?,updated_at=? WHERE id=?").run(ownerId,STAMP,desiredId);
    }
    return {id:desiredId,created:false,budgets:existingBudget,labourBudgetCents:desiredLabour};
  }

  const previousBudgets=budgetsForBaseline(database,current?.id);
  const nextVersion=Number(database.prepare('SELECT COALESCE(MAX(version),0)+1 version FROM project_financial_baselines WHERE organization_id=? AND project_id=?').get(organizationId,String(project.id)).version);
  if(current)database.prepare("UPDATE project_financial_baselines SET status='superseded',updated_by=?,updated_at=? WHERE id=?").run(ownerId,STAMP,current.id);
  database.prepare("INSERT INTO project_financial_baselines(id,organization_id,project_id,version,status,planned_minutes,hourly_cost_cents,progress_basis_points,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?, 'active',?,?,?,?,?,?,?)")
    .run(desiredId,organizationId,String(project.id),nextVersion,planning.plannedMinutes,model.productiveInternalHourlyCostCents,current?.progress_basis_points??null,ownerId,STAMP,ownerId,STAMP);
  const budgets={...previousBudgets,LABOUR:desiredLabour};
  for(const category of CATEGORIES){
    database.prepare('INSERT INTO project_cost_budgets(baseline_id,category,budget_cents) VALUES(?,?,?)')
      .run(desiredId,category,budgets[category]);
  }
  return {id:desiredId,created:true,budgets,labourBudgetCents:desiredLabour};
}

function ensureSimulationRun(database,organizationId,ownerId,summary){
  const id='BATXL-RUN-IA2-LABOR-COST-V1';
  database.prepare("INSERT INTO simulation_runs(id,organization_id,script_code,version,applied_at,applied_by,summary_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(organization_id,script_code,version) DO UPDATE SET applied_at=excluded.applied_at,applied_by=excluded.applied_by,summary_json=excluded.summary_json")
    .run(id,organizationId,PACK_CODE,PACK_VERSION,STAMP,ownerId,JSON.stringify(summary));
}

export function runLaborCostBaselinePack({database,organizationId,ownerId}={}){
  const ownDatabase=!database;
  const db=database||new DatabaseSync(DEFAULT_DB);
  db.exec('PRAGMA foreign_keys=ON');

  let workspace;
  if(organizationId)workspace=db.prepare('SELECT organization_id,payload FROM organization_workspace_state WHERE organization_id=?').get(organizationId);
  else workspace=db.prepare("SELECT organization_id,payload FROM organization_workspace_state WHERE payload LIKE '%BatiNova%' ORDER BY organization_id LIMIT 1").get();
  if(!workspace)throw Error('BATXL labour: workspace BatiNova introuvable.');
  organizationId=String(workspace.organization_id);
  const state=parseJson(workspace.payload,{});
  if(!/BatiNova/i.test(String(state.company?.name||'')))throw Error('BATXL labour: société non BatiNova.');

  if(!ownerId){
    ownerId=db.prepare("SELECT om.user_id FROM organization_members om JOIN roles r ON r.id=om.role_id WHERE om.organization_id=? AND om.status='active' AND r.code='OWNER' ORDER BY COALESCE(om.joined_at,om.created_at),om.user_id LIMIT 1").get(organizationId)?.user_id;
  }
  if(!ownerId)throw Error('BATXL labour: OWNER actif introuvable.');
  ownerId=String(ownerId);

  const projects=(state.jobs||[]).map(job=>{
    const scenario=scenarioFor(job.sourceScenarioId||job.id);
    return scenario?{...scenario,...job,id:String(job.id),financialStory:String(job.financialStory||scenario.financialStory||'')} : null;
  }).filter(Boolean);
  if(!projects.length)throw Error('BATXL labour: aucun chantier calibré BATXL.');

  const projectSummaries=[];
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const project of projects){
      const planning=plannedMinutesForProject(db,organizationId,project);
      if(!planning)continue;
      const model=blendedModel(state,planning);
      const actualMinutes=actualMinutesForProject(db,organizationId,project.id);
      const baseline=ensureBaseline(db,{organizationId,ownerId,project,planning,model});
      projectSummaries.push({
        projectId:String(project.id),
        projectReference:String(project.reference||project.id),
        financialStory:String(project.financialStory||''),
        plannedSource:planning.source,
        rawPlannedMinutes:planning.rawPlannedMinutes,
        storyFactor:planning.storyFactor,
        plannedMinutes:planning.plannedMinutes,
        actualMinutes,
        varianceMinutes:actualMinutes-planning.plannedMinutes,
        crewSource:model.crewSource,
        blendedGrossHourlyOfficial:model.grossHourlyOfficial,
        blendedLoadedPayrollHourlyModel:model.loadedPayrollHourlyModel,
        blendedProductiveInternalHourlyCost:model.productiveInternalHourlyCost,
        productiveInternalHourlyCostCents:model.productiveInternalHourlyCostCents,
        indicativeSellingHourlyRate:model.sellingHourlyRate,
        labourBudgetCents:baseline.labourBudgetCents,
        baselineId:baseline.id
      });
    }

    const summary={
      pack:PACK_CODE,
      version:PACK_VERSION,
      organizationId,
      assumptions:LABOR_COST_MODEL_ASSUMPTIONS,
      cp124GrossHourlyEur:CP124_GROSS_HOURLY_EUR,
      projects:projectSummaries,
      stories:{
        tightMargin:projectSummaries.filter(p=>p.financialStory==='tight_margin_due_to_labor').map(p=>p.projectId),
        hoursOverrun:projectSummaries.filter(p=>p.financialStory==='hours_overrun').map(p=>p.projectId),
        plannedMarginRecovery:projectSummaries.filter(p=>p.financialStory==='planned_margin_recovery').map(p=>p.projectId)
      },
      integrity:{
        foreignKeyViolations:db.prepare('PRAGMA foreign_key_check').all().length,
        integrityCheck:db.prepare('PRAGMA integrity_check').get().integrity_check
      }
    };
    ensureSimulationRun(db,organizationId,ownerId,summary);
    db.exec('COMMIT');
    if(ownDatabase)db.close();
    return summary;
  }catch(error){
    db.exec('ROLLBACK');
    if(ownDatabase)db.close();
    throw error;
  }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const database=new DatabaseSync(process.env.BATXL_DB_PATH||DEFAULT_DB);
  try{
    console.log(JSON.stringify(runLaborCostBaselinePack({
      database,
      organizationId:process.env.BATXL_ORGANIZATION_ID||undefined,
      ownerId:process.env.BATXL_OWNER_ID||undefined
    }),null,2));
  }finally{
    database.close();
  }
}
