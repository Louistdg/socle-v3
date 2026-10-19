/* Outils de tableau communs : compteur, en-têtes collants et export CSV. */
(function(){
'use strict';
var pending=false;
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function tableName(container){
  var heading=container.closest('section,article')?.querySelector('h2,h3');
  return (heading&&heading.textContent.trim())||'export-socle';
}
function columnKey(container){return 'sx-table-cols:'+tableName(container).toLocaleLowerCase('fr');}
function readHidden(container){
  try{return JSON.parse(sessionStorage.getItem(columnKey(container))||'[]').filter(function(value){return Number.isInteger(value);});}catch(error){return [];}
}
function applyHidden(table,hidden){
  table.querySelectorAll('tr').forEach(function(row){
    Array.prototype.forEach.call(row.cells,function(cell,index){cell.hidden=hidden.includes(index);});
  });
}
function exportCsv(container,table,hidden){
  var lines=[];
  Array.prototype.forEach.call(table.rows,function(row){
    lines.push(Array.prototype.map.call(row.cells,function(cell,index){
      if(hidden.includes(index))return null;
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
  var rows=table.tBodies[0].rows;
  if(!rows.length)return;
  container.dataset.sxTools='1';
  container.classList.add('sx-data-table');
  var hidden=readHidden(container);
  applyHidden(table,hidden);
  var tools=document.createElement('div');
  tools.className='sx-table-tools';
  tools.innerHTML='<span class="sx-table-count">'+rows.length+' ligne'+(rows.length===1?'':'s')+'</span>';
  var columns=document.createElement('details');
  columns.className='sx-table-columns';
  columns.innerHTML='<summary>Colonnes</summary>';
  var menu=document.createElement('div');menu.className='sx-table-columns-menu';
  var headers=table.rows[0]?Array.prototype.slice.call(table.rows[0].cells):[];
  headers.forEach(function(cell,index){
    if(!String(cell.innerText||'').trim())return;
    var label=document.createElement('label');
    var input=document.createElement('input');input.type='checkbox';input.checked=hidden.indexOf(index)<0;
    input.addEventListener('change',function(){
      var next=readHidden(container);
      if(input.checked)next=next.filter(function(value){return value!==index;});
      else if(next.indexOf(index)<0)next.push(index);
      try{sessionStorage.setItem(columnKey(container),JSON.stringify(next));}catch(error){}
      applyHidden(table,next);
    });
    label.append(input,document.createTextNode(String(cell.innerText).trim()));
    menu.append(label);
  });
  columns.append(menu);
  var exportButton=document.createElement('button');
  exportButton.type='button';exportButton.className='sx-table-export';exportButton.textContent='Exporter CSV';
  exportButton.addEventListener('click',function(){exportCsv(container,table,readHidden(container));});
  tools.append(columns,exportButton);
  container.prepend(tools);
}
function run(){
  document.querySelectorAll('#main .data-table').forEach(ensure);
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;run();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
var main=document.querySelector('#main');
if(main)new MutationObserver(schedule).observe(main,{childList:true});
})();
