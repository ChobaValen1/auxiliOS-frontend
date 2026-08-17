const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const billing=fs.readFileSync('operator-billing.js','utf8');
const billingCss=fs.readFileSync('operator-billing.css','utf8');
const config=fs.readFileSync('config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const migration=fs.readFileSync('migrations/20260817133000_operator_billing_core_v1.sql','utf8');

test('Facturación usa lifecycle independiente FINALIZADO -> PENDIENTE -> REVISADO',()=>{
  assert.match(migration,/billing_status in \('pending','reviewed','invoiced','excluded'\)/);
  assert.match(migration,/Sólo un servicio PENDIENTE puede marcarse REVISADO/);
  assert.match(migration,/set billing_status='reviewed'/);
  assert.doesNotMatch(billing,/mark.*invoiced|invoice_operator|facturarServicio/);
});

test('importe de Facturación se recalcula con tarifa vigente del período y conserva snapshot operativo',()=>{
  assert.match(migration,/calculate_operator_service_billing_quote_v1/);
  assert.match(migration,/calculate_operator_service_quote_v4_full/);
  assert.match(migration,/stored_company_amount/);
  assert.match(migration,/current_company_amount/);
  assert.match(migration,/billing_delta/);
  assert.match(migration,/billing_source','current_tariff_period/);
  assert.doesNotMatch(migration,/update public\.operator_services[\s\S]*pricing_snapshot\s*=/);
});

test('revisión genera snapshot administrativo auditable sin generar factura',()=>{
  assert.match(migration,/create table if not exists public\.operator_service_billing_revisions/);
  assert.match(migration,/quote_snapshot jsonb not null/);
  assert.match(migration,/previous_company_amount/);
  assert.match(migration,/rate_card_version/);
  assert.match(migration,/created_by uuid not null default auth\.uid\(\)/);
  assert.match(migration,/review_operator_billing_service_v1/);
});

test('Administración y Facturación revisan; Supervisión sólo consulta',()=>{
  assert.match(migration,/v_role not in \('administracion','facturacion','supervision'\)/);
  assert.match(migration,/v_role not in \('administracion','facturacion'\)/);
  assert.match(billing,/const canRead=\(\)=>\['administracion','facturacion','supervision'\]/);
  assert.match(billing,/const canReview=\(\)=>\['administracion','facturacion'\]/);
});

test('mesa canónica inyecta navegación, Pendientes y Revisados sin popup global de confirmación',()=>{
  assert.match(billing,/nav-facturacion/);
  assert.match(billing,/screen-facturacion/);
  assert.match(billing,/data-ob-tab="pending"/);
  assert.match(billing,/data-ob-tab="reviewed"/);
  assert.match(billing,/Confirmar REVISADO/);
  assert.match(billing,/review_operator_billing_service_v1/);
  assert.doesNotMatch(billing,/window\.confirm|[^\.]confirm\(/);
  assert.match(billingCss,/\.ob-detail-backdrop/);
});

test('runtime carga y cachea Facturación canónica',()=>{
  assert.match(config,/auxilios-operator-billing.*operator-billing\.js/);
  assert.match(sw,/operator-billing\.js/);
  assert.match(sw,/operator-billing\.css/);
  assert.match(sw,/auxilios-v200/);
});
