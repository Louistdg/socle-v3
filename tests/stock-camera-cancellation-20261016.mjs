import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Run from the source checkout, or pass web/stock-barcode.js as argument.
const source = fs.readFileSync(process.argv[2] || new URL('../web/stock-barcode.js', import.meta.url), 'utf8');
const start = source.slice(source.indexOf('async function stockBarcodeStartCamera(){'), source.indexOf('function stockBarcodeOpenScanner('));
const stop = source.slice(source.indexOf('function stockBarcodeStopCamera(){'), source.indexOf('function stockBarcodeStatus('));
let resolveDecode, enteredDecode, callback, controlStops = 0, trackStops = 0, handled = 0;
const entered = new Promise(resolve => { enteredDecode = resolve; });
const timers = [];
const statuses = [];
const video = {isConnected: true, play: async () => {}};
const ctx = vm.createContext({
  console,
  navigator: {mediaDevices: {getUserMedia: async () => ({getTracks: () => [{stop: () => trackStops++}]})}},
  document: {querySelector: () => video},
  stockBarcodeLoadLibrary: async () => {},
  stockBarcodeStatus: message => statuses.push(message),
  stockBarcodeHandle: () => handled++,
  setTimeout: fn => timers.push(fn),
  SocleStockZXing: {
    symbology: () => 'ean_13',
    createReader: () => ({decodeFromVideoElement: (_video, cb) => {
      callback = cb;
      enteredDecode();
      return new Promise(resolve => { resolveDecode = resolve; });
    }})
  }
});
vm.runInContext('let stockBarcodeCameraGeneration=0,stockBarcodeFrame=0,stockBarcodeZxingControls=null,stockBarcodeZxingReader=null,stockBarcodeStream=null,stockBarcodeDetector=null,stockBarcodeLocked=false;' + stop + start, ctx);
const task = vm.runInContext('stockBarcodeStartCamera()', ctx);
await entered;
// A result queued before closure must also be discarded after closure.
callback({getText: () => '1234567890123', getBarcodeFormat: () => 1});
vm.runInContext('stockBarcodeStopCamera()', ctx);
resolveDecode({stop: () => controlStops++});
await task;
// Simulate a late decoder callback, then flush both queued callbacks.
callback({getText: () => '1234567890123', getBarcodeFormat: () => 1});
timers.forEach(fn => fn());
assert.equal(trackStops, 1, 'Camera stream must be stopped on closure');
assert.equal(controlStops, 1, 'Decoder controls resolving after closure must be stopped');
assert.equal(vm.runInContext('stockBarcodeZxingControls', ctx), null, 'Closed scanner must not reacquire decoder controls');
assert.equal(vm.runInContext('stockBarcodeZxingReader', ctx), null, 'Closed scanner must not reacquire decoder reader');
assert.equal(handled, 0, 'Queued and late barcode results must not affect the closed scanner');
assert.equal(statuses.length, 0, 'Closed scanner must not publish an active status');
console.log('PASS: closing during decoder initialization stops late controls and discards queued/late results.');
