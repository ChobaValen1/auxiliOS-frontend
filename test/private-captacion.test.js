const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sql = fs.readFileSync('migrations/20260928160000_particulares_captacion_v6.sql', 'utf8');
const html = fs.readFileSync('Index.html', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');
const form = fs.readFileSync('private-service-v1.js', 'utf8');

function matrix() {
  const c = { window: {}, console, document: { getElementById: () => null } };
  vm.runInNewContext(fs.readFileSync('payroll-matrix.js', 'utf8'), c);
  return c.window.PayrollMatrix;
}

test('la comisión por captación paga % de lo cobrado en cada servicio que consiguió', () => {
  const M = matrix();
  const r = M.calculate({ commissions: [{ commission_id: 'k', name: 'Captación', source: 'captacion', mode: 'percent', value: 10 }] },
    { captacion: [{ id: 'capt:a', service_id: 'a', concept_id: null, quantity: 1, amount: 85000, currency: 'ARS' },
                  { id: 'capt:b', service_id: 'b', concept_id: null, quantity: 1, amount: 40000, currency: 'ARS' }] }, 0);
  assert.equal(r.commission, 12500);
});

test('la captación fija paga por servicio y no pide concepto', () => {
  const M = matrix();
  const r = M.calculate({ commissions: [{ source: 'captacion', mode: 'fixed', value: 5000 }] },
    { captacion: [{ id: 'capt:a', quantity: 1, amount: 0, currency: 'ARS' }, { id: 'capt:b', quantity: 1, amount: 0, currency: 'ARS' }] }, 0);
  assert.equal(r.commission, 10000);
  assert.equal(M.commissionSourceLabel('captacion'), 'Captación de particular');
  assert.equal(M.commissionFormula({ source: 'captacion', mode: 'percent', value: 10 }), '10% de lo cobrado');
});

test('el origen captación existe en la base y en Comisiones', () => {
  assert.match(sql, /check \(source in \('extras', 'invoices', 'captacion'\)\)/);
  assert.match(sql, /check \(source = 'captacion' or concept_id is not null\)/);
  assert.match(sql, /'captacion',coalesce\(/);
  assert.match(sql, /p\.voided_at is null/);
  assert.match(sql, /referred_by_driver_id = v_referrer/);
  assert.match(html, /<option value="captacion">Captación de particular/);
  assert.match(sigma, /function _syncComisionOrigen\(\)/);
});

test('el operador marca qué chofer consiguió el servicio', () => {
  const win = { crypto: { randomUUID: () => 'x' } };
  const doc = { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { add() {}, remove() {} }, appendChild() {} }, createElement: () => ({}) };
  vm.runInNewContext(fs.readFileSync('private-service-v1.js', 'utf8'), { window: win, document: doc, setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, console });
  const P = win.AuxiliosParticulares;
  const s = P._test.estadoInicial();
  s.ctx = { services: [] };
  s.d.captado = true;
  assert.match(P._test.errores(s).join(' '), /chofer que consiguió/);
  assert.match(form, /Lo consiguió un chofer/);
  assert.match(form, /referred_by_driver_id: d\.captado \? d\.referred_by_driver_id \|\| null : null/);
});
