'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('ui/export-picker-v1.js'), css = read('ui/export-picker-v1.css'), sigma = read('sigma.js'), invoices = read('operator-invoices.js'), index = read('Index.html');

function load(saved) {
  const store = new Map(saved ? [['auxilios.export.columns.v1.k', JSON.stringify(saved)]] : []);
  const window = { localStorage: { getItem: k => store.get(k) || null, setItem: (k, v) => store.set(k, v) } };
  vm.runInNewContext(src, { window, document: {} });
  return window.AuxiliosExportPicker;
}
const cols = [{ id: 'a', header: 'A' }, { id: 'b', header: 'B' }, { id: 'c', header: 'C', optional: true }];

test('selector de exportación: sin preferencias elige las columnas no opcionales, en Excel', () => {
  const r = load()._restore('k', cols);
  assert.equal(JSON.stringify(r.order), '["a","b","c"]');
  assert.equal(JSON.stringify(r.selected), '["a","b"]');
  assert.equal(r.format, 'xlsx');
});

test('selector de exportación: recuerda orden, selección y formato, y suma columnas nuevas al final', () => {
  const r = load({ order: ['b', 'x', 'a'], selected: ['b', 'x'], format: 'csv' })._restore('k', cols);
  assert.equal(JSON.stringify(r.order), '["b","a","c"]');
  assert.equal(JSON.stringify(r.selected), '["b"]');
  assert.equal(r.format, 'csv');
});

test('selector de exportación: Excel o CSV con el exportador de AuxiliOS y estética del sistema', () => {
  assert.match(src, /excel\.downloadCsv\(\{ filename: o\.filename, columns: choice\.columns/);
  assert.match(src, /excel\.download\(\{ filename: o\.filename, summaryRows: o\.summaryRows/);
  assert.match(src, /e\.key === 'Escape'/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i);
  assert.match(css, /\.axx-primary \{ border: 1px solid var\(--ax-accent\); background: var\(--ax-accent\)/);
  assert.match(index, /\/ui\/export-picker-v1\.js\?v=/);
});

test('Jornadas y Facturas usan el selector de columnas', () => {
  assert.match(sigma, /AuxiliosExportPicker\.open\(\{ key: 'jornadas'/);
  assert.match(index, /id="jadmin-export">[^<]*<svg[^>]*>.*<\/svg> Exportar<\/button>/);
  assert.match(invoices, /picker\.open\(\{ key: 'facturas'/);
  assert.match(invoices, /data-oi="export"/);
  assert.match(invoices, /if \(action === 'export'\) return exportList\(\);/);
});
