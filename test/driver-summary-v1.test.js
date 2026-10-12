const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const src = read('driver-summary-v1.js');
const css = read('driver-summary-ax-v1.css');
const sigma = read('sigma.js');
const index = read('Index.html');
const sw = read('sw.js');
const sql = read('migrations/20261013000000_driver_month_summary_v1.sql');

function load() {
  const ctx = { window: {}, document: { getElementById: () => null, querySelector: () => null }, Intl, console };
  vm.runInNewContext(src, ctx);
  return ctx.window.AuxiliosDriverSummary._test;
}
const DATA = {
  mes: { servicios: 31, jornadas: 10, km: 1322, horas_motor: 0, cobros: { cash: 347600, transfer: 114000, card: 39000, other: 0, total: 500600 }, combustible: { litros: 0, costo: 0 }, por_dia: [{ fecha: '2026-10-05', km: 130, servicios: 3 }] },
  anterior: { servicios: 28, jornadas: 11, km: 1540, horas_motor: 0, cobros: { total: 612000 } },
  efectivo: { cobrado: 347600, gastos: 72000, a_rendir: 275600, rendido: 180000, pendiente: 95600 },
};

test('Mi plata: cobrado por medio de pago y lo que falta rendir', () => {
  const t = load(); t.S.etiquetaAnterior = 'septiembre';
  const html = t.plataHTML(DATA);
  assert.match(html, /Cobrado a clientes<\/small><b>\$500\.600<\/b>/);
  for (const m of ['Efectivo', 'Transferencia', 'Tarjeta']) assert.match(html, new RegExp(`<small>${m}</small>`));
  assert.doesNotMatch(html, /<small>Otro<\/small>/);
  assert.match(html, /<b>Por rendir<\/b><strong>\$95\.600<\/strong>/);
  assert.match(html, /aria-valuenow="65"/);
});

test('Mi mes: comparación con el mes anterior y horas de motor sólo si hay', () => {
  const t = load(); t.S.etiquetaAnterior = 'septiembre';
  assert.equal(t.delta(31, 28, 'septiembre').includes('+11% vs septiembre'), true);
  assert.equal(t.delta(5, 0, 'septiembre').includes('sin datos en septiembre'), true);
  assert.equal(t.delta(0, 0, 'septiembre'), '');
  const html = t.mesHTML(DATA);
  assert.match(html, /data-n="3"/);
  assert.doesNotMatch(html, /Horas de motor/);
});

test('Actividad por día: una barra por día del mes, sin librería de gráficos', () => {
  const t = load();
  const html = t.actividadHTML(DATA, '2026-10');
  assert.equal((html.match(/data-drs-dia="2026-10-\d\d"/g) || []).length, 31);
  assert.match(html, /aria-label="Día 5: 3 servicios, 130 km"/);
  assert.match(html, /Tocá un día para ver el detalle/);
});

test('El Panel del chofer usa el resumen nuevo y oculta las tarjetas viejas', () => {
  assert.match(sigma, /if \(window\.AuxiliosDriverSummary\?\.render\) \{\n    return window\.AuxiliosDriverSummary\.render\(\{ driverId: targetUserId, mes: _rendMes, esChofer, isCurrent: \(\) => request === _rendRequest \}\);/);
  assert.match(src, /_db\.rpc\('get_driver_month_summary_v1', \{ p_period: period, p_driver: driverId \}\)/);
  assert.match(src, /obLecturaConCache\(`drs_\$\{driverId\}_\$\{period\}_v1`, online\)/);
  assert.match(css, /#dash-view-rendimiento\.drs-on #dash-rend-fin,/);
  assert.match(index, /<script src="driver-summary-v1\.js\?v=/);
  assert.match(sw, /'\/driver-summary-ax-v1\.css','\/driver-summary-v1\.js'/);
});

test('la base cuenta el efectivo igual que Sueldos y cada chofer ve sólo lo suyo', () => {
  assert.match(sql, /v_cash := app_private\.monthly_cash_source\(v_driver, p_period\);/);
  assert.match(sql, /if v_driver <> auth\.uid\(\) and v_role not in \('administracion','supervision'\) then raise exception 'Sin permiso';/);
  assert.match(sql, /select coalesce\(nullif\(t\.customer_payment_method,''\),'other'\), t\.total_amount/);
  assert.match(sql, /revoke all on function app_private\.driver_month_ops_v1\(uuid, date\) from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /\b(insert|update|delete)\s+(into\s+)?public\./i);
});

test('Hoy: jornada abierta con Finalizar, o Iniciar jornada; y los servicios asignados', () => {
  const ctx = { window: { AuxiliosPhase3: { queue: [{ status: 'assigned', service_order_number: 'QA-1', company_name: 'QA', origin: 'A', destination: 'B' }, { status: 'completed' }] } }, document: { getElementById: () => null, querySelector: () => null }, Intl, console };
  vm.runInNewContext(src, ctx);
  const t = ctx.window.AuxiliosDriverSummary._test;
  t.S.esChofer = true;
  const mes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
  const sin = t.hoyHTML(DATA, mes);
  assert.match(sin, /Sin jornada abierta/);
  assert.match(sin, /onclick="abrirModalNuevaJornada\(\)"/);
  assert.match(sin, /1 servicio asignado/);
  assert.match(sin, /QA-1 · QA/);
  // Otro mes, o quien no es chofer: no hay "Hoy".
  assert.equal(t.hoyHTML(DATA, '2020-01'), '');
  t.S.esChofer = false;
  assert.equal(t.hoyHTML(DATA, mes), '');
  assert.match(src, /onclick="mostrarDialogoTaller\(\)">\$\{ico\('square'\)\}Finalizar/);
});

test('Tenés pendiente suma el efectivo por rendir y abre el detalle por jornada', () => {
  const t = load();
  const d = { ...DATA, efectivo: { ...DATA.efectivo, dias: [{ fecha: '2026-10-08', cobrado: 95600, gastos: 0, rendido: 0, pendiente: 95600 }, { fecha: '2026-10-03', pendiente: 0 }] } };
  const html = t.pendienteHTML([{ title: 'Licencia por vencer', detail: 'x', cta: 'Ver', target: 'documentos' }], d);
  assert.match(html, /Tenés pendiente/);
  assert.match(html, /Efectivo por rendir · \$95\.600/);
  assert.match(html, /1 jornada con efectivo sin rendir/);
  assert.match(html, /data-drs-accion="rendir"/);
  assert.match(html, /Licencia por vencer/);
  assert.equal(t.pendienteHTML([], { efectivo: { pendiente: 0 } }), '');
  assert.match(src, /openModal\('modal-desglose-pago'\)/);
});

test('Últimos servicios: estado del remito y acceso a todos', () => {
  const t = load();
  const html = t.ultimosHTML({ ultimos: [{ patente: 'AF234LO', origen: 'A', destino: 'B', status: 'firmado', creado: '2026-10-12T17:09:22Z', km: 86 }, { patente: 'AB1', status: 'pendiente' }] });
  assert.match(html, /<b>AF234LO<\/b><small>A → B<\/small>/);
  assert.match(html, /drs-pill ok">Firmado/);
  assert.match(html, /drs-pill warn">Sin firmar/);
  assert.match(html, /Ver todos los remitos/);
  assert.match(t.ultimosHTML({ ultimos: [] }), /Todavía no hay servicios este mes/);
});

test('una cuenta suspendida no entra, ni con sesión guardada ni con contraseña', () => {
  const supa = read('supabase.js');
  assert.match(supa, /const _MSG_CUENTA_SUSPENDIDA = 'Esta cuenta está suspendida\. Consultá con Administración\.';/);
  assert.match(supa, /function _cuentaSuspendida\(\) \{ return !!PERFIL_USUARIO && PERFIL_USUARIO\.is_active === false; \}/);
  assert.equal((supa.match(/if \(_cuentaSuspendida\(\)\) \{/g) || []).length, 3);
  assert.match(supa, /throw Object\.assign\(new Error\(_MSG_CUENTA_SUSPENDIDA\), \{ loginMessage: true \}\);/);
});
