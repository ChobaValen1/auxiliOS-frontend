const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('fleet-truck-detail-v1.js', 'utf8');
const control = fs.readFileSync('fleet-control-v1.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928250000_control_camion_docs_obligatorios_v2.sql', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');
const html = fs.readFileSync('Index.html', 'utf8');

function load() {
  const win = {};
  const doc = { getElementById: () => null, querySelector: () => null, addEventListener() {} };
  const ctx = { window: win, document: doc, setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {}, console };
  vm.runInNewContext(control, ctx);
  vm.runInNewContext(js, ctx);
  return { D: win.AuxiliosDetalleCamion._test, C: win.AuxiliosControlFlota._test };
}
const HOY = '2026-09-28';

test('documentación: los obligatorios que faltan se muestran como faltantes', () => {
  const { D } = load();
  const filas = D.docsLista([
    { internal_code: 'VTV', expiry_date: '2026-10-12', alert_days: 30, file_url: 'a.pdf' },
    { internal_code: 'SEGURO_POLIZA', expiry_date: '2026-09-01', file_url: 'b.pdf' },
    { internal_code: 'CEDULA_VERDE', file_url: null },
    { internal_code: 'PERMISO_ESPECIAL', expiry_date: '2027-05-01', file_url: 'c.pdf' },
  ], HOY);
  const por = Object.fromEntries(filas.map(f => [f.code, f]));
  assert.deepEqual([...filas.map(f => f.code)], ['VTV', 'SEGURO_POLIZA', 'HABILITACION_RUTA', 'CEDULA_VERDE', 'MATAFUEGOS', 'PERMISO_ESPECIAL']);
  assert.equal(por.VTV.txt, 'Vence en 14 días'); assert.equal(por.VTV.tono, 'alerta');
  assert.equal(por.SEGURO_POLIZA.tono, 'critico');
  assert.equal(por.HABILITACION_RUTA.txt, 'Falta cargar');
  assert.equal(por.CEDULA_VERDE.txt, 'Sin archivo');
  assert.equal(por.PERMISO_ESPECIAL.tono, '');
});

test('tarjetas de resumen: mismo lenguaje corto que la flota', () => {
  const { D, C } = load();
  C.set({ today: HOY });
  const todos = ['VTV', 'SEGURO_POLIZA', 'HABILITACION_RUTA', 'CEDULA_VERDE', 'MATAFUEGOS'].map(c => ({ internal_code: c, file_url: 'x', expiry_date: '2027-06-01' }));
  assert.equal(D.resumenDocs(todos, HOY).txt, 'Completo');
  const tres = D.resumenDocs(todos.slice(0, 3), HOY);
  assert.equal(tres.txt, '3/5'); assert.equal(tres.tono, 'alerta'); assert.equal(tres.sub, 'Falta Cédula verde, Matafuegos');
  const venc = D.resumenDocs([{ internal_code: 'VTV', file_url: 'x', expiry_date: '2026-09-01' }], HOY);
  assert.equal(venc.tono, 'critico'); assert.equal(venc.sub, 'Vencido: VTV');
  assert.equal(D.resumenService([{ name: 'Aceite', plan_estado: 'al_dia', km_restantes: 3000 }, { name: 'Frenos', plan_estado: 'al_dia', km_restantes: 9000 }]).txt, 'Aceite · en 3.000 km');
  assert.equal(D.resumenService([]).txt, 'Sin service informado');
  assert.equal(D.resumenNeumaticos({ log_id: 1 }, [{ check_date: HOY, tire_condition: 'bueno', brake_condition: 'bueno' }]).txt, 'Bien');
  assert.equal(D.resumenNeumaticos({ log_id: 1 }, [{ check_date: '2026-09-27', tire_condition: 'bueno', brake_condition: 'malo' }]).txt, 'Mal: frenos');
  const comb = D.resumenCombustible([{ fuel_date: '2026-09-28', liters: 60, total_cost: 78000 }, { fuel_date: '2026-09-20', liters: 50, total_cost: 60000 }], HOY);
  assert.equal(comb.txt, '28/09 · 60 L'); assert.equal(comb.sub, 'Este mes: 2 cargas · $ 138.000');
  assert.equal(D.resumenCombustible([], HOY).txt, 'Sin cargas');
});

test('km del mes a partir de las jornadas, sin las anuladas', () => {
  const { D } = load();
  const r = D.kmMes([{ log_date: '2026-09-28', km_recorridos: 120 }, { log_date: '2026-09-02', km_recorridos: 300 }, { log_date: '2026-09-03', km_recorridos: 50, voided_at: 'x' }, { log_date: '2026-08-30', km_recorridos: 999 }], HOY);
  assert.deepEqual(JSON.parse(JSON.stringify(r)), { km: 420, jornadas: 2 });
});

test('una pestaña por tema; tocar una tarjeta abre su pestaña', () => {
  assert.match(js, /var TABS = \[\['mantenimiento', 'Mantenimiento'\], \['documentacion', 'Documentación'\], \['neumaticos', 'Neumáticos y frenos'\], \['combustible', 'Combustible'\]\]/);
  assert.match(js, /data-ftd-tab="' \+ tab \+ '"/);
  assert.match(js, /if \(tab && st\.id\) \{ st\.tab = tab\.getAttribute\('data-ftd-tab'\); return pintar\(\); \}/);
  assert.match(js, /if \(opts\.seccion && TABS\.some/);
  assert.doesNotMatch(js, /Para resolver/);
});

test('mantenimiento, combustible y neumáticos', () => {
  const { D } = load();
  assert.equal(D.planEstado({ plan_estado: 'vencido', km_restantes: -200 }).txt, 'Vencido por 200 km');
  assert.equal(D.planEstado({ plan_estado: 'al_dia', km_restantes: 4200 }).tono, '');
  assert.equal(D.planAvance({ interval_km: 10000, km_restantes: 2500 }), 75);
  assert.deepEqual(JSON.parse(JSON.stringify(D.combustibleMes([{ fuel_date: '2026-09-02', liters: 50, total_cost: 60000 }, { fuel_date: '2026-08-30', liters: 40, total_cost: 50000 }], HOY))), { cargas: 1, litros: 50, total: 60000 });
  assert.equal(D.gastoMantenimiento([{ performed_at: '2026-08-10', cost: 100 }, { performed_at: '2025-01-10', cost: 999 }], HOY), 100);
  assert.equal(D.neumaticosEstado({ log_id: 1 }, { check_date: HOY, tire_condition: 'malo', brake_condition: 'bueno' }, HOY).tono, 'critico');
});

test('flota: la columna Documentación detecta los obligatorios sin cargar', () => {
  const { C } = load();
  const d = C.documentos({ docs_sin_cargar: ['VTV', 'MATAFUEGOS'] });
  assert.equal(d.txt, '3/5'); assert.equal(d.tono, 'alerta'); assert.equal(d.sub, 'Falta VTV, Matafuegos');
  assert.equal(C.documentos({ docs_vencidos: 1, docs_sin_cargar: ['VTV'] }).tono, 'critico');
  assert.match(sql, /'docs_sin_cargar', coalesce\(dr\.sin_cargar, '\[\]'::jsonb\)/);
  assert.match(sql, /array\['VTV', 'SEGURO_POLIZA', 'HABILITACION_RUTA', 'CEDULA_VERDE', 'MATAFUEGOS'\]/);
});

test('detalle en una sola pantalla, acciones sólo para Administración, módulo cargado', () => {
  assert.match(sigma, /async function _abrirCamionDetalleAdmin\(truckId\) \{\n  if \(window\.AuxiliosDetalleCamion\) return window\.AuxiliosDetalleCamion\.abrir\(truckId\);/);
  assert.match(js, /function admin\(\) \{ return rol\(\) === 'administracion'; \}/);
  assert.match(js, /return admin\(\) \? '<button/);
  assert.match(config, /\/fleet-truck-detail-v1\.js/);
  assert.match(config, /\/fleet-truck-detail-v1\.css/);
  assert.match(sw, /\/fleet-truck-detail-v1\.js/);
});

test('sin versiones anteriores del módulo: ni grilla de tarjetas, ni sub-pantallas de admin, ni decorador', () => {
  assert.equal(fs.existsSync('fleet-operational-status-v1.js'), false);
  assert.doesNotMatch(config + sw + fs.readFileSync('package.json', 'utf8'), /fleet-operational-status/);
  assert.doesNotMatch(sigma, /function _pintarFlotaAdmin|_flotaFiltro|camion-flota-card|function renderPlanes|function renderHistorialServices/);
  assert.doesNotMatch(html, /camion-sub-planes|camion-sub-historial|planes-lista|tbody-services/);
  assert.doesNotMatch(fs.readFileSync('sigma.css', 'utf8'), /\.camion-flota-|\.flota-pill/);
  assert.match(sigma, /async function _renderCamionFlotaAdmin\(\) \{\n  if \(window\.AuxiliosControlFlota\) return window\.AuxiliosControlFlota\.renderFlota\(\);/);
  assert.match(sigma, /async function _refrescarPlanesCamion\(kmOverride = null\)/);
  assert.doesNotMatch(control, /global\._renderCamionFlotaAdmin = /);
});
