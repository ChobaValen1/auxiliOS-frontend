const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=fs.readFileSync('operator-billing.js','utf8');
const billingCss=fs.readFileSync('operator-billing.css','utf8');
const config=fs.readFileSync('config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const foundation=fs.readFileSync('migrations/20260817133000_operator_billing_core_v1.sql','utf8');
const migration=fs.readFileSync('migrations/20260817141500_operator_billing_desk_v2.sql','utf8');

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

test('runtime carga y cachea Facturación canónica v201',()=>{
  assert.match(config,/auxilios-operator-billing.*operator-billing\.js/);
  assert.match(sw,/operator-billing\.js/);
  assert.match(sw,/operator-billing\.css/);
  assert.match(sw,/auxilios-v201/);
});