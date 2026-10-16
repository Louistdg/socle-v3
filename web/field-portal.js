const fieldPortalState=new Map();
const fieldPortalStockState=new Map();
const fieldPortalInline=value=>esc(JSON.stringify(value));

function fieldPortalKey(prefix){
  return String(prefix||'field')+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
}
function fieldPortalClock(){
  const date=new Date();
  return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
}
function fieldPortalPersonName(data,personId){
  return data.team?.members?.find(item=>String(item.personId)===String(personId))?.name||String(personId||'');
}
function fieldPortalPhotoHtml(ids){
  if(!Array.isArray(ids)||!ids.length)return '';
  return '<div class="field-photo-strip">'+ids.map(id=>'<a href="/api/documents/'+encodeURIComponent(id)+'/preview" target="_blank" rel="noopener"><img src="/api/documents/'+encodeURIComponent(id)+'/preview" alt="Photo chantier"></a>').join('')+'</div>';
}
function fieldPortalGroup(title,content,{open=false,wide=false}={}){
  const safeTitle=esc(title);
  if(matchMedia('(max-width:760px)').matches)return '<details class="field-accordion '+(wide?'field-wide':'')+'" '+(open?'open':'')+'><summary>'+safeTitle+'</summary><div class="field-accordion-body">'+content+'</div></details>';
  return '<section class="'+(wide?'field-wide':'')+'"><h3>'+safeTitle+'</h3>'+content+'</section>';
}
function fieldPortalTaskHtml(task,data){
  const canUpdate=data.capabilities.manageTasks||String(task.assignedTo||'')===String(data.currentUser.userId||'');
  const checklist=(task.checklist||[]).map((item,index)=>{
    const disabled=canUpdate?'':' disabled';
    return '<label class="field-check"><input type="checkbox" '+(item.done?'checked ':'')+disabled+' onchange="fieldPortalToggleChecklist('+fieldPortalInline(task.id)+','+index+',this.checked)"> <span>'+esc(item.label)+'</span></label>';
  }).join('');
  const actions=[];
  if(canUpdate&&task.status==='todo')actions.push('<button class="btn small" onclick="fieldPortalSetTaskStatus('+fieldPortalInline(task.id)+','+fieldPortalInline('in_progress')+')">Commencer</button>');
  if(canUpdate&&task.status==='in_progress'){actions.push('<button class="btn small" onclick="fieldPortalSetTaskStatus('+fieldPortalInline(task.id)+','+fieldPortalInline('done')+')">Terminer</button>');actions.push('<button class="btn small ghost" onclick="fieldPortalSetTaskStatus('+fieldPortalInline(task.id)+','+fieldPortalInline('blocked')+')">Bloqué</button>')}
  if(canUpdate&&task.status==='blocked')actions.push('<button class="btn small" onclick="fieldPortalSetTaskStatus('+fieldPortalInline(task.id)+','+fieldPortalInline('in_progress')+')">Reprendre</button>');
  if(data.capabilities.manageTasks&&task.status==='done'&&!task.validatedAt)actions.push('<button class="btn small" onclick="fieldPortalValidateTask('+fieldPortalInline(task.id)+')">Valider</button>');
  const meta=[task.priority,task.dueAt?'Échéance '+task.dueAt:'',task.assignedTo?'Responsable '+(data.team.members.find(item=>String(item.userId)===String(task.assignedTo))?.name||task.assignedTo):'',task.validatedAt?'Validée':''].filter(Boolean).join(' · ');
  const materials=(task.materials||[]).length?'<small>Matériaux : '+esc(task.materials.map(item=>item.name+(item.quantity!=null?' '+item.quantity+(item.unit||''):'')).join(', '))+'</small>':'';
  return '<article class="field-card '+(task.kind==='problem'?'field-problem':'')+'"><div class="field-card-head"><strong>'+esc(task.title)+'</strong><span class="badge">'+esc(task.status)+'</span></div><p>'+esc(task.description||'')+'</p><small>'+esc(meta)+'</small>'+materials+checklist+fieldPortalPhotoHtml(task.photoDocumentIds)+'<div class="field-actions">'+actions.join('')+'</div></article>';
}
function fieldPortalNoteHtml(note){
  const buttons=note.canEdit?'<div class="field-actions"><button class="btn small ghost" onclick="fieldPortalEditNote('+fieldPortalInline(note.id)+')">Modifier</button><button class="btn small ghost" onclick="fieldPortalDeleteNote('+fieldPortalInline(note.id)+')">Supprimer</button></div>':'';
  return '<article class="field-card"><div class="field-card-head"><strong>'+esc(note.author||'Terrain')+'</strong><small>'+esc(note.date||'')+'</small></div><p>'+esc(note.text||'')+'</p>'+fieldPortalPhotoHtml(note.photoDocumentIds)+buttons+'</article>';
}
function fieldPortalQuoteHtml(quote,data){
  const lines=(quote.lines||[]).map(line=>{
    const price=data.capabilities.viewQuotePrices&&line.price!==undefined?' · '+Number(line.price).toLocaleString('fr-BE',{style:'currency',currency:'EUR'}):'';
    return '<li><strong>'+esc(line.label||'')+'</strong> · '+esc(String(line.qty??''))+' '+esc(line.unit||'')+price+(line.description?'<small>'+esc(line.description)+'</small>':'')+'</li>';
  }).join('');
  return '<article class="field-card"><strong>'+esc(quote.reference||quote.title||'Devis')+'</strong><ul class="field-technical-lines">'+lines+'</ul></article>';
}
function fieldPortalPanel(projectId){
  const state=fieldPortalState.get(String(projectId));
  if(!state||state.status==='loading')return '<section class="panel field-portal" data-field-portal><p class="eyebrow">TERRAIN</p><h2>Chantier du jour</h2><p class="subtle">Chargement du portail terrain…</p></section>';
  if(state.status==='error')return '<section class="panel field-portal" data-field-portal><p class="eyebrow">TERRAIN</p><h2>Chantier du jour</h2><p class="notice">'+esc(state.error||'Portail terrain indisponible.')+'</p></section>';
  const data=state.data,project=data.project||{},address=project.address||{},addressText=[address.street,address.postalCode,address.city].filter(Boolean).join(' · ');
  const assignment=data.team?.assignments?.[0],open=data.time?.openForCurrentUser;
  const topActions=[];
  if(data.capabilities.clockTeam&&assignment) {
    const teamPeople=(assignment.people||[]).map(String),openPeople=new Set((data.time?.entries||[]).filter(entry=>!entry.departure&&String(entry.teamId||entry.team||'')===String(assignment.teamId||'')).flatMap(entry=>(entry.people||[]).map(String)));
    if(teamPeople.some(personId=>!openPeople.has(personId)))topActions.push('<button class="btn" onclick="fieldPortalOpenTeamClock('+fieldPortalInline(projectId)+',\'arrival\')">Pointer l’arrivée de l’équipe</button>');
    if(teamPeople.some(personId=>openPeople.has(personId)))topActions.push('<button class="btn" onclick="fieldPortalOpenTeamClock('+fieldPortalInline(projectId)+',\'departure\')">Pointer le départ de l’équipe</button>');
  } else {
    if(data.capabilities.clockOwn&&data.currentUser.personId&&assignment&&!open)topActions.push('<button class="btn" onclick="fieldPortalClockIn('+fieldPortalInline(projectId)+')">Pointer mon arrivée</button>');
    if(data.capabilities.clockOwn&&open)topActions.push('<button class="btn" onclick="fieldPortalClockOut('+fieldPortalInline(projectId)+')">Pointer mon départ</button>');
  }
  if(data.capabilities.createNotes)topActions.push('<button class="btn ghost" onclick="fieldPortalOpenNote('+fieldPortalInline(projectId)+')">Ajouter une remarque</button>');
  if(data.capabilities.reportProblems)topActions.push('<button class="btn ghost" onclick="fieldPortalOpenProblem('+fieldPortalInline(projectId)+')">Signaler un problème</button>');
  if(data.capabilities.manageTasks)topActions.push('<button class="btn ghost" onclick="fieldPortalOpenTask('+fieldPortalInline(projectId)+')">Créer une tâche</button>');
  if(data.capabilities.consumeStock)topActions.push('<button class="btn ghost" onclick="fieldPortalOpenStockConsume('+fieldPortalInline(projectId)+')">📦 Prendre du stock</button>');
  const members=(data.team?.members||[]).map(member=>'<span class="field-chip">'+esc(member.name)+'</span>').join('');
  const timeRows=(data.time?.entries||[]).map(entry=>'<div class="detail-row"><span>'+esc((entry.people||[]).map(id=>fieldPortalPersonName(data,id)).join(', '))+'</span><b>'+esc(entry.arrival||'')+(entry.departure?' → '+esc(entry.departure):' · en cours')+'</b></div>').join('')||'<p class="subtle">Aucun pointage visible aujourd’hui.</p>';
  const tasks=(data.tasks||[]).map(task=>fieldPortalTaskHtml(task,data)).join('')||'<p class="subtle">Aucune tâche visible.</p>';
  const notes=(data.notes||[]).map(fieldPortalNoteHtml).join('')||'<p class="subtle">Aucune remarque terrain.</p>';
  const materials=(data.materials||[]).map(item=>'<div class="detail-row"><span>'+esc(item.name)+'</span><b>'+item.delivered+'/'+item.quantity+' '+esc(item.unit||'')+'</b></div>').join('')||'<p class="subtle">Aucun besoin matériel renseigné.</p>';
  const assets=(data.assets||[]).map(item=>'<article class="field-card"><strong>'+esc(item.name)+'</strong><small>'+esc([item.group,item.condition,item.attached].filter(Boolean).join(' · '))+'</small>'+(item.issues||[]).map(issue=>'<p class="notice">'+esc(issue.severity+' · '+issue.description)+'</p>').join('')+'</article>').join('')||'<p class="subtle">Aucun matériel affecté visible.</p>';
  const documents=(data.documents?.items||[]).map(doc=>'<a class="field-doc" href="/api/documents/'+encodeURIComponent(doc.id)+'/preview" target="_blank" rel="noopener">'+esc(doc.title||'Document')+'</a>').join('')||'<p class="subtle">Aucun document autorisé.</p>';
  const photos=fieldPortalPhotoHtml((data.photos?.items||[]).map(photo=>photo.id));
  const quotes=(data.quotes||[]).map(quote=>fieldPortalQuoteHtml(quote,data)).join('')||'<p class="subtle">Aucun devis technique autorisé.</p>';
  const alerts=(data.notifications||[]).map(item=>'<div class="notice"><strong>'+esc(item.title)+'</strong> · '+esc(item.text)+'</div>').join('');
  return '<section class="panel field-portal" data-field-portal>'+
    '<div class="panel-head"><div><p class="eyebrow">TERRAIN · '+esc(data.currentUser.role||'')+'</p><h2>'+esc(project.name||'Chantier')+'</h2><span>'+esc(project.reference||'')+(addressText?' · '+esc(addressText):'')+'</span></div><span class="badge green">Serveur</span></div>'+
    (alerts?'<div class="field-alerts">'+alerts+'</div>':'')+
    '<div class="field-actions field-primary-actions">'+topActions.join('')+'</div>'+
    '<div class="field-portal-grid">'+
      fieldPortalGroup('Équipe du jour','<div class="field-chips">'+members+'</div><div class="field-time-list">'+timeRows+'</div>',{open:true})+
      fieldPortalGroup('Tâches','<div class="field-stack">'+tasks+'</div>')+
      fieldPortalGroup('Remarques & photos',photos+'<div class="field-stack">'+notes+'</div>')+
      fieldPortalGroup('Matériaux',materials)+
      fieldPortalGroup('Matériel sur chantier','<div class="field-stack">'+assets+'</div>')+
      fieldPortalGroup('Documents utiles','<div class="field-docs">'+documents+'</div>')+
      fieldPortalGroup('Devis technique','<div class="field-stack">'+quotes+'</div>',{wide:true})+
    '</div></section>';
}
async function loadFieldPortal(projectId,force=false){
  const key=String(projectId||'');if(!key)return;
  const current=fieldPortalState.get(key);if(!force&&(current?.status==='loading'||current?.status==='ready'))return;
  fieldPortalState.set(key,{status:'loading'});
  try{fieldPortalState.set(key,{status:'ready',data:await serverJson('/api/projects/'+encodeURIComponent(key)+'/field-portal')})}
  catch(error){fieldPortalState.set(key,{status:'error',error:error.message||'Portail terrain indisponible.'})}
  if(typeof render==='function'&&view==='jobWorkspace'&&String(currentJobId||'')===key)render();
}
async function fieldPortalAction(action,projectId){
  try{await action();await loadFieldPortal(projectId,true);if(typeof toast==='function')toast('Enregistré.')}
  catch(error){if(typeof toast==='function')toast(error.message||'Action refusée.');else alert(error.message||'Action refusée.')}
}
async function fieldPortalClockIn(projectId){
  const data=fieldPortalState.get(String(projectId))?.data,personId=data?.currentUser?.personId,assignment=(data?.team?.assignments||[]).find(item=>(item.people||[]).map(String).includes(String(personId)));
  if(!personId||!assignment){if(typeof toast==='function')toast('Aucune affectation du jour pour ce chantier.');return}
  await fieldPortalAction(()=>serverJson('/api/time-entries/arrival',{method:'POST',body:JSON.stringify({projectId:String(projectId),teamId:String(assignment.teamId||''),date:data.date,people:[{personId:String(personId),arrival:fieldPortalClock()}],note:''})}),projectId);
}
async function fieldPortalClockOut(projectId){
  const data=fieldPortalState.get(String(projectId))?.data,entry=data?.time?.openForCurrentUser,personId=data?.currentUser?.personId;
  if(!entry||!personId)return;
  await fieldPortalAction(()=>serverJson('/api/time-entries/'+encodeURIComponent(entry.id)+'/departure',{method:'POST',body:JSON.stringify({departure:fieldPortalClock(),personIds:[String(personId)],note:''})}),projectId);
}
function fieldPortalOpenTeamClock(projectId,direction){
  const data=fieldPortalState.get(String(projectId))?.data,assignment=(data?.team?.assignments||[])[0];if(!data||!assignment)return;
  const memberMap=new Map((data.team?.members||[]).map(member=>[String(member.personId),member.name||String(member.personId)])),entries=(data.time?.entries||[]).filter(entry=>!entry.departure&&String(entry.teamId||entry.team||'')===String(assignment.teamId||'')),openByPerson=new Map();
  for(const entry of entries)for(const personId of entry.people||[])openByPerson.set(String(personId),entry);
  const ids=(assignment.people||[]).map(String).filter(personId=>direction==='arrival'?!openByPerson.has(personId):openByPerson.has(personId));if(!ids.length)return;
  const actionLabel=direction==='arrival'?'Pointer les personnes présentes':'Pointer les départs sélectionnés',options=ids.map(personId=>'<label class="field-check"><input type="checkbox" name="personIds" value="'+esc(personId)+'" checked> <span>'+esc(memberMap.get(personId)||personId)+'</span></label>').join('');
  fieldPortalDialog('<form class="stack" id="field-team-clock-form" onsubmit="fieldPortalSubmitTeamClock(event)"><h2>'+actionLabel+'</h2><p class="subtle">Coche uniquement les personnes concernées. Tu peux laisser décochée une personne absente ou avec un horaire différent.</p><input type="hidden" name="projectId" value="'+esc(projectId)+'"><input type="hidden" name="direction" value="'+direction+'"><input type="hidden" name="teamId" value="'+esc(assignment.teamId||'')+'"><label>Heure<input name="time" type="time" value="'+fieldPortalClock()+'" required></label><div class="field-stack">'+options+'</div><label>Note facultative<textarea name="note" rows="2" maxlength="500"></textarea></label><button class="btn" type="submit">Confirmer le pointage</button></form>');
}
async function fieldPortalSubmitTeamClock(event){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form),projectId=String(data.get('projectId')||''),state=fieldPortalState.get(projectId)?.data,assignment=(state?.team?.assignments||[]).find(item=>String(item.teamId||'')===String(data.get('teamId')||'')),selected=[...new Set(data.getAll('personIds').map(String))];if(!assignment||!selected.length)return;
  const time=String(data.get('time')||''),note=String(data.get('note')||'').trim(),direction=String(data.get('direction')||'');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){if(typeof toast==='function')toast('Choisis une heure valide.');return}
  const allowed=new Set((assignment.people||[]).map(String));if(selected.some(personId=>!allowed.has(personId))){if(typeof toast==='function')toast('La sélection ne correspond plus à l’équipe affectée. Recharge le chantier.');return}
  const button=form.querySelector('button[type="submit"]');if(button)button.disabled=true;
  try{
    if(direction==='arrival')await serverJson('/api/time-entries/arrival',{method:'POST',body:JSON.stringify({projectId,teamId:String(assignment.teamId||''),date:state.date,people:selected.map(personId=>({personId,arrival:time})),note})});
    else if(direction==='departure'){
      const openByEntry=new Map();for(const entry of state.time?.entries||[]){if(entry.departure)continue;const people=(entry.people||[]).map(String).filter(personId=>selected.includes(personId));if(!people.length)continue;const ids=openByEntry.get(entry.id)||[];ids.push(...people);openByEntry.set(entry.id,ids)}
      for(const [entryId,personIds] of openByEntry)await serverJson('/api/time-entries/'+encodeURIComponent(entryId)+'/departure',{method:'POST',body:JSON.stringify({departure:time,personIds,note})});
    } else return;
    document.querySelector('#modal')?.close();await loadFieldPortal(projectId,true);if(typeof toast==='function')toast('Pointage de l’équipe enregistré.');
  }catch(error){if(typeof toast==='function')toast(error.message||'Pointage refusé.');else alert(error.message||'Pointage refusé.');if(button)button.disabled=false}
}
async function fieldPortalSetTaskStatus(taskId,status){
  const entry=[...fieldPortalState.entries()].find(([,value])=>value.data?.tasks?.some(task=>String(task.id)===String(taskId)));if(!entry)return;
  await fieldPortalAction(()=>serverJson('/api/tasks/'+encodeURIComponent(taskId),{method:'PATCH',body:JSON.stringify({status})}),entry[0]);
}
async function fieldPortalToggleChecklist(taskId,index,done){
  const entry=[...fieldPortalState.entries()].find(([,value])=>value.data?.tasks?.some(task=>String(task.id)===String(taskId)));if(!entry)return;
  const task=entry[1].data.tasks.find(item=>String(item.id)===String(taskId)),checklist=(task.checklist||[]).map((item,i)=>({...item,done:i===index?Boolean(done):Boolean(item.done)}));
  await fieldPortalAction(()=>serverJson('/api/tasks/'+encodeURIComponent(taskId),{method:'PATCH',body:JSON.stringify({checklist})}),entry[0]);
}
async function fieldPortalValidateTask(taskId){
  const entry=[...fieldPortalState.entries()].find(([,value])=>value.data?.tasks?.some(task=>String(task.id)===String(taskId)));if(!entry)return;
  await fieldPortalAction(()=>serverJson('/api/tasks/'+encodeURIComponent(taskId)+'/validate',{method:'POST',body:'{}'}),entry[0]);
}
function fieldPortalDialog(html){
  const dialog=document.querySelector('#modal'),body=document.querySelector('#modalbody');if(!dialog||!body)return;body.innerHTML=html;dialog.showModal();
}
async function fieldPortalOpenStockConsume(projectId){
  const key=String(projectId),operationKey=fieldPortalKey('stock-consume');
  fieldPortalStockState.set(key,{options:[],query:''});
  fieldPortalDialog('<form class="stack" id="field-stock-consume-form" onsubmit="fieldPortalSubmitStockConsume(event)"><h2>📦 Prendre du stock</h2><input type="hidden" name="projectId" value="'+esc(projectId)+'"><input type="hidden" name="operationKey" value="'+esc(operationKey)+'"><label>Rechercher par nom ou référence<div class="field-actions"><input name="query" autocomplete="off" placeholder="Ex. ardoise"><button class="btn ghost" type="button" onclick="fieldPortalSearchStockFromForm('+fieldPortalInline(projectId)+')">Rechercher</button></div></label><label>Article<select name="stockItemId" required onchange="fieldPortalStockItemChanged('+fieldPortalInline(projectId)+')"><option value="">Chargement…</option></select></label><label>Entrepôt<select name="sourceLocationId" required onchange="fieldPortalStockLocationChanged('+fieldPortalInline(projectId)+')"></select></label><p class="subtle" data-stock-availability>Disponibilité en cours de chargement…</p><label>Quantité<input name="quantity" type="number" min="0.001" step="0.001" inputmode="decimal" required></label><label>Note facultative<textarea name="note" rows="3" maxlength="500"></textarea></label><p class="notice" data-stock-result hidden></p><button class="btn" type="submit">Confirmer la sortie chantier</button></form>');
  await fieldPortalSearchStock(projectId,'');
}
function fieldPortalStockForm(){return document.querySelector('#field-stock-consume-form')}
async function fieldPortalSearchStockFromForm(projectId){const form=fieldPortalStockForm();if(!form)return;await fieldPortalSearchStock(projectId,String(new FormData(form).get('query')||''))}
async function fieldPortalSearchStock(projectId,query){
  const key=String(projectId),state=fieldPortalStockState.get(key)||{options:[]};state.query=String(query||'');fieldPortalStockState.set(key,state);
  try{
    const result=await serverJson('/api/projects/'+encodeURIComponent(key)+'/stock-consume/options?q='+encodeURIComponent(state.query)),next=fieldPortalStockState.get(key);
    if(!next||next.query!==state.query)return;
    next.options=Array.isArray(result.options)?result.options:[];fieldPortalStockState.set(key,next);fieldPortalRenderStockOptions(projectId);
  }catch(error){const form=fieldPortalStockForm();if(form){const info=form.querySelector('[data-stock-availability]');if(info)info.textContent=error.message||'Stock indisponible.'}}
}
function fieldPortalRenderStockOptions(projectId){
  const form=fieldPortalStockForm(),state=fieldPortalStockState.get(String(projectId));if(!form||!state)return;
  const itemSelect=form.elements.stockItemId,previous=String(itemSelect.value||''),items=new Map();
  for(const option of state.options||[])if(!items.has(String(option.id)))items.set(String(option.id),option);
  itemSelect.innerHTML=items.size?[...items.values()].map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+(item.reference?' · '+esc(item.reference):'')+' · '+esc(item.unit||'')+'</option>').join(''):'<option value="">Aucun article disponible</option>';
  if(previous&&items.has(previous))itemSelect.value=previous;
  fieldPortalStockItemChanged(projectId);
}
function fieldPortalStockItemChanged(projectId){
  const form=fieldPortalStockForm(),state=fieldPortalStockState.get(String(projectId));if(!form||!state)return;
  const itemId=String(form.elements.stockItemId.value||''),locations=(state.options||[]).filter(option=>String(option.id)===itemId),select=form.elements.sourceLocationId;
  select.innerHTML=locations.map(option=>'<option value="'+esc(option.location.id)+'">'+esc(option.location.name)+' · disponible '+esc(String(option.available))+' '+esc(option.unit||'')+'</option>').join('')||'<option value="">Aucun entrepôt autorisé</option>';
  fieldPortalStockLocationChanged(projectId);
}
function fieldPortalStockLocationChanged(projectId){
  const form=fieldPortalStockForm(),state=fieldPortalStockState.get(String(projectId));if(!form||!state)return;
  const itemId=String(form.elements.stockItemId.value||''),locationId=String(form.elements.sourceLocationId.value||''),option=(state.options||[]).find(item=>String(item.id)===itemId&&String(item.location?.id)===locationId),info=form.querySelector('[data-stock-availability]');
  if(info)info.textContent=option?option.name+(option.reference?' · '+option.reference:'')+' · '+option.available+' '+(option.unit||'')+' disponible(s) à '+option.location.name:'Aucun stock autorisé pour cette sélection.';
}
async function fieldPortalSubmitStockConsume(event){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form),projectId=String(data.get('projectId')||''),button=form.querySelector('button[type="submit"]'),resultNode=form.querySelector('[data-stock-result]'),quantity=Number(data.get('quantity'));
  if(!Number.isFinite(quantity)||quantity<=0){if(resultNode){resultNode.hidden=false;resultNode.textContent='Quantité invalide.'}return}
  button.disabled=true;
  try{
    const payload={stockItemId:String(data.get('stockItemId')||''),sourceLocationId:String(data.get('sourceLocationId')||''),quantity,note:String(data.get('note')||''),operationKey:String(data.get('operationKey')||'')},result=await serverJson('/api/projects/'+encodeURIComponent(projectId)+'/stock-consume',{method:'POST',body:JSON.stringify(payload)});
    if(resultNode){resultNode.hidden=false;resultNode.textContent=result.replayed?'Sortie déjà enregistrée — aucune duplication.':'Sortie chantier enregistrée.'}
    form.elements.quantity.value='';form.elements.note.value='';form.elements.operationKey.value=fieldPortalKey('stock-consume');
    await fieldPortalSearchStock(projectId,String(form.elements.query.value||''));await loadFieldPortal(projectId,true);
    if(typeof toast==='function')toast(result.replayed?'Stock déjà enregistré.':'Stock pris pour ce chantier.');
  }catch(error){if(resultNode){resultNode.hidden=false;resultNode.textContent=error.message||'Sortie de stock refusée.'}else if(typeof toast==='function')toast(error.message||'Sortie de stock refusée.')}
  finally{button.disabled=false}
}
function fieldPortalOpenNote(projectId){
  fieldPortalDialog('<form class="stack" onsubmit="fieldPortalSubmitNote(event)"><h2>Remarque chantier</h2><input type="hidden" name="projectId" value="'+esc(projectId)+'"><label>Remarque<textarea name="text" rows="4"></textarea></label><label>Photos<input type="file" name="photos" accept="image/*" multiple></label><button class="btn" type="submit">Enregistrer</button></form>');
}
function fieldPortalOpenProblem(projectId){
  fieldPortalDialog('<form class="stack" onsubmit="fieldPortalSubmitProblem(event)"><h2>Signaler un problème</h2><input type="hidden" name="projectId" value="'+esc(projectId)+'"><label>Catégorie<select name="category"><option value="equipment">Matériel cassé</option><option value="materials">Manque de matériaux</option><option value="safety">Sécurité</option><option value="site_error">Erreur chantier</option><option value="technical">Problème technique</option><option value="other">Autre</option></select></label><label>Commentaire<textarea name="comment" rows="4" required></textarea></label><label>Photos<input type="file" name="photos" accept="image/*" multiple></label><button class="btn" type="submit">Signaler</button></form>');
}
function fieldPortalOpenTask(projectId){
  const data=fieldPortalState.get(String(projectId))?.data,members=(data?.team?.members||[]).filter(item=>item.userId);
  const options='<option value="">Non attribuée</option>'+members.map(item=>'<option value="'+esc(item.userId)+'">'+esc(item.name)+'</option>').join('');
  fieldPortalDialog('<form class="stack" onsubmit="fieldPortalSubmitTask(event)"><h2>Nouvelle tâche</h2><input type="hidden" name="projectId" value="'+esc(projectId)+'"><label>Titre<input name="title" required></label><label>Description<textarea name="description" rows="3"></textarea></label><label>Responsable<select name="assignedTo">'+options+'</select></label><label>Priorité<select name="priority"><option value="normal">Normale</option><option value="high">Haute</option><option value="urgent">Urgente</option><option value="low">Basse</option></select></label><label>Échéance<input name="dueAt" type="date"></label><label>Checklist — une ligne par élément<textarea name="checklist" rows="4"></textarea></label><label>Matériaux nécessaires — une ligne par matériau<textarea name="materials" rows="3"></textarea></label><button class="btn" type="submit">Créer</button></form>');
}
async function fieldPortalUploadPhotos(projectId,files,prefix){
  const ids=[];let index=0;
  for(const file of files){if(!file||!file.size)continue;const form=new FormData();form.append('file',file);form.append('title',file.name);form.append('operationKey',prefix+'-photo-'+index++);const result=await serverJson('/api/projects/'+encodeURIComponent(projectId)+'/field-photos',{method:'POST',body:form});ids.push(result.document.id)}
  return ids;
}
async function fieldPortalSubmitNote(event){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form),projectId=String(data.get('projectId')),prefix=fieldPortalKey('note');
  try{const photoDocumentIds=await fieldPortalUploadPhotos(projectId,data.getAll('photos'),prefix);await serverJson('/api/projects/'+encodeURIComponent(projectId)+'/notes',{method:'POST',body:JSON.stringify({text:String(data.get('text')||''),visibility:'Équipe et patron',photoDocumentIds,operationKey:prefix+'-note'})});document.querySelector('#modal')?.close();await loadFieldPortal(projectId,true)}
  catch(error){if(typeof toast==='function')toast(error.message||'Remarque refusée.')}
}
async function fieldPortalSubmitProblem(event){
  event.preventDefault();const form=event.currentTarget,data=new FormData(form),projectId=String(data.get('projectId')),prefix=fieldPortalKey('problem');
  try{const photoDocumentIds=await fieldPortalUploadPhotos(projectId,data.getAll('photos'),prefix);await serverJson('/api/projects/'+encodeURIComponent(projectId)+'/problems',{method:'POST',body:JSON.stringify({category:String(data.get('category')),comment:String(data.get('comment')||''),photoDocumentIds,operationKey:prefix+'-problem'})});document.querySelector('#modal')?.close();await loadFieldPortal(projectId,true)}
  catch(error){if(typeof toast==='function')toast(error.message||'Signalement refusé.')}
}
async function fieldPortalSubmitTask(event){
  event.preventDefault();const data=new FormData(event.currentTarget),projectId=String(data.get('projectId')),checklist=String(data.get('checklist')||'').split('\n').map(value=>value.trim()).filter(Boolean).map((label,index)=>({id:'check-'+index,label,done:false})),materials=String(data.get('materials')||'').split('\n').map(value=>value.trim()).filter(Boolean).map(name=>({name}));
  await fieldPortalAction(()=>serverJson('/api/projects/'+encodeURIComponent(projectId)+'/tasks',{method:'POST',body:JSON.stringify({title:String(data.get('title')||''),description:String(data.get('description')||''),assignedTo:String(data.get('assignedTo')||''),priority:String(data.get('priority')||'normal'),dueAt:String(data.get('dueAt')||''),checklist,materials,operationKey:fieldPortalKey('task')})}),projectId);document.querySelector('#modal')?.close();
}
async function fieldPortalEditNote(noteId){
  const entry=[...fieldPortalState.entries()].find(([,value])=>value.data?.notes?.some(note=>String(note.id)===String(noteId)));if(!entry)return;const note=entry[1].data.notes.find(item=>String(item.id)===String(noteId)),text=prompt('Modifier la remarque',note.text||'');if(text===null)return;
  await fieldPortalAction(()=>serverJson('/api/projects/'+encodeURIComponent(entry[0])+'/notes/'+encodeURIComponent(noteId),{method:'PATCH',body:JSON.stringify({text})}),entry[0]);
}
async function fieldPortalDeleteNote(noteId){
  const entry=[...fieldPortalState.entries()].find(([,value])=>value.data?.notes?.some(note=>String(note.id)===String(noteId)));if(!entry||!confirm('Supprimer cette remarque ?'))return;
  await fieldPortalAction(()=>serverJson('/api/projects/'+encodeURIComponent(entry[0])+'/notes/'+encodeURIComponent(noteId),{method:'DELETE'}),entry[0]);
}

const renderBeforeFieldPortal=render;
render=function(){
  renderBeforeFieldPortal();
  if(view!=='jobWorkspace'||!currentJobId)return;
  const main=document.querySelector('#main');if(!main||main.querySelector('[data-field-portal]'))return;
  const key=String(currentJobId),hub=main.querySelector('[data-project-hub]'),html=fieldPortalPanel(key);
  if(hub)hub.insertAdjacentHTML('beforebegin',html);else main.insertAdjacentHTML('beforeend',html);
  if(!fieldPortalState.has(key))queueMicrotask(()=>loadFieldPortal(key));
};
