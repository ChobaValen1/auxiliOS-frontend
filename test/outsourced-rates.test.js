'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('outsourced-rates-v1.js'), sql = read('migrations/20261018220000_outsourced_rates_v1.sql');
function load() { const window = {}; vm.runInNewContext(src, { window, document: {}, console, Intl, Date }); return window.AuxTercerizadosTarifas; }
const C = (id, cat, fam, unit, mode) => ({ concept_id: id, name: id, service_category: cat, billing_family: fam, default_pricing_unit: unit, input_mode: mode || 'quantity' });

function setup(t) {
  t._state.concepts = [C('L', 'primary', 'primary', 'service'), C('U', 'primary', 'primary', 'service'), C('H', 'secondary', 'variable', 'hour'), C('B', 'secondary', 'sale', 'unit'), C('P', 'secondary', 'variable', 'unit', 'toggle')];
  t._state.versions = [{ version_id: 'v1', valid_from: '2026-10-01', tolls_mode: 'separate', lines: [{ concept_id: 'L', calc_mode: 'movida_km', movida_amount: 25000, km_asphalt_amount: 900, km_gravel_amount: 1100 }, { concept_id: 'H', calc_mode: 'per_unit', unit_amount: 12000 }] }];
  t._state.sel = 'v1';
}

test('tarifas: importes en formato argentino', () => {
  const t = load();
  assert.equal(t._num('25.000'), 25000); assert.equal(t._num('1.500,50'), 1500.5); assert.equal(t._num('900'), 900);
  assert.equal(t._num(''), null); assert.ok(Number.isNaN(t._num('abc')));
});

test('tarifas: la versión se arma como borrador y vuelve igual al guardar; ventas y Pinacars no se pagan', () => {
  const t = load(); setup(t);
  const d = t._toDraft(t._state.versions[0]);
  assert.deepEqual(Object.keys(d.rows).sort(), ['H', 'L', 'U']);
  assert.equal(d.rows.L.on, true); assert.equal(d.rows.U.on, false); assert.equal(d.rows.L.movida, '25.000');
  const p = t._payload(d);
  assert.equal(JSON.stringify(p.lines), JSON.stringify([{ concept_id: 'L', calc_mode: 'movida_km', movida_amount: 25000, km_asphalt_amount: 900, km_gravel_amount: 1100 }, { concept_id: 'H', calc_mode: 'per_unit', unit_amount: 12000 }]));
});

test('tarifas: faltantes — fecha repetida, tipo encendido sin precio, adicional sin importe, ninguno encendido', () => {
  const t = load(); setup(t); t._state.sel = null;
  const d = t._toDraft(t._state.versions[0]);
  d.rows.U.on = true; d.rows.U.mode = 'fixed'; d.rows.U.fixed = ''; d.rows.H.unit = '';
  const p = t._problems(d);
  assert.match(p.valid_from, /Ya hay una tarifa desde el 01\/10\/26/);
  assert.match(p.U, /monto fijo/); assert.match(p.H, /importe/);
  Object.values(d.rows).forEach(r => { r.on = false; });
  assert.ok(t._problems(d).none);
});

test('tarifas: la base valida, guarda por versión con vigencia, sólo Administración y queda auditado', () => {
  assert.match(sql, /constraint outsourced_rate_versions_from_key unique \(provider_id, valid_from\)/);
  assert.match(sql, /if v_role <> 'administracion' then raise exception 'Sólo Administración puede cargar tarifas de tercerizados'/);
  assert.match(sql, /no se paga al tercerizado/);
  assert.match(sql, /Cargá el precio de al menos un tipo de servicio/);
  assert.match(sql, /execute function public\.capture_audit_event\('version_id'\)/);
  assert.match(sql, /create or replace function app_private\.outsourced_rate_at\(p_provider_id uuid, p_date date\)/);
  assert.match(src, /rpc\('save_outsourced_rate_version_v1', \{ p_provider_id: st\.provider\.provider_id, p_version_id: st\.sel, p_payload: payload\(st\.draft\) \}\)/);
  assert.match(src, /Copiada de la tarifa vigente/);
  assert.match(read('outsourced-providers-v1.js'), /AuxTercerizadosTarifas\.mount\(rates, prov/);
});
