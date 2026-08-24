const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const billing = read('operator-billing.js');
const invoices = read('operator-invoices.js');
const css = read('operator-billing.css');
const migration = read('migrations/20260824163000_operator_invoice_manual_number_v2.sql');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `No se encontró ${nextName}`);
  return source.slice(start, end);
}

test('Facturar selección abre un modal antes de crear la factura', () => {
  const click = functionBody(billing, 'onClick', 'onDocumentClick');
  assert.match(click, /if\(a==='invoice-selection'\)return openInvoice\(\)/);
  assert.match(click, /if\(a==='confirm-invoice'\)return createInvoice\(\)/);
  assert.doesNotMatch(click, /if\(a==='invoice-selection'\)return createInvoice\(\)/);
});

test('el modal permite ingresar la numeración real y la fecha', () => {
  assert.match(billing, /data-ob-invoice-field="document_type"/);
  assert.match(billing, /Factura A/);
  assert.match(billing, /Factura B/);
  assert.match(billing, /Factura C/);
  assert.match(billing, /data-ob-invoice-field="point_of_sale"/);
  assert.match(billing, /data-ob-invoice-field="document_number"/);
  assert.match(billing, /data-ob-invoice-field="issued_on"/);
  assert.match(billing, /data-ob-invoice-field="notes"/);
});

test('el resumen de la factura cuenta los grupos canónicos solicitados', () => {
  const groups = functionBody(billing, 'invoiceGroupCounts', 'freshInvoiceForm');
  assert.match(groups, /name==='liviano'/);
  assert.match(groups, /name==='semipesado'/);
  assert.match(groups, /name==='uml'/);
  assert.match(billing, /Total servicios/);
  assert.match(billing, /Liviano/);
  assert.match(billing, /Semipesado/);
  assert.match(billing, /UML/);
  assert.match(billing, /Total a facturar/);
});

test('la creación usa la RPC v2 y no la numeración FAC automática desde la UI', () => {
  const create = functionBody(billing, 'createInvoice', 'confirmAdminAction');
  assert.match(create, /create_operator_invoice_v2/);
  assert.match(create, /p_document_type/);
  assert.match(create, /p_point_of_sale/);
  assert.match(create, /p_document_number/);
  assert.match(create, /p_issued_on/);
  assert.doesNotMatch(create, /create_operator_invoice_v1/);
});

test('el modal de factura es compacto y no tiene scroll propio en escritorio', () => {
  const desktopRule = css.match(/\.ob-invoice-modal\{[^}]+\}/)?.[0] || '';
  assert.match(desktopRule, /overflow:hidden/);
  assert.match(desktopRule, /max-height:calc\(100vh - 132px\)/);
  assert.match(css, /\.ob-invoice-fields\{display:grid;grid-template-columns:1\.05fr \.8fr 1fr 1fr/);
  assert.match(css, /\.ob-invoice-fields input,[^{]+\{[^}]*font-size:12px/);
  assert.match(css, /\.ob-invoice-total b\{[^}]*font-size:25px/);
});

test('la base guarda el número ingresado y evita duplicados semánticos', () => {
  assert.match(migration, /add column if not exists document_type text/);
  assert.match(migration, /add column if not exists point_of_sale text/);
  assert.match(migration, /add column if not exists document_number text/);
  assert.match(migration, /create unique index if not exists operator_invoices_external_number_uq/);
  assert.match(migration, /\(\(point_of_sale\)::numeric\)/);
  assert.match(migration, /\(\(document_number\)::numeric\)/);
  assert.match(migration, /create or replace function public\.create_operator_invoice_v2/);
  assert.match(migration, /Ya existe la %/);
});

test('V1 queda como compatibilidad y V2 comparte un único núcleo de creación', () => {
  assert.match(migration, /create or replace function app_private\.create_operator_invoice_core_v2/);
  const v1Start = migration.indexOf('create or replace function public.create_operator_invoice_v1');
  const v2Start = migration.indexOf('create or replace function public.create_operator_invoice_v2');
  assert.ok(v1Start >= 0 && v2Start > v1Start);
  const v1 = migration.slice(v1Start, v2Start);
  assert.match(v1, /create_operator_invoice_core_v2/);
  assert.doesNotMatch(v1, /insert into public\.operator_invoice_services/);
});

test('Facturas muestra el número real, la fecha de emisión y observaciones', () => {
  assert.match(invoices, /r\.invoice_number/);
  assert.match(invoices, /invoiceDate\(r\.issued_on,r\.created_at\)/);
  assert.match(invoices, /Fecha de emisión/);
  assert.match(invoices, /i\.notes/);
});
