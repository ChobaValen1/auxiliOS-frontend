const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/20260804172000_service_workspace_v2_private_beta.sql');
const flags = read('feature-flags.js');
const workspace = read('operator-service-workspace-v2.js');
const css = read('operator-service-workspace-v2.css');
const pkg = read('package.json');
const sw = read('sw.js');

test('el workspace se habilita únicamente por una bandera individual', () => {
  assert.match(migration, /'service_workspace_v2'/);
  assert.match(migration, /lower\(u\.email\) = 'admin@sigmaremolques\.com'/i);
  assert.doesNotMatch(migration, /supervisor@sigmaremolques\.com/i);
  assert.doesNotMatch(migration, /where[\s\S]{0,160}role/i);
  assert.match(flags, /flags\.service_workspace_v2/);
  assert.match(flags, /operator-service-workspace-v2\.css/);
  assert.match(flags, /operator-service-workspace-v2\.js/);
  assert.doesNotMatch(flags, /admin@sigmaremolques\.com/);
});

test('la creación conserva el layout full screen de tres columnas', () => {
  assert.match(workspace, /osv2-workspace/);
  assert.match(workspace, /osv2-grid/);
  assert.match(workspace, /admin-column/);
  assert.match(workspace, /route-column/);
  assert.match(workspace, /actions-column/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/i);
  assert.match(css, /width:\s*100vw\s*!important/i);
  assert.match(css, /height:\s*100vh\s*!important/i);
  assert.match(css, /overflow:\s*hidden\s*!important/i);
  assert.match(css, /grid-template-rows:\s*54px minmax\(0, 1fr\) 62px/i);
});

test('la estética reutiliza los tokens visuales de AuxiliOS', () => {
  assert.match(css, /--osv2-bg:\s*var\(--bg/i);
  assert.match(css, /--osv2-panel:\s*var\(--panel/i);
  assert.match(css, /--osv2-card:\s*var\(--card/i);
  assert.match(css, /--osv2-border:\s*var\(--border/i);
  assert.match(css, /--osv2-text:\s*var\(--text/i);
  assert.match(css, /--osv2-amber:\s*var\(--amber/i);
  assert.match(css, /background:\s*var\(--osv2-bg\)/i);
  assert.doesNotMatch(css, /linear-gradient\(90deg,\s*#eff6ff/i);
  assert.doesNotMatch(css, /background:\s*#fff\s*[;!]/i);
});

test('los inputs de texto actualizan estado sin renderizar toda la pantalla por tecla', () => {
  const inputBody = workspace.match(/function input\(key,value,validationKey=key\)\{([\s\S]*?)\n\}/)?.[1] || '';
  const vehicleBody = workspace.match(/function setVehicleInput\(key,value\)\{([\s\S]*?)\n\}/)?.[1] || '';
  const distanceBody = workspace.match(/function setDistanceInput\(key,value\)\{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(workspace, /oninput="osv2Input\('customer_phone'/);
  assert.match(workspace, /oninput="osv2Input\('\$\{kind\}'/);
  assert.match(workspace, /oninput="osv2VehicleInput\('vehicle_make'/);
  assert.match(workspace, /oninput="osv2DistanceInput\('estimated_asphalt_km'/);
  assert.doesNotMatch(inputBody, /render\(\)/);
  assert.doesNotMatch(vehicleBody, /render\(\)/);
  assert.doesNotMatch(distanceBody, /render\(\)/);
  assert.match(inputBody, /setCore\(key,value\)/);
  assert.match(workspace, /onblur="osv2Blur\('customer_phone'\)"/);
});

test('agregar concepto parte de un botón y despliega una tabla tarifaria', () => {
  assert.match(workspace, /osv2-add-concept-trigger/);
  assert.match(workspace, /＋ Agregar Concepto/);
  assert.match(workspace, /function conceptPicker\(w\)/);
  assert.match(workspace, /osv2-concept-picker-table/);
  assert.match(workspace, /Conceptos disponibles/);
  assert.match(workspace, /Servicios precargados en el tarifario vigente/);
  assert.match(workspace, /Concepto<\/span><span>Unidad<\/span><span>Precio<\/span><span>Acción/);
  assert.match(workspace, /secondaryPrice\(item\)/);
  assert.match(workspace, /osv2AddSecondary/);
  assert.doesNotMatch(workspace, /id="osv2-secondary-select"/);
});

test('peajes y excedentes tienen estados independientes y pueden convivir', () => {
  assert.match(workspace, /let panels=\{tolls:false,extras:false\}/);
  assert.match(workspace, /panels\.tolls\|\|panels\.extras/);
  assert.match(workspace, /complementaryPanel\('tolls'/);
  assert.match(workspace, /complementaryPanel\('extras'/);
  assert.match(workspace, /panels\[panel\]=!panels\[panel\]/);
  assert.match(css, /\.osv2-complementary-stack[\s\S]*overflow:\s*auto/i);
  assert.match(css, /\.osv2-dynamic-panel[\s\S]*overflow:\s*hidden/i);
  assert.doesNotMatch(css, /\.osv2-dynamic-panel[\s\S]{0,220}position:\s*absolute/i);
});

test('los warnings muestran errores por campo y resumen antes de crear', () => {
  assert.match(workspace, /function validationErrors\(\)/);
  assert.match(workspace, /Completá la fecha del servicio/);
  assert.match(workspace, /Seleccioná una prestadora/);
  assert.match(workspace, /Seleccioná el tipo de servicio/);
  assert.match(workspace, /Completá el teléfono del cliente/);
  assert.match(workspace, /Completá el origen/);
  assert.match(workspace, /Completá el destino/);
  assert.match(workspace, /Chofer y móvil deben seleccionarse juntos/);
  assert.match(workspace, /osv2-field-error/);
  assert.match(workspace, /osv2-validation-summary/);
  assert.match(workspace, /submitAttempted=true/);
  assert.match(workspace, /focusFirstError\(errors\)/);
  assert.match(css, /\.has-error input/);
  assert.match(css, /\.osv2-validation-summary\.invalid/);
});

test('la segunda columna conserva recorrido, vehículo, kilómetros y observaciones', () => {
  const routeStart = workspace.indexOf('<section class="osv2-column route-column">');
  const actionsStart = workspace.indexOf('<section class="osv2-column actions-column">');
  assert.ok(routeStart >= 0 && actionsStart > routeStart);
  const routeSection = workspace.slice(routeStart, actionsStart);
  assert.match(routeSection, /renderLocation\('origin','Origen'/);
  assert.match(routeSection, /renderLocation\('destination','Destino'/);
  assert.match(routeSection, /Vehículo del cliente/);
  assert.match(routeSection, /KM Asfalto/);
  assert.match(routeSection, /KM Ripio/);
  assert.match(routeSection, /Observaciones/);
});

test('la capa reutiliza el flujo existente y no escribe directamente en Supabase', () => {
  assert.match(workspace, /window\.seleccionarEmpresaServicio/);
  assert.match(workspace, /window\.calcularNuevoServicio/);
  assert.match(workspace, /window\.crearServicioFase3B/);
  assert.match(workspace, /guardarBorradorServicio\(\)/);
  assert.doesNotMatch(workspace, /\.rpc\(/);
  assert.doesNotMatch(workspace, /\.from\(/);
});

test('el workspace forma parte de CI y utiliza una caché PWA vigente', () => {
  assert.match(pkg, /node --check operator-service-workspace-v2\.js/);
  assert.match(sw, /auxilios-v12[1-9]|auxilios-v1[3-9]\d/);
  assert.match(sw, /operator-service-workspace-v2\.css/);
  assert.match(sw, /operator-service-workspace-v2\.js/);
});
