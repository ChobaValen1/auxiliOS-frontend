const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('config.js');
const lifecycle = read('operator-service-lifecycle.js');
const billing = read('operator-billing.js');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `No se encontró ${nextName}`);
  return source.slice(start, end);
}

test('el modal definitivo de creación se carga antes de liberar la navegación', () => {
  const critical = functionBody(config, 'loadCriticalAuxiliosModules', 'loadGeographicBasesInBackground');
  const secondary = functionBody(config, 'loadSecondaryAuxiliosModules', 'setNavigationBooting');

  assert.match(critical, /operator-service-workspace-reactive-v1\.css/);
  assert.match(critical, /operator-service-commercial-addons-v1\.css/);
  assert.match(critical, /operator-service-workspace-reactive-v1\.js/);
  assert.match(critical, /operator-service-wizard\.js/);
  assert.match(critical, /operator-service-commercial-addons-v1\.js/);
  assert.match(critical, /operator-service-bridge\.js/);

  assert.doesNotMatch(secondary, /operator-service-workspace-reactive-v1/);
  assert.doesNotMatch(secondary, /operator-service-wizard/);
  assert.doesNotMatch(secondary, /operator-service-commercial-addons-v1/);
  assert.doesNotMatch(secondary, /operator-service-bridge/);

  const workspacePos = critical.indexOf('operator-service-workspace-reactive-v1.js');
  const wizardPos = critical.indexOf('operator-service-wizard.js');
  assert.ok(workspacePos >= 0 && wizardPos > workspacePos, 'El workspace debe existir antes de abrir el wizard');
});

test('la asignación rápida conserva la relación chofer-camión en ambos sentidos', () => {
  assert.match(lifecycle, /function pairedTruckId\(driverId\)/);
  assert.match(lifecycle, /active_truck_id/);
  assert.match(lifecycle, /function pairedDriverId\(truckId\)/);
  assert.match(lifecycle, /active_driver_id/);
  assert.match(lifecycle, /driver\?\.addEventListener\('change',\(\)=>syncAssignmentPair\(m,'driver'\)\)/);
  assert.match(lifecycle, /truck\?\.addEventListener\('change',\(\)=>syncAssignmentPair\(m,'truck'\)\)/);
});

test('Facturación separa aprobar de facturar y muestra los datos de la futura factura', () => {
  assert.match(billing, /data-ob="approve-selection"/);
  assert.match(billing, /Aprobar servicios para facturar/);
  assert.match(billing, /Información necesaria para crear la factura/);
  assert.match(billing, /Prestadora/);
  assert.match(billing, /Período de los servicios/);
  assert.match(billing, /Moneda/);
  assert.match(billing, /Cantidad de servicios/);
  assert.match(billing, /Importe total/);
  assert.match(billing, /review_operator_billing_services_bulk_v2/);
});

test('un servicio pendiente no puede saltar desde la UI directamente a factura', () => {
  const createInvoice = functionBody(billing, 'createInvoice', 'confirmAdminAction');
  assert.match(createInvoice, /rows\.every\(r=>r\.billing_status==='reviewed'\)/);
  assert.match(createInvoice, /Antes de facturar, aprobá todos los servicios seleccionados/);

  const selection = functionBody(billing, 'selectionMarkup', 'approvalModalMarkup');
  assert.match(selection, /allPending/);
  assert.match(selection, /approve-selection/);
  assert.match(selection, /allReviewed/);
  assert.match(selection, /invoice-selection/);
});
