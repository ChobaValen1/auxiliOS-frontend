'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('configuration center remains the single backoffice navigation owner', () => {
  const center = read('configuration-center.js');
  const config = read('config.js');

  assert.match(center, /BACKOFFICE_ROLES = new Set\(\['administracion', 'supervision', 'facturacion'\]\)/);
  assert.match(center, /function configureBackofficeNavigation/);
  assert.match(center, /orderTop\(\[dashboard, canUseManagementTools\(\) \? operations : null, jornadas, camion, remitos, configuration, tariffs, history\]\)/);
  assert.match(center, /document\.getElementById\('nav-registro'\)/);
  assert.match(center, /registro\.remove\(\)/);
  assert.doesNotMatch(config, /frequent-navigation/);
});

test('daily administration modules stay in the main sidenav', () => {
  const center = read('configuration-center.js');
  const css = read('configuration-center.css');

  assert.match(center, /ensureNavNode\('nav-jornadas-admin', 'jornadas-admin', '🗓️', 'Jornadas', false\)/);
  assert.match(center, /ensureNavNode\('nav-camion', 'camion', '🚛', 'Camión', false\)/);
  assert.match(center, /ensureNavNode\('nav-remitos', 'remitos', '🧾', 'Remitos', false\)/);
  assert.doesNotMatch(center, /moveTo\([^\n]*document\.getElementById\('nav-camion'\)/);
  assert.doesNotMatch(center, /moveTo\([^\n]*document\.getElementById\('nav-jornadas-admin'\)/);
  assert.doesNotMatch(center, /moveTo\([^\n]*document\.getElementById\('nav-remitos'\)/);
  assert.doesNotMatch(css, /sidenav > #nav-camion,/);
  assert.doesNotMatch(css, /sidenav > #nav-jornadas-admin,/);
  assert.doesNotMatch(css, /sidenav > #nav-remitos,/);
});

test('configuration restores existing personnel vehicle and maintenance tools without duplicating their CRUD', () => {
  const center = read('configuration-center.js');

  for (const tab of ['tab-usuarios', 'tab-flota', 'tab-planes', 'tab-mantenimiento', 'tab-emergencias', 'tab-mi-cuenta']) {
    assert.ok(center.includes(tab), `${tab} must remain reachable from Configuration`);
  }
  assert.match(center, /openSettingsHub/);
  assert.match(center, /switchConfigTab/);
  assert.match(center, /Personal \/ Choferes/);
  assert.match(center, /Camiones/);
  assert.match(center, /Planes de mantenimiento/);
  assert.match(center, /moveTo\(administration, document\.getElementById\('nav-documentos'\)\)/);
  assert.match(center, /moveTo\(administration, document\.getElementById\('nav-grilla'\)\)/);
  assert.match(center, /moveTo\(administration, document\.getElementById\('nav-sueldos'\)\)/);
  assert.doesNotMatch(center, /function openNuevoUsuarioModal/);
  assert.doesNotMatch(center, /function openNuevoVehiculoModal/);
  assert.doesNotMatch(center, /function openAdminPlanModal/);
});

test('Peajes belongs to Configuration and toll module has no navigation ownership', () => {
  const center = read('configuration-center.js');
  const tolls = read('toll-management.js');
  const config = read('config.js');

  assert.match(center, /CONFIG_CHILD_ROUTES = new Set\([^\n]*'peajes'/);
  assert.match(center, /ensureNavNode\('nav-peajes', 'peajes', '🛣️', 'Peajes y Adicionales'\)/);
  assert.match(center, /moveTo\(catalogs, document\.getElementById\('nav-peajes'\)\)/);
  assert.match(center, /irModuloConfiguracion\('peajes'\)/);
  assert.match(config, /loadAuxiliosModule\('auxilios-toll-management', '\/toll-management\.js'\)/);
  assert.doesNotMatch(tolls, /nav-peajes/);
  assert.doesNotMatch(tolls, /querySelector\('\.sidenav/);
  assert.doesNotMatch(tolls, /insertAdjacentHTML\('beforebegin'/);
  assert.match(tolls, /if\(name==='peajes'\)load\(\)/);
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

test('history exposes the four business questions and extracts only safe audit fields', () => {
  const center = read('configuration-center.js');

  assert.match(center, /before_status:before_data->>status/);
  assert.match(center, /after_status:after_data->>status/);
  assert.match(center, /before_voided_at:before_data->>voided_at/);
  assert.match(center, /after_voided_at:after_data->>voided_at/);
  assert.doesNotMatch(center, /event_id,occurred_at,actor_id,operation,entity_table,entity_id,before_data,after_data/);
  assert.match(center, /Qué hizo/);
  assert.match(center, /Sobre qué lo hizo/);
  assert.match(center, /Quién lo hizo/);
  assert.match(center, /Cuándo lo hizo/);
  assert.match(center, /CREACIÓN/);
  assert.match(center, /MODIFICACIÓN/);
  assert.match(center, /ANULACIÓN/);
  assert.match(center, /ELIMINACIÓN/);
  assert.match(center, /from\('users'\)\.select\('user_id,full_name,email'\)/);
  assert.doesNotMatch(center, /actor_id\}\<\/td\>/);
});

test('fleet operational status decorates Camión without renaming or reordering it', () => {
  const fleet = read('fleet-operational-status-v1.js');

  assert.match(fleet, /list_operator_services/);
  assert.doesNotMatch(fleet, /title: 'FLOTA'/);
  assert.doesNotMatch(fleet, /SCREENS\.camion\s*=/);
  assert.doesNotMatch(fleet, /querySelector\('\.sidenav'\)/);
  assert.doesNotMatch(fleet, /insertBefore/);
  assert.doesNotMatch(fleet, /nav-/);
});

test('canonical navigation assets are loaded checked and precached', () => {
  const config = read('config.js');
  const serviceWorker = read('sw.js');
  const pkg = read('package.json');
  const cacheVersion = Number(serviceWorker.match(/auxilios-v(\d+)/)?.[1] || 0);

  assert.match(config, /auxilios-configuration-center/);
  assert.match(config, /auxilios-toll-management/);
  assert.match(config, /auxilios-fleet-operational-status-v1/);
  assert.match(serviceWorker, /'\/configuration-center\.js'/);
  assert.match(serviceWorker, /'\/toll-management\.js'/);
  assert.match(serviceWorker, /'\/fleet-operational-status-v1\.js'/);
  assert.match(pkg, /node --check configuration-center\.js/);
  assert.match(pkg, /node --check toll-management\.js/);
  assert.match(pkg, /node --check fleet-operational-status-v1\.js/);
  assert.doesNotMatch(config, /frequent-navigation/);
  assert.doesNotMatch(serviceWorker, /frequent-navigation/);
  assert.doesNotMatch(pkg, /frequent-navigation/);
  assert.ok(cacheVersion >= 163, `Expected cache version 163 or newer, received ${cacheVersion}`);
});