const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('fleet-fuel-crud-v1.js', 'utf8');
const styles = fs.readFileSync('fleet-fuel-crud-v1.css', 'utf8');
const migration = fs.readFileSync('migrations/20260805163500_fleet_fuel_crud_v1.sql', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('fuel CRUD uses protected RPCs and preserves logical deletion', () => {
  assert.match(migration, /status text not null default 'active'/);
  assert.match(migration, /check \(status in \('active', 'voided'\)\)/);
  assert.match(migration, /create or replace function public\.update_fuel_record/);
  assert.match(migration, /create or replace function public\.void_fuel_record/);
  assert.match(migration, /create or replace function public\.restore_fuel_record/);
  assert.match(migration, /revoke update, delete on public\.fuel_records from authenticated/);
  assert.doesNotMatch(source, /\.from\('fuel_records'\)\.delete/);
});

test('fuel mutations require Administration and a business reason', () => {
  assert.match(migration, /v_role <> 'administracion'/);
  assert.match(migration, /char_length\(v_reason\) < 5/);
  assert.match(source, /minlength="5"/);
  assert.match(source, /p_reason: reason/);
  assert.match(source, /const isAdmin = \(\) => role\(\) === 'administracion'/);
  assert.match(source, /Vista de solo lectura para Supervisión/);
});

test('voided fuel is excluded from operational totals and approved renditions are observed', () => {
  assert.match(migration, /fr\.status = 'active'/);
  assert.match(migration, /admin_status = 'observada'/);
  assert.match(migration, /and admin_status = 'aprobada'/);
  assert.match(source, /record\.status !== 'voided'/);
  assert.match(source, /Las anuladas no integran los totales/);
  assert.match(source, /rendicion_observed/);
});

test('fleet fuel workspace exposes edit, void, restore, history and refresh', () => {
  for (const rpc of [
    'list_fuel_records_for_truck',
    'update_fuel_record',
    'void_fuel_record',
    'restore_fuel_record',
    'get_fuel_record_history',
  ]) {
    assert.match(source, new RegExp(rpc));
  }
  for (const label of ['Editar', 'Anular', 'Restaurar', 'Historial', 'Incluir cargas anuladas']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(styles, /\.ffcrud-modal-backdrop/);
  assert.match(styles, /\.ffcrud-table/);
});

test('fuel CRUD assets are loaded and cached in PWA v127 or later', () => {
  assert.match(flags, /fleet-fuel-crud-v1\.css/);
  assert.match(flags, /fleet-fuel-crud-v1\.js/);
  assert.match(sw, /auxilios-v(?:12[7-9]|1[3-9]\d|[2-9]\d{2,})/);
  assert.match(sw, /'\/fleet-fuel-crud-v1\.css'/);
  assert.match(sw, /'\/fleet-fuel-crud-v1\.js'/);
});
