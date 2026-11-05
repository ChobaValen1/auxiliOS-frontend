const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const billing = fs.readFileSync('operator-billing.js', 'utf8');
const invoices = fs.readFileSync('operator-invoices.js', 'utf8');
const css = fs.readFileSync('facturacion-ax-v1.css', 'utf8');

function load() {
  const window = { matchMedia: () => ({ matches: true }) };
  vm.runInNewContext(billing, { window, document: { readyState: 'loading', addEventListener() {} }, console, CSS: { escape: s => s } });
  return window.OperatorBilling;
}

test('con excedentes de la Prestadora se factura con la v5; sin ellos, la v4 de siempre', () => {
  assert.match(billing, /excessIds\.length\s*\? await db\(\)\.rpc\('create_operator_invoice_v5_km_v1', \{ \.\.\.payload, p_excess_service_ids: excessIds \}\)\s*: await db\(\)\.rpc\('create_operator_invoice_v4_km_v1', payload\)/);
});

test('Adicionales usa la v2 y cae a la v1 de sólo lectura si la base no la tiene', () => {
  assert.match(billing, /rpc\('list_operator_billing_extras_v2', params\)/);
  assert.match(billing, /rpc\('list_operator_billing_extras_v1', params\)/);
  assert.match(billing, /invoiceable: false/);
});

test('Adicionales muestra quién cobra y el estado de facturación de cada excedente', () => {
  const B = load();
  const { collectorPill, extraBillingState, excessGroups, joinParts } = B._test;
  assert.match(collectorPill({ collector_agent: 'provider' }), /is-provider[^>]*>Prestadora/);
  assert.match(collectorPill({ collector_agent: 'company' }), /is-company[^>]*>Empresa/);
  assert.match(extraBillingState({ collector_agent: 'company' }), /Cobro al cliente/);
  assert.match(extraBillingState({ collector_agent: 'provider', invoiceable: true }), /Para facturar/);
  assert.match(extraBillingState({ collector_agent: 'provider', invoice_number: 'Factura A 0004-1' }), /Facturado[\s\S]*Factura A 0004-1/);
  const groups = excessGroups([
    { service_id: 's1', collector_agent: 'provider', invoiceable: true, total_amount: 100 },
    { service_id: 's1', collector_agent: 'provider', invoiceable: true, total_amount: 50 },
    { service_id: 's1', collector_agent: 'company', invoiceable: false, total_amount: 999 },
    { service_id: 's2', collector_agent: 'provider', invoiceable: false, invoice_number: 'X', total_amount: 70 }
  ]);
  assert.deepEqual([...groups.keys()], ['s1'], 'sólo lo que cobra la Prestadora y no está facturado');
  assert.equal(groups.get('s1').total, 150);
  assert.equal(joinParts(['1 servicio', '2 peajes', '1 excedente']), '1 servicio, 2 peajes y 1 excedente');
});

test('la selección se conserva entre pestañas y sugiere sumar los excedentes del servicio', () => {
  assert.match(billing, /if \(S\.tab !== tab\.dataset\.obTab && tab\.dataset\.obTab === 'private'\) clearSelection\(\);/);
  assert.match(billing, /data-ob="add-related-excess"/);
  assert.match(billing, /function relatedPendingExcesses\(\)/);
});

test('redibujar conserva scroll y foco; las animaciones respetan movimiento reducido', () => {
  assert.match(billing, /function captureView\(screen\)/);
  assert.match(billing, /restoreView\(screen, view\);/);
  assert.match(billing, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.ob-selection\.is-entering \{ animation: ob-rise var\(--ax-dur-slow\)/);
  assert.match(css, /\.ob-collector\.is-provider \{ background: var\(--ax-info-soft\); color: var\(--ax-info\); \}/);
});

test('Facturas muestra, exporta y cuenta los excedentes', () => {
  assert.match(invoices, /function excessLineMarkup\(line\)/);
  assert.match(invoices, /Excedentes facturados <small>cobra la Prestadora<\/small>/);
  assert.match(invoices, /sheets\.push\(\{ name: 'Excedentes', columns: excessColumns, rows: excessRows \}\);/);
  assert.match(invoices, /released_excess_count/);
  assert.match(invoices, /\{ key: 'excesses', label: 'Excedentes'/);
});
