const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const pay = fs.readFileSync('private-payments-v1.js', 'utf8');
const col = fs.readFileSync('private-collection-v1.js', 'utf8');
const form = fs.readFileSync('private-service-v1.js', 'utf8');
const css = fs.readFileSync('private-service-v1.css', 'utf8');
const supa = fs.readFileSync('supabase.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928180000_particulares_chofer_y_cobro_v8.sql', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');

const doc = () => ({ getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { classList: { add() {}, remove() {} }, appendChild() {} }, createElement: () => ({}) });

test('las casillas del alta de Particular son interruptores ON/OFF', () => {
  assert.match(css, /\.psv-check input\[type=checkbox\] \{ appearance: none;/);
  assert.match(css, /\.psv-check input\[type=checkbox\]:checked::after \{ transform: translateX\(16px\)/);
});

test('el operador completa el cobro: monto hasta el saldo y medio de pago', () => {
  const win = {};
  vm.runInNewContext(pay, { window: win, document: doc(), setInterval: () => 0, clearInterval() {}, console });
  const T = win.AuxiliosCobroOperador._test;
  T.set({ info: { balance: 65000 }, monto: '70000', medio: 'cash' });
  assert.match(T.errores().join(' '), /supera el saldo/);
  T.set({ info: { balance: 65000 }, monto: '65000', medio: '' });
  assert.match(T.errores().join(' '), /medio de pago/);
  T.set({ info: { balance: 65000 }, monto: '65000', medio: 'transfer' });
  assert.equal(T.errores().length, 0);
  assert.equal(T.esParticular({ quoted_total: 1 }), true);
  assert.equal(T.esParticular({ company_name: 'Addiuva' }), false);
  assert.match(pay, /register_service_payment_v1/);
  // Se ofrece sólo si queda saldo (se consulta al abrir el menú).
  assert.match(pay, /Registrar cobro · ' \+ esc\(money\(r\.data\.balance\)\)/);
  assert.match(config, /'\/private-payments-v1\.js'/);
  assert.match(sql, /values \(p_service_id, p_kind, round\(p_amount, 2\), p_method, auth\.uid\(\)/);
});

test('el chofer marca Particular en el remito sin asignación y necesita el monto acordado', () => {
  const win = { AuxiliosRemitoMobileV3: { isAdHocMode: () => true } };
  vm.runInNewContext(col, { window: win, document: doc(), setInterval: () => 0, clearInterval() {}, setTimeout, console, MutationObserver: function () { this.observe = () => {}; } });
  const T = win.AuxiliosCobroParticular._test;
  T.setAdHoc({ particular: true, monto: '' });
  assert.match(T.errores().join(' '), /monto acordado/);
  T.setAdHoc({ particular: true, monto: '80000' });
  T.set({ serviceId: 'adhoc', info: { particular: true, ad_hoc: true, quoted_total: 80000, paid: 0, balance: 80000 }, l1: { method: 'cash', amount: '' } });
  const p = T.payload();
  assert.equal(p.kind, 'private_ad_hoc');
  assert.equal(p.quoted_total, 80000);
  assert.equal(JSON.stringify(p.lines), JSON.stringify([{ method: 'cash', amount: 80000 }]));
  assert.match(col, /¿Para quién es el servicio\?/);
  assert.match(supa, /customer_collections\?\.kind === 'private_ad_hoc'\s*\?\s*'save_driver_ad_hoc_remito_v4'/);
  assert.match(sql, /set client_kind = 'particular', agreed_amount = v_amount, private_collection = v_norm/);
});

test('si el chofer lo marcó Particular, Operaciones abre directo ese formulario con lo que cobró', () => {
  const win = { crypto: { randomUUID: () => 'x' }, OperatorServices: { S: { intakes: [{ intake_id: 'i1', driver_name: 'Juan' }] } } };
  vm.runInNewContext(form, { window: win, document: doc(), setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, console });
  const P = win.AuxiliosParticulares._test;
  const r = P.desdeIngreso(P.estadoInicial(), {
    intake_id: 'i1', remito: { nro_remito: 'R-1' }, service: { customer_name: 'Ana', assigned_driver_id: 'd1' },
    client_kind: 'particular', agreed_amount: 90000,
    private_collection: { lines: [{ method: 'cash', amount: 50000 }, { method: 'transfer', amount: 40000 }] }
  });
  assert.equal(r.d.presupuesto, '90000');
  assert.equal(r.d.pago, 'total');
  assert.match(r.intake.informe, /\$ 50\.000 en efectivo \+ \$ 40\.000 por transferencia/);
  // Sin cambios del operador se guardan las dos líneas del chofer.
  assert.equal(P.lineasCobro(r.intake, { amount: 90000, method: 'cash' }).length, 2);
  assert.equal(P.lineasCobro(r.intake, { amount: 70000, method: 'cash' }).length, 1);
  assert.match(form, /if \(info && info\.client_kind === 'particular'\) return abrirParticular\(id\);/);
});

test('un particular no se finaliza sin el cobro del total', () => {
  const v10 = fs.readFileSync('migrations/20260928200000_particulares_cobro_para_finalizar_v10.sql', 'utf8');
  assert.match(v10, /when \(new\.status = 'completed' and old\.status is distinct from 'completed' and new\.quoted_total is not null\)/);
  assert.match(v10, /No se puede finalizar: falta registrar el cobro de \$%/);
  assert.match(pay, /global\.finalizarServicioOperador = w;/);
  assert.match(pay, /return abrir\(id, \{ finalizar: true \}\)/);
  assert.match(pay, /review_service_collection_v1/);
  assert.match(form, /Para crear y finalizar, el cobro tiene que cubrir el presupuesto/);
});
