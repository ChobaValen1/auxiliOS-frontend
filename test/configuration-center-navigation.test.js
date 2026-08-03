'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('configuration center preserves driver navigation and limits the workspace by role', () => {
  const source = read('configuration-center.js');
  const frequent = read('frequent-navigation.js');

  assert.match(source, /BACKOFFICE_ROLES = new Set\(\['administracion', 'supervision', 'facturacion'\]\)/);
  assert.doesNotMatch(source, /BACKOFFICE_ROLES[^\n]*chofer/);
  assert.match(frequent, /MANAGEMENT_ROLES = new Set\(\['administracion', 'supervision'\]\)/);
  assert.doesNotMatch(frequent, /MANAGEMENT_ROLES[^\n]*(chofer|facturacion)/);
  assert.match(source, /document\.body\.classList\.remove\('aux-backoffice-nav'\)/);
});

test('frequent operational modules stay as direct navigation destinations', () => {
  const source = read('frequent-navigation.js');

  assert.match(source, /setNavContent\('nav-dashboard', '📊', 'Resumen'\)/);
  assert.match(source, /setNavContent\('nav-operaciones', '🧭', 'Servicios'\)/);
  assert.match(source, /setNavContent\('nav-jornadas-admin', '🗓️', 'Jornadas'\)/);
  assert.match(source, /setNavContent\('nav-documentos', '📄', 'Docs'\)/);
  assert.match(source, /setNavContent\('nav-remitos', '🧾', 'Remitos'\)/);
  assert.match(source, /setNavContent\('nav-grilla', '📅', 'Grilla'\)/);
  assert.match(source, /setNavContent\('nav-configuracion', '⚙️', 'Configuración'\)/);
  assert.match(source, /setNavContent\('nav-config-tariff-matrix', '💳', 'Facturación'\)/);
  assert.match(source, /setNavContent\('nav-historial-sistema', '◷', 'Historial'\)/);
});

test('configuration keeps structural modules without duplicating frequent access', () => {
  const center = read('configuration-center.js');
  const frequent = read('frequent-navigation.js');

  assert.match(center, /companyGroup\.appendChild\(companies\)/);
  assert.match(center, /companyGroup\.appendChild\(bases\)/);
  assert.match(center, /operationGroup\.appendChild\(services\)/);
  assert.match(center, /billingGroup\.appendChild\(tariffTypes\)/);
  assert.doesNotMatch(center, /billingGroup\.appendChild\(.*tariff-matrix/);
  assert.match(frequent, /document\.getElementById\('aux-settings-grid'\)\?\.remove\(\)/);
  assert.match(frequent, /aux-center-tool\[onclick\*=/);
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

test('configuration and frequent navigation are loaded, checked and precached', () => {
  const config = read('config.js');
  const serviceWorker = read('sw.js');
  const pkg = read('package.json');
  const cacheVersion = Number(serviceWorker.match(/auxilios-v(\d+)/)?.[1] || 0);

  assert.match(config, /auxilios-configuration-center/);
  assert.match(config, /auxilios-frequent-navigation/);
  assert.match(config, /\/frequent-navigation\.js/);
  assert.ok(cacheVersion >= 110, `Expected cache version 110 or newer, received ${cacheVersion}`);
  assert.match(serviceWorker, /'\/configuration-center\.js'/);
  assert.match(serviceWorker, /'\/frequent-navigation\.js'/);
  assert.match(pkg, /node --check configuration-center\.js/);
  assert.match(pkg, /node --check frequent-navigation\.js/);
});
