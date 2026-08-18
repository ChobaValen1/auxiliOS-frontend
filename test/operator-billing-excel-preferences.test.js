const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const billingExport=fs.readFileSync('operator-billing-export.js','utf8');

test('selector Excel mantiene todas las columnas accesibles con scroll interno real',()=>{
  assert.match(billingExport,/\.obx-picker-body\{[^}]*flex:1 1 auto[^}]*min-height:0[^}]*overflow-y:auto/s);
  assert.match(billingExport,/scrollbar-gutter:stable/);
  assert.match(billingExport,/overscroll-behavior:contain/);
  assert.match(billingExport,/height:min\(780px,94vh\)/);
  assert.match(billingExport,/@media\(max-width:480px\)\{\.obx-col-grid\{grid-template-columns:1fr\}/);
});

test('marcar una columna no vuelve a renderizar el modal ni pierde la posicion de scroll',()=>{
  const fn=billingExport.split('function onPickerChange(e)')[1].split('function onPickerClick(e)')[0];
  assert.match(fn,/syncPickerGroup\(type\)/);
  assert.doesNotMatch(fn,/renderPicker\(/);
  assert.match(billingExport,/const previousScroll=back\.querySelector\('\.obx-picker-body'\)\?\.scrollTop\|\|0/);
  assert.match(billingExport,/body\.scrollTop=previousScroll/);
});

test('ultima seleccion de columnas se persiste por accion de exportacion',()=>{
  assert.match(billingExport,/COLUMN_PREFS_KEY='auxilios\.billing\.excel\.columns\.v1'/);
  assert.match(billingExport,/localStorage\?\.getItem\(COLUMN_PREFS_KEY\)/);
  assert.match(billingExport,/localStorage\?\.setItem\(COLUMN_PREFS_KEY,JSON\.stringify\(value\)\)/);
  assert.match(billingExport,/function restoreColumnSelection\(kind,type\)/);
  assert.match(billingExport,/readColumnPreferences\(\)\?\.\[kind\]\?\.\[type\]/);
  assert.match(billingExport,/serviceSelected:restoreColumnSelection\(kind,'service'\)/);
  assert.match(billingExport,/tollSelected:restoreColumnSelection\(kind,'toll'\)/);
});

test('preferencias se guardan solo despues de una exportacion exitosa',()=>{
  const fn=billingExport.split('async function confirmExport()')[1].split('const exportCurrent=')[0];
  const download=fn.indexOf('excel().download');
  const save=fn.indexOf('savePickerPreferences()');
  assert.ok(download>=0,'falta descarga XLSX');
  assert.ok(save>download,'las preferencias deben guardarse despues de descargar');
});
