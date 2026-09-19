'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const js = fs.readFileSync('dashboard-facturacion-v1.js', 'utf8');
const sql = fs.readFileSync(
  'migrations/20260918170000_dashboard_facturacion_rpc_v1.sql', 'utf8');
const index = fs.readFileSync('Index.html', 'utf8');
const css = fs.readFileSync('dashboard-v1.css', 'utf8');
const charts = fs.readFileSync('dashboard-charts-v1.js', 'utf8');
const sqlV2 = fs.readFileSync(
  'migrations/20260919200000_dashboard_facturacion_catalogo_v2.sql', 'utf8');

/* Varias aserciones son sobre lo que el código HACE, no sobre lo que los
   comentarios explican: los comentarios de estos dos archivos nombran a propósito
   lo que NO hay que hacer ("nunca $0", "no el route_distance_meters de Google"). */
const jsCodigo = js
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const sqlCodigo = sql
  .split('\n')
  .filter(l => !l.trim().startsWith('--'))
  .join('\n');

/* ── contrato con el shell y con el motor de gráficos ───────────────────── */

test('la sección se registra en el shell y no le maneja el estado', () => {
  assert.match(js, /AuxDash\.registrarSeccion\(/);
  assert.match(js, /id:\s*'facturacion'/);
  ['montar', 'cargar', 'alError'].forEach(k =>
    assert.match(js, new RegExp(k + ':\\s*' + k)));
  // El overlay, el coalescing y el logueo de errores son del shell: si la
  // sección los reimplementa, se pisan.
  assert.doesNotMatch(js, /setCargando|recargaPendiente|dashx-loading/);
});

test('los colores salen siempre del motor, nunca hardcodeados', () => {
  assert.doesNotMatch(js, /#[0-9a-fA-F]{6}\b/,
    'hay un hex propio: la paleta validada vive en dashboard-charts-v1.js');
  // Todo lo que dibuja pasa por el motor: ni un color ni un formato propio.
  ['donut', 'treemap', 'tabla'].forEach(f =>
    assert.match(js, new RegExp('(g|ch\\(\\))\\.' + f + '\\('), `no usa el ${f} del motor`));
  // ESTADO.ok/aviso/critico está reservado para semántica de estado.
  assert.doesNotMatch(js, /ESTADO\./);
});

test('la cola larga se agrupa en Otros y no pasa de los 7 slots de la paleta', () => {
  assert.match(js, /MAX_CATEGORIAS\s*=\s*7/);
  assert.match(js, /topN\(items,\s*MAX_CATEGORIAS\)/);
  // topN() sólo sabe de `value`: la fila "Otros" se queda sin km si no se le
  // devuelven los del resto.
  assert.match(js, /i\.km === undefined/);
});

/* ── el estado vacío, que es el que se va a ver hasta el 1/10 ───────────── */

test('con el dataset vacío no se pinta ningún cero como si fuera un dato', () => {
  // La señal es la cantidad de servicios, no el monto: un servicio bonificado
  // factura $0, pero cero servicios no es un total que se pueda mostrar.
  assert.match(js, /hayDatos:\s*num\(t\.servicios\) > 0/);
  assert.match(js, /GUION\s*=\s*'—'/);
  // Ni "$0" ni "0%" escritos en ningún lado.
  assert.doesNotMatch(jsCodigo, /\$0\b/);
  assert.doesNotMatch(jsCodigo, /\b0%/);
  // Todo pintor mira hayDatos antes de formatear un número.
  ['pintarKpis', 'pintarGraficos', 'pintarConceptos'].forEach(fn => {
    const i = js.indexOf('function ' + fn);
    assert.ok(i > -1, `falta ${fn}`);
    const cuerpo = js.slice(i, i + 1600);
    assert.match(cuerpo, /hayDatos/, `${fn} no contempla el dataset vacío`);
  });
});

test('cada gráfico vacío explica que faltan servicios y qué va a mostrar', () => {
  ['VACIO_DONUT', 'VACIO_CAJAS', 'VACIO_BASES'].forEach(k => {
    const msg = js.match(new RegExp(k + "\\s*=\\s*'([^']+)'"));
    assert.ok(msg, `falta el mensaje ${k}`);
    assert.match(msg[1], /Todavía no hay servicios cargados/,
      `${k} no aclara que los servicios todavía no se cargaron`);
    assert.match(msg[1], /Acá va a verse/,
      `${k} no dice qué va a aparecer cuando lleguen los datos`);
  });
  // Y se pintan con el estado vacío del motor, no con un gráfico en cero.
  assert.match(js, /g\.vacio\(CV_DONUT, VACIO_DONUT\)/);
  assert.match(js, /g\.vacio\(CV_CAJAS, VACIO_CAJAS\)/);
  // Bases dejó de ser un canvas: su vacío lo dibuja la tabla, con el mismo texto.
  assert.match(js, /g\.tabla\(CV_BASES, \{ vacio: VACIO_BASES/);
});

test('una respuesta nula o a medio llenar no rompe el pintado', () => {
  // normalizar() es el colchón: null, {} o arrays ausentes salen como estado
  // vacío, nunca como una excepción arriba del dashboard.
  assert.match(js, /function normalizar/);
  assert.match(js, /d && typeof d === 'object' \? d : \{\}/);
  assert.match(js, /function lista\(v\) \{ return Array\.isArray\(v\) \? v : \[\]; \}/);
  assert.match(js, /function num\(v\)/);
  assert.match(js, /isFinite\(n\) \? n : 0/);
  // El esqueleto se pinta en montar(), antes de la primera respuesta.
  assert.match(js, /function montar\(\)[\s\S]*?pintarKpis\(normalizar\(null\)\)/);
});

test('si la RPC todavía no existe en la base, la sección lo dice', () => {
  // Estado real mientras la migración no esté aplicada: mejor un mensaje que un
  // gráfico roto.
  assert.match(js, /PGRST202/);
  assert.match(js, /todavía no están disponibles en la base/);
  assert.match(js, /function alError/);
});

/* ── comparativo ────────────────────────────────────────────────────────── */

test('el comparativo no inventa porcentajes sin período anterior', () => {
  // Un "+100%" contra cero no informa nada.
  assert.match(js, /if \(prev <= 0\)/);
  assert.match(js, /Sin período anterior para comparar/);
});

test('el delta se lee sin depender del color', () => {
  assert.match(js, /▲/);
  assert.match(js, /▼/);
  assert.match(js, /vs\. período anterior/);
  // Verde/rojo sólo donde subir es bueno. Más peajes o más km no es de por sí
  // ni bueno ni malo: van en gris.
  assert.match(js, /delta\(d\.totales\.facturado, d\.anterior\.facturado, true/);
  assert.match(js, /delta\(d\.totales\.peajes, d\.anterior\.peajes, false/);
  assert.match(js, /delta\(d\.totales\.km, d\.anterior\.km, false/);
});

/* ── KM facturados: el usuario los mira tanto como la plata ─────────────── */

test('los KM facturados se ven, no quedan escondidos', () => {
  // Uno de los KPI de la columna...
  assert.match(js, /kpi\('KM facturados', nfKm\(d\.totales\.km\), true/);
  assert.match(js, /function nfKm/);
  assert.match(js, /' km'/);
  // ...y además por concepto, en la tabla pegada al treemap: ahí se ve cuántos
  // km factura cada tipo de servicio, que es lo que el treemap no dice.
  assert.match(js, /function pintarConceptos/);
  const conc = js.slice(js.indexOf('function pintarConceptos'),
                        js.indexOf('function pintarGraficos'));
  ["clave: 'servicios'", "clave: 'km'", "clave: 'monto'"].forEach(c =>
    assert.ok(conc.includes(c), `la tabla de conceptos no trae ${c}`));
  assert.ok(index.includes('id="dashx-fact-conceptos"'));
});

test('la tabla de conceptos se lee junto al treemap, no aparte', () => {
  // Mismo orden y mismo color que las cajas: si no, son dos listas del mismo
  // dato que hay que emparejar de memoria.
  const conc = js.slice(js.indexOf('function pintarConceptos'),
                        js.indexOf('function pintarGraficos'));
  assert.match(conc, /swatch: true/);
  assert.match(charts, /col\.swatch && indice != null/);
  assert.match(css, /#screen-dashboard \.auxtb \.auxtb-chip/);
  // Y sin fila de totales: servicios y km ya están en la columna de KPI.
  assert.ok(!conc.includes("total: 'suma'"),
    'la tabla de conceptos repite un total que ya está en los KPI');
  // Va pegada al gráfico, separada por una línea y no por otra tarjeta.
  assert.match(css, /#screen-dashboard \.dashx-tabla-pegada/);
});

test('la fila de la grilla de Facturación cubre las doce columnas', () => {
  // cajas(7) + bases(5). Antes eran 5 + 4 y quedaba un hueco de tres columnas.
  const span = k => Number(css.match(
    new RegExp('#screen-dashboard \\.dashx-' + k + '\\s*\\{\\s*grid-column: span (\\d+)'))[1]);
  assert.equal(span('cajas') + span('bases'), 12);
  assert.equal(span('kpis') + span('donut') + span('mapa'), 12);
});

test('prestadora, base y fecha son los filtros de la sección', () => {
  assert.match(js, /function montarFiltros/);
  assert.match(js, /ID_FILT\s*=\s*'dashx-fact-filtros'/);
  assert.match(js, /filtros: ID_FILT/);
  assert.ok(index.includes('id="dashx-fact-filtros" hidden'));
  ['dashx-fact-f-empresa', 'dashx-fact-f-base'].forEach(id =>
    assert.ok(js.includes(id), `falta el combo ${id}`));
  assert.match(js, /setFiltro\(par\[1\], sel\.value \? \[sel\.value\] : \[\]\)/);
  // Reconstruir el <select> en cada recarga le borraría la selección al usuario
  // justo después de elegirla.
  assert.match(js, /firmaCatalogo\[clave\] !== firma/);
  // Y el catálogo viene de la RPC, que sigue siendo una sola llamada.
  assert.match(js, /catalogo: \{/);
  assert.match(sqlV2, /'catalogo', jsonb_build_object/);
});

test('el catálogo de los filtros no se filtra a sí mismo', () => {
  // Si se filtrara por los filtros activos, elegir una prestadora borraría las
  // demás del combo y no habría forma de volver.
  assert.match(sqlV2, /from public\.companies co/);
  assert.match(sqlV2, /from public\.billing_bases bb/);
  // Y sale de las tablas maestras, no de los servicios: con operator_services
  // vacía los combos tienen que funcionar igual desde el primer día.
  const cat = sqlV2.slice(sqlV2.indexOf("'catalogo'"), sqlV2.indexOf('into v_out'));
  assert.ok(!/from base b\b(?![\s\S]{0,80}exists)/.test(cat.replace(/exists \(select 1 from base b/g, '')),
    'el catálogo sale de los servicios del período');
});

test('el desglose por bases responde si una base factura más por volumen o por precio', () => {
  // Los totales solos no distinguen una cosa de la otra.
  const graf = js.slice(js.indexOf('function pintarGraficos'), js.indexOf('function pintar('));
  assert.match(graf, /clave: 'ticket'/);
  assert.match(graf, /clave: 'kmServicio'/);
  // Promedios por fila con guarda: una base sin servicios no divide por cero.
  assert.match(js, /i\.ticket = i\.servicios > 0 \? i\.monto \/ i\.servicios : null/);
  // Y el cierre divide los totales entre sí, que no es promediar la columna.
  assert.match(graf, /total: \{ dividir: 'value', por: 'servicios' \}/);
  // La barra de participación da lo que la tabla no muestra de un vistazo.
  assert.match(graf, /g\.barraParticipacion\(CV_PART/);
  assert.match(charts, /function barraParticipacion/);
  assert.match(charts, /indexAxis: 'y'/);
  assert.match(charts, /x: \{ stacked: true, display: false/);
});

/* ── datos ─────────────────────────────────────────────────────────────── */

test('todo el agregado lo hace la RPC: el frontend no consulta tablas', () => {
  assert.match(js, /RPC\s*=\s*'dashboard_facturacion_v1'/);
  assert.match(js, /db\.rpc\(RPC, \{/);
  ['p_desde', 'p_hasta', 'p_empresas', 'p_bases', 'p_conceptos'].forEach(p =>
    assert.match(js, new RegExp(p + ':')));
  const llamadas = js.match(/\.rpc\(/g) || [];
  assert.equal(llamadas.length, 1, 'la sección debería resolverse con una sola RPC');
  // Nada de traer filas crudas y sumarlas acá.
  assert.doesNotMatch(js, /\.from\(|\.select\(/);
  assert.match(js, /global\._db/);
});

test('los nombres que vienen de la base se escapan antes de ir al DOM', () => {
  assert.match(js, /function esc\(v\)/);
  assert.match(js, /replace\(\/</);
  assert.match(js, /esc\(label\)/);
  assert.match(js, /esc\(msg\)/);
  // Las filas de las tablas las escapa el motor, que es donde se arma el HTML.
  const charts = fs.readFileSync('dashboard-charts-v1.js', 'utf8');
  assert.match(charts, /function escapar/);
  assert.match(charts, /escapar\(vacia \? '—' : v\)/);
});

/* ── migración ─────────────────────────────────────────────────────────── */

test('la RPC sigue las convenciones de funciones del repo', () => {
  assert.match(sql, /create or replace function public\.dashboard_facturacion_v1\(/);
  ['p_desde date', 'p_hasta date', 'p_empresas uuid\\[\\]', 'p_bases uuid\\[\\]',
   'p_conceptos uuid\\[\\]'].forEach(p =>
    assert.match(sql, new RegExp(p)));
  assert.match(sql, /returns jsonb/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path=''/);
  assert.match(sql, /app_private\.current_auxilios_role\(\)/);
  assert.match(sql, /revoke all on function public\.dashboard_facturacion_v1[^;]*from public, anon;/);
  assert.match(sql, /grant execute on function public\.dashboard_facturacion_v1[^;]*to authenticated, service_role;/);
  // search_path='' obliga a calificar todo con su esquema.
  assert.doesNotMatch(sql, /from operator_services|join companies|join billing_bases/);
});

test('facturación la ven administración, facturación y supervisión', () => {
  const chequeo = sql.match(/v_role not in \(([^)]*)\)/);
  assert.ok(chequeo, 'falta el chequeo de rol');
  ['administracion', 'facturacion', 'supervision'].forEach(r =>
    assert.ok(chequeo[1].includes(`'${r}'`), `${r} debería poder leer facturación`));
  ['chofer', 'operador'].forEach(r =>
    assert.ok(!chequeo[1].includes(`'${r}'`), `${r} no debería ver facturación`));
  assert.match(sql, /raise exception 'Sin permiso/);
});

test('la RPC excluye siempre pruebas y cancelados', () => {
  assert.match(sql, /s\.is_test = false/);
  assert.match(sql, /s\.status <> 'cancelled'/);
  // El índice parcial se escribe igual que el WHERE, si no el planner no lo usa.
  assert.match(sql, /create index if not exists operator_services_facturacion_periodo_idx/);
  assert.match(sql, /where is_test = false and status <> 'cancelled'/);
});

test('el período anterior tiene exactamente la misma duración', () => {
  assert.match(sql, /v_dias\s*:=\s*\(v_hasta - v_desde\) \+ 1;/);
  assert.match(sql, /v_prev_hasta\s*:=\s*v_desde - 1;/);
  assert.match(sql, /v_prev_desde\s*:=\s*v_desde - v_dias;/);
  // Un solo barrido para los dos períodos: se etiqueta cada fila con su tramo.
  assert.match(sql, /then 'actual'/);
  assert.match(sql, /else 'anterior'/);
});

test('la RPC devuelve los totales, el comparativo y los tres cortes', () => {
  ['facturado', 'peajes', 'km', 'servicios'].forEach(k =>
    assert.match(sql, new RegExp("'" + k + "',")));
  assert.match(sql, /'totales', jsonb_build_object/);
  assert.match(sql, /'anterior', jsonb_build_object/);
  ['por_empresa', 'por_concepto', 'por_base'].forEach(k => {
    assert.match(sql, new RegExp("'" + k + "', coalesce\\("));
    assert.ok(sql.includes("'[]'::jsonb"), 'los cortes vacíos deben salir como []');
  });
  ['id', 'nombre', 'monto', 'servicios', 'km'].forEach(k =>
    assert.match(sql, new RegExp("'" + k + "',\\s+g\\.|'" + k + "',\\s+round\\(g\\.")));
  // hay_datos es lo que le permite a la UI distinguir "sin servicios cargados"
  // de "el período cerró en cero".
  assert.match(sql, /'hay_datos',\s+t\.n_act > 0/);
});

test('la fecha del servicio se lee en hora argentina y el km es el facturado', () => {
  assert.match(sql, /at time zone 'America\/Argentina\/Buenos_Aires'/);
  // KM facturados = asfalto + ripio, con estimated_distance_km de respaldo.
  assert.match(sql, /coalesce\(s\.estimated_asphalt_km, 0\) \+ coalesce\(s\.estimated_gravel_km, 0\)/);
  assert.match(sql, /else coalesce\(s\.estimated_distance_km, 0\)/);
  // No es el km que midió Google.
  assert.doesNotMatch(sqlCodigo, /route_distance_meters/);
  // El monto facturado es el que se le cobra a la prestadora.
  assert.match(sql, /coalesce\(s\.company_estimated_total, 0\)/);
});

/* ── integración ───────────────────────────────────────────────────────── */

test('el módulo se carga después del motor y del shell', () => {
  // Index.html es de otro trabajo: acá sólo se verifica el orden SI el script
  // ya está declarado. El módulo igual se registra tarde (DOMContentLoaded) si
  // alguna vez quedara antes que el shell.
  const tag = index.indexOf('dashboard-facturacion-v1.js');
  if (tag >= 0) {
    assert.match(index, /<script src="dashboard-facturacion-v1\.js(\?v=[^"]*)?" defer><\/script>/);
    assert.ok(index.indexOf('dashboard-charts-v1.js') < tag, 'el motor tiene que cargar antes');
    assert.ok(index.indexOf('dashboard-shell-v1.js') < tag, 'el shell tiene que cargar antes');
  }
  assert.match(js, /document\.addEventListener\('DOMContentLoaded', registrar/);
  // Los nodos que la sección llena existen en el markup.
  ['dashx-fact-kpis', 'dashx-fact-sub', 'dashx-fact-donut', 'dashx-fact-cajas',
   'dashx-fact-bases'].forEach(id =>
    assert.ok(index.includes(`id="${id}"`), `falta ${id} en el markup`));
  // El mapa lo llena otro trabajo: esta sección no lo toca.
  assert.doesNotMatch(js, /dashx-fact-mapa/);
});


/* ── v3: KM reales ──────────────────────────────────────────────────────── */

const sqlV3 = fs.readFileSync(
  'migrations/20260919220000_dashboard_facturacion_km_reales_v3.sql', 'utf8');
const sqlV5 = fs.readFileSync(
  'migrations/20260919250000_dashboard_facturacion_sin_margen_v5.sql', 'utf8');

test('km_reales <= 0 es "no informado", no "cero kilómetros"', () => {
  assert.match(sqlV3, /case when coalesce\(r\.km_reales, 0\) > 0 then r\.km_reales end/);
});

test('la tarjeta de KM reales dice sobre cuántos servicios está el dato', () => {
  // Un número sobre 3 de 200 servicios no se lee igual que uno sobre 190.
  assert.match(js, /function kpiReales/);
  assert.match(js, /' de ' \+ ch\(\)\.nfMiles\(x\.servicios\)/);
  assert.match(js, /Ningún servicio del período tiene km informados ni ruta calculada/);
  assert.match(sqlV5, /'servicios_con_dato',  t\.n_comp_act/);
});

test('la tarjeta distingue lo medido de lo calculado', () => {
  // Un dato tomado en la calle y uno estimado por Google no valen igual.
  assert.match(js, /informados por el chofer/);
  assert.match(js, /calculados de la ruta/);
  assert.match(sqlV5, /'medidos',             t\.n_medido/);
  assert.match(sqlV5, /'calculados',          t\.n_calculado/);
});

/* ── v5: no se publica ninguna razón entre facturado y real ─────────────────

   La flota NO sale de la base: los tramos Base→Origen y Destino→Base son el
   método de cobro, no un recorrido. Dividir km facturados por km reales mide la
   fórmula de facturación, no el rendimiento, y con datos reales daba 240,9%.

   Estos tests existen para que nadie la reponga sin volver a pensarla. */

test('ni el SQL ni el front calculan un margen', () => {
  assert.doesNotMatch(sqlV5, /'margen'/);
  assert.doesNotMatch(sqlV5, /'margen_anterior'/);
  assert.doesNotMatch(sqlV5, /'km_comparable'/);
  assert.doesNotMatch(sqlV5, /'km_facturados'/);
  // En el front no queda ni el cálculo ni la columna ni el dato que la alimenta.
  assert.doesNotMatch(js, /i\.margen\s*=/);
  assert.doesNotMatch(js, /clave: 'margen'/);
  assert.doesNotMatch(js, /kmComparable/);
});

test('los km reales se siguen publicando crudos', () => {
  // Sacar la razón no puede llevarse puesto el número, que sí es verificable.
  assert.match(sqlV5, /'km_reales',           round\(t\.kr_act, 2\)/);
  assert.match(js, /kpi\('KM reales', nfKm\(x\.km\), false, pie\)/);
});


/* ── v4: los km de Origen a Destino salen de la ruta guardada ───────────── */

const sqlV4 = fs.readFileSync(
  'migrations/20260919240000_dashboard_facturacion_km_ruta_v4.sql', 'utf8');

test('el tramo Origen→Destino se deduce de la cantidad de tramos', () => {
  /* base_origin_destination_base deja 3 tramos y el del medio es Origen→Destino;
     origin_destination deja 1 y es ése. El modo no se persiste en el servicio,
     por eso se deduce. */
  assert.match(sqlV4, /jsonb_array_length\(coalesce\(s\.route_legs, '\[\]'::jsonb\)\) = 3/);
  assert.match(sqlV4, /s\.route_legs -> 1 ->> 'distanceMeters'/);
  // Con un solo tramo hay ambigüedad: sin destino cargado, ese tramo sólo puede
  // ser Base→Origen y no sirve como Origen→Destino.
  assert.match(sqlV4, /= 1\s*\n\s*and s\.destination_lat is not null/);
  assert.match(sqlV4, /s\.route_legs -> 0 ->> 'distanceMeters'/);
  // Lo medido por el chofer manda sobre lo calculado.
  assert.match(sqlV4, /coalesce\(\s*\n\s*case when coalesce\(r\.km_reales, 0\) > 0/);
});

test('la tarjeta distingue lo medido de lo calculado', () => {
  // Un dato medido en la calle y uno estimado por Google no valen igual.
  assert.match(sqlV4, /'medidos',             t\.n_medido/);
  assert.match(sqlV4, /'calculados',          t\.n_calculado/);
  assert.match(js, /informados por el chofer/);
  assert.match(js, /calculados de la ruta/);
  assert.match(js, /x\.calculados && !x\.medidos/);
});
