const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const css=fs.readFileSync('operator-billing.css','utf8');

test('Actualizar vive en la misma fila que busqueda filtros y Excel condicional',()=>{
  const render=billing.split('function render()')[1].split('function selectionMarkup()')[0];
  const filters=render.split('<div class="ob-filters">')[1].split('</div></div>')[0];
  assert.match(filters,/id="ob-search"/);
  assert.match(filters,/id="ob-company-filter"/);
  assert.match(filters,/id="ob-period-filter"/);
  assert.match(filters,/\$\{excelControl\}/);
  assert.match(filters,/data-ob="refresh">↻ Actualizar/);
  assert.ok(filters.indexOf('${excelControl}')<filters.indexOf('data-ob="refresh"'));
  assert.match(render,/excelControl\s*=\s*S\.selected\.size\s*\?/);
  assert.match(render,/id="obx-wrap"/);
});

test('Actualizar existe una sola vez en la mesa limpia',()=>{
  const render=billing.split('function render()')[1].split('function selectionMarkup()')[0];
  assert.equal((render.match(/data-ob="refresh"/g)||[]).length,1);
  assert.doesNotMatch(render,/ob-head|ob-kpis/);
});

test('boton Actualizar mantiene altura de los controles de filtro',()=>{
  assert.match(css,/\.ob-filter-action\{height:34px;white-space:nowrap;flex:0 0 auto\}/);
});
