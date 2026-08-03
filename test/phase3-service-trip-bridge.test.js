const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('fase 3 conecta servicio, jornada, viaje y remito en la base', () => {
  const sql = read('migrations/20260803173000_phase3_service_trip_bridge.sql');

  assert.match(sql, /create or replace function public\.get_driver_operator_queue\(\)/i);
  assert.match(sql, /create or replace function public\.link_operator_service_remito/i);
  assert.match(sql, /JORNADA_REQUERIDA/i);
  assert.match(sql, /REMITO_REQUERIDO/i);
  assert.match(sql, /insert into public\.trips/i);
  assert.match(sql, /update public\.trips[\s\S]*fecha_hora_fin/i);
  assert.match(sql, /trg_phase3_link_remito/i);
  assert.match(sql, /trg_phase3_link_incident/i);
  assert.match(sql, /operator_services_unique_trip_idx/i);
  assert.match(sql, /operator_services_unique_remito_idx/i);
});

test('el puente del chofer usa RPC seguras y conserva el remito existente', () => {
  const js = read('operator-service-bridge.js');

  assert.match(js, /get_driver_operator_queue/);
  assert.match(js, /advance_operator_service/);
  assert.match(js, /link_operator_service_remito/);
  assert.match(js, /guardarRemitoCompleto/);
  assert.match(js, /abrirModalIncidente/);
  assert.match(js, /rem-nro-prestadora/);
  assert.doesNotMatch(js, /company_estimated_total|unit_price|pricing_snapshot/);
  assert.doesNotMatch(js, /nav-operaciones/);
});

test('el módulo y sus estilos forman parte del arranque, CI y PWA', () => {
  const config = read('config.js');
  const pkg = read('package.json');
  const sw = read('sw.js');

  assert.match(config, /auxilios-phase3-service-bridge/);
  assert.match(config, /operator-service-bridge\.js/);
  assert.match(pkg, /node --check operator-service-bridge\.js/);
  assert.match(sw, /auxilios-v11[2-9]/);
  assert.match(sw, /operator-service-bridge\.js/);
  assert.match(sw, /operator-service-bridge\.css/);
});
