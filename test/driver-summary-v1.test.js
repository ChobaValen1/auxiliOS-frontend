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
test('focused driver panel shows only three metrics and the latest three services, escaping data',()=>{
 const t=load(),rows=Array.from({length:5},(_,i)=>({patente:'AUTO'+i,creado:'2026-10-'+(10+i)+'T12:00:00Z',origen:'<script>',destino:'Lanús',km:80}));
 const html=t.panelHTML({...DATA,ultimos:rows},'2026-10');
 assert.equal((html.match(/class="drp-metric"/g)||[]).length,3);assert.equal((html.match(/<li>/g)||[]).length,3);
 assert.ok(html.indexOf('AUTO4')<html.indexOf('AUTO3'));assert.doesNotMatch(html,/AUTO0|AUTO1|Lo que llevo ganado|<script>/);
 assert.match(html,/Mi plata del mes/);assert.match(html,/Actividad por día/);assert.match(html,/data-drs-accion="historial"/);assert.match(html,/Sin jornada activa/);
 assert.match(t.panelHTML({mes:{},ultimos:[]},'2026-09'),/Todavía no hay servicios este mes/);
 assert.match(t.panelHTML({mes:{},ultimos:[]},'2026-09'),/>—</);
});
test('last services display localities only and never invent one from coordinates or street-only text',()=>{
 const t=load();assert.equal(t.localidad('Av. Hipólito Yrigoyen 3422, B1824ABN Lanús, Provincia de Buenos Aires, Argentina'),'Lanús');
 assert.equal(t.localidad('Sarachaga 5762, Isidro Casanova'),'Isidro Casanova');assert.equal(t.localidad('-37.66, -57.43'),'Localidad no informada');
 assert.equal(t.localidad('Av. Rivadavia 100'),'Localidad no informada');assert.equal(t.localidad('', 'Villa Gesell'),'Villa Gesell');
});

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

function loadWithPayroll() {
  const ctx = { window: {}, document: { getElementById: () => null, querySelector: () => null }, Intl, console };
  vm.runInNewContext(read('payroll-matrix.js'), ctx);
  vm.runInNewContext(src, ctx);
  return ctx.window.AuxiliosDriverSummary._test;
}

test('Lo que llevo ganado: misma cuenta que Sueldos (caso real de septiembre: $725.384,76)', () => {
  const t = loadWithPayroll();
  const km = [[1281,1427],[2163,2331],[2331,3293],[734450,734561],[3349,3419],[5001,5498],[3419,3649],[3649,3807],[3807,4032],[4032,4311],[4650,4997],[5498,5762],[5762,6005],[736916,737122],[6005,6220],[737136,737608],[6231,6428]];
  const e = { settings: { valor_km: 86, sueldo_basico: 0, valor_servicio: 3700, bono_presentismo: 280000, compensation_matrix: { pay_km: true, bonuses: [], km_basis: 'real', pay_services: true, pay_presentismo: true } }, commissions: [], sources: { extras: [], invoices: [], captacion: [] }, jornadas: km.map(([a, b]) => ({ status: 'closed', km_inicio: a, km_final: b })), servicios: 75, incidentes: 0, descuento_rendicion: 244055.24 };
  assert.equal(t.estimar(e).total, 725384.76);
  // Sueldo fijo: sólo el fijo, menos el descuento por rendición ($2.330.000 en Sueldos).
  const fijo = { settings: { valor_km: 95, sueldo_basico: 2500000, valor_servicio: 4070, bono_presentismo: 0, compensation_matrix: { pay_type: 'fixed', pay_km: false, pay_services: false, pay_presentismo: false, bonuses: [], km_basis: 'real' } }, commissions: [], sources: { extras: [], invoices: [], captacion: [] }, jornadas: [], servicios: 123, incidentes: 0, descuento_rendicion: 170000 };
  assert.equal(t.estimar(fijo).total, 2330000);
});

test('Lo que llevo ganado: comisiones, presentismo con incidentes y casos sin esquema', () => {
  const t = loadWithPayroll();
  const base = { settings: { valor_km: 0, sueldo_basico: 0, valor_servicio: 0, bono_presentismo: 1000, compensation_matrix: { pay_km: false, pay_services: false, pay_presentismo: true, bonuses: [{ name: 'Desempeño', amount: 500 }] } },
    commissions: [{ commission_id: 'p', name: 'Pinacars', concept_id: 'pin', source: 'extras', mode: 'fixed', value: 15000 }],
    sources: { invoices: [], captacion: [], extras: [{ id: 'a', concept_id: 'pin', quantity: 1, amount: 0, currency: 'ARS' }, { id: 'b', concept_id: 'pin', quantity: 1, amount: 0, currency: 'ARS' }] },
    jornadas: [{ status: 'closed', km_inicio: 1, km_final: 2 }], servicios: 1, incidentes: 1, descuento_rendicion: 0 };
  const x = t.estimar(base);
  assert.equal(x.total, 30500);
  assert.ok(x.lineas.some(l => l[0] === 'Presentismo' && l[2] === 0 && /incidentes/.test(l[1])));
  assert.equal(t.estimar({ ...base, settings: null }).sinEsquema, true);
  assert.deepEqual({ ...t.estimar({ liquidacion: { estado: 'pagada', total: 900 } }) }, { liquidada: true, estado: 'pagada', total: 900 });
  const html = t.ganadoHTML(base, { efectivo: { pendiente: 5000 } });
  assert.match(html, /Estimado a hoy<\/small><b>\$30\.500<\/b>/);
  assert.match(html, /el monto final lo confirma Administración al liquidar|El monto final lo confirma Administración al liquidar/);
  assert.match(html, /Si queda efectivo sin rendir \(\$5\.000\), se descuenta\./);
});

test('la base: Sueldos y el chofer usan las mismas fuentes; el chofer sólo ve lo suyo', () => {
  const est = read('migrations/20261013020000_driver_payroll_estimate_v1.sql');
  assert.match(est, /return app_private\.payroll_matrix_sources_core\(p_driver, p_from, p_until\);/);
  assert.match(est, /'sources', app_private\.payroll_matrix_sources_core\(v_driver, v_from, v_until\),/);
  assert.match(est, /if coalesce\(app_private\.current_auxilios_role\(\),''\) not in \('administracion','supervision'\) then raise exception 'No autorizado';/);
  assert.match(est, /if v_driver <> auth\.uid\(\) and v_role not in \('administracion','supervision'\) then raise exception 'Sin permiso';/);
  assert.match(est, /revoke all on function app_private\.payroll_matrix_sources_core\(uuid, date, date\) from public, anon, authenticated;/);
  assert.match(src, /_db\.rpc\('get_driver_payroll_estimate_v2', \{ p_period: period, p_driver: driverId \}\)/);
});
