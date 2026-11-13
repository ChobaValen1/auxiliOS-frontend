const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const src = fs.readFileSync('dashboard-compact-v1.js', 'utf8');
function cargar() {
  const window = {};
  vm.runInNewContext(src, { window, document: { getElementById: () => null, querySelector: () => null }, setInterval: () => 0, clearInterval() {}, Event: class {} });
  return window.AuxDashCompacto;
}

test('Panel compacto: los filtros activos se muestran como chips con su nombre y se pueden quitar', () => {
  const C = cargar();
  const sel = (id, label, text) => ({ id, value: '1', selectedIndex: 0, options: [{ text }], getAttribute: k => (k === 'aria-label' ? label : null) });
  assert.equal(C._etiqueta(sel('a', 'Filtrar por prestadora', 'SOS')), 'Prestadora');
  const html = C._chipsHtml([sel('a', 'Filtrar por prestadora', 'SOS'), sel('b', 'Filtrar por base', 'Piñeyro')]);
  assert.match(html, /data-sel="a"[^>]*>Prestadora: <b>SOS<\/b>/);
  assert.match(html, /Base: <b>Piñeyro<\/b>/);
  assert.match(html, /Limpiar filtros/);
  assert.doesNotMatch(C._chipsHtml([sel('a', 'Filtrar por prestadora', 'SOS')]), /Limpiar filtros/);
  assert.equal(C._chipsHtml([]), '');
});

test('Panel compacto: pestañas, período y «Filtros» en una barra; registrado en la app', () => {
  assert.match(src, /head\.insertBefore\(barra, head\.firstChild\)/);
  assert.match(src, /dashx-filtros-btn/);
  assert.match(src, /new MutationObserver\(pintar\)/);
  const css = fs.readFileSync('dashboard-compact-v1.css', 'utf8');
  assert.match(css, /\.dashx-head\.is-compact \.dashx-head-txt \{ position: absolute/);
  assert.match(css, /#dashx-sec-facturacion \.rsm-kpis \{ grid-template-columns: repeat\(4/);
  for (const f of ['Index.html', 'sw.js']) { const t = fs.readFileSync(f, 'utf8'); assert.match(t, /dashboard-compact-v1\.js/); assert.match(t, /dashboard-compact-v1\.css/); }
  assert.match(fs.readFileSync('package.json', 'utf8'), /node --check dashboard-compact-v1\.js/);
  const res = fs.readFileSync('dashboard-resumen-v1.js', 'utf8');
  assert.match(res, /tile\('Peajes'/);
  assert.match(res, /rsm-kpi-row/);
});
