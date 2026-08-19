const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const css=fs.readFileSync('operator-billing.css','utf8');

test('mesa de Facturación no renderiza título central ni KPIs',()=>{
  const render=billing.split('function render()')[1].split('function selectionMarkup()')[0];
  assert.doesNotMatch(render,/ob-head|<h1|<h2|ob-kpis|ob-kpi/);
  assert.doesNotMatch(billing,/function kpis\(|kpis:\{|S\.kpis/);
});

test('CSS no conserva estilos muertos del título ni KPIs',()=>{
  assert.doesNotMatch(css,/\.ob-head(?:[\s.{:#]|$)|\.ob-kpis(?:[\s.{:#]|$)|\.ob-kpi(?:[\s.{:#]|$)/);
  assert.match(css,/\.ob-shell\{display:grid;gap:9px\}/);
});

test('espacio vertical queda disponible para la tabla',()=>{
  assert.match(css,/\.ob-table-wrap\{overflow:auto;max-height:calc\(100vh - 220px\)\}/);
});
