import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/blank-workspace.js',import.meta.url),'utf8');
const loader=source.split(/\r?\n/).find(line=>line.startsWith('async function loadJobWeather('));
assert.ok(loader,'Le test doit exécuter le chargeur météo réel.');

async function exercise({towns=['Namur'],cached=['Namur'],force=false,requestedTowns=null,view='planning',role='OWNER'}={}){
  let renders=0;
  const requests=[];
  const context=vm.createContext({
    reference:'2026-09-30',
    assignments:towns.map((town,index)=>({date:'2026-09-30',job:String(index)})),
    jobs:towns.map((town,index)=>({id:String(index),town})),
    weatherLoading:false,
    weatherByTown:Object.fromEntries(cached.map(town=>[town,{daily:{}}])),
    view,
    iaARoleCode(){return role},
    toast(){assert.fail('Les réponses météo simulées doivent être valides.');},
    async fetch(url){
      requests.push(url);
      return {json:async()=>url.includes('geocoding')
        ? {results:[{name:new URL(url).searchParams.get('name'),latitude:50,longitude:4}]}
        : {daily:{}}};
    },
    render(){
      renders++;
      // Plafonner la reproduction permet à une régression de finir en échec.
      if(view==='planning'&&renders<5)void context.loadJobWeather();
    }
  });
  vm.runInContext(loader,context);
  await context.loadJobWeather(force,requestedTowns);
  for(let index=0;index<40;index++)await Promise.resolve();
  return {renders,requests};
}

assert.deepEqual(await exercise(),{renders:0,requests:[]},'Un cache complet ne doit pas relancer le rendu.');
const cold=await exercise({cached:[]});
assert.equal(cold.renders,1,'Le premier chargement doit rendre une seule fois.');
assert.equal(cold.requests.length,2);
const forecastUrl=new URL(cold.requests[1]);
assert.equal(forecastUrl.searchParams.get('forecast_days'),'5','La météo chantier charge cinq jours.');
for(const variable of ['weather_code','temperature_2m_max','temperature_2m_min','precipitation_probability_max','precipitation_sum','wind_speed_10m_max','wind_gusts_10m_max','sunrise','sunset'])assert.ok(forecastUrl.searchParams.get('daily').split(',').includes(variable),'Variable météo quotidienne demandée : '+variable);
const forced=await exercise({force:true});
assert.equal(forced.renders,1,'Actualiser doit recharger même une ville déjà en cache.');
assert.equal(forced.requests.length,2);
const partial=await exercise({towns:['Namur','Liège','Liège']});
assert.equal(partial.renders,1,'Un cache partiel doit converger après un seul rendu.');
assert.equal(partial.requests.length,2,'Seule la ville manquante doit être chargée, une fois.');
assert.equal(new URL(partial.requests[0]).searchParams.get('name'),'Liège');
assert.deepEqual(await exercise({towns:[]}),{renders:0,requests:[]});
const workerHome=await exercise({towns:['Namur','Liège'],cached:[],requestedTowns:['Namur'],view:'home',role:'WORKER'});
assert.equal(workerHome.renders,1,'la météo personnelle actualise l’accueil ouvrier après chargement');
assert.equal(workerHome.requests.length,2,'la météo personnelle ne géocode qu’une ville affectée');
assert.equal(new URL(workerHome.requests[0]).searchParams.get('name'),'Namur');
console.log('Météo: cache complet, cache vide, actualisation forcée, cache partiel et absence de chantier — PASS.');
