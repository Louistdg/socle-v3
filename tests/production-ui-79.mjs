import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../web/' + name, import.meta.url), 'utf8');
const business = source('business.js');
const refinement = source('refinement.js');
const realistic = source('realistic-demo.js');
const workflows = source('workflow-improvements.js');
const onboarding = source('onboarding.js');
const localAuth = source('local-test-auth.js');
const serverModules = source('server-modules.js');

// Compile the actual function, without loading unrelated UI or providing a DOM.
function definition(text, name) {
  const start = text.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'Function source missing: ' + name);
  let candidate = '';
  for (const line of text.slice(start).split('\n')) {
    candidate += line + '\n';
    try { new vm.Script('(' + candidate + ')'); return candidate; }
    catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  throw new Error('Function source cannot be compiled: ' + name);
}

function context(production) {
  const sandbox = {
    company: {name: 'Entreprise réelle'},
    people: [{id: 901, name: 'Personne réelle', role: 'Chef de chantier', category: 'Ouvrier'}],
    jobs: [{id: 19, name: 'Chantier réel', client: 'Client réel', documents: [], timeEntries: []}],
    teams: [], quotes: [], assets: [{id: 8000, name: 'Matériel réel'}], newsItems: [],
    calls: {restore: 0, demo: 0, migration: 0, timers: 0, fetch: 0},
    socleLimitedSession: false,
    restoreWorkspace() { sandbox.calls.restore++; },
    applyRealisticDemo() { sandbox.calls.demo++; },
    migrateBatinova15() { sandbox.calls.migration++; return true; },
    setTimeout() { sandbox.calls.timers++; },
    async fetch() { sandbox.calls.fetch++; return {ok: false}; }
  };
  if (production) sandbox.SOCLE_PRODUCTION = true;
  return vm.createContext(sandbox);
}

const snapshot = ctx => JSON.parse(vm.runInContext('JSON.stringify({company,people,jobs,teams,quotes,assets,accountingData})', ctx));
const financeInitialization = business.split('\n')[0];
const refinementDefinitions = refinement.slice(0, refinement.indexOf('function ensureRefinementData('));
const realisticStart = realistic.indexOf('const restoreBeforeRealisticDemo=');
assert.ok(realisticStart >= 0, 'Realistic demo startup source missing');
const realisticStartup = realistic.slice(realisticStart);
const onboardingRestore = onboarding.split('\n').find(line => line.startsWith('const restoreBeforeBatinova15='));
const localSelectorEnd = localAuth.indexOf('// Dernier filet');
assert.ok(localSelectorEnd >= 0, 'Local selector source boundary missing');
const financeSelector = serverModules.split('\n').find(line => line.startsWith('const isDemoFinance='));
assert.ok(onboardingRestore && financeSelector, 'Runtime wrapper source missing');

for (const production of [true, false]) {
  const ctx = context(production);
  vm.runInContext(financeInitialization, ctx);
  if (production) assert.deepEqual(snapshot(ctx).accountingData, {customerInvoices: [], supplierBills: [], monthlyPayroll: 0, vatReserve: 0});
  else assert.equal(snapshot(ctx).accountingData.customerInvoices.length, 2, 'Simulation keeps its original invoices');
  vm.runInContext(refinementDefinitions, ctx);
  vm.runInContext(realistic.split('\n').find(line => line.startsWith('const REALISTIC_DEMO_VERSION=')), ctx);
  vm.runInContext(realistic.split('\n').find(line => line.startsWith('const demoHr=')), ctx);
  for (const [text, name] of [[business, 'ensureBusinessData'], [refinement, 'ensureRefinementData'], [workflows, 'ensurePaySlips'], [workflows, 'ensurePersonnelDocuments'], [realistic, 'isoDay']]) {
    vm.runInContext(definition(text, name), ctx);
  }
  const before = snapshot(ctx);
  vm.runInContext('ensureBusinessData()', ctx);
  const normalized = snapshot(ctx);
  if (production) {
    assert.equal(normalized.company.name, before.company.name);
    assert.deepEqual(normalized.people.map(({id, name}) => ({id, name})), before.people.map(({id, name}) => ({id, name})));
    assert.deepEqual(normalized.jobs.map(({id, name}) => ({id, name})), before.jobs.map(({id, name}) => ({id, name})));
    assert.deepEqual(normalized.assets, before.assets, 'Production must preserve real equipment');
    assert.deepEqual(normalized.accountingData, before.accountingData, 'Production must not invent financial records');
    for (const job of normalized.jobs) {
      for (const key of ['execution', 'materials', 'contacts', 'notes', 'timeEntries']) assert.deepEqual(job[key], [], key + ' must initialize empty');
      assert.deepEqual(job.dailyChecks, {});
    }
    for (const person of normalized.people) {
      assert.deepEqual(person.hr.accidents, []);
      assert.equal(person.hr.permits, undefined);
      assert.equal(person.hr.paySlips, undefined);
    }
    vm.runInContext('ensureBusinessData()', ctx);
    assert.deepEqual(snapshot(ctx), normalized, 'Repeated structural normalization must preserve real data');
  }
  for (const operation of ['ensureRefinementData(false)', 'ensureRefinementData(true)', 'ensurePaySlips()', 'ensurePersonnelDocuments()']) {
    vm.runInContext(operation, ctx);
    if (production) assert.deepEqual(snapshot(ctx), normalized, operation + ' must preserve normalized real data in production');
  }
  if (!production) {
    const after = snapshot(ctx);
    assert.ok(after.jobs[0].materials.length > 0, 'Simulation keeps sample materials');
    assert.ok(after.assets.length > before.assets.length, 'Simulation keeps sample equipment');
    assert.ok(after.accountingData.customerInvoices.length > before.accountingData.customerInvoices.length, 'Simulation keeps additional invoices');
    assert.equal(after.people[0].hr.paySlips.length, 3, 'Simulation keeps sample payslips');
    assert.ok(after.people[0].hr.permits.some(permit => permit.name === 'Permis B'), 'Simulation keeps sample personnel documents');
  }

  vm.runInContext(realisticStartup, ctx);
  vm.runInContext("restoreWorkspace({company:{name:'Entreprise réelle'}})", ctx);
  assert.equal(ctx.calls.restore, 1, 'Production and simulation must still delegate restoration');
  assert.equal(ctx.calls.demo, production ? 0 : 2, 'Only simulation applies demo at startup and restoration');
  vm.runInContext(onboardingRestore, ctx);
  vm.runInContext("restoreWorkspace({company:{name:'BatiNova réelle'}})", ctx);
  assert.equal(ctx.calls.restore, 2);
  assert.equal(ctx.calls.migration, production ? 0 : 1, 'Production must skip the automatic BatiNova migration');
  assert.equal(ctx.calls.timers, production ? 0 : 1, 'Production must not schedule a simulation save');
  await vm.runInContext(localAuth.slice(0, localSelectorEnd), ctx);
  assert.equal(ctx.calls.fetch, production ? 0 : 1, 'Production must never request local identities');

  vm.runInContext('company.demoProfileVersion=REALISTIC_DEMO_VERSION;const serverFinance={bankBalance:0};const serverExpenses=[];', ctx);
  vm.runInContext(financeSelector, ctx);
  assert.equal(vm.runInContext('isDemoFinance()', ctx), !production, 'Production must display server finance even for an old demo-marked workspace');
}

console.log('production-ui-79: PASS (real data preserved, no local login or automatic simulation; simulation behavior preserved)');
