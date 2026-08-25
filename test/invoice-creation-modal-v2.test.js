const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const billing = read('operator-billing.js');
const invoices = read('operator-invoices.js');
const css = read('operator-billing.css');
const manualNumberMigration = read('migrations/20260824163000_operator_invoice_manual_number_v2.sql');
const tollInvoiceMigration = read('migrations/20260825093000_operator_invoice_tolls_v4.sql');

function functionBody(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `No se encontró ${name}`);
  const end = nextName ? source.indexOf(`function ${nextName}`, start + 1) : source.length;
  assert.notEqual(end, -1, `No se encontró ${nextName}`);
  return source.slice(start, end);
}

test('Facturar selección abre un modal antes de crear la factura', () => {
  const click = functionBody(billing, 'onClick', 'onDocumentClick');
  assert.match(click, /action === 'invoice-selection'\) return openInvoice\(\)/);
  assert.match(click, /action === 'confirm-invoice'\) return createInvoice\(\)/);
  assert.doesNotMatch(click, /action === 'invoice-selection'\) return createInvoice\(\)/);
});

test('el modal permite ingresar la numeración real y la fecha', () => {
  for (const field of ['document_type', 'point_of_sale', 'document_number', 'issued_on', 'notes']) {
    assert.match(billing, new RegExp(`data-ob-invoice-field="${field}"`));
  }
  for (const label of ['Factura A', 'Factura B', 'Factura C']) assert.match(billing, new RegExp(label));
});

test('el resumen diferencia servicios, peajes y grupos canónicos', () => {
  const start = billing.indexOf('function invoiceGroupCounts');
  const end = billing.indexOf('const freshInvoiceForm', start);
  assert.notEqual(start, -1, 'No se encontró invoiceGroupCounts');
  assert.notEqual(end, -1, 'No se encontró freshInvoiceForm');
  const groups = billing.slice(start, end);
  assert.match(groups, /name === 'liviano'/);
  assert.match(groups, /name === 'semipesado'/);
  assert.match(groups, /name === 'uml'/);
  for (const label of ['Servicios', 'Peajes', 'Liviano', 'Semipesado', 'UML', 'Total a facturar']) {
    assert.match(billing, new RegExp(label));
  }
});

test('la selección puede combinar servicios y peajes de una sola prestadora y moneda', () => {
  assert.match(billing, /selectedTolls: new Set\(\)/);
  assert.match(billing, /const selectedTollRows =/);
  assert.match(billing, /selectedCompanies\(\)/);
  assert.match(billing, /selectedCurrencies\(\)/);
  assert.match(billing, /S\.selected\.size \+ S\.selectedTolls\.size/);
  assert.match(billing, /data-ob-toll-select=/);
  assert.match(billing, /data-ob-toll-select-all/);
});

test('Crear factura usa V3 con servicios y peajes y no duplica el flujo V2 en la UI', () => {
  const create = functionBody(billing, 'createInvoice', 'confirmAdminAction');
  assert.match(create, /create_operator_invoice_v3/);
  assert.match(create, /p_service_ids: serviceIds/);
  assert.match(create, /p_service_toll_ids: tollIds/);
  assert.match(create, /p_document_type: form\.document_type/);
  assert.match(create, /p_point_of_sale: form\.point_of_sale/);
  assert.match(create, /p_document_number: form\.document_number/);
  assert.match(create, /p_issued_on: form\.issued_on/);
  assert.doesNotMatch(create, /create_operator_invoice_v1|create_operator_invoice_v2/);
});

test('el modal de factura sigue compacto y sin scroll propio en escritorio', () => {
  const desktopRule = css.match(/\.ob-invoice-modal\{[^}]+\}/)?.[0] || '';
  assert.match(desktopRule, /overflow:hidden/);
  assert.match(desktopRule, /max-height:calc\(100vh - 132px\)/);
  assert.match(css, /\.ob-invoice-fields\{display:grid;grid-template-columns:1\.05fr \.8fr 1fr 1fr/);
  assert.match(css, /\.ob-invoice-fields input,[^{]+\{[^}]*font-size:12px/);
  assert.match(css, /\.ob-invoice-total b\{[^}]*font-size:25px/);
  assert.match(css, /@media\(max-height:620px\)\{\.ob-invoice-modal\{max-height:calc\(100vh - 24px\);overflow:auto\}\}/);
});

test('la base guarda el número ingresado y evita duplicados semánticos', () => {
  assert.match(manualNumberMigration, /add column if not exists document_type text/);
  assert.match(manualNumberMigration, /add column if not exists point_of_sale text/);
  assert.match(manualNumberMigration, /add column if not exists document_number text/);
  assert.match(manualNumberMigration, /create unique index if not exists operator_invoices_external_number_uq/);
  assert.match(manualNumberMigration, /\(\(point_of_sale\)::numeric\)/);
  assert.match(manualNumberMigration, /\(\(document_number\)::numeric\)/);
  assert.match(manualNumberMigration, /Ya existe la %/);
});

test('V4 reemplaza el núcleo anterior y conserva wrappers V1/V2 de compatibilidad', () => {
  assert.match(tollInvoiceMigration, /create or replace function app_private\.create_operator_invoice_core_v3/);
  assert.match(tollInvoiceMigration, /create or replace function public\.create_operator_invoice_v3/);
  assert.match(tollInvoiceMigration, /create or replace function public\.create_operator_invoice_v2/);
  assert.match(tollInvoiceMigration, /create or replace function public\.create_operator_invoice_v1/);
  assert.match(tollInvoiceMigration, /drop function if exists app_private\.create_operator_invoice_core_v2/);
  assert.match(tollInvoiceMigration, /p_service_toll_ids uuid\[\]/);
});

test('Facturas muestra numeración real, emisión, servicios y peajes', () => {
  assert.match(invoices, /row\.invoice_number/);
  assert.match(invoices, /invoiceDate\(row\.issued_on, row\.created_at\)/);
  assert.match(invoices, /Fecha de emisión/);
  assert.match(invoices, /invoice\.notes/);
  assert.match(invoices, /invoice\.service_count/);
  assert.match(invoices, /invoice\.toll_count/);
});
