/* Outils de tableau communs : compteur, en-têtes collants et export CSV. */
(function(){
'use strict';
var pending=false;
function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function tableName(container){
  var heading=container.closest('section,article')?.querySelector('h2,h3');
  return (heading&&heading.textContent.trim())||'export-socle';
}
function exportCsv(container,table){
  var lines=[];
  Array.prototype.forEach.call(table.rows,function(row){
    lines.push(Array.prototype.map.call(row.cells,function(cell){
      return '"'+String(cell.innerText||'').replace(/\s+/g,' ').trim().replace(/"/g,'""')+'"';
    }).join(';'));
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
  var tools=document.createElement('div');
  tools.className='sx-table-tools';
  tools.innerHTML='<span class="sx-table-count">'+rows.length+' ligne'+(rows.length===1?'':'s')+'</span><button type="button" class="sx-table-export">Exporter CSV</button>';
  tools.querySelector('.sx-table-export').addEventListener('click',function(){exportCsv(container,table);});
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
