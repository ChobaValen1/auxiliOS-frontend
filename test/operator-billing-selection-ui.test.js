const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const billingExport=fs.readFileSync('operator-billing-export.js','utf8');

test('Excel aparece con una selección de servicios, o en Peajes cuando hay peajes',()=>{
  assert.match(billing,/excelControl\s*=\s*\(S\.tab === 'tolls' \? \(S\.tollRows \|\| \[\]\)\.length : S\.tab === 'extras' \? \(S\.extraRows \|\| \[\]\)\.length : S\.selected\.size\)\s*\?/);
  assert.match(billing,/\$\{excelControl\}<button class="ob-button ob-filter-action"/);
  assert.match(billing,/function toggleSelection\(id,\s*on\)/);
  assert.match(billing,/S\.selected\.add\(String\(id\)\)/);
  assert.match(billing,/S\.selected\.delete\(String\(id\)\)/);
});

test('exportador Excel no monta un segundo control fuera de la mesa',()=>{
  assert.doesNotMatch(billingExport,/function ensureControl|\.topbar-right|function syncVisibility|function onControlClick/);
  assert.match(billingExport,/exportSelected\s*=\s*\(\)\s*=>\s*openPicker\('selected'\)/);
  assert.match(billingExport,/function ensureStyle\(\)/);
});
test('En la pestaña Peajes el menú de Excel no ofrece «Selección de servicios»',()=>{
  const b=require('node:fs').readFileSync('operator-billing.js','utf8');
  require('node:assert/strict').match(b,/\$\{S\.tab === 'tolls' \? '' : `<button type="button" data-ob="excel-selected">/);
});
