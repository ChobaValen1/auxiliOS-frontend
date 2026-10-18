'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('outsourced-service-cost-v1.js'), sql = read('migrations/20261018230000_outsourced_service_costs_v1.sql');
function load(extra = {}) { const window = {}; vm.runInNewContext(src, { window, document: { getElementById: () => null, addEventListener() {} }, console, Intl, Date, setTimeout, clearTimeout, ...extra }); return window.AuxTercerizadoServicio; }
const prov = { provider_id: 'p1', display_name: 'Buby', has_rate: true, tolls_mode: 'separate', concepts: ['L'], extras: [{ concept_id: 'H', name: 'Hora', unit: 'hour', unit_amount: 12000 }] };
const terc = (form, p = prov) => ({ form: { ...load()._blank(), ...form }, providers: [p] });

test('costo tercerizado: números como los escribe la gente', () => {
  const t = load();
  assert.equal(t._num('6.400'), 6400); assert.equal(t._num('1,5'), 1.5); assert.equal(t._num('1.500,50'), 1500.5); assert.equal(t._num('40.5'), 40.5);
  assert.equal(t._num(''), 0); assert.ok(Number.isNaN(t._num('abc')));
});

test('costo tercerizado: arma lo que se manda a la base; peajes incluidos no se mandan', () => {
  const t = load();
  const p = t._payload(terc({ provider_id: 'p1', km_asphalt: '40.5', km_gravel: '10', tolls_amount: '6.400', extras: { H: '1,5', X: '0' }, adjustment_amount: '2000', adjustment_reason: ' Espera extra ' }));
  assert.equal(JSON.stringify(p), JSON.stringify({ provider_id: 'p1', km_asphalt: 40.5, km_gravel: 10, tolls_amount: 6400, extras: [{ concept_id: 'H', quantity: 1.5 }], adjustment_amount: 2000, adjustment_reason: 'Espera extra' }));
  const inc = t._payload(terc({ provider_id: 'p1', tolls_amount: '5000' }, { ...prov, tolls_mode: 'included' }));
  assert.equal(inc.tolls_amount, 0);
});

test('costo tercerizado: validación — negativos, texto y ajuste sin motivo', () => {
  const t = load();
  const e = t._problems(terc({ km_asphalt: '-1', tolls_amount: 'abc', extras: { H: '-2' }, adjustment_amount: '-500', adjustment_reason: 'ok' }));
  assert.equal(JSON.stringify(Object.keys(e).sort()), JSON.stringify( ['adjustment_reason', 'km_asphalt', 'tolls_amount', 'x:H']));
  assert.equal(JSON.stringify(t._problems(terc({ adjustment_amount: '-500', adjustment_reason: 'Descuento acordado' }))), '{}');
});

test('costo tercerizado: antes de guardar exige tercerizado con tarifa que incluya el tipo de servicio', () => {
  const t = load();
  const w = (form, p, extra = {}) => ({ mode: 'create', data: { logistics_type: 'third_party', primary_concept_id: 'L', ...extra }, terc: terc(form, p) });
  assert.match(t.validate(w({})).join(), /Elegí qué tercerizado/);
  assert.match(t.validate(w({ provider_id: 'p1' }, { ...prov, has_rate: false })).join(), /no tiene tarifa/);
  assert.match(t.validate(w({ provider_id: 'p1' }, prov, { primary_concept_id: 'U' })).join(), /no incluye/);
  assert.equal(t.validate(w({ provider_id: 'p1' })).length, 0);
  assert.equal(t.validate({ ...w({}), data: { logistics_type: 'own' } }).length, 0);
  assert.equal(t.validate({ ...w({}), mode: 'view' }).length, 0);
});

test('costo tercerizado: fecha del servicio en Argentina', () => {
  const t = load();
  assert.equal(t._serviceDate({ data: { scheduled_for: '2026-10-19T20:00' } }), '2026-10-19');
  assert.equal(t._serviceDate({ data: { scheduled_for: '2026-10-20T01:30:00Z' } }), '2026-10-19');
});

test('costo tercerizado: al guardar llama a la base; con Propia limpia sólo si había costo; liquidado no se toca', async () => {
  const calls = [];
  const _db = { rpc: async (n, a) => { calls.push([n, a]); return { data: { service_id: a.p_service_id }, error: null }; } };
  const t = load({ _db });
  const third = { mode: 'edit', data: { logistics_type: 'third_party' }, terc: terc({ provider_id: 'p1', km_asphalt: '10' }) };
  await t.persist(third, 's1');
  assert.equal(calls[0][0], 'set_outsourced_service_cost_v1'); assert.equal(calls[0][1].p_payload.provider_id, 'p1');
  await t.persist({ mode: 'edit', data: { logistics_type: 'own' }, terc: { form: {}, row: null } }, 's2');
  assert.equal(calls.length, 1);
  await t.persist({ mode: 'edit', data: { logistics_type: 'own' }, terc: { form: {}, row: { provider_id: 'p1' } } }, 's3');
  assert.equal(calls[1][1].p_payload, null);
  await t.persist({ ...third, terc: { ...terc({ provider_id: 'p1' }), row: { provider_id: 'p1', settlement_id: 'L1' } } }, 's4');
  await t.persist({ ...third, mode: 'view' }, 's5');
  assert.equal(calls.length, 2);
});

test('costo tercerizado: conectado al formulario y la base calcula y bloquea lo liquidado', () => {
  const ws = read('operator-service-workspace-reactive-v1.js'), wiz = read('operator-service-wizard.js'), add = read('operator-service-commercial-addons-v1.js');
  assert.match(ws, /actions-column"><section id="osv4-terc"/);
  assert.match(ws, /AuxTercerizadoServicio\?\.sync\?\.\(W\(\)\)/);
  assert.match(ws, /AuxTercerizadoServicio\?\.persist\?\.\(w,serviceId\)/);
  assert.match(wiz, /AuxTercerizadoServicio\?\.validate\?\.\(w\)/);
  // Con Tercerizada, «¿Quién hace el servicio?» reemplaza a Asignar Chofer / Móvil (y no se exige chofer).
  assert.match(ws, /data-assignment="truck"><\/select><\/label><\/div><div id="osv4-terc-pick"/);
  assert.match(ws, /third_party'&&!locked\('assigned_driver_id'\)[^}]*osSetServicio\?\.\('assigned_driver_id',''\)/);
  assert.match(wiz, /req\('assigned_resources'\)&&d\.logistics_type!=='third_party'/);
  assert.match(src, /classList\.toggle\('osc-replaced',third\)/);
  assert.match(add, /querySelector\('#osv4-terc'\)/);
  assert.match(src, /quote_outsourced_service_cost_v1/); assert.match(src, /list_outsourced_providers_for_service_v1/);
  assert.match(sql, /settlement_id is not null then raise exception/);
  assert.match(sql, /tolls_mode = 'separate' and v_tolls > 0/);
  assert.match(sql, /logistics_type, 'own'\) <> 'third_party'/);
  for (const f of ['Index.html', 'sw.js']) assert.match(read(f), /outsourced-service-cost-v1\.js/);
  assert.match(read('package.json'), /node --check outsourced-service-cost-v1\.js/);
});
