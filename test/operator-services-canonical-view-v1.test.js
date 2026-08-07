const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const canonical = fs.readFileSync('operator-services-canonical-view-v1.js', 'utf8');
const brand = fs.readFileSync('operator-services-brand-system-v1.css', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('la tabla limpia queda como única vista visible de Servicios', () => {
  assert.match(canonical, /ocv2-switch/);
  assert.match(canonical, /ocv2-root/);
  assert.match(canonical, /ocv2-settings/);
  assert.match(canonical, /removeAlternativeConsole/);
  assert.match(canonical, /board\.hidden=true/);
  assert.match(canonical, /root\.hidden=false/);
  assert.doesNotMatch(flags, /\/operator-console-v2\.js/);
  assert.doesNotMatch(flags, /\/operator-console-v2\.css/);
});

test('el branding del workspace no pisa la Mesa Activa aprobada', () => {
  assert.match(brand, /Esta hoja NO redefine #screen-operaciones/);
  assert.doesNotMatch(brand, /#screen-operaciones input/);
  assert.doesNotMatch(brand, /#screen-operaciones select/);
  assert.match(brand, /--svc-bg:\s*#f5f7fb/i);
  assert.match(brand, /--svc-panel:\s*#ffffff/i);
  assert.match(brand, /--svc-blue:\s*var\(--primary,\s*#4f8ef7\)/i);
  assert.match(brand, /--svc-amber:\s*var\(--amber,\s*#f5a623\)/i);
});

test('Crear Ver y Editar ocupan todo el modal disponible', () => {
  assert.match(brand, /#modal-operador-servicio,[\s\S]*#modal-operador-wizard,[\s\S]*#ose-modal[\s\S]*inset:\s*56px 0 0 var\(--nav-w, 72px\)/i);
  assert.match(brand, /#modal-operador-servicio \.os-detail-shell,[\s\S]*#modal-operador-wizard \.os-wizard-shell,[\s\S]*#ose-modal \.ose-shell[\s\S]*width:\s*100% !important/i);
  assert.match(brand, /height:\s*100% !important/i);
  assert.match(brand, /\.osv2-header,[\s\S]*\.ose-head,[\s\S]*\.os-detail-head[\s\S]*position:\s*sticky/i);
  assert.match(brand, /\.osv2-footer,[\s\S]*\.ose-footer,[\s\S]*\.os-actions[\s\S]*background:\s*rgba\(255,255,255,.98\)/i);
});

test('los controles del workspace usan superficies claras y color-scheme light', () => {
  assert.match(brand, /background:\s*#ffffff !important;[\s\S]*color-scheme:\s*light !important/i);
  assert.match(brand, /border-color:\s*var\(--svc-blue\) !important/i);
  assert.match(brand, /background:\s*var\(--svc-blue\) !important/i);
});

test('la vista canónica está precacheada en la revisión PWA actual', () => {
  assert.match(sw, /'\/operator-services-canonical-view-v1\.js'/);
  assert.doesNotMatch(sw, /'\/operator-console-v2\.(?:css|js)'/);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 135);
});
