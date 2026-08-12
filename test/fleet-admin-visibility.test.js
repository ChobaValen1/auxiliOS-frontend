const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('fleet-operational-status-v1.js', 'utf8');
const navigation = fs.readFileSync('configuration-center.js', 'utf8');

test('Camión remains available to management in the canonical daily navigation', () => {
  assert.match(navigation, /MANAGEMENT_ROLES = new Set\(\['administracion', 'supervision'\]\)/);
  assert.match(navigation, /ensureNavNode\('nav-camion', 'camion', '🚛', 'Camión', false\)/);
  assert.match(navigation, /orderTop\(\[dashboard, canUseManagementTools\(\) \? operations : null, jornadas, camion, remitos, configuration, tariffs, history\]\)/);
  assert.doesNotMatch(source, /insertBefore/);
});

test('fleet status does not rename the canonical Camión screen', () => {
  assert.doesNotMatch(source, /title: 'FLOTA'/);
  assert.doesNotMatch(source, /SCREENS\.camion\s*=/);
});

test('Camión status combines truck shift maintenance and active service state', () => {
  assert.match(source, /list_operator_services/);
  assert.match(source, /assigned_truck_id/);
  assert.match(source, /NON_OPERATIONAL_TRUCK_STATUSES/);
  assert.match(source, /No apto · service vencido/);
  assert.match(source, /Disponible/);
  assert.match(source, /Sin jornada/);
  assert.match(source, /SERVICE_STATUS_LABELS/);
});

test('Camión operational status has no sidenav ownership', () => {
  assert.doesNotMatch(source, /sidenav/);
  assert.doesNotMatch(source, /nav-dashboard/);
  assert.doesNotMatch(source, /nav-jornadas-admin/);
  assert.doesNotMatch(source, /MutationObserver/);
});