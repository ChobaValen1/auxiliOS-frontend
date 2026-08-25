const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('rendition migration calculates cash from remitos linked by log_id', () => {
  const sql = read('migrations/20260807100500_rendition_journey_source_of_truth.sql');
  assert.match(sql, /function public\.calcular_efectivo_jornada\(p_log_id integer\)/);
  assert.match(sql, /where r\.log_id = p_log_id/);
  assert.match(sql, /function public\.tg_remitos_sync_rendicion\(\)/);
  assert.match(sql, /new\.pago_1_metodo is distinct from old\.pago_1_metodo/);
  assert.match(sql, /new\.pago_1_monto is distinct from old\.pago_1_monto/);
  assert.match(sql, /new\.imp_excedente is distinct from old\.imp_excedente/);
});

test('approved renditions become observed after later economic corrections', () => {
  const sql = read('migrations/20260807100500_rendition_journey_source_of_truth.sql');
  assert.match(sql, /p_force_observe and rc\.admin_status = 'aprobada' then 'observada'/);
  assert.match(sql, /Consultar historial del remito para valores anteriores y posteriores/);
});

test('monthly export loads remitos from the selected journeys, not created_at date', () => {
  const src = read('rendition-journey-source-v1.js');
  assert.match(src, /\.in\('log_id', logIds\)/);
  assert.match(src, /const fecha = logToFecha\[r\.log_id\] \|\| fechaAR\(r\.created_at_device\)/);
  assert.match(src, /a\.diff \+= declarado \+ gastosSistema \+ gastosExtra - esperado/);
  assert.doesNotMatch(src, /\.gte\('created_at_device'/);
});

test('rendition preview uses the active journey RPCs', () => {
  const src = read('rendition-journey-source-v1.js');
  assert.match(src, /rpc\('calcular_efectivo_jornada', \{ p_log_id: logId \}\)/);
  assert.match(src, /rpc\('calcular_gastos_jornada', \{ p_log_id: logId \}\)/);
  assert.match(src, /\.eq\('log_id', logId\)/);
});

test('edge function validates journey ownership and calculates by log_id', () => {
  const src = read('supabase/functions/check-integridad/index.ts');
  assert.match(src, /actorId !== driver_id/);
  assert.match(src, /jornada\.driver_id !== driver_id \|\| jornada\.log_date !== fecha/);
  assert.match(src, /rpc\("calcular_efectivo_jornada", \{ p_log_id: log_id \}\)/);
  assert.match(src, /rpc\("calcular_gastos_jornada", \{ p_log_id: log_id \}\)/);
  assert.match(src, /body\?\.motivo_gastos_extra \?\? body\?\.motivo_extra/);
  assert.match(src, /body\?\.notas_chofer \?\? body\?\.notas/);
});

test('PWA and config load the rendition correction module', () => {
  const config = read('config.js');
  const sw = read('sw.js');
  assert.match(config, /auxilios-rendition-journey-source-v1/);
  assert.match(config, /\/rendition-journey-source-v1\.js/);
  const match = sw.match(/auxilios(?:-billing-phase2)?-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 133);
  assert.match(sw, /'\/rendition-journey-source-v1\.js'/);
});
