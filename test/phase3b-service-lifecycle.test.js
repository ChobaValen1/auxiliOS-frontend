const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const readPhase3bSql = () => fs.readdirSync(path.join(root, 'migrations'))
  .filter(name => /^20260803213\d+_phase3b_.*\.sql$/.test(name))
  .sort()
  .map(name => read(path.join('migrations', name)))
  .join('\n');

test('fase 3B conserva asignaciones y registra cierres operativos estructurados', () => {
  const sql = readPhase3bSql();

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

test('Nuevo Servicio ya no depende del renderer visual de fase 3B', () => {
  const config = read('config.js');
  const sw = read('sw.js');
  const workspace = read('operator-service-workspace-v2.css');

  assert.equal(fs.existsSync(path.join(root, 'operator-service-creation-redesign.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'operator-service-creation-redesign.css')), false);
  assert.doesNotMatch(config, /operator-service-creation-redesign/);
  assert.doesNotMatch(sw, /operator-service-creation-redesign/);
  assert.match(workspace, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
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

test('fase 3B conserva solo lifecycle operativo, no una segunda alta de servicio', () => {
  const config = read('config.js');
  const pkg = read('package.json');
  const sw = read('sw.js');
  const guard = read('phase3b-modal-visibility-guard.js');

  assert.match(config, /phase3b-modal-visibility-guard\.js/);
  assert.match(config, /operator-service-lifecycle\.js/);
  assert.doesNotMatch(config, /operator-service-creation-redesign\.js/);
  assert.match(pkg, /node --check operator-service-lifecycle\.js/);
  assert.doesNotMatch(pkg, /operator-service-creation-redesign\.js/);
  assert.match(sw, /auxilios-v1\d{2,}/);
  assert.match(sw, /phase3b-modal-visibility-guard\.js/);
  assert.match(sw, /operator-service-lifecycle\.css/);
  assert.doesNotMatch(sw, /operator-service-creation-redesign/);
  assert.match(guard, /p3b-modal-backdrop\[hidden\]/);
  assert.match(guard, /display:\s*none\s*!important/);
});
