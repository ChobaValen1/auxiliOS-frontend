const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('frequent-navigation.js', 'utf8');

test('Flota is visible for management roles and ordered before Jornadas', () => {
  assert.match(source, /#nav-camion\.aux-frequent-direct/);
  assert.match(source, /setNavContent\('nav-camion', '🚛', 'Flota'\)/);
  assert.match(source, /services,\s*fleet,\s*journeys,/s);
  assert.match(source, /\[fleet, journeys, documents, remitos, grid\]/);
});

test('Flota uses a fleet-specific screen title', () => {
  assert.match(source, /title: 'FLOTA'/);
  assert.match(source, /Disponibilidad, uso y mantenimiento de móviles/);
});

test('Fleet status combines truck, shift, maintenance and active service state', () => {
  assert.match(source, /list_operator_services/);
  assert.match(source, /assigned_truck_id/);
  assert.match(source, /NON_OPERATIONAL_TRUCK_STATUSES/);
  assert.match(source, /No apto · service vencido/);
  assert.match(source, /Disponible/);
  assert.match(source, /Sin jornada/);
  assert.match(source, /SERVICE_STATUS_LABELS/);
});
