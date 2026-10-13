'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const read = f => fs.readFileSync(f, 'utf8');

test('Configuración › Servicios: reglas separadas para operador y chofer', () => {
  const cfg = read('service-module-configuration.js'), flow = read('remito-mobile-flow-v3.js');
  const mig = read('migrations/20261013040000_driver_field_modes_v1.sql');
  assert.match(cfg, /Operador · al cargar el servicio/);
  assert.match(cfg, /Chofer · en el remito/);
  assert.match(cfg, /cambiarModoCampoChofer:driverFieldMode/);
  assert.match(cfg, /fieldModes\.driver=\{customer_document:/);                 // sin regla propia hereda la del operador
  assert.match(cfg, /customer_phone:\['required','optional'\]\.includes\(xd\.customer_phone\)\?xd\.customer_phone:'required'/);
  assert.match(flow, /config\?\.field_modes\?\.driver\|\|config\?\.field_modes/);
  assert.match(mig, /v_all->'driver'->>'customer_document'/);
  assert.match(mig, /when v_driver->>'customer_phone'='optional' then 'optional' else 'required'/);
});

test('Grilla y Documentación: el menú interno no borra sus accesos', () => {
  const center = read('configuration-center.js'), sigma = read('sigma.js');
  assert.match(center, /group\?\.querySelectorAll\('\.nav-item\[id\]'\)\.forEach/);
  assert.match(sigma, /document\.getElementById\('nav-' \+ name\)\?\.classList\.add\('active'\)/);
});

test('Camiones: lista sin Timeline, modal nuevo y modal de baja', () => {
  const sigma = read('sigma.js'), html = read('Index.html');
  const lista = sigma.slice(sigma.indexOf('async function cargarTablaAdminFlota'), sigma.indexOf('let _bajaVehiculo'));
  assert.doesNotMatch(lista, /verTimelineCamion/);
  assert.match(html, /id="modal-baja-vehiculo"/);
  assert.match(html, /data-nv-tipo="pesado"/);
  assert.match(sigma, /async function confirmarEstadoVehiculo\(\)/);
  assert.match(sigma, /Tiene una jornada abierta/);
  assert.doesNotMatch(sigma, /confirm\('¿Dar de baja esta unidad\?/);
});

test('Planes de mantenimiento: el catálogo vive en Camión › Planes', () => {
  const plans = read('fleet-type-plans-v1.js'), center = read('configuration-center.js');
  assert.match(plans, /data-ftp-vista="catalogo"/);
  assert.match(plans, /global\.openAdminPlanModal\(\)/);
  assert.match(plans, /global\.abrirEditarPlan\(/);
  assert.doesNotMatch(center, /tab-planes/);
  assert.match(center, /SOS del chofer/);
});

test('Eficiencia operativa: km de la flota según el odómetro', () => {
  const js = read('dashboard-resumen-v1.js'), mig = read('migrations/20261013050000_dashboard_flota_km_v1.sql');
  assert.match(js, /var RPC_FLOTA = 'dashboard_flota_km_v1'/);
  assert.match(js, /rpc\(RPC_FLOTA, \{ p_desde: base\.p_desde, p_hasta: base\.p_hasta \}\)\.catch\(/);   // si falla, el resumen sigue
  assert.match(js, /barra\('Km flota \(odómetro\)', kmFlota, 'is-flota'\)/);
  assert.match(js, /dato\('Con cliente arriba'/);
  assert.match(js, /dato\('Km muertos'/);
  assert.match(mig, /l\.status = 'closed'\s+and not coalesce\(t\.is_test, false\)/);
  assert.match(mig, /not in \('administracion', 'facturacion', 'supervision'\)/);
});
