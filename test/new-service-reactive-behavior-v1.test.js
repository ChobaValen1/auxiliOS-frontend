const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const behavior = fs.readFileSync('operator-service-workspace-behavior-v1.js','utf8');
const config = fs.readFileSync('config.js','utf8');
const flags = fs.readFileSync('feature-flags.js','utf8');
const sw = fs.readFileSync('sw.js','utf8');
const pkg = fs.readFileSync('package.json','utf8');

test('Marca y Modelo siguen sincronizando vehicle_make_model sin repintar el workspace', () => {
  assert.match(behavior, /vehicle_make_model/);
  assert.match(behavior, /osv4-make/);
  assert.match(behavior, /osv4-model/);
  assert.doesNotMatch(behavior, /MutationObserver/);
  assert.doesNotMatch(behavior, /innerHTML/);
});

test('Chofer y Móvil conservan emparejamiento por jornada abierta', () => {
  assert.match(behavior, /get_operator_resource_availability/);
  assert.match(behavior, /active_truck_id/);
  assert.match(behavior, /active_driver_id/);
  assert.match(behavior, /setPair/);
});

test('el workspace y su comportamiento tienen un solo cargador canónico', () => {
  assert.ok(config.indexOf('/operator-service-workspace-behavior-v1.js') > config.indexOf('/operator-service-workspace-reactive-v1.js'));
  assert.doesNotMatch(flags, /operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(flags, /operator-service-workspace-behavior-v1\.js/);
  assert.doesNotMatch(flags, /configuration-service-unit-v1\.js/);
  assert.match(sw, /operator-service-workspace-behavior-v1\.js/);
  assert.match(pkg, /node --check operator-service-workspace-behavior-v1\.js/);
});
