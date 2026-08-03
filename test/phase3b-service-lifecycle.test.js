const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('fase 3B conserva asignaciones y registra cierres operativos estructurados', () => {
  const sql = read('migrations/20260803213000_phase3b_service_lifecycle_and_qa.sql');

  assert.match(sql, /create table if not exists public\.operator_service_assignments/i);
  assert.match(sql, /operator_service_assignments_one_active_idx/i);
  assert.match(sql, /create table if not exists public\.operator_service_closures/i);
  assert.match(sql, /activated_origin/i);
  assert.match(sql, /activated_movement/i);
  assert.match(sql, /activated_km/i);
  assert.match(sql, /truck_failure/i);
  assert.match(sql, /create or replace function public\.reassign_operator_service/i);
  assert.match(sql, /create or replace function public\.close_operator_service_exception/i);
  assert.match(sql, /create or replace function public\.review_operator_service_closure/i);
  assert.match(sql, /EVIDENCIA_REQUERIDA/i);
  assert.match(sql, /operator_services_company_order_unique_idx/i);
});

test('la nueva alta preserva cotización y creación existentes con una UI operativa completa', () => {
  const js = read('operator-service-creation-redesign.js');
  const css = read('operator-service-creation-redesign.css');

  assert.match(js, /window\.OperatorServices/);
  assert.match(js, /original\.create/);
  assert.match(js, /original\.quote/);
  assert.match(js, /Crear sin asignar/);
  assert.match(js, /Crear y asignar/);
  assert.match(js, /Código AuxiliOS/);
  assert.match(js, /Entorno de prueba/);
  assert.match(js, /KM asfalto/);
  assert.match(js, /KM ripio/);
  assert.doesNotMatch(js, /Arribo real|Fin real|Demora real/);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /position:\s*sticky/i);
  assert.match(css, /@media/);
});

test('el chofer describe lo ocurrido y el sistema resuelve la clasificación administrativa', () => {
  const js = read('operator-service-lifecycle.js');
  const css = read('operator-service-lifecycle.css');

  assert.match(js, /No se pudo completar/);
  assert.match(js, /Antes de salir/);
  assert.match(js, /Camino al origen/);
  assert.match(js, /En el origen/);
  assert.match(js, /Falla del camión/);
  assert.match(js, /close_operator_service_exception/);
  assert.match(js, /reassign_operator_service/);
  assert.match(js, /review_operator_service_closure/);
  assert.match(js, /reportarIncidenteServicio/);
  assert.match(css, /p3b-assignment-timeline/);
  assert.match(css, /p3b-closure-summary/);
});

test('los recursos QA quedan marcados y el tarifario se publica después de cargar sus conceptos', () => {
  const core = read('migrations/20260803213100_phase3b_qa_core.sql');
  const tariff = read('migrations/20260803213200_phase3b_qa_tariff.sql');

  assert.match(core, /Chofer de Prueba/);
  assert.match(core, /QA-01/);
  assert.match(core, /Prestadora QA/);
  assert.match(core, /is_test/i);
  assert.match(core, /'draft'/i);
  assert.match(tariff, /Liviano QA/);
  assert.match(tariff, /Extracción QA/);
  assert.match(tariff, /Cancelación QA/);
  assert.match(tariff, /set status = 'active'/i);
});

test('fase 3B se carga en el arranque, CI y caché PWA', () => {
  const config = read('config.js');
  const pkg = read('package.json');
  const sw = read('sw.js');

  assert.match(config, /operator-service-creation-redesign\.js/);
  assert.match(config, /operator-service-lifecycle\.js/);
  assert.match(pkg, /node --check operator-service-creation-redesign\.js/);
  assert.match(pkg, /node --check operator-service-lifecycle\.js/);
  assert.match(sw, /auxilios-v113/);
  assert.match(sw, /operator-service-creation-redesign\.css/);
  assert.match(sw, /operator-service-lifecycle\.css/);
});
