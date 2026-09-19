const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const flota = fs.readFileSync('dashboard-flota-v1.js', 'utf8');
const sql = fs.readFileSync(
  'migrations/20260918172000_dashboard_flota_rpc_v1.sql', 'utf8');
const css = fs.readFileSync('dashboard-v1.css', 'utf8');
const index = fs.readFileSync('Index.html', 'utf8');

// El SQL sin comentarios: los umbrales se explican en prosa, y esa prosa no
// puede hacer pasar (ni hacer fallar) un test sobre lo que realmente corre.
const sqlEjecutable = sql.split('\n').map(l => l.replace(/--.*$/, '')).join('\n');
const flotaCodigo = flota
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// Los tres colores reservados para estado en dashboard-charts-v1.js.
const COLORES_ESTADO = ['#27c47a', '#f5a623', '#e2504a'];

test('el archivo parsea (npm run check no cubre los dashboard-*.js)', () => {
  assert.doesNotThrow(() => new Function(flota));
});

test('la sección se registra en el shell y no reimplementa lo que el shell hace', () => {
  assert.match(flota, /AuxDash\.registrarSeccion\(/);
  assert.match(flota, /id:\s*'flota'/);
  assert.match(flota, /cargar:\s*cargar/);
  // El overlay, el coalescing y el manejo de filtros son del shell.
  ['dashx-loading', 'setCargando', 'recargaPendiente', 'addEventListener']
    .forEach(prohibido => assert.ok(!flota.includes(prohibido),
      `la sección está reimplementando '${prohibido}', que ya hace el shell`));
});

test('los colores de estado no se usan como color de serie', () => {
  // Se llega a ellos por el token del motor, nunca por un hex pegado a mano:
  // así un cambio de paleta no deja esta sección desincronizada.
  COLORES_ESTADO.forEach(hex => assert.ok(!flota.includes(hex),
    `${hex} está hardcodeado; se usa AuxDashCharts.ESTADO`));
  assert.match(flota, /AuxDashCharts\.ESTADO/);
  // Todas las lecturas del token viven dentro de colorEstado(): un solo lugar
  // donde el estado se traduce a color.
  const colorEstado = flotaCodigo.match(/function colorEstado\([\s\S]*?\n  \}/)[0];
  assert.match(colorEstado, /AuxDashCharts\.ESTADO/);
  assert.equal(
    (flotaCodigo.match(/AuxDashCharts\.ESTADO/g) || []).length,
    (colorEstado.match(/AuxDashCharts\.ESTADO/g) || []).length,
    'el color de estado se está leyendo fuera de colorEstado()');

  // El donut de estado de flota es composición, no alarma: va con la paleta
  // categórica que aplica donut() solo.
  const llamada = flota.match(/donut\(ID_DONUT,\s*\{[\s\S]*?\}\);/);
  assert.ok(llamada, 'no se encontró la llamada al donut');
  assert.ok(!/ESTADO|colorEstado/.test(llamada[0]),
    'el donut está recibiendo un color de estado como serie');
  assert.ok(!/\bcolor\b|backgroundColor/.test(llamada[0]),
    'el donut no debe imponer colores de serie');

  // Y no se le pasa color a ningún otro gráfico del motor.
  ['barras', 'linea', 'treemap'].forEach(fn => assert.ok(
    !new RegExp('AuxDashCharts\\.' + fn + '\\(').test(flota),
    `${fn}() no se usa en esta sección: no hay que colorear series acá`));
});

test('cada alerta lleva ícono y texto, no sólo color', () => {
  // Regla del tablero: el color nunca es el único indicador.
  assert.match(flota, /ICONO\s*=\s*\{[^}]*critico[^}]*aviso[^}]*ok[^}]*\}/);
  assert.match(flota, /ICONO\[t\.severidad\]/);
  assert.match(flota, /dashx-alert-value/);
  assert.match(flota, /esc\(t\.etiqueta\)/);
  // Las clases de severidad las pinta el CSS que ya existe.
  assert.match(flota, /dashx-alert is-' \+ t\.severidad/);
  ['is-critico', 'is-aviso', 'is-ok'].forEach(clase =>
    assert.ok(css.includes(`.dashx-alert.${clase}`), `falta la clase ${clase} en el CSS`));
  // El chip de la tabla también: color + ícono + texto.
  assert.match(flota, /function chipSituacion/);
  assert.match(flota, /aria-hidden="true">' \+ ICONO\[sev\]/);
});

test('un contador en cero se muestra como cero, y el error se muestra como error', () => {
  // Cero incidentes abiertos es una buena noticia, no "sin datos".
  assert.match(flota, /valor === 0/);
  assert.match(flota, /'Sin pendientes'/);
  assert.ok(!/Sin datos para este período/.test(flota),
    'un contador en cero no puede caer en el mensaje de "sin datos"');
  // El fallo de carga tiene su propio camino y se propaga al shell para que lo loguee.
  assert.match(flota, /function pintarError/);
  assert.match(flota, /No se pudo leer el estado de la flota/);
  assert.match(flota, /pintarError\(e\);\s*\n\s*throw e;/);
  // Pintar sólo ocurre después de que la consulta salió bien.
  const cargar = flota.match(/async function cargar\(\)[\s\S]*?\n  \}/)[0];
  assert.ok(cargar.indexOf('throw e') < cargar.indexOf('pintarAlertas'),
    'se están pintando tarjetas antes de saber si la consulta funcionó');
});

test('los números de la tabla van a la derecha y con tabular-nums', () => {
  assert.match(flota, /font-variant-numeric:\s*tabular-nums/);
  assert.match(flota, /text-align:right/);
  // Las cuatro columnas numéricas usan el estilo numérico, no el base.
  const cuerpo = flota.match(/var cuerpo = filas\.map[\s\S]*?\}\)\.join\(''\);/)[0];
  assert.equal((cuerpo.match(/tdNum/g) || []).length, 3,
    'alguna columna de km dejó de estar alineada a la derecha');
  assert.match(flota, /var tdNum = tdBase \+ ';text-align:right;font-variant-numeric:tabular-nums/);
});

test('el texto que viene de la base se escapea antes de ir al innerHTML', () => {
  assert.match(flota, /function esc\(/);
  assert.match(flota, /replace\(\/&\/g, '&amp;'\)/);
  ['c.movil', 'c.patente', 'c.marca_modelo'].forEach(campo =>
    assert.ok(flota.includes(`esc(${campo}`), `${campo} va al DOM sin escapar`));
});

test('la RPC sigue las convenciones de migraciones del repo', () => {
  assert.match(sql, /create or replace function public\.dashboard_flota_v1\(\)/);
  assert.match(sql, /returns jsonb/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path=''/);
  assert.match(sql, /app_private\.current_auxilios_role\(\)/);
  assert.match(sql, /not in \('administracion', 'supervision'\)/);
  assert.match(sql, /revoke all on function public\.dashboard_flota_v1\(\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.dashboard_flota_v1\(\) to authenticated, service_role;/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test('la RPC es una foto de hoy: no recibe rango de fechas', () => {
  // El estado actual no se filtra por período: un documento vencido lo está hoy.
  assert.ok(!/p_desde|p_hasta|p_periodo/.test(sql),
    'la función está recibiendo fechas y no debería');
  assert.match(flota, /rpc\('dashboard_flota_v1'\)/);
  assert.ok(!/rpc\('dashboard_flota_v1',/.test(flota),
    'el front le está pasando parámetros a una RPC sin parámetros');
});

test('los umbrales están nombrados y son los que realmente filtran', () => {
  assert.match(sql, /c_dias_doc_aviso\s+constant integer\s*:=\s*30;/);
  assert.match(sql, /c_dias_incidente_abierto\s+constant integer\s*:=\s*30;/);
  assert.match(sql, /c_km_service_aviso\s+constant integer\s*:=\s*500;/);

  const consulta = sqlEjecutable.split('\n')
    .filter(l => !/constant integer/.test(l)).join('\n');
  assert.ok(!/interval\s*'\d+\s*days?'/i.test(consulta),
    'hay una ventana de días hardcodeada en la consulta');
  assert.ok(!/make_interval\(days\s*=>\s*\d/.test(consulta),
    'hay una ventana de días hardcodeada en la consulta');
  assert.ok(!/alert_before_km,\s*\d/.test(consulta),
    'el fallback de km de aviso está hardcodeado');

  // Y se usan: el umbral de incidentes filtra las dos consultas de incidentes.
  assert.ok((consulta.match(/c_dias_incidente_abierto/g) || []).length >= 2);
  assert.match(consulta, /coalesce\(m\.alert_before_km, c_km_service_aviso\)/);
  // El umbral de documentación viaja al front para rotular la tarjeta.
  assert.match(consulta, /'dias_doc_aviso',\s*c_dias_doc_aviso/);
  // Y el front lo lee de ahí en vez de repetir el número.
  assert.match(flota, /umbrales\.dias_doc_aviso/);
  assert.match(flota, /umbrales\.dias_incidente_abierto/);
  assert.ok(!/\b30\b/.test(flotaCodigo),
    'el front repite un umbral que ya define el SQL');
});

test('el vencimiento se lee de las vistas, no se recalcula', () => {
  // v_truck_docs_status y v_driver_docs_status ya deduplican y clasifican
  // respetando el alert_days de cada documento. Recalcularlo acá garantiza que
  // el dashboard y la pantalla de Documentos terminen diciendo cosas distintas.
  assert.match(sql, /public\.v_truck_docs_status/);
  assert.match(sql, /public\.v_driver_docs_status/);
  assert.ok(!/expiry_date\s*</.test(sqlEjecutable),
    'se está recalculando el vencimiento en vez de usar el status de la vista');
  ['vencido', 'proximo', 'falta_archivo'].forEach(estado =>
    assert.ok(sql.includes(`d.status = '${estado}'`) || sql.includes(`v.status = '${estado}'`),
      `no se está contando el estado '${estado}' de la vista`));
});

test('el estado de mantenimiento replica la lógica de la app, no inventa otra', () => {
  // Mismo criterio que cargarPlanesDetalleOptimizados() en supabase.js:
  // último maintenance_log del plan, next_due_km contra el odómetro.
  assert.match(sql, /public\.truck_subscriptions/);
  assert.match(sql, /order by ml\.performed_at desc, ml\.maintenance_id desc/);
  assert.match(sql, /when c\.current_km >= l\.next_due_km\s*then 'vencido'/);
  assert.match(sql, /<= p\.alert_before_km then 'proximo'/);
  // Un camión con jornada abierta en taller cuenta como en mantenimiento aunque
  // nadie le haya tocado el status en la ficha.
  assert.match(sql, /in_workshop/);
});

test('el payload trae todo lo que la UI pinta', () => {
  ['camiones_mantenimiento', 'services_vencidos', 'services_proximos',
   'docs_vencidos', 'docs_por_vencer', 'incidentes_abiertos', 'incidentes_graves',
   'licencias_por_vencer', 'licencias_vencidas']
    .forEach(k => {
      assert.ok(sql.includes(`'${k}'`), `el SQL no devuelve ${k}`);
      assert.ok(flota.includes(`alertas.${k}`), `la UI no usa ${k}`);
    });
  ['patente', 'movil', 'estado', 'km_actual', 'ultimo_service_fecha',
   'proximo_service_km', 'km_restantes', 'service_estado', 'severidad']
    .forEach(k => {
      assert.ok(sql.includes(`'${k}'`), `el SQL no devuelve ${k} por camión`);
      assert.ok(flota.includes(`c.${k}`), `la tabla no usa ${k}`);
    });
  // El donut se arma con el desglose de composición de flota.
  ['activos', 'mantenimiento', 'inactivos'].forEach(k => {
    assert.ok(sql.includes(`'${k}',`), `falta ${k} en estado_flota`);
    assert.ok(flota.includes(`e.${k}`), `el donut no usa ${k}`);
  });
});

test('la sección pinta sobre el markup que ya existe en Index.html', () => {
  ['dashx-flota-alertas', 'dashx-flota-tabla', 'dashx-flota-sub', 'dashx-flota-estado']
    .forEach(id => {
      assert.ok(index.includes(`id="${id}"`), `falta ${id} en el markup`);
      assert.ok(flota.includes(`'${id}'`), `la sección no usa ${id}`);
    });
  // Y no crea markup propio de la grilla: los contenedores ya están.
  assert.ok(!/dashx-sec-head|dashx-card-title/.test(flota),
    'la sección está recreando el markup de la grilla');
});
