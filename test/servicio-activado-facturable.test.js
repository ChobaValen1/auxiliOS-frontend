const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sqlHecho = read('migrations/20260920130000_servicio_activado_facturable_v1.sql');
const sql = read('migrations/20260921010000_activado_no_cierra_el_servicio_v3.sql');
const services = read('operator-services.js');
const lifecycle = read('operator-service-lifecycle.js');
const bridge = read('operator-service-bridge.js');

test('ACTIVADO se guarda como hecho, no se adivina de un texto libre', () => {
  assert.match(sqlHecho, /add column if not exists driver_activated\s+boolean not null default false/);
  // El listado filtraba con `cancellation_reason ilike 'ACTIVADO%'`: cambiar esa
  // redacción vaciaba la pestaña sin que nada fallara.
  assert.match(sqlHecho, /s\.cancellation_reason ilike ''ACTIVADO%''/);
  assert.match(services, /s\?\.driver_activated===true\|\|/);
});

test('un activado con salida NO cierra el servicio: queda arribado y asignado', () => {
  const fn = sql.split('$function$')[1];
  assert.ok(fn, 'falta el cuerpo de la v3');
  // Arribado es literalmente lo que pasó: el chofer llegó y no se prestó.
  assert.match(fn, /set status\s+= 'at_origin'/);
  // El trigger exige esta transición para assigned → at_origin.
  assert.match(fn, /set_config\('app\.lifecycle_transition', 'manual_arrival', true\)/);
  const rama = fn.split('if v_hubo_salida then')[1].split('\n  else\n')[0];
  // El viaje existió: esos km son de ese chofer y ese móvil, no se liberan.
  assert.doesNotMatch(rama, /assigned_driver_id\s+= null/);
  assert.doesNotMatch(rama, /cancelled_at/);
  assert.doesNotMatch(rama, /billing_status/);
});

test('"lo dimos de baja nosotros" no es una salida y sigue cerrando el servicio', () => {
  const fn = sql.split('$function$')[1];
  assert.match(fn, /v_hubo_salida := v_reason_code in \('absent_or_not_towable','provider','other'\)/);
  const rama = fn.split('if v_hubo_salida then')[1].split('\n  else\n')[1];
  assert.match(rama, /set status\s+= 'cancelled'/);
  assert.match(rama, /assigned_driver_id\s+= null/);
  assert.match(rama, /'app\.lifecycle_transition', 'annul'/);
  // Sigue estando en la pantalla del chofer: no tiene otro lado dónde reportarlo.
  assert.match(bridge, /'us','Lo dimos de baja nosotros'/);
});

test('ya no hay decisión de cobro: activado significa que se cobra', () => {
  assert.match(sql, /drop function if exists public\.decide_activated_service_billing_v1/);
  for (const col of ['activation_billing', 'activation_decided_by', 'activation_decided_at']) {
    assert.match(sql, new RegExp(`drop column if exists ${col}`), `falta borrar ${col}`);
  }
  // Y la UI que la ofrecía se fue con ella.
  assert.doesNotMatch(services, /activation-billing|activationUndecided|canDecideActivation/);
  assert.doesNotMatch(lifecycle, /openActivationBilling|definirCobroActivado/);
});

test('Facturación vuelve a la regla simple: lo que se prestó', () => {
  // Un activado finalizado es 'completed' como cualquier otro, así que la
  // excepción del filtro sobra.
  assert.match(sql, /v_simple text := 's\.status=''completed'' and s\.billing_status in \(''pending'',''reviewed''\)'/);
  assert.match(sql, /and s\.status = ''completed''/);
  assert.match(sql, /<> 3 then/);
});

test('el listado de activados no puede exigir que estén cancelados', () => {
  assert.match(sql, /'where s\.status=''cancelled'' and s\.driver_activated',\s*\n\s*'where s\.driver_activated'/);
});

test('el chofer informa un hecho: el vocabulario dejó de decir "cancelado"', () => {
  for (const code of ['absent_or_not_towable', 'provider', 'us', 'other']) {
    assert.match(bridge, new RegExp(`'${code}'`), `se perdió el código ${code}`);
  }
  assert.match(bridge, /<legend>Motivo de la activación<\/legend>/);
  assert.doesNotMatch(bridge, /<legend>Motivo de cancelación<\/legend>/);
  assert.doesNotMatch(bridge, /'Cancelado por Prestadora'/);
  // Y la v3 también, del lado del servidor.
  assert.match(sql, /'Seleccioná un motivo de la activación válido'/);
});
