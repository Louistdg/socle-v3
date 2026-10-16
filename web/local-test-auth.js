// Visible uniquement quand le serveur local de simulation expose ses routes.
// L'identité est appliquée par le serveur; cette barre ne sert qu'à changer de session.
function appendLocalTestIdentities(select,identities,documentRef=document){for(const identity of identities){if(typeof identity?.email!=='string'||typeof identity?.displayName!=='string')continue;const option=documentRef.createElement('option');option.value=identity.email;option.textContent=identity.displayName;select.append(option)}}
(async()=>{if(globalThis.SOCLE_PRODUCTION)return;try{
  const response=await fetch('/__local-test/identities',{cache:'no-store'});
  if(!response.ok)return;
  const data=await response.json();
  if(!Array.isArray(data.identities))return;
  const host=document.createElement('aside'),title=document.createElement('span'),strong=document.createElement('strong'),description=document.createElement('small'),select=document.createElement('select'),placeholder=document.createElement('option'),button=document.createElement('button');
  host.className='access-test-banner local-login-banner';
  host.setAttribute('data-local-test-session-selector','');
  strong.textContent='Choisir un utilisateur';
  description.textContent='Session locale de simulation · aucun e-mail envoyé.';
  title.append(strong,description);
  select.setAttribute('aria-label','Choisir un utilisateur de test');
  placeholder.value='';
  placeholder.textContent='Choisir un utilisateur…';
  placeholder.disabled=true;
  placeholder.selected=true;
  select.append(placeholder);
  appendLocalTestIdentities(select,data.identities);
  button.className='btn';
  button.textContent='Se connecter';
  button.disabled=true;
  select.addEventListener('change',()=>{button.disabled=!select.value});
  button.addEventListener('click',async()=>{
    if(!select.value)return;
    button.disabled=true;
    const result=await fetch('/__local-test/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:select.value})});
    if(result.ok){localStorage.removeItem('socle.activeOrganizationId');localStorage.removeItem('socle.sessionUserId');location.assign('/');return}
    button.disabled=false;
    alert('Connexion de test indisponible.');
  });
  if(!data.identities.length){description.textContent='Aucun utilisateur local disponible.';select.disabled=true;button.disabled=true}
  host.append(title,select,button);
  document.body.append(host);
}catch{}})();

// Dernier filet d'interface : certains écrans historiques reconstruisent leur
// navigation eux-mêmes. Ils doivent néanmoins respecter la session serveur.
const localModuleForView=moduleForView;
moduleForView=function(target){if(target==='jobWorkspace')return 'jobs';if(target==='contacts'&&globalThis.socleContactsAllowed)return 'jobs';return localModuleForView(target)};
const navigateBeforeLocalSecurity=navigate;
navigate=function(target){const limited=typeof sessionAccessKey!=='undefined'&&sessionAccessKey!=='owner';if(limited&&target==='accounting'&&!canViewModule('accounting'))return denyAccess('La comptabilité est masquée pour ce profil.');return navigateBeforeLocalSecurity(target)};
let personalWeather=JSON.parse(localStorage.getItem('socle-personal-weather')||'null');
function savePersonalWeather(value){personalWeather=value;localStorage.setItem('socle-personal-weather',JSON.stringify(value));render()}
function chooseWeatherCity(){modal('Choisir votre ville',`<form onsubmit="saveWeatherCity(event)"><label>Ville<input name="city" required autocomplete="address-level2" maxlength="100" value="${esc(personalWeather?.name==='Ma position'?'':personalWeather?.name||'')}" placeholder="Ex. Namur"></label><p class="help-line">La ville sert uniquement à afficher votre météo personnelle.</p><p id="weatherCityError" class="form-error" role="alert"></p><div class="modal-actions"><button type="button" class="btn" onclick="closeModal()">Annuler</button><button class="btn primary">Afficher la météo</button></div></form>`)}
async function saveWeatherCity(event){event.preventDefault();const form=event.target,city=String(new FormData(form).get('city')||'').trim(),button=form.querySelector('button[type="submit"],button:not([type])'),error=document.querySelector('#weatherCityError');if(!city)return;if(button)button.disabled=true;if(error)error.textContent='';try{const result=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fr&format=json`),place=(await result.json()).results?.[0];if(!place)throw Error('Ville introuvable. Vérifiez l’orthographe.');closeModal();savePersonalWeather({name:place.name,latitude:place.latitude,longitude:place.longitude})}catch(problem){if(error)error.textContent=problem.message||'La recherche de ville est momentanément indisponible.';if(button)button.disabled=false}}
function useMyWeatherPosition(){if(!navigator.geolocation)return toast('La géolocalisation n’est pas disponible sur cet appareil.');navigator.geolocation.getCurrentPosition(position=>savePersonalWeather({name:'Ma position',latitude:position.coords.latitude,longitude:position.coords.longitude}),()=>toast('Position non autorisée. Vous pouvez choisir une ville manuellement.'),{enableHighAccuracy:false,timeout:10000})}
async function showPersonalWeather(){const place=personalWeather,key=place&&'personal:'+place.latitude+':'+place.longitude;if(!place)return chooseWeatherCity();let data=key&&weatherByTown[key];if(!data?.daily?.time?.length)data=await loadPersonalWeather(true);if(data?.daily?.time?.length&&typeof showWeatherForecast==='function')showWeatherForecast('Météo',place.name,data)}
function personalWeatherCard(){const place=personalWeather;if(!place)return `<section class="panel personal-weather"><div><p class="eyebrow">MÉTÉO PERSONNELLE</p><h2>Choisissez votre ville</h2><p>Vous pouvez la modifier quand vous voulez.</p></div><div><button class="btn primary" onclick="chooseWeatherCity()">Choisir une ville</button><button class="btn" onclick="useMyWeatherPosition()">Utiliser ma position</button></div></section>`;const data=weatherByTown['personal:'+place.latitude+':'+place.longitude]?.daily,available=Boolean(data?.time?.length);return `<section class="panel personal-weather"><button type="button" class="personal-weather-summary" aria-label="Ouvrir les prévisions météo à ${esc(place.name)}" onclick="showPersonalWeather()"><span class="personal-weather-symbol" aria-hidden="true">${data?weatherIcon(data.weather_code[0]):'🌤️'}</span><span class="personal-weather-copy"><span class="eyebrow">MÉTÉO PERSONNELLE · AUJOURD’HUI</span><strong>${esc(place.name)}</strong><span>${data?weatherLabel(data.weather_code[0])+' · '+Math.round(data.temperature_2m_max[0])+'° / '+Math.round(data.temperature_2m_min[0])+'°':'Chargement des prévisions…'}</span><small>${available?'Touchez pour voir les prévisions sur 5 jours':'Les prévisions vont s’ouvrir dès leur chargement'}</small></span><span class="personal-weather-open" aria-hidden="true">${available?'Voir 5 jours ↗':'…'}</span></button><div class="personal-weather-actions"><button class="btn" onclick="chooseWeatherCity()">Changer de ville</button><button class="btn" onclick="useMyWeatherPosition()">Ma position</button></div></section>`}
async function loadPersonalWeather(force=false){const place=personalWeather;if(!place)return null;const key='personal:'+place.latitude+':'+place.longitude;if(weatherByTown[key]&&!force)return weatherByTown[key];try{const response=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset&timezone=auto&forecast_days=5`);weatherByTown[key]={place:{name:place.name},daily:(await response.json()).daily,loadedAt:Date.now()};if(view==='home')render();return weatherByTown[key]}catch{toast('La météo est momentanément indisponible.');return null}}
let projectTasksState={};
async function loadProjectTasks(projectId){if(projectTasksState[projectId]?.loading)return;projectTasksState[projectId]={loading:true,tasks:[]};try{const response=await fetch('/api/projects/'+encodeURIComponent(projectId)+'/tasks',{cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error);projectTasksState[projectId]={loading:false,tasks:data.tasks||[]}}catch(error){projectTasksState[projectId]={loading:false,error:error.message,tasks:[]}}if(view==='jobWorkspace')render()}
async function updateServerTask(taskId,status){const response=await fetch('/api/tasks/'+encodeURIComponent(taskId),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status})}),data=await response.json();if(!response.ok)return toast(data.error||'Mise à jour refusée.');delete projectTasksState[currentJobId];render();toast('Statut de tâche mis à jour.');}
async function openTaskComments(taskId){const task=Object.values(projectTasksState).flatMap(state=>state?.tasks||[]).find(item=>String(item.id)===String(taskId)),title=task?.title||'Tâche',response=await fetch('/api/tasks/'+encodeURIComponent(taskId)+'/comments',{cache:'no-store'}),data=await response.json();if(!response.ok)return toast(data.error||'Commentaires indisponibles.');modal('Commentaires · '+title,`<div class="task-comments">${(data.comments||[]).map(comment=>`<p><strong>${esc(comment.author)}</strong><br>${esc(comment.body)}</p>`).join('')||'<p class="subtle">Aucun commentaire.</p>'}</div><form onsubmit="sendTaskComment(event,'${jsString(taskId)}')"><textarea name="body" required maxlength="4000" placeholder="Ajouter un commentaire…"></textarea><div class="modal-actions"><button class="btn primary">Envoyer</button></div></form>`)}
async function sendTaskComment(event,taskId){event.preventDefault();const body=new FormData(event.target).get('body').trim(),response=await fetch('/api/tasks/'+encodeURIComponent(taskId)+'/comments',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({body})}),data=await response.json();if(!response.ok)return toast(data.error||'Commentaire refusé.');closeModal();toast('Commentaire ajouté.');}
function projectTasksPanel(){const state=projectTasksState[currentJobId];if(!state){queueMicrotask(()=>loadProjectTasks(currentJobId));return `<section class="panel"><h2>Tâches du chantier</h2><p class="subtle">Chargement…</p></section>`}if(state.error)return `<section class="panel"><h2>Tâches du chantier</h2><p class="notice">${esc(state.error)}</p></section>`;return `<section class="panel"><div class="panel-head"><h2>Tâches du chantier</h2><span class="subtle">Données sécurisées</span></div>${state.tasks.length?state.tasks.map(task=>`<div class="detail-row"><span><strong>${esc(task.title)}</strong><small>${esc(task.status)} · priorité ${esc(task.priority)}</small></span><span><button class="link" onclick="openTaskComments('${jsString(task.id)}')">Commentaires</button>${task.status==='todo'?`<button class="btn" onclick="updateServerTask('${jsString(task.id)}','in_progress')">Commencer</button>`:task.status==='in_progress'?`<button class="btn" onclick="updateServerTask('${jsString(task.id)}','done')">Terminer</button>`:''}</span></div>`).join(''):'<div class="empty">Aucune tâche qui vous est attribuée.</div>'}</section>`}
const renderBeforeLocalSessionGuard=render;
render=function(){
  const limited=typeof sessionAccessKey!=='undefined'&&sessionAccessKey!=='owner';
  if(limited&&view==='jobWorkspace'&&jobWorkspaceTab==='finance')jobWorkspaceTab='summary';
  if(limited&&view==='accounting'&&!canViewModule('accounting'))view=canViewModule('planning')?'planning':'personal';
  if(limited&&view==='profitability'&&!canFieldAction('viewProfitability'))view=canViewModule('planning')?'planning':'personal';
  if(limited&&!canViewModule(view))view=canViewModule('home')?'home':canViewModule('planning')?'planning':'personal';
  renderBeforeLocalSessionGuard();
  if(view==='jobWorkspace'){const main=document.querySelector('#main');if(main&&!main.querySelector('[data-server-tasks]'))main.insertAdjacentHTML('beforeend',`<div data-server-tasks>${projectTasksPanel()}</div>`)}

  if(!limited)return;
  const nav=document.querySelector('#nav');
  if(nav)nav.innerHTML=tabs2.filter(([key])=>canViewModule(key)).map(([key,label])=>`<button class="${view===key?'active':''}" onclick="navigate('${key}')">${label}</button>`).join('');
  document.querySelectorAll('.job-workspace-tabs button').forEach(button=>{if(button.textContent.includes('Achats & rentabilité'))button.remove()});
  if(!canViewModule('contacts'))document.querySelectorAll('#main .panel').forEach(panel=>{if([...panel.querySelectorAll('h2')].some(title=>title.textContent.trim()==='Contacts du chantier'))panel.remove()});
  const legacyActions=/\b(personForm|contactForm|jobForm|invoiceForm|supplierBillForm|assetForm|assignForm|reminderForm)\s*\(/;
  document.querySelectorAll('#main [onclick]').forEach(control=>{if(legacyActions.test(control.getAttribute('onclick')||'')){control.setAttribute('aria-disabled','true');control.onclick=event=>{event.preventDefault();toast('Cette ancienne action est désactivée pour un accès limité. Utilisez les actions sécurisées disponibles.')}}});
};
