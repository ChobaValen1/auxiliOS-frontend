const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('los errores inline y avisos flotantes duran como máximo tres segundos',()=>{
  const js=read('sigma.js');
  assert.match(js,/_modalError[\s\S]*_autoClearTimer[\s\S]*3000/);
  assert.match(js,/_modalError[\s\S]*operationFeedback\('Revisá los datos', msg, 'error', 2800\)/);
  assert.match(js,/Math\.min\(3000, Math\.max\(800, Number\(duration\) \|\| 3000\)\)/);
});

test('jornada y combustible muestran confirmaciones válidas e inválidas',()=>{
  const js=read('sigma.js');
  assert.match(js,/operationFeedback\('Jornada iniciada'/);
  assert.match(js,/operationFeedback\('Jornada en curso'/);
  assert.match(js,/operationFeedback\('Revisá los datos', msg, 'error', 2800\)/);
  assert.match(js,/operationFeedback\('Carga registrada'/);
  assert.match(js,/operationFeedback\('Carga inválida'/);
  assert.doesNotMatch(js,/toast\(`\$\{litros\}L registrados correctamente`/);
});

test('el móvil deja visible sólo la jornada abierta y deriva el resto al historial',()=>{
  const js=read('sigma.js'),css=read('sigma.css');
  assert.match(js,/j\.estado === 'abierta' \? ' is-open' : ''/);
  assert.match(js,/if \(!el\.classList\.contains\('is-open'\)\) el\.remove\(\)/);
  assert.match(css,/\.journey-columns\.is-open/);
  assert.match(css,/\.jhist-open-btn\{min-height:48px/);
});

test('panel bloquea la pantalla al cargar y Servicios recibe contador asignado',()=>{
  const css=read('sigma.css'),bridge=read('operator-service-bridge.js'),js=read('sigma.js');
  assert.match(css,/\.loading-status\{position:fixed!important;inset:0!important/);
  assert.match(bridge,/function updateAssignedBadge/);
  assert.match(bridge,/\['assigned','at_origin'\]\.includes\(s\.status\)/);
  assert.match(bridge,/p3-nav-badge/);
  assert.match(js,/function alxBellClick\(\)[\s\S]*goTo\('remitos'\)/);
});
