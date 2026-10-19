/* Formulaires : validation immédiate, Entrée contrôlée, garde-fou de sortie. */
(function(){
'use strict';
var pending=false, dirtyForms=new Set(), sequence=0;
function fieldLabel(field){
  var label=field.closest('label');
  if(label&&String(label.textContent||'').trim())return String(label.textContent).replace(field.value||'','').trim();
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
function trackDirty(form){
  form.dataset.sxDirty='1';
  if(form.closest('#modal,dialog'))dirtyForms.add(form);
}
function enhanceForm(form){
  if(form.dataset.sxForm==='1')return;
  form.dataset.sxForm='1';
  form.addEventListener('focusout',function(event){var field=event.target;if(field.matches&&field.matches('input,select,textarea')){field.dataset.sxTouched='1';validateField(field,true)}},true);
  form.addEventListener('input',function(event){var field=event.target;if(field.matches&&field.matches('input,select,textarea')){trackDirty(form);if(field.dataset.sxTouched==='1'||field.getAttribute('aria-invalid')==='true')validateField(field,true)}},true);
  form.addEventListener('change',function(){trackDirty(form)},true);
  form.addEventListener('keydown',function(event){if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();if(typeof form.requestSubmit==='function')form.requestSubmit();else form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));}},true);
  form.addEventListener('submit',function(event){
    var invalid=fields(form).filter(function(field){field.dataset.sxTouched='1';return !validateField(field,true)});
    if(invalid.length){event.preventDefault();event.stopImmediatePropagation();invalid[0].focus();}
    else{form.dataset.sxDirty='';dirtyForms.delete(form)}
  },true);
  fields(form).forEach(function(field){if(field.required)field.setAttribute('aria-required','true')});
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
