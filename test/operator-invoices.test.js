const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const billingExport=fs.readFileSync('operator-billing-export.js','utf8');
const invoices=fs.readFileSync('operator-invoices.js','utf8');
const invoiceCss=fs.readFileSync('operator-invoices.css','utf8');
const baseMigration=fs.readFileSync('migrations/20260818023000_operator_invoices_v1.sql','utf8');
const workflowMigration=fs.readFileSync('migrations/20260824221500_operator_invoice_workflow_v3.sql','utf8');

test('Facturación expone una sola cola y una única acción directa FACTURAR',()=>{
  assert.match(billing,/tab:\s*'services'/);
  assert.match(billing,/data-ob-tab="services">Servicios/);
  assert.doesNotMatch(billing,/data-ob-tab="pending"|data-ob-tab="reviewed"/);
  assert.doesNotMatch(billing,/approve-selection|openApproval|approveSelection|review_operator_billing_services_bulk_v2/);
  assert.match(billing,/data-ob="invoice-selection"/);
  assert.match(billing,/Facturando…'\s*:\s*'FACTURAR'/);
  assert.match(billing,/create_operator_invoice_v3/);
  assert.match(billing,/p_service_ids:\s*serviceIds/);
  assert.match(billing,/p_service_toll_ids:\s*tollIds/);
  assert.doesNotMatch(billing,/create_operator_invoice_v1|create_operator_invoice_v2/);
  assert.match(billing,/window\.OperatorInvoices\?\.open/);
});

test('modelo base conserva snapshots y v3 permite refacturar sólo líneas liberadas',()=>{
  assert.match(baseMigration,/create table if not exists public\.operator_invoices/);
  assert.match(baseMigration,/create table if not exists public\.operator_invoice_services/);
  assert.match(baseMigration,/service_snapshot jsonb not null/);
  assert.match(baseMigration,/quote_snapshot jsonb not null/);
  assert.match(workflowMigration,/add column if not exists released_at timestamptz/);
  assert.match(workflowMigration,/drop constraint if exists operator_invoice_services_service_id_key/);
  assert.match(workflowMigration,/operator_invoice_services_active_service_uq/);
  assert.match(workflowMigration,/where released_at is null/);
});

test('anular conserva historial y devuelve servicios a Facturación',()=>{
  assert.match(workflowMigration,/create or replace function public\.annul_operator_invoice_v2/);
  assert.match(workflowMigration,/set billing_status='pending'/);
  assert.match(workflowMigration,/set released_at=now\(\),released_by=auth\.uid\(\),release_reason=v_reason/);
  assert.match(workflowMigration,/set status='cancelled'/);
  assert.match(workflowMigration,/billing_invoice_cancelled/);
  assert.doesNotMatch(workflowMigration,/delete from public\.operator_invoice_services/);
});

test('Facturas expone PDF, Excel, Nota de Crédito y Anular desde un solo menú',()=>{
  assert.match(invoices,/Adjuntar PDF/);
  assert.match(invoices,/Descargar Excel/);
  assert.match(invoices,/Emitir Nota de Crédito/);
  assert.match(invoices,/>Anular</);
  assert.match(invoices,/attach_operator_invoice_pdf_v1/);
  assert.match(invoices,/create_operator_invoice_credit_note_v1/);
  assert.match(invoices,/annul_operator_invoice_v2/);
  assert.match(invoices,/AuxiliosExcelExport/);
  assert.match(invoiceCss,/\.oi-action-menu/);
  assert.match(invoiceCss,/\.oi-modal/);
});

test('PDF usa un único bucket privado y guarda sólo la referencia en factura',()=>{
  assert.match(workflowMigration,/operator-invoice-pdfs/);
  assert.match(workflowMigration,/values\('operator-invoice-pdfs','operator-invoice-pdfs',false,/);
  assert.match(workflowMigration,/set public=false/);
  assert.match(workflowMigration,/allowed_mime_types/);
  assert.match(workflowMigration,/application\/pdf/);
  assert.match(workflowMigration,/add column if not exists pdf_path text/);
  assert.match(workflowMigration,/attach_operator_invoice_pdf_v1/);
  assert.match(invoices,/const PDF_BUCKET\s*=\s*'operator-invoice-pdfs'/);
  assert.match(invoices,/storage\.upload\(path,file,\{upsert:true/);
});

test('Nota de Crédito es total, se asocia a la factura y no libera servicios',()=>{
  assert.match(workflowMigration,/create table if not exists public\.operator_invoice_credit_notes/);
  assert.match(workflowMigration,/unique\(invoice_id\)/);
  assert.match(workflowMigration,/v_invoice\.total_amount/);
  const creditStart=workflowMigration.indexOf('create or replace function public.create_operator_invoice_credit_note_v1');
  const creditBody=workflowMigration.slice(creditStart);
  assert.doesNotMatch(creditBody,/released_at=now\(\)/);
  assert.doesNotMatch(creditBody,/billing_status='pending'/);
  assert.match(creditBody,/set status='credited'/);
});

test('módulo Facturas consulta la API v2 y mantiene snapshots congelados',()=>{
  assert.match(invoices,/screen-facturas/);
  assert.match(invoices,/nav-facturas/);
  assert.match(invoices,/list_operator_invoices_v2/);
  assert.match(invoices,/get_operator_invoice_detail_v2/);
  assert.match(invoices,/service_snapshot/);
  assert.match(invoices,/quote_snapshot/);
  for(const label of ['Factura','Prestadora','Servicios','Total','Estado'])assert.match(invoices,new RegExp(label));
});

test('Excel general sigue unificado y no recrea Pendientes/Revisados',()=>{
  assert.match(billingExport,/label:'Servicios'/);
  assert.match(billingExport,/name:'Servicios'/);
  assert.doesNotMatch(billingExport,/name:'Pendientes'|name:'Revisados'/);
  assert.match(billingExport,/statusLabel=v=>v==='invoiced'\?'FACTURADO'/);
});
