/* Reprise générique sur les panneaux d’erreur sans action. */
(function(){
'use strict';
var pending=false;
function enhance(){
  document.querySelectorAll('#main .load-error,#main .error-state,[data-error-state]').forEach(function(panel){
    if(panel.querySelector('button'))return;
    var button=document.createElement('button');button.type='button';button.className='sx-button';button.textContent='Réessayer';
    button.addEventListener('click',function(){if(typeof render==='function'){render();}else location.reload();});
    panel.append(button);
  });
}
function schedule(){if(pending)return;pending=true;requestAnimationFrame(function(){pending=false;enhance();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
var main=document.querySelector('#main');
if(main)new MutationObserver(schedule).observe(main,{childList:true});
})();
