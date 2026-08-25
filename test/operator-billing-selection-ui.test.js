const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billing=fs.readFileSync('operator-billing.js','utf8');
const billingExport=fs.readFileSync('operator-billing-export.js','utf8');

test('Excel aparece únicamente cuando existe una selección de servicios',()=>{
  assert.match(billing,/excelControl\s*=\s*S\.selected\.size\s*\?/);
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
