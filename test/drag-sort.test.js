'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('ui/drag-sort-v1.js');
const load = () => { const window = {}; vm.runInNewContext(src, { window }); return window.AxDragSort; };

test('arrastrar: mover una columna a cualquier posición', () => {
  const D = load();
  assert.equal(D.reorder(['a', 'b', 'c', 'd'], 'd', 0).join(), 'd,a,b,c');
  assert.equal(D.reorder(['a', 'b', 'c', 'd'], 'a', 2).join(), 'b,c,a,d');
  assert.equal(D.reorder(['a', 'b', 'c'], 'x', 1).join(), 'a,b,c');
});

test('arrastrar: el lugar final es la posición original más cercana al puntero (lista y grilla)', () => {
  const D = load(), rows = [0, 1, 2, 3].map(i => ({ left: 0, right: 100, top: i * 40, bottom: i * 40 + 36 }));
  assert.equal(D._targetIndex(rows, 50, -20), 0);
  assert.equal(D._targetIndex(rows, 50, 85), 2);
  assert.equal(D._targetIndex(rows, 50, 500), 3);
  const grid = [[0, 0], [100, 0], [0, 40], [100, 40]].map(([l, t]) => ({ left: l, right: l + 96, top: t, bottom: t + 36 }));
  assert.equal(D._targetIndex(grid, 150, 50), 3);
});

test('todas las listas de columnas se pueden arrastrar (además de las flechas)', () => {
  for (const [file, re] of [
    ['ui/export-picker-v1.js', /data-drag-key="' \+ esc\(id\)/],
    ['operator-billing-export.js', /class="obx-order-row" data-drag-key=/],
    ['table-columns-v1.js', /data-tc-row="' \+ esc\(i\.key\) \+ '" data-drag-key=/],
    ['operator-services.js', /class="os-view-row" data-drag-key=/],
    ['service-module-configuration.js', /class="smc-col\$\{on\?'':' is-off'\}" data-drag-key=/],
  ]) { const s = read(file); assert.match(s, re, file); assert.match(s, /AxDragSort[?.]*\.?attach\(/, file); }
  assert.match(read('Index.html'), /\/ui\/drag-sort-v1\.js\?v=/);
  assert.doesNotMatch(read('ui/drag-sort-v1.css'), /#[0-9a-f]{3,6}\b/i);
  assert.match(read('ui/drag-sort-v1.css'), /touch-action: none/);
});
