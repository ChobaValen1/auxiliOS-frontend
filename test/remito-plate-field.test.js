const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const flow = fs.readFileSync('remito-mobile-flow-v3.js', 'utf8');
const bridge = fs.readFileSync('operator-service-bridge.js', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');

test('un servicio asignado sin patente muestra el campo en el paso 1', () => {
  assert.match(flow, /data-remito-field="vehicle_plate" hidden><span>Patente del vehículo \*<\/span>/);
  assert.match(flow, /function syncPlateField\(\)/);
  assert.match(flow, /if\(!input\.value\.trim\(\)\)\{input\.classList\.add\('rmv-input'\);slot\.appendChild\(input\);box\.hidden=false;\}/);
  assert.match(bridge, /window\.AuxiliosRemitoMobileV3\?\.syncPlateField\?\.\(\)/);
  assert.match(sigma, /if \(!patente\) \{ window\.AuxiliosRemitoMobileV3\?\.syncPlateField\?\.\(\);/);
});
