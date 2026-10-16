import assert from 'node:assert/strict';
import {
  approvedContractChangesCents,
  contractRevenueSummary,
  projectedContractMarginCents
} from '../worker/project-financial-revenue.js';

let assertions=0;
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);assertions++};

const acceptedQuotesCents=1000000;
const catCents=700000;

const noAmendment={contractAmendments:[]};
let revenue=contractRevenueSummary(acceptedQuotesCents,noAmendment);
eq(revenue.acceptedQuotesCents,1000000,'montant vendu initial reste distinct');
eq(revenue.approvedChangesCents,0,'aucun avenant = 0');
eq(revenue.totalContractCents,1000000,'vendu sans avenant inchangé');
eq(projectedContractMarginCents(revenue.totalContractCents,catCents),300000,'marge prévisionnelle sans avenant');

const approved={
  contractAmendments:[
    {id:'AV-1',amount:1250,status:'Approuvé'},
    {id:'AV-2',amount:250,approved:true}
  ]
};
revenue=contractRevenueSummary(acceptedQuotesCents,approved);
eq(approvedContractChangesCents(approved),150000,'seuls les avenants explicitement approuvés sont sommés');
eq(revenue.acceptedQuotesCents,1000000,'montant vendu initial ne change pas');
eq(revenue.approvedChangesCents,150000,'avenants approuvés séparés');
eq(revenue.totalContractCents,1150000,'avenants approuvés ajoutés au vendu');
eq(projectedContractMarginCents(revenue.totalContractCents,catCents),450000,'marge prévisionnelle recalculée après avenant approuvé');

const notApproved={
  contractAmendments:[
    {id:'AV-3',amount:900,status:'À valider'},
    {id:'AV-4',amount:500,status:'Refusé'},
    {id:'AV-5',amount:400,approved:false}
  ]
};
revenue=contractRevenueSummary(acceptedQuotesCents,notApproved);
eq(revenue.approvedChangesCents,0,'avenants non approuvés exclus');
eq(revenue.totalContractCents,1000000,'avenants non approuvés ne modifient pas le vendu');
eq(projectedContractMarginCents(revenue.totalContractCents,catCents),300000,'marge prévisionnelle inchangée pour avenants non approuvés');

console.log('project-financial-forecast-amendments: '+assertions+' assertions réussies');
