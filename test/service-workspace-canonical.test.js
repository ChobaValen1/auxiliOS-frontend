const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const config=fs.readFileSync('config.js','utf8');
const flags=fs.readFileSync('feature-flags.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const editMigration=fs.readFileSync('migrations/20260812222500_canonical_service_edit_workspace_v1.sql','utf8');
const effective=fs.readFileSync('migrations/20260812225500_operator_service_update_split_v1.sql','utf8');

test('Crear Ver y Editar comparten un único workspace y controlador',()=>{
  assert.match(wizard,/openExisting/);
  assert.match(wizard,/openView/);
  assert.match(wizard,/openEdit/);
  assert.match(wizard,/get_operator_service_edit_context/);
  assert.match(workspace,/data-mode="\$\{w\.mode\}"/);
  assert.match(workspace,/Ver Servicio/);
  assert.match(workspace,/Editar Servicio/);
  assert.match(workspace,/Nuevo Servicio/);
  assert.doesNotMatch(config,/operator-service-edit\.js|operator-service-v2\.js|operator-active-desk/);
  assert.doesNotMatch(flags,/service_workspace_v2|service_editing_tolls_v1|operator_console_v2/);
});

test('modo Ver es solo lectura y puede pasar al mismo modo Editar',()=>{
  assert.match(wizard,/w\.mode==='view'/);
  assert.match(workspace,/edit-from-view/);
  assert.match(workspace,/Solo lectura/);
  assert.match(workspace,/\.osv4-reactive input/);
  assert.match(workspace,/el\.disabled=true/);
});

test('workspace usa Prestadora Base y Tipo sin Sucursal',()=>{
  assert.match(workspace,/Prestadora \*/);
  assert.match(workspace,/Base \*/);
  assert.match(workspace,/Tipo de Servicio \*/);
  assert.match(wizard,/billing_base_id/);
  assert.doesNotMatch(wizard,/branch_id|cambiarSucursalServicio|company_branches/);
});

test('selects reactivos reflejan el valor inmediatamente',()=>{
  const helper=workspace.split('function setOptions')[1].split('function itemById')[0];
  assert.match(helper,/el\.value=value\?\?''/);
  assert.doesNotMatch(helper,/document\.activeElement/);
  assert.match(workspace,/data-assignment="driver"/);
  assert.match(workspace,/data-assignment="truck"/);
});

test('configuración empresarial controla campos requeridos opcionales u ocultos',()=>{
  assert.match(wizard,/configuredRequiredErrors/);
  assert.match(wizard,/fieldMode/);
  assert.match(workspace,/data-field-config="customer_phone"/);
  assert.match(workspace,/data-field-config="vehicle_plate"/);
  assert.match(workspace,/data-field-config="assigned_resources"/);
  assert.match(workspace,/data-field-config="purchase_order_number"/);
  assert.match(workspace,/data-field-config="customer_email"/);
  assert.match(workspace,/mode==='hidden'/);
});

test('warnings Maps pairing y privacidad siguen dentro del workspace canónico',()=>{
  assert.match(workspace,/blocking_issues/);
  assert.match(workspace,/Sin precio/);
  assert.match(wizard,/get_operator_resource_availability/);
  assert.match(workspace,/action:'autocomplete'/);
  assert.match(workspace,/action:'route'/);
  assert.match(workspace,/No visible para Operaciones/);
  assert.doesNotMatch(workspace,/money\(|Intl\.NumberFormat|company_estimated_total|estimated_total/);
  assert.match(editMigration,/calculate_operator_service_quote_v4_full/);
});

test('edición conserva payload diferencial y privacidad backend',()=>{
  assert.match(wizard,/function editPayload/);
  assert.match(effective,/v_requires_reprice/);
  assert.match(effective,/update_operator_service_full/);
  const context=effective.split(/create or replace function public\.get_operator_service_edit_context/i)[1];
  assert.doesNotMatch(context,/pricing_snapshot|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total/);
});

test('PWA incluye solo el workspace y configuración canónicos',()=>{
  const version=Number(sw.match(/auxilios-v(\d+)/)?.[1]||0);
  assert.ok(version>=171);
  assert.match(sw,/service-module-configuration\.js/);
  assert.match(sw,/operator-services\.js/);
  assert.match(sw,/operator-service-wizard\.js/);
  assert.match(sw,/operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(sw,/operator-active-desk|operator-services-block-a|operator-service-edit|operator-service-reajuste|operator-service-v2\.js|operator-reference-loader/);
});
