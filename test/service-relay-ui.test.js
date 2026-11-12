const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('operator-service-relay-v1.js', 'utf8');
const ws = fs.readFileSync('operator-service-workspace-reactive-v1.js', 'utf8');

function load(db, wizard = null) {
  const toasts = [];
  const window = { toast: (m, t) => toasts.push([t, m]), OperatorServices: { S: { wizard, drivers: [], trucks: [] } } };
  vm.runInNewContext(src, { window, document: { getElementById: () => null }, _db: db, console, Date, Number, String, JSON, Math, setTimeout, clearTimeout });
  return { R: window.AuxRelevoServicio, toasts };
}
const located = { key: 's1', loaded: true, on: true, original: null, address: 'Av. 520 y 143, Gonnet', placeId: 'p1', lat: -34.87, lng: -58.02, toDriver: 'd2', handedOver: false };
const wizard = extra => ({ serviceId: 's1', mode: 'edit', serviceStatus: 'assigned', data: { company_id: 'c1' }, ...extra });

test('al guardar carga el relevo con el punto B ubicado y el chofer y móvil que reciben', async () => {
  const calls = [];
  const { R, toasts } = load({ rpc: async (name, args) => { calls.push([name, args]); return { data: { to_driver_name: 'Lucas P.' }, error: null }; } });
  const w = wizard({ relay: { ...located } });
  assert.equal(await R.persist(w, 's1'), true);
  assert.equal(calls[0][0], 'set_operator_service_relay_v1');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { p_service_id: 's1', p_exchange_address: 'Av. 520 y 143, Gonnet', p_exchange_lat: -34.87, p_exchange_lng: -58.02, p_exchange_place_id: 'p1', p_to_driver_id: 'd2' });
  assert.match(toasts[0][1], /Relevo cargado: Lucas P\. recibe en Av\. 520 y 143, Gonnet/);
});

test('si falta algo no llama a la base y avisa qué falta; el servicio ya está guardado', async () => {
  let n = 0;
  const { R, toasts } = load({ rpc: async () => { n++; return { data: {}, error: null }; } });
  const w = wizard({ relay: { ...located, lat: null, lng: null, toDriver: '' } });
  assert.equal(await R.persist(w, 's1'), false);
  assert.equal(n, 0);
  assert.match(toasts[0][1], /El servicio se guardó, pero falta el punto de intercambio ubicado en el mapa, el chofer que recibe para cargar el relevo/);
});

test('sin cambios no llama; apagarlo lo quita; si falla avisa', async () => {
  const calls = [];
  const orig = { exchange_address: 'Av. 520 y 143, Gonnet', exchange_lat: -34.87, exchange_lng: -58.02, to_driver_id: 'd2' };
  const { R, toasts } = load({ rpc: async (name, args) => { calls.push(name); return { data: {}, error: null }; } });
  assert.equal(await R.persist(wizard({ relay: { ...located, original: orig } }), 's1'), true);
  assert.equal(calls.length, 0);
  const off = wizard({ relay: { ...located, on: false, original: orig } });
  assert.equal(await R.persist(off, 's1'), true);
  assert.deepEqual(calls, ['remove_operator_service_relay_v1']);
  assert.equal(off.relay.original, null);
  assert.match(toasts[0][1], /Relevo quitado/);
  const bad = load({ rpc: async () => ({ error: { message: 'El móvil de la jornada del chofer que recibe es el mismo que el del primer tramo' } }) });
  assert.equal(await bad.R.persist(wizard({ relay: { ...located } }), 's1'), false);
  assert.match(bad.toasts[0][1], /El servicio se guardó, pero no se pudo cargar el relevo: El móvil de la jornada del chofer que recibe es el mismo que el del primer tramo/);
});

test('un vehículo ya entregado, los servicios terciarizados y la vista no se tocan', async () => {
  let n = 0;
  const { R } = load({ rpc: async () => { n++; return { data: {}, error: null }; } });
  assert.equal(await R.persist(wizard({ relay: { ...located, handedOver: true } }), 's1'), true);
  assert.equal(await R.persist(wizard({ mode: 'view', relay: { ...located } }), 's1'), true);
  assert.equal(await R.persist(wizard({ data: { logistics_type: 'third_party' }, relay: { ...located } }), 's1'), true);
  assert.equal(await R.persist(wizard({ serviceStatus: 'completed', relay: { ...located } }), 's1'), true);
  assert.equal(n, 0);
  assert.equal(R.visible(wizard({ data: { logistics_type: 'third_party' } })), false);
  assert.equal(R.visible(wizard({ intakeActivated: true })), false);
  assert.equal(R.visible(wizard({})), true);
});

test('el formulario lo monta en la fila de interruptores y lo guarda después del servicio', () => {
  assert.match(ws, /window\.AuxRelevoServicio\?\.sync\?\.\(W\(\)\)/);
  assert.match(ws, /window\.AuxRelevoServicio\?\.persist\?\.\(w,serviceId\)/);
  assert.match(ws, /<div id="osv4-relay-switch" class="osv4-relay-switch"><\/div>/);
  assert.match(ws, /<div id="osv4-relay" class="osv4-relay" hidden><\/div>/);
  assert.match(src, /<span>Servicio con relevo<\/span><input type="checkbox" id="osv4-relay-on">/);
  assert.match(src, /action: 'autocomplete'/);
  assert.match(src, /action: 'place'/);
  for (const f of ['Index.html', 'sw.js', 'package.json']) assert.match(fs.readFileSync(f, 'utf8'), /operator-service-relay-v1/);
});

test('el móvil que recibe no se elige: sale de la jornada activa del chofer', () => {
  assert.doesNotMatch(src, /osv4-relay-truck"[^>]*><\/select>|toTruck|p_to_truck_id/);
  assert.match(src, /get_relay_receiver_truck_v1/);
  assert.match(src, /Móvil de su jornada activa/);
  assert.match(src, /Todavía no inició su jornada\./);
});

test('los tres interruptores comparten la misma fila', () => {
  const css = fs.readFileSync('operator-service-chain-v1.css', 'utf8');
  assert.match(css, /\.osv4-toggles-row[^{]*\{ display: grid; grid-auto-flow: column; grid-auto-columns: minmax\(0, 1fr\)/);
  assert.match(ws, /id="osv4-chain-switch" class="osv4-chain-switch"><\/div><div id="osv4-relay-switch" class="osv4-relay-switch"><\/div><\/div>/);
});

test('al elegir el chofer consulta el móvil de su jornada activa (una sola vez por chofer)', async () => {
  const calls = [];
  const w = wizard({ relay: { ...located, toDriver: 'd2', truckFor: '', truck: null } });
  const { R } = load({ rpc: async (name, args) => { calls.push([name, args.p_driver_id]); return { data: { has_active_jornada: true, truck_id: 7, truck_label: '7', truck_plate: 'AC456DE' }, error: null }; } }, w);
  await R.lookupTruck(w);
  assert.deepEqual(calls, [['get_relay_receiver_truck_v1', 'd2']]);
  assert.equal(w.relay.truck.truck_id, 7);
  await R.lookupTruck(w);
  assert.equal(calls.length, 1, 'no repite la consulta para el mismo chofer');
  w.relay.toDriver = 'd3'; w.relay.truckFor = '';
  await R.lookupTruck(w);
  assert.equal(calls.length, 2);
});

test('sin jornada activa no hay móvil y el relevo igual se puede cargar', async () => {
  const w = wizard({ relay: { ...located, toDriver: 'd2', truckFor: '', truck: null } });
  const { R } = load({ rpc: async () => ({ data: { has_active_jornada: false }, error: null }) }, w);
  await R.lookupTruck(w);
  assert.equal(w.relay.truck.has_active_jornada, false);
  assert.equal(R._missing(w.relay).length, 0);
});

test('sin jornada no es un bloqueo: se aclara que se puede cargar igual; si la consulta falla, no dice que no inició jornada', async () => {
  assert.match(src, /Podés cargar el relevo igual/);
  const w = wizard({ relay: { ...located, toDriver: 'd2', truckFor: '', truck: null } });
  const { R } = load({ rpc: async () => ({ data: null, error: { message: 'Could not find the function public.get_relay_receiver_truck_v1' } }) }, w);
  await R.lookupTruck(w);
  assert.equal(w.relay.truckError, true);
  assert.equal(w.relay.truck, null);
  assert.match(src, /No se pudo consultar su jornada/);
});

test('si la base todavía no tiene el relevo, el aviso lo dice claro al guardar', async () => {
  const { R, toasts } = load({ rpc: async () => ({ error: { message: 'Could not find the function public.set_operator_service_relay_v1(...) in the schema cache' } }) });
  assert.equal(await R.persist(wizard({ relay: { ...located } }), 's1'), false);
  assert.match(toasts[0][1], /la base de datos todavía no tiene activado el relevo \(falta aplicar su actualización\)/);
});
