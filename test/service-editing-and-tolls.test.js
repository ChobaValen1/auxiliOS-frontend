const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const legacy = fs.readFileSync('migrations/20260804161000_service_editing_and_tolls.sql','utf8');
const history = fs.readFileSync('migrations/20260804162000_preserve_toll_rate_history.sql','utf8');
const simple = fs.readFileSync('migrations/20260805100000_simple_tolls_workspace.sql','utf8');
const canonical = fs.readFileSync('migrations/20260812222500_canonical_service_edit_workspace_v1.sql','utf8');
const catalogTolls = fs.readFileSync('migrations/20260813143034_service_catalog_tolls_v1.sql','utf8');
const commercialMigration = fs.readFileSync('migrations/20260813152500_service_commercial_addons_v1.sql','utf8');
const wizard = fs.readFileSync('operator-service-wizard.js','utf8');
const workspace = fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const workspaceCss = fs.readFileSync('operator-service-workspace-reactive-v1.css','utf8');
const commercial = fs.readFileSync('operator-service-commercial-addons-v1.js','utf8');
const commercialCss = fs.readFileSync('operator-service-commercial-addons-v1.css','utf8');
const tolls = fs.readFileSync('toll-management.js','utf8');
const tollsCss = fs.readFileSync('toll-management.css','utf8');
const config = fs.readFileSync('config.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');

test('la edición canónica sigue auditada y protegida por el RPC existente', () => {
  assert.match(legacy, /create table if not exists public\.operator_service_changes/i);
  assert.match(canonical, /create or replace function public\.update_operator_service/i);
  assert.match(canonical, /insert into public\.operator_service_changes/i);
  assert.match(canonical, /'service_edit'/i);
  assert.match(canonical, /change_reason/i);
  assert.match(canonical, /status in \('completed','cancelled'\)/i);
});

test('Editar reutiliza el mismo workspace de Crear', () => {
  assert.match(wizard, /openCreate/);
  assert.match(wizard, /openEdit/);
  assert.match(wizard, /get_operator_service_edit_context/);
  assert.match(wizard, /update_operator_service/);
  assert.match(workspace, /data-mode="\$\{w\.mode\}"/);
  assert.match(workspace, /edit\?'Guardar cambios':'Crear servicio'/);
  assert.doesNotMatch(config, /operator-service-edit\.js|operator-service-edit\.css/);
});

test('cambiar fecha, Base, Tipo o KM recotiza con el motor v4 y no con matrix legacy', () => {
  assert.match(canonical, /calculate_operator_service_quote_v4_full/);
  assert.match(canonical, /billing_base_id=v_base_id/);
  assert.match(canonical, /primary_concept_id=v_primary\.concept_id/);
  assert.match(canonical, /estimated_asphalt_km=v_asphalt/);
  assert.match(canonical, /branch_id=null/);
  assert.doesNotMatch(canonical, /company_tariff_matrix_rates/);
});

test('viaje iniciado requiere motivo y remito firmado bloquea cambios estructurales', () => {
  assert.match(canonical, /v_trip_started/);
  assert.match(canonical, /Indicá el motivo de la corrección porque el viaje ya fue iniciado/);
  assert.match(canonical, /v_remito_locked/);
  assert.match(canonical, /El remito ya está firmado o cerrado/);
  assert.match(canonical, /update public\.trips/i);
  assert.match(canonical, /update public\.remitos/i);
  assert.match(workspace, /Motivo de la corrección/);
});

test('los conceptos se reconstruyen desde rate items v4 y no desde matrix_rate_id', () => {
  assert.match(canonical, /rate_item_id/);
  assert.match(canonical, /matrix_rate_id\)\s*values/);
  assert.match(canonical, /v_legacy_category,null\)/);
  assert.match(canonical, /drop function if exists app_private\.sync_operator_service_items_from_quote/);
});

test('el catálogo de Peajes conserva ubicaciones e historial de vigencias', () => {
  assert.match(legacy, /create table if not exists public\.toll_locations/i);
  assert.match(legacy, /create table if not exists public\.toll_rates/i);
  assert.match(history, /valid_until = v_from - 1/i);
  assert.match(simple, /create or replace function public\.save_simple_toll/i);
  assert.match(simple, /set valid_until = current_date - 1/i);
  assert.match(simple, /Actualización desde Peajes y Adicionales/i);
});

test('Peajes y Adicionales sigue siendo configuración administrativa canónica', () => {
  assert.match(tolls, /Peajes y Adicionales/);
  assert.match(tolls, /id="tm-simple-form"/);
  assert.match(tolls, /Nombre del peaje \*/);
  assert.match(tolls, /Dirección/);
  assert.match(tolls, /Importe \*/);
  assert.match(tolls, /Todos los peajes cargados/);
  assert.match(tolls, /save_simple_toll/);
  assert.match(tolls, /set_simple_toll_active/);
  assert.match(tollsCss, /\.tm-workspace/);
  assert.match(tollsCss, /position:\s*sticky/i);
});

test('el modal mantiene tres columnas y la tercera tiene un único renderer comercial', () => {
  assert.match(workspace, /data-workspace="three-columns"/);
  assert.match(workspaceCss, /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(workspace, /class="osv2-column actions-column"><\/section>/);
  assert.match(workspace, /OperatorServiceCommercialAddonsV1\?\.render/);
  assert.match(commercial, /Agregar Peaje/);
  assert.match(commercial, /Agregar Excedente/);
  assert.doesNotMatch(workspace, /tollCard|extrasCard|renderTolls|renderRows|data-toll-field|data-row-concept/);
  assert.match(workspace, /class="osv2-column route-column"[\s\S]*data-field-config="operator_notes"[\s\S]*driver_instructions/);
  assert.match(workspace, /class="osv4-meta-row"/);
});

test('el formulario crece y peajes/excedentes no agregan scroll interno', () => {
  assert.match(workspaceCss, /\.osv4-reactive \.osv2-grid\{[^}]*overflow-y:auto!important/);
  assert.match(workspaceCss, /\.osv4-reactive \.osv2-column\{[^}]*overflow:visible!important/);
  assert.match(commercialCss, /\.osca-list\{display:grid;gap:7px\}/);
  assert.doesNotMatch(commercialCss, /\.osca-list\{[^}]*overflow/);
});

test('los peajes se seleccionan del catálogo y el importe no es editable en el servicio', () => {
  assert.match(commercial, /El peaje y su importe salen del catálogo/);
  assert.match(commercial, /Seleccionar peaje…/);
  assert.doesNotMatch(commercial, /Carga manual/);
  assert.doesNotMatch(commercial, /data-ca-field="unit_amount"/);
  assert.match(wizard, /toll_id:row\.toll_id\|\|null/);
  assert.match(wizard, /toll_rate_id:row\.toll_rate_id\|\|tollRate\(row\.toll_id\)\?\.toll_rate_id\|\|null/);
  assert.match(wizard, /commercial_addons:commercialPayload\(d\)/);
});

test('pagador, medio de pago, consolidación y excedentes viven en el controlador canónico', () => {
  assert.match(wizard, /COMMERCIAL_PAYERS/);
  assert.match(wizard, /COMMERCIAL_PAYMENTS/);
  assert.match(wizard, /consolidateCommercialToll/);
  assert.match(wizard, /consolidateCommercialExcess/);
  assert.match(wizard, /commercialTollKey/);
  assert.match(wizard, /commercialExcessKey/);
  assert.match(commercialMigration, /operator_service_excess_charges/i);
  assert.match(commercialMigration, /customer_payment_method/i);
  assert.match(commercialMigration, /payer_agent/i);
});

test('alta y edición persisten peajes ligados a toll_id y toll_rate_id usando el importe vigente del servidor', () => {
  assert.match(catalogTolls, /normalize_service_catalog_tolls/);
  assert.match(catalogTolls, /from public\.toll_rates r/);
  assert.match(catalogTolls, /'unit_amount', round\(v_rate\.amount,2\)/);
  assert.match(catalogTolls, /'source', 'planned'/);
  assert.match(catalogTolls, /insert into public\.operator_service_tolls/);
  assert.match(catalogTolls, /create_operator_service_v3_catalog_legacy/);
  assert.match(catalogTolls, /return app_private\.update_operator_service_full\(p_service_id,v_payload,p_reason\)/);
  assert.match(catalogTolls, /Los peajes nuevos deben seleccionarse desde el catálogo/);
});

test('runtime no carga fixes temporales ni editores reemplazados', () => {
  for (const name of ['operator-service-edit.js','operator-service-edit.css','operator-reference-loader.js','operator-service-workspace-behavior-v1.js','operator-service-commercial-addons-input-fix-v1.js']) {
    assert.equal(config.includes(name),false);
    assert.equal(sw.includes(name),false);
  }
  assert.match(config, /operator-service-commercial-addons-v1\.js/);
  assert.match(sw, /operator-service-commercial-addons-v1\.js/);
  assert.match(config, /toll-management\.js/);
  assert.match(sw, /toll-management\.js/);
});