import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const css=readFileSync(new URL('../web/ui-foundation.css',import.meta.url),'utf8');
const js=readFileSync(new URL('../web/ui-foundation.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const build=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
const themeCss=readFileSync(new URL('../web/ia-a-ui.css',import.meta.url),'utf8');
const themeJs=readFileSync(new URL('../web/ia-a-ui.js',import.meta.url),'utf8');
const browserGate=readFileSync(new URL('../scripts/browser-gate.mjs',import.meta.url),'utf8');

const requiredPalette=[
  '--ds-background','--ds-surface-1','--ds-surface-2','--ds-surface-3','--ds-surface-hover','--ds-surface-active',
  '--ds-text-primary','--ds-text-secondary','--ds-text-muted','--ds-text-inverse',
  '--ds-border','--ds-border-strong','--ds-accent','--ds-accent-hover','--ds-accent-contrast',
  '--ds-success','--ds-warning','--ds-danger','--ds-info','--ds-focus-ring','--ds-shadow-color',
  '--ds-chrome-background','--ds-chrome-text','--ds-chrome-text-muted'
];
const requiredStructure=[
  '--ds-radius-xs','--ds-radius-sm','--ds-radius-md','--ds-radius-lg',
  '--ds-space-xs','--ds-space-sm','--ds-space-md','--ds-space-lg','--ds-space-xl',
  '--ds-font-xs','--ds-font-sm','--ds-font-md','--ds-font-base','--ds-font-lg','--ds-font-xl',
  '--ds-weight-normal','--ds-weight-medium','--ds-weight-bold','--ds-weight-strong',
  '--ds-line-tight','--ds-line-normal','--ds-line-relaxed','--ds-page-max','--ds-control-min','--ds-control-touch'
];
for(const token of [...requiredPalette,...requiredStructure])assert.ok(css.includes(token),'token canonique présent: '+token);

const requiredClasses=[
  '.ui-page-shell','.ui-page-header','.ui-context-line','.ui-primary-action',
  '.ui-compact-filter-bar','.ui-kpi-strip','.ui-content-section','.ui-content-stage','.ui-detail-drilldown'
];
for(const selector of requiredClasses)assert.ok(css.includes(selector),'primitive CSS présente: '+selector);

assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(css),false,'aucune couleur hex dans la fondation canonique');
assert.equal(css.includes('[data-socle-theme='),false,'aucun thème ne redéfinit la géométrie dans ui-foundation.css');
for(const forbidden of ['.asset-categories','.assets-filter-bar','.assets-filter-summary'])assert.equal(css.includes(forbidden),false,'aucun style strictement Assets dans la Foundation: '+forbidden);
for(const forbidden of ['.topnav','.socle-mobile-nav','NAV_ITEMS','applyMobileNavigation','navigation-registry'])assert.equal(css.includes(forbidden)||js.includes(forbidden),false,'aucune navigation parallèle: '+forbidden);
for(const forbidden of ['postgres','railway','drizzle','migration','purchase_order','invoice','stock','delivery_scan'])assert.equal(js.toLowerCase().includes(forbidden)||css.toLowerCase().includes(forbidden),false,'fondation hors logique métier/DB: '+forbidden);

assert.ok(css.includes('@media(max-width:760px)'),'contrat mobile partagé pour 430/390/375');
assert.ok(css.includes('@media(max-width:390px)'),'ajustement 390 présent');
assert.ok(css.includes('@media(max-width:375px)'),'ajustement 375 présent');
assert.ok(css.includes('min-height:var(--ds-control-min)'),'cible desktop 44px tokenisée');
assert.ok(css.includes('min-height:var(--ds-control-touch)'),'cible mobile 48px tokenisée');
assert.ok(css.includes(':focus-visible'),'focus clavier explicite');
assert.ok(css.includes('prefers-reduced-motion'),'reduced-motion conservé');

const cssOrder=[html.indexOf('ia-a-ui.css'),html.indexOf('ui-foundation.css')];
const jsOrder=[html.indexOf('ia-a-ui.js'),html.indexOf('ui-foundation.js')];
assert.ok(cssOrder[0]>=0&&cssOrder[1]>cssOrder[0],'fondation CSS chargée après la palette legacy');
assert.ok(jsOrder[0]>=0&&jsOrder[1]>jsOrder[0],'fondation JS chargée après IA-A');
assert.ok(build.includes("'ui-foundation.css'"),'CSS fondation inclus au build');
assert.ok(build.includes("'ui-foundation.js'"),'JS fondation inclus au build');

const ctx={};
ctx.globalThis=ctx;
vm.createContext(ctx);
vm.runInContext(js,ctx);
assert.equal(ctx.SocleUI.version,'UI-FOUNDATION-CONVERGENCE-01');
for(const component of ['PageShell','PageHeader','ContextLine','PrimaryAction','CompactFilterBar','KpiStrip','ContentSection','ContentStage','DetailDrilldown']){
  assert.equal(typeof ctx.SocleUI[component],'function','API SocleUI expose '+component);
}
assert.equal(typeof ctx.SocleUI.fromLegacyMarkup,'function','pont contrôlé depuis le markup legacy disponible');
assert.equal(typeof ctx.SocleUI.renderHTML,'function','sérialisation DOM canonique vers les renderers string disponible');
assert.ok(css.includes('padding-inline:var(--ds-space-xl)'),'PageShell porte son padding horizontal desktop');
assert.ok(css.includes('padding-inline:var(--ds-space-lg)'),'PageShell porte son padding horizontal mobile');
assert.ok(themeCss.includes('.assets-filter-bar'),'styles Assets isolés dans la feuille d’intégration IA-A');

const themes=['olive','forest','slate','night','graphite','earth','moss','aubergine','high-contrast','chalk'];
for(const theme of themes)assert.ok(themeJs.includes("id:'"+theme+"'"),'thème conservé: '+theme);
assert.ok(themeCss.includes('[data-socle-theme="chalk"]'),'palette Craie conservée');
assert.ok(themeCss.includes('[data-socle-theme="high-contrast"]'),'palette Contraste conservée');
assert.ok(themeCss.includes('[data-socle-theme="moss"]'),'palette Mousse conservée');
assert.ok(themeCss.includes('[data-socle-theme="slate"]'),'palette Ardoise conservée');

assert.ok(browserGate.includes("browser-v3-theme-visual-01.mjs"),'gate visuel des thèmes V3 conservé');
assert.ok(browserGate.includes("browser-ui-foundation-01.mjs"),'gate QA UI Foundation branché');
assert.ok(browserGate.includes("browser-navigation-convergence-01.mjs"),'gate navigation convergence conservé');
assert.ok(browserGate.includes("browser-e2e-02-quote-preproject.mjs"),'E2E-02 conservé');
assert.ok(browserGate.includes("browser-stock-barcode-01.mjs"),'Stock Barcode conservé');
assert.ok(browserGate.includes("browser-bl-scan-01ab.mjs"),'BL-SCAN conservé');
assert.ok(browserGate.includes("browser-identities-15.mjs"),'identities/RBAC conservé');
assert.ok(browserGate.includes("runMultiOrgBrowserTest"),'multi-org conservé');

console.log('UI_FOUNDATION_CONTRACT_01=PASS — tokens, 8 primitives, thèmes, navigation et gates préservés');
