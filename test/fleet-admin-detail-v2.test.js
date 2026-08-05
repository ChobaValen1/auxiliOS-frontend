const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('fleet-admin-detail-v2.js', 'utf8');
const styles = fs.readFileSync('fleet-admin-detail-v2.css', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('fleet detail keeps Jornadas global and adds contextual vehicle usage', () => {
  assert.match(source, /\['jornadas', 'Jornadas y uso'\]/);
  assert.match(source, /goTo\('jornadas-admin'\)/);
  assert.match(source, /\.eq\('truck_id', truckId\)/);
  assert.match(source, /\.from\('daily_logs'\)/);
  assert.match(source, /\.limit\(50\)/);
});

test('fleet detail organizes the vehicle into operational tabs', () => {
  for (const label of ['Resumen', 'Mantenimiento', 'Combustible', 'Neumáticos y frenos', 'Historial']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /__fleetDetailV2Wrapped/);
  assert.match(source, /state\.summaryHtml = container\.innerHTML/);
  assert.match(styles, /\.fadv-tabs/);
  assert.match(styles, /\.fadv-table-wrap/);
});

test('fleet detail reuses production maintenance, fuel and tire actions', () => {
  assert.match(source, /openPlanModal\(\)/);
  assert.match(source, /openServiceModal\(\)/);
  assert.match(source, /openFuelModal\(\)/);
  assert.match(source, /openNeumaticosModal\(\)/);
  assert.match(source, /_abrirSubCamion\('camion-sub-planes'\)/);
});

test('fleet detail assets load through feature flags and PWA cache', () => {
  assert.match(flags, /fleet-admin-detail-v2\.css/);
  assert.match(flags, /fleet-admin-detail-v2\.js/);
  assert.match(sw, /auxilios-v126/);
  assert.match(sw, /'\/fleet-admin-detail-v2\.css'/);
  assert.match(sw, /'\/fleet-admin-detail-v2\.js'/);
});
