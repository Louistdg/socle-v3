const APPROVED_STATUSES=new Set(['approved','accepted','approuve','accepte']);

function normalizedStatus(value){
  return String(value??'')
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu,'');
}

export function approvedContractChangesCents(project){
  const amendments=Array.isArray(project?.contractAmendments)?project.contractAmendments:[];
  return amendments.reduce((sum,amendment)=>{
    if(!amendment||typeof amendment!=='object')return sum;
    const approved=amendment.approved===true||APPROVED_STATUSES.has(normalizedStatus(amendment.status));
    if(!approved)return sum;
    const amount=Number(amendment.amount);
    return Number.isFinite(amount)?sum+Math.round(amount*100):sum;
  },0);
}

export function contractRevenueSummary(acceptedQuotesCents,project){
  const initial=Number.isFinite(Number(acceptedQuotesCents))?Math.round(Number(acceptedQuotesCents)):0;
  const approvedChangesCents=approvedContractChangesCents(project);
  return {
    acceptedQuotesCents:initial,
    approvedChangesCents,
    totalContractCents:initial+approvedChangesCents
  };
}

export function projectedContractMarginCents(totalContractCents,catCents){
  return catCents===null||catCents===undefined?null:Number(totalContractCents)-Number(catCents);
}
