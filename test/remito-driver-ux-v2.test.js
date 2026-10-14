const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const css = read('remito-chofer-ax-v1.css');
const bridge = read('operator-service-bridge.js');
const bridgeCss = read('operator-service-bridge.css');
const addonsSrc = read('remito-addons-v2.js');

function loadAddons() {
  const document = { readyState: 'loading', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  const context = { window: {}, document, sessionStorage: { getItem: () => 'svc-1' }, console, Intl };
  const source = addonsSrc.replace(/\}\)\(\);\s*$/, 'window.api={state,collectLines,groupPasses,totals,selectionMarkup,detailsMarkup};})();');
  vm.runInNewContext(source, context);
  return context.window.api;
}

test('remito del chofer: un solo scroll y lugar para la botonera (los km no quedan tapados)', () => {
  assert.match(css, /#remitos-nuevo\.rmv-flow \{ overflow-y: auto;/);
  assert.match(css, /#remitos-nuevo\.rmv-flow \.rem-wizard-header \{ position: sticky; top: 0;/);
  assert.match(css, /#remitos-nuevo \.rem-step-panel\.active \{ max-height: none !important; overflow: visible !important; padding-bottom: calc\(96px \+ env\(safe-area-inset-bottom\)\) !important; \}/);
  // Los km calculados se leen como un dato, no como un campo apagado.
  assert.match(css, /#remitos-nuevo\.rmv-ad-hoc-flow #rem-km\[readonly\] \{[^}]*font: var\(--ax-fw-semibold\) 22px var\(--ax-font-mono\)/);
  assert.match(css, /#remitos-nuevo \.rmv-map-status\.ok \{ color: var\(--ax-ok\);/);
});

test('"Marcar como activado" entra deslizando, en el servicio asignado y en el borrador', () => {
  assert.match(bridge, /function slidePreview\(dir\)/);
  assert.equal((bridge.match(/P3\.previewStep='activation';slidePreview\('next'\)/g) || []).length, 2);
  // "Volver" trae la ficha desde el otro lado, y sólo si venía de la pregunta.
  assert.equal((bridge.match(/if\(back\)slidePreview\('prev'\)/g) || []).length, 2);
  assert.match(bridge, /kicker\.textContent='Marcar como activado'/);
  assert.match(bridgeCss, /@keyframes p3-step-next\{from\{opacity:0;transform:translateX\(32px\)\}\}/);
  assert.match(bridgeCss, /@media \(prefers-reduced-motion:reduce\)\{\.p3-step-next,\.p3-step-prev\{animation:none\}\}/);
});

test('peajes: la selección muestra el precio sugerido y las pasadas con − / +', () => {
  const api = loadAddons();
  api.state.reference.toll_coverage_mode = 'customer_roundtrip';
  api.state.reference.tolls = [
    { toll_id: 't1', name: 'Peaje 25 de Mayo', reference_amount: 4300 },
    { toll_id: 't2', name: 'Peaje Hudson', reference_amount: 0 },
  ];
  api.state.draft = { kind: 'toll', phase: 'select', lines: [{ toll_id: 't1', quantity: 2 }], qty: { t1: 2 } };
  const html = api.selectionMarkup();
  assert.match(html, /Precio sugerido \$\s?4\.300,00/);
  assert.match(html, /Sin precio sugerido/);
  assert.match(html, /data-qty-for="t1" ><button type="button" data-qty-step="-1"/);
  assert.match(html, /<output aria-live="polite">2<\/output>/);
  // El que no está marcado no muestra el contador.
  assert.match(html, /data-qty-for="t2" hidden>/);
});

test('peajes: cada pasada viaja como una línea con id estable, y al abrir se vuelven a juntar', () => {
  const api = loadAddons();
  api.state.reference.toll_coverage_mode = 'customer_roundtrip';
  api.state.lines.toll = [{ client_line_id: 'a', toll_id: 't1', toll_name: 'Peaje 25 de Mayo', quantity: 3, unit_amount: 4300, customer_payment_method: 'cash' }];
  const first = api.collectLines().tolls;
  assert.equal(first.length, 3);
  assert.ok(first.every(line => line.quantity === 1 && line.unit_amount === 4300 && line.customer_payment_method === 'cash'));
  assert.equal(first[0].client_line_id, 'a');
  assert.equal(new Set(first.map(line => line.client_line_id)).size, 3);
  // Guardar de nuevo no inventa ids nuevos.
  assert.equal(JSON.stringify(api.collectLines().tolls.map(line => line.client_line_id)), JSON.stringify(first.map(line => line.client_line_id)));
  assert.equal(api.totals().toll, 12900);

  const grouped = api.groupPasses([
    { client_line_id: 'x1', toll_id: 't1', unit_amount: 4300, customer_payment_method: 'cash' },
    { client_line_id: 'x2', toll_id: 't1', unit_amount: 4300, customer_payment_method: 'cash' },
    { client_line_id: 'x3', toll_id: 't1', unit_amount: 4500, customer_payment_method: 'cash' },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].quantity, 2);
  assert.equal(JSON.stringify(grouped[0].extra_line_ids), '["x2"]');
  assert.equal(grouped[1].quantity, 1);
});

test('peajes y excedentes: pantalla principal liviana', () => {
  assert.match(addonsSrc, /id="rem-toll-coverage" class="rem-toll-coverage-pill" title="Formato de cobro de peajes"/);
  assert.match(addonsSrc, /id="rem-toll-total-row" hidden/);
  assert.match(addonsSrc, /'Editar peajes':'Editar excedentes'/);
  assert.doesNotMatch(addonsSrc, /Cada concepto puede tener precio definido o importe variable/);
  assert.match(addonsSrc, /Importe real por pasada/);
  assert.match(css, /#remitos-nuevo \.rem-addons-card \.rem-addon-total\[hidden\] \{ display: none; \}/);
});
