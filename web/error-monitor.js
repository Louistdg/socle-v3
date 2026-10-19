/* Surveillance légère des erreurs, visible dans le statut. */
(function(){
'use strict';
var entries=[],max=20;
function read(){return entries.slice();}
function write(list){
  entries=list.slice(-max);
  globalThis.socleRecentErrors=entries.slice();
}
function record(kind,message,source){
  var list=read();
  list.push({at:new Date().toISOString(),kind:kind,message:String(message||'').slice(0,500),source:String(source||'').slice(0,200),route:document.body&&document.body.dataset.auditRoute||''});
  write(list);
}
window.addEventListener('error',function(event){
  record('error',event.message||'Erreur inconnue',event.filename?event.filename+':'+event.lineno:'');
});
window.addEventListener('unhandledrejection',function(event){
  var reason=event.reason;
  record('promise',reason&&reason.message?reason.message:String(reason||'Promesse rejetée'),'');
});
globalThis.socleErrorLog=read;
globalThis.socleClearErrorLog=function(){entries=[];globalThis.socleRecentErrors=[];};
write(read());
})();
