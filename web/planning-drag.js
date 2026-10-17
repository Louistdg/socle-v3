// Optional desktop pointer movement for the server-backed planning board.
// The existing two-step interaction remains the sole touch interaction.
const iaBPlanningDragMedia=window.matchMedia('(hover: hover) and (pointer: fine)');
let iaBPlanningDragSource=null;
const iaBPlanningCardBeforeDrag=iaBAssignmentCard;
iaBPlanningDragMedia.addEventListener?.('change',()=>{if(view==='planning')render()});

function iaBPlanningDragAvailable(){return iaBPlanningDragMedia.matches&&iaBCanManage()}
function iaBPlanningSetTargets(activeDate=''){
  const sourceCard=document.querySelector('#main .ia-b-slot.is-lifted');
  if(sourceCard){if(activeDate){const label=iaBDate(activeDate).toLocaleDateString('fr-BE',{weekday:'long',day:'numeric'});sourceCard.dataset.movePlaceholder='Déplacée vers '+label}else sourceCard.dataset.movePlaceholder='Déplacée vers un autre jour'}
  document.querySelectorAll('#main .ia-b-week-day').forEach(day=>{
    const active=Boolean(activeDate)&&day.dataset.planningDate===activeDate;
    day.classList.toggle('is-move-target',Boolean(iaBMoveSelection));
    day.classList.toggle('is-drag-over',active);
    day.classList.toggle('is-target-invalid',Boolean(active&&iaBPlanningTargetConflict(iaBPlanningDragSource?.id,activeDate)));
  });
}

function iaBPlanningTargetConflict(id,date){
  if(!id||!date)return false;
  const source=(iaBPlanningState.data?.assignments||[]).find(row=>String(row.id)===String(id));
  if(!source)return false;
  return (iaBPlanningState.data?.assignments||[]).some(row=>String(row.id)!==String(id)&&row.date===date&&row.status!=='cancelled'&&(String(row.team)===String(source.team)||(row.people||[]).some(person=>(source.people||[]).map(String).includes(String(person)))));
}

let iaBPlanningSaveState={status:'',message:'',undo:null,retry:null,timer:0};
function iaBPlanningStatus(){
  let status=document.querySelector('#main .ia-b-move-status');
  const head=document.querySelector('#main .ia-b-planning-head');
  if(!head)return null;
  if(!status){status=document.createElement('div');status.className='ia-b-move-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');head.append(status)}
  status.dataset.state=iaBPlanningSaveState.status;
  status.replaceChildren(document.createTextNode(iaBPlanningSaveState.message));
  if(iaBPlanningSaveState.undo){const undo=document.createElement('button');undo.type='button';undo.className='ia-b-move-undo';undo.textContent='Annuler';status.append(undo)}
  if(iaBPlanningSaveState.retry){const retry=document.createElement('button');retry.type='button';retry.className='ia-b-move-retry';retry.textContent='Réessayer';status.append(retry)}
  status.querySelector('.ia-b-move-undo')?.addEventListener('click',()=>{const record=iaBPlanningSaveState.undo;iaBPlanningSaveState.undo=null;if(record)iaBPlanningCommitMove(record.id,record.to,record.from,{undo:true})});
  status.querySelector('.ia-b-move-retry')?.addEventListener('click',()=>{const retry=iaBPlanningSaveState.retry;if(retry)iaBPlanningCommitMove(retry.id,retry.from,retry.to)});
  return status;
}
function iaBPlanningSetSaveStatus(status,message,actions={}){
  clearTimeout(iaBPlanningSaveState.timer);
  iaBPlanningSaveState={...iaBPlanningSaveState,status,message,undo:actions.undo||null,retry:actions.retry||null,timer:0};
  iaBPlanningStatus();
  if(status==='saved')iaBPlanningSaveState.timer=setTimeout(()=>{iaBPlanningSaveState.status='';iaBPlanningSaveState.message='';iaBPlanningSaveState.undo=null;iaBPlanningStatus()},2000);
}
function iaBPlanningSelectedBar(){
  document.querySelector('#main .ia-b-move-touch-bar')?.remove();
  if(!iaBMoveSelection)return;
  const bar=document.createElement('div');bar.className='ia-b-move-touch-bar';bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');
  bar.innerHTML='<span>Affectation choisie · toucher le jour de destination</span><button type="button">Annuler</button>';
  bar.querySelector('button').addEventListener('click',iaBCancelMove);
  document.body.append(bar);
}

async function iaBPlanningCommitMove(id,from,to,{undo=false,keyboard=false}={}){
  const row=(iaBPlanningState.data?.assignments||[]).find(item=>String(item.id)===String(id));
  if(!row)return;
  const previous=String(row.date),shiftDays=Math.round((iaBDate(to)-iaBDate(from))/86400000);
  row.date=to;
  iaBMoveSelection=null;
  iaBPlanningSetSaveStatus('saving','Enregistrement…');
  render();
  try{
    const result=await serverJson('/api/planning/replan',{method:'POST',body:JSON.stringify({scope:'assignment',assignmentId:String(id),shiftDays,reason:'Déplacement depuis le planning',operationKey:'planning-move-'+crypto.randomUUID()})});
    if(!result?.ok)throw Error(result?.error||'Le serveur n’a pas confirmé le déplacement.');
    await iaBLoadPlanning(true);
    const label=iaBDate(to).toLocaleDateString('fr-BE',{weekday:'long',day:'numeric',month:'long'});
    iaBPlanningSetSaveStatus('saved',keyboard?'Affectation déplacée au '+label+' · Enregistré':'Enregistré · déplacée au '+label,undo?{}:{undo:{id:String(id),from,to}});
    if(!undo){clearTimeout(iaBPlanningSaveState.timer);iaBPlanningSaveState.timer=setTimeout(()=>{iaBPlanningSaveState.status='';iaBPlanningSaveState.message='';iaBPlanningSaveState.undo=null;iaBPlanningStatus()},8000)}
  }catch(error){
    row.date=previous;
    await iaBLoadPlanning(true);
    const reason=String(error?.message||'Déplacement refusé.');
    iaBPlanningSetSaveStatus('error','Non enregistré · '+reason,{retry:{id:String(id),from,to}});
    toast(reason);
  }
}

const iaBPlanningPlaceMove=iaBPlaceMove;
iaBPlaceMove=async function(date){
  const selected=iaBMoveSelection;
  if(!selected)return;
  if(date===selected.date){iaBCancelMove();return}
  return iaBPlanningCommitMove(selected.id,selected.date,date);
};

const iaBPlanningRender=render;
render=function(){const result=iaBPlanningRender.apply(this,arguments);queueMicrotask(()=>{iaBPlanningStatus();iaBPlanningSelectedBar()});return result};

document.addEventListener('pointerdown',event=>{
  const card=event.target.closest?.('#main .ia-b-slot[data-assignment-id]');
  if(!card||event.pointerType!=='touch'||!iaBCanManage())return;
  const id=card.dataset.assignmentId;
  const timer=setTimeout(()=>{card.dataset.longPressSelected='true';iaBSelectMove(id)},400);
  const cancel=()=>{clearTimeout(timer);document.removeEventListener('pointerup',cancel,true);document.removeEventListener('pointercancel',cancel,true)};
  document.addEventListener('pointerup',cancel,true);document.addEventListener('pointercancel',cancel,true);
},true);
document.addEventListener('click',event=>{
  const card=event.target.closest?.('#main .ia-b-slot[data-long-press-selected="true"]');
  if(card){delete card.dataset.longPressSelected;event.preventDefault();event.stopImmediatePropagation()}
},true);
document.addEventListener('keydown',event=>{
  const card=event.target.closest?.('#main .ia-b-slot[data-assignment-id]');
  if(!card||(!event.ctrlKey&&!event.metaKey)||!['ArrowLeft','ArrowRight'].includes(event.key)||!iaBCanManage())return;
  const item=(iaBPlanningState.data?.assignments||[]).find(row=>String(row.id)===card.dataset.assignmentId);if(!item)return;
  event.preventDefault();event.stopPropagation();
  iaBPlanningCommitMove(item.id,item.date,iaBAddDays(item.date,event.key==='ArrowRight'?1:-1),{keyboard:true});
},true);

iaBAssignmentCard=function(item,groupRows=null){
  const markup=iaBPlanningCardBeforeDrag(item,groupRows);
  if(markup.startsWith('<article'))return markup;
  let enhanced=markup.replace('<div class="ia-b-slot','<div tabindex="0" role="button" aria-keyshortcuts="Control+ArrowLeft Control+ArrowRight" aria-label="Affectation '+esc(item.date)+' · '+esc(iaBJob(item.job)?.name||'Chantier')+'" class="ia-b-slot');
  if(iaBPlanningDragAvailable())enhanced=enhanced.replace('<div tabindex="0"','<div draggable="true" tabindex="0"');
  return enhanced;
};

document.addEventListener('dragstart',event=>{
  const card=event.target.closest?.('#main .ia-b-slot[data-assignment-id]');
  if(!card||!iaBPlanningDragAvailable()){event.preventDefault();return}
  const item=(iaBPlanningState.data?.assignments||[]).find(row=>String(row.id)===card.dataset.assignmentId);
  if(!item){event.preventDefault();return}
  iaBPlanningDragSource={id:String(item.id),date:String(item.date)};
  iaBMoveSelection={...iaBPlanningDragSource};
  card.classList.add('is-move-selected','is-lifted');
  if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(item.id))}
  iaBPlanningSetTargets();
});

document.addEventListener('dragover',event=>{
  if(!iaBPlanningDragSource||!iaBPlanningDragAvailable())return;
  const target=event.target.closest?.('#main .ia-b-week-day[data-planning-date]');
  if(!target)return;
  event.preventDefault();
  if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  iaBPlanningSetTargets(target.dataset.planningDate);
});

document.addEventListener('drop',event=>{
  if(!iaBPlanningDragSource||!iaBPlanningDragAvailable())return;
  const target=event.target.closest?.('#main .ia-b-week-day[data-planning-date]');
  if(!target)return;
  event.preventDefault();
  const date=target.dataset.planningDate;
  iaBPlanningDragSource=null;
  iaBPlanningSetTargets();
  iaBPlaceMove(date);
});

function iaBFinishPlanningDrag(){
  if(!iaBPlanningDragSource)return;
  iaBPlanningDragSource=null;
  iaBMoveSelection=null;
  render();
}
document.addEventListener('dragend',iaBFinishPlanningDrag);
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||!iaBPlanningDragSource)return;
  event.preventDefault();
  iaBFinishPlanningDrag();
});
