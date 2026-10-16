// UI parsing only. Persistence and accounting calculations remain server-authoritative.
(function(){
function centsFromInput(value){
 const match=/^(-?)(\d{1,10})(?:[.,](\d{1,2}))?$/.exec(String(value).trim());
 if(!match)throw Error('Utilisez un montant avec au maximum deux décimales.');
 const amount=Number(match[2])*100+Number((match[3]||'').padEnd(2,'0'));
 if(!Number.isSafeInteger(amount))throw Error('Montant trop élevé.');
 return match[1]?-amount:amount;
}
globalThis.SOCLE_V3_MONEY=Object.freeze({centsFromInput});
})();
