const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const supabase = fs.readFileSync('supabase.js', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');
const migration = fs.readFileSync('migrations/20260908204500_driver_truck_open_journey_availability_hotfix.sql', 'utf8');

test('los dos selectores consumen una disponibilidad canonica por RPC', () => {
  assert.match(supabase, /rpc\('get_driver_truck_availability_v1'\)/);
  assert.match(supabase, /camiones\.filter\(c => c\.has_open_journey\)/);
  assert.match(sigma, /await cargarDisponibilidadCamiones\(\)/);
  assert.match(sigma, /camiones\.filter\(c => c\.has_open_journey\)/);
});

test('una jornada abierta bloquea el camion sin filtro por fecha', () => {
  assert.match(migration, /dl\.status = 'open'/);
  assert.doesNotMatch(migration, /log_date\s*=/);
  assert.match(migration, /has_open_journey/);
  assert.match(sigma, /camionActualDisponible\?\.has_open_journey/);
});

test('el backend conserva exclusividad y la RPC no se expone a anon', () => {
  const hardening = fs.readFileSync('migrations/2026-07-31_daily_logs_rls_hardening.sql', 'utf8');
  assert.match(hardening, /uq_daily_logs_one_open_per_truck/);
  assert.match(hardening, /where status = 'open' and truck_id is not null/);
  assert.match(migration, /revoke all on function public\.get_driver_truck_availability_v1\(\) from public, anon/);
});
