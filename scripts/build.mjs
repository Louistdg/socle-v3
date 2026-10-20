import fs from 'node:fs/promises';
import esbuild from 'esbuild';
import {createHash} from 'node:crypto';

await esbuild.build({entryPoints:['scripts/stock-zxing-entry.js'],bundle:true,minify:true,format:'iife',target:'es2020',legalComments:'inline',outfile:'web/stock-zxing.js'});
await esbuild.build({entryPoints:['scripts/pdfjs-entry.js'],bundle:true,minify:true,format:'iife',target:'es2022',legalComments:'inline',outfile:'web/pdfjs.js'});
await esbuild.build({entryPoints:['scripts/roofing-metre-entry.js'],bundle:true,minify:true,format:'iife',target:'es2020',legalComments:'inline',outfile:'web/roofing-metre.js'});
await fs.copyFile('node_modules/pdfjs-dist/build/pdf.worker.min.mjs','web/pdfjs-worker.mjs');
await fs.copyFile('node_modules/tesseract.js/dist/tesseract.min.js','web/tesseract.js');
await fs.copyFile('node_modules/tesseract.js/dist/worker.min.js','web/tesseract-worker.js');
await fs.copyFile('node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js','web/tesseract-core-lstm.wasm.js');
await fs.mkdir('web/tessdata',{recursive:true});
await fs.copyFile('node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz','web/tessdata/fra.traineddata.gz');

const names=['team-composer.js','team-composer.css','design-tokens.css','audit-release.css','audit-release.js','v3-themes.js','v3-themes.css','v3-money.js','v3.js','v3.css','index.html','catalogue.html','style.css','organization.css','planning.css','ia-a-ui.css','field-journal.css','ui-foundation.css','stock-catalog-v2.css','stock-barcode.css','profile-avatar.css','mobile-nav.css','quote-roofing-metre.css','omnisearch.css','mobile-audit.css','offline.css','job-tabs-order.js','jobs-order.js','offline.js','offline-sw.js','document-triage.css','task-board.css','task-board.js','document-folders.js','app.js','cockpit.js','admin.js','business.js','refinement.js','permissions.js','organization.js','archives.js','realistic-demo.js','workflow-improvements.js','server-modules.js','field-workflows.js','quick-intervention.js','production-runtime.js','free-entry.js','contacts.js','quote-preproject.js','workspace-config.js','error-monitor.js','blank-workspace.js','partners.js','onboarding.js','procurement.js','local-test-auth.js','field-server.js','planning.js','planning-drag.js','documents-server.js','quote-visit-capture.js','supplier-invoice-reconciliation.js','supplier-allocations.js','supplier-invoice-pdf.js','document-triage.js','tesseract.js','tesseract-worker.js','tesseract-core-lstm.wasm.js','pdfjs.js','pdfjs-worker.mjs','project-hub.js','field-portal.js','ia-a-ui.js','field-journal.js','ui-foundation.js','stock-catalog-v2.js','stock-zxing.js','stock-barcode.js','delivery-scans.js','invite-activation.js','navigation-registry.js','profile-avatar.js','mobile-nav.js','roofing-metre.js','quote-roofing-metre.js','omnisearch.js','canvas-jobs.css','canvas-jobs.js','home-compact.js','design-system.css','ui-icons.js','breadcrumb.js','form-kit.js','table-tools.js','toast-action.js','feedback.js','trust.js','shortcuts.js','manifest.webmanifest','apple-touch-icon.png','icon-192.png','icon-512.png'];
const files={};
for(const name of names){
  const extension=name.slice(name.lastIndexOf('.'));
  const binary=['.png','.ico','.woff2','.gz'].includes(extension);
  const type=extension==='.html'?'text/html;charset=utf-8':extension==='.css'?'text/css;charset=utf-8':extension==='.webmanifest'?'application/manifest+json;charset=utf-8':extension==='.png'?'image/png':'application/javascript;charset=utf-8';
  let body=binary?(await fs.readFile('web/'+name)).toString('base64'):(await fs.readFile('web/'+name,'utf8')).replace(/\r\n/g,'\n');
  if(extension==='.js')body=(await esbuild.transform(body,{loader:'js',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,target:'es2020',legalComments:'inline'})).code;
  files['/'+name]={body,type,...(binary?{encoding:'base64'}:{})};
}
files['/catalogue']={...files['/catalogue.html']};
// A single stylesheet preserves the original cascade and avoids thirteen round trips.
const cssNames=[...files['/index.html'].body.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match=>'/'+match[1]);
files['/socle.css']={body:(await esbuild.transform(cssNames.map(name=>files[name].body).join('\n'),{loader:'css',minify:true,legalComments:'inline'})).code,type:'text/css;charset=utf-8'};
files['/index.html'].body=files['/index.html'].body.replace(/\s*<link rel="stylesheet" href="[^"]+">/g,'').replace('</head>','<link rel="stylesheet" href="/socle.css"></head>');
// Version resource URLs so an already installed PWA cannot mix releases.
const assetVersion=path=>createHash('sha256').update(files[path].body).digest('hex').slice(0,16);
files['/index.html'].body=files['/index.html'].body
  .replace('href="/socle.css"','href="/socle.css?v='+assetVersion('/socle.css')+'"')
  .replace(/(<script\b[^>]*\bsrc=")([^"?]+)(")/g,(match,before,source,after)=>{
    const path='/'+source.replace(/^\//,'');
    return files[path]&&path!=='/production-runtime.js'?before+source+'?v='+assetVersion(path)+after:match;
  });
files['/tessdata/fra.traineddata.gz']={body:(await fs.readFile('web/tessdata/fra.traineddata.gz')).toString('base64'),type:'application/gzip',encoding:'base64'};
await fs.rm('dist',{recursive:true,force:true});
await fs.mkdir('dist/server',{recursive:true});
await fs.mkdir('dist/.openai',{recursive:true});
await fs.writeFile('dist/server/index.js','const FILES='+JSON.stringify(files)+';\n'+(await fs.readFile('worker/index.js','utf8')).replace(/\r\n/g,'\n'));
await fs.copyFile('worker/project-financial-revenue.js','dist/server/project-financial-revenue.js');
await fs.copyFile('worker/delivery-scans.js','dist/server/delivery-scans.js');
await fs.copyFile('worker/batinova-invitation-roster.js','dist/server/batinova-invitation-roster.js');
await fs.copyFile('worker/time-entry-monthly.js','dist/server/time-entry-monthly.js');
await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Worker and interface built.');
