const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const migration = read('migrations/20261020160000_customer_payment_driver.sql');
const addonsSrc = read('remito-addons-v2.js');
const commercial = read('operator-service-commercial-addons-v1.js');
const wizard = read('operator-service-wizard.js');
const payroll = read('payroll-view.js');
const html = read('Index.html');

function loadAddons() {
  const document = { readyState: 'loading', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
  const context = { window: {}, document, sessionStorage: { getItem: () => 'svc-1' }, console, Intl };
  const source = addonsSrc.replace(/\}\)\(\);\s*$/, 'window.api={state,customerPaymentPayload,customerPaymentTotal};})();');
  vm.runInNewContext(source, context);
  return context.window.api;
}

test('base: el remito guarda el cobro y la rendición cuenta el efectivo con medio principal y segundo medio', () => {
  assert.match(migration, /create or replace function app_private\.remito_customer_payment_lines_v1\(p_remito_id integer\)/);
  // Sin cobro nuevo, una fila por peaje/excedente como antes; con cobro nuevo, principal = total − segundo.
  assert.match(migration, /select l\.m, l\.a from lines l, r where r\.p is null/);
  assert.match(migration, /select r\.p, greatest\(tot\.total-r\.sa,0\)/);
  assert.match(migration, /revoke all on function app_private\.remito_customer_payment_lines_v1\(integer\) from public, anon, authenticated;/);
  assert.match(migration, /Lo que pagó con el segundo medio tiene que ser menor al total/);
  assert.match(migration, /Con «No cobrado» no se puede sumar un segundo medio/);
  assert.match(migration, /'planned_customer_tolls'/);
  assert.match(migration, /'planned_customer_payment'/);
  // Cada reemplazo falla si no encuentra el texto exacto y no se repite si ya está aplicado.
  assert.equal((migration.match(/raise exception '[^']*no encontrad[oa]s?'/g) || []).length, 9);
  assert.doesNotMatch(migration, /\bdelete\b/i);
});

test('chofer: el cobro viaja una sola vez, sin importe del segundo medio si pagó con uno', () => {
  const api = loadAddons();
  api.state.reference.toll_coverage_mode = 'customer_roundtrip';
  api.state.lines.toll = [{ client_line_id: 'a', toll_id: 't1', quantity: 2, unit_amount: 4300 }];
  api.state.lines.excess = [{ client_line_id: 'b', concept_id: 'c1', quantity: 1, unit_amount: 5000 }];
  assert.equal(api.customerPaymentTotal(), 13600);
  api.state.cp = { primary: 'cash', secondary: '', secondary_amount: '' };
  assert.equal(JSON.stringify(api.customerPaymentPayload()), '{"primary":"cash","secondary":null,"secondary_amount":null}');
  api.state.cp = { primary: 'cash', secondary: 'transfer', secondary_amount: '4000' };
  assert.equal(JSON.stringify(api.customerPaymentPayload()), '{"primary":"cash","secondary":"transfer","secondary_amount":4000}');
  // Si los peajes los paga la prestadora y no hay excedentes, no se cobra nada al cliente.
  api.state.reference.toll_coverage_mode = 'provider_roundtrip';
  api.state.lines.excess = [];
  assert.equal(JSON.stringify(api.customerPaymentPayload()), '{"primary":null,"secondary":null,"secondary_amount":null}');
});

test('chofer: en el mismo paso, compacto, y resumen antes de firmar', () => {
  assert.match(addonsSrc, /id="rem-cp-card" hidden aria-label="Cobro al cliente"><div id="rem-cp-slot"><\/div><\/section>/);
  assert.match(addonsSrc, /compact:true,allowNotCollected:true,title:'Cobro al cliente',question:'¿Cómo pagó el cliente\?'/);
  assert.match(addonsSrc, /Cómo pagó el cliente lo elegís abajo, en «Cobro al cliente»\./);
  assert.match(html, /<div id="rem-addon-signature-summary" hidden><\/div>/);
  // «A definir» del operador no se precarga: lo completa el chofer.
  assert.match(addonsSrc, /cp\.primary!=='to_define'/);
});

test('operador: ve el cobro que informó el chofer y queda precargado en la revisión', () => {
  assert.match(commercial, /function reportedPayment\(addons\)/);
  assert.match(commercial, /<span>Cobro al cliente informado<\/span>/);
  assert.match(commercial, /\$\{reportedPayment\(addons\)\}<\/div>`;/);
  assert.match(commercial, /review\?review\+reportedPayment\(w\.reportedAddons\):reportedCharges\(w\.reportedAddons\)/);
  assert.match(wizard, /w\.data\.commercial_addons\.customer_payment=loadedCustomerPayment\(\{customer_payment:ctx\.addons\?\.customer_payment\?\.primary==='not_collected'\?null:ctx\.addons\?\.customer_payment\}\)/);
});

test('sueldos: el efectivo del remito sale del cobro único cuando existe', () => {
  assert.match(payroll, /const cp=a\.customer_payment&&a\.customer_payment\.primary\?a\.customer_payment:null;/);
});

test('revisión: «Peaje ×2 · A definir» del operador coincide con dos pasadas en efectivo del chofer', () => {
  const review = read('operator-remito-review-v2.js');
  const pick = name => review.match(new RegExp(`  function ${name}\\([^]*?\\n  \\}`))[0];
  const src = [
    'const num=v=>Number(v)||0;',
    review.match(/  const amountOf=[^\n]*/)[0], review.match(/  const compareText=[^\n]*/)[0],
    pick('comparisonUnits'), review.match(/  function unitCounts[^\n]*/)[0], pick('hasDifference'),
    'this.hasDifference=hasDifference;',
  ].join('\n');
  const ctx = {}; vm.runInNewContext(src, ctx);
  const planned = [['t1', 19600], ['t2', 9100], ['t3', 4800], ['t4', 5000]].map(([toll_id, unit_amount]) => ({ toll_id, quantity: 2, unit_amount, total_amount: unit_amount * 2, payer_agent: 'customer', customer_payment_method: 'to_define' }));
  const reported = planned.flatMap(p => [1, 2].map(() => ({ toll_id: p.toll_id, quantity: 1, unit_amount: p.unit_amount, total_amount: p.unit_amount, payer_agent: 'customer', customer_payment_method: 'cash' })));
  assert.equal(ctx.hasDifference('toll', planned, reported), false);
  // Una pasada de menos o con otro importe sí es diferencia.
  assert.equal(ctx.hasDifference('toll', planned, reported.slice(1)), true);
  assert.equal(ctx.hasDifference('toll', planned, reported.map((r, i) => i ? r : { ...r, unit_amount: 20000, total_amount: 20000 })), true);
});

test('guardar: el cobro del chofer no se pierde al armar el remito (con y sin señal)', () => {
  const supa = read('supabase.js'), sigma = read('sigma.js');
  assert.match(supa, /customer_payment: addonPayload\.customer_payment \|\| null,/);
  assert.equal((sigma.match(/customer_payment: remito\.customer_payment \|\| null,/g) || []).length, 2);
  // El upsert directo a la tabla no manda el objeto (no es una columna).
  assert.match(supa, /const \{ tolls, excesses, evidence, customer_collections, customer_payment, addons_version, \.\.\.legacyRemito \}/);
  assert.match(sigma, /const \{ tolls, excesses, evidence, customer_collections, customer_payment, addons_version, \.\.\.legacyRemito \}/);
});
