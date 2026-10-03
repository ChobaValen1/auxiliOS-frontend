const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('dashboard-tendencia-v1.js', 'utf8').replace(/\r\n/g, '\n');
const index = fs.readFileSync('Index.html', 'utf8').replace(/\r\n/g, '\n');
const sigma = fs.readFileSync('sigma.js', 'utf8').replace(/\r\n/g, '\n');
const sql = fs.readFileSync('migrations/20260927120000_dashboard_tendencia_v1.sql', 'utf8').replace(/\r\n/g, '\n');

function cargar() {
  const registradas = [];
  const win = { AuxDash: { registrarSeccion: s => registradas.push(s) }, AuxDashCharts: { PALETA: ['#1', '#2', '#3', '#4', '#5', '#6', '#7'] } };
  vm.runInNewContext(js, { window: win, document: { getElementById: () => null, addEventListener() {}, querySelectorAll: () => [] }, console });
  return { api: win.AuxDashTendencia, registradas };
}

test('se registra como sección propia y comparte la barra de filtros de Resumen', () => {
  const { registradas } = cargar();
  assert.equal(registradas[0].id, 'tendencia');
  assert.equal(registradas[0].filtros, 'dashx-fact-filtros');
});

test('la pestaña va después de Resumen y la evolución de Resumen lleva a Tendencia', () => {
  const tabs = index.match(/<div class="filter-tabs dashx-tabs" id="dashx-tabs">([\s\S]*?)<\/div>\s*<\/div>/)[1];
  const orden = [...tabs.matchAll(/data-sec="([a-z]+)"/g)].map(m => m[1]);
  assert.equal(orden.join(','), 'facturacion,tendencia,operaciones,flota');
  assert.match(index, /id="rsm-evol-card"[^>]*onclick="dashxIrATendencia\(\)"/);
  assert.match(sigma, /function dashxIrATendencia\(\)/);
  assert.match(sigma, /tendencia: \['Tendencia',/);
});

test('las semanas van de lunes a domingo y se recortan al período', () => {
  const { api } = cargar();
  // 1/9/2026 es martes: primera semana 1–6 (mar a dom), última 28–30.
  const d = { desde: '2026-09-01' };
  const s = api.semanas(d, 30);
  assert.equal(JSON.stringify(s[0]), '[0,5]');
  assert.equal(JSON.stringify(s[s.length - 1]), '[27,29]');
  const unos = Array(30).fill(1);
  const porSemana = api.escalar(d, unos, 30, 'semana');
  assert.equal(porSemana.reduce((a, b) => a + b, 0), 30, 'agrupar no pierde ni duplica días');
});

test('más de siete prestadoras: la cola se suma en Otras, en gris', () => {
  const { api } = cargar();
  const emp = Array.from({ length: 9 }, (_, i) => ({ id: 'e' + i, nombre: 'E' + i, facturado: [i], servicios: [1], km_reales: [0] }));
  const d = api.normalizar({ por_empresa: emp }, {});
  assert.equal(d.empresas.length, 8);
  assert.equal(d.empresas[7].nombre, 'Otras');
  assert.equal(d.empresas[7].facturado[0], 7 + 8);
  assert.equal(d.empresas[7].servicios[0], 2);
});

test('una respuesta nula no rompe y la comparación no divide por cero', () => {
  const { api } = cargar();
  const d = api.normalizar(null, null);
  assert.equal(d.empresas.length, 0);
  assert.equal(d.comparacion.ticket[0], null);
  assert.equal(d.comparacion.ticket[1], null);
});

test('los nombres de prestadora se escapan antes de ir al DOM', () => {
  assert.match(js, /esc\(e\.nombre\)/);
});

test('la RPC sigue las convenciones y el mismo universo que Facturación', () => {
  assert.match(sql, /create or replace function public\.dashboard_tendencia_v1\(/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path to ''/);
  assert.match(sql, /revoke all on function public\.dashboard_tendencia_v1\(date, date, uuid\[\], uuid\[\]\) from public, anon/);
  assert.match(sql, /'administracion', 'facturacion', 'supervision'/);
  assert.match(sql, /s\.is_test = false/);
  assert.match(sql, /s\.status = 'completed'/);
  assert.match(sql, /v_prev_desde := v_desde - v_dias/);
});

test('los selectores de métrica y escala indican cuál está elegido', () => {
  ['facturado', 'servicios', 'km_reales'].forEach(m =>
    assert.match(index, new RegExp(`data-tnd-metrica="${m}" aria-pressed=`)));
  ['dia', 'semana'].forEach(m =>
    assert.match(index, new RegExp(`data-tnd-escala="${m}" aria-pressed=`)));
  assert.match(js, /setAttribute\('aria-pressed'/);
});
