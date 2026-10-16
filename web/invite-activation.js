const form=document.querySelector('#activation-form');
const status=document.querySelector('#activation-status');
const token=decodeURIComponent(location.hash.slice(1));
history.replaceState(null,'',location.pathname);

if(!token||token.length<20){
  status.textContent='Ce lien d’invitation est absent ou incomplet. Rouvrez le lien reçu par e-mail.';
  form.hidden=true;
}else{
  const alreadyAuthenticated=form.dataset.authenticated==='true';
  const fields=[...form.querySelectorAll('input[name="firstName"],input[name="lastName"],input[name="password"]')];
  for(const input of fields){input.required=!alreadyAuthenticated&&input.name==='password';input.closest('label').hidden=alreadyAuthenticated;}
  status.textContent=alreadyAuthenticated?'Confirmez l’accès à l’entreprise associé à votre invitation.':'Saisissez un mot de passe SOCLE ou choisissez-en un nouveau. Le nom est demandé uniquement si vous n’êtes pas lié à une personne du roster.';
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!token||token.length<20)return;
  const data=Object.fromEntries(new FormData(form));
  data.token=token;
  status.textContent='Activation en cours…';
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;
  try{
    const response=await fetch('/auth/activate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Activation refusée.');
    status.textContent='Accès activé. Ouverture de SOCLE…';
    location.replace('/');
  }catch(error){
    status.textContent=error.message||'Activation refusée.';
    button.disabled=false;
  }
});
