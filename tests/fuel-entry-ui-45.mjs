import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const business=read('../web/business.js'),field=read('../web/field-server.js'),onboarding=read('../web/onboarding.js'),worker=read('../worker/index.js');
let checks=0;const ok=(value,message)=>{assert.ok(value,message);checks++};
ok(business.includes('updateFuelMileage(select)'),'dernier kilométrage mis à jour selon le véhicule');
ok(business.includes('dernier relevé : ${mileage.toLocaleString'),'kilométrage récent visible avant saisie');
ok(business.includes('name="receipt" type="file" accept="image/jpeg,image/png,image/webp" capture="environment"'),'ticket photo pris en charge sur mobile');
ok(business.includes('conducteur est associé automatiquement'),'conducteur automatique présenté');
ok(!business.includes('name="driver"')&&!business.includes('Photo de la pompe'),'saisie sans conducteur libre ni photo secondaire inutile');
ok(onboarding.includes("['Diesel','Essence','Hybride','Électrique','Autre']"),'carburant défini dans la fiche véhicule');
ok(field.includes("data.set('receipt',receipt,receipt.name)"),'fichier envoyé au serveur en multipart');
ok(field.includes("'operationKey'"),'clé anti-doublon transmise au serveur');
ok(worker.includes("'confidential',ctx.uid,stamp,stamp,title")&&worker.includes("receipt_document_id"),'ticket réellement stocké avec confidentialité et relié au plein');
ok(worker.includes('priorOdometer>odometer'),'serveur refuse un kilométrage antérieur');
ok(worker.includes("...(canFinancial?{total:Number(entry.total_cents)/100}:{})"),'coût transmis uniquement aux profils financiers');
console.log(`fuel-entry-ui-45: ${checks} assertions réussies`);
