const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const index = fs.readFileSync('Index.html', 'utf8');
const ops = fs.readFileSync('dashboard-operaciones-v1.js', 'utf8');
const charts = fs.readFileSync('dashboard-charts-v1.js', 'utf8');
const css = fs.readFileSync('dashboard-v1.css', 'utf8');
const sql = fs.readFileSync(
  'migrations/20260918171000_dashboard_operaciones_rpc_v1.sql', 'utf8');

/* ── Convenciones de la migración ──────────────────────────────────────── */

test('la RPC sigue las convenciones de funciones del repo', () => {
  assert.match(sql, /create or replace function public\.dashboard_operaciones_v1\(/);
  assert.match(sql, /p_desde\s+date/);
  assert.match(sql, /p_hasta\s+date/);
  assert.match(sql, /p_camiones\s+int\[\]/);
  assert.match(sql, /p_choferes\s+uuid\[\]/);
  assert.match(sql, /returns jsonb/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path=''/);
  assert.match(sql, /revoke all on function public\.dashboard_operaciones_v1[^\n]*from public, anon/);
  assert.match(sql, /grant execute on function public\.dashboard_operaciones_v1[^\n]*to authenticated, service_role/);
  // Con search_path vacío nada resuelve solo: todo va calificado con su esquema.
  assert.ok(!/\sfrom\s+daily_logs\b/.test(sql), 'hay una tabla sin calificar con su esquema');
  assert.ok(!/\sfrom\s+fuel_records\b/.test(sql), 'hay una tabla sin calificar con su esquema');
});

test('la RPC la ven administración y supervisión, y nadie más', () => {
  assert.match(sql, /app_private\.current_auxilios_role\(\)/);
  assert.match(sql, /not in \('administracion', 'supervision'\)/);
  assert.match(sql, /raise exception 'Sin permiso[^']*'/);
  assert.match(sql, /errcode = '42501'/);
  // chofer y operador no pueden ver la operación de toda la flota.
  const guarda = sql.match(/not in \(([^)]*)\)/)[1];
  ['chofer', 'operador', 'facturacion'].forEach(rol =>
    assert.ok(!guarda.includes(`'${rol}'`), `${rol} no debería tener acceso`));
});

/* ── Guardas aritméticas: km ───────────────────────────────────────────── */

test('el km de la jornada descarta deltas negativos y disparatados', () => {
  // km_final - km_inicio con el odómetro cargado a mano puede salir al revés.
  // Sumar un negativo restaría kilómetros reales de otras jornadas.
  assert.match(sql, /d\.km_final - d\.km_inicio < 0\s+then null/);
  assert.match(sql, /d\.km_final - d\.km_inicio > 2000\s+then null/);
  // Una jornada sin cierre de odómetro no aporta km.
  assert.match(sql, /when d\.km_final is null\s+then null/);
  // km_excepcion marca un odómetro reseteado: el delta no significa nada.
  assert.match(sql, /coalesce\(d\.km_excepcion, false\)\s+then null/);
  // Las descartadas se cuentan aparte (count(km) sobre el null) y se informan.
  assert.match(sql, /count\(j\.km\)::int\s+as jornadas_con_km/);
  assert.match(sql, /'jornadas_sin_km',\s+tot\.jornadas - tot\.jornadas_con_km/);
});

test('no se confía en km_recorridos como si fuera el delta crudo', () => {
  // La columna generada es null cuando km_excepcion está marcada y NO valida el
  // signo: usarla directamente volvería a meter los deltas negativos.
  assert.ok(!/km_recorridos/.test(sql),
    'volvió km_recorridos, que no valida el signo del delta');
});

/* ── Guardas aritméticas: horas ────────────────────────────────────────── */

test('las jornadas que cruzan medianoche no dan horas negativas', () => {
  // hora_inicio / hora_fin son `time` sin fecha: 22:00 → 06:00 resta -16 h.
  assert.match(sql, /case when d\.hora_fin < d\.hora_inicio then 24 else 0 end/);
  assert.match(sql, /extract\(epoch from \(d\.hora_fin - d\.hora_inicio\)\) \/ 3600\.0/);
  // Y aun así una jornada no puede durar negativo ni un día entero: el cierre
  // tipeado apenas antes del inicio (07:31 → 07:12) se leería como 23,7 h.
  assert.match(sql, /when hj\.horas <= 0\s+then null/);
  assert.match(sql, /when hj\.horas > 20\s+then null/);
  assert.match(sql, /'jornadas_sin_horas',\s+tot\.jornadas - tot\.jornadas_con_horas/);
});

/* ── Guardas aritméticas: divisiones ───────────────────────────────────── */

test('ninguna división queda sin guarda de denominador', () => {
  // Un período sin cargas o sin km tiraría división por cero y la sección
  // entera caería al overlay de error.
  assert.match(sql, /'km_por_litro',\s*\n?\s*case when totf\.litros > 0 then round\(tot\.km \/ totf\.litros, 2\) end/);
  assert.match(sql, /'costo_por_km',\s*\n?\s*case when tot\.km > 0 then round\(totf\.costo \/ tot\.km, 2\) end/);
  assert.match(sql, /'horas_por_jornada',\s*\n?\s*case when tot\.jornadas_con_horas > 0 then round\(tot\.horas \/ tot\.jornadas_con_horas, 2\) end/);
  // También por camión y por chofer, que es donde más fácil aparece el cero.
  assert.match(sql, /'km_por_litro', case when x\.litros > 0 then round\(x\.km \/ x\.litros, 2\) end/);
  assert.match(sql, /case when x\.jornadas_con_horas > 0 then round\(x\.horas \/ x\.jornadas_con_horas, 2\) end/);

  // Toda barra de división del cuerpo de la función tiene que estar dentro de
  // un `case when ... > 0`: si aparece una suelta, es una división sin guarda.
  const cuerpo = sql.slice(sql.indexOf('as $function$'), sql.lastIndexOf('$function$'));
  cuerpo.split('\n').forEach(linea => {
    if (!/[a-z_.]+ \/ [a-z_.]+/.test(linea)) return;
    if (/3600\.0/.test(linea)) return; // constante, nunca cero
    assert.match(linea, /case when [^\n]*> 0 then/,
      `división sin guarda de cero: ${linea.trim()}`);
  });
});

/* ── Agregación del lado del servidor ──────────────────────────────────── */

test('la RPC devuelve todo agregado, no filas crudas', () => {
  ['totales', 'eficiencia', 'por_camion', 'por_chofer', 'serie_temporal', 'catalogo']
    .forEach(k => assert.ok(sql.includes(`'${k}'`), `falta la clave ${k}`));
  ['km', 'litros', 'costo', 'jornadas', 'horas', 'cargas']
    .forEach(k => assert.match(sql, new RegExp(`'${k}',`), `falta el total ${k}`));
  assert.match(sql, /jsonb_build_object/);
  // Los arrays vacíos llegan como [] y no como null: el front itera sin chequear.
  assert.match(sql, /coalesce\(jsonb_agg\([\s\S]*?\), '\[\]'::jsonb\)/);
});

test('la serie temporal cambia de grano según el largo del rango', () => {
  assert.match(sql, /v_semanal\s*:=\s*\(v_hasta - v_desde\) > 62/);
  assert.match(sql, /case when v_semanal then 'semana' else 'dia' end/);
  assert.match(sql, /v_paso\s*:=\s*case when v_semanal then 7 else 1 end/);
  // Los huecos se rellenan con cero: si la línea saltea los días sin jornadas
  // sugiere una continuidad que no existe.
  assert.match(sql, /generate_series\(/);
  assert.match(sql, /left join jornada j/);
  assert.match(sql, /coalesce\(sum\(j\.km\), 0\)::bigint as km/);
});

test('sólo entran jornadas cerradas, no anuladas y sin datos de QA', () => {
  assert.match(sql, /d\.status = 'closed'/);
  assert.match(sql, /d\.voided_at is null/);
  assert.match(sql, /fr\.status = 'active'/);
  assert.match(sql, /fr\.voided_at is null/);
  assert.match(sql, /fr\.liters > 0/);
  // El móvil QA-01 y el "Chofer de Prueba" moverían los promedios sin
  // representar nada de la operación real.
  assert.match(sql, /t\.is_test = false/);
  assert.match(sql, /u\.is_test = false/);
});

test('un array de filtro vacío se trata igual que sin filtro', () => {
  assert.match(sql, /case when coalesce\(array_length\(p_camiones, 1\), 0\) = 0 then null else p_camiones end/);
  assert.match(sql, /case when coalesce\(array_length\(p_choferes, 1\), 0\) = 0 then null else p_choferes end/);
  assert.match(sql, /v_camiones is null or d\.truck_id\s+= any \(v_camiones\)/);
  assert.match(sql, /v_choferes is null or d\.driver_id = any \(v_choferes\)/);
});

test('el catálogo de los combos no se filtra con los filtros activos', () => {
  // Si se filtrara, elegir un camión borraría del combo a todos los demás y no
  // habría forma de volver atrás.
  const cat = sql.slice(sql.indexOf('cat_cam as ('), sql.indexOf('select jsonb_build_object'));
  assert.ok(!cat.includes('v_camiones'), 'el catálogo de camiones se filtra a sí mismo');
  assert.ok(!cat.includes('v_choferes'), 'el catálogo de choferes se filtra a sí mismo');
});

test('hay índices para el acceso por rango de fecha del dashboard', () => {
  // Los índices que había arrancan por driver_id / truck_id y no sirven para
  // barrer un rango de fechas sobre toda la flota.
  assert.match(sql, /create index if not exists daily_logs_dashboard_fecha_idx/);
  assert.match(sql, /create index if not exists fuel_records_dashboard_fecha_idx/);
});

/* ── Front: contrato con el shell ──────────────────────────────────────── */

test('la sección se registra en el shell y no reimplementa nada suyo', () => {
  assert.match(ops, /AuxDash\.registrarSeccion\(/);
  assert.match(ops, /id:\s*'operaciones'/);
  assert.match(ops, /montar:/);
  assert.match(ops, /cargar:/);
  // El overlay, el coalescing y el estado de los filtros son del shell.
  ['dashx-loading', 'recargaPendiente', 'setCargando', 'rangoDePeriodo']
    .forEach(k => assert.ok(!ops.includes(k), `la sección reimplementa ${k}, que es del shell`));
});

test('los filtros propios se empujan con setFiltro, no recargando a mano', () => {
  assert.match(ops, /AuxDash\.setFiltro\('camiones',/);
  assert.match(ops, /AuxDash\.setFiltro\('choferes',/);
  assert.ok(!/AuxDash\.recargar\(/.test(ops),
    'la sección recarga por su cuenta: eso lo hace setFiltro');
});

test('el front llama a la RPC y no suma nada del lado del cliente', () => {
  // El cliente se resuelve a una local antes de llamar: _db es un const del
  // scope del script, no una propiedad de window.
  assert.match(ops, /\bdb\.rpc\('dashboard_operaciones_v1'/);
  ['p_desde', 'p_hasta', 'p_camiones', 'p_choferes']
    .forEach(p => assert.ok(ops.includes(p), `falta el parámetro ${p}`));
  assert.match(ops, /if \(resp\.error\) throw resp\.error/);
  // Nada de traerse filas crudas por PostgREST para agregarlas en JS.
  assert.ok(!/_db\.from\(/.test(ops), 'la sección consulta tablas directo en vez de la RPC');
  // El único reduce permitido es el promedio de la línea de referencia, que es
  // una anotación sobre la serie ya agregada por la RPC, no un total recalculado.
  const reduces = (ops.match(/\.reduce\(/g) || []).length;
  const enTendencia = (ops.slice(ops.indexOf('function pintarTendencia'),
                                 ops.indexOf('/* ── ciclo de vida'))
                          .match(/\.reduce\(/g) || []).length;
  assert.equal(reduces, enTendencia,
    'hay un reduce fuera de la tendencia: la sección agrega en JS lo que ya agregó la RPC');
});

test('sin _db la sección falla fuerte y el shell muestra el error', () => {
  assert.match(ops, /Sin conexión con la base de datos/);
  assert.match(ops, /alError/);
  assert.match(ops, /G\.error\(id, msg\)/);
});

/* ── Front: reglas de la paleta y de los gráficos ──────────────────────── */

test('el canvas y las dos tablas del markup se llenan', () => {
  // Por camión y por chofer son varias medidas sobre pocas filas: tabla, no
  // cuatro gráficos de barras que había que cruzar con la vista.
  ['dashx-ops-tendencia', 'dashx-ops-tabla-camiones', 'dashx-ops-tabla-choferes']
    .forEach(id => assert.ok(ops.includes(id), `no se usa el contenedor ${id}`));
  ['dashx-ops-filtros', 'dashx-ops-ratios', 'dashx-ops-sub', 'dashx-ops-comb-metrics']
    .forEach(id => assert.ok(ops.includes(id), `no se llena el contenedor ${id}`));
  // Y se usan las clases de métrica que ya existen, sin inventar CSS nuevo.
  ['dashx-metric', 'dashx-metric-label', 'dashx-metric-value']
    .forEach(c => assert.ok(ops.includes(c), `falta la clase ${c}`));
});

test('los colores salen de la paleta validada, nunca hex propios', () => {
  const hex = ops.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.deepEqual(hex, [], `la sección escribe hex propios: ${hex.join(', ')}`);
  assert.match(ops, /G\.PALETA\[/);
  // ESTADO.ok/aviso/critico están reservados para semántica de estado.
  assert.ok(!/G\.ESTADO/.test(ops),
    'un color de estado usado como color de serie');
});

test('no hay gráficos de doble eje Y', () => {
  // Dos magnitudes de escala distinta van en dos gráficos, no en dos ejes.
  assert.ok(!/yAxisID|y1:|scales\s*:/.test(ops), 'la sección configura ejes por su cuenta');
  const tendencia = ops.slice(ops.indexOf('function pintarTendencia'),
                              ops.indexOf('function pintarAnillo'));
  // La única serie graficada es km. La referencia de promedio va en el mismo eje
  // y en las mismas unidades, que es justamente lo contrario a un doble eje.
  assert.ok(!/values:\s*serie\.map[\s\S]*values:\s*serie\.map/.test(tendencia),
    'la tendencia grafica dos magnitudes distintas');
  assert.match(tendencia, /referencia:/);
  assert.ok(!/servicios/.test(tendencia.split('G.barras')[1] || ''),
    'la tendencia mezcla km con servicios en el mismo eje');
});

test('"Otros" sólo donde es una suma real, nunca en las tablas', () => {
  // En las tablas el topN escondía al octavo chofer para no pasar de siete
  // colores, en gráficos de una sola serie donde el color no codificaba nada.
  const tablas = ops.slice(ops.indexOf('function pintarTablaCamiones'),
                           ops.indexOf('function pintarTendencia'));
  assert.ok(!/G\.topN\(/.test(tablas), 'topN esconde filas que la tabla puede mostrar');

  // En el anillo sí corresponde: es parte-sobre-total y "Otros" suma kilómetros
  // de verdad, no promedia cocientes.
  const anillo = ops.slice(ops.indexOf('function pintarAnillo'),
                           ops.indexOf('/* ── ciclo de vida'));
  assert.match(anillo, /G\.topN\(/);
  assert.match(anillo, /G\.donut\(/);
});

test('un null de la RPC se muestra como guión, no como NaN ni como cero', () => {
  // La RPC devuelve null cuando el denominador era cero. Number(null) es 0 y
  // pintar un 0 donde no hay dato es peor que no pintar nada.
  assert.match(ops, /return '—'/);
  assert.match(ops, /!isFinite\(Number\(v\)\)/);
  // km_por_litro llega null cuando el camión no tuvo cargas. La tabla lo muestra
  // como guión en su fila, en vez de omitir el camión entero como hacía el
  // gráfico: que un móvil no cargue combustible es justamente lo que hay que ver.
  const charts = fs.readFileSync('dashboard-charts-v1.js', 'utf8');
  assert.match(charts, /var vacia = \(v === null \|\| v === undefined \|\| v === ''\)/);
  assert.match(charts, /txt = '—'/);
});

test('las jornadas descartadas se muestran en el subtítulo', () => {
  // Un total silenciosamente incompleto es peor que un total con la advertencia.
  assert.match(ops, /jornadas_sin_km/);
  assert.match(ops, /jornadas_sin_horas/);
  assert.match(ops, /sin km utilizable/);
  assert.match(ops, /sin horario utilizable/);
  // Y sólo se nombran cuando no son cero: "0 sin km utilizable" es ruido.
  assert.match(ops, /if \(num\(d\.jornadas_sin_km\) > 0\)/);
  assert.match(ops, /if \(num\(d\.jornadas_sin_horas\) > 0\)/);
});

test('las fechas ISO no se parsean con new Date', () => {
  // new Date('2026-07-10') es UTC y en Argentina imprime el 09/07.
  const codigo = ops.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  // Se permite sólo la forma que fija hora local explícita: new Date('2026-07-10')
  // es medianoche UTC y en Argentina cae el 09/07, pero con 'T12:00:00' el día
  // es el correcto en cualquier huso.
  const usos = codigo.match(/new Date\([^)]*\)/g) || [];
  usos.forEach(u => assert.match(u, /T12:00:00/,
    `parsear un ISO corto con new Date corre el día: ${u}`));
  assert.match(ops, /function diaMes/);
  assert.match(ops, /String\(iso \|\| ''\)\.split\('-'\)/);
});

test('los nombres que vienen de la base no pasan por el parser de HTML', () => {
  const combo = ops.slice(ops.indexOf('function pintarCombo'),
                          ops.indexOf('function pintarFiltros'));
  assert.match(combo, /createElement\('option'\)/);
  assert.match(combo, /textContent/);
  assert.ok(!/innerHTML\s*\+?=\s*[^;]*o\.texto/.test(combo),
    'el nombre del catálogo se concatena en innerHTML');
});

/* ── v2: servicios y granularidad ──────────────────────────────────────── */

const sqlV2 = fs.readFileSync(
  'migrations/20260919140000_dashboard_operaciones_servicios_v2.sql', 'utf8');

test('SERVICIOS se cuenta y se corta por camión, chofer y período', () => {
  // Un remito no anulado es un servicio hecho. Faltaba por completo.
  assert.match(sqlV2, /r\.status <> 'anulado'/);
  assert.match(sqlV2, /'servicios', tots\.servicios/);
  ['cam_s', 'cho_s', 'serie_s'].forEach(cte =>
    assert.ok(sqlV2.includes(cte + ' as ('), `falta el corte ${cte}`));
  // Y las razones que la variable habilita.
  assert.match(sqlV2, /'servicios_por_jornada'/);
  assert.match(sqlV2, /'km_por_servicio'/);
  // El front la muestra en la razón de arriba y en las dos tablas, donde
  // además cierra con su total.
  assert.match(ops, /'Servicios por jornada'/);
  assert.ok((ops.match(/clave: 'servicios'/g) || []).length === 2,
    'servicios tiene que estar en las dos tablas');
  assert.ok((ops.match(/clave: 'servicios',\s*titulo: 'Servicios', total: 'suma'/g) || []).length === 2,
    'servicios tiene que cerrar con su total en las dos tablas');
});

test('un remito sin jornada cuenta en el total pero no se cuelga de un camión', () => {
  // Si se colgara de cualquier móvil inventaría atribución; si se descartara,
  // el total no cerraría con lo que hay en la base.
  assert.match(sqlV2, /where s\.truck_id is not null group by s\.truck_id/);
  assert.match(sqlV2, /'servicios_sin_camion'/);
});

test('la granularidad escala para que el gráfico no se vuelva ilegible', () => {
  // Antes pasaba a semanal recién a los 62 días: un rango de 60 dibujaba 60
  // barras. La escalera mantiene el máximo en ~31 marcas.
  assert.match(sqlV2, /v_dias <=\s*31 then v_grano := 'dia'/);
  assert.match(sqlV2, /v_dias <= 120 then v_grano := 'semana'/);
  assert.match(sqlV2, /v_grano := 'mes'/);
  assert.match(sqlV2, /interval '1 month'/);
  // Y el front rotula cada grano distinto: doce "19/08" no dicen de qué mes.
  assert.match(ops, /function etiquetaEje/);
  assert.match(ops, /grano === 'mes'/);
  assert.match(ops, /\{ dia: 'por día', semana: 'por semana', mes: 'por mes' \}/);
});

test('el anillo responde una pregunta que la tabla no contesta de un vistazo', () => {
  // Parte-sobre-total: qué tan concentrada está la operación en pocos móviles.
  // Sacarlo de la tabla exigiría sumar siete filas de memoria.
  assert.match(ops, /function pintarAnillo/);
  assert.match(ops, /dashx-ops-anillo/);
  assert.match(index, /id="dashx-ops-anillo"/);
});


/* ── v3/v4: totales de tabla y combustible filtrable ───────────────────── */

const sqlV4 = fs.readFileSync(
  'migrations/20260919180000_dashboard_operaciones_cierres_v4.sql', 'utf8');

test('las tablas cierran con una fila de totales', () => {
  // Los KPI de arriba repetían el volumen del período. El total al pie del
  // cuadro dice el mismo número y además de qué se compone.
  assert.match(charts, /function totalDe/);
  assert.match(charts, /<tfoot><tr class="auxtb-total">/);
  assert.ok(!ops.includes('dashx-ops-metrics'), 'volvió la fila de KPI de arriba');
  assert.ok(!index.includes('dashx-ops-metrics'), 'quedó el contenedor de los KPI');
  // Las dos tablas suman sus columnas de volumen.
  ['km', 'servicios', 'jornadas'].forEach(c =>
    assert.ok((ops.match(new RegExp("clave: '" + c + "'[^}]*total: 'suma'", 'g')) || []).length === 2,
      `${c} no cierra en las dos tablas`));
  assert.match(ops, /clave: 'litros'[^}]*total: 'suma'/);
  assert.match(ops, /clave: 'costo'[^}]*total: 'suma'/);
});

test('las razones del pie son razones, no promedios de la columna', () => {
  // Promediar km/litro de siete camiones le da el mismo peso al que hizo 9.700
  // km que al que hizo 446.
  assert.match(ops, /total: \{ dividir: 'km', por: 'litros' \}/);
  // Y el denominador es el mismo que usa cada fila: las jornadas con horario
  // utilizable. Con 'jornadas' a secas el pie decía 12,2 contra el 12,7 de la
  // razón de arriba, que es el mismo número con otro divisor.
  assert.match(ops, /total: \{ dividir: 'horas', por: 'jornadas_con_horas' \}/);
  assert.match(sqlV4, /'jornadas_con_horas', x\.jornadas_con_horas/);
  assert.match(charts, /abajo > 0 \? arriba \/ abajo : null/);
});

test('tachar un medio de pago recalcula sólo lo que se puede recalcular', () => {
  // Litros, ticket y precio salen de las cargas: se recalculan.
  // Km/litro, litros cada 100 km y costo por km dividen por kilómetros, y los
  // km no son de ningún medio de pago: filtrar a "Efectivo" dejaría el
  // denominador entero de la flota contra cinco cargas.
  assert.match(ops, /function pintarRazonesCombustible/);
  assert.match(ops, /alFiltrar: function \(visibles\)/);
  assert.match(charts, /function alTocarLeyenda/);
  assert.match(charts, /chart\.toggleDataVisibility\(item\.index\)/);
  const razones = ops.slice(ops.indexOf('function pintarRazonesCombustible'),
                            ops.indexOf('function pintarCombustible'));
  // Las tres de kilómetros siguen leyendo el payload, no la selección.
  ['km_por_litro', 'litros_por_100km', 'costo_por_km'].forEach(k =>
    assert.ok(razones.includes('c.' + k), `${k} se recalcularía con el filtro`));
  assert.match(razones, /is-no-filtrable/);
  assert.match(css, /#screen-dashboard \.dashx-metric\.is-no-filtrable/);
  // Y una carga nueva arranca con todo visible.
  assert.match(ops, /combustible\.visibles = null/);
});

test('el gráfico de combustible es torta, para no repetir la forma del anillo', () => {
  assert.match(ops, /tipo: 'torta'/);
  assert.match(charts, /datos\.tipo\) === 'torta' \? 0 : '62%'/);
  // El anillo de participación sigue siendo anillo.
  const anillo = ops.slice(ops.indexOf('function pintarAnillo'),
                           ops.indexOf('/* ── combustible'));
  assert.ok(!anillo.includes("tipo: 'torta'"));
});

test('el agrupado de medios mantiene el gráfico y los números en las mismas filas', () => {
  // G.topN devuelve {label, value}: alcanzaría para el gráfico, pero después no
  // se podrían sumar litros ni cargas de lo que quedó visible.
  assert.match(ops, /function agruparMedios/);
  const agrupar = ops.slice(ops.indexOf('function agruparMedios'),
                            ops.indexOf('function pintarRazonesCombustible'));
  assert.ok(!agrupar.includes('G.topN'), 'agruparMedios perdería litros y cargas');
  assert.match(agrupar, /medio: 'Otros'/);
  assert.match(agrupar, /G\.PALETA\.length/);
});

test('los servicios que no cuelgan de nadie se avisan', () => {
  // 622 en el período, 620 en la tabla por camión, 621 en la por chofer. Los
  // tres están bien; sin decir por qué difieren, la fila de totales parece un
  // bug.
  assert.match(ops, /' sin camión'/);
  assert.match(ops, /' sin chofer'/);
  assert.match(sqlV4, /'servicios_sin_chofer'/);
  assert.match(sqlV4, /not exists \(select 1 from jornada j where j\.driver_id = s\.driver_id\)/);
});
