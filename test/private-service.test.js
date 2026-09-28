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

test('sin pago, seña o pago total: el saldo a cobrar se calcula solo', () => {
  const P = cargar();
  const s = P._test.estadoInicial();
  s.ctx = { services: [] };
  Object.assign(s.d, { presupuesto: '85000', pago: 'sena', sena_monto: '20000', sena_medio: 'transfer' });
  assert.equal(P._test.saldo(s), 65000);
  assert.equal(JSON.stringify(P._test.deposito(s)), JSON.stringify({ amount: 20000, method: 'transfer' }));
  s.d.sena_monto = '90000';
  assert.match(P._test.errores(s).join(' '), /menor al presupuesto/);
  s.d.pago = 'total';
  assert.equal(P._test.saldo(s), 0);
  assert.equal(P._test.deposito(s).amount, 85000);
  assert.doesNotMatch(P._test.errores(s).join(' '), /seña/);
  s.d.pago = 'no';
  assert.equal(P._test.saldo(s), 85000);
  assert.equal(P._test.deposito(s), null);
});

test('medios de pago del operador: efectivo, transferencia y tarjeta', () => {
  assert.match(js, /\['cash', 'Efectivo'\],\s*\['transfer', 'Transferencia'\],\s*\['card', 'Tarjeta'\]\s*\]/);
  assert.match(js, /'Pago total'/);
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

test('Nuevo servicio pregunta primero; un activado del chofer sigue por prestadora', () => {
  assert.match(js, /if \(info && info\.driver_activated\) return abrirPrestadora\(intake\);/);
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

test('DNI de 8 dígitos o CUIT de 11, sólo números', () => {
  const P = cargar();
  const s = P._test.estadoInicial();
  s.ctx = { services: [] };
  for (const [doc, ok] of [['12345678', true], ['20123456789', true], ['1234567', false], ['123456789', false], ['2012345678', false]]) {
    s.d.customer_document = doc;
    const e = P._test.errores(s).join(' ');
    assert.equal(!/8 dígitos y el CUIT 11/.test(e), ok, doc);
  }
});

test('la confirmación es la misma que el alta de prestadoras', () => {
  assert.match(js, /operationFeedback\('Servicio creado', detalle, 'success', 2400\)/);
  assert.match(js, /'Quedó cargado' \+ \(numero \? ' con el N° ' \+ numero : ''\)/);
});

test('las direcciones se buscan al escribir y muestran por qué no hay sugerencias', () => {
  assert.match(js, /if \(kind && ev\.type === 'input'\) escribirDireccion/);
  assert.match(js, /No se pudieron buscar direcciones/);
  assert.match(js, /radius: 50000/);
});
