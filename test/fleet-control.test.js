const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('fleet-control-v1.js', 'utf8');
const css = fs.readFileSync('fleet-control-v1.css', 'utf8');
const sql = fs.readFileSync('migrations/20260928240000_control_camion_flota_v1.sql', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

function load() {
  const win = {};
  const doc = { getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { classList: { add() {}, remove() {} } } };
  vm.runInNewContext(js, { window: win, document: doc, setInterval: () => 0, clearInterval() {}, console });
  return win.AuxiliosControlFlota._test;
}

test('estado del móvil: taller, en servicio, disponible, sin jornada, inactivo', () => {
  const T = load();
  assert.equal(T.estado({ status: 'inactive' }).key, 'inactivo');
  assert.equal(T.estado({ status: 'active', in_workshop: true, log_id: 1 }).key, 'taller');
  assert.equal(T.estado({ status: 'active', service_number: 'S-1', log_id: 1 }).key, 'servicio');
  assert.equal(T.estado({ status: 'active', log_id: 1 }).label, 'Disponible');
  assert.equal(T.estado({ status: 'active' }).key, 'sin_jornada');
});

test('neumáticos: malo es crítico, en jornada sin control de hoy es alerta', () => {
  const T = load();
  T.set({ today: '2026-09-28' });
  assert.equal(T.neumaticos({ tire_date: '2026-09-28', tire_condition: 'malo', brake_condition: 'bueno' }).tono, 'critico');
  const falta = T.neumaticos({ log_id: 1, tire_date: '2026-09-26', tire_condition: 'bueno', brake_condition: 'bueno' });
  assert.equal(falta.tono, 'alerta');
  assert.match(falta.sub, /Falta el control de hoy/);
  assert.equal(T.neumaticos({ log_id: 1, tire_date: '2026-09-28', tire_condition: 'bueno', brake_condition: 'bueno' }).tono, '');
});

test('service y documentación: color sólo si vence o está por vencer', () => {
  const T = load();
  T.set({ planes: { 1: [{ name: 'Aceite', plan_estado: 'vencido', km_restantes: -200 }], 2: [{ name: 'Aceite', plan_estado: 'proximo', km_restantes: 800 }], 3: [{ name: 'Aceite', plan_estado: 'ok', km_restantes: 9000 }] } });
  assert.equal(T.service({ truck_id: 1 }).tono, 'critico');
  assert.equal(T.service({ truck_id: 2 }).tono, 'alerta');
  assert.equal(T.service({ truck_id: 3 }).tono, '');
  assert.equal(T.documentos({ docs_vencidos: 2 }).tono, 'critico');
  assert.equal(T.documentos({ docs_proximos: 1 }).tono, 'alerta');
  assert.equal(T.documentos({}).txt, 'Al día');
  assert.equal(T.alertas({ truck_id: 1, status: 'active', in_workshop: true, docs_vencidos: 1 }), 3);
});

test('una sola consulta para la flota, sólo para Administración y Supervisión', () => {
  assert.match(sql, /create or replace function public\.get_fleet_control_v1\(\)/);
  assert.match(sql, /'administracion', ?'supervision'/);
  assert.match(js, /rpc\('get_fleet_control_v1'/);
});

test('un solo título y el módulo cargado', () => {
  assert.match(css, /#screen-camion #camion-main-view > \.sec-header \.sec-title \{ display: none; \}/);
  assert.match(config, /\/fleet-control-v1\.css/);
  assert.match(config, /\/fleet-control-v1\.js/);
  assert.match(sw, /\/fleet-control-v1\.js/);
});
