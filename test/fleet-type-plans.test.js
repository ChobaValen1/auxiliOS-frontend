const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('fleet-type-plans-v1.js', 'utf8');
const control = fs.readFileSync('fleet-control-v1.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928260000_planes_base_por_tipo_v1.sql', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');

function load() {
  const win = {};
  vm.runInNewContext(js, { window: win, document: { addEventListener() {}, getElementById: () => null }, console });
  return win.AuxiliosPlanesBase._test;
}

test('cuenta los planes que faltan asignar en los móviles del tipo', () => {
  const T = load();
  const tipo = { tipo: 'plancha', moviles: 6, cobertura: { 2: 6, 3: 6, 1: 5 } };
  assert.deepEqual(JSON.parse(JSON.stringify(T.resumen(tipo, [2, 3]))), { planes: 2, faltan: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(T.resumen(tipo, [2, 1, 9]))), { planes: 3, faltan: 2 });
  assert.equal(T.cadencia({ interval_km: 15000 }), 'cada 15.000 km');
  assert.equal(T.nombreTipo('plancha'), 'Plancha');
});

test('la base guarda los planes por tipo y los asigna sin pisar ni quitar', () => {
  assert.match(sql, /create table if not exists public\.truck_type_plans/);
  assert.match(sql, /primary key \(tipo_equipo, master_plan_id\)/);
  assert.match(sql, /revoke insert, update, delete, truncate on public\.truck_type_plans from anon, authenticated/);
  assert.match(sql, /<> 'administracion' then\s+raise exception 'Sólo Administración puede cambiar los planes base'/);
  // Sólo inserta lo que falta (sin ON CONFLICT que gaste la secuencia) y reactiva los dados de baja.
  assert.match(sql, /and not exists \(select 1 from public\.truck_subscriptions s where s\.truck_id = p_truck_id and s\.master_plan_id = b\.master_plan_id\)/);
  assert.match(sql, /set is_active = true/);
  assert.doesNotMatch(sql, /delete from public\.truck_subscriptions/);
  assert.match(sql, /create trigger trg_truck_type_plans after insert or update of tipo_equipo on public\.trucks/);
});

test('botón Planes base sólo para Administración, módulo cargado', () => {
  assert.match(control, /esAdmin\(\) \? '<button type="button" class="fcv-refresh" data-fcv="planes-base">' \+ ico\('wrench'\) \+ 'Planes base<\/button>'/);
  assert.match(js, /rpc\('set_truck_type_plans_v1', \{ p_tipo: st\.tipo, p_plan_ids:/);
  assert.match(config, /\/fleet-type-plans-v1\.js/);
});
