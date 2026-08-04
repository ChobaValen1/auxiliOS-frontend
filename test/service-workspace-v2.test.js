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

test('la creación usa una pantalla completa de tres columnas', () => {
  assert.match(workspace, /osv2-workspace/);
  assert.match(workspace, /osv2-grid/);
  assert.match(workspace, /admin-column/);
  assert.match(workspace, /route-column/);
  assert.match(workspace, /actions-column/);
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/i);
  assert.match(css, /width:\s*100vw\s*!important/i);
  assert.match(css, /height:\s*100vh\s*!important/i);
  assert.match(css, /overflow:\s*hidden\s*!important/i);
});

test('header, cuerpo y footer permanecen fijos dentro del viewport', () => {
  assert.match(css, /grid-template-rows:\s*54px minmax\(0, 1fr\) 62px/i);
  assert.match(workspace, /osv2-header/);
  assert.match(workspace, /osv2-footer/);
  assert.match(workspace, /Guardar y seguir/);
  assert.match(workspace, /Guardar y Finalizar/);
  assert.match(workspace, /cerrarNuevoServicio\(\)/);
});

test('la segunda columna contiene recorrido, vehículo, kilómetros y observaciones', () => {
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

test('la tercera columna queda reservada para peajes y excedentes', () => {
  assert.match(workspace, /Agregar Peaje/);
  assert.match(workspace, /Agregar Excedente/);
  assert.match(workspace, /Peajes del servicio/);
  assert.match(workspace, /Nombre del peaje/);
  assert.match(workspace, /Excedentes/);
  assert.doesNotMatch(workspace, /actions-column[\s\S]{0,400}Vehículo del cliente/);
});

test('los bloques dinámicos usan scroll interno sin alterar la página completa', () => {
  assert.match(css, /\.osv2-concepts-list[\s\S]*overflow:\s*auto/i);
  assert.match(css, /\.osv2-dynamic-panel[\s\S]*overflow:\s*hidden/i);
  assert.match(css, /\.osv2-grid[\s\S]*overflow:\s*hidden/i);
  assert.match(css, /@media \(max-width: 1099px\)/i);
});

test('la nueva capa reutiliza el flujo existente y no escribe directamente en Supabase', () => {
  assert.match(workspace, /window\.seleccionarEmpresaServicio/);
  assert.match(workspace, /window\.calcularNuevoServicio/);
  assert.match(workspace, /window\.crearServicioFase3B/);
  assert.match(workspace, /window\.guardarBorradorServicio/);
  assert.doesNotMatch(workspace, /\.rpc\(/);
  assert.doesNotMatch(workspace, /\.from\(/);
});

test('el workspace forma parte de CI y de la caché PWA', () => {
  assert.match(pkg, /node --check operator-service-workspace-v2\.js/);
  assert.match(sw, /auxilios-v120/);
  assert.match(sw, /operator-service-workspace-v2\.css/);
  assert.match(sw, /operator-service-workspace-v2\.js/);
});
