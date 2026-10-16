let stockCatalogState='idle';
let stockCatalogError='';
let stockCatalogOrganizationId='';
let stockCatalogCategories=[];
let stockCatalogMetadata=new Map();
let stockCatalogCapabilities={manageItems:false,manageCategories:false,manageLocations:false,moveStock:false,viewCosts:false};
let stockCatalogRequestToken=0;
let stockCatalogQuery='';
let stockCatalogCategoryFilter='all';
let stockCatalogLocationFilter='all';
let stockCatalogLowOnly=false;

function stockCatalogActiveOrganization(){
  return String(globalThis.activeSocleOrganizationId||globalThis.socleCurrentOrganizationId||'');
}
function stockCatalogFormatQuantity(value){
  const quantity=Number(value||0);
  if(!Number.isFinite(quantity))return'0';
  return new Intl.NumberFormat('fr-BE',{maximumFractionDigits:3}).format(quantity);
}
function stockCatalogDate(value){
  if(!value)return'—';
  try{return typeof fullDate==='function'?fullDate(value):String(value)}catch{return String(value)}
}
function stockCatalogNormalize(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr-BE').replace(/[^a-z0-9]+/g,' ').trim();
}
function stockCatalogResetIfTenantChanged(){
  const active=stockCatalogActiveOrganization();
  if(stockCatalogOrganizationId&&active&&stockCatalogOrganizationId!==active){
    stockCatalogState='idle';stockCatalogError='';stockCatalogCategories=[];stockCatalogMetadata=new Map();
    stockCatalogCapabilities={manageItems:false,manageCategories:false,manageLocations:false,moveStock:false,viewCosts:false};
    stockCatalogQuery='';stockCatalogCategoryFilter='all';stockCatalogLocationFilter='all';stockCatalogLowOnly=false;
  }
  if(active&&!stockCatalogOrganizationId)stockCatalogOrganizationId=active;
}
async function loadStockCatalog(options){
  options=options||{};stockCatalogResetIfTenantChanged();
  if(stockCatalogState==='loading'&&!options.force)return;
  const token=++stockCatalogRequestToken,requestedOrg=stockCatalogActiveOrganization();
  stockCatalogState='loading';stockCatalogError='';
  try{
    const data=await serverJson('/api/stock-catalog');
    if(token!==stockCatalogRequestToken)return;
    const active=stockCatalogActiveOrganization();
    if(data.organizationId&&active&&String(data.organizationId)!==active){stockCatalogState='idle';return}
    if(requestedOrg&&active&&requestedOrg!==active){stockCatalogState='idle';return}
    stockCatalogOrganizationId=String(data.organizationId||active||requestedOrg||'');
    stockCatalogCategories=Array.isArray(data.categories)?data.categories:[];
    stockCatalogMetadata=new Map((Array.isArray(data.items)?data.items:[]).map(function(item){return[String(item.id),item]}));
    stockCatalogCapabilities=Object.assign({manageItems:false,manageCategories:false,manageLocations:false,moveStock:false,viewCosts:false},data.capabilities||{});
    stockCatalogState='ready';
  }catch(error){
    if(token!==stockCatalogRequestToken)return;
    stockCatalogState='error';stockCatalogError=error.message||'Catalogue stock indisponible.';
  }
  if(options.renderAfter!==false&&view==='stock')render();
}
function stockCatalogEnsureLoaded(){
  stockCatalogResetIfTenantChanged();
  if(stockCatalogState==='idle')queueMicrotask(function(){loadStockCatalog()});
}
function stockCatalogRoots(includeInactive,selectedId){
  return stockCatalogCategories.filter(function(category){
    return !category.parentId&&(includeInactive||category.status==='active'||String(category.id)===String(selectedId||''));
  }).sort(function(a,b){return Number(a.sortOrder||0)-Number(b.sortOrder||0)||String(a.name).localeCompare(String(b.name),'fr')});
}
function stockCatalogChildren(parentId,includeInactive,selectedId){
  return stockCatalogCategories.filter(function(category){
    return String(category.parentId||'')===String(parentId||'')&&(includeInactive||category.status==='active'||String(category.id)===String(selectedId||''));
  }).sort(function(a,b){return Number(a.sortOrder||0)-Number(b.sortOrder||0)||String(a.name).localeCompare(String(b.name),'fr')});
}
function stockCatalogCategoryById(id){
  return stockCatalogCategories.find(function(category){return String(category.id)===String(id)})||null;
}
function stockCatalogDecorate(item){
  const meta=stockCatalogMetadata.get(String(item.id))||{};
  const category=stockCatalogCategoryById(meta.categoryId),subcategory=stockCatalogCategoryById(meta.subcategoryId);
  return Object.assign({},item,{
    categoryId:meta.categoryId||null,
    subcategoryId:meta.subcategoryId||null,
    category:category?category.name:'',
    subcategory:subcategory?subcategory.name:'',
    supplierReference:String(meta.supplierReference||''),
    barcode:String(meta.barcode||''),
    aliases:Array.isArray(meta.aliases)?meta.aliases:[]
  });
}
function stockCatalogPath(item){
  return [item.category,item.subcategory].filter(Boolean).join(' › ')||'Non classé';
}
function stockCatalogIsLow(item){
  const minimum=Number(item.minimum||0);return minimum>0&&Number(item.quantity||0)<=minimum;
}
function stockCatalogSearchText(item){
  return stockCatalogNormalize([item.name,item.reference,item.category,item.subcategory,item.supplier,item.supplierReference,item.barcode].concat(item.aliases||[]).join(' '));
}
function stockCatalogFilteredItems(){
  const query=stockCatalogNormalize(stockCatalogQuery);
  return (Array.isArray(stockItems)?stockItems:[]).map(stockCatalogDecorate).filter(function(item){
    if(query&&!stockCatalogSearchText(item).includes(query)){
      const tokens=query.split(' ').filter(Boolean),haystack=stockCatalogSearchText(item);
      if(!tokens.every(function(token){return haystack.includes(token)}))return false;
    }
    if(stockCatalogCategoryFilter!=='all'&&String(item.categoryId||'')!==String(stockCatalogCategoryFilter))return false;
    if(stockCatalogLocationFilter!=='all'&&!(item.balances||[]).some(function(balance){return String(balance.locationId)===String(stockCatalogLocationFilter)&&Number(balance.quantity||0)>0}))return false;
    if(stockCatalogLowOnly&&!stockCatalogIsLow(item))return false;
    return true;
  }).sort(function(a,b){
    const lowA=stockCatalogIsLow(a),lowB=stockCatalogIsLow(b);
    return lowA===lowB?String(a.name||'').localeCompare(String(b.name||''),'fr'):lowA?-1:1;
  });
}
function stockCatalogBalanceSummary(item,limit){
  const balances=(item.balances||[]).filter(function(balance){return Number(balance.quantity||0)!==0}).slice().sort(function(a,b){return Number(b.quantity||0)-Number(a.quantity||0)});
  if(!balances.length)return '<span class="stock-catalog-muted">Aucun stock localisé</span>';
  const shown=balances.slice(0,limit||3).map(function(balance){return '<span>'+esc(balance.location||'Emplacement')+' : <strong>'+stockCatalogFormatQuantity(balance.quantity)+' '+esc(item.unit||'')+'</strong></span>'}).join('');
  const more=balances.length>(limit||3)?'<small>+'+(balances.length-(limit||3))+' emplacement(s)</small>':'';
  return shown+more;
}
function stockCatalogCategoryOptions(selected){
  return '<option value="">Non classé</option>'+stockCatalogRoots(false,selected).map(function(category){
    return '<option value="'+esc(category.id)+'" '+(String(category.id)===String(selected||'')?'selected':'')+'>'+esc(category.name)+(category.status==='inactive'?' · inactive':'')+'</option>';
  }).join('');
}
function stockCatalogSubcategoryOptions(categoryId,selected){
  if(!categoryId)return '<option value="">Aucune sous-catégorie</option>';
  return '<option value="">Aucune sous-catégorie</option>'+stockCatalogChildren(categoryId,false,selected).map(function(category){
    return '<option value="'+esc(category.id)+'" '+(String(category.id)===String(selected||'')?'selected':'')+'>'+esc(category.name)+(category.status==='inactive'?' · inactive':'')+'</option>';
  }).join('');
}
function stockCatalogUpdateSubcategorySelect(form){
  const select=form&&form.querySelector('[name="subcategoryId"]'),category=form&&form.querySelector('[name="categoryId"]');
  if(select&&category)select.innerHTML=stockCatalogSubcategoryOptions(category.value,'');
}
function stockCatalogSuggestionScore(candidate,input){
  const needle=stockCatalogNormalize(input),name=stockCatalogNormalize(candidate.name),haystack=stockCatalogSearchText(candidate);
  if(!needle)return 0;if(name===needle)return 100;if(name.startsWith(needle))return 90;if(name.includes(needle))return 80;
  const tokens=needle.split(' ').filter(Boolean),hits=tokens.filter(function(token){return haystack.includes(token)}).length;
  return tokens.length?Math.round(hits/tokens.length*70):0;
}
function stockCatalogUpdateSuggestions(form){
  const target=form&&form.querySelector('#stockCatalogSuggestions');if(!target)return;
  const current=String(form.dataset.stockItemId||''),name=String(form.elements.name&&form.elements.name.value||''),referenceValue=String(form.elements.reference&&form.elements.reference.value||'').trim(),barcodeValue=String(form.elements.barcode&&form.elements.barcode.value||'').trim();
  if(stockCatalogNormalize(name).length<2&&!referenceValue&&!barcodeValue){target.innerHTML='';target.hidden=true;return}
  const candidates=(stockItems||[]).map(stockCatalogDecorate).filter(function(item){return String(item.id)!==current}).map(function(item){
    let score=stockCatalogSuggestionScore(item,name);
    if(referenceValue&&item.reference&&stockCatalogNormalize(item.reference)===stockCatalogNormalize(referenceValue))score=Math.max(score,98);if(barcodeValue&&item.barcode&&String(item.barcode)===barcodeValue)score=100;
    return{item:item,score:score};
  }).filter(function(entry){return entry.score>=45}).sort(function(a,b){return b.score-a.score||String(a.item.name).localeCompare(String(b.item.name),'fr')}).slice(0,4);
  if(!candidates.length){target.innerHTML='';target.hidden=true;return}
  target.hidden=false;
  target.innerHTML='<strong>Articles ressemblants</strong><p>Vérifiez avant de créer un doublon.</p>'+candidates.map(function(entry){
    const item=entry.item;
    return '<div class="stock-catalog-suggestion"><span><b>'+esc(item.name)+'</b><small>'+esc(stockCatalogPath(item))+' · '+stockCatalogFormatQuantity(item.quantity)+' '+esc(item.unit||'')+' disponible(s)</small></span><button class="btn" type="button" onclick="stockCatalogUseExisting(\''+jsString(String(item.id))+'\')">Utiliser cet article</button></div>';
  }).join('');
}
function stockCatalogUseExisting(id){
  closeModal();stockCatalogShowItem(id);
}
function stockCatalogSetQuery(value){stockCatalogQuery=String(value||'');render()}
function stockCatalogSetCategory(value){stockCatalogCategoryFilter=String(value||'all');render()}
function stockCatalogSetLocation(value){stockCatalogLocationFilter=String(value||'all');render()}
function stockCatalogToggleLow(checked){stockCatalogLowOnly=Boolean(checked);render()}

stockView=function(){
  stockCatalogEnsureLoaded();
  const all=(stockItems||[]).map(stockCatalogDecorate),items=stockCatalogFilteredItems(),locations=(stockLocations||[]).slice().sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''),'fr')});
  const activeRoots=stockCatalogRoots(false,''),lowCount=all.filter(stockCatalogIsLow).length,canCosts=Boolean(stockCatalogCapabilities.viewCosts),totalValue=canCosts?all.reduce(function(sum,item){return sum+Number(item.quantity||0)*Number(item.unitCost||0)},0):0;
  const actions='<div class="stock-catalog-actions"><button class="btn" type="button" onclick="stockBarcodeOpenScanner()">Scanner</button>'+
    (stockCatalogCapabilities.manageLocations?'<button class="btn" type="button" onclick="stockLocationForm()">+ Emplacement</button>':'')+
    (stockCatalogCapabilities.manageCategories?'<button class="btn" type="button" onclick="stockCatalogCategoryManager()">Catégories</button>':'')+
    (stockCatalogCapabilities.manageItems?'<button class="btn primary" type="button" onclick="stockForm()">+ Article</button>':'')+
    '</div>';
  const categoryOptions='<option value="all">Toutes les catégories</option>'+activeRoots.map(function(category){return '<option value="'+esc(category.id)+'" '+(String(stockCatalogCategoryFilter)===String(category.id)?'selected':'')+'>'+esc(category.name)+'</option>'}).join('');
  const locationOptions='<option value="all">Tous les emplacements</option>'+locations.filter(function(location){return location.status==='active'}).map(function(location){return '<option value="'+esc(location.id)+'" '+(String(stockCatalogLocationFilter)===String(location.id)?'selected':'')+'>'+esc(location.name)+'</option>'}).join('');
  const desktopRows=items.map(function(item){
    return '<tr><td><strong>'+esc(item.name||'Article')+'</strong><small>'+esc(item.subcategory||item.category||item.supplier||'')+'</small></td>'+
      '<td>'+esc(stockCatalogPath(item))+'</td>'+
      '<td><strong>'+stockCatalogFormatQuantity(item.quantity)+' '+esc(item.unit||'')+'</strong>'+(stockCatalogIsLow(item)?'<small class="ia-stock-warning">Sous minimum</small>':'')+'</td>'+
      '<td><div class="stock-catalog-balances">'+stockCatalogBalanceSummary(item,2)+'</div></td>'+
      '<td>'+stockCatalogFormatQuantity(item.minimum||0)+' '+esc(item.unit||'')+'</td>'+
      '<td>'+esc(item.reference||'—')+'</td>'+
      '<td class="stock-catalog-row-actions"><button class="link" type="button" onclick="stockCatalogShowItem(\''+jsString(String(item.id))+'\')">Détail</button>'+(stockCatalogCapabilities.moveStock?' <button class="link" type="button" onclick="stockMovementForm(\''+jsString(String(item.id))+'\')">Mouvement</button>':'')+'</td></tr>';
  }).join('');
  const mobileCards=items.map(function(item){
    return '<article class="stock-catalog-card"><div class="stock-catalog-card-head"><span><strong>'+esc(item.name||'Article')+'</strong><small>'+esc(stockCatalogPath(item))+'</small></span>'+(stockCatalogIsLow(item)?'<span class="badge warn">Stock bas</span>':'')+'</div>'+
      '<div class="stock-catalog-card-total">'+stockCatalogFormatQuantity(item.quantity)+' '+esc(item.unit||'')+'</div>'+
      '<div class="stock-catalog-card-balances">'+stockCatalogBalanceSummary(item,3)+'</div>'+
      '<div class="stock-catalog-card-min"><span>Stock minimum</span><strong>'+stockCatalogFormatQuantity(item.minimum||0)+' '+esc(item.unit||'')+'</strong></div>'+
      '<div class="stock-catalog-card-actions">'+(stockCatalogCapabilities.moveStock?'<button class="btn" type="button" onclick="stockMovementForm(\''+jsString(String(item.id))+'\')">Mouvement</button>':'')+'<button class="btn primary" type="button" onclick="stockCatalogShowItem(\''+jsString(String(item.id))+'\')">Détail</button></div></article>';
  }).join('');
  const stateNotice=stockCatalogState==='error'?'<p class="notice">'+esc(stockCatalogError)+' <button class="link" type="button" onclick="loadStockCatalog({force:true})">Réessayer</button></p>':stockCatalogState==='loading'?'<p class="help-line">Chargement des catégories…</p>':'';
  return heading('Stock','Catalogue articles et stock multi-emplacement.',false)+
    '<div class="stock-catalog-shell">'+
      '<div class="stock-catalog-summary finance-grid"><div class="finance-box"><small>Articles</small><strong>'+all.length+'</strong></div><div class="finance-box"><small>Stock bas</small><strong>'+lowCount+'</strong></div><div class="finance-box"><small>'+(canCosts?'Valeur HTVA':'Catégories')+'</small><strong>'+(canCosts?money(totalValue):activeRoots.length)+'</strong></div></div>'+
      '<div class="stock-catalog-head"><div><p class="eyebrow">CATALOGUE</p><h2>Articles · '+items.length+'</h2></div>'+actions+'</div>'+
      '<div class="stock-catalog-toolbar"><label class="stock-catalog-search">Rechercher<input type="search" value="'+esc(stockCatalogQuery)+'" placeholder="PIR, ardoise, vis 80…" oninput="stockCatalogSetQuery(this.value)"></label><label>Catégorie<select onchange="stockCatalogSetCategory(this.value)">'+categoryOptions+'</select></label><label>Emplacement<select onchange="stockCatalogSetLocation(this.value)">'+locationOptions+'</select></label><label class="stock-catalog-low"><input type="checkbox" '+(stockCatalogLowOnly?'checked':'')+' onchange="stockCatalogToggleLow(this.checked)"> Stock bas uniquement</label></div>'+
      stateNotice+
      '<section class="panel stock-catalog-desktop data-table"><table><thead><tr><th>Article</th><th>Catégorie</th><th>Stock total</th><th>Emplacements</th><th>Minimum</th><th>Référence</th><th>Actions</th></tr></thead><tbody>'+(desktopRows||'<tr><td colspan="7" class="empty">Aucun article ne correspond aux filtres.</td></tr>')+'</tbody></table></section>'+
      '<section class="stock-catalog-mobile">'+(mobileCards||'<div class="panel empty">Aucun article ne correspond aux filtres.</div>')+'</section>'+
      '<section class="panel stock-catalog-location-list"><div class="panel-head"><h2>Emplacements</h2></div>'+locations.map(function(location){return '<div class="detail-row"><span><strong>'+esc(location.name)+'</strong><small>'+esc(location.type||'')+'</small></span><span class="badge '+(location.status==='active'?'green':'warn')+'">'+esc(location.status||'')+'</span></div>'}).join('')+'</section>'+
    '</div>';
};

stockForm=async function(itemId){
  itemId=String(itemId||'');stockCatalogResetIfTenantChanged();
  if(stockCatalogState!=='ready')await loadStockCatalog({renderAfter:false});
  if(!stockCatalogCapabilities.manageItems)return denyAccess('Vous ne pouvez pas modifier le catalogue Stock.');
  const base=(stockItems||[]).find(function(item){return String(item.id)===itemId})||{reference:'',name:'',quantity:0,unit:'unité',minimum:0,supplier:'',balances:[]};
  const item=stockCatalogDecorate(base),creating=!itemId,canCosts=Boolean(stockCatalogCapabilities.viewCosts);
  const details='<details class="stock-catalog-details"><summary>Détails facultatifs</summary><div class="form-two">'+
    '<label>Référence interne<input name="reference" maxlength="100" value="'+esc(item.reference||'')+'" oninput="stockCatalogUpdateSuggestions(this.form)"></label>'+
    '<label>Référence fournisseur<input name="supplierReference" maxlength="160" value="'+esc(item.supplierReference||'')+'"></label>'+
    '<label>Code-barres<input name="barcode" maxlength="80" value="'+esc(item.barcode||'')+'" placeholder="EAN / UPC" oninput="stockCatalogUpdateSuggestions(this.form)"></label><label>Alias / noms courants<input name="aliases" maxlength="500" value="'+esc((item.aliases||[]).join(', '))+'" placeholder="PIR 140, panneau isolant"></label>'+
    '<label>Fournisseur principal<input name="supplier" maxlength="160" value="'+esc(item.supplier||'')+'"></label>'+
    '<label>Stock minimum<input name="minimum" type="number" min="0" step="0.01" value="'+Number(item.minimum||0)+'"></label>'+
    (canCosts?'<label>Coût unitaire HTVA<input name="unitCost" type="number" min="0" step="0.01" value="'+Number(item.unitCost||0)+'"></label>':'')+
    '</div></details>';
  modal(creating?'Ajouter un article':'Modifier l’article','<form class="stock-catalog-form" data-stock-item-id="'+esc(itemId)+'" onsubmit="saveStockItem(event,\''+jsString(itemId)+'\')"><input type="hidden" name="operationKey" value="stock-'+crypto.randomUUID()+'"><div class="form-two stock-catalog-primary-fields">'+
    '<label>Désignation *<input name="name" required maxlength="160" value="'+esc(item.name||'')+'" placeholder="Panneau PIR 140 mm — 1200 × 600" oninput="stockCatalogUpdateSuggestions(this.form)"></label>'+
    '<label>Catégorie<select name="categoryId" onchange="stockCatalogUpdateSubcategorySelect(this.form)">'+stockCatalogCategoryOptions(item.categoryId)+'</select></label>'+
    '<label>Sous-catégorie<select name="subcategoryId">'+stockCatalogSubcategoryOptions(item.categoryId,item.subcategoryId)+'</select></label>'+
    '<label>Unité<input name="unit" required maxlength="60" value="'+esc(item.unit||'unité')+'"></label>'+
    (creating?'<label>Quantité initiale<input name="quantity" type="number" min="0" step="0.01" value="0" required></label><label>Emplacement initial<select name="locationId"><option value="">Aucun si quantité = 0</option>'+stockLocations.filter(function(location){return location.status==='active'}).map(function(location){return '<option value="'+esc(location.id)+'">'+esc(location.name)+'</option>'}).join('')+'</select></label>':'<label>Quantité totale<input disabled value="'+stockCatalogFormatQuantity(item.quantity)+' '+esc(item.unit||'')+'"><small>La quantité se modifie uniquement par mouvement.</small></label>')+
    '</div><div id="stockCatalogSuggestions" class="stock-catalog-suggestions" hidden></div>'+details+'<div class="modal-actions"><button class="btn primary">'+(creating?'Créer l’article':'Enregistrer')+'</button></div></form>');
  const form=document.querySelector('#modal .stock-catalog-form');if(form)stockCatalogUpdateSuggestions(form);
};

saveStockItem=async function(event,itemId){
  event.preventDefault();itemId=String(itemId||'');
  if(!stockCatalogCapabilities.manageItems)return denyAccess('Vous ne pouvez pas modifier le catalogue Stock.');
  const form=event.target,f=new FormData(form),button=form.querySelector('button.primary'),aliases=String(f.get('aliases')||'').split(/[,;\n]/).map(function(value){return value.trim()}).filter(Boolean),payload={
    reference:String(f.get('reference')||'').trim(),
    name:String(f.get('name')||'').trim(),
    categoryId:String(f.get('categoryId')||'')||null,
    subcategoryId:String(f.get('subcategoryId')||'')||null,
    unit:String(f.get('unit')||'').trim(),
    minimum:Number(f.get('minimum')||0),
    supplier:String(f.get('supplier')||'').trim(),
    supplierReference:String(f.get('supplierReference')||'').trim(),
    barcode:String(f.get('barcode')||'').trim(),
    aliases:aliases
  };
  if(stockCatalogCapabilities.viewCosts&&form.elements.unitCost)payload.unitCost=Number(f.get('unitCost')||0);
  if(!itemId){payload.quantity=Number(f.get('quantity')||0);payload.locationId=String(f.get('locationId')||'')||null;payload.operationKey=String(f.get('operationKey')||'')}
  if(!payload.name)return toast('La désignation est obligatoire.');
  if(button)button.disabled=true;
  try{
    const result=await serverJson(itemId?'/api/stock-items/'+encodeURIComponent(itemId):'/api/stock-items',{method:itemId?'PATCH':'POST',body:JSON.stringify(payload)});
    closeModal();await loadServerFieldData({renderAfter:false});await loadStockCatalog({renderAfter:false,force:true});render();
    toast(itemId?'Article mis à jour.':'Article créé.');
    return result;
  }catch(error){toast(error.message||'Article refusé.');if(button)button.disabled=false}
};

function stockCatalogShowItem(id){
  const raw=(stockItems||[]).find(function(item){return String(item.id)===String(id)});if(!raw)return;
  const item=stockCatalogDecorate(raw),balances=(item.balances||[]),moves=(item.movements||[]).slice().sort(function(a,b){return String(b.date||'').localeCompare(String(a.date||''))}).slice(0,8),canCosts=Boolean(stockCatalogCapabilities.viewCosts)&&item.unitCost!==undefined;
  const balanceHtml=balances.length?'<div class="ia-detail-list">'+balances.map(function(balance){return '<div class="ia-detail-line ia-detail-line-short"><span><strong>'+esc(balance.location||'Emplacement')+'</strong></span><span><small>Quantité</small><b>'+stockCatalogFormatQuantity(balance.quantity)+' '+esc(item.unit||'')+'</b></span></div>'}).join('')+'</div>':'<p class="subtle">Aucun stock localisé.</p>';
  const movesHtml=moves.length?'<div class="ia-detail-list">'+moves.map(function(move){return '<div class="ia-detail-line ia-detail-line-short"><span><strong>'+esc(move.type||'Mouvement')+'</strong><small>'+esc(stockCatalogDate(move.date))+' · '+esc(move.reason||'')+'</small></span><span><small>Quantité</small><b>'+stockCatalogFormatQuantity(move.quantity)+' '+esc(item.unit||'')+'</b></span></div>'}).join('')+'</div>':'<p class="subtle">Aucun mouvement récent.</p>';
  const identifiers=[item.reference?'<div><small>Référence interne</small><strong>'+esc(item.reference)+'</strong></div>':'',item.supplierReference?'<div><small>Référence fournisseur</small><strong>'+esc(item.supplierReference)+'</strong></div>':'',item.barcode?'<div><small>Code-barres</small><strong>'+esc(item.barcode)+'</strong></div>':'',item.aliases&&item.aliases.length?'<div><small>Alias</small><strong>'+esc(item.aliases.join(', '))+'</strong></div>':''].join('');
  modal(item.name||'Article','<div class="ia-detail-grid"><div><small>Catégorie</small><strong>'+esc(stockCatalogPath(item))+'</strong></div><div><small>Stock total</small><strong>'+stockCatalogFormatQuantity(item.quantity)+' '+esc(item.unit||'')+'</strong></div><div><small>Stock minimum</small><strong>'+stockCatalogFormatQuantity(item.minimum||0)+' '+esc(item.unit||'')+'</strong></div>'+identifiers+'<div><small>Fournisseur</small><strong>'+esc(item.supplier||'—')+'</strong></div>'+(canCosts?'<div><small>Coût unitaire</small><strong>'+money(Number(item.unitCost||0))+'</strong></div><div><small>Valeur HTVA</small><strong>'+money(Number(item.quantity||0)*Number(item.unitCost||0))+'</strong></div>':'')+'</div><h3 class="detail-heading">Répartition par emplacement</h3>'+balanceHtml+'<h3 class="detail-heading">Derniers mouvements</h3>'+movesHtml+'<div class="modal-actions">'+(stockCatalogCapabilities.manageItems?'<button class="btn" type="button" onclick="closeModal();stockForm(\''+jsString(String(item.id))+'\')">Modifier l’article</button>':'')+(stockCatalogCapabilities.moveStock?'<button class="btn primary" type="button" onclick="closeModal();stockMovementForm(\''+jsString(String(item.id))+'\')">Mouvement</button>':'')+'</div>');
};

async function stockCatalogCategoryManager(){
  if(stockCatalogState!=='ready')await loadStockCatalog({renderAfter:false});
  if(!stockCatalogCapabilities.manageCategories)return denyAccess('Vous ne pouvez pas gérer les catégories Stock.');
  const roots=stockCatalogRoots(true,'');
  const groups=roots.map(function(root){
    const children=stockCatalogChildren(root.id,true,'');
    return '<section class="stock-category-group"><div class="stock-category-row"><span><strong>'+esc(root.name)+'</strong><small>Catégorie · ordre '+Number(root.sortOrder||0)+'</small></span><span class="badge '+(root.status==='active'?'green':'warn')+'">'+esc(root.status)+'</span><button class="link" type="button" onclick="stockCatalogCategoryForm(\'\',\''+jsString(String(root.id))+'\')">Modifier</button><button class="link" type="button" onclick="stockCatalogCategoryForm(\''+jsString(String(root.id))+'\',\'\')">+ Sous-catégorie</button></div>'+children.map(function(child){return '<div class="stock-category-row stock-category-child"><span><strong>'+esc(child.name)+'</strong><small>Sous-catégorie · ordre '+Number(child.sortOrder||0)+'</small></span><span class="badge '+(child.status==='active'?'green':'warn')+'">'+esc(child.status)+'</span><button class="link" type="button" onclick="stockCatalogCategoryForm(\''+jsString(String(root.id))+'\',\''+jsString(String(child.id))+'\')">Modifier</button></div>'}).join('')+'</section>';
  }).join('');
  modal('Catégories du stock','<div class="stock-category-manager"><div class="modal-actions stock-category-manager-actions"><button class="btn primary" type="button" onclick="stockCatalogCategoryForm(\'\',\'\')">+ Catégorie</button></div>'+(groups||'<div class="empty">Aucune catégorie. Les articles existants restent Non classé.</div>')+'</div>');
}
function stockCatalogCategoryForm(parentId,categoryId){
  parentId=String(parentId||'');categoryId=String(categoryId||'');
  const category=categoryId?stockCatalogCategoryById(categoryId):null,parent=parentId?stockCatalogCategoryById(parentId):(category&&category.parentId?stockCatalogCategoryById(category.parentId):null),editing=Boolean(category);
  modal(editing?'Modifier la catégorie':(parent?'Nouvelle sous-catégorie':'Nouvelle catégorie'),'<form onsubmit="saveStockCatalogCategory(event,\''+jsString(parent?String(parent.id):'')+'\',\''+jsString(categoryId)+'\')"><div class="form-two">'+
    '<label>Nom<input name="name" maxlength="120" required value="'+esc(category?category.name:'')+'"></label>'+
    '<label>Ordre<input name="sortOrder" type="number" min="0" max="9999" step="1" value="'+Number(category?category.sortOrder||0:0)+'"></label>'+
    (parent?'<label>Catégorie parente<input disabled value="'+esc(parent.name)+'"></label>':'')+
    (editing?'<label>Statut<select name="status"><option value="active" '+(category.status==='active'?'selected':'')+'>Actif</option><option value="inactive" '+(category.status==='inactive'?'selected':'')+'>Inactif</option></select></label>':'')+
    '</div><div class="modal-actions"><button class="btn" type="button" onclick="stockCatalogCategoryManager()">Retour</button><button class="btn primary">Enregistrer</button></div></form>');
}
async function saveStockCatalogCategory(event,parentId,categoryId){
  event.preventDefault();if(!stockCatalogCapabilities.manageCategories)return denyAccess('Vous ne pouvez pas gérer les catégories Stock.');
  const form=event.target,f=new FormData(form),button=form.querySelector('button.primary'),editing=Boolean(categoryId),payload={name:String(f.get('name')||'').trim(),sortOrder:Number(f.get('sortOrder')||0)};
  if(editing)payload.status=String(f.get('status')||'active');else payload.parentId=String(parentId||'')||null;
  if(button)button.disabled=true;
  try{
    await serverJson(editing?'/api/stock-catalog/categories/'+encodeURIComponent(categoryId):'/api/stock-catalog/categories',{method:editing?'PATCH':'POST',body:JSON.stringify(payload)});
    closeModal();await loadStockCatalog({renderAfter:false,force:true});if(view==='stock')render();await stockCatalogCategoryManager();toast(editing?'Catégorie mise à jour.':'Catégorie créée.');
  }catch(error){toast(error.message||'Catégorie refusée.');if(button)button.disabled=false}
}

globalThis.loadStockCatalog=loadStockCatalog;
globalThis.stockCatalogShowItem=stockCatalogShowItem;
globalThis.iaAShowStockItem=stockCatalogShowItem;
globalThis.stockCatalogCategoryManager=stockCatalogCategoryManager;
globalThis.stockCatalogCategoryForm=stockCatalogCategoryForm;
globalThis.saveStockCatalogCategory=saveStockCatalogCategory;
globalThis.stockCatalogUpdateSubcategorySelect=stockCatalogUpdateSubcategorySelect;
globalThis.stockCatalogUpdateSuggestions=stockCatalogUpdateSuggestions;
globalThis.stockCatalogUseExisting=stockCatalogUseExisting;
globalThis.stockCatalogSetQuery=stockCatalogSetQuery;
globalThis.stockCatalogSetCategory=stockCatalogSetCategory;
globalThis.stockCatalogSetLocation=stockCatalogSetLocation;
globalThis.stockCatalogToggleLow=stockCatalogToggleLow;
