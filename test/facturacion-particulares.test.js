const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const billing = fs.readFileSync('operator-billing.js', 'utf8');
const view = fs.readFileSync('private-view-v1.js', 'utf8');
const filters = fs.readFileSync('auxilios-filters-v1.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928210000_facturacion_particulares_adicionales_v11.sql', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');

test('Facturación tiene las pestañas Adicionales y Particulares', () => {
  assert.match(billing, /data-ob-tab="extras">Adicionales<\/button>/);
  assert.match(billing, /data-ob-tab="private">Particulares/);
  assert.match(billing, /list_operator_billing_private_v1/);
  assert.match(billing, /list_operator_billing_extras_v1/);
  // Los particulares salen de Servicios.
  assert.match(billing, /const serviceRows = \(\) => S\.rows\.filter\(row => !isPrivate\(row\)\);/);
});

test('un particular se factura de a uno o se cierra sin factura con motivo', () => {
  assert.match(billing, /\/\/ Una factura por cliente: se factura de a un servicio particular\.\s*clearSelection\(\);/);
  assert.match(billing, /close_private_billing_without_invoice_v1/);
  assert.match(sql, /update public\.operator_services set billing_status = 'excluded'/);
  assert.match(sql, /El cliente pidió factura: indicá por qué se cierra sin factura/);
  assert.match(sql, /join public\.companies c on c\.company_id = s\.company_id and c\.client_kind = 'particular'/);
});

test('entrar a un servicio particular abre su ficha propia', () => {
  assert.match(view, /if \(esParticular\(servicio\(id\)\)\) return abrir\(id\);/);
  assert.match(view, /global\.verServicioWorkspace = w;/);
  ['Cliente', 'Vehículo', 'Servicio', 'Cobro', 'Chofer y móvil', 'Remito'].forEach(t => assert.match(view, new RegExp('<h3>' + t + '</h3>')));
  assert.match(config, /'\/private-view-v1\.js'/);
  const win = {};
  vm.runInNewContext(view, { window: win, document: { getElementById: () => null, addEventListener() {} }, setInterval: () => 0, clearInterval() {}, console });
  assert.equal(win.AuxiliosVistaParticular._test.esParticular({ quoted_total: 100 }), true);
  assert.equal(win.AuxiliosVistaParticular._test.esParticular({ company_name: 'Addiuva' }), false);
});

test('el período tiene accesos rápidos dentro del mismo selector', () => {
  const c = { window: {}, document: { addEventListener() {} }, console };
  vm.runInNewContext(filters, c);
  const F = c.window.AuxFilters;
  const hoy = F.rangoRapido('hoy');
  assert.equal(hoy.desde, hoy.hasta);
  assert.ok(F.rangoRapido('7d').desde < F.rangoRapido('7d').hasta);
  assert.equal(F.describePeriod({ mode: 'rango', desde: hoy.desde, hasta: hoy.hasta, quick: 'hoy' }).titulo, 'Hoy');
  assert.match(F.period({ id: 'x', quick: true }), /data-auxf-quick="semana"/);
  assert.match(F.select({ id: 'e', label: 'Estado', options: [{ value: 'a', label: 'A' }, { group: 'Alertas' }] }), /<h5 class="auxf-group">Alertas<\/h5>/);
});
