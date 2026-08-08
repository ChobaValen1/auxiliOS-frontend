const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const flags = read('feature-flags.js');
const workspace = read('operator-service-workspace-reactive-v1.js');
const wizard = read('operator-service-wizard.js');
const css = read('operator-service-workspace-v2.css');
const reactiveCss = read('operator-service-workspace-reactive-v1.css');
const pkg = read('package.json');
const sw = read('sw.js');

test('el workspace reactivo es el renderer canónico de Nuevo Servicio', () => {
  assert.match(flags, /flags\.service_workspace_v2/);
  assert.match(flags, /operator-service-workspace-v2\.css/);
  assert.match(flags, /operator-service-workspace-reactive-v1\.css/);
  assert.match(flags, /operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(flags, /operator-service-workspace-v2\.js|operator-service-workspace-review-v3\.js/);
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
  assert.match(css, /grid-template-rows:\s*54px minmax\(0, 1fr\) 62px/i);
});

test('la estética reutiliza los tokens visuales de AuxiliOS', () => {
  assert.match(css, /--osv2-bg:\s*var\(--bg/i);
  assert.match(css, /--osv2-panel:\s*var\(--panel/i);
  assert.match(css, /--osv2-card:\s*var\(--card/i);
  assert.match(css, /--osv2-border:\s*var\(--border/i);
  assert.match(css, /--osv2-text:\s*var\(--text/i);
  assert.match(css, /--osv2-amber:\s*var\(--amber/i);
});

test('el formulario se monta una sola vez y luego sincroniza sectores', () => {
  assert.doesNotMatch(workspace, /MutationObserver/);
  assert.equal((workspace.match(/shell\.innerHTML/g) || []).length, 1);
  assert.match(workspace, /function sync\(force=false\)/);
  assert.match(workspace, /function syncCatalog\(\)/);
  assert.match(workspace, /function syncResources\(\)/);
  assert.match(workspace, /function syncSummary\(\)/);
});

test('la primera columna recupera el orden operativo anterior', () => {
  const adminStart = workspace.indexOf('<section class="osv2-column admin-column">');
  const routeStart = workspace.indexOf('<section class="osv2-column route-column">');
  assert.ok(adminStart >= 0 && routeStart > adminStart);
  const admin = workspace.slice(adminStart, routeStart);
  const ordered = ['Código prestadora', 'Fecha *', 'Hora *', 'Arribo', 'Fin', 'Demora', 'Prestadora *', 'Base Operativa', 'Tipo de Servicio *', 'Tipo de Logística', 'Asignar Chofer', 'Asignar Móvil', 'Conceptos adicionales'];
  let cursor = -1;
  for (const label of ordered) {
    const next = admin.indexOf(label);
    assert.ok(next > cursor, `${label} debe respetar el orden anterior`);
    cursor = next;
  }
  assert.doesNotMatch(admin, /Orden de compra/i);
  assert.doesNotMatch(admin, /Patente|Vehículo del cliente/);
  assert.match(admin, /data-time-field="estimated_arrival_at"/);
  assert.match(admin, /data-time-field="estimated_finish_at"/);
});

test('Agregar concepto agrega una fila independiente por click', () => {
  assert.match(workspace, /data-click="add-concept"/);
  assert.match(workspace, /ui\.rows\.push\(\{id:uid\(\),conceptId:''\}\)/);
  assert.match(workspace, /osv4-concept-row/);
  assert.match(workspace, /Concepto/);
  assert.match(workspace, /Código Prestadora/);
  assert.match(workspace, /Cantidad/);
  assert.match(workspace, /Importe/);
  assert.doesNotMatch(workspace, /conceptPickerOpen|osv2-concept-picker-table/);
});

test('las unidades determinan cómo se edita la cantidad', () => {
  assert.match(workspace, /service:\{label:'servicio',step:1,locked:true\}/);
  assert.match(workspace, /unit:\{label:'unidades',step:1,locked:false\}/);
  assert.match(workspace, /km:\{label:'km',step:\.1,locked:false\}/);
  assert.match(workspace, /hour:\{label:'horas',step:\.25,locked:false\}/);
});

test('peajes y excedentes conservan paneles independientes', () => {
  assert.match(workspace, /data-click="toggle-tolls"/);
  assert.match(workspace, /data-click="toggle-extras"/);
  assert.match(workspace, /id="osv4-tolls"/);
  assert.match(workspace, /id="osv4-extras"/);
});

test('la segunda columna conserva recorrido vehículo cliente kilómetros y observaciones', () => {
  const routeStart = workspace.indexOf('<section class="osv2-column route-column">');
  const actionsStart = workspace.indexOf('<section class="osv2-column actions-column">');
  assert.ok(routeStart >= 0 && actionsStart > routeStart);
  const route = workspace.slice(routeStart, actionsStart);
  const ordered = ['Origen', 'Destino', 'Vehículo del cliente', 'Marca', 'Modelo', 'Patente', 'Tel. Cliente *', 'Cliente / Socio', 'Kilómetros', 'KM Asfalto', 'KM Ripio', 'KM Totales', 'Observaciones'];
  let cursor = -1;
  for (const label of ordered) {
    const next = route.indexOf(label);
    assert.ok(next > cursor, `${label} debe permanecer en la segunda columna y en orden`);
    cursor = next;
  }
  assert.match(route, /maps-proxy|data-address=/);
});

test('Orden de compra no pertenece al flujo de alta del operador', () => {
  assert.doesNotMatch(workspace, /Orden de compra/i);
  assert.doesNotMatch(wizard, /El contrato exige orden de compra/i);
  assert.doesNotMatch(wizard, /requires_purchase_order.*errors\.push/i);
});

test('Maps flota sobre el layout y no ocupa espacio al cerrarse', () => {
  assert.match(reactiveCss, /\.osv4-suggestions\{position:absolute/);
  assert.match(reactiveCss, /\.osv4-suggestions\[hidden\]\{display:none!important\}/);
  assert.match(workspace, /function closeSuggestions\(kind,cancel=false\)/);
});

test('el workspace forma parte de CI y utiliza una caché PWA vigente', () => {
  assert.match(pkg, /node --check operator-service-workspace-reactive-v1\.js/);
  const version = sw.match(/auxilios-v(\d+)/);
  assert.ok(version);
  assert.ok(Number(version[1]) >= 143);
  assert.match(sw, /operator-service-workspace-v2\.css/);
  assert.match(sw, /operator-service-workspace-reactive-v1\.css/);
  assert.match(sw, /operator-service-workspace-reactive-v1\.js/);
});