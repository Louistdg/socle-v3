// Optional desktop pointer movement for the server-backed planning board.
// The existing two-step interaction remains the sole touch interaction.
const iaBPlanningDragMedia=window.matchMedia('(hover: hover) and (pointer: fine)');
let iaBPlanningDragSource=null;
const iaBPlanningCardBeforeDrag=iaBAssignmentCard;
iaBPlanningDragMedia.addEventListener?.('change',()=>{if(view==='planning')render()});

function iaBPlanningDragAvailable(){return iaBPlanningDragMedia.matches&&iaBCanManage()}
function iaBPlanningSetTargets(activeDate=''){
  document.querySelectorAll('#main .ia-b-week-day').forEach(day=>{
    const active=Boolean(activeDate)&&day.dataset.planningDate===activeDate;
    day.classList.toggle('is-move-target',Boolean(iaBMoveSelection));
    day.classList.toggle('is-drag-over',active);
  });
}

iaBAssignmentCard=function(item,groupRows=null){
  const markup=iaBPlanningCardBeforeDrag(item,groupRows);
  if(!iaBPlanningDragAvailable()||markup.startsWith('<article'))return markup;
  return markup.replace('<div class="ia-b-slot','<div draggable="true" class="ia-b-slot');
};

document.addEventListener('dragstart',event=>{
  const card=event.target.closest?.('#main .ia-b-slot[data-assignment-id]');
  if(!card||!iaBPlanningDragAvailable()){event.preventDefault();return}
  const item=(iaBPlanningState.data?.assignments||[]).find(row=>String(row.id)===card.dataset.assignmentId);
  if(!item){event.preventDefault();return}
  iaBPlanningDragSource={id:String(item.id),date:String(item.date)};
  iaBMoveSelection={...iaBPlanningDragSource};
  card.classList.add('is-move-selected');
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
