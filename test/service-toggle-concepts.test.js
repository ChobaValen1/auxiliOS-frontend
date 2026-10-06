const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = f => fs.readFileSync(f, 'utf8');

test('toggle concepts are stored apart from excesses and billing', () => {
  const mig = read('supabase/migrations/20261006140000_service_toggle_concepts.sql');
  assert.match(mig, /input_mode in \('quantity','toggle'\)/);
  assert.match(mig, /create table if not exists public\.service_toggle_marks/);
  assert.match(mig, /set_operator_service_toggles_v1/);
  assert.match(mig, /set_driver_remito_toggles_v1/);
  assert.match(mig, /'tog:'\|\|coalesce\(r\.operator_service_id::text/);
  assert.doesNotMatch(mig, /remito_excess_reports\(remito_id,client_line_id/);
});

test('driver remito shows toggles and saves them after the remito', () => {
  const addons = read('remito-addons-v2.js'), data = read('supabase.js');
  assert.match(addons, /get_service_toggle_concepts_v1/);
  assert.match(addons, /id="rem-toggles-card"/);
  assert.match(addons, /toggle_concept_ids:\[\.\.\.state\.toggles\.selected\]/);
  assert.match(data, /set_driver_remito_toggles_v1/);
  assert.equal((data.match(/await _guardarTogglesRemito\(data\?\.remito_id, payload\)/g) || []).length, 2);
});

test('operator workspace shows toggles in the third column and persists them on save', () => {
  const ws = read('operator-service-workspace-reactive-v1.js'), wiz = read('operator-service-wizard.js');
  assert.match(ws, /actions-column"><section id="osv4-toggles"/);
  assert.match(ws, /set_operator_service_toggles_v1/);
  assert.match(wiz, /OperatorServiceTogglesV1\?\.persist\?\.\(w,data\?\.service_id\|\|w\.serviceId\)/);
});

test('service type catalog edits the toggle mode like any other concept attribute', () => {
  const cat = read('service-types-catalog-v2.js');
  assert.match(cat, /id="st2-toggle"/);
  assert.match(cat, /input_mode:checked\('st2-toggle'\)\?'toggle':'quantity'/);
});

test('private service form shows the toggle and saves it after the service', () => {
  const psv = read('private-service-v1.js');
  assert.match(psv, /get_service_toggle_concepts_v1/);
  assert.match(psv, /set_operator_service_toggles_v1/);
  assert.match(psv, /interruptoresHtml\(\)/);
  assert.equal((psv.match(/await guardarInterruptores\(/g) || []).length, 2);
});
