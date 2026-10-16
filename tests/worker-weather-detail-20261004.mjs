import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../web/blank-workspace.js',import.meta.url),'utf8');
const required=[
  "const weatherLabel=",
  "const weatherIcon=",
  "function weatherAmount(",
  "function weatherDayHeading(",
  "function weatherLocalTime(",
  "function showWeatherForecast(",
  "function showTownWeather("
];
const selected=required.map(prefix=>source.split(/\r?\n/).find(line=>line.startsWith(prefix)));
assert.ok(selected.every(Boolean),'Le test charge les vraies fonctions météo de la vue.');

let lastModal=null,weatherRequest=null;
const context=vm.createContext({
  weatherByTown:{Namur:{place:{name:'Namur'},daily:{
    time:['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'],
    weather_code:[63,1,96,71,3],
    temperature_2m_max:[12,14,13,9,11],
    temperature_2m_min:[6,7,8,4,5],
    precipitation_probability_max:[70,10,85,45,25],
    precipitation_sum:[4.2,0,8.8,1.4,0.3],
    wind_speed_10m_max:[20,12,31,18,16],
    wind_gusts_10m_max:[36,20,54,29,25],
    sunrise:['2026-10-05T07:30','2026-10-06T07:32','2026-10-07T07:33','2026-10-08T07:35','2026-10-09T07:36'],
    sunset:['2026-10-05T19:12','2026-10-06T19:10','2026-10-07T19:08','2026-10-08T19:06','2026-10-09T19:04']
  }}},
  esc(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))},
  modal(title,body){lastModal={title,body}},
  loadJobWeather(...args){weatherRequest=args;return Promise.resolve()}
});
vm.runInContext(selected.join('\n'),context);
context.showTownWeather('Namur');

assert.equal(lastModal.title,'Météo chantier · Namur');
const html=lastModal.body;
assert.equal((html.match(/class="weather-day"/g)||[]).length,5,'Les cinq journées sont détaillées.');
assert.match(html,/Lundi 5 octobre/,'Chaque jour affiche un nom et une date en français.');
assert.match(html,/Vendredi 9 octobre/,'La dernière journée de la prévision est visible.');
assert.match(html,/Pluie modérée/,'Les conditions sont décrites précisément.');
assert.match(html,/Orage avec grêle légère/,'Les codes météo moins courants ont un libellé détaillé.');
assert.match(html,/12 °C/,'La température maximale est affichée avec son unité.');
assert.match(html,/6 °C/,'La température minimale est affichée avec son unité.');
assert.match(html,/70 %/,'La probabilité de précipitations est affichée.');
assert.match(html,/4,2 mm/,'La quantité de précipitations est affichée.');
assert.match(html,/20 km\/h/,'La vitesse maximale du vent est affichée.');
assert.match(html,/54 km\/h/,'Les rafales sont affichées.');
assert.match(html,/Lever 07:30/,'L’heure de lever du soleil est affichée en heure locale.');
assert.match(html,/Coucher 19:12/,'L’heure de coucher du soleil est affichée en heure locale.');
assert.match(html,/open-meteo\.com/,'La source de la prévision est visible.');

context.weatherByTown.Namur.daily.precipitation_probability_max[0]=null;
context.weatherByTown.Namur.daily.sunrise[0]=null;
context.showTownWeather('Namur');
assert.match(lastModal.body,/Indisponible/,'Les données météo manquantes sont signalées sans afficher NaN.');

delete context.weatherByTown.Namur;
await context.showTownWeather('Namur');
assert.deepEqual(JSON.parse(JSON.stringify(weatherRequest)),[true,['Namur']],'Une prévision absente recharge précisément la ville sélectionnée.');

console.log('worker-weather-detail: PASS — prévision 5 jours, détails terrain, affichage des valeurs manquantes et rechargement ciblé.');
