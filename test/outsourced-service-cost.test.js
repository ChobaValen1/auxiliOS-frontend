'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('outsourced-service-cost-v1.js'), sql = read('migrations/20261018230000_outsourced_service_costs_v1.sql');
function load(extra = {}) { const window = {}; extra = { PERFIL_USUARIO: { roles: { name: 'administracion' } }, ...extra }; vm.runInNewContext(src, { window, document: { getElementById: () => null, addEventListener() {} }, console, Intl, Date, setTimeout, clearTimeout, ...extra }); return window.AuxTercerizadoServicio; }
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

test('costo tercerizado: el operador no ve tarifas ni importes y no manda ajuste', () => {
  const t = load({ PERFIL_USUARIO: { roles: { name: 'operador' } } });
  const p = t._payload({ form: { ...t._blank(), provider_id: 'p1', adjustment_amount: '5000', adjustment_reason: 'intento' }, providers: [prov] });
  assert.equal('adjustment_amount' in p, false); assert.equal('adjustment_reason' in p, false);
  assert.match(src, /rpc\('get_outsourced_service_cost_v1'/);
  assert.doesNotMatch(src, /from\('outsourced_service_costs'\)/);
  assert.match(src, /Lo que se le paga lo calcula y lo ve Administración/);
  const m = read('migrations/20261019010000_outsourced_costs_operator_no_amounts.sql');
  assert.match(m, /alter policy outsourced_service_costs_select_staff[\s\S]*= 'administracion'\)/);
  assert.match(m, /if v_role <> 'administracion' then q := app_private\.outsourced_hide_amounts\(q\)/);
  assert.match(m, /case when v_admin then jsonb_build_object\('unit_amount'/);
  assert.match(m, /p - 'adjustment_amount' - 'adjustment_reason'/);
});

test('tercerizada: se finaliza desde Pendiente (sin Asignar chofer y móvil)', () => {
  const lc = read('operator-service-lifecycle.js'), os = read('operator-services.js');
  assert.match(lc, /if\(status==='pending'\)return\[\['assign_outsourced','Asignar'\],\['finalize','Finalizar'\],\['annul','Anular'\]\]/);
  assert.match(lc, /if\(status==='assigned'\)return\[\['unassign','Quitar asignación'\],\['finalize','Finalizar'\],\['annul','Anular'\]\]/);
  assert.match(lc, /rpc\('assign_outsourced_service_v2'/);
  const ma = read('migrations/20261019030000_outsourced_assign.sql');
  assert.match(ma, /v_transition='outsourced_assign' and coalesce\(new\.logistics_type,'own'\)='third_party'/);
  assert.match(ma, /Primero elegí qué tercerizado hace el servicio/);
  assert.match(lc, /const direct=s\.status==='assigned'&&!third;/);
  assert.match(os, /s\.status==='pending'&&s\.logistics_type==='third_party'\)\)entries\.push\(\['finalize','Finalizar'\]\)/);
  const m = read('migrations/20261019020000_outsourced_finalize_from_pending.sql');
  assert.match(m, /old\.status='pending' and new\.status='completed' and v_transition='finalize' and coalesce\(new\.logistics_type,'own'\)='third_party'/);
  assert.match(m, /elegí qué tercerizado lo hizo/);
});

test('tercerizados: precio fijo por localidad (tarifa, servicio y base)', () => {
  const t = load();
  const lp = { ...prov, modes: { L: { calc_mode: 'locality', localities: [{ name: 'Mar Azul' }] } } };
  const w = { mode: 'create', data: { logistics_type: 'third_party', primary_concept_id: 'L' }, terc: terc({ provider_id: 'p1' }, lp) };
  assert.match(t.validate(w).join(), /Elegí la localidad/);
  w.terc.form.locality = 'Mar Azul';
  assert.equal(t.validate(w).length, 0);
  assert.equal(t._payload(w.terc).locality, 'Mar Azul');
  const rates = read('outsourced-rates-v1.js');
  assert.match(rates, /data-v="locality"[^>]*>Por localidad<\/button>/);
  assert.match(rates, /calc_mode: 'locality', localities: locsOf\(r\)/);
  const m = read('migrations/20261019040000_outsourced_locality_rates.sql');
  assert.match(m, /if v_line->>'calc_mode' = 'locality' then/);
  assert.match(m, /if not v_is_loc then/); // sin adicionales ni peajes
  assert.match(m, /case when v_admin then jsonb_build_object\('amount'/); // el operador no ve precios
});

test('servicios: en Chofer y Móvil se ve el tercerizado (sólo el nombre)', () => {
  const os = read('operator-services.js');
  assert.match(os, /\(key==='driver'\|\|key==='mobile'\)&&s\.logistics_type==='third_party'\)return outsourcedCrewCell\(s\)/);
  assert.match(os, /s\.outsourced_provider_name/);
  const m = read('migrations/20261019050000_list_services_outsourced_name.sql');
  assert.match(m, /'outsourced_provider_name',\(select op\.display_name/);
  assert.doesNotMatch(m, /total_amount|base_amount/);
});

test('tercerizada: con el tercerizado elegido, al guardar queda Asignado', () => {
  const m = read('migrations/20261019060000_outsourced_autoassign_on_save.sql');
  assert.match(m, /set_outsourced_service_cost_v1/);
  assert.match(m, /app\.lifecycle_transition', 'outsourced_assign'/);
  assert.match(m, /set status = 'assigned'/);
  assert.match(m, /'outsourced_assigned'/);
  assert.match(m, /set status = 'pending'/);
  assert.match(m, /raise exception/);
  assert.match(src, /al guardar el servicio queda Asignado/);
});

test('estado › asignar: se puede elegir un tercerizado (sin importes)', () => {
  const lc = read('operator-service-lifecycle.js'), m = read('migrations/20261019070000_outsourced_assign_from_status.sql');
  assert.match(lc, /data-osl-mode="third"[^`]*>Tercerizado</);
  assert.match(lc, /rpc\('assign_outsourced_service_v2',\{p_service_id:s\.service_id,p_provider_id:sel\.value,p_locality:/);
  assert.match(lc, /rpc\('list_outsourced_providers_for_service_v1'/);
  assert.doesNotMatch(lc.slice(lc.indexOf('function outsourcedFields'), lc.indexOf('async function submitOutsourced')), /amount|money\(/);
  assert.match(m, /create or replace function public\.assign_outsourced_service_v2/);
  assert.match(m, /logistics_type = 'third_party', assigned_driver_id = null/);
  assert.match(m, /perform public\.set_outsourced_service_cost_v1/);
  assert.match(m, /s\.status <> 'pending'/);
});
