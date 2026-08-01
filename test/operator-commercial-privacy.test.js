const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('driver service view uses safe RPC payloads and hides commercial data', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        innerHTML: '',
        value: id === 'os-status' || id === 'os-company' ? 'all' : '',
        style: {},
        classList: { add() {}, remove() {}, contains() { return false; } },
        insertAdjacentHTML() {},
      });
    }
    return elements.get(id);
  };
  for (const id of ['os-board','os-kpis','os-q','os-status','os-company','os-detail-shell']) element(id);

  const rpcCalls = [];
  const safeService = {
    service_id: 'service', service_number: 'SRV-20260801-00001', status: 'assigned', priority: 'urgent',
    company_id: 'company', company_name: 'Empresa Segura', branch_id: null, branch_name: null,
    service_order_number: 'PREST-1', scheduled_for: '2026-08-01T14:00:00-03:00',
    customer_name: 'Cliente', customer_phone: '111', vehicle_plate: 'TEST123', vehicle_make_model: 'Auto',
    origin: 'Origen', destination: 'Destino', primary_concept_id: 'primary', concept_name: 'Asistencia liviano', concept_icon: '🚗',
    assigned_driver_id: 'driver', assigned_truck_id: 1, driver_name: 'Chofer', truck_label: 'Móvil 1',
    driver_instructions: 'Llamar al llegar', driver_notes: null,
  };
  const safeItems = [{ item_id: 'item', item_role: 'primary', service_name: 'Asistencia liviano', pricing_unit: 'service', quantity: 1, sort_order: 0 }];
  const safeEvents = [{ event_id: 1, event_type: 'created', to_status: 'assigned', notes: 'Servicio creado', created_at: '2026-08-01T13:00:00-03:00' }];

  const sandbox = {
    console, Intl, Date, Number, String, Set, Map, Promise, Object,
    prompt: () => '', setInterval: () => 1, clearInterval: () => {},
    PERFIL_USUARIO: { roles: { name: 'chofer' }, full_name: 'Chofer' },
    USUARIO_ACTUAL: { id: 'driver' },
    openModal: () => {}, closeModal: () => {}, toast: () => {},
    document: {
      readyState: 'loading', addEventListener() {}, getElementById: id => elements.get(id) || null,
      createElement() { return { id: '', rel: '', href: '', addEventListener() {}, dataset: {} }; },
      head: { appendChild() {} }, body: { insertAdjacentHTML() {}, appendChild() {} },
      querySelector() { return null; }, querySelectorAll() { return []; },
    },
    _db: {
      rpc(name, args) {
        rpcCalls.push([name, args]);
        if (name === 'get_operator_service_detail') return Promise.resolve({ data: { service: safeService, items: safeItems, events: safeEvents }, error: null });
        if (name === 'list_operator_services') return Promise.resolve({ data: [safeService], error: null });
        throw new Error(`Unexpected RPC: ${name}`);
      },
      from() { throw new Error('Driver read flow must not query operator tables directly.'); },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'operator-services.js'), 'utf8'), sandbox, { filename: 'operator-services.js' });

  const state = sandbox.OperatorServices.S;
  state.trucks = [{ truck_id: 1, plate: 'TEST123', numero_interno: 'Móvil 1' }];
  state.concepts = [{ concept_id: 'primary', name: 'Asistencia liviano', icon: '🚗' }];
  state.drivers = [{ user_id: 'driver', full_name: 'Chofer' }];
  state.services = [safeService];

  sandbox.OperatorServices.renderBoard();
  assert.match(element('os-board').innerHTML, /Empresa Segura/);
  assert.match(element('os-board').innerHTML, /Asistencia liviano/);
  assert.doesNotMatch(element('os-board').innerHTML, /\$/);

  await sandbox.abrirDetalleServicio('service');
  const html = element('os-detail-shell').innerHTML;
  assert.match(html, /Llamar al llegar/);
  assert.match(html, /Asistencia liviano/);
  assert.doesNotMatch(html, /Total empresa/);
  assert.doesNotMatch(html, /Nota interna/);
  assert.doesNotMatch(html, /Orden de compra/);
  assert.doesNotMatch(html, /\$/);
  assert.equal(rpcCalls[0][0], 'get_operator_service_detail');
  assert.equal(rpcCalls[0][1].p_service_id, 'service');
});
