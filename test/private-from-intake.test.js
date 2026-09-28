const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('private-service-v1.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928170000_particulares_desde_ingreso_v7.sql', 'utf8');

function cargar(intakes) {
  const win = { crypto: { randomUUID: () => 'x' }, OperatorServices: { S: { intakes: intakes || [] } } };
  const doc = { getElementById: () => null, addEventListener() {}, querySelector: () => null, body: { classList: { add() {}, remove() {} }, appendChild() {} }, createElement: () => ({}) };
  vm.runInNewContext(js, { window: win, document: doc, setInterval: () => 0, clearInterval() {}, setTimeout, clearTimeout, console, OperatorServices: win.OperatorServices });
  return win.AuxiliosParticulares;
}

test('el formulario se completa con los datos del remito del chofer', () => {
  const P = cargar([{ intake_id: 'i1', driver_name: 'Juan Pérez', truck_label: 'M-12' }]);
  const s = P._test.estadoInicial();
  const r = P._test.desdeIngreso(s, {
    intake_id: 'i1', intake_number: 'ING-1', remito: { nro_remito: 'R-77', status: 'firmado' },
    service: { customer_name: 'María López', customer_phone: '11 3456-7890', customer_document: '20-12345678-9',
      vehicle_plate: 'AB123CD', origin: 'Av. Rivadavia 1234', destination: 'Morón', origin_lat: -34.6,
      assigned_driver_id: 'd1', assigned_truck_id: 7, scheduled_for: '2026-09-28T10:00:00Z' }
  });
  assert.equal(r.d.customer_name, 'María López');
  assert.equal(r.d.customer_phone, '1134567890');
  assert.equal(r.d.customer_document, '20123456789');
  assert.equal(r.d.origin_lat, '-34.6');
  assert.equal(r.d.assigned_truck_id, '7');
  assert.equal(r.d.captado, true);
  assert.equal(r.d.referred_by_driver_id, 'd1');
  assert.equal(r.intake.chofer, 'Juan Pérez');
  assert.equal(r.intake.numero, 'R-77');
});

test('desde un ingreso se pregunta Particular | Prestadora; un activado sigue por prestadora', () => {
  assert.match(js, /if \(info && info\.driver_activated\) return abrirPrestadora\(intake\);\s*return elegirTipo\(id\);/);
  assert.match(js, /O\.openWizard = w;/);
  assert.match(js, /return abrirParticular\(intakeElegido\)/);
});

test('guardar desde un ingreso crea, vincula, registra lo cobrado y finaliza', () => {
  assert.match(js, /create_private_service_from_intake_v1/);
  assert.match(js, /p_collection: \{ lines: dep \? \[\{ method: dep\.method, amount: dep\.amount \}\] : \[\] \}/);
  assert.match(sql, /create_and_link_driver_service_intake_v2\(p_intake_id,/);
  assert.match(sql, /'approved', 'Cargado por Operaciones al crear el servicio desde el ingreso'/);
  assert.match(sql, /resolve_operator_service_document_v6\(v_service, 'approve_and_finalize'/);
  assert.match(sql, /if v_intake\.driver_activated then raise exception/);
  assert.match(sql, /if v_total > round\(p_quoted_total, 2\) then raise exception/);
});
