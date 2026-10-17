function reconciliationSupplierId(item){
 return String(item?.supplier_id??item?.supplierId??'');
}

function reconciliationMonth(value){
 return /^\d{4}-\d{2}/.test(String(value||''))?String(value).slice(0,7):'';
}

function supplierInvoiceReconciliationAnalyze(expense,orders,deliveries){
 const supplierId=reconciliationSupplierId(expense);
 const linkedOrderId=String(expense.purchase_order_id||'');
 const linkedDeliveryId=String(expense.delivery_note_id||'');
 const linkedDelivery=linkedDeliveryId?deliveries.find(note=>String(note.id)===linkedDeliveryId):null;
 if(linkedDeliveryId&&!linkedDelivery){
  return {status:'unmatched',reason:'Le bon de livraison lié à la facture est absent des données visibles; vérification impossible.',candidates:[]};
 }
 const deliveryOrderId=linkedDelivery?String(linkedDelivery.orderId??linkedDelivery.order_id):'';
 if(linkedOrderId&&deliveryOrderId&&linkedOrderId!==deliveryOrderId){
  return {status:'unmatched',reason:'La commande et le bon de livraison liés à la facture se contredisent.',candidates:[]};
 }
 const targetOrderId=linkedOrderId||deliveryOrderId;
 let candidates=[];
 let reason='';

 if(targetOrderId){
  const order=orders.find(item=>String(item.id)===targetOrderId);
  if(!order)return {status:'unmatched',reason:'La commande indiquée sur la facture est absente des données visibles.',candidates:[]};
  if(supplierId&&reconciliationSupplierId(order)!==supplierId){
   return {status:'unmatched',reason:'Le fournisseur de la commande ne correspond pas à celui de la facture.',candidates:[]};
  }
  candidates=[order];
  reason=supplierId?'Commande liée explicitement sur la facture; fournisseur identique.':'Commande liée explicitement; fournisseur à contrôler.';
 }else if(supplierId){
  candidates=orders.filter(order=>reconciliationSupplierId(order)===supplierId);
  reason='Même fournisseur; aucune référence de commande n’est enregistrée sur la facture.';
 }else{
  return {status:'unmatched',reason:'Le fournisseur n’est pas renseigné; aucune commande ne peut être proposée sans deviner.',candidates:[]};
 }

 if(!candidates.length){
  return {status:'unmatched',reason:'Aucune commande de ce fournisseur dans les données visibles. Facture non rapprochée.',candidates:[]};
 }

 const invoiceMonth=reconciliationMonth(expense.expense_date);
 const enriched=candidates.map(order=>{
  const orderMonth=reconciliationMonth(order.expectedDate||order.expected_date);
  const orderId=String(order.id);
  let noteReason='Livraisons rattachées à cette commande.';
  let notes=deliveries.filter(note=>String(note.orderId??note.order_id)===orderId);

  if(linkedDeliveryId){
   if(String(linkedDelivery.orderId??linkedDelivery.order_id)!==orderId){notes=[];noteReason='Le bon indiqué ne correspond pas à cette commande.';}
   else{notes=[linkedDelivery];noteReason='Bon de livraison explicitement lié sur la facture.';}
  }

  const lines=(order.lines||[]).map(line=>{
   const orderLineId=String(line.id);
   const receivedLines=notes.filter(note=>['Reçue','Avec réserve'].includes(String(note.status||''))).flatMap(note=>note.lines||[]).filter(item=>String(item.orderLineId??item.order_line_id)===orderLineId);
   const acceptedMilli=receivedLines.filter(item=>item.condition!=='Refusé').reduce((sum,item)=>sum+Math.max(0,Math.round(Number(item.received||0)*1000)),0);
   const refusedMilli=receivedLines.filter(item=>item.condition==='Refusé').reduce((sum,item)=>sum+Math.max(0,Math.round(Number(item.received||0)*1000)),0);
   const orderedMilli=Math.max(0,Math.round(Number(line.quantity||0)*1000));
   const price=Number(line.unitPrice??line.unit_price);
   return {
    reference:String(line.reference||''),label:String(line.label||''),unit:String(line.unit||''),
    orderedMilli,acceptedMilli,refusedMilli,
    missingMilli:Math.max(0,orderedMilli-acceptedMilli),excessMilli:Math.max(0,acceptedMilli-orderedMilli),
    orderedUnitPriceCents:Number.isFinite(price)?Math.round(price*100):null,
    invoicedMilli:null,invoicedUnitPriceCents:null
   };
  });
  const periodMatches=Boolean(invoiceMonth&&orderMonth&&invoiceMonth===orderMonth);
  const reasons=[reason];
  if(periodMatches)reasons.push('même mois de commande et de facture');
  if(expense.delivery_note_id)reasons.push(noteReason);
  return {orderId,orderNumber:String(order.number||order.id),projectId:String(order.job??order.projectId??''),periodMatches,reasons,notes,lines};
 });

 return {status:enriched.length===1?'candidate':'ambiguous',reason,candidates:enriched};
}

function reconciliationEscape(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function reconciliationQuantity(milli,unit){
 const number=new Intl.NumberFormat('fr-BE',{minimumFractionDigits:0,maximumFractionDigits:3}).format(Number(milli||0)/1000);
 return `${number}${unit?` ${reconciliationEscape(unit)}`:''}`;
}

function reconciliationMoney(cents){
 if(cents===null||cents===undefined)return 'Non disponible';
 return new Intl.NumberFormat('fr-BE',{style:'currency',currency:'EUR'}).format(Number(cents)/100);
}

function updateSupplierInvoiceReconciliation(form){
 for(const row of form.querySelectorAll('[data-reconciliation-line]')){
  const quantity=row.querySelector('[name="invoicedQuantity"]');
  const unitPrice=row.querySelector('[name="invoicedUnitPrice"]');
  const invoiceReference=row.querySelector('[name="invoiceReference"]');
  const referenceResult=row.querySelector('[data-reference-variance]');
  const quantityResult=row.querySelector('[data-quantity-variance]');
  const priceResult=row.querySelector('[data-price-variance]');
  const quantityValue=quantity.value.trim()===''?null:Number(quantity.value);
  const priceValue=unitPrice.value.trim()===''?null:Number(unitPrice.value);
  const referenceValue=invoiceReference.value.trim();

  if(!referenceValue){
   referenceResult.textContent='À relever sur la facture';
  }else if(!row.dataset.orderReference){
   referenceResult.textContent='Référence commandée absente';
  }else{
   const invoiceReferenceNormalized=referenceValue.normalize('NFKC').toLocaleLowerCase('fr');
   const orderReferenceNormalized=row.dataset.orderReference.normalize('NFKC').toLocaleLowerCase('fr');
   referenceResult.textContent=invoiceReferenceNormalized===orderReferenceNormalized?'Références alignées':'Référence différente de la commande';
  }

  if(quantityValue===null||!Number.isFinite(quantityValue)||quantityValue<0){
   quantityResult.textContent='À relever sur la facture';
  }else{
   const invoiceMilli=Math.round(quantityValue*1000);
   const receivedMilli=Number(row.dataset.acceptedMilli);
   const delta=invoiceMilli-receivedMilli;
   quantityResult.textContent=delta>0
    ?`Facturé au-delà du reçu : ${reconciliationQuantity(delta,row.dataset.unit)}`
    :delta<0?`Reçu non facturé : ${reconciliationQuantity(-delta,row.dataset.unit)}`:'Facture et reçu alignés';
  }

  if(priceValue===null||!Number.isFinite(priceValue)||priceValue<0){
   priceResult.textContent='À relever sur la facture';
  }else if(row.dataset.orderedUnitPriceCents===''){
   priceResult.textContent='Prix commandé indisponible';
  }else{
   const delta=Math.round(priceValue*100)-Number(row.dataset.orderedUnitPriceCents);
   priceResult.textContent=delta>0
    ?`Facturé ${reconciliationMoney(delta)} de plus`
    :delta<0?`Facturé ${reconciliationMoney(-delta)} de moins`:'Prix alignés';
  }
 }
}

function supplierInvoiceReconciliationRender(expense,result){
 const label=reconciliationEscape(expense.supplier_name||'Fournisseur non renseigné');
 const reference=reconciliationEscape(expense.supplier_reference||expense.description||'Facture sans référence');
 const intro=`<p><strong>${label}</strong> · ${reference} · HTVA ${reconciliationMoney(expense.subtotal_cents)}</p>`;
 if(result.status==='unmatched'){
  return `${intro}<div class="notice"><strong>JE NE SAIS PAS — facture non rapprochée.</strong><p>${reconciliationEscape(result.reason)}</p></div><p class="help-line">Aucune commande ne sera choisie automatiquement.</p>`;
 }

 const warning=result.status==='ambiguous'
  ?'<div class="notice"><strong>Plusieurs commandes possibles — je ne sais pas laquelle correspond.</strong><p>Vérifiez les pièces avant toute décision.</p></div>'
  :'<div class="notice"><strong>Proposition à vérifier par une personne.</strong><p>La correspondance par fournisseur ou par lien enregistré ne vaut pas validation.</p></div>';
 const candidates=result.candidates.map(candidate=>{
  const deliveryNames=candidate.notes.map(note=>`${reconciliationEscape(note.number||note.id)} · ${reconciliationEscape(note.status||'état inconnu')}`).join(', ');
  const rows=candidate.lines.map(line=>{
   const variance=line.excessMilli?`Trop reçu : ${reconciliationQuantity(line.excessMilli,line.unit)}`:line.missingMilli?`Reste à recevoir : ${reconciliationQuantity(line.missingMilli,line.unit)}`:'Réception conforme à la quantité commandée';
   const refused=line.refusedMilli?` · refusé ${reconciliationQuantity(line.refusedMilli,line.unit)}`:'';
   const priceData=line.orderedUnitPriceCents===null?'':String(line.orderedUnitPriceCents);
   return `<tr data-reconciliation-line
     data-accepted-milli="${line.acceptedMilli}"
     data-ordered-unit-price-cents="${priceData}"
     data-order-reference="${reconciliationEscape(line.reference)}"
     data-unit="${reconciliationEscape(line.unit)}">
     <td><strong>${reconciliationEscape(line.label||line.reference||'Ligne sans libellé')}</strong>
       <small>${reconciliationEscape(line.reference||'Référence absente')}</small></td>
     <td>${reconciliationQuantity(line.orderedMilli,line.unit)}
       <small>${reconciliationEscape(variance)}</small></td>
     <td>${reconciliationQuantity(line.acceptedMilli,line.unit)}${refused?`<small>${refused}</small>`:''}</td>
     <td><label><span class="sr-only">Référence facturée pour ${reconciliationEscape(line.label)}</span>
       <input name="invoiceReference" type="text" oninput="updateSupplierInvoiceReconciliation(this.form)"></label></td>
     <td data-reference-variance>À relever sur la facture</td>
     <td><label><span class="sr-only">Quantité facturée pour ${reconciliationEscape(line.label)}</span>
       <input name="invoicedQuantity" type="number" min="0" step="0.001" inputmode="decimal" oninput="updateSupplierInvoiceReconciliation(this.form)"></label></td>
     <td data-quantity-variance>À relever sur la facture</td>
     <td>${reconciliationMoney(line.orderedUnitPriceCents)}</td>
     <td><label><span class="sr-only">Prix unitaire facturé pour ${reconciliationEscape(line.label)} en euros</span>
       <input name="invoicedUnitPrice" type="number" min="0" step="0.01" inputmode="decimal" oninput="updateSupplierInvoiceReconciliation(this.form)"></label></td>
     <td data-price-variance>À relever sur la facture</td>
   </tr>`;
  }).join('');
  const period=candidate.periodMatches?' · même mois':' · période non confirmée';
  return `<section class="panel">
    <div class="panel-head"><div>
      <h3>Commande ${reconciliationEscape(candidate.orderNumber)}</h3>
      <span>${candidate.reasons.map(reconciliationEscape).join(' · ')}${period}</span>
    </div></div>
    <p><strong>Bons de livraison :</strong> ${deliveryNames||'Aucun bon visible pour cette commande'}</p>
    <div class="data-table"><table>
      <thead><tr>
        <th>Article / référence</th><th>Commandée</th><th>Reçue acceptée</th>
        <th>Réf. facturée</th><th>Écart référence</th><th>Quantité facturée</th>
        <th>Écart facture / reçu</th><th>Prix commandé</th><th>Prix facturé</th><th>Écart de prix</th>
      </tr></thead>
      <tbody>${rows||'<tr><td colspan="10" class="empty">Aucune ligne de commande disponible.</td></tr>'}</tbody>
    </table></div>
  </section>`;
 }).join('');
 return `${intro}${warning}<p class="help-line">Relevez les références, quantités et prix unitaires sur la facture pour comparer les lignes. Ces valeurs ne sont pas enregistrées : les écarts de réception affichés ne remplacent pas ces données.</p><form onsubmit="event.preventDefault();return false">${candidates}</form><p class="notice">Mode revue : cet écran ne crée aucun rapprochement et ne modifie aucune donnée.</p>`;
}

async function openSupplierInvoiceReconciliation(expenseId){
 const expenses=typeof serverExpenses==='undefined'?[]:serverExpenses;
 const expense=expenses.find(item=>String(item.id)===String(expenseId));
 if(!expense){toast('Facture fournisseur introuvable dans les données chargées.');return;}
 const orders=typeof purchaseOrders==='undefined'?[]:purchaseOrders;
 const deliveries=typeof deliveryNotes==='undefined'?[]:deliveryNotes;
 const result=supplierInvoiceReconciliationAnalyze(expense,orders,deliveries);
 modal('Rapprochement de facture fournisseur',supplierInvoiceReconciliationRender(expense,result));
}

globalThis.openSupplierInvoiceReconciliation=openSupplierInvoiceReconciliation;
globalThis.updateSupplierInvoiceReconciliation=updateSupplierInvoiceReconciliation;
globalThis.supplierInvoiceReconciliation={analyze:supplierInvoiceReconciliationAnalyze,render:supplierInvoiceReconciliationRender};
