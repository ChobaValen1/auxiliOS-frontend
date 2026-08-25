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
const legacyDesk=fs.readFileSync('migrations/20260817141500_operator_billing_desk_v2.sql','utf8');
const adminNoReason=fs.readFileSync('migrations/20260818020500_admin_actions_without_reason_v1.sql','utf8');
const tollSchema=fs.readFileSync('migrations/20260817181500_toll_billing_mode_schema_v1.sql','utf8');
const tollConfig=fs.readFileSync('migrations/20260817181600_toll_billing_config_rpc_v1.sql','utf8');
const tollQuote=fs.readFileSync('migrations/20260817181700_toll_billing_quote_v1.sql','utf8');
const tollDesk=fs.readFileSync('migrations/20260817181800_toll_billing_desk_v1.sql','utf8');
const exportMigration=fs.readFileSync('migrations/20260817195000_operator_billing_export_v2.sql','utf8');
const invoiceWorkflow=fs.readFileSync('migrations/20260824221500_operator_invoice_workflow_v3.sql','utf8');

test('backend conserva compatibilidad histórica reviewed pero la UI no expone aprobar',()=>{
  assert.match(foundation,/operator_service_billing_revisions/);
  assert.match(legacyDesk,/billing_status='reviewed'/);
  assert.match(legacyDesk,/review_operator_billing_service_v2/);
  assert.doesNotMatch(billing,/approve-selection|openApproval|approveSelection|Confirmar aprobación|APROBADO/);
  assert.doesNotMatch(billing,/review_operator_billing_services_bulk_v2/);
});

test('importe se recalcula por período sin pisar snapshot de FINALIZADO',()=>{
  assert.match(legacyDesk,/calculate_operator_service_billing_quote_v2/);
  assert.match(legacyDesk,/calculate_operator_service_quote_v4_full/);
  assert.match(legacyDesk,/pricing_snapshot->>'company_estimated_total'/);
  assert.match(legacyDesk,/stored_company_amount/);
  assert.match(legacyDesk,/current_company_amount/);
  assert.match(legacyDesk,/billing_delta/);
  const calc=legacyDesk.split('create or replace function app_private.calculate_operator_service_billing_quote_v2')[1].split('create or replace function public.list_operator_billing_services_v2')[0];
  assert.doesNotMatch(calc,/update public\.operator_services/);
});

test('mesa acepta búsqueda, Prestadora y período mensual',()=>{
  assert.match(billing,/list_operator_billing_services_v3/);
  assert.match(billing,/id="ob-search"/);
  assert.match(billing,/id="ob-company-filter"/);
  assert.match(billing,/id="ob-period-filter"/);
  assert.match(billing,/function periodBounds\(value\)/);
});

test('grilla general es sintética y deja pricing dentro del detalle',()=>{
  const table=billing.split('function tableMarkup()')[1].split('function rowMarkup')[0];
  for(const label of ['Fecha/Hora','Prestadora','Base','Tipo de Servicio','Origen','Destino','Cliente','KM'])assert.match(table,new RegExp(label));
  for(const forbidden of ['Importe cierre','Importe actual','Diferencia','Tarifa','Estado'])assert.doesNotMatch(table,new RegExp(forbidden));
  const detail=billing.split('function detailMarkup()')[1].split('function render()')[0];
  assert.match(detail,/Importe actual/);
  assert.match(detail,/Importe al cierre/);
  assert.match(detail,/Diferencia/);
  assert.match(detail,/Tarifa aplicada ahora/);
  assert.match(detail,/Composición/);
  assert.match(billing,/function componentMarkup/);
});

test('selección factura conceptos de una sola Prestadora y una sola moneda',()=>{
  assert.match(billing,/function selectedCompanies\(\)/);
  assert.match(billing,/function selectedCurrencies\(\)/);
  assert.match(billing,/selectedTollRows\(\)/);
  assert.match(billing,/seleccioná conceptos de una sola prestadora/i);
  assert.match(billing,/selección debe tener una sola moneda/i);
  assert.match(billing,/data-ob="invoice-selection"/);
  assert.match(billing,/Facturando…'\s*:\s*'FACTURAR'/);
});

test('Facturar abre modal y crea directamente con V3 sin revisión masiva',()=>{
  assert.match(billing,/function validateSelection\(\)/);
  assert.match(billing,/function openInvoice\(\)/);
  assert.match(billing,/function createInvoice\(\)/);
  assert.match(billing,/\['pending', 'reviewed'\]\.includes\(row\.billing_status\)/);
  assert.match(billing,/create_operator_invoice_v3/);
  assert.match(billing,/p_service_ids: serviceIds/);
  assert.match(billing,/p_service_toll_ids: tollIds/);
  assert.doesNotMatch(billing,/create_operator_invoice_v1|create_operator_invoice_v2/);
  assert.doesNotMatch(billing,/Marcar REVISADOS|Confirmar revisión masiva|review_operator_billing_services_bulk_v2/);
  assert.match(invoiceWorkflow,/create_operator_invoice_core_v2\(/);
  assert.match(invoiceWorkflow,/false\s*\n\s*\);/);
});

test('Administración puede corregir o anular un servicio FINALIZADO',()=>{
  assert.match(billing,/window\.editarServicioOperador/);
  assert.match(billing,/openDetailAction\(id,\s*'annul'\)/);
  assert.match(legacyDesk,/update_operator_billing_service_v2/);
  assert.match(legacyDesk,/Sólo Administración puede modificar un servicio FINALIZADO/);
  assert.match(legacyDesk,/billing_status='pending'/);
  assert.match(legacyDesk,/billing_service_edit/);
  assert.match(legacyDesk,/annul_operator_billing_service_v2/);
});

test('revertir Facturación vuelve a Servicios sin reabrir lifecycle ni recursos',()=>{
  assert.match(billing,/Revertir Facturación/);
  assert.match(legacyDesk,/revert_operator_billing_service_v2/);
  const revertFn=legacyDesk.split('create or replace function public.revert_operator_billing_service_v2')[1].split('create or replace function app_private.operator_services_before_update')[0];
  assert.match(revertFn,/set billing_status='not_ready'/);
  assert.match(revertFn,/billing_reverted/);
  assert.doesNotMatch(revertFn,/set\s+status\s*=|assigned_driver_id\s*=|assigned_truck_id\s*=/);
  assert.match(billing,/window\.cambiarVistaServicios\?\.\('history'\)/);
});

test('acciones administrativas de servicio siguen auditadas sin duplicar formularios',()=>{
  assert.match(billing,/function actionConfirmMarkup/);
  assert.doesNotMatch(billing,/ob-action-reason|Motivo obligatorio/);
  assert.match(billing,/p_reason:\s*null/);
  assert.match(adminNoReason,/Acción administrativa/);
  assert.match(adminNoReason,/revert_operator_billing_service_v2/);
  assert.match(adminNoReason,/annul_operator_billing_service_v2/);
  assert.doesNotMatch(billing,/window\.confirm|[^\.]confirm\(/);
  assert.match(billingCss,/\.ob-action-confirm/);
  assert.match(billingCss,/\.ob-selection/);
});

test('roles: Administración y Facturación facturan/revierten; sólo Administración corrige servicios',()=>{
  assert.match(billing,/const canInvoice\s*=\s*\(\)\s*=>\s*\['administracion', 'facturacion'\]/);
  assert.match(billing,/const canCorrect\s*=\s*\(\)\s*=>\s*role\(\)\s*===\s*'administracion'/);
  assert.match(billing,/const canRevert\s*=\s*\(\)\s*=>\s*\['administracion', 'facturacion'\]/);
  assert.match(legacyDesk,/Sólo Administración puede anular un servicio FINALIZADO/);
  assert.match(legacyDesk,/Sólo Administración puede modificar un servicio FINALIZADO/);
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

test('peaje separado no integra el importe del servicio',()=>{
  assert.match(tollQuote,/v_service_quote:=app_private\.calculate_operator_service_quote_v4_full/);
  assert.match(tollQuote,/v_current:=v_service_amount\+case when v_toll_billing_mode='with_service' then v_effective_toll else 0 end/);
  assert.match(tollQuote,/separate_toll_amount/);
  assert.match(tollQuote,/included_toll_amount/);
  assert.match(tollQuote,/service_company_amount/);
  assert.match(tollQuote,/company_amount_with_tolls/);
  assert.match(billing,/quote\.toll_billing_mode\s*!==\s*'separate'/);
  assert.match(billing,/Peajes facturados por separado/);
  assert.match(billing,/no forma parte del total del servicio/i);
});

test('Facturación incorpora Peajes sin duplicar la carga operativa',()=>{
  assert.match(tollDesk,/list_operator_billing_tolls_v1/);
  assert.match(tollDesk,/operator_service_tolls/);
  assert.match(tollDesk,/cfg\.toll_billing_mode='separate'/);
  assert.match(tollDesk,/t\.payer_agent='provider'/);
  assert.match(billing,/data-ob-tab="tolls">Peajes/);
  assert.match(billing,/function tollTableMarkup/);
  assert.match(billing,/function tollRowMarkup/);
  assert.match(billing,/list_operator_billing_tolls_v2/);
  assert.doesNotMatch(tollDesk,/create table.*toll/i);
});

test('exportador usa SheetJS ya cargado y genera XLSX real',()=>{
  assert.match(index,/xlsx\.full\.min\.js/);
  assert.match(excelExport,/window\.XLSX/);
  assert.match(excelExport,/utils\.aoa_to_sheet/);
  assert.match(excelExport,/utils\.book_new/);
  assert.match(excelExport,/writeFile/);
  assert.match(excelExport,/bookType:'xlsx'/);
  assert.doesNotMatch(excelExport,/text\/csv|\.csv/i);
});

test('Facturación conserva selección, servicios visibles y todo lo filtrado para Excel',()=>{
  assert.match(billingExport,/exportCurrent\s*=\s*\(\)\s*=>\s*openPicker\('current'\)/);
  assert.match(billingExport,/exportSelected\s*=\s*\(\)\s*=>\s*openPicker\('selected'\)/);
  assert.match(billingExport,/exportAllFiltered\s*=\s*\(\)\s*=>\s*openPicker\('all'\)/);
  assert.match(billing,/S\.tab === 'tolls' \? 'Peajes' : 'Servicios'/);
  assert.match(billing,/Todo lo filtrado/);
  assert.match(billingExport,/S\.selected/);
  assert.match(billingExport,/S\.tollRows/);
});

test('Excel permite elegir columnas antes de descargar',()=>{
  assert.match(billingExport,/Elegí qué columnas querés incluir/);
  assert.match(billingExport,/Seleccionar Todos/);
  assert.match(billingExport,/Deseleccionar Todos/);
  assert.match(billingExport,/data-obx-col/);
  assert.match(billingExport,/selectedColumns/);
  assert.match(billingExport,/confirmExport/);
});

test('catálogo Excel de servicios conserva los datos comerciales y operativos',()=>{
  const required=[
    'N° Orden','Fecha','Hora','Prestadora','Chofer','Móvil','Tipo de Servicio',
    'Calle Origen','Localidad Origen','Provincia Origen','Calle Destino','Localidad Destino','Provincia Destino',
    'Marca','Modelo','Patente','KM Asfalto','KM Ripio','KM Total','Precio Base','Tarifa KM Asfalto','Tarifa KM Ripio',
    'COPAGO','Extra %','Precio Total','Estado','Base','Importe Movida','Importe KM Asfalto','Importe KM Ripio','Importe KM Total',
    'Observaciones','Peajes','S. Esp. Cantidad','S. Esp. Unitario','S. Esp. Subtotal'
  ];
  for(const label of required)assert.ok(billingExport.includes(`'${label}'`),`falta columna ${label}`);
  for(const removed of ["header:'Moneda'","header:'Última revisión'","header:'Revisado por'","header:'Error tarifario'","header:'Importe al cierre'","header:'Diferencia'"]){
    assert.doesNotMatch(billingExport,new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }
});

test('exportación usa dataset canónico para tarifas, asignación final, KM y componentes',()=>{
  assert.match(exportMigration,/get_operator_billing_export_rows_v1/);
  assert.match(exportMigration,/v_role not in \('administracion','facturacion','supervision'\)/);
  assert.match(exportMigration,/event_type='finalized'/);
  assert.match(exportMigration,/old_driver_id/);
  assert.match(exportMigration,/old_truck_id/);
  assert.match(exportMigration,/calculate_operator_service_billing_quote_v2/);
  assert.match(exportMigration,/primary_price/);
  assert.match(exportMigration,/km_unit_price/);
  assert.match(exportMigration,/estimated_asphalt_km/);
  assert.match(exportMigration,/estimated_gravel_km/);
  assert.match(billingExport,/get_operator_billing_export_rows_v1/);
});

test('importe de KM por terreno conserva el subtotal canónico de distancia',()=>{
  assert.match(billingExport,/function distanceAmounts\(r\)/);
  assert.match(billingExport,/total\*asphalt\/km/);
  assert.match(billingExport,/round2\(total-a\)/);
  assert.match(billingExport,/Importe KM Asfalto/);
  assert.match(billingExport,/Importe KM Ripio/);
  assert.match(billingExport,/Importe KM Total/);
});

test('Excel de peajes conserva datos útiles y omite moneda administrativa',()=>{
  for(const label of ['Fecha','Hora','Prestadora','N° Orden','Estado','Base','Patente','Origen','Destino','Peaje','Ruta','Sentido','Cantidad','Importe','Origen del dato','Medio de pago','Fecha cruce','Pagador'])assert.ok(billingExport.includes(`'${label}'`));
  assert.doesNotMatch(billingExport,/header:'Moneda'/);
});

test('runtime carga Facturación y Excel canónicos sin assets de revisión paralelos',()=>{
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
  assert.match(sw,/auxilios-billing-phase2-v206/);
});
