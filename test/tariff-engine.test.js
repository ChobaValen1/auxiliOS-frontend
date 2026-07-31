const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('tariff engine modules load and render the complete wizard', () => {
  const sandbox = {
    console,
    Intl,
    Date,
    Number,
    String,
    Set,
    Map,
    Promise,
    confirm: () => true,
    setInterval: () => 1,
    clearInterval: () => {},
    queueMicrotask: fn => fn(),
    PERFIL_USUARIO: { roles: { name: 'administracion' } },
    openModal: () => {},
    closeModal: () => {},
    toast: () => {},
    MutationObserver: class { observe() {} },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      createElement() { return { addEventListener() {}, dataset: {} }; },
      head: { appendChild() {} },
      body: { insertAdjacentHTML() {}, appendChild() {} },
      querySelector() { return null; },
    },
    _db: { from() { throw new Error('The render smoke test must not access the database.'); } },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  for (const file of ['comercial.js', 'comercial-services.js', 'comercial-rules.js', 'comercial-summary.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }

  const engine = sandbox.TariffEngine;
  assert.ok(engine);
  const state = engine.S;
  state.catalog = [
    { concept_id: 'primary', code: 'primary', name: 'Principal', description: '', default_can_be_primary: true, default_can_be_secondary: false, default_pricing_unit: 'service', icon: 'P', sort_order: 1 },
    { concept_id: 'secondary', code: 'secondary', name: 'Secundario', description: '', default_can_be_primary: false, default_can_be_secondary: true, default_pricing_unit: 'service', icon: 'S', sort_order: 2 },
  ];
  state.card = { rate_card_id: 'rate', contract_id: 'contract', name: 'Tarifario', version: 1, status: 'draft', currency: 'ARS', valid_from: '2026-07-31' };
  state.items = [
    { rate_item_id: 'item-primary', rate_card_id: 'rate', concept_id: 'primary', branch_id: null, service_name: 'Principal', can_be_primary: true, can_be_secondary: false, primary_price: 100, secondary_price: 0, pricing_unit: 'service', is_active: true },
    { rate_item_id: 'item-secondary', rate_card_id: 'rate', concept_id: 'secondary', branch_id: null, service_name: 'Secundario', can_be_primary: false, can_be_secondary: true, primary_price: 0, secondary_price: 20, pricing_unit: 'service', is_active: true },
  ];
  state.rules = [
    { rule_id: 'night', rule_type: 'night', enabled: true, calculation_mode: 'percentage', amount: 20, start_time: '21:59', end_time: '05:59' },
    { rule_id: 'weekend', rule_type: 'weekend_holiday', enabled: false, calculation_mode: 'percentage', amount: 20 },
    { rule_id: 'coverage', rule_type: 'wide_coverage', enabled: false, calculation_mode: 'percentage', amount: 0 },
  ];
  state.exceptions = [];
  state.links = [];
  state.billing = {};
  state.codes = [];
  state.branches = [];

  for (const render of ['renderServices', 'renderRules', 'renderLinks', 'renderBilling', 'renderSummary']) {
    const host = { innerHTML: '' };
    engine[render](host);
    assert.notEqual(host.innerHTML, '', `${render} should produce content`);
  }

  assert.doesNotThrow(() => sandbox.seleccionarPrincipalSimulador('primary'));
  for (const action of ['abrirMotorTarifario', 'publicarMotorTarifario', 'duplicarMotorTarifario', 'alternarConcepto', 'actualizarRegla']) {
    assert.equal(typeof sandbox[action], 'function', `${action} should be exported`);
  }
});
