import assert from 'node:assert/strict';
import {existsSync,readFileSync,statSync} from 'node:fs';
import vm from 'node:vm';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import worker from '../dist/server/index.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const packageJson=JSON.parse(read('../package.json'));
const lock=JSON.parse(read('../package-lock.json'));
const html=read('../web/index.html');
const build=read('../scripts/build.mjs');
const docker=read('../Dockerfile');
const entry=read('../scripts/pdfjs-entry.js');
const reader=read('../web/supplier-invoice-pdf.js');
const allocations=read('../web/supplier-allocations.js');
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++};

assert.equal(packageJson.devDependencies?.['pdfjs-dist'],'6.4.299','version PDF.js figée');checks++;
assert.equal(lock.packages?.['node_modules/pdfjs-dist']?.license,'Apache-2.0','licence PDF.js vérifiée dans le lockfile');checks++;
ok(html.includes('supplier-invoice-pdf.js')&&!html.includes('pdfjs.js'),'PDF.js ne se charge pas tant que la personne ne lance pas la lecture');
ok(entry.includes("from 'pdfjs-dist/build/pdf.mjs'")&&entry.includes("'/pdfjs-worker.mjs'")&&entry.includes('SoclePdfJs'),'API et worker PDF.js locaux');
ok(reader.includes("script.src='/pdfjs.js'")&&reader.includes('file.arrayBuffer()')&&!reader.includes('fetch(file'),'le document choisi est analysé localement à la demande');
ok(reader.includes('12*1024*1024')&&reader.includes('Math.min(pdf.numPages,5)'),'limite de taille et de pages');
ok(reader.includes('isEvalSupported:false')&&reader.includes('task.destroy()'),'options de sécurité et fermeture du document');
ok(reader.includes('Appliquer les propositions trouvées')&&reader.toLowerCase().includes('aucune donnée ne sera devinée'),'confirmation explicite et abstention si texte absent');
ok(reader.includes('field.value||').toString()&&reader.includes("if(String(field.value||'').trim())continue"),'champs déjà remplis préservés');
ok(reader.includes('esc(extracted.text')&&reader.includes('esc(found.join'),'texte PDF échappé avant affichage');
ok(reader.includes('installSupplierInvoicePdfControl')&&reader.includes('Lire les informations du PDF')&&reader.includes("file.type!=='application/pdf'"),'outil injecté dans l’ajout fournisseur et limité au PDF');
ok(build.includes('scripts/pdfjs-entry.js')&&build.includes('pdf.worker.min.mjs')&&/["']pdfjs-worker\.mjs["']/.test(build),'build compile et embarque le bundle et le worker');
ok(docker.includes('npm ci')&&docker.includes('npm prune --omit=dev'),'construction Railway depuis le lockfile, outils de build retirés ensuite');
ok(existsSync(new URL('../web/pdfjs.js',import.meta.url))&&statSync(new URL('../web/pdfjs.js',import.meta.url)).size<1_000_000,'bundle PDF.js compact et généré');
ok(existsSync(new URL('../web/pdfjs-worker.mjs',import.meta.url)),'worker PDF.js local disponible');
ok(read('../licenses/pdfjs-dist-Apache-2.0.txt').includes('Apache License'),'licence conservée');

const context=vm.createContext({});
vm.runInContext(reader,context);
const text='ACME Fournitures\nFACTURE N° F-2026-001\nDate de facture: 09/10/2026\nTotal HTVA: 1 020,10 EUR\nTotal TVA: 214,46 EUR\nTotal TTC: 1 234,56 EUR';
const parsed=JSON.parse(JSON.stringify(vm.runInContext(`parseSupplierInvoicePdfText(${JSON.stringify(text)},[${JSON.stringify({id:'supplier-acme',name:'ACME Fournitures'})}])`,context)));
assert.deepEqual(parsed,{supplierId:'supplier-acme',supplierName:'ACME Fournitures',reference:'F-2026-001',date:'2026-10-09',total:1234.56,vat:214.46,found:{supplier:true,reference:true,date:true,total:true,vat:true}});checks++;
const ocrInvoice=JSON.parse(JSON.stringify(vm.runInContext(`parseSupplierInvoicePdfText(${JSON.stringify('Marchand Materiaux\nFacture numero AB-2026-45821\nDate facture : 12/10/2026\nTotal TVAC : 123,45 EUR\nMontant TVA : 21,45 EUR')},[${JSON.stringify({id:'marchand-1',name:'Marchand Matériaux'})}])`,context)));
assert.equal(ocrInvoice.supplierId,'marchand-1','le fournisseur OCR accentué est reconnu après normalisation');assert.equal(ocrInvoice.reference,'AB-2026-45821','le préfixe « numero » ne devient pas le numéro de facture');assert.equal(ocrInvoice.date,'2026-10-12');assert.equal(ocrInvoice.total,123.45);assert.equal(ocrInvoice.vat,21.45);checks+=5;
const unknown=JSON.parse(JSON.stringify(vm.runInContext(`parseSupplierInvoicePdfText(${JSON.stringify('Facture n° ABC-99\nDate: 31/02/2026\nTotal HTVA 200,00 EUR')},[])`,context)));
assert.equal(unknown.supplierId,'','fournisseur inconnu laissé vide');checks++;
assert.equal(unknown.date,'','date calendrier invalide écartée');checks++;
assert.equal(unknown.total,null,'total HT seul non utilisé comme total TTC');checks++;
const positions=[];let pdf=`%PDF-1.4\n`;
const stream='BT /F1 12 Tf 72 720 Td (ACME Fournitures) Tj ET\nBT /F1 12 Tf 72 700 Td (FACTURE N: F-2026-001) Tj ET\nBT /F1 12 Tf 72 680 Td (Date facture: 09/10/2026) Tj ET\nBT /F1 12 Tf 72 660 Td (Total TTC: 1 234,56 EUR) Tj ET\nBT /F1 12 Tf 72 640 Td (Total TVA: 214,46 EUR) Tj ET';
const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
for(let index=0;index<objects.length;index++){positions.push(Buffer.byteLength(pdf,'binary'));pdf+=`${index+1} 0 obj\n${objects[index]}\nendobj\n`}
const xref=Buffer.byteLength(pdf,'binary');pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${positions.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
const pdfTask=getDocument({data:new Uint8Array(Buffer.from(pdf,'binary')),isEvalSupported:false,useSystemFonts:true}),parsedPdf=await pdfTask.promise;
try{const page=await parsedPdf.getPage(1),content=await page.getTextContent(),extracted=vm.runInContext(`supplierPdfItemsToText(${JSON.stringify(content.items)})`,context),invoice=JSON.parse(JSON.stringify(vm.runInContext(`parseSupplierInvoicePdfText(${JSON.stringify(extracted)},[${JSON.stringify({id:'supplier-acme',name:'ACME Fournitures'})}])`,context)));assert.equal(invoice.reference,'F-2026-001','PDF.js extrait le numéro de facture du PDF réel généré');assert.equal(invoice.total,1234.56,'PDF.js extrait le total TTC');assert.equal(invoice.vat,214.46,'PDF.js extrait la TVA séparée');checks+=3}catch(error){throw error}finally{await pdfTask.destroy()}

for(const [path,mime] of [['/pdfjs.js','application/javascript'],['/pdfjs-worker.mjs','application/javascript']]){
  const response=await worker.fetch(new Request('https://socle-test.invalid'+path),{});
  assert.equal(response.status,200,path+' servi');checks++;
  assert.ok(response.headers.get('content-type')?.startsWith(mime),path+' type MIME correct');checks++;
}
console.log(`supplier-invoice-pdf-01: ${checks} assertions réussies`);
