/* Outils de tableau : filtre, colonnes, sélection, compteur et export CSV/PDF. */
(function(){
'use strict';
var pending=false, columnMemory=new Map(), filterMemory=new Map();
function tableName(container){
  var heading=container.closest('section,article')?.querySelector('h2,h3');
  return (heading&&heading.textContent.trim())||'export-socle';
}
function columnKey(container){return 'sx-table-cols:'+tableName(container).toLocaleLowerCase('fr');}
function filterKey(container){return 'sx-table-filter:'+tableName(container).toLocaleLowerCase('fr');}
function readHidden(container){
  var value=columnMemory.get(columnKey(container));
  return Array.isArray(value)?value.filter(function(item){return Number.isInteger(item);}):[];
}
function readFilter(container){return filterMemory.get(filterKey(container))||'';}
function saveFilter(container,value){filterMemory.set(filterKey(container),value);}
function bodyRows(table){return Array.prototype.slice.call(table.tBodies[0].rows);}
function selectedRows(table){return bodyRows(table).filter(function(row){return row.querySelector('.sx-select-cell input')?.checked;});}
function applyHidden(table,hidden){
  Array.prototype.forEach.call(table.rows,function(row){
    Array.prototype.forEach.call(row.cells,function(cell,index){cell.hidden=hidden.includes(index);});
  });
}
function exportPdf(container,table,hidden){
  var win=window.open('','_blank');
  if(!win)return;
  win.opener=null;
  var clone=table.cloneNode(true);
  clone.querySelectorAll('.sx-select-head,.sx-select-cell').forEach(function(cell){cell.remove();});
  Array.prototype.forEach.call(clone.rows,function(row){Array.prototype.forEach.call(row.cells,function(cell,index){if(hidden.includes(index))cell.remove();});});
  win.document.write('<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>'+String(tableName(container)).replace(/[<>&]/g,'')+'</title><style>body{font:12px/1.4 system-ui,sans-serif;color:#1b1b1b;padding:18px}h1{font-size:18px;margin:0 0 4px}p{color:#666;margin:0 0 14px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:7px 8px;text-align:left;vertical-align:top}th{background:#f1f1ed;font-size:10px;text-transform:uppercase;letter-spacing:.04em}@media print{body{padding:0}}</style></head><body><h1>'+String(tableName(container)).replace(/[<>&]/g,'')+'</h1><p>Export du '+new Date().toLocaleDateString('fr-BE')+'</p>'+clone.outerHTML+'</body></html>');
  win.document.close();win.focus();setTimeout(function(){win.print();},250);
}
function buildCsv(container,table,hidden,rows){
  var lines=[],header=table.rows[0];
  if(header)lines.push(Array.prototype.map.call(header.cells,function(cell,index){
    if(hidden.includes(index)||cell.classList.contains('sx-select-head'))return null;
    return '"'+String(cell.innerText||'').replace(/\s+/g,' ').trim().replace(/"/g,'""')+'"';
  }).filter(function(value){return value!==null;}).join(';'));
  rows.forEach(function(row){
    lines.push(Array.prototype.map.call(row.cells,function(cell,index){
      if(hidden.includes(index)||cell.classList.contains('sx-select-cell'))return null;
      return '"'+String(cell.innerText||'').replace(/\s+/g,' ').trim().replace(/"/g,'""')+'"';
    }).filter(function(value){return value!==null;}).join(';'));
  });
  var blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  var url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=tableName(container).toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'.csv';
  document.body.append(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);
}
function ensure(container){
  if(container.dataset.sxTools==='1')return;
  var table=container.querySelector('table');
  if(!table||!table.tBodies.length)return;
  var rows=bodyRows(table);
  if(!rows.length||!rows.some(function(row){return String(row.innerText||'').trim();}))return;
  container.dataset.sxTools='1';
  container.classList.add('sx-data-table');
  var hidden=readHidden(container);
  applyHidden(table,hidden);
  var tools=document.createElement('div');tools.className='sx-table-tools';
  var filter=document.createElement('input');filter.type='search';filter.className='sx-table-filter';filter.placeholder='Filtrer les lignes…';filter.setAttribute('aria-label','Filtrer les lignes du tableau');filter.value=readFilter(container);
  var count=document.createElement('span');count.className='sx-table-count';
  var columns=document.createElement('details');columns.className='sx-table-columns';columns.innerHTML='<summary>Colonnes</summary>';
  var menu=document.createElement('div');menu.className='sx-table-columns-menu';
  var headers=table.rows[0]?Array.prototype.slice.call(table.rows[0].cells):[];
  headers.forEach(function(cell,index){
    if(!String(cell.innerText||'').trim())return;
    var label=document.createElement('label');
    var input=document.createElement('input');input.type='checkbox';input.checked=hidden.indexOf(index)<0;
    input.addEventListener('change',function(){
      var previous=readHidden(container),next=previous.slice();
      if(input.checked)next=next.filter(function(value){return value!==index;});
      else if(next.indexOf(index)<0)next.push(index);
      columnMemory.set(columnKey(container),next);
      applyHidden(table,next);
      if(typeof globalThis.sxToast==='function')globalThis.sxToast('Colonnes mises à jour','Annuler',function(){
        columnMemory.set(columnKey(container),previous);
        applyHidden(table,previous);
      });
    });
    label.append(input,document.createTextNode(String(cell.innerText).trim()));menu.append(label);
  });
  columns.append(menu);
  var select=document.createElement('button');select.type='button';select.className='sx-table-export';select.textContent='Sélectionner';
  var pdfButton=document.createElement('button');pdfButton.type='button';pdfButton.className='sx-table-export';pdfButton.textContent='PDF';
  var exportButton=document.createElement('button');exportButton.type='button';exportButton.className='sx-table-export';exportButton.textContent='Exporter CSV';
  var bulk=document.createElement('div');bulk.className='sx-table-bulk';bulk.hidden=true;
  bulk.innerHTML='<span class="sx-table-bulk-count">0 sélectionnée</span><button type="button" class="sx-table-bulk-export">Exporter la sélection</button><button type="button" class="sx-table-bulk-clear">Tout désélectionner</button>';
  tools.append(filter,count,columns,select,pdfButton,exportButton);
  container.prepend(tools,bulk);

  function visibleRows(){var q=String(filter.value||'').trim().toLocaleLowerCase('fr');return rows.filter(function(row){return !q||String(row.innerText||'').toLocaleLowerCase('fr').includes(q);});}
  function updateCount(){
    var shown=visibleRows(),countValue=shown.length,visibleSet=new Set(shown);
    count.textContent=countValue===rows.length?rows.length+' ligne'+(rows.length===1?'':'s'):countValue+' / '+rows.length+' lignes';
    rows.forEach(function(row){row.hidden=!visibleSet.has(row);});
  }
  function updateBulk(){
    var selected=selectedRows(table);
    bulk.hidden=!table.classList.contains('sx-selecting');
    bulk.querySelector('.sx-table-bulk-count').textContent=selected.length+' sélectionnée'+(selected.length===1?'':'s');
  }
  function enableSelection(){
    if(table.classList.contains('sx-selecting'))return;
    table.classList.add('sx-selecting');
    var headRow=table.tHead?.rows[0]||table.rows[0];
    var th=document.createElement('th');th.className='sx-select-head';th.innerHTML='<input type="checkbox" aria-label="Tout sélectionner">';headRow.append(th);
    th.querySelector('input').addEventListener('change',function(event){bodyRows(table).forEach(function(row){var box=row.querySelector('.sx-select-cell input');if(box)box.checked=event.target.checked;});updateBulk();});
    rows.forEach(function(row){
      var td=document.createElement('td');td.className='sx-select-cell';td.innerHTML='<input type="checkbox" aria-label="Sélectionner la ligne">';row.append(td);
      td.querySelector('input').addEventListener('change',updateBulk);
    });
    select.textContent='Terminer';updateBulk();
  }
  function disableSelection(){
    table.classList.remove('sx-selecting');
    table.querySelectorAll('.sx-select-head,.sx-select-cell').forEach(function(cell){cell.remove();});
    select.textContent='Sélectionner';bulk.hidden=true;
  }
  filter.addEventListener('input',function(){saveFilter(container,filter.value);updateCount();});
  select.addEventListener('click',function(){if(table.classList.contains('sx-selecting'))disableSelection();else enableSelection();});
  exportButton.addEventListener('click',function(){buildCsv(container,table,readHidden(container),visibleRows());});
  pdfButton.addEventListener('click',function(){exportPdf(container,table,readHidden(container));});
  bulk.querySelector('.sx-table-bulk-export').addEventListener('click',function(){var chosen=selectedRows(table);if(chosen.length)buildCsv(container,table,readHidden(container),chosen);});
  bulk.querySelector('.sx-table-bulk-clear').addEventListener('click',function(){bodyRows(table).forEach(function(row){var box=row.querySelector('.sx-select-cell input');if(box)box.checked=false;});updateBulk();});
  updateCount();
}
function run(){document.querySelectorAll('#main .data-table').forEach(ensure);}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;run();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
var main=document.querySelector('#main');
if(main)new MutationObserver(schedule).observe(main,{childList:true});
})();
