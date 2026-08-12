const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('operator services renders the dispatch board and initializes the canonical creation controller', () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        innerHTML: '',
        value: id === 'os-status' || id === 'os-company' ? 'all' : '',
        style: {},
        className: '',
        classList: { add() {}, remove() {}, contains() { return false; } },
        insertAdjacentHTML() {},
      });
    }
    return elements.get(id);
  };

  for (const id of ['os-board', 'os-kpis', 'os-q', 'os-status', 'os-company', 'os-wizard-shell']) element(id);

  const sandbox = {
    console, Intl, Date, Number, String, Set, Map, Promise, Object,
    confirm: () => true,
    prompt: () => '',
    setInterval: () => 1,
    clearInterval: () => {},
    PERFIL_USUARIO: { roles: { name: 'administracion' }, full_name: 'Administrador' },
    USUARIO_ACTUAL: { id: 'admin' },
    openModal: () => {}, closeModal: () => {}, toast: () => {},
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById: id => elements.get(id) || null,
      createElement() { return { id: '', rel: '', href: '', addEventListener() {}, dataset: {} }; },
      head: { appendChild() {} }, body: { insertAdjacentHTML() {}, appendChild() {} },
      querySelector() { return null; }, querySelectorAll() { return []; },
    },
    _db: {
      from() { throw new Error('The render smoke test must not access Supabase.'); },
      rpc() { throw new Error('The render smoke test must not call RPCs.'); },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  for (const file of ['operator-services.js', 'operator-service-wizard.js']) {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    vm.runInContext(source, sandbox, { filename: file });
  }

  const operator = sandbox.OperatorServices;
  assert.ok(operator);
  const state = operator.S;
  state.companies = [{ company_id: 'company', legal_name: 'Empresa Prueba', trade_name: 'Empresa' }];
  state.drivers = [{ user_id: 'driver', full_name: 'Chofer Prueba' }];
  state.trucks = [{ truck_id: 1, plate: 'TEST123', numero_interno: 'Móvil 1' }];
  state.concepts = [{ concept_id: 'primary', name: 'Asistencia liviano', icon: '🚗' }];
  state.services = [{
    service_id: 'service', service_number: 'SRV-20260801-00001', status: 'assigned', priority: 'urgent',
    company_id: 'company', billing_base_id: 'base', billing_base_name: 'Base Prueba', primary_concept_id: 'primary',
    assigned_driver_id: 'driver', assigned_truck_id: 1, scheduled_for: '2026-08-01T14:00:00-03:00',
    origin: 'Origen', destination: 'Destino', vehicle_plate: 'TEST123', currency: 'ARS',
    company_estimated_total: 100000, pricing_snapshot: { components: [] },
  }];

  operator.renderBoard();
  assert.match(element('os-board').innerHTML, /Pendientes/);
  assert.match(element('os-board').innerHTML, /Asignados/);
  assert.match(element('os-board').innerHTML, /En curso/);
  assert.match(element('os-board').innerHTML, /Finalizados/);
  assert.match(element('os-board').innerHTML, /SRV-20260801-00001/);
  assert.match(element('os-board').innerHTML, /Empresa/);
  assert.match(element('os-kpis').innerHTML, /Pendientes/);
  assert.equal(typeof sandbox.abrirNuevoServicio, 'function');
  assert.equal(typeof sandbox.abrirDetalleServicio, 'function');
  assert.equal(typeof sandbox.guardarAsignacionServicio, 'function');
  assert.equal(typeof sandbox.avanzarServicioChofer, 'function');
  assert.equal(operator.statusMeta.at_destination.label, 'En destino');

  sandbox.abrirNuevoServicio();
  assert.ok(state.wizard);
  assert.match(element('os-wizard-shell').innerHTML, /Cargando formulario de Nuevo Servicio/);
  assert.doesNotMatch(element('os-wizard-shell').innerHTML, /Alta operativa|os-service-desktop/);
  assert.equal(typeof operator.renderWizard, 'function');
  assert.equal('branches' in state, false);
});
