const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const billingExport=fs.readFileSync('operator-billing-export.js','utf8');
const invoices=fs.readFileSync('operator-invoices.js','utf8');
const invoiceCss=fs.readFileSync('operator-invoices.css','utf8');
const migration=fs.readFileSync('migrations/20260818023000_operator_invoices_v1.sql','utf8');

test('Facturación expone una sola cola de Servicios sin Pendientes ni Revisados',()=>{
  assert.match(billing,/tab:'services'/);
  assert.match(billing,/data-ob-tab="services">Servicios/);
  assert.doesNotMatch(billing,/data-ob-tab="pending"|data-ob-tab="reviewed"/);
  assert.doesNotMatch(billing,/Marcar REVISADOS|Confirmar revisión masiva|Marcar REVISADO/);
  assert.match(billing,/list_operator_billing_services_v3/);
  assert.match(billing,/get_operator_billing_service_detail_v3/);
});

test('selección se factura directamente y luego abre el módulo Facturas',()=>{
  assert.match(billing,/Facturar selección/);
  assert.match(billing,/create_operator_invoice_v1/);
  assert.match(billing,/p_service_ids:ids/);
  assert.match(billing,/window\.OperatorInvoices\?\.open/);
  assert.doesNotMatch(billing,/review_operator_billing_service_v2|review_operator_billing_services_bulk_v2/);
});

test('backend crea una entidad Factura con líneas congeladas y mueve servicios a invoiced',()=>{
  assert.match(migration,/create table if not exists public\.operator_invoices/);
  assert.match(migration,/create table if not exists public\.operator_invoice_services/);
  assert.match(migration,/unique\(service_id\)/);
  assert.match(migration,/service_snapshot jsonb not null/);
  assert.match(migration,/quote_snapshot jsonb not null/);
  assert.match(migration,/create_operator_invoice_v1/);
  assert.match(migration,/No se pueden facturar juntas diferentes prestadoras/);
  assert.match(migration,/billing_status='invoiced'/);
  assert.match(migration,/'billing_invoiced'/);
  assert.match(migration,/operator_service_billing_revisions/);
  assert.match(migration,/'invoiced'/);
});

test('tablas de Facturas no tienen acceso directo y los RPC validan rol',()=>{
  assert.match(migration,/alter table public\.operator_invoices enable row level security/);
  assert.match(migration,/alter table public\.operator_invoice_services enable row level security/);
  assert.match(migration,/revoke all on table public\.operator_invoices from public,anon,authenticated/);
  assert.match(migration,/revoke all on table public\.operator_invoice_services from public,anon,authenticated/);
  assert.match(migration,/v_role not in \('administracion','facturacion'\)/);
  assert.match(migration,/grant execute on function public\.create_operator_invoice_v1\(uuid\[\]\) to authenticated/);
});

test('módulo Facturas lista y visualiza snapshots congelados',()=>{
  assert.match(invoices,/screen-facturas/);
  assert.match(invoices,/nav-facturas/);
  assert.match(invoices,/>Facturas</);
  assert.match(invoices,/list_operator_invoices_v1/);
  assert.match(invoices,/get_operator_invoice_detail_v1/);
  assert.match(invoices,/service_snapshot/);
  assert.match(invoices,/quote_snapshot/);
  for(const label of ['Factura','Prestadora','Servicios','Total','Estado','Creada por'])assert.match(invoices,new RegExp(label));
  assert.match(invoiceCss,/\.oi-table/);
  assert.match(invoiceCss,/\.oi-detail/);
});

test('Excel sigue el modelo unificado y no genera hojas Pendientes o Revisados',()=>{
  assert.match(billingExport,/label:'Servicios'/);
  assert.match(billingExport,/name:'Servicios'/);
  assert.doesNotMatch(billingExport,/name:'Pendientes'|name:'Revisados'/);
  assert.match(billingExport,/statusLabel=v=>v==='invoiced'\?'FACTURADO'/);
});
