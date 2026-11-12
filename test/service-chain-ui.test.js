const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('operator-service-chain-v1.js', 'utf8');
const ws = fs.readFileSync('operator-service-workspace-reactive-v1.js', 'utf8');
const proxy = fs.readFileSync('supabase/functions/maps-proxy/index.ts', 'utf8');
const exporter = fs.readFileSync('operator-billing-export.js', 'utf8');

function load(db) {
  const toasts = [];
  const window = { toast: (m, t) => toasts.push([t, m]) };
  vm.runInNewContext(src, { window, document: { getElementById: () => null }, _db: db, console, Date, Number, String, JSON });
  return { E: window.AuxEngancheServicio, toasts };
}
const A = { service_id: 'a', label: 'ORD-A', has_previous: false, scheduled_for: '2026-11-12T13:00:00Z', base_lat: -34.92, base_lng: -57.95, origin_lat: -34.92, origin_lng: -57.95, destination_lat: -34.88, destination_lng: -58.02 };
const wizard = extra => ({ serviceId: 'b', mode: 'edit', data: { company_id: 'sos' }, context: { billing: { route_mode: 'base_origin_destination_base' } }, ...extra });

test('recorrido según el lugar en la cadena', () => {
  const { E } = load(null);
  assert.equal(E._modeFor('base_origin_destination_base', false, false), 'base_origin_destination_base');
  assert.equal(E._modeFor('base_origin_destination_base', false, true), 'base_origin_destination');
  assert.equal(E._modeFor('base_origin_destination_base', true, false), 'origin_destination_base');
  assert.equal(E._modeFor('base_origin_destination_base', true, true), 'origin_destination');
  assert.equal(E._modeFor('origin_destination', true, false), 'origin_destination', 'prestadoras Origen → Destino no cambian');
  const w = wizard({ chain: { key: 'b', selectedId: 'a', next: null } });
  assert.equal(E.routeMode(w, 'base_origin_destination_base'), 'origin_destination_base');
  assert.equal(E.routeMode({ ...w, intakeActivated: true }, 'base_origin_destination_base'), 'base_origin_destination_base', 'los activados no se enganchan');
});

test('al guardar recalcula el anterior sin vuelta a la base y engancha en un solo paso', async () => {
  const calls = [];
  const db = {
    functions: { invoke: async (name, { body }) => { calls.push(['route', body.routeMode, body.origin.latitude]); return { data: { distanceMeters: 41300, durationSeconds: 3000, legs: [{}, {}] } }; } },
    rpc: async (name, args) => { calls.push([name, args]); return { data: { changed: true }, error: null }; }
  };
  const { E, toasts } = load(db);
  const w = wizard({ chain: { key: 'b', selectedId: 'a', originalId: null, candidates: [A], previous: null, next: null } });
  assert.equal(await E.persist(w, 'b'), true);
  assert.deepEqual(calls[0], ['route', 'base_origin_destination', -34.92]);
  assert.equal(calls[1][0], 'set_operator_service_chain_v1');
  assert.equal(calls[1][1].p_previous_service_id, 'a');
  assert.equal(calls[1][1].p_previous_km.distance_km, 41.3);
  assert.equal(calls[1][1].p_released_km, null);
  assert.equal(w.chain.originalId, 'a');
  assert.match(toasts[0][1], /Enganchado a ORD-A: se recalcularon sus km \(41,3 km, sin vuelta a la base\)/);
});

test('soltar el enganche devuelve al anterior su vuelta a la base', async () => {
  const calls = [];
  const db = {
    functions: { invoke: async (name, { body }) => { calls.push(body.routeMode); return { data: { distanceMeters: 82600 } }; } },
    rpc: async (name, args) => { calls.push(args); return { data: {}, error: null }; }
  };
  const { E } = load(db);
  const w = wizard({ chain: { key: 'b', selectedId: null, originalId: 'a', candidates: [], previous: A, next: null } });
  await E.persist(w, 'b');
  assert.equal(calls[0], 'base_origin_destination_base');
  assert.equal(calls[1].p_previous_service_id, null);
  assert.equal(calls[1].p_released_km.distance_km, 82.6);
});

test('sin cambios no llama a nada; si falla avisa que el servicio se guardó', async () => {
  let n = 0;
  const { E, toasts } = load({ functions: { invoke: async () => { n++; return { data: { distanceMeters: 1 } }; } }, rpc: async () => ({ error: { message: 'Ese servicio ya tiene otro servicio enganchado' } }) });
  assert.equal(await E.persist(wizard({ chain: { key: 'b', selectedId: 'a', originalId: 'a' } }), 'b'), true);
  assert.equal(n, 0);
  assert.equal(await E.persist(wizard({ chain: { key: 'b', selectedId: 'a', originalId: null, candidates: [A] } }), 'b'), false);
  assert.match(toasts[0][1], /El servicio se guardó, pero no se pudo enganchar: Ese servicio ya tiene otro servicio enganchado/);
});

test('el formulario, maps-proxy y el Excel conocen los recorridos nuevos', () => {
  assert.match(ws, /return window\.AuxEngancheServicio\?\.routeMode\?\.\(W\(\),base\)\|\|base;/);
  // En la tarjeta de conceptos sí/no, en la misma fila que «¿Se derivó a taller?».
  assert.match(ws, /<section id="osv4-toggles" class="osv2-card osv4-toggles-card" hidden><div class="osv4-toggles-row"><div id="osv4-toggles-list" class="osv4-toggles-list"><\/div><div id="osv4-chain-switch" class="osv4-chain-switch"><\/div><\/div><div id="osv4-chain" class="osv4-chain" hidden><\/div><\/section>/);
  assert.match(ws, /card\.hidden=!t\.concepts\.length&&!window\.AuxEngancheServicio\?\.visible\?\.\(w\);/);
  assert.match(src, /<label class="ax-switch osv4-toggle-row osv4-chain-toggle"><span>Servicio enganchado<\/span><input type="checkbox" id="osv4-chain-on"/);
  assert.match(ws, /window\.AuxEngancheServicio\?\.persist\?\.\(w,serviceId\)/);
  assert.match(ws, /rm==='base_origin_destination'\?\[base,origin,dest\]:rm==='origin_destination_base'\?\[origin,dest,base\]/);
  assert.match(proxy, /mode === "base_origin_destination"[\s\S]*destination: latLngWaypoint\(destination\), intermediates: \[latLngWaypoint\(origin\)\]/);
  assert.match(proxy, /mode === "origin_destination_base"[\s\S]*destination: latLngWaypoint\(base\), intermediates: \[latLngWaypoint\(destination\)\]/);
  assert.match(exporter, /const mode=r\.chain_route_mode\|\|r\.billing_route_mode\|\|'origin_destination';/);
  assert.match(exporter, /list_operator_service_chain_route_modes_v1/);
});
