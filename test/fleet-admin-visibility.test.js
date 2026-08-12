const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('fleet-operational-status-v1.js', 'utf8');
const navigation = fs.readFileSync('configuration-center.js', 'utf8');

test('Flota remains available to management from canonical Configuration', () => {
  assert.match(navigation, /MANAGEMENT_ROLES = new Set\(\['administracion', 'supervision'\]\)/);
  assert.match(navigation, /moveTo\(operation, document\.getElementById\('nav-camion'\)\)/);
  assert.doesNotMatch(source, /insertBefore/);
});

test('Flota uses a fleet-specific screen title', () => {
  assert.match(source, /title: 'FLOTA'/);
  assert.match(source, /Disponibilidad, uso y mantenimiento de móviles/);
});

test('Fleet status combines truck shift maintenance and active service state', () => {
  assert.match(source, /list_operator_services/);
  assert.match(source, /assigned_truck_id/);
  assert.match(source, /NON_OPERATIONAL_TRUCK_STATUSES/);
  assert.match(source, /No apto · service vencido/);
  assert.match(source, /Disponible/);
  assert.match(source, /Sin jornada/);
  assert.match(source, /SERVICE_STATUS_LABELS/);
});

test('Fleet operational status has no sidenav ownership', () => {
  assert.doesNotMatch(source, /sidenav/);
  assert.doesNotMatch(source, /nav-dashboard/);
  assert.doesNotMatch(source, /nav-jornadas-admin/);
  assert.doesNotMatch(source, /MutationObserver/);
});
