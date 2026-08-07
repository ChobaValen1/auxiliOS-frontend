const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const theme = fs.readFileSync('operator-active-desk-auxilios-theme-v2.css', 'utf8');
const core = fs.readFileSync('sigma.css', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

test('la Mesa activa reutiliza los colores institucionales de AuxiliOS', () => {
  for (const color of ['#f5a623', '#4f8ef7', '#27c47a', '#e2504a', '#2ec4d6', '#9b6dff']) {
    assert.match(core.toLowerCase(), new RegExp(color));
    assert.match(theme.toLowerCase(), new RegExp(color));
  }
  assert.match(theme, /Ámbar = firma de marca/);
  assert.match(theme, /Azul = interacción/);
});

test('los estados tienen fondos suaves y texto de alto contraste', () => {
  assert.match(theme, /--oad-brand-blue-soft:\s*#edf4ff/i);
  assert.match(theme, /--oad-brand-amber-soft:\s*#fff6e5/i);
  assert.match(theme, /--oad-brand-green-soft:\s*#eaf9f2/i);
  assert.match(theme, /--oad-brand-red-soft:\s*#fff0ef/i);
  assert.match(theme, /\.oad-status\.blue[\s\S]*--oad-brand-blue-deep/i);
  assert.match(theme, /\.oad-status\.amber[\s\S]*--oad-brand-amber-deep/i);
  assert.match(theme, /\.oad-status\.green[\s\S]*--oad-brand-green-deep/i);
  assert.match(theme, /\.oad-status\.red[\s\S]*--oad-brand-red-deep/i);
});

test('el ámbar identifica la marca sin reemplazar al azul de interacción', () => {
  assert.match(theme, /\.os-head::before[\s\S]*--oad-brand-amber/i);
  assert.match(theme, /\.oad-popover::before[\s\S]*--oad-brand-amber/i);
  assert.match(theme, /\.oad-modal header::before[\s\S]*--oad-brand-amber/i);
  assert.match(theme, /\.oad-commandbar input:focus[\s\S]*--oad-brand-blue/i);
  assert.match(theme, /\.oad-row-button\.primary[\s\S]*--oad-brand-blue-deep/i);
});

test('el tema se carga después de la clean UI y está precacheado en PWA v132 o posterior', () => {
  const baseTheme = flags.indexOf('/operator-active-desk-clean-v1.css');
  const auxiliOSTheme = flags.indexOf('/operator-active-desk-auxilios-theme-v2.css');
  const activeDeskScript = flags.indexOf('/operator-active-desk-clean-v1.js');
  assert.ok(baseTheme >= 0);
  assert.ok(auxiliOSTheme > baseTheme);
  assert.ok(activeDeskScript > auxiliOSTheme);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 132);
  assert.match(sw, /'\/operator-active-desk-auxilios-theme-v2\.css'/);
});
