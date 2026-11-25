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

/* Entrega del relevo en nombre del chofer (Administración / Operaciones). */
function loadAs(roleName, db, wizard = null) {
  const toasts = [], calls = [];
  const window = { toast: (m, t) => toasts.push([t, m]), OperatorServices: { S: { wizard, drivers: [], trucks: [] } }, PERFIL_USUARIO: { roles: { name: roleName } },
    cargarServiciosOperador: async () => calls.push('reload'), verServicioOperador: async id => calls.push(['view', id]) };
  vm.runInNewContext(src, { window, document: { getElementById: () => null }, _db: db, console, Date, Number, String, JSON, Math, setTimeout, clearTimeout });
  return { R: window.AuxRelevoServicio, toasts, calls };
}
const saved = { service_id: 's1', exchange_address: 'Av. 520 y 143, Gonnet', to_driver_id: 'd2', to_driver_name: 'Lucas P.', from_driver_name: 'Juan R.',
  to_has_active_jornada: true, has_remito: true, handed_over: false, delivered: false };

test('Operaciones ve la entrega del relevo en nombre del 1º chofer; el chofer o supervisión no', () => {
  const w = wizard({ mode: 'view', relay: { ...located, original: { ...saved } } });
  for (const r of ['operador', 'administracion']) {
    const m = loadAs(r, { rpc: async () => ({}) }).R._handover(w, w.relay);
    assert.equal(m.act, 'handover');
    assert.match(m.label, /Registrar entrega a Lucas P\. en nombre de Juan R\./);
    assert.equal(m.warns.length, 0);
  }
  for (const r of ['chofer', 'supervision', 'facturacion']) assert.equal(loadAs(r, { rpc: async () => ({}) }).R._handover(w, w.relay), null);
  const { R } = loadAs('operador', { rpc: async () => ({}) });
  assert.equal(R._handover(wizard({ mode: 'view', serviceStatus: 'completed', relay: { ...located, original: { ...saved } } }), { ...located, original: saved }), null);
  assert.equal(R._handover(w, { ...located, original: null }), null, 'un relevo sin guardar no se entrega');
});

test('avisa si falta el remito o la jornada del que recibe; después de entregar ofrece la entrega en destino', () => {
  const { R } = loadAs('operador', { rpc: async () => ({}) });
  const w = wizard({ mode: 'view' });
  const m = R._handover(w, { ...located, original: { ...saved, has_remito: false, to_has_active_jornada: false } });
  assert.match(m.warns[0], /Todavía no hay remito/);
  assert.match(m.warns[1], /Lucas P\. todavía no inició su jornada/);
  const mid = R._handover(w, { ...located, original: { ...saved, handed_over: true, handed_over_at: '2026-11-25T15:00:00Z', handover_source: 'operator' } });
  assert.equal(mid.act, 'delivered');
  assert.match(mid.html, /lo registró Operaciones/);
  assert.match(mid.label, /en nombre de Lucas P\./);
  const done = R._handover(w, { ...located, original: { ...saved, handed_over: true, delivered: true, delivery_source: 'driver' } });
  assert.equal(done.act, undefined);
  assert.match(done.text, /Entregado en destino/);
});

test('registrar la entrega pide doble toque, usa la misma RPC que el chofer y recarga el servicio', async () => {
  const rpcs = [];
  const db = { rpc: async (name, args) => { rpcs.push([name, args]); return { data: { ...saved, handed_over: true, handover_source: 'operator' }, error: null }; } };
  const w = wizard({ mode: 'view', relay: { ...located, original: { ...saved } } });
  const { R, toasts, calls } = loadAs('operador', db, w);
  const btn = { dataset: { relayAct: 'handover' } };
  await R.act(w, btn);
  assert.equal(rpcs.length, 0, 'el primer toque sólo pide confirmar');
  assert.equal(w.relay.sure, 'handover');
  assert.equal(await R.act(w, btn), true);
  assert.deepEqual(JSON.parse(JSON.stringify(rpcs)), [['mark_operator_service_relay_handover_v1', { p_service_id: 's1' }]]);
  assert.equal(w.relay.handedOver, true);
  assert.match(toasts[0][1], /El servicio pasó a Lucas P\./);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), ['reload', ['view', 's1']]);
});

test('en edición no se registra la entrega (se guardaría el chofer viejo) y un error de la base se muestra limpio', async () => {
  let n = 0;
  const edit = wizard({ mode: 'edit', relay: { ...located, original: { ...saved }, sure: 'handover' } });
  const a = loadAs('operador', { rpc: async () => { n++; return {}; } }, edit);
  await a.R.act(edit, { dataset: { relayAct: 'handover' } });
  assert.equal(n, 0);
  const w = wizard({ mode: 'view', relay: { ...located, original: { ...saved }, sure: 'handover' } });
  const b = loadAs('administracion', { rpc: async () => ({ error: { message: 'RELEVO_SIN_JORNADA: Lucas P. todavía no inició su jornada con un móvil' } }) }, w);
  assert.equal(await b.R.act(w, { dataset: { relayAct: 'handover' } }), false);
  assert.equal(b.toasts[0][0], 'error');
  assert.equal(b.toasts[0][1], 'Lucas P. todavía no inició su jornada con un móvil');
  assert.equal(w.relay.acting, false);
});

test('la entrega del relevo está en Acciones (estado y ⋯) y es el siguiente paso recomendado del mapa', () => {
  const badge = fs.readFileSync('operator-service-chain-badge-v1.js', 'utf8');
  const life = fs.readFileSync('operator-service-lifecycle.js', 'utf8');
  const map = fs.readFileSync('operator-services-map-v1.js', 'utf8');
  const os = fs.readFileSync('operator-services.js', 'utf8');
  assert.match(badge, /function relayStep\(id\)[\s\S]*?r\.delivered \|\| !canHandover\(\)[\s\S]*?\['relay_delivered', 'Registrar entrega en destino \(relevo\)'\] : \['relay_handover', 'Registrar entrega del relevo'\]/);
  assert.match(badge, /async function runRelayStep\(id\)[\s\S]*?OperatorServiceLifecycleV2\?\.confirmAction[\s\S]*?markRelay\(id, dest\)/);
  assert.match(badge, /relayStep, runRelayStep/);
  assert.match(life, /function serviceQuickActions\(s\)\{const list=baseServiceQuickActions\(s\),relay=[^}]*relayStep\?\.\(s\.service_id\)[^}]*list\.unshift\(relay\)/);
  assert.match(life, /if\(action==='relay_handover'\|\|action==='relay_delivered'\)return window\.AuxEngancheClip\?\.runRelayStep\?\.\(id\)/);
  assert.match(map, /relay=actions\.find\(\(\[key\]\)=>key==='relay_handover'\|\|key==='relay_delivered'\);if\(relay\)return relay;/);
  assert.match(os, /relayStep\?\.\(id\):null;if\(relayStep\)entries\.push\(\['relay',relayStep\[1\]\]\)/);
  assert.match(os, /if\(action==='relay'\)return window\.AuxEngancheClip\?\.runRelayStep\?\.\(id\)/);
  assert.match(os, /relay_handover:\['Entrega del vehículo en el punto de intercambio \(relevo\)'/);
});
