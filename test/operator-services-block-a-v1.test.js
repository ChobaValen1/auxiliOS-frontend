const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('operator-services-brand-system-v1.css', 'utf8');
const js = fs.readFileSync('operator-services-block-a-v1.js', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

test('Servicios reutiliza la paleta institucional de AuxiliOS en todos sus workspaces', () => {
  assert.match(css, /--svc-amber:\s*var\(--amber,\s*#f5a623\)/i);
  assert.match(css, /--svc-blue:\s*var\(--primary,\s*#4f8ef7\)/i);
  assert.match(css, /--svc-green:\s*var\(--green,\s*#27c47a\)/i);
  assert.match(css, /--svc-red:\s*var\(--red,\s*#e2504a\)/i);
  assert.match(css, /#modal-operador-servicio[\s\S]*#modal-operador-wizard[\s\S]*#ose-modal/);
  assert.match(css, /\.osv2-header,[\s\S]*\.ose-head,[\s\S]*\.os-detail-head/);
});

test('Crear, Ver y Editar comparten el mismo lienzo full-screen', () => {
  assert.match(css, /#modal-operador-servicio,[\s\S]*#modal-operador-wizard,[\s\S]*#ose-modal[\s\S]*position:\s*fixed/i);
  assert.match(css, /inset:\s*56px 0 0 var\(--nav-w, 72px\)/i);
  assert.match(js, /addModeBadge\(head,'new'\)/);
  assert.match(js, /addModeBadge\(head,'view'\)/);
  assert.match(js, /addModeBadge\(head,'edit'\)/);
  assert.match(js, /closeDetailSilently\(\)/);
});

test('los workspaces advierten antes de perder cambios', () => {
  assert.match(js, /createDirty:false/);
  assert.match(js, /editDirty:false/);
  assert.match(js, /Hay cambios sin guardar/);
  assert.match(js, /window\.addEventListener\('beforeunload',onBeforeUnload\)/);
  assert.match(js, /wrapCreateClose\(\)/);
  assert.match(js, /wrapNavigation\(\)/);
  assert.match(js, /#ose-modal \[data-ose-close\]/);
  assert.match(js, /Cambios sin guardar/);
  assert.match(js, /Guardando cambios/);
});

test('Bloque A se carga después de las capas actuales y forma parte de CI/PWA', () => {
  const review = flags.indexOf('/operator-service-workspace-review-v3.js');
  const brand = flags.indexOf('/operator-services-brand-system-v1.css');
  const block = flags.indexOf('/operator-services-block-a-v1.js');
  assert.ok(review >= 0);
  assert.ok(brand > review);
  assert.ok(block > brand);
  assert.match(pkg, /node --check operator-services-block-a-v1\.js/);
  assert.match(sw, /'\/operator-services-brand-system-v1\.css'/);
  assert.match(sw, /'\/operator-services-block-a-v1\.js'/);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 134);
});
