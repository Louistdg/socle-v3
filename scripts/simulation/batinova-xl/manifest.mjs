const PAD_WIDTH=5;

export const BATXL_NAMESPACE='BATXL';
export const BATXL_VERSION=1;

export const ranges=Object.freeze({
  client:[1000,1999],
  project:[2000,2999],
  person:[3000,3999],
  team:[4000,4099],
  role:[4100,4199],
  user:[4200,4599],
  member:[4600,4999],
  assignment:[5000,6999],
  timeEntry:[7000,8999],
  task:[9000,9999],
  supplier:[10000,10999],
  subcontractor:[11000,11999],
  purchaseOrder:[12000,13999],
  delivery:[14000,15999],
  stockItem:[16000,17999],
  stockMovement:[18000,21999],
  vehicle:[22000,22999],
  asset:[23000,25999],
  document:[26000,28999],
  photo:[29000,31999],
  expense:[32000,33999],
  supplierPayment:[34000,35999],
  quote:[36000,37999],
  invoice:[38000,39999],
  correction:[40000,40999],
  checklist:[41000,41999],
  resourcePack:[42000,42999],
  simulationRun:[43000,43999],
  purchaseOrderLine:[44000,45999],
  reference:[46000,47999],
  allocation:[48000,49999],
  amendment:[50000,50999],
  financialBaseline:[51000,51999],
  deliveryLine:[52000,53999],
  stockLocation:[54000,54999],
  bankTransfer:[55000,55999],
  financialForecast:[56000,56999],
  qa:[90000,99999]
});

export const prefixes=Object.freeze({
  client:'BATXL-CLI',
  project:'BATXL-PRJ',
  person:'BATXL-PER',
  team:'BATXL-TEAM',
  role:'BATXL-ROLE',
  user:'BATXL-USER',
  member:'BATXL-MEMBER',
  assignment:'BATXL-ASG',
  timeEntry:'BATXL-TE',
  task:'BATXL-TASK',
  supplier:'BATXL-SUP',
  subcontractor:'BATXL-SUB',
  purchaseOrder:'BATXL-PO',
  delivery:'BATXL-BL',
  stockItem:'BATXL-STK',
  stockMovement:'BATXL-MOV',
  vehicle:'BATXL-VEH',
  asset:'BATXL-AST',
  document:'BATXL-DOC',
  photo:'BATXL-PHO',
  expense:'BATXL-EXP',
  supplierPayment:'BATXL-PAY',
  quote:'BATXL-QUOTE',
  invoice:'BATXL-INV',
  correction:'BATXL-COR',
  checklist:'BATXL-CHK',
  resourcePack:'BATXL-PACK',
  simulationRun:'BATXL-RUN',
  purchaseOrderLine:'BATXL-POL',
  reference:'BATXL-REF',
  allocation:'BATXL-ALLOC',
  amendment:'BATXL-AMEND',
  financialBaseline:'BATXL-BASE',
  deliveryLine:'BATXL-BLL',
  stockLocation:'BATXL-LOC',
  bankTransfer:'BATXL-VIR',
  financialForecast:'BATXL-FF',
  qa:'BATXL-QA'
});

export const references=Object.freeze({
  client:index=>`BATXL-CLIENT-${pad(ordinal('client',index))}`,
  project:index=>`BATXL-CHANTIER-${pad(ordinal('project',index))}`,
  asset:index=>`BATXL-MATERIEL-${pad(ordinal('asset',index))}`,
  stock:index=>`BATXL-STOCK-${pad(ordinal('stockItem',index))}`,
  vehicle:index=>`BATXL-VEHICULE-${pad(ordinal('vehicle',index))}`,
  purchaseOrder:index=>`BATXL-BC-${pad(ordinal('purchaseOrder',index))}`
});

export const operationKeyPrefixes=Object.freeze({
  purchaseOrder:'BATXL-PO-OP',
  delivery:'BATXL-BL-OP',
  task:'BATXL-TASK-OP',
  stockMovement:'BATXL-MOV-OP',
  expense:'BATXL-EXP-OP',
  supplierPayment:'BATXL-PAY-OP'
});

export const publishedNamespaces=Object.freeze({
  ia2:Object.freeze([
    'BATXL-FINANCE-STOCK-V1','BATXL-ALLOC-','BATXL-AMEND-','BATXL-AV-','BATXL-BASE-',
    'BATXL-BC-','BATXL-BL-','BATXL-BL-OP-','BATXL-BLL-','BATXL-EXP-','BATXL-EXP-OP-',
    'BATXL-FF-','BATXL-LOC-','BATXL-MOV-','BATXL-MOV-OP-','BATXL-PAY-','BATXL-PAY-OP-',
    'BATXL-PO-','BATXL-PO-OP-','BATXL-POL-','BATXL-QUOTE-','BATXL-REF-','BATXL-STK-',
    'BATXL-SUB-','BATXL-SUP-','BATXL-VIR-'
  ]),
  ia3:Object.freeze([
    'BATXL-IA3-PLANNING-PEOPLE','BATXL-ASG-','BATXL-CHK-','BATXL-COR-','BATXL-MEMBER-',
    'BATXL-PACK-','BATXL-ROLE-','BATXL-RUN-','BATXL-SUB-','BATXL-TASK-','BATXL-TASK-OP-',
    'BATXL-TE-','BATXL-USER-'
  ]),
  ia5:Object.freeze([
    'BATXL-IA5-DOCUMENTS','BATXL-AUD-','BATXL-DOC-','BATXL-DOC-FOLDER-','BATXL-DOC-MEMBER-',
    'BATXL-DOC-ROLE-','BATXL-DOC-TL-USER','BATXL-DOC-W-USER','BATXL-OP-DOCUMENT-',
    'BATXL-OP-PHOTO-','BATXL-PHO-','BATXL-PHOTO-','BATXL-REF-','BATXL-REL-',
    'BATXL-RUN-IA5-DOCUMENTS-V1'
  ])
});

export const packFiles=Object.freeze([
  'core-clients-projects-commercial-pack.mjs',
  'finance-stock-pack.mjs',
  'client-finance-stories-pack.mjs',
  'assets-fleet-pack.mjs',
  'planning-people-pack.mjs',
  'documents-pack.mjs',
  'procurement-bom-chain-pack.mjs',
  'labor-cost-baseline-pack.mjs',
  'material-cost-stories-pack.mjs',
  'field-operations-stories-pack.mjs'
]);

export const environment=Object.freeze({
  databasePath:'BATXL_DB_PATH',
  organizationId:'BATXL_ORGANIZATION_ID',
  simulationMode:'BATXL_SIMULATION'
});

export const defaults=Object.freeze({
  organizationId:'org-local-owner',
  databaseRelativePath:'data/socle.sqlite',
  simulationMode:'1'
});

function pad(value){return String(value).padStart(PAD_WIDTH,'0')}
function normalizeToken(value){
  return String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'GEN';
}
function rangeFor(domain){
  const range=ranges[domain];
  if(!range)throw new Error('Domaine BATXL inconnu : '+domain);
  return range;
}
export function ordinal(domain,index){
  if(!Number.isInteger(index)||index<1)throw new Error('Index BATXL invalide pour '+domain+' : '+index);
  const [start,end]=rangeFor(domain),value=start+index-1;
  if(value>end)throw new Error('Plage BATXL dépassée pour '+domain+' : '+index);
  return value;
}
export function id(domain,index){
  return prefixes[domain]+'-'+pad(ordinal(domain,index));
}
export function operationKey(domain,index,action='UPSERT'){
  const prefix=operationKeyPrefixes[domain]||`BATXL-OP-${normalizeToken(domain)}`;
  return `${prefix}-${pad(ordinal(domain,index))}-${normalizeToken(action)}`;
}
export function reference(kind,index){
  if(!Number.isInteger(index)||index<1)throw new Error('Index référence BATXL invalide : '+index);
  return `BATXL-${normalizeToken(kind)}-${pad(index)}`;
}
export function manifestSummary(){
  return {
    namespace:BATXL_NAMESPACE,
    version:BATXL_VERSION,
    ranges,
    prefixes,
    operationKeyPrefixes,
    publishedNamespaces,
    packFiles,
    environment,
    defaults
  };
}
export function assertManifest(){
  const entries=Object.entries(ranges).map(([domain,[start,end]])=>({domain,start,end})).sort((a,b)=>a.start-b.start);
  for(const entry of entries){
    if(!Number.isInteger(entry.start)||!Number.isInteger(entry.end)||entry.start<1||entry.start>entry.end)throw new Error('Plage BATXL invalide : '+entry.domain);
    if(!prefixes[entry.domain]||!prefixes[entry.domain].startsWith('BATXL-'))throw new Error('Préfixe BATXL invalide : '+entry.domain);
  }
  for(let i=1;i<entries.length;i++)if(entries[i].start<=entries[i-1].end)throw new Error(`Chevauchement BATXL : ${entries[i-1].domain}/${entries[i].domain}`);
  const prefixValues=Object.values(prefixes);
  if(new Set(prefixValues).size!==prefixValues.length)throw new Error('Préfixes BATXL dupliqués');
  if(new Set(packFiles).size!==packFiles.length)throw new Error('Packs BATXL dupliqués');
  for(const [owner,namespaces] of Object.entries(publishedNamespaces)){
    if(!namespaces.length||namespaces.some(value=>!String(value).startsWith('BATXL-')))throw new Error('Namespace publié invalide : '+owner);
  }
  return {
    domains:entries.length,
    prefixes:prefixValues.length,
    rangesNonOverlapping:true,
    packs:packFiles.length,
    publishedNamespaces:Object.values(publishedNamespaces).reduce((n,list)=>n+list.length,0)
  };
}
