const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const TC = require('../table-columns-v1.js');

const catalog = [
  { key: 'a', label: 'A', locked: true },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C', optional: true },
  { key: 'd', label: 'D' }
];

test('sin nada guardado: lo opcional queda oculto y el orden es el del catálogo', () => {
  const r = TC.reconcile(catalog, null);
  assert.deepEqual(r.map(i => i.key), ['a', 'b', 'c', 'd']);
  assert.deepEqual(r.filter(i => i.visible).map(i => i.key), ['a', 'b', 'd']);
});

test('lo guardado manda, y lo bloqueado nunca se oculta', () => {
  const r = TC.reconcile(catalog, { order: ['d', 'a', 'b', 'c'], visible: { a: false, b: false, c: true, d: true } });
  assert.deepEqual(r.map(i => i.key), ['d', 'a', 'b', 'c']);
  assert.equal(r.find(i => i.key === 'a').visible, true);
  assert.equal(r.find(i => i.key === 'b').visible, false);
  assert.equal(r.find(i => i.key === 'c').visible, true);
});

test('si el catálogo cambia, las columnas nuevas se suman y las que ya no existen se descartan', () => {
  const r = TC.reconcile([...catalog, { key: 'e', label: 'E' }], { order: ['zz', 'b', 'a'], visible: { zz: true, b: true } });
  assert.deepEqual(r.map(i => i.key), ['b', 'a', 'c', 'd', 'e']);
  assert.equal(r.find(i => i.key === 'e').visible, true);
});

test('Facturación y Facturas usan columnas personalizables y las cargan', () => {
  const billing = fs.readFileSync('operator-billing.js', 'utf8'), invoices = fs.readFileSync('operator-invoices.js', 'utf8');
  const config = fs.readFileSync('config.js', 'utf8'), sw = fs.readFileSync('sw.js', 'utf8');
  assert.match(billing, /data-ob="columns"/);
  assert.match(invoices, /data-oi="columns"/);
  for (const tab of ['services', 'tolls', 'extras', 'private']) assert.match(billing, new RegExp(`${tab}: \\[`));
  assert.match(billing, /Importe a facturar/);
  assert.match(config, /table-columns-v1\.js/);
  assert.match(sw, /table-columns-v1\.js/);
});
