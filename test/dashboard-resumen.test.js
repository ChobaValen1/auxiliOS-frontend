const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('dashboard-resumen-v1.js', 'utf8').replace(/\r\n/g, '\n');
const css = fs.readFileSync('dashboard-resumen-v1.css', 'utf8').replace(/\r\n/g, '\n');
const index = fs.readFileSync('Index.html', 'utf8').replace(/\r\n/g, '\n');
const sql = fs.readFileSync('migrations/20260927100000_dashboard_resumen_v1.sql', 'utf8').replace(/\r\n/g, '\n');

function cargarModulo() {
  const registradas = [];
  const win = {
    AuxDash: { registrarSeccion: s => registradas.push(s), setFiltro() {} },
    AuxDashCharts: { PALETA: ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666', '#777777'] }
  };
  const ctx = { window: win, document: { getElementById: () => null, addEventListener() {} }, console };
  vm.runInNewContext(js, ctx);
  return { api: win.AuxDashResumen, registradas };
}

test('se registra como la sección facturacion del shell, con sus filtros', () => {
  const { registradas } = cargarModulo();
  assert.equal(registradas.length, 1);
  assert.equal(registradas[0].id, 'facturacion');
  assert.equal(registradas[0].filtros, 'dashx-fact-filtros');
  assert.equal(typeof registradas[0].cargar, 'function');
  assert.equal(typeof registradas[0].alError, 'function');
});

test('una respuesta nula no rompe la normalización ni inventa datos', () => {
  const { api } = cargarModulo();
  const d = api.normalizar(null, null);
  assert.equal(d.hayDatos, false);
  assert.equal(d.empresas.length, 0);
  assert.equal(d.puntos.length, 0);
  assert.equal(d.porClase.length, 0);
});

test('la cobertura depende del radio elegido y la hace el navegador', () => {
  const { api } = cargarModulo();
  const d = { puntos: [[0, 0, 'a', 'b', 5], [0, 0, 'a', 'b', 25], [0, 0, 'a', 'b', null]] };
  const c20 = api.cobertura(d, 20);
  assert.equal(c20.evaluados, 2);
  assert.equal(c20.dentro, 1);
  assert.equal(c20.fuera, 1);
  assert.equal(c20.pct, 50);
  assert.equal(c20.media, 15);
  assert.equal(api.cobertura(d, 30).dentro, 2);
});

test('rendimiento y ratio no dividen por cero', () => {
  const { api } = cargarModulo();
  assert.equal(api.rendimiento({ km: 0, kmReal: 10 }), null);
  assert.equal(api.rendimiento({ km: 200, kmReal: 100 }), 50);
  assert.equal(api.ratio({ kmReal: 0, kmComp: 10 }), null);
  assert.equal(api.ratio({ kmReal: 100, kmComp: 120 }), 120);
});

test('los tipos de vehículo salen de vehicle_class, con Otros para lo que no tiene', () => {
  const { api } = cargarModulo();
  const d = api.normalizar({}, { por_clase: [{ clase: 'light', servicios: 1 }, { clase: 'otros', servicios: 1 }, { clase: 'raro', servicios: 1 }] });
  assert.deepEqual(d.porClase.map(k => k.nombre), ['Liviano', 'Otros', 'Otros']);
  assert.match(sql, /coalesce\(vehicle_class, 'otros'\)/);
});

test('los nombres de la base se escapan antes de ir al DOM', () => {
  assert.match(js, /esc\(e\.nombre\)/);
  assert.match(js, /esc\(b\.nombre\)/);
  assert.match(js, /esc\(k\.nombre\)/);
});

test('la RPC nueva sigue las convenciones del repo', () => {
  assert.match(sql, /create or replace function public\.dashboard_resumen_v1\(/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path to ''/);
  assert.match(sql, /revoke all on function public\.dashboard_resumen_v1\(date, date, uuid\[\], uuid\[\]\) from public, anon/);
  assert.match(sql, /'administracion', 'facturacion', 'supervision'/);
  assert.match(sql, /s\.is_test = false/);
  assert.match(sql, /s\.status = 'completed'/);
});

test('el período anterior del gráfico dura lo mismo y se alinea día por día', () => {
  assert.match(sql, /v_prev_desde := v_desde - v_dias/);
  assert.match(sql, /generate_series\(0, v_dias - 1\)/);
});

test('el markup trae todo lo que pinta el módulo', () => {
  ['dashx-fact-kpis', 'dashx-fact-mapa', 'rsm-mapa-stats', 'rsm-mapa-leyenda', 'rsm-radio',
   'rsm-circulos', 'rsm-lineas', 'rsm-tipos-canvas', 'rsm-tipos-lista', 'rsm-evol-canvas',
   'rsm-eficiencia', 'dashx-fact-empresas', 'dashx-titulo', 'dashx-subtitulo']
    .forEach(id => assert.ok(index.includes(`id="${id}"`), `falta #${id}`));
  assert.match(index, /dashboard-resumen-v1\.js/);
  assert.match(index, /dashboard-resumen-v1\.css/);
  assert.doesNotMatch(index, /dashboard-facturacion-v1\.js|dashboard-mapa-v1\.js/);
});

test('los interruptores del mapa son accesibles', () => {
  assert.match(index, /id="rsm-circulos" role="switch" aria-checked="true"/);
  assert.match(index, /id="rsm-lineas" role="switch" aria-checked="false"/);
  assert.match(js, /setAttribute\('aria-checked'/);
});

test('el CSS del resumen está scopeado al dashboard', () => {
  const selectores = css.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}').map(b => b.split('{').slice(-2)[0].trim())
    .filter(s => s && !s.startsWith('@'));
  selectores.forEach(s => s.split(',').forEach(sel =>
    assert.match(sel.trim(), /^#screen-dashboard\b/, `selector sin scope: ${sel.trim()}`)));
});

test('la variación se lee sin depender del color', () => {
  assert.match(js, /\(sube \? '\+' : '−'\)/);
  assert.match(js, /sin comparación/);
});
