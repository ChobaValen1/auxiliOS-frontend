const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sigma = read('sigma.js');
const supabase = read('supabase.js');
const sw = read('sw.js');
const migration = read('migrations/20260908193000_fuel_capture_and_odometer_epochs_hotfix.sql');

test('combustible usa la jornada del mismo camion y guarda mediante RPC', () => {
  assert.match(sigma, /\.find\(j =>[\s\S]*j\?\.truck_id[\s\S]*_truckActual\?\.truck_id/);
  assert.match(supabase, /rpc\('create_driver_fuel_record_v1'/);
  assert.doesNotMatch(supabase, /from\('fuel_records'\)\.insert\(datos\)/);
  assert.match(migration, /driver_id = v_driver/);
  assert.match(migration, /truck_id = v_truck_id/);
});

test('la RPC de combustible valida jornada, importes, pago e idempotencia', () => {
  assert.match(migration, /create_driver_fuel_record_v1/);
  assert.match(migration, /v_liters is null or v_liters <= 0/);
  assert.match(migration, /v_price is null or v_price <= 0/);
  assert.match(migration, /v_payment not in/);
  assert.match(migration, /already_saved/);
  assert.match(migration, /created_at_device = v_created_at_device/);
  assert.match(sigma, /diferenciaDias <= 7/);
  assert.match(sigma, /created_at_device: new Date\(\)\.toISOString\(\)/);
});

test('un cambio administrativo inicia un ciclo nuevo de odometro', () => {
  assert.match(sigma, /rpc\('admin_update_truck_v2'/);
  assert.match(migration, /odometer_epoch_started_at/);
  assert.match(migration, /odometer_epoch_base_km/);
  assert.match(migration, /v_km is distinct from v_before\.current_km/);
});

test('el recalculo ignora lecturas anteriores al ciclo vigente', () => {
  assert.match(migration, /coalesce\(updated_at, closed_at, created_at\) >= v_epoch_started_at/);
  assert.match(migration, /created_at >= v_epoch_started_at/);
  assert.match(migration, /coalesce\(v_epoch_base_km, 0\)/);
});

test('las RPC no quedan expuestas a anon y se renueva el cache', () => {
  assert.match(migration, /revoke all on function public\.admin_update_truck_v2\(integer, jsonb\) from public, anon/);
  assert.match(migration, /revoke all on function public\.create_driver_fuel_record_v1\(jsonb\) from public, anon/);
  assert.match(sw, /auxilios-billing-phase2-v265/);
});
