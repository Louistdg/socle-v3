/* Surveillance légère des erreurs, visible dans le statut. */
(function(){
'use strict';
var key='socle:error-log',max=20;
function read(){
  try{return JSON.parse(sessionStorage.getItem(key)||'[]');}catch(error){return [];}
}
function write(list){
  try{sessionStorage.setItem(key,JSON.stringify(list.slice(-max)));}catch(error){}
  globalThis.socleRecentErrors=list.slice(-max);
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
globalThis.socleClearErrorLog=function(){try{sessionStorage.removeItem(key);}catch(error){}globalThis.socleRecentErrors=[];};
write(read());
})();
