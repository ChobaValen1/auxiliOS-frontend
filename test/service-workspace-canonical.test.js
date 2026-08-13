const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const wizard = fs.readFileSync('operator-service-wizard.js','utf8');
const workspace = fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const css = fs.readFileSync('operator-service-workspace-reactive-v1.css','utf8');
const config = fs.readFileSync('config.js','utf8');
const flags = fs.readFileSync('feature-flags.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const editMigration = fs.readFileSync('migrations/20260812222500_canonical_service_edit_workspace_v1.sql','utf8');
const effective = fs.readFileSync('migrations/20260812225500_operator_service_update_split_v1.sql','utf8');

test('Crear y Editar comparten un único workspace y un único controlador', () => {
  assert.match(wizard, /fresh\(mode='create',serviceId=null\)/);
  assert.match(wizard, /openCreate/);
  assert.match(wizard, /openEdit/);
  assert.match(wizard, /get_operator_service_edit_context/);
  assert.match(wizard, /update_operator_service/);
  assert.match(workspace, /data-mode="\$\{w\.mode\}"/);
  assert.match(workspace, /edit\?'Guardar cambios':'Crear servicio'/);
  assert.match(workspace, /edit\?'Editar Servicio':'Nuevo Servicio'/);
  assert.doesNotMatch(config, /operator-service-edit\.js|operator-service-v2\.js|operator-active-desk/);
  assert.doesNotMatch(flags, /service_workspace_v2|service_editing_tolls_v1|operator_console_v2/);
});

test('el workspace usa Prestadora, Base y Tipo de Servicio sin Sucursal', () => {
  assert.match(workspace, /Prestadora \*/);
  assert.match(workspace, /Base \*/);
  assert.match(workspace, /Tipo de Servicio \*/);
  assert.match(wizard, /billing_base_id/);
  assert.doesNotMatch(wizard, /branch_id|cambiarSucursalServicio|company_branches/);
  assert.doesNotMatch(workspace, /Sucursal|Base Operativa/);
});

test('los selects reactivos reflejan el valor nuevo aunque mantengan el foco', () => {
  const helper = workspace.split('function setOptions')[1].split('function itemById')[0];
  assert.match(helper, /el\.value=value\?\?''/);
  assert.doesNotMatch(helper, /document\.activeElement/);
  assert.match(workspace, /data-struct="company"/);
  assert.match(workspace, /data-struct="base"/);
  assert.match(workspace, /data-struct="primary"/);
  assert.match(workspace, /data-assignment="driver"/);
  assert.match(workspace, /data-assignment="truck"/);
});

test('warnings, disponibilidad y códigos están integrados sin módulos decoradores', () => {
  assert.match(workspace, /blocking_issues/);
  assert.match(workspace, /warnings/);
  assert.match(workspace, /Sin precio/);
  assert.match(workspace, /Disponible/);
  assert.match(workspace, /osv4-provider-code-warning/);
  assert.match(wizard, /check_recent_provider_code_v3/);
  assert.doesNotMatch(config, /operator-service-code-warnings|operator-service-workspace-behavior/);
});

test('Chofer y Móvil se emparejan en el controlador canónico', () => {
  assert.match(wizard, /get_operator_resource_availability/);
  assert.match(wizard, /active_truck_id/);
  assert.match(wizard, /active_driver_id/);
  assert.match(wizard, /setAssignment/);
});

test('Maps y los modos de recorrido viven dentro del mismo workspace', () => {
  assert.match(css, /\.osv4-suggestions\{position:absolute/);
  assert.match(workspace, /action:'autocomplete'/);
  assert.match(workspace, /action:'place'/);
  assert.match(workspace, /action:'route'/);
  assert.match(workspace, /base_origin_destination_base/);
  assert.match(workspace, /base_origin/);
  assert.match(workspace, /origin_destination/);
  assert.match(workspace, /rm==='manual'/);
});

test('Operaciones valida facturación pero el workspace no renderiza importes', () => {
  assert.match(workspace, /No visible para Operaciones/);
  assert.match(workspace, /Validar servicio/);
  assert.doesNotMatch(workspace, /money\(|Intl\.NumberFormat|company_estimated_total|estimated_total/);
  assert.match(editMigration, /calculate_operator_service_quote_v4_full/);
});

test('el contexto efectivo de edición no expone pricing del servicio', () => {
  const context = effective.split(/create or replace function public\.get_operator_service_edit_context/i)[1];
  assert.doesNotMatch(context, /pricing_snapshot|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total|toll_estimate|route_toll_estimate/);
  assert.match(context, /v_tolls jsonb := '\[\]'::jsonb/);
  assert.match(context, /if v_role='administracion' then/);
});

test('la edición usa payload diferencial y separa corrección operativa de recotización', () => {
  assert.match(wizard, /function editPayload\(\)/);
  assert.match(wizard, /REMITO_STRUCTURAL/);
  assert.match(wizard, /TRIP_LOCKED/);
  assert.match(effective, /v_requires_reprice/);
  assert.match(effective, /return app_private\.update_operator_service_full/);
  assert.match(effective, /Correcciones operativas que no alteran la cotización/);
  assert.match(editMigration, /branch_id=null/);
});

test('PWA precachea solo los archivos canónicos de Servicios', () => {
  const version = Number(sw.match(/auxilios-v(\d+)/)?.[1] || 0);
  assert.ok(version >= 170);
  assert.match(sw, /operator-services\.js/);
  assert.match(sw, /operator-service-wizard\.js/);
  assert.match(sw, /operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(sw, /operator-active-desk|operator-services-block-a|operator-service-edit|operator-service-reajuste|operator-service-v2\.js|operator-reference-loader/);
});