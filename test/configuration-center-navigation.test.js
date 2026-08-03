'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('configuration center preserves driver navigation and limits the new workspace by role', () => {
  const source = read('configuration-center.js');

  assert.match(source, /BACKOFFICE_ROLES = new Set\(\['administracion', 'supervision', 'facturacion'\]\)/);
  assert.doesNotMatch(source, /BACKOFFICE_ROLES[^\n]*chofer/);
  assert.match(source, /document\.body\.classList\.remove\('aux-backoffice-nav'\)/);
  assert.match(source, /Sin permiso para acceder a Configuración/);
});

test('administrative navigation has five clear top-level destinations without duplicating configuration modules', () => {
  const source = read('configuration-center.js');

  assert.match(source, /setNavContent\('nav-dashboard', '📊', 'Resumen'\)/);
  assert.match(source, /setNavContent\('nav-operaciones', '🧭', 'Servicios'\)/);
  assert.match(source, /id="nav-configuracion"/);
  assert.match(source, /setNavContent\('nav-config-tariff-matrix', '💳', 'Facturación'\)/);
  assert.match(source, /id="nav-historial-sistema"/);

  assert.match(source, /companyGroup\.appendChild\(companies\)/);
  assert.match(source, /companyGroup\.appendChild\(bases\)/);
  assert.match(source, /operationGroup\.appendChild\(services\)/);
  assert.match(source, /billingGroup\.appendChild\(tariffTypes\)/);
  assert.doesNotMatch(source, /billingGroup\.appendChild\(.*tariff-matrix/);
});

test('future modules are visibly disabled and do not create orphan routes', () => {
  const source = read('configuration-center.js');

  assert.match(source, /class="aux-config-link future"/);
  assert.match(source, /Próxima fase/);
  assert.match(source, /Particulares/);
  assert.match(source, /Logística tercerizada/);
  assert.match(source, /Importar Excel/);
  assert.doesNotMatch(source, /goTo\('particulares'\)/);
  assert.doesNotMatch(source, /goTo\('importar-excel'\)/);
});

test('configuration center uses live data and safe audit fields', () => {
  const source = read('configuration-center.js');

  assert.match(source, /list_geographic_bases/);
  assert.match(source, /list_service_types_config/);
  assert.match(source, /get_company_billing_configuration/);
  assert.match(source, /list_company_tariff_matrix_v2/);
  assert.match(source, /select\('event_id,occurred_at,actor_id,operation,entity_table,entity_id'\)/);
  assert.doesNotMatch(source, /before_data/);
  assert.doesNotMatch(source, /after_data/);
});

test('configuration center is loaded, checked and precached', () => {
  const config = read('config.js');
  const serviceWorker = read('sw.js');
  const pkg = read('package.json');

  assert.match(config, /auxilios-configuration-center/);
  assert.match(config, /\/configuration-center\.js/);
  assert.match(serviceWorker, /auxilios-v109/);
  assert.match(serviceWorker, /'\/configuration-center\.js'/);
  assert.match(serviceWorker, /'\/configuration-center\.css'/);
  assert.match(pkg, /node --check configuration-center\.js/);
});
