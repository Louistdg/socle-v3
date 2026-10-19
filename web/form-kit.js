/* Formulaires : validation immédiate, Entrée contrôlée, garde-fou de sortie. */
(function(){
'use strict';
var pending=false, dirtyForms=new Set(), drafts=new Map(), sequence=0;
function fieldLabel(field){
  var label=field.closest('label');
  if(label){
    var clone=label.cloneNode(true);
    clone.querySelectorAll('input,select,textarea,button,small').forEach(function(node){node.remove()});
    var text=String(clone.textContent||'').replace(/\s+/g,' ').trim();
    if(text)return text;
  }
  return field.getAttribute('aria-label')||field.name||'Ce champ';
}
function messageFor(field){
  if(field.validity.valueMissing)return 'Ce champ est obligatoire.';
  if(field.validity.typeMismatch)return field.type==='email'?'Adresse e-mail invalide.':'Format invalide.';
  if(field.validity.tooShort)return 'Ce champ est trop court ('+field.minLength+' caractères minimum).';
  if(field.validity.tooLong)return 'Ce champ est trop long.';
  if(field.validity.patternMismatch)return 'Le format ne correspond pas.';
  return '';
}
function errorNode(field){
  var id=field.getAttribute('data-sx-error-id');
  if(!id){id='sx-field-error-'+(++sequence);field.setAttribute('data-sx-error-id',id);}
  var node=document.getElementById(id);
  if(!node){node=document.createElement('p');node.id=id;node.className='sx-field-error';node.setAttribute('role','alert');field.insertAdjacentElement('afterend',node);}
  return node;
}
function setError(field,message){
  var node=errorNode(field);
  if(!message){field.removeAttribute('aria-invalid');node.hidden=true;node.textContent='';return;}
  field.setAttribute('aria-invalid','true');node.hidden=false;node.textContent=message;
  var described=String(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);
  if(!described.includes(node.id))described.push(node.id);
  field.setAttribute('aria-describedby',described.join(' '));
}
function validateField(field,show){
  if(!field||field.disabled||field.readOnly||field.type==='hidden'||field.type==='submit'||field.type==='button')return true;
  var message=messageFor(field);
  if(message&&show)setError(field,message);else if(!message)setError(field,'');
  return !message;
}
function fields(form){return Array.from(form.querySelectorAll('input,select,textarea')).filter(function(field){return field.willValidate&&field.type!=='hidden'&&field.type!=='submit'&&field.type!=='button'});}
function summaryValue(field){
  if(field.type==='checkbox')return field.checked?'Oui':'Non';
  if(field.type==='radio')return field.checked?field.value:'';
  if(field.multiple)return Array.from(field.selectedOptions).map(function(option){return option.textContent||option.value}).join(', ');
  if(field.tagName==='SELECT')return field.selectedOptions&&field.selectedOptions[0]?String(field.selectedOptions[0].textContent||field.value):field.value;
  return String(field.value||'').trim();
}
function updateFormSummary(form){
  var details=form.querySelector('.sx-form-summary');
  if(!details)return;
  var list=details.querySelector('dl');
  if(!list)return;
  list.replaceChildren();
  fields(form).slice(0,14).forEach(function(field){
    var value=summaryValue(field);
    if(!value||field.type==='password'||field.type==='file')return;
    var row=document.createElement('div');
    var term=document.createElement('dt');term.textContent=fieldLabel(field);
    var description=document.createElement('dd');description.textContent=value.length>90?value.slice(0,87)+'…':value;
    row.append(term,description);list.append(row);
  });
  if(!list.children.length){var empty=document.createElement('p');empty.className='sx-form-summary-empty';empty.textContent='Renseignez les champs pour voir le résumé.';list.append(empty);}
}
function setupFormSummary(form){
  if(fields(form).length<4||form.querySelector('.sx-form-summary'))return;
  var details=document.createElement('details');
  details.className='sx-form-summary';
  details.innerHTML='<summary>Résumé avant validation</summary><dl></dl>';
  var actions=form.querySelector('.modal-actions');
  if(actions)form.insertBefore(details,actions);else form.append(details);
  updateFormSummary(form);
}
function stateNode(form){
  var host=form.closest('dialog,#modal');
  if(!host)return null;
  var head=host.querySelector('.modal-top,.sx-dialog-head')||host;
  var node=head.querySelector('.sx-form-state');
  if(!node){node=document.createElement('span');node.className='sx-form-state';node.setAttribute('role','status');head.append(node);}
  return node;
}
function trackDirty(form){
  form.dataset.sxDirty='1';
  if(form.closest('#modal,dialog')){
    dirtyForms.add(form);
    var node=stateNode(form);
    if(node){node.hidden=false;node.textContent='Modifications non enregistrées';}
  }
}
function draftKey(form){
  if(form.dataset.sxDraftKey)return form.dataset.sxDraftKey;
  var host=form.closest('#modal,dialog');
  var title=(host&&host.querySelector('h1,h2,h3')?.textContent)||form.id||form.getAttribute('action')||'formulaire';
  form.dataset.sxDraftKey='sx-draft:'+String(title).trim().toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g,'-');
  return form.dataset.sxDraftKey;
}
function draftFields(form){
  return fields(form).filter(function(field){return field.name&&!['password','file','hidden'].includes(field.type);});
}
function saveDraft(form){
  if(!form.closest('#modal,dialog'))return;
  var values={};
  draftFields(form).forEach(function(field){
    if(field.type==='checkbox'||field.type==='radio')values[field.name]=field.checked;
    else if(field.multiple)values[field.name]=Array.from(field.selectedOptions).map(function(option){return option.value;});
    else values[field.name]=field.value;
  });
  drafts.set(draftKey(form),{at:Date.now(),values:values});
}
function restoreDraft(form){
  if(!form.closest('#modal,dialog'))return false;
  var draft=drafts.get(draftKey(form));
  if(!draft)return false;
  if(!draft.values||Date.now()-Number(draft.at||0)>86400000){drafts.delete(draftKey(form));return false;}
  draftFields(form).forEach(function(field){
    var value=draft.values[field.name];
    if(value===undefined)return;
    if(field.type==='checkbox'||field.type==='radio')field.checked=Boolean(value);
    else if(field.multiple&&Array.isArray(value))Array.from(field.options).forEach(function(option){option.selected=value.includes(option.value);});
    else field.value=String(value);
  });
  form.dataset.sxDirty='1';dirtyForms.add(form);
  var state=stateNode(form);if(state){state.hidden=false;state.textContent='Brouillon restauré';}
  return true;
}
function clearDraft(form){drafts.delete(draftKey(form));}
var draftTimers=new WeakMap();
function scheduleDraft(form){
  clearTimeout(draftTimers.get(form));
  draftTimers.set(form,setTimeout(function(){
    saveDraft(form);
    var state=stateNode(form);
    if(state){state.hidden=false;state.textContent='Brouillon enregistré';}
  },600));
}
function enhanceForm(form){
  if(form.dataset.sxForm==='1')return;
  form.dataset.sxForm='1';
  form.addEventListener('focusout',function(event){var field=event.target;if(field.matches&&field.matches('input,select,textarea')){field.dataset.sxTouched='1';validateField(field,true)}},true);
  form.addEventListener('input',function(event){var field=event.target;if(field.matches&&field.matches('input,select,textarea')){trackDirty(form);scheduleDraft(form);updateFormSummary(form);if(field.dataset.sxTouched==='1'||field.getAttribute('aria-invalid')==='true')validateField(field,true)}},true);
  form.addEventListener('change',function(){trackDirty(form);scheduleDraft(form);updateFormSummary(form)},true);
  form.addEventListener('keydown',function(event){if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();if(typeof form.requestSubmit==='function')form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}},true);
  form.addEventListener('submit',function(event){
    var invalid=fields(form).filter(function(field){field.dataset.sxTouched='1';return !validateField(field,true)});
    if(invalid.length){event.preventDefault();event.stopImmediatePropagation();invalid[0].focus();}
    else{form.dataset.sxDirty='';dirtyForms.delete(form);clearDraft(form);var state=stateNode(form);if(state){state.hidden=true;state.textContent='';}}
  },true);
  fields(form).forEach(function(field){if(field.required)field.setAttribute('aria-required','true')});
  setupFormSummary(form);
  restoreDraft(form);
}
function enhance(root){
  if(!root)return;
  root.querySelectorAll('form').forEach(enhanceForm);
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;enhance(document.querySelector('#main'));enhance(document.querySelector('#modal'));});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
var main=document.querySelector('#main'),modal=document.querySelector('#modal');
if(main)new MutationObserver(schedule).observe(main,{childList:true});
if(modal)new MutationObserver(schedule).observe(modal,{childList:true});
if(document.body)new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('beforeunload',function(event){
  if(!dirtyForms.size)return;
  event.preventDefault();event.returnValue='';
});
globalThis.sxValidateForm=function(form){return fields(form).every(function(field){field.dataset.sxTouched='1';return validateField(field,true)})};
})();
