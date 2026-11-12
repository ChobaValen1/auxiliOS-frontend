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

test('Facturación: clip, recorrido bajo los km y aviso de servicio enganchado sin su compañero', () => {
  const js = read('operator-service-chain-badge-v1.js');
  assert.match(js, /tr\[data-billing-service\]/);
  assert.match(js, /td\[data-col="order"\]/);
  assert.match(js, /ob-chain-route/);
  assert.match(js, /selectionGaps/);
  assert.match(js, /auxilios:billing-rendered/);
  const billing = read('operator-billing.js');
  assert.match(billing, /dispatchEvent\(new CustomEvent\('auxilios:billing-rendered'\)\)/);
  assert.equal((billing.match(/\$\{chainGapMarkup\(\)\}/g) || []).length, 2, 'barra de selección y modal de factura');
  // Sólo avisa: no deshabilita el botón de facturar.
  const sel = billing.slice(billing.indexOf('function selectionMarkup'), billing.indexOf('function invoiceModalMarkup'));
  assert.doesNotMatch(sel.slice(0, sel.indexOf('const related')), /chainGaps/);
  assert.match(read('operator-service-chain-badge-v1.css'), /#screen-facturacion \.ob-chain-gap/);
});

test('Tablas: filtro «Enganchados», barra que une A y B y columna «Enganche» en el Excel', () => {
  const ops = read('operator-services.js');
  assert.match(ops, /S\.status==='chained'\?Boolean\(window\.AuxEngancheClip\?\.isChained\(s\.service_id\)\)/);
  assert.match(ops, /\['chained','Enganchados'\]/);
  assert.match(ops, /AuxEngancheClip\?\.warm\?\.\(S\.services\.map/);
  assert.match(ops, /auxilios:chain-modes-ready/);
  assert.match(ops, /chained:'Enganchados'/);
  const js = read('operator-service-chain-badge-v1.js');
  assert.match(js, /is-chain-join-next/);
  assert.match(js, /is-chain-join-prev/);
  assert.match(js, /isChained, isRelay, relayOf, warm/);
  assert.match(read('operator-service-chain-badge-v1.css'), /tr\.os-chain-row > td:first-child \{ box-shadow: inset 3px 0 0/);
  const exp = read('operator-billing-export.js');
  assert.match(exp, /serviceColumn\('chain','Enganche'/);
  assert.match(exp, /chain_label/);
  assert.match(exp, /Viene de \$\{data\.previous\.label/);
  assert.match(exp, /Sigue con \$\{data\.next\.label/);
});

test('Mapa: unión A→B punteada, clip en marcadores y lista, y bloque en el panel', () => {
  const map = read('operator-services-map-v1.js');
  assert.match(map, /chainLinks\(\)\.map\(l=>\[l\.a,l\.b\]\)/, 'la firma de dibujo incluye las uniones');
  assert.match(map, /strokeColor:'#5aa9ff'/);
  assert.match(map, /osm-pin-clip/);
  assert.match(map, /chainOrdered\(V\.rows\)\.slice/);
  assert.match(map, /\$\{chainBlock\(s\)\}\$\{relayBlock\(s\)\}<div class="osm-detail-tabs"/);
  assert.match(map, /data-osm-chain/);
  assert.match(map, /auxilios:chain-details-ready/);
  assert.match(read('operator-service-chain-badge-v1.js'), /ensureDetails/);
  assert.match(read('operator-services-map-v1.css'), /\.osm-chain-link/);
});

test('Relevo: ícono violeta con resumen en Operaciones y Facturación, desde una sola consulta', () => {
  const js = read('operator-service-chain-badge-v1.js');
  assert.match(js, /list_operator_service_relays_v1/);
  assert.match(js, /os-relay-mark/);
  assert.match(js, /Servicio con relevo/);
  assert.match(js, /Esperando la entrega del vehículo/);
  assert.match(js, /isRelay, relayOf/);
  assert.match(read('operator-service-chain-badge-v1.css'), /\.os-relay-mark/);
  assert.match(read('ui/icons.svg'), /<symbol id="repeat"/);
});
