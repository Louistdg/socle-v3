import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url);
let n=0;
const ok=(value,message)=>{assert.ok(value,message);n++};
const eq=(actual,expected,message)=>{assert.equal(actual,expected,message);n++};

const migrations=readdirSync(new URL('../drizzle/',import.meta.url))
  .filter(name=>/^\d{4}_.+\.sql$/.test(name))
  .sort();

eq(migrations.length,51,'51 migrations cumulatives 0000→0050');
eq(migrations[0],'0000_known_spot.sql','première migration 0000');
eq(migrations[48],'0048_planning_integrity.sql','0048 conserve les garde-fous d’intégrité du planning');
eq(migrations[49],'0049_time_entry_monthly_archive.sql','0049 ajoute l’archivage mensuel auditable des pointages');
eq(migrations.at(-1),'0050_planning_visible_days_preference.sql','0050 enregistre les jours de planning visibles par entreprise');
eq(migrations[29],'0029_project_tenant_integrity.sql','IA4 conserve 0029');
eq(migrations[30],'0030_document_registry_transversal.sql','IA5 suit IA4 en 0030');eq(migrations[31],'0031_supplier_payments.sql','0031 paiements fournisseurs');eq(migrations[32],'0032_project_field_operations.sql','0032 opérations terrain chantier');eq(migrations[33],'0033_production_auth.sql','0033 authentification production');eq(migrations[34],'0034_planning_operations.sql','0034 planning opérationnel');
const numeric=migrations.map(name=>Number(name.slice(0,4)));
eq(migrations[35],'0035_ia_c_commercial_finance.sql','0035 finance commerciale IA-C');
eq(migrations[36],'0036_non_authenticating_provenance_actors.sql','0036 provenance non authentifiable');
eq(migrations[37],'0037_batinova_first_owner_bootstrap.sql','0037 bootstrap initial OWNER BatiNova');
eq(migrations[38],'0038_user_preferences.sql','0038 préférences utilisateur tenant-scoped');
eq(migrations[39],'0039_stock_worker_consume.sql','0039 permission consommation Stock terrain');eq(migrations[40],'0040_stock_catalog_v2.sql','0040 catalogue Stock V2');eq(migrations[41],'0041_delivery_scans.sql','0041 BL-SCAN');eq(migrations[42],'0042_stock_barcodes.sql','0042 modèle barcode relationnel');eq(migrations[43],'0043_quote_preproject_lifecycle.sql','0043 devis pré-chantier E2E-02');eq(migrations[44],'0044_canonical_role_permission_defaults.sql','0044 permissions standards sans modifier les rôles déjà personnalisés');eq(migrations[46],'0046_quote_site_visits.sql','0046 dossiers terrain reliés aux devis');eq(migrations[47],'0047_planning_block_followup.sql','0047 suivis de blocages chantier');eq(migrations[48],'0048_planning_integrity.sql','0048 garde-fous planning');
eq(new Set(numeric).size,numeric.length,'aucun numéro de migration dupliqué');
for(let i=0;i<numeric.length;i++)eq(numeric[i],i,'séquence migration continue '+String(i).padStart(4,'0'));

const worker=readFileSync(new URL('../worker/index.js',import.meta.url),'utf8');
ok(worker.includes('async function memberRoutes'),'route métier IA3 membres présente');
ok(worker.includes("const organizationMember=url.pathname.match(/^\\/api\\/members\\/([^/]+)$/)"),'API /api/members/:id routée');
ok(worker.includes("code==='TEAM_LEAD'"),'TEAM_LEAD canonique présent');
ok(worker.includes("if(url.pathname==='/api/roles')return rolesRoute"),'catalogue rôles exposé');

const hubStart=worker.indexOf('async function projectHubRoute');
const hubEnd=worker.indexOf('async function projectTimelineRoute',hubStart);
const hub=worker.slice(hubStart,hubEnd);
ok(hubStart>=0,'Hub présent');
ok(hub.indexOf('resolveHubProject')>=0&&hub.indexOf('resolveHubProject')<hub.indexOf('hubLimit'),'Hub contrôle accès avant limit');

const timelineStart=worker.indexOf('async function projectTimelineRoute');
const timelineEnd=worker.indexOf('async function projectRoute',timelineStart);
const timeline=worker.slice(timelineStart,timelineEnd);
ok(timelineStart>=0,'Timeline présente');
ok(timeline.indexOf('resolveHubProject')>=0&&timeline.indexOf('resolveHubProject')<timeline.indexOf('timelineLimit'),'Timeline contrôle accès avant pagination');

ok(worker.includes('async function documentHistoryRoute'),'historique IA5 présent');
ok(worker.includes("0030_document_registry_transversal")===false,'worker indépendant du numéro de migration');
const documentUploadStart=worker.indexOf('async function documentUploadRoute');const documentUploadEnd=worker.indexOf('async function documentMetadataRoute',documentUploadStart);const documentUpload=worker.slice(documentUploadStart,documentUploadEnd);ok(documentUploadStart>=0&&documentUpload.includes('uploadMatches(document,relations)')&&documentUpload.includes("données différentes.'},409"),'rejeu document différent => 409');
ok(worker.includes("const documentHistory=url.pathname.match(/^\\/api\\/documents\\/([^/]+)\\/history$/)"),'route historique document présente');

const registryTest=readFileSync(new URL('./document-registry-transversal-30.mjs',import.meta.url),'utf8');
ok(registryTest.includes("rejeu identique accepté"),'test replay identique présent');
ok(registryTest.includes("métadonnées différentes refusés"),'test conflit métadonnées présent');
ok(registryTest.includes("relations différentes refusés"),'test conflit relations présent');

const runner=readFileSync(new URL('../scripts/test.mjs',import.meta.url),'utf8');
ok(runner.includes('Node 22+ est requis'),'runner refuse Node ancien');
ok(runner.includes('aucune suite métier hermétique détectée'),'runner refuse zéro suite métier');
ok(runner.includes('process.exit(1)'),'runner possède une sortie d’échec explicite');

const workflow=readFileSync(new URL('../.github/workflows/node.js.yml',import.meta.url),'utf8');
ok(workflow.includes('pull_request:'),'gate déclenchée sur PR');
ok(workflow.includes('workflow_dispatch:'),'gate déclenchable manuellement');
ok(workflow.includes('Core / Node 22'),'gate Node 22');
ok(workflow.includes('Browser / Chromium'),'gate navigateur');
ok(workflow.includes('npm run build')||workflow.includes('node scripts/build.mjs'),'build depuis les sources dans la gate');

console.log(`ia6-integration-candidate: ${n} assertions réussies.`);
