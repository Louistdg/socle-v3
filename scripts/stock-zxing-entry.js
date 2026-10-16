import {BrowserMultiFormatReader,BarcodeFormat} from '@zxing/browser';
import {DecodeHintType} from '@zxing/library';
const names=['EAN_13','EAN_8','UPC_A','UPC_E','CODE_128','CODE_39','CODE_93','ITF','DATA_MATRIX','QR_CODE','PDF_417','AZTEC','CODABAR','RSS_14'];
const formats=names.map(name=>BarcodeFormat[name]).filter(value=>Number.isInteger(value));
const hints=new Map([[DecodeHintType.POSSIBLE_FORMATS,formats],[DecodeHintType.TRY_HARDER,true]]);
globalThis.SocleStockZXing={
  createReader(){return new BrowserMultiFormatReader(hints,{delayBetweenScanAttempts:180,delayBetweenScanSuccess:450})},
  formats:names,
  formatName(value){const key=typeof value==='string'?value:Object.keys(BarcodeFormat).find(name=>BarcodeFormat[name]===value)||'UNKNOWN';return key.toLowerCase().replaceAll('_','_')},
  symbology(value){const key=typeof value==='number'?BarcodeFormat[value]:String(value||'').toUpperCase();return ({EAN_13:'ean_13',EAN_8:'ean_8',UPC_A:'upc_a',UPC_E:'upc_e',CODE_128:'code_128',CODE_39:'code_39',CODE_93:'code_93',ITF:'itf',DATA_MATRIX:'data_matrix',QR_CODE:'qr_code',PDF_417:'pdf_417',AZTEC:'aztec',CODABAR:'codabar',RSS_14:'rss_14'})[key]||'unknown'}
};
