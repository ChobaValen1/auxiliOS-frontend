const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const services=fs.readFileSync('operator-services.js','utf8');
const css=fs.readFileSync('operator-services.css','utf8');
const workspaceCss=fs.readFileSync('operator-service-workspace-reactive-v1.css','utf8');
const config=fs.readFileSync('config.js','utf8');
const settings=fs.readFileSync('service-module-configuration.js','utf8');
const lifecycle=fs.readFileSync('migrations/20260813104500_service_module_configuration_v1.sql','utf8');
const listMigration=fs.readFileSync('migrations/20260814125000_operator_service_list_v3.sql','utf8');
const settingsMigration=fs.readFileSync('migrations/20260814125500_service_module_columns_v2.sql','utf8');

test('Servicios usa una sola mesa y sólo conserva las columnas definitivas',()=>{
  assert.match(services,/os-table-body/);
  assert.match(services,/renderTableHeader/);
  assert.match(services,/COLUMN_KEYS=\['code','datetime','arrival','finish','provider','base','type','origin','destination','client','km','driver','delay','mobile','status','amount_due','actions'\]/);
  for(const label of ['Código','Fecha\/Hora','Arribo','Fin','Prestadora','Base','Tipo','Origen','Destino','Cliente','Km','Chofer','Demora','Móvil','Estado','Por Cobrar','Acciones'])assert.match(services,new RegExp(label));
  assert.doesNotMatch(services,/column_order:\['service','date','route'|customer_vehicle|resource:'|priorityMeta|col-route|col-customer_vehicle/);
  assert.doesNotMatch(services,/os-board|renderKpis|renderDetail|modal-operador-servicio|get_operator_service_detail|os-detail-shell/);
});

test('mesa compacta ubica Nuevo servicio a la derecha y adapta las 17 columnas al viewport',()=>{
  assert.match(css,/grid-template-columns:auto auto 180px 120px 34px 34px minmax\(0,1fr\)/);
  assert.match(css,/\.os-commandbar \.os-manage\{justify-self:end\}/);
  assert.match(css,/\.os-table\{width:100%;min-width:0;/);
  assert.doesNotMatch(css,/min-width:1740px/);
  assert.match(css,/100vh - 126px/);
  assert.match(css,/\.os-table th\.col-origin,\.os-table th\.col-destination\{width:13%\}/);
  assert.match(css,/col-amount_due/);
});

test('Fecha Hora muestra sólo la fecha programada y su hora en menor jerarquía',()=>{
  assert.match(services,/fmtDay\(s\.scheduled_for\)/);
  assert.match(services,/fmtTime\(s\.scheduled_for\)/);
  assert.match(services,/os-scheduled-time/);
  assert.match(css,/\.os-scheduled-time\{font-size:8px!important/);
  assert.doesNotMatch(services,/Creado ·|fmtTimeSeconds/);
});

test('Cliente representa patente marca y modelo, no el nombre del socio',()=>{
  const customer=services.split('function customerCell')[1].split('function amountDueCell')[0];
  assert.match(customer,/vehicle_plate/);
  assert.match(customer,/vehicle_make_model/);
  assert.doesNotMatch(customer,/customer_name/);
});

test('Origen y Destino son columnas separadas con detalle Dirección Localidad Provincia',()=>{
  assert.match(services,/origin:'Origen',destination:'Destino'/);
  assert.match(services,/LOCATION_LABELS=\{address:'Dirección',locality:'Localidad',province:'Provincia'\}/);
  assert.match(services,/function locationCell/);
  assert.match(services,/origin_formatted_address/);
  assert.match(services,/destination_formatted_address/);
  assert.match(services,/location_detail/);
  assert.match(settings,/Detalle de Origen \/ Destino/);
  assert.match(settings,/Dirección, Localidad y Provincia/);
  assert.match(services,/cambiarDetalleUbicacionPersonalServicio/);
  assert.match(settingsMigration,/add column if not exists location_detail/);
});

test('todas las columnas pueden ser visibles u ocultas por configuración o por usuario',()=>{
  assert.match(settings,/Configurar columnas/);
  assert.match(services,/auxilios\.services\.columns/);
  assert.match(services,/allow_personal_column_overrides/);
  assert.match(services,/S\.personalDraft\.column_visibility\[key\]=!!on/);
  assert.match(settings,/S\.config\.column_visibility\[key\]=!!on/);
  assert.doesNotMatch(services,/service:true,actions:true/);
  assert.doesNotMatch(settings,/\['service','actions'\]\.includes/);
  assert.match(settingsMigration,/v_allowed text\[\]:=array\['code','datetime','arrival','finish','provider','base','type','origin','destination','client','km','driver','delay','mobile','status','amount_due','actions'\]/);
  assert.doesNotMatch(settingsMigration,/jsonb_build_object\('service',true,'actions',true\)/);
});

test('Por Cobrar es peajes del cliente más todos los excedentes',()=>{
  assert.match(services,/customer_amount_due/);
  assert.match(services,/fmtMoney/);
  assert.match(listMigration,/ot\.payer_agent='customer'/);
  assert.match(listMigration,/operator_service_excess_charges oe/);
  assert.match(listMigration,/customer_amount_due/);
  assert.match(listMigration,/origin_formatted_address/);
  assert.match(listMigration,/destination_formatted_address/);
});

test('Agregar concepto es más compacto y Observaciones e Indicaciones comparten tarjeta y padding',()=>{
  assert.match(workspaceCss,/\.osv4-reactive \.osv2-add-concept-trigger\{min-height:25px!important;padding:0 8px!important;font-size:7\.7px!important/);
  assert.match(workspaceCss,/\.vehicle-card,.osv4-reactive \.distance-card,.osv4-reactive \.driver-instructions-card,.osv4-reactive \.osv2-observations\{padding:7px!important\}/);
  assert.match(workspaceCss,/\.osv2-observations\{display:grid!important;min-width:0;border:1px solid var\(--osv2-border\);border-radius:11px;background:var\(--osv2-card\)/);
  assert.match(workspaceCss,/\.route-column textarea\{min-height:52px!important;padding:6px 8px!important\}/);
});

test('Servicios registra header, Activos e Historial y mantiene el flujo de facturación',()=>{
  assert.match(services,/SCREENS\.operaciones/);
  assert.match(services,/title:'SERVICIOS'/);
  assert.match(services,/const ACTIVE=new Set/);
  assert.match(services,/historyServices/);
  assert.match(services,/cambiarVistaServicios/);
  assert.match(lifecycle,/billing_status text not null default 'not_ready'/);
  assert.match(lifecycle,/new\.billing_status:='pending'/);
});

test('runtime carga sólo módulos canónicos de Servicios',()=>{
  assert.match(config,/service-module-configuration\.js/);
  assert.match(config,/operator-services\.js/);
  assert.match(config,/operator-service-wizard\.js/);
  assert.match(config,/operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(config,/operator-active-desk|operator-service-edit\.js|operator-service-v2\.js|operator-service-reajuste/);
});
