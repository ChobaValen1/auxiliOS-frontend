const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('daily operations module preloads geographic bases and makes services table responsive', () => {
  const source = read('daily-operations-experience-v1.js');
  assert.match(source, /loadBases\(true\)/);
  assert.match(source, /cargarBasesGeograficas/);
  assert.match(source, /\.os-table\{width:100%!important;min-width:0!important;table-layout:fixed!important\}/);
  assert.doesNotMatch(source, /min-width:1740px/);
});

test('new service creation returns to the services table instead of keeping view mode open', () => {
  const source = read('daily-operations-experience-v1.js');
  assert.match(source, /wasCreate = wizard\?\.mode === 'create'/);
  assert.match(source, /current\?\.mode === 'view'/);
  assert.match(source, /cerrarNuevoServicio\?\.\(true\)/);
  assert.match(source, /highlightService\(createdId\)/);
});

test('company status changes invalidate active company references used by Services', () => {
  const source = read('daily-operations-experience-v1.js');
  assert.match(source, /operator\.S\.referencesLoaded = false/);
  assert.match(source, /await operator\.loadReferences\(\)/);
  assert.match(source, /operator\.S\.company = 'all'/);
});

test('bulk tariff editor tracks changed cells and saves them through one atomic RPC', () => {
  const source = read('company-tariffs-bulk-v1.js');
  assert.match(source, /dirtyKeys\.size/);
  assert.match(source, /Actualizar \(\$\{count\}\)/);
  assert.match(source, /bulk_save_company_service_prices_v1/);
  assert.match(source, /prices = conceptIds\.map/);
});

test('bulk price migration reuses the canonical individual save function inside one function call', () => {
  const sql = read('migrations/20260815103500_bulk_company_service_prices_v1.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.bulk_save_company_service_prices_v1/);
  assert.match(sql, /public\.save_company_service_price_v1/);
  assert.match(sql, /v_count > 500/);
});

test('config loads both daily UX modules', () => {
  const config = read('config.js');
  assert.match(config, /company-tariffs-bulk-v1\.js/);
  assert.match(config, /daily-operations-experience-v1\.js/);
});
