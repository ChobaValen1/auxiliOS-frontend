const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('config.js');
const lifecycle = read('operator-service-lifecycle.js');
const billing = read('operator-billing.js');
const invoiceWorkflow = read('migrations/20260824221500_operator_invoice_workflow_v3.sql');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `No se encontró ${nextName}`);
  return source.slice(start, end);
}

function sourceSlice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `No se encontró ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `No se encontró ${endMarker}`);
  return source.slice(start, end);
}

test('el modal definitivo de creación se carga antes de liberar la navegación', () => {
  const critical = functionBody(config, 'loadCriticalAuxiliosModules', 'loadGeographicBasesInBackground');
  const secondary = sourceSlice(config, 'async function loadSecondaryAuxiliosModules()', 'setNavigationBooting(true);');

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

test('Facturación elimina el paso redundante de aprobación', () => {
  assert.doesNotMatch(billing, /approve-selection|approvalOpen|approvalBusy|approvalNotes|openApproval|approveSelection/);
  assert.doesNotMatch(billing, /review_operator_billing_services_bulk_v2/);
  assert.doesNotMatch(billing, /Aprobar servicios para facturar|Confirmar aprobación|APROBADO/);

  const selection = functionBody(billing, 'selectionMarkup', 'invoiceModalMarkup');
  assert.match(selection, /data-ob="invoice-selection"/);
  assert.match(selection, /Facturando…'\s*:\s*'FACTURAR'/);
});

test('servicios pending y reviewed legados mantienen el guard canónico antes de facturar', () => {
  const validateSelection = functionBody(billing, 'validateSelection', 'openInvoice');
  const openInvoice = functionBody(billing, 'openInvoice', 'closeInvoice');
  const createInvoice = functionBody(billing, 'createInvoice', 'confirmAdminAction');

  assert.match(validateSelection, /\['pending', 'reviewed'\]\.includes\(row\.billing_status\)/);
  assert.match(openInvoice, /const error = validateSelection\(\)/);
  assert.match(createInvoice, /const selectionError = validateSelection\(\)/);
  assert.match(createInvoice, /create_operator_invoice_v3/);
  assert.match(createInvoice, /p_service_ids: serviceIds/);
  assert.match(createInvoice, /p_service_toll_ids: tollIds/);
  assert.doesNotMatch(createInvoice, /create_operator_invoice_v1|create_operator_invoice_v2/);
  assert.doesNotMatch(createInvoice, /aprob/i);
});

test('la RPC v2 permanece como compatibilidad y usa el núcleo canónico previo', () => {
  assert.match(invoiceWorkflow, /create or replace function public\.create_operator_invoice_v2/);
  assert.match(invoiceWorkflow, /create_operator_invoice_core_v2\(/);
  assert.match(invoiceWorkflow, /p_service_ids,/);
  assert.match(invoiceWorkflow, /false\s*\n\s*\);/);
});
