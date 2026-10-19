/* Toast avec action Annuler, sans dépendre du toast historique. */
(function(){
'use strict';
var timer=0,host=null,button=null,text=null;
function ensure(){
  if(host)return;
  host=document.createElement('div');host.id='sx-toast';host.className='sx-toast';host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.hidden=true;
  text=document.createElement('span');text.className='sx-toast-text';
  button=document.createElement('button');button.type='button';button.className='sx-toast-action';button.hidden=true;
  var close=document.createElement('button');close.type='button';close.className='sx-toast-close';close.setAttribute('aria-label','Fermer');close.textContent='×';
  host.append(text,button,close);document.body.append(host);
  close.addEventListener('click',hide);
}
function hide(){if(!host)return;host.hidden=true;clearTimeout(timer);button.onclick=null;}
function show(message,actionLabel,action,options){
  ensure();clearTimeout(timer);
  text.textContent=String(message||'');
  if(actionLabel&&typeof action==='function'){
    button.hidden=false;button.textContent=actionLabel;button.onclick=function(){hide();action();};
  }else{button.hidden=true;button.onclick=null;}
  host.hidden=false;
  timer=setTimeout(hide,Number(options&&options.duration)||6000);
}
globalThis.sxToast=show;
globalThis.sxToastHide=hide;
})();
