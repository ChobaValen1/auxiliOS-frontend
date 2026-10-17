const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load() {
  const window = {AxUI: {icon: () => '<svg></svg>'}};
  vm.runInNewContext(fs.readFileSync('ui/service-improvements-v1.js', 'utf8'), {window});
  return window.AuxiliosServiceImprovements;
}
test('15, 30 y 60 minutos conservan las cantidades y los importes por hora', () => {
  const ui = load();
  for (const [minutes, hours] of [[15, .25], [30, .5], [60, 1], [90, 1.5]]) {
    assert.equal(ui.hoursToMinutes(hours), minutes);
    assert.equal(ui.minutesToHours(minutes), hours);
    assert.equal(ui.minutesToHours(minutes) * 12000, hours * 12000);
  }
  assert.equal(ui.duration(.25), '15 min');
  assert.equal(ui.duration(1), '1 hora');
  assert.equal(ui.duration(1.5), '1 hora 30 min');
  assert.equal(ui.isHourly({concept_id: 'a1e5c0de-0003-4000-8000-000000000003'}), true);
  assert.equal(ui.isHourly({pricing_unit: 'km'}), false);
});
test('el resumen ignora identificadores locales y el orden de propiedades, conserva importes y cantidades', () => {
  const ui = load();
  const before = {operator_notes: 'Antes', commercial_addons: {tolls: [{_id:'a',quantity:1,unit_amount:1500}]}};
  const after = {operator_notes: 'Después', commercial_addons: {tolls: [{unit_amount:1500,quantity:1,_id:'b'}]}};
  assert.equal(ui.changes(before, after).length, 1);
  assert.equal(ui.changes(before, after)[0].key, 'operator_notes');
  after.commercial_addons.tolls[0].quantity = 2;
  assert.equal(ui.changes(before, after).length, 2);
  assert.equal(ui.changes({customer_email: null}, {customer_email: ''}).length, 0);
});
test('el aviso termina al firmar, recibir, aprobar, anular o finalizar el remito', () => {
  const ui = load(), s = {status: 'assigned', document_status: 'draft'};
  assert.equal(ui.remitoPreparing(s), true);
  assert.equal(ui.remitoPreparing({status:'assigned',trip_id:8}), true);
  assert.equal(ui.remitoPreparing({status:'assigned',trip_started:true}), true);
  assert.equal(ui.remitoPreparing({status:'assigned'}), false);
  for (const patch of [{status:'completed'}, {status:'cancelled'}, {driver_activated:true}, {remito_status:'firmado'}, {document_status:'submitted'}, {document_status:'approved'}, {remito_signed_at:'2026-10-17T12:00:00Z'}]) {
    assert.equal(ui.remitoPreparing({...s,...patch}), false, JSON.stringify(patch));
  }
});
test('el resumen comercial explica duración, importe y cobrador en lenguaje visible', () => {
  const ui = load();
  const label = ui.display('commercial_addons', {toll_coverage_mode:'provider_roundtrip',excess_charges:[{concept_name:'Hora Trabajo',concept_id:'a1e5c0de-0002-4000-8000-000000000002',quantity:.5,unit_amount:12000,collector_agent:'company',customer_payment_method:'cash'}]});
  assert.match(label, /30 min/);
  assert.match(label, /12.000/);
  assert.match(label, /Empresa/);
  assert.match(label, /Efectivo/);
});
