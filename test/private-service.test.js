const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('private-service-v1.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928100000_particulares_v1.sql', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');

function cargar() {
  const win = { crypto: { randomUUID: () => 'x' } };
  const doc = { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { add() {}, remove() {} }, appendChild() {} }, createElement: () => ({}) };
  vm.runInNewContext(js, { window: win, document: doc, setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, console });
  return win.AuxiliosParticulares;
}

test('el formulario de particular exige cliente, tipo, origen y presupuesto', () => {
  const P = cargar();
  const s = P._test.estadoInicial();
  s.ctx = { services: [{ concept_id: 'c1', name: 'Liviano', category: 'primary', available: true }] };
  const e = P._test.errores(s).join(' ');
  ['nombre del cliente', 'teléfono', 'tipo de servicio', 'origen', 'presupuesto'].forEach(t => assert.match(e, new RegExp(t)));
});

test('la seña no puede superar el presupuesto y el saldo se calcula solo', () => {
  const P = cargar();
  const s = P._test.estadoInicial();
  Object.assign(s.d, { presupuesto: '85000', sena: true, sena_monto: '20000' });
  assert.equal(P._test.saldo(s), 65000);
  s.d.sena_monto = '90000';
  s.ctx = { services: [] };
  assert.match(P._test.errores(s).join(' '), /no puede superar el presupuesto/);
});

test('pedir factura exige DNI o CUIT', () => {
  const P = cargar();
  const s = P._test.estadoInicial();
  s.ctx = { services: [] };
  s.d.factura = true;
  assert.match(P._test.errores(s).join(' '), /DNI o CUIT/);
  s.d.customer_document = '20123456789';
  assert.doesNotMatch(P._test.errores(s).join(' '), /DNI o CUIT/);
});

test('un servicio de una sola dirección no pide destino', () => {
  const P = cargar();
  const s = P._test.estadoInicial();
  s.ctx = { services: [{ concept_id: 'u', name: 'UML', category: 'primary', available: true, single_address: true }] };
  s.d.primary_concept_id = 'u';
  assert.doesNotMatch(P._test.errores(s).join(' '), /destino/);
});

test('la cuenta Particulares no aparece como prestadora', () => {
  const P = cargar();
  assert.equal(P.esCuentaParticular({ client_kind: 'particular' }), true);
  assert.equal(P.esCuentaParticular({ trade_name: 'Particulares' }), true);
  assert.equal(P.esCuentaParticular({ trade_name: 'Addiuva' }), false);
});

test('Nuevo servicio pregunta primero; un ingreso del chofer sigue por prestadora', () => {
  assert.match(js, /if \(intake\) return abrirPrestadora\(intake\);/);
  assert.match(js, /data-psv="particular"/);
  assert.match(js, /data-psv="prestadora"/);
  assert.ok(config.indexOf("'/private-service-v1.js'") > config.indexOf("'/operator-service-wizard.js'"), 'se carga después del alta de prestadoras');
});

test('la migración: presupuesto como total, seña retenida, anulación sólo de Administración', () => {
  assert.match(sql, /new\.company_estimated_total := new\.quoted_total/);
  assert.match(sql, /create table if not exists public\.service_payments/);
  assert.match(sql, /revoke all on public\.service_payments from anon, authenticated/);
  assert.match(sql, /<> 'administracion' then\s+raise exception 'Sólo Administración puede anular un cobro'/);
  assert.match(sql, /v_role = 'chofer' and v_s\.assigned_driver_id = auth\.uid\(\)/);
  assert.match(sql, /set search_path to ''/);
});
