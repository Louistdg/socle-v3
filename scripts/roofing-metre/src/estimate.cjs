'use strict';
/**
 * SOCLE Toiture Métré: calculations only. NOT a structural engineering,
 * regulatory, bill-of-materials purchasing, or manufacturer layout guarantee.
 */
const Big = require('../vendor/big.cjs');
const ceil = x => x.round(0, Big.roundUp);
const sum = xs => xs.reduce((a,b) => a.plus(b), new Big('0'));
function decimal(v, name, {min='0',max='1000000',strict=false}={}) {
  if ((typeof v!=='string'&&typeof v!=='number')|| !/^\d+(?:\.\d{1,5})?$/.test(String(v)))
    throw new Error(name + ': valeur décimale positive attendue (point décimal)');
  const x = new Big(String(v));
  if (x.lt(min) || x.gt(max) || (strict && x.eq('0')))
    throw new Error(name + ': valeur hors limites');
  return x;
}
function required(obj, key, context, constraints) {
  if (!obj || !(key in obj)) throw new Error(context+'.'+key+': valeur requise');
  return decimal(obj[key],context+'.'+key,constraints);
}
const fmt=(x, digits=3)=>x.toFixed(digits);
function estimate(input) {
  if (!input || typeof input!=='object'||Array.isArray(input)) throw new Error('Objet projet requis');
  if (!Array.isArray(input.planes) || !input.planes.length || input.planes.length>20)
    throw new Error('planes: de 1 à 20 versants requis');
  const cfg=input.config;
  if (!cfg||typeof cfg!=='object') throw new Error('config requis: mesures de couverture et pertes explicites');
  const coverWidth = required(cfg,'usefulCoverWidthMm','config',{min:'30',max:'1000',strict:true}).div(1000);
  const exposure = required(cfg,'usefulExposureMm','config',{min:'30',max:'1000',strict:true}).div(1000);
  const battenGauge = required(cfg,'battenSpacingM','config',{min:'0.05',max:'1',strict:true});
  const counterGauge = required(cfg,'counterBattenSpacingM','config',{min:'0.2',max:'2',strict:true});
  const slateWaste = required(cfg,'slateWastePct','config',{min:'0',max:'40'}).div(100);
  const underlayAllowance = required(cfg,'underlayAllowancePct','config',{min:'0',max:'40'}).div(100);
  const timberWaste = required(cfg,'timberWastePct','config',{min:'0',max:'40'}).div(100);
  const ids=new Set();
  const roofs = input.planes.map((p,i)=>{
    if (!p || typeof p!=='object'||typeof p.id!=='string'||!(/^[a-zA-Z0-9_-]{1,50}$/.test(p.id)) || ids.has(p.id))
      throw new Error('planes['+i+']: identifiant unique requis');
    ids.add(p.id);
    const eave=required(p,'eaveLengthM',p.id,{min:'0.1',max:'300',strict:true});
    const slope=required(p,'developedSlopeM',p.id,{min:'0.1',max:'200',strict:true});
    const gross=eave.times(slope);
    const openings=p.openingsM2==null?new Big(0):decimal(p.openingsM2,p.id+'.openingsM2',{min:'0',max:'60000'});
    if(openings.gte(gross)) throw new Error(p.id+': ouverture >= surface versant');
    // No deduction from slate count: cutting/complexity makes deduction unsafe.
    const rows=ceil(slope.div(exposure));
    const columns=ceil(eave.div(coverWidth));
    const slateCount=ceil(rows.times(columns).times(new Big(1).plus(slateWaste)));
    const battenRows=ceil(slope.div(battenGauge)).plus(1);
    const counterRows=ceil(eave.div(counterGauge)).plus(1);
    return {
      id:p.id,areaGrossM2:fmt(gross),areaNetM2:fmt(gross.minus(openings)),
      openingsM2:fmt(openings),
      slateRows:Number(rows.toString()),slateColumns:Number(columns.toString()),
      slateQuantity:Number(slateCount.toString()),
      underlayM2:fmt(gross.times(new Big(1).plus(underlayAllowance))),
      battenLinearM:fmt(battenRows.times(eave).times(new Big(1).plus(timberWaste))),
      counterBattenLinearM:fmt(counterRows.times(slope).times(new Big(1).plus(timberWaste)))
    };
  });
  const measure=(key)=>input[key]==null?new Big(0):decimal(input[key],key,{max:'30000'});
  const items=[
    {code:'SLATE_PIECES',unit:'pc',quantity:String(roofs.reduce((a,p)=>a+p.slateQuantity,0))},
    {code:'UNDERLAY',unit:'m2',quantity:fmt(sum(roofs.map(p=>new Big(p.underlayM2))))},
    {code:'BATTENS',unit:'m',quantity:fmt(sum(roofs.map(p=>new Big(p.battenLinearM))))},
    {code:'COUNTER_BATTENS',unit:'m',quantity:fmt(sum(roofs.map(p=>new Big(p.counterBattenLinearM))))},
    {code:'GUTTERS',unit:'m',quantity:fmt(measure('guttersM'))},
    {code:'FLASHINGS',unit:'m',quantity:fmt(measure('flashingsM'))}
  ];
  let total = new Big(0), pricesPresent=false;
  for(const row of items) {
    const price=input.unitPrices?.[row.code];
    if(price!==undefined) {
      const unitPrice=decimal(price,'unitPrices.'+row.code,{min:'0',max:'100000'});
      row.unitPrice=unitPrice.toFixed(2);
      row.totalExVat=new Big(row.quantity).times(unitPrice).toFixed(2);
      total=total.plus(row.totalExVat);pricesPresent=true;
    }
  }
  return {
    schemaVersion:'1',projectId:String(input.projectId||'').slice(0,100),currency:input.currency||'EUR',
    measurementBasis:'developed_slope_measured_not_horizontal_run',
    planes:roofs,areaGrossM2:fmt(sum(roofs.map(p=>new Big(p.areaGrossM2)))),
    areaNetM2:fmt(sum(roofs.map(p=>new Big(p.areaNetM2)))),
    items,pricingComplete:items.every(x=>x.unitPrice!==undefined),
    knownPricedSubtotalExVat:pricesPresent?total.toFixed(2):null,
    pricedTotalExVat:items.every(x=>x.unitPrice!==undefined)?total.toFixed(2):null,
    warnings:[
      'Simulation de quantités et prix indicatifs; métrés terrain, recouvrements, découpes et prescriptions fabricant à valider.',
      'Ouvertures déduites de la surface nette, mais NON du nombre conservateur de pièces de couverture.',
      'Aucun contrôle de stabilité, vent, charges, échafaudage, sécurité, amiante, norme ou pente minimale.',
      'Prix HTVA partiel si certaines lignes sans tarif. Aucun taux de TVA présumé.'
    ]
  };
}
module.exports={estimate};
