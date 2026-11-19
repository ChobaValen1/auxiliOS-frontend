const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const billing = fs.readFileSync('operator-billing.js', 'utf8');
const address = fs.readFileSync('address-parts-v1.js', 'utf8');
const breakdown = fs.readFileSync('billing-breakdown-v1.js', 'utf8');
const css = fs.readFileSync('facturacion-ax-v1.css', 'utf8');

function load() {
  const window = { matchMedia: () => ({ matches: true }) };
  const ctx = { window, document: { readyState: 'loading', addEventListener() {} }, console, CSS: { escape: s => s } };
  vm.runInNewContext(address, ctx);
  window.AuxiliosAddress = ctx.AuxiliosAddress || window.AuxiliosAddress;
  vm.runInNewContext(billing, ctx);
  return window.OperatorBilling;
}

test('el recorrido muestra la localidad arriba y la calle abajo, con la dirección completa en el título', () => {
  const { placeParts, placeCell } = load()._test;
  const full = 'Nicolás Avellaneda 1450, B1846AQE Adrogué, Provincia de Buenos Aires';
  assert.deepEqual({ ...placeParts(full) }, { raw: full, top: 'Adrogué', sub: 'Nicolás Avellaneda 1450' });
  assert.equal(placeParts('San José 1283, C1151 Cdad. Autónoma de Buenos Aires').top, 'CABA');
  const html = placeCell(full);
  assert.match(html, new RegExp(`title="${full}"`));
  assert.match(html, /<b>Adrogué<\/b><small>Nicolás Avellaneda 1450<\/small>/);
  // Sin localidad reconocible se muestra lo que haya, sin inventar.
  assert.equal(placeParts('-36.98, -56.89').top, '-36.98, -56.89');
  assert.match(placeCell(''), /—/);
});

test('sólo las filas con algo para revisar llevan alerta; ya no se repite «Pendiente»', () => {
  const { rowFlag, COLUMN_DEFS } = load()._test;
  assert.equal(rowFlag({ billing_delta: 0 }), '');
  assert.match(rowFlag({ pricing_error: 'Sin tarifa' }), /is-error[\s\S]*Error tarifario/);
  assert.match(rowFlag({ billing_delta: 12500, stored_company_amount: 1000, currency: 'ARS' }), /is-changed[\s\S]*Tarifa \+/);
  assert.match(rowFlag({ billing_delta: -300, currency: 'ARS' }), /Tarifa −/);
  const type = COLUMN_DEFS.services.find(c => c.key === 'type');
  assert.doesNotMatch(type.td({ service_name: 'Liviano', vehicle_plate: 'AB123CD' }), /Pendiente/);
});

test('N° de orden visible por defecto; Base pasa debajo de la prestadora', () => {
  const { COLUMN_DEFS } = load()._test;
  const col = key => COLUMN_DEFS.services.find(c => c.key === key);
  assert.equal(COLUMN_DEFS.services[0].key, 'order');
  assert.ok(!col('order').optional);
  assert.ok(col('base').optional);
  assert.match(col('company').td({ company_name: 'SOS', billing_base_name: 'Base Pinamar' }), /<b>SOS<\/b><small>Base Pinamar<\/small>/);
});

test('el pie de la tabla suma los servicios y cuenta las alertas', () => {
  const B = load();
  const html = B._test.servicesFootMarkup([
    { current_company_amount: 100, currency: 'ARS' },
    { current_company_amount: 50.5, currency: 'ARS', billing_delta: 10 },
    { current_company_amount: 0, currency: 'ARS', pricing_error: 'x' }
  ]);
  assert.match(html, /<tfoot>/);
  assert.match(html, /3 servicios/);
  assert.match(html, /data-ob-tween="150.5"/);
  assert.match(html, /1 con error tarifario/);
  assert.match(html, /1 con tarifa cambiada/);
  assert.match(B._test.servicesFootMarkup([{ current_company_amount: 1, currency: 'ARS' }, { current_company_amount: 1, currency: 'USD' }]), /Varias monedas/);
});

test('la fila abre el detalle con click o Enter, y el detalle se recorre con ‹ › y las flechas', () => {
  assert.match(billing, /data-ob-open="\$\{esc\(id\)\}" tabindex="0"/);
  assert.match(billing, /event\.target\.closest\('input, button, a, label, select, textarea'\)/);
  assert.match(billing, /event\.key === 'ArrowLeft'\) \{ event\.preventDefault\(\); return stepDetail\(-1\)/);
  assert.match(billing, /event\.key === 'ArrowRight'\) \{ event\.preventDefault\(\); return stepDetail\(1\)/);
  assert.match(billing, /event\.key === 'Escape'\) \{ event\.preventDefault\(\); return closeDetail\(\)/);
  assert.match(billing, /data-ob="detail-prev"/);
  assert.match(billing, /data-ob="detail-next"/);
  // Una respuesta vieja no pisa al servicio que se está mirando.
  assert.match(billing, /if \(S\.detailToken !== token\) return;/);
});

test('detailNav recorre los servicios en el orden de la tabla', () => {
  const B = load();
  B.S.rows = [{ service_id: 'a' }, { service_id: 'b' }, { service_id: 'c' }];
  B.S.detailId = 'b';
  const nav = B._test.detailNav();
  assert.equal(nav.index, 1);
  assert.equal(nav.prev.service_id, 'a');
  assert.equal(nav.next.service_id, 'c');
  B.S.detailId = 'c';
  assert.equal(B._test.detailNav().next, null);
});

test('desde el detalle se suma o se quita el servicio de la factura, sin acciones administrativas', () => {
  const detail = billing.split('function detailMarkup()')[1].split('function render()')[0];
  assert.match(detail, /data-ob="detail-toggle-select"/);
  assert.match(detail, /Sumar a la factura/);
  assert.match(detail, /canInvoice\(\) && row\.service_id && !pricingError/);
  assert.match(billing, /action === 'detail-toggle-select'\) \{ if \(S\.detailId\) toggleSelection\(S\.detailId, !S\.selected\.has\(String\(S\.detailId\)\)\)/);
  assert.doesNotMatch(detail, /data-ob-row-action|Anular|Revertir/);
});

test('el desglose dice de dónde sale el precio en palabras', () => {
  const ctx = { globalThis: {} };
  ctx.window = ctx.globalThis;
  vm.runInNewContext(breakdown, ctx);
  const bd = ctx.window.AuxiliosBillingBreakdown;
  const { filas } = bd.filas({ currency: 'ARS', current_company_amount: 100, components: [{ service_name: 'Liviano', pricing_unit: 'service', price_source: 'general', quantity: 1, unit_price: 100, subtotal: 100 }] });
  assert.equal(filas[0].detalle, 'Fijo por servicio · Tarifa general');
});

test('celular: tarjeta compacta sin etiquetas en los datos principales y total pegado abajo', () => {
  assert.match(css, /\.ob-services-table td\[data-label\]:not\(\[data-col="datetime"\]\)::before \{ display: none; \}/);
  assert.match(css, /\.ob-services-table tfoot \{ position: sticky; bottom: 8px;/);
  assert.match(css, /\.ob-table-card:has\(\.ob-services-table\) \{ overflow: visible; \}/);
});
