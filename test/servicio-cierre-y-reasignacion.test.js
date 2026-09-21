const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const lifecycle = read('operator-service-lifecycle.js');
const css = read('operator-service-lifecycle.css');
const services = read('operator-services.js');
const sql = read('migrations/20260921020000_reasignar_chofer_en_arribado_v1.sql');

test('el cierre muestra qué se está cerrando, no sólo el número', () => {
  const fn = lifecycle.split('function resumenCierre(s)')[1].split('async function openFinalize')[0];
  for (const campo of ['Prestadora', 'Base', 'Tipo', 'Cliente', 'Vehículo', 'Origen', 'Destino', 'Chofer', 'Móvil', 'Kilómetros']) {
    assert.match(fn, new RegExp(`'${campo}'`), `el resumen no muestra ${campo}`);
  }
  assert.match(lifecycle, /resumenCierre\(s\)/);
  assert.match(css, /\.osl-resumen\{/);
});

test('finalizar sin arribo da el campo, no sólo el reto', () => {
  const fn = lifecycle.split('async function openFinalize')[1].split('function openAnnul')[0];
  // El backend exige operator_notes para cerrar sin arribo. Antes el modal lo
  // avisaba y no daba dónde escribirlo: callejón sin salida.
  assert.match(fn, /osl-finalize-notes/);
  assert.match(fn, /update_operator_service_v4/);
  assert.match(fn, /operator_notes:txt/);
  // Y se guardan ANTES de finalizar, si no la RPC rebota igual.
  assert.ok(fn.indexOf('update_operator_service_v4') < fn.indexOf("transition('finalize')"));
});

test('un activado avisa que se factura completo antes de cerrarlo', () => {
  const fn = lifecycle.split('async function openFinalize')[1].split('function openAnnul')[0];
  assert.match(fn, /s\.driver_activated===true/);
  assert.match(fn, /revisá los kilómetros/);
});

test('el operador puede reasignar el Chofer de un servicio arribado, con aviso', () => {
  assert.match(services, /\['pending','assigned','at_origin'\]\.includes\(s\.status\)\)actions\+=/);
  const fn = lifecycle.split('function openAssignment')[1].split('function openActivation')[0];
  assert.match(fn, /\['pending','assigned','at_origin'\]\.includes\(status\)/);
  assert.match(fn, /El servicio ya está arribado/);
  assert.match(fn, /se le imputan los kilómetros/);
  // Backend: acepta arribado y NO lo manda para atrás.
  assert.match(sql, /''pending'',''assigned'',''at_origin''/);
  assert.match(sql, /status=case when s\.status=''at_origin'' then ''at_origin'' else ''assigned'' end/);
});
