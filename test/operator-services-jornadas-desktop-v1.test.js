const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('operator-services-jornadas-desktop-v1.css', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('Servicios ocupa todo el viewport útil en desktop', () => {
  assert.match(css, /#screen-operaciones\.active[\s\S]*position:\s*fixed !important/i);
  assert.match(css, /inset:\s*56px 0 0 var\(--nav-w, 72px\) !important/i);
  assert.match(css, /#screen-operaciones \.oad-root[\s\S]*flex:\s*1 1 auto/i);
  assert.match(css, /\.oad-table-wrap[\s\S]*flex:\s*1 1 auto[\s\S]*max-height:\s*none !important/i);
});

test('Mesa Activa replica la identidad visual de Jornadas', () => {
  assert.match(css, /--oad-bg:\s*var\(--bg,\s*#0c0e12\)/i);
  assert.match(css, /--oad-surface:\s*var\(--card,\s*#191d27\)/i);
  assert.match(css, /\.oad-commandbar[\s\S]*background:\s*var\(--card,\s*#191d27\) !important/i);
  assert.match(css, /\.oad-status-summary[\s\S]*border-left-width:\s*3px !important/i);
  assert.match(css, /\.oad-table thead th[\s\S]*background:\s*rgba\(0,0,0,.15\) !important/i);
  assert.match(css, /var\(--amber,\s*#f5a623\)/i);
  assert.match(css, /var\(--blue,\s*#4a90e2\)/i);
  assert.match(css, /var\(--green,\s*#27c47a\)/i);
});

test('Nuevo Servicio recupera tres columnas iguales de escritorio', () => {
  assert.match(css, /#modal-operador-wizard \.osv2-workspace[\s\S]*display:\s*grid !important/i);
  assert.match(css, /#modal-operador-wizard \.osv2-grid[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\) !important/i);
  assert.match(css, /#modal-operador-wizard \.osv2-column[\s\S]*border-right:\s*1px solid var\(--border,\s*#252a38\) !important/i);
  assert.match(css, /#modal-operador-wizard input,[\s\S]*background:\s*var\(--bg,\s*#0c0e12\) !important/i);
  assert.match(css, /#modal-operador-wizard \.osv2-footer button\.primary[\s\S]*background:\s*var\(--amber,\s*#f5a623\) !important/i);
});

test('la capa Jornadas se carga al final y queda en PWA v136+', () => {
  const brandIndex = flags.indexOf('/operator-services-brand-system-v1.css');
  const jornadasIndex = flags.indexOf('/operator-services-jornadas-desktop-v1.css');
  assert.ok(brandIndex >= 0);
  assert.ok(jornadasIndex > brandIndex);
  assert.match(sw, /'\/operator-services-jornadas-desktop-v1\.css'/);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 136);
});
