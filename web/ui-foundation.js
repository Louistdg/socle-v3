(function(){
'use strict';

let generatedId=0;
let activeOverlay=null;
let interactionHandlersInstalled=false;

function asArray(value){
  if(value==null)return[];
  return Array.isArray(value)?value:[value];
}

function element(tag,className){
  const node=document.createElement(tag);
  if(className)node.className=className;
  return node;
}

function append(node,children){
  for(const child of asArray(children)){
    if(child==null)continue;
    if(child instanceof Node)node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
  return node;
}

function nextId(prefix){
  generatedId+=1;
  return (prefix||'ui-foundation')+'-'+generatedId;
}

// Legacy renderers still return strings. Parse only trusted, escaped application markup,
// then let Foundation own the shared structure before serializing it back to HTML.
function fromLegacyMarkup(markup){
  const template=document.createElement('template');
  template.innerHTML=String(markup||'');
  return template.content;
}

function renderHTML(node){
  if(!(node instanceof Node))throw new TypeError('renderHTML attend un nœud DOM Foundation');
  if(node.nodeType===Node.ELEMENT_NODE)return node.outerHTML;
  const container=document.createElement('div');
  container.appendChild(node.cloneNode(true));
  return container.innerHTML;
}

function nodesFrom(value){
  if(value==null)return[];
  if(value instanceof DocumentFragment)return Array.from(value.childNodes);
  if(value instanceof Node)return[value];
  return[];
}

function appendFilterControl(parent,value,className){
  const descriptor=value instanceof Node?{control:value}:value||{};
  const control=descriptor.control;
  if(!(control instanceof Node))return;
  const wrapper=element('div','ui-filter-control'+(className?' '+className:''));
  const labelText=descriptor.label||(control.dataset&&control.dataset.label);
  if(labelText){
    if(!control.id)control.id=nextId('ui-filter');
    const label=element('label','');
    label.htmlFor=control.id;
    label.textContent=String(labelText);
    wrapper.appendChild(label);
    if(control.dataset)delete control.dataset.label;
  }
  wrapper.appendChild(control);
  parent.appendChild(wrapper);
}

function PageShell(options){
  const config=options||{};
  const node=element(config.tag||'section','ui-page-shell');
  node.dataset.uiFoundation='PageShell';
  if(config.id)node.id=String(config.id);
  if(config.label)node.setAttribute('aria-label',String(config.label));
  append(node,config.children);
  return node;
}

function ContextLine(options){
  const config=typeof options==='string'?{items:[options]}:(options||{});
  const node=element('div','ui-context-line');
  node.dataset.uiFoundation='ContextLine';
  node.setAttribute('role','note');
  for(const item of asArray(config.items)){
    if(item==null||String(item).trim()==='')continue;
    const part=element('span','ui-context-line__item');
    part.textContent=String(item);
    node.appendChild(part);
  }
  return node;
}

function PrimaryAction(options){
  const config=typeof options==='string'?{label:options}:(options||{});
  const node=element('button','ui-primary-action');
  node.dataset.uiFoundation='PrimaryAction';
  node.type=config.type||'button';
  node.textContent=String(config.label||'Action');
  if(config.id)node.id=String(config.id);
  if(config.name)node.name=String(config.name);
  if(config.ariaLabel)node.setAttribute('aria-label',String(config.ariaLabel));
  if(config.disabled)node.disabled=true;
  if(typeof config.onClick==='function')node.addEventListener('click',config.onClick);
  return node;
}

function PageHeader(options){
  const config=options||{};
  const node=element('header','ui-page-header');
  node.dataset.uiFoundation='PageHeader';
  const copy=element('div','ui-page-header__copy');
  const title=element(config.titleTag||'h1','ui-page-title');
  title.textContent=String(config.title||'');
  copy.appendChild(title);
  if(config.subtitle){
    const subtitle=element('p','ui-page-subtitle');
    subtitle.textContent=String(config.subtitle);
    copy.appendChild(subtitle);
  }
  if(config.context)copy.appendChild(config.context instanceof Node?config.context:ContextLine(config.context));
  node.appendChild(copy);
  const actions=asArray(config.actions).filter(Boolean);
  if(actions.length){
    const actionBar=element('div','ui-page-header__actions');
    append(actionBar,actions);
    node.appendChild(actionBar);
  }
  return node;
}

function CompactFilterBar(options){
  const config=options||{};
  const sheet=typeof config.sheet==='object'?config.sheet:(config.sheet?{}:null);
  const classes=['ui-compact-filter-bar'];
  if(sheet)classes.push('ui-compact-filter-bar--sheet');
  if(config.className)classes.push(String(config.className).split(/\s+/).filter(Boolean).join(' '));
  const node=element('div',classes.join(' '));
  node.dataset.uiFoundation='CompactFilterBar';
  node.setAttribute('role','search');
  if(config.label)node.setAttribute('aria-label',String(config.label));

  if(config.search)appendFilterControl(node,config.search,'ui-filter-control--search');

  if(sheet){
    const sheetId=String(sheet.id||nextId('ui-filter-sheet'));
    const titleId=String(sheet.titleId||nextId('ui-filter-sheet-title'));
    const closeLabel=String(sheet.closeLabel||'Fermer les filtres');
    const toggle=element('button','ui-filter-sheet-toggle');
    toggle.type='button';
    toggle.setAttribute('aria-controls',sheetId);
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('data-ui-filter-toggle',sheetId);
    const toggleText=element('span','');
    toggleText.textContent=String(sheet.toggleLabel||'Filtres');
    toggle.appendChild(toggleText);
    if(Number(sheet.count)>0){
      const count=element('strong','');
      count.textContent=String(sheet.count);
      toggle.appendChild(count);
    }
    node.appendChild(toggle);

    const sheetRoot=element('div','ui-filter-sheet');
    sheetRoot.id=sheetId;
    sheetRoot.dataset.open='false';
    sheetRoot.setAttribute('role','group');
    sheetRoot.setAttribute('aria-label',String(sheet.label||sheet.title||'Filtres'));
    const backdrop=element('button','ui-filter-sheet__backdrop');
    backdrop.type='button';
    backdrop.tabIndex=-1;
    backdrop.setAttribute('aria-label',closeLabel);
    backdrop.setAttribute('data-ui-filter-close',sheetId);
    sheetRoot.appendChild(backdrop);

    const panel=element('div','ui-filter-sheet__panel');
    const header=element('div','ui-filter-sheet__header');
    const title=element('h2','ui-filter-sheet__title');
    title.id=titleId;
    title.textContent=String(sheet.title||'Filtres');
    header.appendChild(title);
    const close=element('button','ui-filter-sheet-close');
    close.type='button';
    close.setAttribute('aria-label',closeLabel);
    close.setAttribute('data-ui-filter-close',sheetId);
    close.textContent='×';
    header.appendChild(close);
    panel.appendChild(header);
    for(const control of asArray(config.controls))appendFilterControl(panel,control);
    if(config.reset)append(panel,config.reset);
    sheetRoot.appendChild(panel);
    node.appendChild(sheetRoot);
  }else{
    for(const control of asArray(config.controls))appendFilterControl(node,control);
    if(config.reset)append(node,config.reset);
  }

  const actions=asArray(config.actions).filter(Boolean);
  if(actions.length){
    const actionBar=element('div','ui-filter-actions');
    append(actionBar,actions);
    node.appendChild(actionBar);
  }
  return node;
}

function focusableWithin(node){
  return Array.from(node.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])'))
    .filter(item=>item.getClientRects().length>0);
}

function lockBackground(node){
  const inertStates=[];
  let branch=node;
  while(branch&&branch!==document.body){
    const parent=branch.parentElement;
    if(!parent)break;
    for(const sibling of Array.from(parent.children)){
      if(sibling===branch)continue;
      inertStates.push([sibling,Boolean(sibling.inert)]);
      sibling.inert=true;
    }
    branch=parent;
  }
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  return()=>{
    for(const [element,wasInert] of inertStates)element.inert=wasInert;
    document.body.style.overflow=previousOverflow;
  };
}

function activateOverlay(node,trigger,kind){
  if(activeOverlay)closeActiveOverlay(false);
  activeOverlay={node,trigger:trigger||null,kind,unlock:lockBackground(node)};
}

function closeActiveOverlay(restoreFocus){
  if(!activeOverlay)return false;
  const current=activeOverlay;
  activeOverlay=null;
  current.unlock();
  if(current.kind==='filter'){
    current.node.dataset.open='false';
    current.node.setAttribute('role','group');
    current.node.setAttribute('aria-hidden','true');
    current.node.removeAttribute('aria-modal');
    current.node.removeAttribute('aria-labelledby');
    const toggle=document.querySelector('[data-ui-filter-toggle="'+CSS.escape(current.node.id)+'"]');
    toggle?.setAttribute('aria-expanded','false');
  }else{
    current.node.removeAttribute('aria-modal');
    current.node.setAttribute('role','region');
    current.node.removeAttribute('aria-labelledby');
    current.node.dataset.mobileOpen='false';
    const stage=current.node.closest('.ui-content-stage');
    if(stage)delete stage.dataset.mobileDetailOpen;
  }
  if(restoreFocus!==false&&current.trigger?.isConnected)current.trigger.focus();
  return true;
}

function setCompactFilterSheetOpen(id,open,trigger){
  const sheet=document.getElementById(String(id||''));
  if(!sheet)return false;
  const next=Boolean(open);
  const toggle=trigger?.matches?.('.ui-filter-sheet-toggle')?trigger:document.querySelector('[data-ui-filter-toggle="'+CSS.escape(sheet.id)+'"]');
  if(!next){
    if(activeOverlay?.node===sheet)closeActiveOverlay(true);
    else{
      sheet.dataset.open='false';
      sheet.setAttribute('aria-hidden','true');
      toggle?.setAttribute('aria-expanded','false');
    }
    return false;
  }
  if(globalThis.matchMedia&& !globalThis.matchMedia('(max-width:760px)').matches)return false;
  if(sheet.dataset.open==='true')return true;
  sheet.dataset.open='true';
  sheet.setAttribute('role','dialog');
  sheet.setAttribute('aria-modal','true');
  const title=sheet.querySelector('.ui-filter-sheet__title');
  if(title){
    if(!title.id)title.id=nextId('ui-filter-title');
    sheet.setAttribute('aria-labelledby',title.id);
  }
  sheet.setAttribute('aria-hidden','false');
  toggle?.setAttribute('aria-expanded','true');
  activateOverlay(sheet,toggle,'filter');
  const initial=sheet.querySelector('.ui-filter-sheet__panel input:not([disabled]),.ui-filter-sheet__panel select:not([disabled]),.ui-filter-sheet__panel textarea:not([disabled])')||sheet.querySelector('.ui-filter-sheet-close');
  requestAnimationFrame(()=>initial?.focus?.());
  return true;
}

function toggleCompactFilterSheet(id,trigger,force){
  const sheet=document.getElementById(String(id||''));
  if(!sheet)return false;
  const next=typeof force==='boolean'?force:sheet.dataset.open!=='true';
  return setCompactFilterSheetOpen(id,next,trigger);
}

function KpiStrip(options){
  const config=options||{};
  const node=element('section','ui-kpi-strip');
  node.dataset.uiFoundation='KpiStrip';
  node.setAttribute('aria-label',String(config.label||'Indicateurs'));
  for(const item of asArray(config.items).slice(0,4)){
    const card=element('article','ui-kpi-card');
    if(item&&item.status)card.dataset.uiStatus=String(item.status);
    const label=element('span','ui-kpi-card__label');
    label.textContent=String(item&&item.label||'');
    const value=element('strong','ui-kpi-card__value');
    value.textContent=String(item&&item.value!=null?item.value:'');
    card.append(label,value);
    if(item&&item.detail){
      const detail=element('span','ui-kpi-card__detail');
      detail.textContent=String(item.detail);
      card.appendChild(detail);
    }
    node.appendChild(card);
  }
  return node;
}

function ContentSection(options){
  const config=options||{};
  const node=element(config.tag||'section','ui-content-section');
  node.dataset.uiFoundation='ContentSection';
  if(config.title||config.description||config.actions){
    const head=element('div','ui-content-section__head');
    const copy=element('div','');
    if(config.title){
      const title=element(config.titleTag||'h2','');
      title.textContent=String(config.title);
      copy.appendChild(title);
    }
    if(config.description){
      const description=element('p','');
      description.textContent=String(config.description);
      copy.appendChild(description);
    }
    head.appendChild(copy);
    if(config.actions)append(head,config.actions);
    node.appendChild(head);
  }
  const body=element('div','ui-content-section__body');
  append(body,config.children);
  node.appendChild(body);
  return node;
}

function ContentStage(options){
  const config=options||{};
  const node=element('div','ui-content-stage');
  node.dataset.uiFoundation='ContentStage';
  append(node,config.content);
  append(node,config.detail);
  return node;
}

function DetailDrilldown(options){
  const config=options||{};
  const node=element('aside','ui-detail-drilldown');
  node.dataset.uiFoundation='DetailDrilldown';
  node.id=String(config.id||nextId('ui-detail'));
  node.dataset.mobileOpen='false';
  node.setAttribute('role','region');
  node.setAttribute('aria-label',String(config.label||config.title||'Détail'));
  const head=element('div','ui-detail-drilldown__head');
  const copy=element('div','');
  if(config.title){
    const title=element('h2','');
    title.id=nextId('ui-detail-title');
    title.textContent=String(config.title);
    node.dataset.titleId=title.id;
    copy.appendChild(title);
  }
  if(config.description){
    const description=element('p','');
    description.textContent=String(config.description);
    copy.appendChild(description);
  }
  head.appendChild(copy);
  const close=element('button','ui-detail-drilldown__close');
  close.type='button';
  close.setAttribute('aria-label',String(config.closeLabel||'Retour à la liste'));
  close.setAttribute('data-ui-detail-close',node.id);
  close.textContent=String(config.closeLabel||'← Retour à la liste');
  head.appendChild(close);
  node.appendChild(head);
  const body=element('div','ui-detail-drilldown__body');
  append(body,config.children);
  node.appendChild(body);
  return node;
}

function openDetailDrilldown(id,trigger){
  const node=document.getElementById(String(id||''));
  if(!node)return false;
  if(globalThis.matchMedia&& !globalThis.matchMedia('(max-width:760px)').matches)return true;
  const stage=node.closest('.ui-content-stage');
  if(stage)stage.dataset.mobileDetailOpen=node.id;
  node.dataset.mobileOpen='true';
  node.setAttribute('role','dialog');
  node.setAttribute('aria-modal','true');
  const titleId=node.dataset.titleId;
  if(titleId)node.setAttribute('aria-labelledby',titleId);
  activateOverlay(node,trigger,'detail');
  requestAnimationFrame(()=>node.querySelector('[data-ui-detail-close]')?.focus?.());
  return true;
}

function installInteractionHandlers(){
  if(interactionHandlersInstalled||!globalThis.document?.addEventListener)return;
  interactionHandlersInstalled=true;
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const toggle=target.closest('[data-ui-filter-toggle]');
    if(toggle){
      event.preventDefault();
      toggleCompactFilterSheet(toggle.getAttribute('data-ui-filter-toggle'),toggle);
      return;
    }
    const filterClose=target.closest('[data-ui-filter-close]');
    if(filterClose){
      event.preventDefault();
      setCompactFilterSheetOpen(filterClose.getAttribute('data-ui-filter-close'),false,filterClose);
      return;
    }
    const detailOpen=target.closest('[data-ui-detail-open]');
    if(detailOpen){
      event.preventDefault();
      openDetailDrilldown(detailOpen.getAttribute('data-ui-detail-open'),detailOpen);
      return;
    }
    const detailClose=target.closest('[data-ui-detail-close]');
    if(detailClose){
      event.preventDefault();
      if(activeOverlay?.kind==='detail')closeActiveOverlay(true);
    }
  },true);
  document.addEventListener('keydown',event=>{
    if(!activeOverlay)return;
    if(event.key==='Escape'){
      event.preventDefault();
      closeActiveOverlay(true);
      return;
    }
    if(event.key!=='Tab')return;
    const items=focusableWithin(activeOverlay.node);
    if(!items.length){
      event.preventDefault();
      activeOverlay.node.focus?.();
      return;
    }
    const first=items[0],last=items[items.length-1],current=document.activeElement;
    if(event.shiftKey&&(current===first||!activeOverlay.node.contains(current))){
      event.preventDefault();
      last.focus();
    }else if(!event.shiftKey&&(current===last||!activeOverlay.node.contains(current))){
      event.preventDefault();
      first.focus();
    }
  },true);
  document.addEventListener('focusin',event=>{
    if(!activeOverlay||activeOverlay.node.contains(event.target))return;
    const first=focusableWithin(activeOverlay.node)[0];
    (first||activeOverlay.node).focus?.();
  },true);
}

CompactFilterBar.setSheetOpen=setCompactFilterSheetOpen;
CompactFilterBar.toggleSheet=toggleCompactFilterSheet;
DetailDrilldown.open=openDetailDrilldown;
installInteractionHandlers();

const SocleUI=Object.freeze({
  version:'UI-FOUNDATION-CONVERGENCE-01',
  PageShell,
  PageHeader,
  ContextLine,
  PrimaryAction,
  CompactFilterBar,
  KpiStrip,
  ContentSection,
  ContentStage,
  DetailDrilldown,
  fromLegacyMarkup,
  renderHTML
});

globalThis.SocleUI=SocleUI;
})();
