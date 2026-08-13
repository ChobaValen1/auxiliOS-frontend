const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const services=fs.readFileSync('operator-services.js','utf8');
const css=fs.readFileSync('operator-services.css','utf8');
const config=fs.readFileSync('config.js','utf8');
const settings=fs.readFileSync('service-module-configuration.js','utf8');
const migration=fs.readFileSync('migrations/20260813104500_service_module_configuration_v1.sql','utf8');

test('Servicios usa una sola mesa y no conserva la vista anterior',()=>{
  assert.match(services,/os-table-body/);
  assert.match(services,/renderTableHeader/);
  assert.doesNotMatch(services,/os-board|renderKpis|renderDetail|modal-operador-servicio|get_operator_service_detail|os-detail-shell/);
});

test('mesa compacta aprovecha el alto disponible',()=>{
  assert.match(css,/margin:-18px/);
  assert.match(css,/height:31px/);
  assert.match(css,/height:25px/);
  assert.match(css,/100vh - 126px/);
  assert.match(css,/height:48px/);
});

test('Fecha muestra DD MM YY y hora de creación con segundos',()=>{
  assert.match(services,/year:'2-digit'/);
  assert.match(services,/fmtTimeSeconds/);
  assert.match(services,/created_at/);
  assert.match(services,/Creado/);
});

test('Servicios registra su propio header',()=>{
  assert.match(services,/SCREENS\.operaciones/);
  assert.match(services,/title:'SERVICIOS'/);
});

test('Activos e Historial filtran el mismo conjunto de servicios',()=>{
  assert.match(services,/const ACTIVE=new Set/);
  assert.match(services,/historyServices/);
  assert.match(services,/status==='completed'/);
  assert.match(services,/cambiarVistaServicios/);
  assert.match(migration,/billing_status text not null default 'not_ready'/);
  assert.match(migration,/new\.billing_status:='pending'/);
});

test('configuración empresarial y personalización visual están separadas',()=>{
  assert.match(settings,/Configurar columnas/);
  assert.match(settings,/Campos para la creación de servicios/);
  assert.match(settings,/Flujo operativo/);
  assert.match(settings,/required/);
  assert.match(settings,/optional/);
  assert.match(settings,/hidden/);
  assert.match(services,/auxilios\.services\.columns/);
  assert.match(services,/allow_personal_column_overrides/);
});

test('mesa no usa Sucursal ni renderiza dinero',()=>{
  assert.match(services,/get_operator_service_reference_data/);
  assert.match(services,/list_operator_services/);
  assert.doesNotMatch(services,/company_branches|S\.branches|canSeeCommercial|money\(/);
});

test('runtime carga solo módulos canónicos de Servicios',()=>{
  assert.match(config,/service-module-configuration\.js/);
  assert.match(config,/operator-services\.js/);
  assert.match(config,/operator-service-wizard\.js/);
  assert.match(config,/operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(config,/operator-active-desk|operator-service-edit\.js|operator-service-v2\.js|operator-service-reajuste/);
});
