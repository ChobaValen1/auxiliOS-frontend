const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const flow = read('tariff-new-rate-flow-v1.js');
const config = read('config.js');

test('Nueva tarifa permite elegir prestadora y base dentro del flujo', () => {
  assert.match(flow, /¿Dónde aplica esta tarifa\?/);
  assert.match(flow, /Prestadora \*/);
  assert.match(flow, /Base \*/);
  assert.match(flow, /get_company_configuration_v2/);
  assert.match(flow, /TariffMatrixV3\.loadMatrix|api\.loadMatrix/);
});

test('el flujo mantiene permisos y no saltea la configuración comercial', () => {
  assert.match(flow, /role\(\)==='administracion'/);
  assert.match(flow, /no tiene una base activa vinculada/);
  assert.match(flow, /no tiene categorías o conceptos habilitados/);
  assert.doesNotMatch(flow, /save_company_tariff_rate_v3/);
});

test('config carga el fix después del Tarifario V3', () => {
  const matrixIndex = config.indexOf("/tariff-matrix-v3.js");
  const flowIndex = config.indexOf("/tariff-new-rate-flow-v1.js");
  assert.ok(matrixIndex >= 0);
  assert.ok(flowIndex > matrixIndex);
});
