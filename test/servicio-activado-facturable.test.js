const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sql = read('migrations/20260920130000_servicio_activado_facturable_v1.sql');
const sqlFact = read('migrations/20260920140000_facturacion_solo_prestados_y_activados_v1.sql');
const services = read('operator-services.js');
const lifecycle = read('operator-service-lifecycle.js');
const bridge = read('operator-service-bridge.js');

test('ACTIVADO se guarda como hecho, no se adivina de un texto libre', () => {
  assert.match(sql, /add column if not exists driver_activated\s+boolean not null default false/);
  assert.match(sql, /add column if not exists activation_billing/);
  // El listado filtraba con `cancellation_reason ilike 'ACTIVADO%'`: cambiar esa
  // redacción vaciaba la pestaña sin que nada fallara.
  assert.match(sql, /s\.cancellation_reason ilike ''ACTIVADO%''/);
  assert.match(sql, /where s\.status=''cancelled'' and s\.driver_activated/);
  // El front usa la columna y deja el regex sólo de respaldo.
  assert.match(services, /s\?\.driver_activated===true\|\|/);
});

test('el cobro es una decisión aparte, y el chofer no la toma', () => {
  assert.match(sql, /activation_billing = any \(array\['sin_definir','facturable','no_facturable'\]\)/);
  const fn = sql.split('create or replace function public.decide_activated_service_billing_v1')[1];
  assert.ok(fn, 'falta la RPC de decisión');
  // Operaciones TAMBIÉN, no sólo Facturación.
  assert.match(fn, /not in \('administracion', 'operador', 'facturacion'\)/);
  assert.doesNotMatch(fn, /'chofer'/);
  assert.match(fn, /if not v_row\.driver_activated then/);
  assert.match(fn, /billing_status\s+= case when p_billable then 'pending' else 'excluded' end/);
  // Una decisión sobre algo ya facturado sería reescribir una factura emitida.
  assert.match(fn, /if v_row\.billing_status = 'invoiced' then/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
});

test('la decisión se toma desde la fila, sin entrar al servicio', () => {
  assert.match(services, /accionMenuServicio\('activation-billing'/);
  assert.match(services, /const activationUndecided=/);
  assert.match(services, /const canDecideActivation=\(\)=>\['administracion','operador','facturacion'\]/);
  assert.match(services, /window\.definirCobroActivado\?\.\(id\)/);
  assert.match(lifecycle, /function openActivationBilling\(id,readOnly=false\)/);
  assert.match(lifecycle, /decide_activated_service_billing_v1/);
  assert.match(lifecycle, /definirCobroActivado:openActivationBilling/);
  // Confirma con la misma tilde que el resto de las acciones con consecuencias.
  assert.match(lifecycle, /window\.operationFeedback==='function'/);
});

test('Facturación cuenta lo prestado más los activados que se cobran', () => {
  // Las tres apariciones del filtro de la mesa tienen que moverse juntas: si
  // una quedara vieja, el desplegable ofrecería prestadoras sin filas.
  assert.match(sqlFact, /<> 3 then/);
  assert.match(sqlFact, /\(s\.status=''completed'' or \(s\.driver_activated and s\.activation_billing=''facturable''\)\)/);
  // El panel contaba TODO lo no cancelado, incluidos servicios en curso.
  assert.match(sqlFact, /and s\.status <> ''cancelled''/);
  assert.match(sqlFact, /and \(s\.status = ''completed'' or \(s\.driver_activated and s\.activation_billing = ''facturable''\)\)/);
});

test('el chofer informa un hecho: el vocabulario dejó de decir "cancelado"', () => {
  for (const code of ['absent_or_not_towable', 'provider', 'us', 'other']) {
    assert.match(bridge, new RegExp(`'${code}'`), `se perdió el código ${code}`);
  }
  assert.match(bridge, /<legend>Motivo de la activación<\/legend>/);
  assert.doesNotMatch(bridge, /<legend>Motivo de cancelación<\/legend>/);
  assert.doesNotMatch(bridge, /'Cancelado por Prestadora'/);
  assert.doesNotMatch(bridge, /'Cancelado por nosotros'/);
  // Y avisa que la plata se decide después.
  assert.match(bridge, /van a definir después si la salida se cobra/);
});
