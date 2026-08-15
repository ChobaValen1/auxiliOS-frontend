const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));

test('geographic bases preload from the canonical bootstrap without an UX overlay', () => {
  const config = read('config.js');
  assert.match(config, /await window\.cargarBasesGeograficas\?\.\(\)/);
  assert.doesNotMatch(config, /daily-operations-experience-v1\.js/);
  assert.equal(exists('daily-operations-experience-v1.js'), false);
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

test('bulk tariff editing belongs to the canonical tariffs module', () => {
  const source = read('company-tariffs-v4.js');
  const config = read('config.js');
  assert.match(source, /dirtyKeys/);
  assert.match(source, /Actualizar \(\$\{count\}\)/);
  assert.match(source, /bulk_save_company_service_prices_v1/);
  assert.equal(exists('company-tariffs-bulk-v1.js'), false);
  assert.doesNotMatch(config, /company-tariffs-bulk-v1/);
});

test('superseded Services beta modules are absent', () => {
  for (const file of [
    'operator-console-v2.js',
    'operator-console-v2.css',
    'operator-service-workspace-v2.js',
    'operator-service-workspace-review-v3.js',
    'operator-service-workspace-review-v3.css'
  ]) assert.equal(exists(file), false, `${file} should not exist`);
  assert.equal(exists('operator-service-workspace-v2.css'), true, 'base workspace CSS is still used by the canonical renderer');
});

test('unreachable fleet patch stack is removed from repository and PWA cache', () => {
  const sw = read('sw.js');
  for (const file of [
    'fleet-admin-detail-v2.js',
    'fleet-admin-detail-v2.css',
    'fleet-fuel-crud-v1.js',
    'fleet-fuel-crud-v1.css',
    'fleet-fuel-crud-contrast-fix.css',
    'fleet-fuel-closed-edit-fix.js',
    'fleet-fuel-closed-edit-fix.css',
    'fleet-fuel-modal-state-fix.js'
  ]) {
    assert.equal(exists(file), false, `${file} should not exist`);
    assert.doesNotMatch(sw, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const version=Number(sw.match(/auxilios-v(\d+)/)?.[1]||0);
  assert.ok(version>=185,`Expected cache version 185 or newer, received ${version}`);
});

test('bulk price migration reuses the canonical individual save function', () => {
  const sql = read('migrations/20260815103500_bulk_company_service_prices_v1.sql');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.bulk_save_company_service_prices_v1/);
  assert.match(sql, /public\.save_company_service_price_v1/);
  assert.match(sql, /v_count > 500/);
});
