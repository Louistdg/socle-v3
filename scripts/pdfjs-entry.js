import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs-worker.mjs';
globalThis.SoclePdfJs = pdfjs;
