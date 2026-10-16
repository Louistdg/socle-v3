/* Small, idempotent enhancements shared by dynamically rendered legacy views. */
(()=>{'use strict';
function enhance(root=document){
  document.body.dataset.auditRoute=typeof view==='string'?view:'home';
  const masthead=document.querySelector('#socleMasthead');
  if(masthead){masthead.setAttribute('role','region');masthead.setAttribute('aria-label','Présentation de SOCLE');}
  root.querySelectorAll('th:empty').forEach(th=>{th.scope='col';const label=document.createElement('span');label.className='sr-only';label.textContent='Actions';th.append(label);});
  const person=root.querySelector('form input[name=jointCommittee]')?.form;
  if(person&&!person.querySelector('.audit-person-identity')){const identity=document.createElement('div');identity.className='form-two audit-person-identity';['name','role'].forEach(name=>{const label=person.querySelector('input[name="'+name+'"]')?.closest('label');if(label)identity.append(label);});person.prepend(identity);}
  root.querySelectorAll('.owner-invitation-panel,.sensitive-panel').forEach(panel=>{if(panel.dataset.collapsible)return;panel.dataset.collapsible='true';const details=document.createElement('details');details.className='audit-panel-details';details.open=innerWidth>760;const summary=document.createElement('summary');summary.textContent=panel.querySelector('h2')?.textContent||'Réglages';details.append(summary);const content=document.createElement('div');content.className='audit-panel-details-body';content.append(...panel.childNodes);details.append(content);panel.append(details);});
  root.querySelectorAll('.purchase-line').forEach(row=>{
    const names={lineReference:'Référence',lineLabel:'Article ou service',lineQuantity:'Quantité',lineUnit:'Unité',linePrice:'Prix HTVA',lineVat:'TVA (%)'};
    row.querySelectorAll('input,select').forEach(input=>{if(input.parentElement.tagName==='LABEL')return;const label=document.createElement('label');label.textContent=names[input.name]||input.name;input.before(label);label.append(input);});
  });
  root.querySelectorAll('.permission-row:not(.permission-head)>label').forEach((label,index)=>{if(label.querySelector('.permission-action-label'))return;const text=document.createElement('span');text.className='permission-action-label';text.textContent=['Voir','Ajouter','Modifier'][index%3];label.append(text);});
  root.querySelectorAll('.permission-table').forEach(table=>{
    if(table.dataset.grouped)return;table.dataset.grouped='true';
    const rows=[...table.querySelectorAll('.permission-row:not(.permission-head)')];
    const groups=[['Activité et terrain',rows.slice(0,7)],['Gestion et suivi',rows.slice(7,14)],['Administration',rows.slice(14)]];
    groups.forEach(([name,items])=>{if(!items.length)return;const group=document.createElement('details');group.className='permission-group';group.open=innerWidth>760;const summary=document.createElement('summary');summary.textContent=name+' · '+items.length+' rubriques';group.append(summary,...items);table.append(group);});
  });
  const directory=root.querySelector('.access-directory');
  if(directory&&!directory.querySelector('.access-member-select')){
    const label=document.createElement('label');label.className='access-member-select';label.textContent='Personne à consulter';const select=document.createElement('select');
    directory.querySelectorAll('.access-member-list>button').forEach(button=>{const option=document.createElement('option');option.textContent=button.innerText.replace(/\s+/g,' ').trim();option.value=String(select.options.length);option.selected=button.classList.contains('selected');select.append(option);});
    select.addEventListener('change',()=>directory.querySelectorAll('.access-member-list>button')[Number(select.value)]?.click());label.append(select);directory.querySelector('.access-directory-head')?.after(label);
  }
  root.querySelectorAll('select').forEach(select=>{[...select.options].forEach(option=>{const labels={warehouse:'Dépôt',planned:'Planifié',confirmed:'Confirmé',blocked:'Bloqué',cancelled:'Annulé'};if(labels[option.textContent.trim()]){const value=option.value;option.textContent=labels[option.textContent.trim()];option.value=value;}});});
  root.querySelectorAll('.filter-pills,.module-switch,.management-tabs,.v3-section-tabs,.job-tabs').forEach(tabs=>{if(tabs.scrollWidth<=tabs.clientWidth+2)return;tabs.style.scrollbarWidth='thin';if(tabs.previousElementSibling?.className!=='audit-scroll-hint'){const hint=document.createElement('small');hint.className='audit-scroll-hint';hint.textContent='Faites défiler les onglets horizontalement →';tabs.before(hint);}const selected=tabs.querySelector('.selected,[aria-current],[aria-pressed=true]');if(selected&&selected.offsetLeft>tabs.scrollLeft+tabs.clientWidth-selected.clientWidth)tabs.scrollLeft=selected.offsetLeft;});
  root.querySelectorAll('.empty').forEach(empty=>{if(empty.dataset.guided||empty.querySelector('button'))return;empty.dataset.guided='true';const help={gallery:'Créez un album pour rassembler les photos d’un chantier.',messages:'Créez une conversation avec les personnes autorisées pour commencer un échange.',jobs:'Ajoutez votre premier chantier pour retrouver ses documents et ses équipes.',contacts:'Ajoutez un contact : sa fiche sera réutilisable dans les devis et les achats.'}[typeof view==='string'?view:''];if(help){const p=document.createElement('p');p.className='audit-empty-help';p.textContent=help;empty.append(p);}});
  root.querySelectorAll('button').forEach(button=>{if(/^\+?\s*Créer une tâche$/.test(button.textContent.trim())&&button.getAttribute('onclick')==='reminderForm()')button.setAttribute('onclick','auditTaskForm()');});
  root.querySelectorAll('.quote-draft-folders .album-card').forEach(card=>{const img=card.querySelector('img');if(img)img.alt='Croquis du relevé — '+(card.querySelector('strong')?.textContent||'visite');});
  root.querySelectorAll('.ia-b-week-day>h3,.ia-b-day-column>h3').forEach(h=>{const h2=document.createElement('h2');h2.className=h.className;h2.innerHTML=h.innerHTML;h.replaceWith(h2);});
}
const baseRender=render;render=function(){if(globalThis.socleWorkspaceLoading)return;const result=baseRender.apply(this,arguments);enhance();return result;};
globalThis.auditTaskForm=function(){const result=reminderForm();const title=document.querySelector('#modalbody .modal-top h2,#modalbody h2');if(title)title.textContent='Créer une tâche';return result;};
document.addEventListener('DOMContentLoaded',()=>{
  enhance();
  const modalBody=document.querySelector('#modalbody');if(modalBody)new MutationObserver(()=>enhance(modalBody)).observe(modalBody,{childList:true,subtree:true});
  const header=document.querySelector('header.topbar');
  if(header){const button=header.querySelector('.socle-mobile-search-toggle');button?.addEventListener('click',()=>{modal('Rechercher partout','<div class="global-search audit-mobile-search"><label>Recherche<input type="search" id="auditGlobalSearch" autocomplete="off" placeholder="Chantier, contact, document…" oninput="auditSearchEverywhere(this.value)"></label></div>');document.querySelector('#auditGlobalSearch')?.focus();});}
});
globalThis.auditSearchEverywhere=function(value){const original=document.querySelector('header .global-search'),dialog=document.querySelector('.audit-mobile-search');if(!dialog)return;original?.classList.remove('global-search');try{searchEverywhere(value);dialog.querySelectorAll('.search-results button').forEach(button=>button.addEventListener('click',()=>{if(document.querySelector('#modal')?.open)closeModal();},{once:true,capture:true}));}finally{original?.classList.add('global-search');}};
document.addEventListener('keydown',event=>{
  const root=document.querySelector('#organizationLabel');if(!root?.contains(event.target))return;
  const trigger=root.querySelector('.organization-mobile-trigger'),items=[...root.querySelectorAll('.organization-choices [role=menuitem]:not(:disabled)')];
  if(!items.length)return;
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();setSocleMobileOrganizationMenu(root,true);let index=items.indexOf(document.activeElement);index=event.key==='Home'?0:event.key==='End'?items.length-1:index<0?(event.key==='ArrowUp'?items.length-1:0):(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[index].focus();}
  if(event.key==='Escape'){setSocleMobileOrganizationMenu(root,false);trigger?.focus();}
});
})();
