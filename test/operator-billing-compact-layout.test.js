const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const css=fs.readFileSync('operator-billing.css','utf8');

test('header central de Facturacion ocupa menos alto',()=>{
  assert.match(css,/\.ob-shell\{display:grid;gap:9px\}/);
  assert.match(css,/\.ob-head\{display:flex;align-items:center;justify-content:space-between;gap:12px\}/);
  assert.match(css,/\.ob-head h2\{margin:0;font-size:18px;line-height:1\.1\}/);
  assert.match(css,/\.ob-head p\{margin:2px 0 0;[^}]*font-size:9px/);
});

test('KPIs mantienen cuatro columnas pero son mas compactos',()=>{
  assert.match(css,/\.ob-kpis\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\);gap:6px\}/);
  assert.match(css,/\.ob-kpi\{padding:8px 10px;/);
  assert.match(css,/\.ob-kpi b\{display:block;margin-top:3px;[^}]*font-size:14px/);
  assert.match(css,/\.ob-kpi span\{display:block;margin-top:1px;[^}]*font-size:7px/);
});

test('espacio liberado queda disponible para la tabla',()=>{
  assert.match(css,/\.ob-table-wrap\{overflow:auto;max-height:calc\(100vh - 305px\)\}/);
});
