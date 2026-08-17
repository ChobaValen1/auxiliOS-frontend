const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=fs.readFileSync('operator-billing.js','utf8');
const billingCss=fs.readFileSync('operator-billing.css','utf8');
const billingExport=fs.readFileSync('operator-billing-export.js','utf8');
const excelExport=fs.readFileSync('excel-export.js','utf8');
const companyBilling=fs.readFileSync('company-billing-parameters-v4.js','utf8');
const config=fs.readFileSync('config.js','utf8');
const index=fs.readFileSync('Index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const foundation=fs.readFileSync('migrations/20260817133000_operator_billing_core_v1.sql','utf8');
const migration=fs.readFileSync('migrations/20260817141500_operator_billing_desk_v2.sql','utf8');
const tollSchema=fs.readFileSync('migrations/20260817181500_toll_billing_mode_schema_v1.sql','utf8');
const tollConfig=fs.readFileSync('migrations/20260817181600_toll_billing_config_rpc_v1.sql','utf8');
const tollQuote=fs.readFileSync('migrations/20260817181700_toll_billing_quote_v1.sql','utf8');
const tollDesk=fs.readFileSync('migrations/20260817181800_toll_billing_desk_v1.sql','utf8');

test('Facturación mantiene lifecycle independiente FINALIZADO -> PENDIENTE -> REVISADO',()=>{
  assert.match(foundation,/operator_service_billing_revisions/);
  assert.match(migration,/Sólo un servicio FINALIZADO y PENDIENTE puede marcarse REVISADO/);
  assert.match(migration,/billing_status='reviewed'/);
  assert.match(migration,/review_operator_billing_service_v2/);
  assert.doesNotMatch(billing,/mark.*invoiced|invoice_operator|facturarServicio/);
});

test('importe se recalcula por período sin pisar snapshot de FINALIZADO',()=>{
  assert.match(migration,/calculate_operator_service_billing_quote_v2/);
  assert.match(migration,/calculate_operator_service_quote_v4_full/);
  assert.match(migration,/pricing_snapshot->>'company_estimated_total'/);
  assert.match(migration,/stored_company_amount/);
  assert.match(migration,/current_company_amount/);
  assert.match(migration,/billing_delta/);
  assert.match(migration,/billing_source','current_tariff_period/);
  const calc=migration.split('create or replace function app_private.calculate_operator_service_billing_quote_v2')[1].split('create or replace function public.list_operator_billing_services_v2')[0];
  assert.doesNotMatch(calc,/update public\.operator_services/);
});

test('mesa acepta búsqueda, Prestadora y período mensual',()=>{
  assert.match(migration,/list_operator_billing_services_v2/);
  assert.match(migration,/p_search text default null/);
  assert.match(migration,/p_company_id uuid default null/);
  assert.match(migration,/p_period_start date default null/);
  assert.match(migration,/p_period_end date default null/);
  assert.match(billing,/id="ob-search"/);
  assert.match(billing,/id="ob-company-filter"/);
  assert.match(billing,/id="ob-period-filter"/);
  assert.match(billing,/function periodBounds\(value\)/);
});

test('grilla general es sintética y deja pricing dentro del detalle',()=>{
  const table=billing.split('function tableMarkup()')[1].split('function rowMarkup')[0];
  for(const label of ['Fecha/Hora','Prestadora','Base','Tipo de Servicio','Origen','Destino','Cliente','KM'])assert.match(table,new RegExp(label));
  for(const forbidden of ['Importe cierre','Importe actual','Diferencia','Tarifa','Estado'])assert.doesNotMatch(table,new RegExp(forbidden));
  const detail=billing.split('function detailMarkup()')[1].split('function reviewMarkup')[0];
  assert.match(detail,/Importe actual/);
  assert.match(detail,/Importe al cierre/);
  assert.match(detail,/Diferencia/);
  assert.match(detail,/Tarifa aplicada ahora/);
  assert.match(detail,/Composición/);
  assert.match(billing,/function componentMarkup/);
});

test('selección masiva jamás mezcla Prestadoras en frontend ni backend',()=>{
  assert.match(billing,/selectionCompanyId/);
  assert.match(billing,/No se pueden seleccionar juntas diferentes prestadoras/);
  assert.match(billing,/Filtrá una prestadora antes de seleccionar todos/);
  assert.match(billing,/review_operator_billing_services_bulk_v2/);
  assert.match(migration,/count\(distinct company_id\)/);
  assert.match(migration,/No se pueden procesar juntas diferentes prestadoras/);
  assert.match(migration,/La selección contiene servicios que ya no están PENDIENTES/);
});

test('revisión masiva sólo prepara servicios; no fabrica una factura',()=>{
  assert.match(billing,/Marcar REVISADOS/);
  assert.match(billing,/Confirmar revisión masiva/);
  assert.match(billing,/Facturar selección · siguiente etapa/);
  assert.match(billing,/Se habilitará con la entidad Factura/);
  assert.match(migration,/review_operator_billing_services_bulk_v2/);
  assert.doesNotMatch(migration,/create table.*invoice|create table.*factura/i);
});

test('Administración puede corregir o anular FINALIZADO y la corrección reingresa PENDIENTE',()=>{
  assert.match(billing,/Modificar servicio/);
  assert.match(billing,/window\.editarServicioOperador/);
  assert.match(billing,/Anular servicio/);
  assert.match(migration,/update_operator_billing_service_v2/);
  assert.match(migration,/Sólo Administración puede modificar un servicio FINALIZADO/);
  assert.match(migration,/billing_status='pending'/);
  assert.match(migration,/billing_service_edit/);
  assert.match(migration,/annul_operator_billing_service_v2/);
  assert.match(migration,/app\.billing_admin_transition/);
  assert.match(migration,/old\.status='completed' and new\.status='cancelled'/);
  assert.match(migration,/cancellation_reason_code='billing_admin'/);
});

test('revertir Facturación vuelve a Servicios sin reabrir lifecycle ni recursos',()=>{
  assert.match(billing,/Revertir Facturación/);
  assert.match(migration,/revert_operator_billing_service_v2/);
  const revertFn=migration.split('create or replace function public.revert_operator_billing_service_v2')[1].split('create or replace function app_private.operator_services_before_update')[0];
  assert.match(revertFn,/set billing_status='not_ready'/);
  assert.match(revertFn,/billing_reverted/);
  assert.doesNotMatch(revertFn,/set\s+status\s*=|assigned_driver_id\s*=|assigned_truck_id\s*=/);
  assert.match(billing,/window\.cambiarVistaServicios\?\.\('history'\)/);
});

test('editor canónico de Servicios admite corrección administrativa de FINALIZADO con motivo',()=>{
  assert.match(migration,/get_operator_service_edit_context_base_v2/);
  assert.match(migration,/update_operator_service_base_v2/);
  assert.match(migration,/billing_correction/);
  assert.match(migration,/requires_reason',true/);
  assert.match(migration,/if s\.status='completed' then return public\.update_operator_billing_service_v2/);
  assert.match(migration,/Indicá el motivo de la corrección/);
  assert.match(migration,/Chofer y Móvil no pueden modificarse en un servicio FINALIZADO/);
});

test('confirmaciones administrativas permanecen contextuales dentro de Facturación',()=>{
  assert.match(billing,/function actionConfirmMarkup/);
  assert.match(billing,/id="ob-action-reason"/);
  assert.match(billing,/Confirmar revisión masiva/);
  assert.doesNotMatch(billing,/window\.confirm|[^\.]confirm\(/);
  assert.match(billingCss,/\.ob-action-confirm/);
  assert.match(billingCss,/\.ob-selection/);
});

test('roles: Administración y Facturación revisan/revierten; sólo Administración corrige/anula',()=>{
  assert.match(billing,/const canReview=\(\)=>\['administracion','facturacion'\]/);
  assert.match(billing,/const canCorrect=\(\)=>role\(\)==='administracion'/);
  assert.match(billing,/const canRevert=\(\)=>\['administracion','facturacion'\]/);
  assert.match(migration,/Sólo Administración puede anular un servicio FINALIZADO/);
  assert.match(migration,/Sólo Administración puede modificar un servicio FINALIZADO/);
});

test('parámetros separan obtención de peajes de tratamiento de facturación',()=>{
  assert.match(tollSchema,/toll_billing_mode/);
  assert.match(tollSchema,/with_service/);
  assert.match(tollSchema,/separate/);
  assert.match(tollConfig,/v_toll_billing_mode/);
  assert.match(tollConfig,/toll_billing_mode=v_toll_billing_mode/);
  assert.match(companyBilling,/Obtención de peajes/);
  assert.match(companyBilling,/Facturación de peajes/);
  assert.match(companyBilling,/id="bp4-toll-billing"/);
  assert.match(companyBilling,/toll_billing_mode:document\.getElementById\('bp4-toll-billing'\)/);
  assert.match(companyBilling,/Junto con el servicio/);
  assert.match(companyBilling,/Por separado/);
});

test('peaje separado no integra el importe del servicio y conserva su monto independiente',()=>{
  assert.match(tollQuote,/v_service_quote:=app_private\.calculate_operator_service_quote_v4_full/);
  assert.match(tollQuote,/v_current:=v_service_amount\+case when v_toll_billing_mode='with_service' then v_effective_toll else 0 end/);
  assert.match(tollQuote,/separate_toll_amount/);
  assert.match(tollQuote,/included_toll_amount/);
  assert.match(tollQuote,/service_company_amount/);
  assert.match(tollQuote,/company_amount_with_tolls/);
  assert.match(billing,/q\.toll_billing_mode!=='separate'/);
  assert.match(billing,/Peajes facturados por separado/);
  assert.match(billing,/no forma parte del total del servicio/i);
});

test('Facturación incorpora un sector Peajes sin duplicar la carga operativa',()=>{
  assert.match(tollDesk,/list_operator_billing_tolls_v1/);
  assert.match(tollDesk,/operator_service_tolls/);
  assert.match(tollDesk,/cfg\.toll_billing_mode='separate'/);
  assert.match(tollDesk,/t\.payer_agent='provider'/);
  assert.match(billing,/data-ob-tab="tolls">Peajes/);
  assert.match(billing,/function tollTableMarkup/);
  assert.match(billing,/function tollRowMarkup/);
  assert.match(billing,/list_operator_billing_tolls_v1/);
  assert.doesNotMatch(tollDesk,/create table.*toll/i);
});

test('exportador usa el SheetJS ya cargado y genera archivos XLSX reales',()=>{
  assert.match(index,/xlsx\.full\.min\.js/);
  assert.match(excelExport,/window\.XLSX/);
  assert.match(excelExport,/utils\.aoa_to_sheet/);
  assert.match(excelExport,/utils\.book_new/);
  assert.match(excelExport,/writeFile/);
  assert.match(excelExport,/bookType:'xlsx'/);
  assert.doesNotMatch(excelExport,/text\/csv|\.csv/i);
});

test('Facturación exporta vista actual, selección y todo lo filtrado',()=>{
  assert.match(billingExport,/function exportCurrent\(\)/);
  assert.match(billingExport,/function exportSelected\(\)/);
  assert.match(billingExport,/function exportAllFiltered\(\)/);
  assert.match(billingExport,/Vista actual/);
  assert.match(billingExport,/Todo lo filtrado/);
  assert.match(billingExport,/S\.selected/);
  assert.match(billingExport,/billing_status==='pending'/);
  assert.match(billingExport,/billing_status==='reviewed'/);
  assert.match(billingExport,/S\.tollRows/);
});

test('Excel de servicios y peajes conserva datos administrativos relevantes',()=>{
  for(const label of ['Fecha','Prestadora','N° servicio','Orden prestadora','Estado facturación','Base','Cliente','Patente','Origen','Destino','Moneda'])assert.match(billingExport,new RegExp(label));
  for(const label of ['KM','Importe al cierre','Importe actual','Diferencia','Error tarifario'])assert.match(billingExport,new RegExp(label));
  for(const label of ['Peaje','Ruta','Sentido','Cantidad','Importe','Origen del dato','Medio de pago','Fecha cruce','Pagador'])assert.match(billingExport,new RegExp(label));
  assert.match(billingExport,/totalsByCurrency/);
  assert.match(excelExport,/Resumen/);
});

test('runtime carga y cachea Facturación + Excel canónicos v203',()=>{
  const critical=config.split('async function loadCriticalAuxiliosModules()')[1].split('function loadGeographicBasesInBackground')[0];
  assert.match(critical,/auxilios-excel-export.*excel-export\.js/);
  assert.match(critical,/auxilios-operator-billing.*operator-billing\.js/);
  assert.match(critical,/auxilios-operator-billing-export.*operator-billing-export\.js/);
  assert.ok(critical.indexOf('/excel-export.js')<critical.indexOf('/operator-billing.js'));
  assert.ok(critical.indexOf('/operator-billing.js')<critical.indexOf('/operator-billing-export.js'));
  assert.match(sw,/operator-billing\.js/);
  assert.match(sw,/operator-billing\.css/);
  assert.match(sw,/excel-export\.js/);
  assert.match(sw,/operator-billing-export\.js/);
  assert.match(sw,/auxilios-v203/);
});