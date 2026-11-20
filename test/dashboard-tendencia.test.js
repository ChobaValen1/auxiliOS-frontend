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
  assert.equal(registradas[0].periodo, false);
});

test('la pestaña va después de Resumen y la evolución de Resumen lleva a Tendencia', () => {
  const tabs = index.match(/<div class="filter-tabs dashx-tabs" id="dashx-tabs">([\s\S]*?)<\/div>\s*<\/div>/)[1];
  const orden = [...tabs.matchAll(/data-sec="([a-z]+)"/g)].map(m => m[1]);
  assert.equal(orden.join(','), 'inicio,facturacion,tendencia,operaciones,flota');   // Inicio de administración primero (2bb685d)
  assert.match(index, /id="rsm-evol-card">[\s\S]*?<button type="button" class="rsm-link" onclick="dashxIrATendencia\(\)">/);
  assert.match(sigma, /function dashxIrATendencia\(\)/);
  assert.match(sigma, /tendencia: \['Tendencia',/);
});

const HOY = '2026-11-19';
function serieFake() {
  // 1/12/2024 a 19/11/2026; 2º año 20 % más alto, 10 servicios por día.
  const desde = '2024-12-01';
  const n = (Date.UTC(2026, 10, 19) - Date.UTC(2024, 11, 1)) / 864e5 + 1;
  const f = [], s = [];
  for (let i = 0; i < n; i++) { f.push(i >= 365 ? 1200 : 1000); s.push(10); }
  return { desde, actual: { facturado: f, servicios: s }, por_empresa: [
    { id: 'a', nombre: 'A', facturado: f.map(x => x * 0.7) }, { id: 'b', nombre: 'B', facturado: f.map(x => x * 0.3) }] };
}

test('arma 24 meses y marca el mes en curso', () => {
  const { api } = cargar();
  const d = api.armar(serieFake(), HOY);
  assert.equal(d.meses.length, 24);
  assert.equal(d.meses[0].c.et, 'dic 24');
  assert.equal(d.enCurso.c.nombre, 'noviembre 2026');
  assert.equal(d.cerrados, 11);
  assert.equal(d.rango12, 'dic 2025 a nov 2026');
});

test('los 12 meses se comparan contra las mismas fechas del año anterior', () => {
  const { api } = cargar();
  const d = api.armar(serieFake(), HOY);
  // 1/12/2025 a 19/11/2026 = 354 días a 1200; 1/12/2024 a 19/11/2025 = 354 días a 1000.
  assert.equal(d.total.fact, 354 * 1200);
  assert.equal(d.total.antFact, 354 * 1000);
  assert.equal(d.total.serv, 3540);
  assert.equal(Math.round(d.total.ticket), 120);
  assert.equal(Math.round(d.total.antTicket), 100);
});

test('el mes en curso se compara contra los mismos días de noviembre del año anterior', () => {
  const { api } = cargar();
  const d = api.armar(serieFake(), HOY);
  const nov = d.enCurso;
  assert.equal(nov.fact, 19 * 1200);
  assert.equal(nov.antFact, 19 * 1000);
  assert.equal(api.valorMes(nov, 'ticket', false), 120);
});

test('el promedio mensual sólo cuenta meses cerrados y el mejor mes también', () => {
  const { api } = cargar();
  const d = api.armar(serieFake(), HOY);
  assert.ok(d.mejor && !d.mejor.c.curso);
  assert.equal(d.mejor.c.nombre, 'diciembre 2025');   // 31 días: el mes cerrado más largo
  assert.ok(d.total.promedio > 0 && d.total.antPromedio > 0);
});

test('la tabla de prestadoras ordena por los últimos 3 meses y agrupa la cola en Otras', () => {
  const { api } = cargar();
  const base = serieFake();
  const d = api.armar(base, HOY);
  assert.equal(d.empresas[0].nombre, 'A');
  assert.equal(d.empresas[0].curva.length, 11);   // sin el mes en curso
  assert.ok(d.empresas[0].a > d.empresas[1].a);
  const muchas = Object.assign({}, base, { por_empresa: Array.from({ length: 12 }, (_, i) => ({ id: 'e' + i, nombre: 'E' + i, facturado: base.actual.facturado.map(() => 100 + i) })) });
  const d2 = api.armar(muchas, HOY);
  assert.equal(d2.empresas.length, 8);
  assert.equal(d2.empresas[7].nombre, 'Otras 5');
});

test('una respuesta nula o sin serie no rompe', () => {
  const { api } = cargar();
  assert.equal(api.armar(null, HOY), null);
  assert.equal(api.armar({ desde: '2026-01-01', actual: {} }, HOY), null);
});

test('el 29 de febrero cae en el 28 del año anterior', () => {
  const { api } = cargar();
  assert.equal(api.menosAnio('2028-02-29'), '2027-02-28');
  assert.equal(api.menosAnio('2026-11-19'), '2025-11-19');
});

test('Tendencia tiene rango propio de 24 meses y no usa el período de arriba', () => {
  assert.match(js, /periodo: false/);
  assert.match(js, /primeroDeMesAtras\(hoy, 23\)/);
  assert.doesNotMatch(js, /f\.desde|f\.hasta/);
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
  ['facturado', 'servicios', 'ticket'].forEach(m =>
    assert.match(index, new RegExp(`data-tnd-metrica="${m}" aria-pressed=`)));
  ['6m', '1a', 'todo'].forEach(m =>
    assert.match(index, new RegExp(`data-tnd-rango="${m}" aria-pressed=`)));
  assert.match(js, /setAttribute\('aria-pressed'/);
});
