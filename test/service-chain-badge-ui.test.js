const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = f => fs.readFileSync(f, 'utf8');

test('el clip del enganche se carga con una sola consulta liviana y el detalle recién al abrir', () => {
  const js = read('operator-service-chain-badge-v1.js');
  assert.match(js, /list_operator_service_chain_route_modes_v1/);
  assert.match(js, /get_operator_service_chain_v1/);
  assert.match(js, /auxilios:services-rendered/);
  assert.match(js, /td\.col-code/);
  // Tocar el clip no abre el servicio: se captura antes que el onclick de la fila.
  assert.match(js, /e\.stopPropagation\(\)[\s\S]*?\}, true\)/);
  assert.match(js, /role', 'tooltip'/);
  assert.match(js, /key === 'Escape'/);
});

test('el clip está registrado en la app, el service worker y el chequeo', () => {
  assert.match(read('Index.html'), /operator-service-chain-badge-v1\.js/);
  assert.match(read('Index.html'), /operator-service-chain-badge-v1\.css/);
  assert.match(read('sw.js'), /operator-service-chain-badge-v1\.js/);
  assert.match(read('package.json'), /node --check operator-service-chain-badge-v1\.js/);
  assert.match(read('ui/icons.svg'), /<symbol id="paperclip"/);
  assert.match(read('operator-service-chain-v1.js'), /AuxEngancheClip\?\.invalidate/);
});

test('la flecha de Estado no la pisa la burbuja de tooltip (data-ax-tip)', () => {
  const css = read('operaciones-ax-v1.css');
  const rule = css.match(/\.os-status\[role="button"\]::after \{[^}]*\}/)[0];
  assert.match(rule, /position: static/);
  assert.match(rule, /background: none/);
  assert.match(css, /\[aria-expanded="true"\]::after \{ transform: translateY\(3px\) rotate\(225deg\); \}/);
});
