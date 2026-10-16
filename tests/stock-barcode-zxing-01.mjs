import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {BinaryBitmap,HybridBinarizer,MultiFormatWriter,RGBLuminanceSource} from '@zxing/library';
import worker from '../dist/server/index.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const packageJson=JSON.parse(read('../package.json'));
const html=read('../web/index.html');
const scanner=read('../web/stock-barcode.js');
const build=read('../scripts/build.mjs');
const docker=read('../Dockerfile');
assert.ok(existsSync(new URL('../scripts/stock-zxing-entry.js',import.meta.url)),'adaptateur local présent');
const entry=read('../scripts/stock-zxing-entry.js');
const bundle=read('../web/stock-zxing.js');
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++};
assert.equal(packageJson.devDependencies?.['@zxing/browser'],'0.1.5','version ZXing Browser figée');checks++;
assert.equal(packageJson.devDependencies?.['@zxing/library'],'0.21.3','version ZXing Core compatible Node 22 figée');checks++;
assert.equal(packageJson.devDependencies?.esbuild,'0.28.2','version esbuild figée');checks++;
ok(entry.includes("from '@zxing/browser'")&&entry.includes('BrowserMultiFormatReader'),'adaptateur ZXing chargé depuis la dépendance locale');
ok(entry.includes('SocleStockZXing')&&entry.includes('createReader'),'lecteur vidéo exposé avec une API testable');
ok(bundle.length>400000&&!bundle.includes('cdn.jsdelivr.net'),'bundle navigateur généré, complet et sans CDN');
ok(build.includes('stock-zxing-entry.js')&&/["']stock-zxing\.js["']/.test(build),'build compile et embarque le décodeur local');
ok(docker.includes('COPY package.json package-lock.json ./')&&docker.includes('npm ci')&&docker.includes('npm prune --omit=dev'),'construction Railway reproduite depuis le lockfile puis sans les outils de compilation');
ok(!/<script[^>]*src=["']stock-zxing\.js/.test(html)&&scanner.includes('await stockBarcodeLoadLibrary()'),'ZXing différé à la demande du scanner');
ok(scanner.includes('stockBarcodeZxing')&&scanner.includes('reader.decodeFromVideoElement'),'décodeur ZXing utilisé si le navigateur ne sait pas lire le code');
ok(scanner.includes('stockBarcodeZxingControls?.stop?.()')&&scanner.includes('stockBarcodeZxingReader=null'),'arrêt propre du décodeur à la fermeture');
ok(entry.includes("'DATA_MATRIX'")&&entry.includes("'CODE_93'")&&entry.includes("'QR_CODE'"),'formats terrain complémentaires activés');
ok(scanner.includes('stockBarcodeFallbackDecode(video)'),'ancien décodeur EAN reste disponible en dernier recours');
ok(scanner.includes("'unknown'"),'format renvoyé au serveur, sans mutation de stock au scan');
await import('../web/stock-zxing.js');
const zxing=globalThis.SocleStockZXing;
const {BarcodeFormat}=await import('@zxing/browser');
ok(zxing&&typeof zxing.createReader==='function','bundle ZXing exécutable dans le navigateur');
for(const [format,expected] of [[BarcodeFormat.EAN_13,'ean_13'],[BarcodeFormat.CODE_128,'code_128'],[BarcodeFormat.CODE_93,'code_93'],[BarcodeFormat.DATA_MATRIX,'data_matrix'],[BarcodeFormat.QR_CODE,'qr_code']]){
  ok(zxing.symbology(format)===expected,'format transmis sans altération : '+expected);
}
const reader=zxing.createReader();
ok(typeof reader.decodeFromVideoElement==='function','lecteur continu vidéo disponible');
const matrix=new MultiFormatWriter().encode('SOCLE-OSS-QR',BarcodeFormat.QR_CODE,240,240,new Map());
const pixels=new Uint8ClampedArray(matrix.getWidth()*matrix.getHeight());
for(let y=0;y<matrix.getHeight();y++)for(let x=0;x<matrix.getWidth();x++)pixels[y*matrix.getWidth()+x]=matrix.get(x,y)?0:255;
const decoded=reader.decodeBitmap(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,matrix.getWidth(),matrix.getHeight()))));
ok(decoded.getText()==='SOCLE-OSS-QR'&&zxing.symbology(decoded.getBarcodeFormat())==='qr_code','vrai QR généré puis relu par le décodeur intégré');
const served=await worker.fetch(new Request('https://socle-test.invalid/stock-zxing.js'),{});
ok(served.status===200&&served.headers.get('content-type')?.startsWith('application/javascript'),'bundle servi par le worker SOCLE');
ok((await served.text()).includes('SocleStockZXing'),'bundle réellement présent dans le service construit');
ok(read('../licenses/zxing-browser-MIT.txt').includes('MIT License')&&read('../licenses/zxing-library-Apache-2.0.txt').includes('Apache License'),'licences conservées pour les deux dépendances');
console.log(`stock-barcode-zxing-01: ${checks} assertions réussies`);


