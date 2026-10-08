const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sigma = read('sigma.js');
const supa = read('supabase.js');
const flota = read('dashboard-flota-v1.js');
const detalle = read('fleet-truck-detail-v1.js');
const control = read('fleet-control-v1.js');
const css = read('jornadas-ax-v1.css');
const sql = read('migrations/20261008100000_dashboard_flota_service_horas_v1.sql');

// Los arrays que salen de new Function son de otro "realm": se comparan por JSON.
const eq = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));

const servicioSrc = supa.slice(supa.indexOf('function avisoHorasService'), supa.indexOf('/**\n * 4. OPERACIÓN'));
const S = new Function(servicioSrc + '; return { avisoHorasService, estadoServicePlan, textoRestanteService, textoProximoService, avanceService };')();

const PLAN_AMBOS = { trigger_type: 'both', interval_km: 20000, interval_hours: 500, alert_before_km: 1000 };

test('el aviso por horas es el 10 % del intervalo, con un mínimo de 10 h', () => {
  assert.equal(S.avisoHorasService(500), 50);
  assert.equal(S.avisoHorasService(50), 10);
  assert.equal(S.avisoHorasService(null), 10);
});

test('un plan por km sigue igual que antes', () => {
  const p = S.estadoServicePlan({ trigger_type: 'km', interval_km: 20000, alert_before_km: 1000 }, { next_due_km: 120000 }, 119500, 0);
  assert.equal(p.plan_estado, 'proximo');
  assert.equal(p.manda, 'km');
  assert.equal(p.km_restantes, 500);
  assert.equal(p.horas_restantes, null);
  assert.equal(p.usa_horas, false);
});

test('en un plan "lo que llegue primero" manda la medida que está más cerca', () => {
  // Por km faltan 15.000 de 20.000 (75 %); por horas faltan 40 de 500 (8 %): mandan las horas.
  const p = S.estadoServicePlan(PLAN_AMBOS, { next_due_km: 135000, next_due_hours: 6040 }, 120000, 6000);
  assert.equal(p.plan_estado, 'proximo');
  assert.equal(p.manda, 'horas');
  assert.equal(p.horas_restantes, 40);
  assert.equal(p.alert_before_hours, 50);
  assert.equal(S.textoRestanteService(p), 'Faltan 15.000 km · 40 h');
  assert.equal(S.textoProximoService({ ...p, next_due_km: 135000, next_due_hours: 6040 }), '135.000 km · 6.040 h');
  assert.equal(S.avanceService({ ...p, interval_hours: 500, interval_km: 20000 }), 92);
});

test('si las horas ya pasaron, el plan queda vencido aunque falten km', () => {
  const p = S.estadoServicePlan(PLAN_AMBOS, { next_due_km: 135000, next_due_hours: 6000 }, 120000, 6008);
  assert.equal(p.plan_estado, 'vencido');
  assert.equal(p.manda, 'horas');
  assert.equal(S.textoRestanteService(p), 'Faltan 15.000 km · excedido 8 h');
});

test('sin horas actuales el plan sigue por km, y uno sólo por horas avisa que faltan', () => {
  const ambos = S.estadoServicePlan(PLAN_AMBOS, { next_due_km: 135000, next_due_hours: 6040 }, 120000, 0);
  assert.equal(ambos.plan_estado, 'al_dia');
  assert.equal(ambos.manda, 'km');
  assert.equal(ambos.current_hours, null);
  const soloHoras = S.estadoServicePlan({ trigger_type: 'hours', interval_hours: 500 }, { next_due_hours: 6040 }, 120000, null);
  assert.equal(soloHoras.plan_estado, 'sin_horas');
  const sinRegistro = S.estadoServicePlan(PLAN_AMBOS, null, 120000, 6000);
  assert.equal(sinRegistro.plan_estado, 'sin_registro');
});

test('las pantallas de services usan el estado calculado con horas', () => {
  assert.match(supa, /\.\.\.estadoServicePlan\(plan, log, currentKm, currentHours\)/);
  assert.match(supa, /cargarPlanesDetalleOptimizados\(t\.truck_id, t\.current_km, t\.current_hours \?\? 0\)/);
  assert.match(sigma, /const nextDue\s+= textoProximoService\(p\) \|\| '—'/);
  assert.match(sigma, /sin_horas: '— Sin horas actuales'/);
  assert.match(detalle, /p\.manda === 'horas'/);
  assert.match(detalle, /hs\(hsActual\) \+ ' de motor<\/small>'/);
  assert.match(control, /manda === 'horas'/);
});

test('el tablero de la flota calcula el service con km y horas', () => {
  assert.match(sql, /create or replace function public\.dashboard_flota_v1/i);
  assert.match(sql, /greatest\(10, round\(coalesce\(m\.interval_hours, 0\) \* 0\.1\)\)::int as alert_before_hours/);
  assert.match(sql, /'service_manda',\s+f\.service_manda/);
  assert.match(sql, /'horas_restantes',\s+f\.horas_restantes/);
  assert.doesNotMatch(sql, /drop (function|trigger)/i);
});

test('la celda de próximo service muestra horas cuando mandan las horas', () => {
  const ini = flota.indexOf('function celdaProximoService');
  const src = flota.slice(flota.indexOf('var SERVICE_LABEL'), flota.indexOf('function esc(v)'))
    + flota.slice(ini, flota.indexOf('function celdaUltimoService'));
  const celda = new Function(
    'esc', 'miles', 'num', 'tinta', 'colorEstado',
    src + '; return celdaProximoService;'
  )(v => String(v), v => Number(v).toLocaleString('es-AR'), v => Number(v) || 0, () => 'gris', s => s);
  const horas = celda({ service_estado: 'proximo', service_manda: 'horas', horas_restantes: 10,
    proximo_service_horas: 5530, proximo_service_km: 200000, km_restantes: 30000 });
  assert.match(horas, /Faltan 10 h/);
  assert.match(horas, /a los 200\.000 km · 5\.530 h/);
  const km = celda({ service_estado: 'vencido', service_manda: 'km', km_restantes: -300, proximo_service_km: 120000 });
  assert.match(km, /Excedido 300 km/);
  assert.match(celda({ service_estado: 'sin_horas' }), /Sin horas de motor/);
});

test('Jornadas muestra las horas de motor de los camiones con horómetro', () => {
  const src = sigma.slice(sigma.indexOf('function _fmtHoras'), sigma.indexOf('/* De dónde salieron las horas confirmadas'));
  const H = new Function(src + '; return { _horasMotorUsadas, _horasMotorTexto };')();
  assert.equal(H._horasMotorUsadas(6000, 6004.5), 4.5);
  assert.equal(H._horasMotorUsadas(6000, null), null);
  assert.equal(H._horasMotorTexto(6000, 6004.5), '+4,5 h motor');
  assert.equal(H._horasMotorTexto(6000, null), '6.000 h motor');
  assert.equal(H._horasMotorTexto(null, null), '');

  // Administración: lista, detalle (con lo que leyó la IA) y Excel.
  assert.match(supa, /horas_inicio, horas_final, horas_inicio_origen, horas_final_origen,/);
  assert.match(supa, /horas_motor_inicio: l\.horas_inicio \?\? null/);
  assert.match(supa, /horas_inicio, horas_final, horas_inicio_ia, horas_final_ia, horas_inicio_origen, horas_final_origen,/);
  assert.match(sigma, /<span class="\$\{kmCls\}">\$\{kmTxt\}<\/span>\$\{origenBadge\}\$\{motorHtml\}/);
  assert.match(sigma, /dato\('Horas de motor'/);
  assert.match(sigma, /_kmCmpBloque\('final',  log\.horas_final_origen,  log\.horas_final_ia,  log\.horas_final, 'h'\)/);
  assert.match(sigma, /const conHorasMotor = rows\.some\(r => r\.horas_motor_inicio != null\)/);
  assert.match(sigma, /header: 'Horas de motor usadas'/);

  // Chofer: historial, "Mis jornadas" y la jornada abierta.
  assert.match(supa, /horasMotorInicio: j\.horas_inicio \?\? null/);
  assert.match(sigma, /_journeyColumns\(j\.fecha,j\.camion,j\.kmRec,j\.servicios\?\?0,estadoPill,motorTxt\)/);
  assert.match(sigma, /km_final, horas_inicio, horas_final, hora_inicio/);
  assert.match(sigma, /· Horas <b>\$\{_fmtHoras\(j\.horas_inicio\)\}<\/b>/);
  assert.match(css, /#screen-jornadas-admin\.screen \.jadmin-motor \{/);
});
