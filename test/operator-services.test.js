const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const services = fs.readFileSync('operator-services.js','utf8');
const css = fs.readFileSync('operator-services.css','utf8');
const config = fs.readFileSync('config.js','utf8');

const removed = [
  'operator-active-desk-clean-v1.js','operator-services-canonical-view-v1.js','operator-services-stability-v1.js',
  'operator-services-block-a-v1.js','operator-reference-loader.js','operator-service-v2.js',
  'operator-service-edit.js','operator-service-reajuste-v3.js'
];

test('Servicios tiene una sola mesa tabular y no conserva el Kanban anterior', () => {
  assert.match(services, /os-commandbar/);
  assert.match(services, /os-status-tabs/);
  assert.match(services, /os-table-body/);
  assert.match(services, /<th>Servicio<\/th><th>Fecha<\/th><th>Recorrido<\/th><th>Cliente \/ Vehículo<\/th><th>Chofer \/ Móvil<\/th><th>Estado<\/th>/);
  assert.doesNotMatch(services, /os-kpis|os-board|renderKpis|groupFor\(|os-column-list|Mesa operativa|Centro de despacho/);
});

test('la mesa prioriza densidad y deja la tabla ocupar la pantalla', () => {
  assert.match(css, /os-commandbar/);
  assert.match(css, /height:34px/);
  assert.match(css, /os-status-tabs button/);
  assert.match(css, /height:28px/);
  assert.match(css, /max-height:calc\(100vh - 176px\)/);
  assert.match(css, /os-table th\{position:sticky/);
  assert.match(css, /os-table td\{height:54px/);
});

test('la tabla agrupa datos relacionados y señala servicios que requieren atención', () => {
  assert.match(services, /function needsAttention/);
  assert.match(services, /function delayMinutes/);
  assert.match(services, /\['attention','Atención'\]/);
  assert.match(services, /serviceIdentity/);
  assert.match(services, /resourceCell/);
  assert.match(services, /os-route-cell/);
  assert.match(services, /os-unassigned/);
  assert.match(services, /os-delay/);
});

test('la mesa carga referencias mediante una única RPC protegida', () => {
  assert.match(services, /get_operator_service_reference_data/);
  assert.match(services, /list_operator_services/);
  assert.doesNotMatch(services, /company_branches|S\.branches/);
  assert.doesNotMatch(services, /\.from\('users'\)|\.from\('companies'\)/);
});

test('Operaciones puede ver la mesa sin recibir una implementación diferente por feature flag', () => {
  assert.match(services, /canRead=\(\)=>\['administracion','operador','supervision','facturacion'\]\.includes\(role\(\)\)/);
  assert.match(services, /canManage=\(\)=>\['administracion','operador'\]\.includes\(role\(\)\)/);
  assert.doesNotMatch(services, /AuxiliosFeatures|operator_console_v2|service_editing_tolls_v1/);
});

test('los importes solo se pintan para Administración o Facturación', () => {
  assert.match(services, /canSeeCommercial=\(\)=>\['administracion','facturacion'\]\.includes\(role\(\)\)/);
  assert.match(services, /if\(canSeeCommercial\(\)\)/);
});

test('el runtime no carga ninguna de las implementaciones reemplazadas', () => {
  for (const name of removed) assert.equal(config.includes(name), false, `${name} no debe cargarse`);
  assert.match(config, /operator-services\.js/);
  assert.match(config, /operator-service-wizard\.js/);
  assert.match(config, /operator-service-workspace-reactive-v1\.js/);
});
