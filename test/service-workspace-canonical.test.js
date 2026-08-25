const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const workspaceCss=fs.readFileSync('operator-service-workspace-reactive-v1.css','utf8');
const moduleConfig=fs.readFileSync('service-module-configuration.js','utf8');
const config=fs.readFileSync('config.js','utf8');
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
});

test('bootstrap carga solamente el workspace visual canónico',()=>{
  assert.match(config,/['"]\/operator-service-workspace-reactive-v1\.css['"]/);
  assert.match(config,/['"]\/operator-service-workspace-reactive-v1\.js['"]/);
  assert.doesNotMatch(config,/operator-service-workspace-v2\.css|feature-flags\.js/);
  assert.equal(fs.existsSync('feature-flags.js'),false);
  assert.equal(fs.existsSync('operator-service-workspace-v2.css'),false);
  assert.match(workspaceCss,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
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
  const helper=workspace.split('function setOptions')[1].split('function selectedBase')[0];
  assert.match(helper,/el\.value=value\?\?''/);
  assert.doesNotMatch(helper,/document\.activeElement/);
  assert.match(workspace,/data-assignment="driver"/);
  assert.match(workspace,/data-assignment="truck"/);
});

test('configuración empresarial controla campos operativos y cualquier Oculto desaparece visualmente',()=>{
  assert.match(wizard,/function requiredErrors/);
  assert.match(wizard,/S\.moduleConfig\?\.field_modes/);
  assert.match(workspace,/function fieldMode/);
  assert.match(workspace,/key==='customer_email'\?'hidden':'optional'/);
  assert.match(workspace,/data-field-config="customer_phone"/);
  assert.match(workspace,/data-field-config="vehicle_plate"/);
  assert.match(workspace,/data-field-config="assigned_resources"/);
  assert.match(workspace,/data-field-config="customer_email"/);
  assert.match(workspace,/wrapper\.hidden=mode==='hidden'/);
  assert.match(workspaceCss,/\.osv4-reactive \[hidden\]\{display:none!important\}/);
  assert.match(moduleConfig,/customer_email:'hidden'/);
  assert.doesNotMatch(moduleConfig,/purchase_order_number/);
  assert.doesNotMatch(workspace,/osv4-purchase-order|Orden de compra/);
  assert.doesNotMatch(wizard,/purchase_order_number/);
});

test('Conceptos adicionales vuelve a columna 1 y se habilita después de Prestadora',()=>{
  const admin=workspace.split('<section class="osv2-column admin-column">')[1].split('<section class="osv2-column route-column">')[0];
  assert.match(admin,/Conceptos adicionales/);
  assert.match(admin,/data-click="add-concept"/);
  assert.match(workspace,/add\.disabled=!w\.data\.company_id\|\|lockedState/);
  assert.match(workspace,/Seleccioná una Prestadora para habilitar conceptos/);
  assert.match(workspace,/data-concept-row/);
  assert.match(workspace,/data-concept-qty/);
  assert.match(workspace,/data-concept-code/);
  assert.doesNotMatch(admin,/Importe|money\(|Intl\.NumberFormat/);
  assert.match(wizard,/function addSecondary/);
  assert.match(wizard,/function removeSecondary/);
  assert.match(wizard,/function secondaryQty/);
  assert.match(wizard,/function secondaryCode/);
  assert.match(wizard,/requires_own_code/);
  assert.match(wizard,/out\.items=secondaryPayload\(d\)/);
  assert.match(wizard,/out\.item_codes=d\.item_codes\|\|\{\}/);
  assert.match(effective,/'items','item_codes'/);
});

test('cantidad de concepto puede editarse sin rerender por cada tecla',()=>{
  assert.match(wizard,/function secondaryQty\(id,value,refresh=true\)/);
  assert.match(wizard,/if\(refresh\)render\(\)/);
});

test('conceptos crecen con el workspace y no crean un scroll interno',()=>{
  assert.match(workspaceCss,/\.osv2-concepts-section\{[^}]*overflow:visible/);
  assert.match(workspaceCss,/\.osv4-concept-table\{[^}]*overflow:visible/);
});

test('origen destino es compacto y observaciones e indicaciones permanecen en columna 2',()=>{
  assert.match(workspace,/osv4-location-head/);
  assert.match(workspace,/rows="3" data-key="operator_notes"/);
  assert.match(workspace,/rows="3" data-key="driver_instructions"/);
  assert.match(workspaceCss,/\.osv2-location\{display:grid;gap:3px;padding:6px 7px\}/);
  assert.match(workspaceCss,/\.osv4-reactive \.route-column textarea\{min-height:52px!important/);
});

test('warnings Maps y privacidad siguen dentro del workspace canónico sin bloque fantasma',()=>{
  assert.match(workspace,/blocking_issues/);
  assert.match(workspace,/Sin precio/);
  assert.match(wizard,/function loadResourceAvailability\(\)/);
  assert.match(wizard,/get_operator_resource_availability/);
  assert.match(wizard,/function setAssignment\(kind,value\)/);
  assert.match(wizard,/w\.data\.assigned_driver_id=value/);
  assert.match(wizard,/w\.data\.assigned_truck_id=value/);
  assert.match(wizard,/markDirty\(\);render\(\)/);
  assert.match(workspace,/action:'autocomplete'/);
  assert.match(workspace,/action:'route'/);
  assert.doesNotMatch(workspace,/osv2-summary-card|Validar servicio|Facturación|No visible para Operaciones/);
  assert.doesNotMatch(workspace,/money\(|Intl\.NumberFormat|company_estimated_total|estimated_total/);
  assert.match(editMigration,/calculate_operator_service_quote_v4_full/);
});

test('renderer elimina callbacks vacíos sin consumidores',()=>{
  assert.doesNotMatch(workspace,/validationErrors:\(\)=>\[\]|updateValidationUI:\(\)=>\{\}/);
  assert.match(workspace,/window\.OperatorServiceWorkspaceV2=\{render,sync,reset\}/);
});

test('edición conserva payload diferencial y privacidad backend',()=>{
  assert.match(wizard,/function editPayload/);
  assert.match(effective,/v_requires_reprice/);
  assert.match(effective,/update_operator_service_full/);
  const context=effective.split(/create or replace function public\.get_operator_service_edit_context/i)[1];
  assert.doesNotMatch(context,/pricing_snapshot|company_estimated_total|estimated_total|base_subtotal|surcharge_total|copay_total/);
});

test('PWA incluye solo el workspace y configuración canónicos',()=>{
  const version=Number(sw.match(/auxilios(?:-billing-phase2)?-v(\d+)/)?.[1]||0);
  assert.ok(version>=171);
  assert.match(sw,/service-module-configuration\.js/);
  assert.match(sw,/operator-services\.js/);
  assert.doesNotMatch(sw,/operator-service-wizard\.js/);
  assert.match(sw,/operator-service-workspace-reactive-v1\.js/);
  assert.match(sw,/operator-service-commercial-addons-v1\.js/);
  assert.doesNotMatch(sw,/operator-active-desk|operator-services-block-a|operator-service-edit|operator-service-reajuste|operator-service-v2\.js|operator-reference-loader/);
});
