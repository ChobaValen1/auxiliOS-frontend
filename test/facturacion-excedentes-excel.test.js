const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('operator-billing-export.js', 'utf8');
const billing = fs.readFileSync('operator-billing.js', 'utf8');

function load(S) {
  const window = { OperatorBilling: { S }, localStorage: { getItem: () => null, setItem() {} } };
  vm.runInNewContext(source, { window, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, console, Intl, queueMicrotask });
  return window.OperatorBillingExcel;
}
const rows = [
  { service_id: 's1', concept_name: 'Hora de espera', collector_agent: 'provider', invoiceable: true, total_amount: 24000 },
  { service_id: 's1', concept_name: 'Batería', collector_agent: 'company', customer_payment_method: 'transfer', total_amount: 180000 },
  { service_id: 's2', concept_name: 'Km', collector_agent: 'provider', invoice_number: 'Factura A 0004-1', invoiceable: false, total_amount: 12000 }
];

test('la hoja de excedentes dice quién cobra, cómo y si se facturó', () => {
  const E = load({ allExtraRows: rows, extraRows: rows });
  const col = id => E.excessColumns.find(c => c.id === id);
  assert.equal(col('collector').value(rows[0]), 'Prestadora');
  assert.equal(col('collector').value(rows[1]), 'Empresa');
  assert.equal(col('payment').value(rows[0]), 'Se factura a la Prestadora');
  assert.equal(col('payment').value(rows[1]), 'Transferencia');
  assert.equal(col('billing').value(rows[0]), 'Para facturar a la Prestadora');
  assert.equal(col('billing').value(rows[2]), 'Facturado a la Prestadora');
  assert.equal(col('invoice').value(rows[2]), 'Factura A 0004-1');
});

test('el resumen separa lo que falta facturar, lo facturado y lo que cobra la Empresa', () => {
  const E = load({ allExtraRows: rows });
  const r = E.excessSummaryRows(rows);
  assert.deepEqual(JSON.parse(JSON.stringify(r.map(x => [x.label, x.count, x.amount]))), [
    ['Para facturar a la Prestadora', 1, 24000], ['Facturado a la Prestadora', 1, 12000],
    ['Cobra la Empresa al cliente', 1, 180000], ['Total', 3, 216000]]);
});

test('Servicios lleva los excedentes de sus servicios; Todo lo filtrado, todos los visibles', () => {
  const E = load({ allExtraRows: rows, extraRows: rows });
  assert.equal(E.excessRowsFor({ kind: 'selected', serviceRows: [{ service_id: 's1' }] }).length, 2);
  assert.equal(E.excessRowsFor({ kind: 'all', serviceRows: [] }).length, 3);
  assert.match(source, /sheets\.push\(\{name:'Excedentes',columns:excessColumns,rows:excessRows\}\)/);
  assert.match(source, /'excess_provider','excess_provider_pending','excess_company'\]\);/);
});

test('la pestaña Adicionales tiene su propio Excel', () => {
  assert.match(billing, /data-ob="excel-extras"/);
  assert.match(billing, /excelAction === 'excel-extras'\) return window\.OperatorBillingExcel\?\.exportExtras\?\.\(\)/);
  assert.match(source, /name:'Resumen',columns:excessSummaryColumns/);
});
