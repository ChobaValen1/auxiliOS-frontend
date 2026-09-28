const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('private-collection-v1.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928120000_particulares_cobro_remito_v3.sql', 'utf8');
const supa = fs.readFileSync('supabase.js', 'utf8');
const panel = fs.readFileSync('remitos-admin-panel-v1.js', 'utf8');

function cargar() {
  const win = {};
  const doc = { getElementById: () => null, querySelector: () => null, addEventListener() {} };
  vm.runInNewContext(js, { window: win, document: doc, setInterval: () => 0, clearInterval() {}, setTimeout, console, MutationObserver: function () { this.observe = () => {}; } });
  return win.AuxiliosCobroParticular._test;
}
const info = { particular: true, quoted_total: 85000, paid: 20000, balance: 65000 };

test('sin medio de pago no se puede cerrar el cobro', () => {
  const T = cargar();
  T.set({ info });
  assert.match(T.errores().join(' '), /cómo pagó el cliente/);
});

test('un medio cobra el saldo completo', () => {
  const T = cargar();
  T.set({ info, l1: { method: 'cash', amount: '' } });
  assert.equal(T.errores().length, 0);
  assert.equal(JSON.stringify(T.payload().lines), JSON.stringify([{ method: 'cash', amount: 65000 }]));
});

test('dos medios tienen que sumar el saldo', () => {
  const T = cargar();
  T.set({ info, dividir: true, l1: { method: 'cash', amount: '40000' }, l2: { method: 'transfer', amount: '20000' } });
  assert.match(T.errores().join(' '), /tienen que sumar/);
  T.set({ info, dividir: true, l1: { method: 'cash', amount: '40000' }, l2: { method: 'transfer', amount: '25000' } });
  assert.equal(T.errores().length, 0);
});

test('No cobré pide motivo y deja el saldo pendiente', () => {
  const T = cargar();
  T.set({ info, modo: 'no_cobrado' });
  assert.match(T.errores().join(' '), /por qué no cobraste/);
  T.set({ info, modo: 'no_cobrado', motivo: 'Paga mañana' });
  assert.equal(T.errores().length, 0);
  const p = T.payload();
  assert.equal(p.not_collected, true);
  assert.equal(p.lines.length, 0);
});

test('un servicio de prestadora no suma cobro', () => {
  const T = cargar();
  T.set({ info: { particular: false } });
  assert.equal(T.payload(), null);
  assert.equal(T.errores().length, 0);
});

test('el cobro viaja en el remito y se guarda con v5', () => {
  assert.match(js, /b\.payload\.customer_collections = p/);
  assert.match(supa, /customer_collections\?\.kind === 'private_service'\s*\?\s*'save_driver_operator_service_remito_v5'/);
  assert.match(sql, /save_driver_operator_service_remito_v4\(p_service_id, p_payload - 'customer_collections'/);
});

test('Administración aprueba el cobro y recién ahí baja el saldo', () => {
  assert.match(sql, /insert into public\.service_payments \(service_id, kind, amount, method, received_by, paid_at, note\)/);
  assert.match(sql, /p_decision = 'rejected' and nullif\(btrim\(p_note\), ''\) is null/);
  assert.match(panel, /review_service_collection_v1/);
  assert.match(panel, /Cobro del servicio · particular/);
});

test('medios de pago iguales al remito', () => {
  assert.match(sql, /check \(method in \('cash', 'transfer', 'card', 'mercado_pago', 'other'\)\)/);
});

test('el chofer elige entre efectivo, transferencia y tarjeta', () => {
  assert.match(js, /var MEDIOS = \[\['cash', 'Efectivo'\], \['transfer', 'Transferencia'\], \['card', 'Tarjeta'\]\];/);
  assert.match(js, /¿Tuvo que pagar algo más\?/);
  assert.match(js, /<span>Saldo<\/span>/);
});

test('A cobrar suma los adicionales que el cliente pagó en el lugar', () => {
  const T = cargar();
  const total = T.totalAdicionales([
    { unit_amount: 15000, quantity: 1, customer_payment_method: 'cash' },
    { unit_amount: 5000, quantity: 2, customer_payment_method: 'transfer' },
    { unit_amount: 9000, quantity: 1, customer_payment_method: 'not_collected' }
  ]);
  assert.equal(total, 25000);
});
