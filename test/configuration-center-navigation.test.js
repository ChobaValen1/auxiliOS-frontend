'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('configuration center is the single backoffice navigation owner', () => {
  const center = read('configuration-center.js');
  const config = read('config.js');

  assert.match(center, /BACKOFFICE_ROLES = new Set\(\['administracion', 'supervision', 'facturacion'\]\)/);
  assert.match(center, /function configureBackofficeNavigation/);
  assert.match(center, /orderTop\(\[dashboard, canUseManagementTools\(\) \? operations : null, configuration, tariffs, history\]\)/);
  assert.match(center, /document\.getElementById\('nav-registro'\)/);
  assert.match(center, /registro\.remove\(\)/);
  assert.doesNotMatch(config, /frequent-navigation/);
});

test('management modules move into Configuration instead of returning to the main sidenav', () => {
  const center = read('configuration-center.js');

  for (const id of ['nav-camion', 'nav-jornadas-admin', 'nav-documentos', 'nav-remitos', 'nav-grilla', 'nav-sueldos']) {
    assert.ok(center.includes(`document.getElementById('${id}')`), `${id} must be handled by Configuration`);
  }
  assert.match(center, /moveTo\(operation, document\.getElementById\('nav-camion'\)\)/);
  assert.match(center, /moveTo\(operation, document\.getElementById\('nav-remitos'\)\)/);
  assert.match(center, /moveTo\(operation, document\.getElementById\('nav-sueldos'\)\)/);
});

test('driver navigation remains explicit and isolated from backoffice navigation', () => {
  const center = read('configuration-center.js');

  assert.match(center, /function configureDriverNavigation/);
  assert.match(center, /ensureDriverNode\('nav-dashboard', 'dashboard', '📊', 'Panel'\)/);
  assert.match(center, /ensureDriverNode\('nav-registro', 'registro', '📋', 'Km'\)/);
  assert.match(center, /ensureDriverNode\('nav-camion', 'camion', '🚛', 'Camión'\)/);
  assert.match(center, /ensureDriverNode\('nav-remitos', 'remitos', '🧾', 'Remitos'\)/);
  assert.doesNotMatch(center, /BACKOFFICE_ROLES[^\n]*chofer/);
});

test('configuration owns structural catalog routes without duplicate matrix modules', () => {
  const center = read('configuration-center.js');

  assert.match(center, /ensureNavNode\('nav-empresas'/);
  assert.match(center, /ensureNavNode\('nav-config-service-types'/);
  assert.match(center, /ensureNavNode\('nav-config-tariff-types'/);
  assert.match(center, /ensureNavNode\('nav-config-tariff-matrix'/);
  assert.match(center, /Prestadoras y red/);
  assert.match(center, /Catálogos/);
  assert.match(center, /Facturación/);
  assert.doesNotMatch(center, /list_company_tariff_matrix_v2/);
});

test('configuration center history reads safe audit metadata only', () => {
  const center = read('configuration-center.js');

  assert.match(center, /select\('event_id,occurred_at,actor_id,operation,entity_table,entity_id'\)/);
  assert.doesNotMatch(center, /before_data/);
  assert.doesNotMatch(center, /after_data/);
});

test('fleet operational status is separate from navigation and cannot reorder the sidenav', () => {
  const fleet = read('fleet-operational-status-v1.js');

  assert.match(fleet, /list_operator_services/);
  assert.match(fleet, /title: 'FLOTA'/);
  assert.doesNotMatch(fleet, /querySelector\('\.sidenav'\)/);
  assert.doesNotMatch(fleet, /insertBefore/);
  assert.doesNotMatch(fleet, /nav-/);
});

test('canonical navigation and fleet status are loaded checked and precached', () => {
  const config = read('config.js');
  const serviceWorker = read('sw.js');
  const pkg = read('package.json');
  const cacheVersion = Number(serviceWorker.match(/auxilios-v(\d+)/)?.[1] || 0);

  assert.match(config, /auxilios-configuration-center/);
  assert.match(config, /auxilios-fleet-operational-status-v1/);
  assert.match(serviceWorker, /'\/configuration-center\.js'/);
  assert.match(serviceWorker, /'\/fleet-operational-status-v1\.js'/);
  assert.match(pkg, /node --check configuration-center\.js/);
  assert.match(pkg, /node --check fleet-operational-status-v1\.js/);
  assert.doesNotMatch(config, /frequent-navigation/);
  assert.doesNotMatch(serviceWorker, /frequent-navigation/);
  assert.doesNotMatch(pkg, /frequent-navigation/);
  assert.ok(cacheVersion >= 162, `Expected cache version 162 or newer, received ${cacheVersion}`);
});
