const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const relayJs = fs.readFileSync('operator-service-relay-v1.js', 'utf8');
const privateJs = fs.readFileSync('private-service-v1.js', 'utf8');
const css = fs.readFileSync('operator-service-relay-v1.css', 'utf8');

function cargar({ db = null, wizard = null } = {}) {
  const toasts = [];
  const win = {
    crypto: { randomUUID: () => 'x' }, toast: (m, t) => toasts.push([t, m]),
    OperatorServices: { S: { wizard, drivers: [{ user_id: 'd1', full_name: 'Ana Gómez' }, { user_id: 'd2', full_name: 'Lucas P.' }], trucks: [{ truck_id: 't1', active_driver_id: 'd1' }] } }
  };
  const doc = { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { add() {}, remove() {} }, appendChild() {} }, createElement: () => ({}) };
  const ctx = { window: win, document: doc, _db: db, setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, console, Date, Number, String, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(relayJs, ctx);
  vm.runInContext(privateJs, ctx);
  return { P: win.AuxiliosParticulares, R: win.AuxRelevoServicio, S: win.OperatorServices.S, toasts };
}
const servicios = { services: [{ concept_id: 'c1', name: 'Liviano', category: 'primary', available: true }] };
function completo(P) {
  const s = P._test.estadoInicial();
  s.ctx = servicios;
  Object.assign(s.d, { customer_name: 'Juan', primary_concept_id: 'c1', origin: 'A', destination: 'C', presupuesto: '50000', assigned_truck_id: 't1' });
  return s;
}

test('el particular usa el mismo relevo con un objeto propio que lee su formulario', () => {
  const { P, R } = cargar();
  const s = completo(P);
  const w = P._test.relevo(s);
  assert.equal(w.standalone, true);
  assert.equal(w.mode, 'create');
  assert.equal(w.serviceId, null);
  assert.equal(w.data.assigned_driver_id, 'd1', 'sin chofer elegido, el que lo retira es el de la jornada del móvil');
  assert.equal(R.visible(w), true);
  s.d.logistica = 'third';
  assert.equal(w.data.logistics_type, 'third_party');
  assert.equal(R.visible(w), false, 'un tercerizado no lleva relevo');
  s.d.logistica = 'own';
  s.intake = { id: 'i1' };
  assert.equal(R.visible(w), false, 'creado desde el remito de un chofer ya está finalizado');
  s.intake = null;
  s.edit = { id: 's1', status: 'completed', cerrado: true };
  assert.equal(w.mode, 'view');
  assert.equal(R.visible(w), false);
  s.edit = { id: 's1', status: 'assigned', cerrado: false };
  assert.equal(w.serviceId, 's1');
  assert.equal(R.visible(w), true);
});

test('con el relevo prendido no deja guardar sin punto B ubicado ni chofer que recibe distinto', () => {
  const { P, R } = cargar();
  const s = completo(P);
  assert.equal(P._test.errores(s).length, 0);
  const w = P._test.relevo(s), c = R._state(w);
  c.on = true;
  const e = P._test.errores(s).join(' ');
  assert.match(e, /Servicio con relevo: falta el punto de intercambio ubicado en el mapa/);
  assert.match(e, /Servicio con relevo: falta el chofer que recibe/);
  Object.assign(c, { address: 'Ruta 2 km 50', lat: -35, lng: -57.9, toDriver: 'd1' });
  assert.match(P._test.errores(s).join(' '), /el chofer que recibe tiene que ser distinto del que lo retira/);
  c.toDriver = 'd2';
  assert.equal(P._test.errores(s).length, 0);
  s.d.logistica = 'third'; s.d.terc_provider_id = 'p1'; c.toDriver = '';
  assert.doesNotMatch(P._test.errores(s).join(' '), /relevo/, 'un tercerizado no valida el relevo');
});

test('al guardar el particular el relevo se carga con su objeto aunque haya un asistente de prestadora abierto', async () => {
  const calls = [];
  const db = { rpc: async (name, args) => { calls.push([name, args]); return { data: { to_driver_name: 'Lucas P.' }, error: null }; } };
  const otro = { serviceId: 'otro', mode: 'edit', data: {} };
  const { P, R, toasts } = cargar({ db, wizard: otro });
  const s = completo(P);
  const w = P._test.relevo(s), c = R._state(w);
  Object.assign(c, { loaded: true, on: true, address: 'Ruta 2 km 50', placeId: 'pB', lat: -35, lng: -57.9, toDriver: 'd2' });
  assert.equal(await R.persist(w, 's9'), true);
  assert.equal(calls[0][0], 'set_operator_service_relay_v1');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { p_service_id: 's9', p_exchange_address: 'Ruta 2 km 50', p_exchange_lat: -35, p_exchange_lng: -57.9, p_exchange_place_id: 'pB', p_to_driver_id: 'd2' });
  assert.equal(otro.relay, undefined, 'no toca el asistente de prestadoras');
  assert.match(toasts[0][1], /Relevo cargado: Lucas P\. recibe en Ruta 2 km 50/);
});

test('editar: el relevo entra en «Confirmar cambios»', () => {
  const { P, R } = cargar();
  const s = completo(P);
  s.edit = { id: 's1', status: 'assigned', cerrado: false, pagos: [] };
  assert.equal(P._test.snapshot(s).relay, null);
  const w = P._test.relevo(s), c = R._state(w);
  Object.assign(c, { on: true, address: 'Ruta 2 km 50', toDriver: 'd2' });
  assert.equal(P._test.snapshot(s).relay, 'Ruta 2 km 50 · recibe Lucas P.');
  const win = {}; vm.runInNewContext(fs.readFileSync('ui/service-improvements-v1.js', 'utf8'), { window: win });
  const rows = win.AuxiliosServiceImprovements.changes({ relay: null }, { relay: 'Ruta 2 km 50 · recibe Lucas P.' });
  assert.deepEqual([...rows.map(r => r.label)], ['Servicio con relevo']);
});

test('el formulario del particular pinta el relevo en Asignación y lo guarda después del servicio', () => {
  assert.match(privateJs, /'<\/div>'\) \+ relevoHtml\(\)\) \+/);
  assert.match(privateJs, /pintarRecursos\(false\);\n    pintarRelevo\(\);/);
  assert.match(privateJs, /if \(!st\.edit\.cerrado\) await guardarRelevo\(eid\);/);
  assert.match(privateJs, /if \(!intake\) await guardarRelevo\(res\.service_id\);/);
  assert.match(privateJs, /await relevo\(\)\.load\(hostRelevo\(\)\);[\s\S]{0,200}st\.edit\.original = editSnapshot\(\);/);
  assert.match(css, /:is\(\.osv4-reactive, \.psv-relay\) \.osv4-relay-field \{/);
  assert.match(css, /#psv-form \.psv-relay \.osv4-relay-toggle\.ax-switch \{/);
});
