/* Raccourcis clavier de navigation.
   g puis une lettre : accueil, planning, chantiers, documents, contacts, taches, equipe.
   ? : affiche l'aide. Rien ne s'active dans un champ de saisie. */
(function(){
  'use strict';
  var routes={h:['home','Accueil'],p:['planning','Planning'],j:['jobs','Chantiers'],d:['documents','Documents'],c:['contacts','Contacts'],t:['actions','Tâches & alertes'],e:['people','Personnel & équipes'],q:['quotes','Devis'],a:['accounting','Comptabilité']};
  var armed=false,timer=0;
  function isTyping(event){
    var target=event.target;
    if(!target||!target.closest)return false;
    return Boolean(target.closest('input,textarea,select,[contenteditable="true"]'));
  }
  function modalOpen(){
    var node=document.querySelector('dialog[open]');
    return Boolean(node&&node.open);
  }
  function help(){
    if(typeof modal!=='function')return;
    var rows=Object.keys(routes).map(function(key){
      return '<div class="detail-row"><span><kbd>g</kbd> puis <kbd>'+key+'</kbd></span><b>'+routes[key][1]+'</b></div>';
    }).join('');
    modal('Raccourcis clavier','<p class="help-line">Navigation rapide sans quitter le clavier.</p><div class="shortcut-list">'+rows+'<div class="detail-row"><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span><b>Recherche universelle</b></div><div class="detail-row"><span><kbd>?</kbd></span><b>Cette aide</b></div></div><div class="modal-actions"><button class="btn" type="button" onclick="closeModal()">Fermer</button></div>');
  }
  document.addEventListener('keydown',function(event){
    if(isTyping(event)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='?'&&!modalOpen()){if(document.querySelector('#ia-command-dialog'))return;event.preventDefault();help();return;}
    if(armed){
      armed=false;clearTimeout(timer);
      var route=routes[String(event.key||'').toLowerCase()];
      if(route&&typeof navigate==='function'){event.preventDefault();navigate(route[0]);if(typeof toast==='function')toast('Navigation · '+route[1]);}
      return;
    }
    if(String(event.key||'').toLowerCase()==='g'&&!modalOpen()){
      armed=true;clearTimeout(timer);timer=setTimeout(function(){armed=false;},900);
    }
  },true);
})();
