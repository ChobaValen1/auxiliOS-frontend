const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const js = fs.readFileSync('fleet-truck-detail-v1.js', 'utf8');
const control = fs.readFileSync('fleet-control-v1.js', 'utf8');
const sql = fs.readFileSync('migrations/20260928250000_control_camion_docs_obligatorios_v2.sql', 'utf8');
const config = fs.readFileSync('config.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

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

test('para resolver: lo crítico primero y nada si está todo en orden', () => {
  const { D } = load();
  const docs = ['VTV', 'SEGURO_POLIZA', 'HABILITACION_RUTA', 'CEDULA_VERDE', 'MATAFUEGOS'].map(c => ({ internal_code: c, file_url: 'x', expiry_date: '2027-06-01' }));
  assert.equal(D.pendientes({ t: { log_id: 1 }, planes: [{ name: 'Aceite', plan_estado: 'al_dia', km_restantes: 5000 }], docs, tires: [{ check_date: HOY, tire_condition: 'bueno', brake_condition: 'bueno' }], today: HOY }).length, 0);
  const p = D.pendientes({ t: { log_id: 1 }, planes: [{ name: 'Aceite', plan_estado: 'proximo', km_restantes: 600 }, { name: 'Frenos', plan_estado: 'vencido', km_restantes: -300 }], docs: [], tires: [{ check_date: '2026-09-27', tire_condition: 'bueno', brake_condition: 'bueno' }], today: HOY });
  assert.equal(p[0].tono, 'critico');
  assert.match(p.map(x => x.txt).join('|'), /Service Aceite: faltan 600 km/);
  assert.match(p.map(x => x.txt).join('|'), /VTV: falta cargar/);
  assert.match(p.map(x => x.txt).join('|'), /falta el control de hoy/);
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
  assert.match(js, /envolver\('_abrirCamionDetalleAdmin'/);
  assert.match(js, /function admin\(\) \{ return rol\(\) === 'administracion'; \}/);
  assert.match(js, /return admin\(\) \? '<button/);
  assert.match(config, /\/fleet-truck-detail-v1\.js/);
  assert.match(config, /\/fleet-truck-detail-v1\.css/);
  assert.match(sw, /\/fleet-truck-detail-v1\.js/);
});
