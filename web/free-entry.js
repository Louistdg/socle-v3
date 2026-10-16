// Descriptive values are suggestions; identities, permissions and workflow states remain linked choices.
function enhanceFreeEntry(root=document){
  const allowed={saveMultiReminder:['kind'],saveAssignedReminder:['kind'],saveWorkerAlert:['kind'],createAction:['kind'],saveCompanyEvent:['type'],saveContact:['type'],saveCustomAsset:['category','mode'],saveAsset:['category','mode'],savePerson:['contract','category'],saveCompany:['region']};
  root.querySelectorAll('form').forEach(form=>{
    const handler=(form.getAttribute('onsubmit')||'').match(/(\w+)\(/)?.[1];
    for(const name of allowed[handler]||[]){
      const select=form.querySelector(`select[name="${name}"]`);if(!select||select.onchange)continue;
      const listId='suggestions-'+crypto.randomUUID(),input=document.createElement('input'),list=document.createElement('datalist');
      input.name=name;input.type='text';input.value=select.value;input.required=true;input.maxLength=120;input.setAttribute('list',listId);input.placeholder='Choisissez une suggestion ou écrivez votre texte';input.className='free-entry';
      list.id=listId;for(const option of select.options){const item=document.createElement('option');item.value=option.value;list.append(item)}
      select.replaceWith(input,list);
      const hint=document.createElement('small');hint.className='free-entry-hint';hint.textContent='Suggestion ou texte libre';list.after(hint);
    }
    if(['saveMultiReminder','saveAssignedReminder','saveWorkerAlert','createAction'].includes(handler)){
      const title=form.querySelector('[name="title"]'),note=form.querySelector('[name="note"]');
      if(title){title.placeholder='Écrivez la tâche à faire';const label=title.closest('label');if(label)form.prepend(label)}
      if(note&&title){note.rows=6;note.placeholder='Écrivez vos consignes, les détails utiles et ce que la personne doit faire…';note.classList.add('task-instructions');const label=note.closest('label');if(label)title.closest('label').after(label)}
    }
  });
}
const modalBeforeFreeEntry=modal;
modal=function(title,body){modalBeforeFreeEntry(title,body);enhanceFreeEntry(document.querySelector('#modalbody'))};
const renderBeforeFreeEntry=render;
render=function(){renderBeforeFreeEntry();enhanceFreeEntry(document.querySelector('#main'))};
// Keep custom values selected when an existing record is reopened.
const eventFormBeforeFreeEntry=companyEventForm;
companyEventForm=function(id,...args){eventFormBeforeFreeEntry(id,...args);const item=companyEvents.find(e=>e.id===id);if(item){const input=document.querySelector('#modal [name="type"]');if(input)input.value=item.type}};
const assetFormBeforeFreeEntry=assetForm;
assetForm=function(id){assetFormBeforeFreeEntry(id);const item=assets.find(a=>a.id===id);if(item)for(const name of ['category','mode']){const input=document.querySelector(`#modal [name="${name}"]`);if(input)input.value=item[name]||''}for(const name of ['customCategory','customMode']){const input=document.querySelector(`#modal [name="${name}"]`);if(input){input.value='';input.closest('label').hidden=true}}};
const personFormBeforeFreeEntry=personForm;
personForm=function(id){personFormBeforeFreeEntry(id);const root=document.querySelector('#modalbody');enhanceFreeEntry(root);const person=getPerson(id);if(person)for(const name of ['contract','category']){const input=root.querySelector(`form [name="${name}"]`);if(input)input.value=person[name]||''}};
