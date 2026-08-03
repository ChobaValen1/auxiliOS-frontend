const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('iniciar viaje verifica una jornada abierta para el móvil asignado', () => {
  const js = read('phase3-journey-start-guard.js');

  assert.match(js, /window\.avanzarServicioAsignado/);
  assert.match(js, /assigned_truck_id/);
  assert.match(js, /from\('daily_logs'\)/);
  assert.match(js, /\.eq\('driver_id'/);
  assert.match(js, /\.eq\('truck_id', service\.assigned_truck_id\)/);
  assert.match(js, /\.eq\('status', 'open'\)/);
  assert.match(js, /\.is\('hora_fin', null\)/);
});

test('si falta la jornada abre el flujo existente y luego inicia el viaje automáticamente', () => {
  const js = read('phase3-journey-start-guard.js');

  assert.match(js, /abrirModalNuevaJornada/);
  assert.match(js, /confirmarNuevaJornada/);
  assert.match(js, /STATE\.pending/);
  assert.match(js, /Jornada iniciada\. Iniciando el viaje/);
  assert.match(js, /STATE\.originalAdvance\(pending\.serviceId, pending\.toStatus\)/);
  assert.match(js, /loadAssignedTruck/);
  assert.match(js, /_camionActual = truck/);
});

test('el guard se carga después del puente y queda incluido en CI y PWA', () => {
  const config = read('config.js');
  const pkg = read('package.json');
  const sw = read('sw.js');

  const bridgeIndex = config.indexOf('/operator-service-bridge.js');
  const guardIndex = config.indexOf('/phase3-journey-start-guard.js');
  assert.ok(bridgeIndex >= 0 && guardIndex > bridgeIndex);
  assert.match(pkg, /node --check phase3-journey-start-guard\.js/);
  assert.match(sw, /auxilios-v\d+/);
  assert.match(sw, /phase3-journey-start-guard\.js/);
});
