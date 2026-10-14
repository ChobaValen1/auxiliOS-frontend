const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const navigation = fs.readFileSync('configuration-center.js', 'utf8');

test('Camión remains available to management in the canonical daily navigation', () => {
  assert.match(navigation, /MANAGEMENT_ROLES = new Set\(\['administracion', 'supervision'\]\)/);
  assert.match(navigation, /ensureNavNode\('nav-camion', 'camion', '[^']*', 'Camión', false\)/);
  assert.match(navigation, /orderTop\(\[dashboard, canUseManagementTools\(\) \? operations : null, jornadas, camion, remitos, payroll, configuration, history\]\)/);
});

test('Control del camión no renombra la pantalla canónica Camión', () => {
  const control = fs.readFileSync('fleet-control-v1.js', 'utf8');
  assert.doesNotMatch(control, /title: 'FLOTA'/);
  assert.doesNotMatch(control, /SCREENS\.camion\s*=/);
  assert.doesNotMatch(control, /sidenav|nav-dashboard|nav-jornadas-admin|MutationObserver/);
});
