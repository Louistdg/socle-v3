import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
import {
  CP124_GROSS_HOURLY_EUR,
  LABOR_COST_MODEL_ASSUMPTIONS,
  qualificationCostModel,
  runLaborCostBaselinePack
} from '../scripts/simulation/batinova-xl/labor-cost-baseline-pack.mjs';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(name=>/^\d+.*\.sql$/.test(name)).sort();
for(const name of migrations)db.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));

const stamp='2026-09-30T04:00:00.000Z';
const org='batxl-org';
const owner='batxl-owner';
db.prepare('INSERT INTO organizations(id,name,legal_name,country,currency,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
  .run(org,'BatiNova XL','BatiNova XL','BE','EUR',stamp,stamp);
db.prepare('INSERT INTO profiles(id,first_name,last_name,email,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run(owner,'Marc','Delcourt','marc@simulation.invalid',stamp,stamp);
db.prepare('INSERT INTO roles(id,organization_id,code,name,created_at) VALUES(?,?,?,?,?)')
  .run('batxl-owner-role',org,'OWNER','Owner',stamp);
db.prepare('INSERT INTO organization_members(id,organization_id,user_id,role_id,status,joined_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run('batxl-owner-member',org,owner,'batxl-owner-role','active',stamp,stamp,stamp);
db.prepare("INSERT OR IGNORE INTO role_permissions(role_id,permission_code) SELECT 'batxl-owner-role',code FROM permissions WHERE code IN ('margins.view','workspace.view')")
  .run();

const scenarios=JSON.parse(readFileSync(new URL('../scripts/simulation/batinova-xl/project-scenarios-2026-09-29.json',import.meta.url),'utf8'));
const byId=new Map((scenarios.projects||[]).map(project=>[String(project.id),project]));
const projectIds=['BATXL-PRJ-002','BATXL-PRJ-010','BATXL-PRJ-013'];
const projects=projectIds.map(id=>({...structuredClone(byId.get(id)),reference:id}));
assert.equal(projects.length,3);

const people=Array.from({length:6},(_,i)=>({id:'BATXL-P-'+String(i+1).padStart(2,'0'),name:'Ouvrier '+String(i+1)}));
const teams=[
  {id:'BATXL-TEAM-01',name:'Équipe 1',members:people.slice(0,3).map(p=>p.id)},
  {id:'BATXL-TEAM-02',name:'Équipe 2',members:people.slice(3,6).map(p=>p.id)}
];
const quotes=projects.map((project,index)=>({
  id:'BATXL-Q-'+String(index+1).padStart(3,'0'),
  ref:'DEV-'+project.id,
  title:'Offre principale — '+project.name,
  job:project.id,
  status:'accepté',
  lines:[{qty:1,price:100000+index*25000}]
}));
const state={
  version:3,
  company:{name:'BatiNova XL',morningBreakMinutes:15,lunchBreakMinutes:30},
  people,
  teams,
  jobs:projects,
  quotes,
  purchaseOrders:[],
  contacts:[],
  assets:[],
  tasks:[],
  dossiers:[],
  reminders:[]
};
db.prepare('INSERT INTO organization_workspace_state(organization_id,payload,revision,source_user_id,created_at,updated_at) VALUES(?,?,?,?,?,?)')
  .run(org,JSON.stringify(state),1,owner,stamp,stamp);

function insertPlanning(projectId,teamId,personIds,startDay){
  for(let dayIndex=0;dayIndex<2;dayIndex++){
    const date='2026-09-'+String(startDay+dayIndex).padStart(2,'0');
    const asgId='BATXL-ASG-'+projectId+'-'+String(dayIndex+1);
    db.prepare('INSERT INTO field_assignments(id,organization_id,assignment_date,team_id,project_id,people_json,vehicle_id,pack_id,subcontractor,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(asgId,org,date,teamId,projectId,JSON.stringify(personIds),null,'BATXL-PACK-PLANNING','',owner,date+'T05:45:00.000Z',owner,date+'T05:45:00.000Z');
    for(let personIndex=0;personIndex<personIds.length;personIndex++){
      const personId=personIds[personIndex];
      db.prepare('INSERT INTO time_entries(id,organization_id,project_id,team_id,people_json,work_date,arrival,departure,break_minutes,note,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run('BATXL-TE-'+projectId+'-'+String(dayIndex+1)+'-'+String(personIndex+1),org,projectId,teamId,JSON.stringify([personId]),date,'07:15','16:15',45,'BATXL-NORMAL',owner,date+'T05:50:00.000Z',owner,date+'T16:30:00.000Z');
    }
  }
}
insertPlanning('BATXL-PRJ-002','BATXL-TEAM-01',teams[0].members,10);
insertPlanning('BATXL-PRJ-010','BATXL-TEAM-02',teams[1].members,15);

db.prepare("INSERT INTO project_financial_baselines(id,organization_id,project_id,version,status,planned_minutes,hourly_cost_cents,progress_basis_points,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?, 'active',?,?,?,?,?,?,?)")
  .run('OLD-BASE-PRJ-002',org,'BATXL-PRJ-002',1,3000,3000,4000,owner,stamp,owner,stamp);
for(const [category,value] of Object.entries({
  LABOUR:150000,
  MATERIALS:500000,
  SUBCONTRACTING:100000,
  EQUIPMENT:50000,
  OTHER:25000
})){
  db.prepare('INSERT INTO project_cost_budgets(baseline_id,category,budget_cents) VALUES(?,?,?)')
    .run('OLD-BASE-PRJ-002',category,value);
}

let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};
const ok=(value,message)=>{assert.ok(value,message);assertions++};
const deep=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);assertions++};

eq(CP124_GROSS_HOURLY_EUR.CAT_I,18.592,'CP124 Cat I');
eq(CP124_GROSS_HOURLY_EUR.CAT_IV,22.374,'CP124 Cat IV');
eq(CP124_GROSS_HOURLY_EUR.TEAM_LEAD_IV,24.597,'CP124 chef équipe IV');
eq(LABOR_COST_MODEL_ASSUMPTIONS.socialContributionBaseFactor,1.08,'base ONSS modélisée 108%');
eq(LABOR_COST_MODEL_ASSUMPTIONS.mealVoucherEmployerPerDayEur,2,'chèque repas employeur 2 EUR/jour');
const model=qualificationCostModel('CAT_III');
ok(model.loadedPayrollHourlyModel>model.grossHourlyOfficial,'coût chargé > brut');
ok(model.productiveInternalHourlyCost>model.loadedPayrollHourlyModel,'coût productif > coût chargé');
ok(model.sellingHourlyRate>model.productiveInternalHourlyCost,'taux de vente distinct > coût interne');

const first=runLaborCostBaselinePack({database:db,organizationId:org,ownerId:owner});
eq(first.projects.length,3,'3 projets calibrés');
eq(first.integrity.foreignKeyViolations,0,'FK check vide');
eq(first.integrity.integrityCheck,'ok','integrity ok');

const p2=first.projects.find(p=>p.projectId==='BATXL-PRJ-002');
const p10=first.projects.find(p=>p.projectId==='BATXL-PRJ-010');
const p13=first.projects.find(p=>p.projectId==='BATXL-PRJ-013');
eq(p2.plannedSource,'PLANNING_ASSIGNMENTS','PRJ002 plan IA3');
eq(p10.plannedSource,'PLANNING_ASSIGNMENTS','PRJ010 plan IA3');
eq(p13.plannedSource,'BOM_PRODUCTIVITY_FALLBACK','PRJ013 fallback BOM');
eq(p2.actualMinutes,2970,'PRJ002 minutes réelles');
eq(p10.actualMinutes,2970,'PRJ010 minutes réelles');
ok(p2.plannedMinutes<p2.actualMinutes,'PRJ002 tight labor dépasse la baseline');
ok(p10.plannedMinutes<p10.actualMinutes,'PRJ010 hours overrun dépasse la baseline');
ok(p13.plannedMinutes>0&&p13.actualMinutes===0,'PRJ013 baseline future sans faux pointage');
ok(p2.productiveInternalHourlyCostCents>0,'coût interne productif calculé');
ok(p2.indicativeSellingHourlyRate>p2.blendedProductiveInternalHourlyCost,'taux de vente indicatif distinct');

const activeP2=db.prepare("SELECT * FROM project_financial_baselines WHERE organization_id=? AND project_id=? AND status='active'").get(org,'BATXL-PRJ-002');
eq(activeP2.id,'BATXL-LABOUR-BASE-002','baseline IA2 active PRJ002');
eq(Number(activeP2.version),2,'baseline versionnée après baseline existante');
eq(Number(db.prepare("SELECT COUNT(*) c FROM project_financial_baselines WHERE id='OLD-BASE-PRJ-002' AND status='superseded'").get().c),1,'ancienne baseline superseded');
const p2Budgets=Object.fromEntries(db.prepare('SELECT category,budget_cents FROM project_cost_budgets WHERE baseline_id=?').all(activeP2.id).map(row=>[row.category,row.budget_cents]));
eq(Number(p2Budgets.MATERIALS),500000,'budget matériaux préservé');
eq(Number(p2Budgets.SUBCONTRACTING),100000,'budget sous-traitance préservé');
eq(Number(p2Budgets.EQUIPMENT),50000,'budget équipement préservé');
eq(Number(p2Budgets.OTHER),25000,'budget autre préservé');
eq(Number(p2Budgets.LABOUR),Math.round(p2.plannedMinutes*p2.productiveInternalHourlyCostCents/60),'budget LABOUR recalculé');

const runRow=db.prepare("SELECT summary_json FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=1").get(org,'BATXL-IA2-LABOR-COST-BASELINE');
ok(Boolean(runRow),'simulation run présent');
const runSummary=JSON.parse(runRow.summary_json);
ok(String(runSummary.assumptions.disclaimer).includes('Simulation model only'),'hypothèses explicitement non officielles');
eq(runSummary.cp124GrossHourlyEur.TEAM_LEAD_IV,24.597,'barème tracé dans simulation run');

function makeEnv(database){
  return {DB:{
    prepare(sql){
      let values=[];
      return{
        _sql:sql,
        get _values(){return values},
        bind(...args){values=args;return this},
        async first(){return database.prepare(sql).get(...values)??null},
        async all(){return{results:database.prepare(sql).all(...values)}},
        async run(){const result=database.prepare(sql).run(...values);return{meta:{changes:Number(result.changes)}}}
      };
    },
    async batch(statements){
      database.exec('BEGIN IMMEDIATE');
      try{
        const out=[];
        for(const statement of statements){
          const result=database.prepare(statement._sql).run(...statement._values);
          out.push({meta:{changes:Number(result.changes)}});
        }
        database.exec('COMMIT');
        return out;
      }catch(error){
        database.exec('ROLLBACK');
        throw error;
      }
    }
  }};
}
async function forecast(projectId){
  const response=await worker.fetch(new Request('https://socle.simulation/api/projects/'+projectId+'/financial-forecast',{
    method:'GET',
    headers:{
      'oai-authenticated-user-id':owner,
      'x-socle-organization-id':org,
      'origin':'https://socle.simulation'
    }
  }),makeEnv(db));
  eq(response.status,200,'forecast '+projectId+' HTTP 200');
  return response.json();
}

const f2=await forecast('BATXL-PRJ-002');
eq(f2.categories.LABOUR.budgetCents,Number(p2Budgets.LABOUR),'forecast reprend budget LABOUR');
eq(f2.categories.LABOUR.costToDateCents,Math.round(p2.actualMinutes*p2.productiveInternalHourlyCostCents/60),'forecast coût réel depuis pointages');
eq(f2.categories.LABOUR.radCents,0,'tight labor épuise le reste à dépenser');
eq(f2.categories.LABOUR.labourRadStatus,'PLANNED_HOURS','forecast utilise heures planifiées');
ok(!f2.quality.reasons.includes('LABOUR_HOURLY_COST_MISSING'),'coût horaire disponible');

const f10=await forecast('BATXL-PRJ-010');
eq(f10.categories.LABOUR.costToDateCents,Math.round(p10.actualMinutes*p10.productiveInternalHourlyCostCents/60),'PRJ010 coût réel depuis pointages');
eq(f10.categories.LABOUR.radCents,0,'hours overrun épuise le reste à dépenser');

const beforeReplay={
  baselineCount:Number(db.prepare("SELECT COUNT(*) c FROM project_financial_baselines WHERE id LIKE 'BATXL-LABOUR-BASE-%'").get().c),
  runSummary:db.prepare("SELECT summary_json FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=1").get(org,'BATXL-IA2-LABOR-COST-BASELINE').summary_json,
  active:db.prepare("SELECT project_id,id,version FROM project_financial_baselines WHERE organization_id=? AND status='active' AND id LIKE 'BATXL-LABOUR-BASE-%' ORDER BY project_id").all(org)
};
const second=runLaborCostBaselinePack({database:db,organizationId:org,ownerId:owner});
const afterReplay={
  baselineCount:Number(db.prepare("SELECT COUNT(*) c FROM project_financial_baselines WHERE id LIKE 'BATXL-LABOUR-BASE-%'").get().c),
  runSummary:db.prepare("SELECT summary_json FROM simulation_runs WHERE organization_id=? AND script_code=? AND version=1").get(org,'BATXL-IA2-LABOR-COST-BASELINE').summary_json,
  active:db.prepare("SELECT project_id,id,version FROM project_financial_baselines WHERE organization_id=? AND status='active' AND id LIKE 'BATXL-LABOUR-BASE-%' ORDER BY project_id").all(org)
};
deep(afterReplay,beforeReplay,'replay x2 sans dérive baseline ni summary');
deep(second.projects,first.projects,'résumé métier stable au replay');
eq(db.prepare('PRAGMA foreign_key_check').all().length,0,'FK final vide');
eq(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok','integrity final ok');

console.log('ia2-labor-cost-baseline: '+assertions+' assertions réussies');
console.log(JSON.stringify({
  projects:first.projects.map(project=>({
    projectId:project.projectId,
    story:project.financialStory,
    plannedSource:project.plannedSource,
    plannedMinutes:project.plannedMinutes,
    actualMinutes:project.actualMinutes,
    internalHourlyCostCents:project.productiveInternalHourlyCostCents,
    labourBudgetCents:project.labourBudgetCents
  })),
  cp124GrossHourlyEur:first.cp124GrossHourlyEur,
  replayStable:true
}));
