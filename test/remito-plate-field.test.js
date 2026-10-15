const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const flow = fs.readFileSync('remito-mobile-flow-v3.js', 'utf8');
const bridge = fs.readFileSync('operator-service-bridge.js', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');

test('la patente está siempre en el paso 1 y el chofer la puede completar o corregir', () => {
  assert.match(flow, /data-remito-field="vehicle_plate" hidden><span>Patente del vehículo \*<\/span>/);
  assert.match(flow, /function syncPlateField\(\)/);
  assert.match(flow, /input\.readOnly=false;/);
  assert.match(flow, /if\(!slot\.contains\(input\)\)slot\.appendChild\(input\);box\.hidden=false;/);
  assert.match(flow, /Revisala mirando el vehículo y completala o corregila si hace falta\./);
  assert.match(flow, /e\.target\.value\.toUpperCase\(\)/);
  assert.match(bridge, /window\.AuxiliosRemitoMobileV3\?\.syncPlateField\?\.\(\)/);
  assert.match(sigma, /if \(!patente\) \{ window\.AuxiliosRemitoMobileV3\?\.syncPlateField\?\.\(\);/);
});
