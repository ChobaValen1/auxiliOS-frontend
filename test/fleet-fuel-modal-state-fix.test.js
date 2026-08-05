const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('fleet-fuel-modal-state-fix.js', 'utf8');
const flags = fs.readFileSync('feature-flags.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const pkg = fs.readFileSync('package.json', 'utf8');

test('fuel modal keeps the selected record id before the CRUD opens its modal', () => {
  assert.match(source, /\[data-fuel-action\]\[data-fuel-id\]/);
  assert.match(source, /state\.fuelId = fuelId/);
  assert.match(source, /selectedFuelId\(form\)/);
  assert.match(source, /label\.match\(\/#\(\\d\+\)\//);
});

test('edit, void and restore submissions use protected RPCs instead of silent closure state', () => {
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /client\.rpc\('update_fuel_record'/);
  assert.match(source, /'restore_fuel_record'/);
  assert.match(source, /'void_fuel_record'/);
  assert.match(source, /p_fuel_id: fuelId/);
  assert.match(source, /showInlineError/);
});

test('fuel modal fix is loaded after the historical edit validator and included in CI and PWA v130', () => {
  const validatorIndex = flags.indexOf('/fleet-fuel-closed-edit-fix.js');
  const stateFixIndex = flags.indexOf('/fleet-fuel-modal-state-fix.js');
  assert.ok(validatorIndex >= 0);
  assert.ok(stateFixIndex > validatorIndex);
  assert.match(pkg, /node --check fleet-fuel-modal-state-fix\.js/);
  assert.match(sw, /auxilios-v130/);
  assert.match(sw, /'\/fleet-fuel-modal-state-fix\.js'/);
});
