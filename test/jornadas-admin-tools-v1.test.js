const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const js = read('jornadas-admin-tools-v1.js');
const css = read('jornadas-admin-tools-v1.css');
const config = read('config.js');
const sw = read('sw.js');
const migration = read('migrations/20260808115500_admin_journey_corrections_v1.sql');
const pkg = read('package.json');

test('Administración puede corregir kilometraje y horarios con motivo obligatorio', () => {
  assert.match(js, /update_daily_log_admin/);
  assert.match(js, /km_inicio/);
  assert.match(js, /km_final/);
  assert.match(js, /hora_inicio/);
  assert.match(js, /hora_fin/);
  assert.match(js, /Motivo de la corrección/);
  assert.match(migration, /JORNADA_MOTIVO_REQUERIDO/);
  assert.match(migration, /manual_editado/);
});

test('Eliminar jornada es anulación lógica y no borrado físico', () => {
  assert.match(js, /void_daily_log_admin/);
  assert.match(migration, /status='voided'/);
  assert.match(migration, /voided_at/);
  assert.match(migration, /void_reason/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.daily_logs/i);
  assert.match(migration, /status<>'voided'/);
});

test('una jornada anulada permite recrear la combinación chofer fecha móvil', () => {
  assert.match(migration, /daily_logs_driver_truck_date_active_uidx/);
  assert.match(migration, /where status <> 'voided'/i);
});

test('los vínculos de Jornada abren el registro asociado', () => {
  assert.match(js, /openRemito/);
  assert.match(js, /verRemito/);
  assert.match(js, /fuelViewer/);
  assert.match(js, /checklistViewer/);
  assert.match(js, /renditionViewer/);
  assert.match(js, /FleetAdminDetailV2\.openTab/);
  assert.match(js, /Abrir módulo Rendiciones/);
});

test('las acciones de mutación quedan limitadas a Administración', () => {
  assert.match(js, /const isAdmin = \(\) => role\(\) === 'administracion'/);
  assert.match(migration, /v_role<>'administracion'/);
});

test('el módulo se carga, se precachea y entra en CI', () => {
  assert.match(config, /jornadas-admin-tools-v1\.css/);
  assert.match(config, /jornadas-admin-tools-v1\.js/);
  assert.match(sw, /jornadas-admin-tools-v1\.css/);
  assert.match(sw, /jornadas-admin-tools-v1\.js/);
  assert.match(pkg, /node --check jornadas-admin-tools-v1\.js/);
  const version = sw.match(/auxilios-v(\d+)/);
  assert.ok(version && Number(version[1]) >= 144);
  assert.match(css, /\.jat-clickable/);
});
