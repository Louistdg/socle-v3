let stockBarcodeStream=null;
let stockBarcodeFrame=0;
let stockBarcodeLocked=false;
let stockBarcodeLastValue='';
let stockBarcodeLastAt=0;
let stockBarcodeContext={projectId:null};
let stockBarcodeDetector=null;
let stockBarcodeZxingReader=null;
let stockBarcodeZxingControls=null;
let stockBarcodeCameraGeneration=0;
let stockBarcodeLibraryPromise=null;
function stockBarcodeLoadLibrary(){
  if(globalThis.SocleStockZXing)return Promise.resolve();
  if(!stockBarcodeLibraryPromise)stockBarcodeLibraryPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/stock-zxing.js';script.async=true;
    script.onload=()=>resolve();script.onerror=()=>{script.remove();stockBarcodeLibraryPromise=null;reject(new Error('Lecteur indisponible'));};
    document.head.append(script);
  });
  return stockBarcodeLibraryPromise;
}
const stockBarcodeInline=value=>esc(JSON.stringify(value));

const stockBarcodeL={0:'0001101',1:'0011001',2:'0010011',3:'0111101',4:'0100011',5:'0110001',6:'0101111',7:'0111011',8:'0110111',9:'0001011'};
const stockBarcodeG={0:'0100111',1:'0110011',2:'0011011',3:'0100001',4:'0011101',5:'0111001',6:'0000101',7:'0010001',8:'0001001',9:'0010111'};
const stockBarcodeR={0:'1110010',1:'1100110',2:'1101100',3:'1000010',4:'1011100',5:'1001110',6:'1010000',7:'1000100',8:'1001000',9:'1110100'};
const stockBarcodeParity={LLLLLL:'0',LLGLGG:'1',LLGGLG:'2',LLGGGL:'3',LGLLGG:'4',LGGLLG:'5',LGGGLL:'6',LGLGLG:'7',LGLGGL:'8',LGGLGL:'9'};

function stockBarcodeReverseLookup(table,bits){for(const [digit,pattern] of Object.entries(table))if(pattern===bits)return digit;return null}
function stockBarcodeCheck(value){
  const raw=String(value||'');if(!/^\d+$/.test(raw)||raw.length<2)return false;
  let sum=0,weight=3;for(let i=raw.length-2;i>=0;i--){sum+=Number(raw[i])*weight;weight=weight===3?1:3}
  return ((10-(sum%10))%10)===Number(raw.at(-1));
}
function stockBarcodeDecodeModules(bits){
  if(bits.length===95&&bits.slice(0,3)==='101'&&bits.slice(45,50)==='01010'&&bits.slice(92)==='101'){
    let parity='',body='';
    for(let i=0;i<6;i++){const part=bits.slice(3+i*7,10+i*7),l=stockBarcodeReverseLookup(stockBarcodeL,part),g=stockBarcodeReverseLookup(stockBarcodeG,part);if(l!==null){parity+='L';body+=l}else if(g!==null){parity+='G';body+=g}else return null}
    const first=stockBarcodeParity[parity];if(first===undefined)return null;
    let right='';for(let i=0;i<6;i++){const d=stockBarcodeReverseLookup(stockBarcodeR,bits.slice(50+i*7,57+i*7));if(d===null)return null;right+=d}
    const value=first+body+right;return stockBarcodeCheck(value)?{rawValue:value,format:value.startsWith('0')?'upc_a':'ean_13'}:null;
  }
  if(bits.length===67&&bits.slice(0,3)==='101'&&bits.slice(31,36)==='01010'&&bits.slice(64)==='101'){
    let value='';for(let i=0;i<4;i++){const d=stockBarcodeReverseLookup(stockBarcodeL,bits.slice(3+i*7,10+i*7));if(d===null)return null;value+=d}
    for(let i=0;i<4;i++){const d=stockBarcodeReverseLookup(stockBarcodeR,bits.slice(36+i*7,43+i*7));if(d===null)return null;value+=d}
    return stockBarcodeCheck(value)?{rawValue:value,format:'ean_8'}:null;
  }
  return null;
}
function stockBarcodeDecodeLine(imageData,y){
  const {data,width}=imageData,gray=new Uint8Array(width);let min=255,max=0;
  for(let x=0;x<width;x++){const i=(y*width+x)*4,g=Math.round(data[i]*.299+data[i+1]*.587+data[i+2]*.114);gray[x]=g;if(g<min)min=g;if(g>max)max=g}
  if(max-min<55)return null;
  const threshold=(min+max)/2,runs=[];let bit=gray[0]<threshold?1:0,start=0;
  for(let x=1;x<=width;x++){const next=x<width&&gray[x]<threshold?1:0;if(x===width||next!==bit){runs.push({bit,start,length:x-start});start=x;bit=next}}
  for(let i=0;i<runs.length-2;i++){
    if(runs[i].bit!==1||runs[i+1].bit!==0||runs[i+2].bit!==1)continue;
    const trio=[runs[i].length,runs[i+1].length,runs[i+2].length],small=Math.min(...trio),large=Math.max(...trio);if(!small||large/small>1.9)continue;
    const moduleWidth=trio.reduce((a,b)=>a+b,0)/3,origin=runs[i].start;
    for(const modules of [95,67]){
      if(origin+moduleWidth*modules>width)continue;
      let candidate='';for(let m=0;m<modules;m++){const x=Math.min(width-1,Math.max(0,Math.floor(origin+(m+.5)*moduleWidth)));candidate+=gray[x]<threshold?'1':'0'}
      const decoded=stockBarcodeDecodeModules(candidate);if(decoded)return decoded;
    }
  }
  return null;
}
function stockBarcodeFallbackDecode(video){
  if(!video?.videoWidth||!video?.videoHeight)return null;
  const canvas=document.querySelector('[data-stock-barcode-canvas]');if(!canvas)return null;
  const maxWidth=640,scale=Math.min(1,maxWidth/video.videoWidth),width=Math.max(240,Math.round(video.videoWidth*scale)),height=Math.max(160,Math.round(video.videoHeight*scale));
  canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,width,height);
  const image=ctx.getImageData(0,0,width,height);for(const ratio of [.42,.5,.58]){const found=stockBarcodeDecodeLine(image,Math.min(height-1,Math.max(0,Math.round(height*ratio))));if(found)return found}return null;
}
function stockBarcodeStopCamera(){
  stockBarcodeCameraGeneration++;
  if(stockBarcodeFrame){cancelAnimationFrame(stockBarcodeFrame);stockBarcodeFrame=0}
  try{stockBarcodeZxingControls?.stop?.()}catch{}
  stockBarcodeZxingControls=null;stockBarcodeZxingReader=null;
  if(stockBarcodeStream){for(const track of stockBarcodeStream.getTracks())track.stop();stockBarcodeStream=null}
  stockBarcodeDetector=null;stockBarcodeLocked=false;
}
function stockBarcodeStatus(message,kind=''){
  const node=document.querySelector('[data-stock-barcode-status]');if(node){node.textContent=message;node.dataset.kind=kind}
}
function stockBarcodeResultHtml(result){
  const item=result.item||{},balances=item.balances||[],category=[item.category?.name,item.subcategory?.name].filter(Boolean).join(' · ')||'Non classé';
  return '<article class="stock-barcode-result"><div><small>Article identifié</small><h3>'+esc(item.name||'Article')+'</h3><p>'+esc(category)+(item.reference?' · '+esc(item.reference):'')+'</p></div>'+
    '<div class="stock-barcode-result-grid"><span><small>Stock total</small><strong>'+esc(String(item.quantity??0))+' '+esc(item.unit||'')+'</strong></span>'+
    balances.map(balance=>'<span><small>'+esc(balance.location?.name||'Emplacement')+'</small><strong>'+esc(String(balance.quantity??0))+' '+esc(item.unit||'')+'</strong></span>').join('')+
    (item.unitCost!==undefined?'<span><small>Coût unitaire</small><strong>'+money(Number(item.unitCost||0))+'</strong></span>':'')+'</div>'+
    '<div class="modal-actions">'+(stockBarcodeContext.projectId?'<button class="btn primary" type="button" onclick="stockBarcodeUseTerrain('+stockBarcodeInline(String(item.id||''))+')">Utiliser pour ce chantier</button>':'<button class="btn primary" type="button" onclick="closeModal();stockCatalogShowItem('+stockBarcodeInline(String(item.id||''))+')">Voir l’article</button>'+(stockCatalogCapabilities?.moveStock?'<button class="btn" type="button" onclick="closeModal();stockMovementForm('+stockBarcodeInline(String(item.id||''))+')">Mouvement</button>':'')+(stockCatalogCapabilities?.manageItems?'<button class="btn" type="button" onclick="stockBarcodeManageItem('+stockBarcodeInline(String(item.id||''))+')">Codes-barres</button>':''))+'</div></article>';
}
async function stockBarcodeLookup(value,symbology='unknown'){
  const projectId=stockBarcodeContext.projectId,path=projectId?'/api/projects/'+encodeURIComponent(projectId)+'/stock-consume/barcode':'/api/stock-items/by-barcode';
  return serverJson(path+'?value='+encodeURIComponent(String(value||''))+'&symbology='+encodeURIComponent(String(symbology||'unknown')));
}
async function stockBarcodeHandle(value,symbology='unknown'){
  const raw=String(value||'').trim();if(!raw)return;
  const nowMs=Date.now();if(stockBarcodeLocked||raw===stockBarcodeLastValue&&nowMs-stockBarcodeLastAt<2200)return;
  stockBarcodeLocked=true;stockBarcodeLastValue=raw;stockBarcodeLastAt=nowMs;stockBarcodeStatus('Code détecté · recherche de l’article…');
  try{
    const result=await stockBarcodeLookup(raw,symbology),target=document.querySelector('[data-stock-barcode-result]');
    if(target){target.innerHTML=stockBarcodeResultHtml(result);target.hidden=false}
    stockBarcodeStopCamera();
    stockBarcodeStatus('Article identifié.','success');
  }catch(error){
    const target=document.querySelector('[data-stock-barcode-result]');if(target){target.innerHTML='<p class="notice">'+esc(error.message||'Code-barres inconnu.')+'</p>';target.hidden=false}
    stockBarcodeStatus(error.message||'Code-barres inconnu.','error');
  }finally{setTimeout(()=>{stockBarcodeLocked=false},900)}
}
async function stockBarcodeCameraLoop(video){
  if(!stockBarcodeStream)return;
  try{
    if(!stockBarcodeLocked){
      let result=null;
      if(stockBarcodeDetector){const codes=await stockBarcodeDetector.detect(video);if(codes?.length)result={rawValue:codes[0].rawValue,format:codes[0].format||'unknown'}}
      else result=stockBarcodeFallbackDecode(video);
      if(result?.rawValue)await stockBarcodeHandle(result.rawValue,result.format||'unknown');
    }
  }catch(error){stockBarcodeStatus('Lecture caméra temporairement indisponible. Utilisez la saisie manuelle.','error')}
  if(stockBarcodeStream)stockBarcodeFrame=requestAnimationFrame(()=>stockBarcodeCameraLoop(video));
}
async function stockBarcodeStartCamera(){
  const video=document.querySelector('[data-stock-barcode-video]');if(!video)return;
  const generation=stockBarcodeCameraGeneration;
  if(!navigator.mediaDevices?.getUserMedia){stockBarcodeStatus('Aucune caméra navigateur disponible. Saisie manuelle disponible.','error');return}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    if(generation!==stockBarcodeCameraGeneration||!video.isConnected){stream.getTracks().forEach(track=>track.stop());return;}
    stockBarcodeStream=stream;video.srcObject=stockBarcodeStream;await video.play();
    if('BarcodeDetector' in globalThis){
      try{const supported=await BarcodeDetector.getSupportedFormats?.(),wanted=['ean_13','ean_8','upc_a','code_128','code_39','itf'];stockBarcodeDetector=new BarcodeDetector(supported?.length?{formats:wanted.filter(format=>supported.includes(format))}:undefined)}
      catch{stockBarcodeDetector=null}
    }
    if(!stockBarcodeDetector)await stockBarcodeLoadLibrary().catch(()=>{});
    if(generation!==stockBarcodeCameraGeneration||!video.isConnected||!stockBarcodeStream)return;
    let usingZxing=false;
    if(!stockBarcodeDetector&&globalThis.SocleStockZXing?.createReader){
      try{
        const reader=globalThis.SocleStockZXing.createReader();
        const controls=await reader.decodeFromVideoElement(video,(result)=>{
          if(result?.getText())setTimeout(()=>{if(generation===stockBarcodeCameraGeneration&&video.isConnected)stockBarcodeHandle(result.getText(),globalThis.SocleStockZXing.symbology(result.getBarcodeFormat()));},0);
        });
        if(generation!==stockBarcodeCameraGeneration||!video.isConnected||!stockBarcodeStream){try{controls?.stop?.()}catch{}return;}
        stockBarcodeZxingReader=reader;stockBarcodeZxingControls=controls;
        usingZxing=Boolean(stockBarcodeZxingControls);
      }catch{if(generation!==stockBarcodeCameraGeneration)return;try{stockBarcodeZxingControls?.stop?.()}catch{}stockBarcodeZxingControls=null;stockBarcodeZxingReader=null}
    }
    stockBarcodeStatus(stockBarcodeDetector?'Caméra active · détection native.':usingZxing?'Caméra active · lecteur ZXing embarqué.':'Caméra active · lecteur EAN de secours.','success');
    if(!usingZxing)stockBarcodeFrame=requestAnimationFrame(()=>stockBarcodeCameraLoop(video));
  }catch(error){if(generation===stockBarcodeCameraGeneration)stockBarcodeStatus(error?.name==='NotAllowedError'?'Accès caméra refusé. Utilisez la saisie manuelle.':'Caméra indisponible. Utilisez la saisie manuelle.','error')}
}
function stockBarcodeOpenScanner(options={}){
  stockBarcodeStopCamera();stockBarcodeContext={projectId:options.projectId?String(options.projectId):null};stockBarcodeLastValue='';stockBarcodeLastAt=0;
  modal('Scanner un article','<div class="stock-barcode-shell"><div class="stock-barcode-camera"><video data-stock-barcode-video playsinline muted></video><canvas data-stock-barcode-canvas hidden></canvas><div class="stock-barcode-guide" aria-hidden="true"></div></div><p class="subtle" data-stock-barcode-status role="status">Initialisation de la caméra…</p><form class="stock-barcode-manual" onsubmit="stockBarcodeSubmitManual(event)"><label>Code-barres<input name="barcode" inputmode="numeric" autocomplete="off" maxlength="160" placeholder="EAN, UPC ou code interne" required></label><button class="btn" type="submit">Rechercher</button></form><div data-stock-barcode-result hidden></div></div>');
  if(options.skipCamera)stockBarcodeStatus('Caméra non utilisée · saisie manuelle disponible.');else stockBarcodeStartCamera();
}
async function stockBarcodeSubmitManual(event){event.preventDefault();const form=event.currentTarget,value=String(new FormData(form).get('barcode')||'').trim();if(value)await stockBarcodeHandle(value,'unknown')}
async function stockBarcodeUseTerrain(itemId){
  const projectId=stockBarcodeContext.projectId;if(!projectId)return;stockBarcodeStopCamera();
  await fieldPortalOpenStockConsume(projectId);const form=fieldPortalStockForm();if(!form)return;
  const item=(await stockBarcodeLookup(stockBarcodeLastValue,'unknown').catch(()=>null))?.item;
  const query=item?.reference||item?.name||'';form.elements.query.value=query;await fieldPortalSearchStock(projectId,query);
  if([...form.elements.stockItemId.options].some(option=>String(option.value)===String(itemId))){form.elements.stockItemId.value=String(itemId);fieldPortalStockItemChanged(projectId)}
}
async function stockBarcodeManageItem(itemId){
  stockBarcodeStopCamera();const result=await serverJson('/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes'),list=result.barcodes||[];
  const rows=list.map(code=>'<div class="stock-barcode-row"><span><strong>'+esc(code.rawValue)+'</strong><small>'+esc(code.symbology||'unknown')+(code.gtin14?' · GTIN-14 '+esc(code.gtin14):'')+' · '+esc(code.status)+'</small></span><span>'+(code.isPrimary?'<span class="badge green">Principal</span>':'')+'</span><span class="stock-barcode-row-actions">'+(code.status==='active'&&!code.isPrimary?'<button class="link" type="button" onclick="stockBarcodeUpdate('+stockBarcodeInline(itemId)+','+stockBarcodeInline(code.id)+',{status:\'active\',isPrimary:true})">Principal</button>':'')+(code.status==='active'?'<button class="link" type="button" onclick="stockBarcodeUpdate('+stockBarcodeInline(itemId)+','+stockBarcodeInline(code.id)+',{status:\'inactive\',isPrimary:false})">Désactiver</button>':'<button class="link" type="button" onclick="stockBarcodeUpdate('+stockBarcodeInline(itemId)+','+stockBarcodeInline(code.id)+',{status:\'active\',isPrimary:false})">Réactiver</button>')+'</span></div>').join('');
  modal('Codes-barres de l’article','<div class="stock-barcode-manager">'+(rows||'<p class="subtle">Aucun code-barres.</p>')+'<form onsubmit="stockBarcodeAdd(event,'+stockBarcodeInline(itemId)+')"><div class="form-two"><label>Nouveau code<input name="value" maxlength="160" required></label><label>Format<select name="symbology"><option value="unknown">Automatique</option><option value="ean_13">EAN-13</option><option value="ean_8">EAN-8</option><option value="upc_a">UPC-A</option><option value="itf_14">ITF-14</option><option value="code_128">Code 128</option><option value="code_39">Code 39</option></select></label></div><label class="stock-barcode-primary"><input type="checkbox" name="isPrimary"> Définir comme code principal</label><div class="modal-actions"><button class="btn primary">Ajouter</button></div></form></div>');
}
async function stockBarcodeAdd(event,itemId){event.preventDefault();const f=new FormData(event.currentTarget);try{await serverJson('/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes',{method:'POST',body:JSON.stringify({value:String(f.get('value')||'').trim(),symbology:String(f.get('symbology')||'unknown'),isPrimary:Boolean(f.get('isPrimary'))})});await loadServerFieldData({renderAfter:false});await loadStockCatalog({force:true,renderAfter:false});await stockBarcodeManageItem(itemId);toast('Code-barres enregistré.')}catch(error){toast(error.message||'Code-barres refusé.')}}
async function stockBarcodeUpdate(itemId,barcodeId,payload){try{await serverJson('/api/stock-items/'+encodeURIComponent(itemId)+'/barcodes/'+encodeURIComponent(barcodeId),{method:'PATCH',body:JSON.stringify(payload)});await loadServerFieldData({renderAfter:false});await loadStockCatalog({force:true,renderAfter:false});await stockBarcodeManageItem(itemId);toast('Code-barres mis à jour.')}catch(error){toast(error.message||'Modification refusée.')}}

if(typeof stockCatalogShowItem==='function'){
  const stockBarcodeBaseShowItem=stockCatalogShowItem;
  stockCatalogShowItem=function(id){const result=stockBarcodeBaseShowItem(id);if(stockCatalogCapabilities?.manageItems){const actions=document.querySelector('#modal .modal-actions');if(actions&&!actions.querySelector('[data-stock-barcode-manage]'))actions.insertAdjacentHTML('beforeend','<button class="btn" data-stock-barcode-manage type="button" onclick="stockBarcodeManageItem('+stockBarcodeInline(String(id))+')">Codes-barres</button>')}return result};
  globalThis.stockCatalogShowItem=stockCatalogShowItem;
}
if(typeof fieldPortalOpenStockConsume==='function'){
  const stockBarcodeBaseFieldConsume=fieldPortalOpenStockConsume;
  fieldPortalOpenStockConsume=async function(projectId){await stockBarcodeBaseFieldConsume(projectId);const form=fieldPortalStockForm();if(form&&!form.querySelector('[data-stock-barcode-terrain]')){const first=form.querySelector('label');first?.insertAdjacentHTML('afterend','<div class="field-actions"><button class="btn ghost" data-stock-barcode-terrain type="button" onclick="stockBarcodeOpenScanner({projectId:'+stockBarcodeInline(String(projectId))+'})">Scanner un article</button></div>')}};
  globalThis.fieldPortalOpenStockConsume=fieldPortalOpenStockConsume;
}
if(typeof closeModal==='function'){
  const stockBarcodeBaseClose=closeModal;
  closeModal=function(){stockBarcodeStopCamera();return stockBarcodeBaseClose.apply(this,arguments)};
  globalThis.closeModal=closeModal;
}

globalThis.stockBarcodeOpenScanner=stockBarcodeOpenScanner;
globalThis.stockBarcodeSubmitManual=stockBarcodeSubmitManual;
globalThis.stockBarcodeManageItem=stockBarcodeManageItem;
globalThis.stockBarcodeAdd=stockBarcodeAdd;
globalThis.stockBarcodeUpdate=stockBarcodeUpdate;
globalThis.stockBarcodeUseTerrain=stockBarcodeUseTerrain;
globalThis.stockBarcodeFallbackDecode=stockBarcodeFallbackDecode;
