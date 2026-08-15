const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('geographic bases preload from the canonical bootstrap without an UX overlay', () => {
  const config = read('config.js');
  assert.match(config, /await window\.cargarBasesGeograficas\?\.\(\)/);
  assert.doesNotMatch(config, /daily-operations-experience-v1\.js/);
});

test('services table is responsive in the canonical stylesheet', () => {
  const css = read('operator-services.css');
  assert.match(css, /\.os-table\{width:100%;min-width:0;/);
  assert.doesNotMatch(css, /min-width:1740px/);
  assert.match(css, /\.os-table th\.col-origin,\.os-table th\.col-destination\{width:13%\}/);
});

test('creating a service returns to the table while edits may reopen view mode', () => {
  const source = read('operator-service-wizard.js');
  assert.match(source, /const wasEdit=w\.mode==='edit'/);
  assert.match(source, /if\(wasEdit&&id\)await openView\(id\)/);
  assert.doesNotMatch(source, /await loadServices\(\);if\(id\)await openView\(id\)/);
});

test('Services refreshes active provider references on every load', () => {
  const source = read('operator-services.js');
  assert.match(source, /Promise\.all\(\[loadReferences\(\),/);
  assert.match(source, /S\.company!=='all'&&!S\.companies\.some/);
});

test('bulk tariff editor remains an active feature and saves one atomic batch', () => {
  const source = read('company-tariffs-bulk-v1.js');
  assert.match(source, /dirtyKeys\.size/);
  assert.match(source, /Actualizar \(\$\{count\}\)/);
  assert.match(source, /bulk_save_company_service_prices_v1/);
});

test('bulk price migration reuses the canonical individual save function', () => {
  const sql = read('migrations/20260815103500_bulk_company_service_prices_v1.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.bulk_save_company_service_prices_v1/);
  assert.match(sql, /public\.save_company_service_price_v1/);
  assert.match(sql, /v_count > 500/);
});
