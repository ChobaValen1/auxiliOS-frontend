const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const charts = fs.readFileSync('dashboard-charts-v1.js', 'utf8');
const shell = fs.readFileSync('dashboard-shell-v1.js', 'utf8');
const css = fs.readFileSync('dashboard-v1.css', 'utf8');
const index = fs.readFileSync('Index.html', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');
const migracion = fs.readFileSync(
  'migrations/20260918160000_dashboard_analytics_base_v1.sql', 'utf8');

test('la paleta categórica es la validada y no se cicla sola', () => {
  // Estos hex pasaron los cinco checks (banda de luminosidad, croma, separación
  // CVD, piso de visión normal y contraste) contra la superficie #191d27.
  // Cambiar uno obliga a volver a correr el validador.
  ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9']
    .forEach(hex => assert.ok(charts.includes(hex), `falta el slot ${hex}`));
  // La cola larga se agrupa en "Otros" en vez de generar un hue nuevo.
  assert.match(charts, /function topN/);
  assert.match(charts, /'Otros'/);
});

test('los colores de estado están separados de la paleta de series', () => {
  assert.match(charts, /ESTADO\s*=\s*\{/);
  ['ok', 'aviso', 'critico'].forEach(k =>
    assert.match(charts, new RegExp(k + ':')));
  // Ningún color de estado puede aparecer dentro del array categórico.
  const cat = charts.match(/CATEGORICA\s*=\s*\[([\s\S]*?)\]/)[1];
  ['#27c47a', '#f5a623', '#e2504a'].forEach(hex =>
    assert.ok(!cat.includes(hex), `${hex} es color de estado y está usado como serie`));
});

test('los gráficos degradan sin romper cuando la CDN no cargó', () => {
  assert.match(charts, /typeof global\.Chart !== 'undefined'/);
  assert.match(charts, /Gráficos no disponibles sin conexión/);
  // El treemap cae a barras si el plugin no está registrado.
  assert.match(charts, /if \(!registrado\)/);
});

test('cada gráfico se destruye antes de volver a montarse', () => {
  assert.match(charts, /function destruir/);
  assert.match(charts, /instancias\[key\]\.destroy\(\)/);
  assert.match(charts, /limpiarOverlay\(id\);\s*destruir\(id\);/);
});

test('el shell coalesce las recargas en vuelo', () => {
  // Sin esto, tocar dos filtros rápido deja el filtro nuevo con los datos viejos.
  assert.match(shell, /recargaPendiente\s*=\s*true/);
  assert.match(shell, /if \(recargaPendiente\)/);
  assert.match(shell, /recargaPendiente\s*=\s*false;\s*\n\s*\/\/[^\n]*\n\s*recargar\(\)/);
  // El overlay no se apaga entre la carga en vuelo y la coalescida.
  const fin = shell.match(/} finally \{([\s\S]*?)\n  \}/)[1];
  const apaga = fin.indexOf('setCargando(false)');
  const recarga = fin.indexOf('recargar()');
  assert.ok(recarga < apaga, 'el overlay se apaga antes de la recarga coalescida');
});

test('el overlay de carga cubre los datos pero no los filtros', () => {
  assert.match(css, /#screen-dashboard \.dashx-loading/);
  assert.match(css, /#screen-dashboard \.dashx-body\s*\{[^}]*position:\s*relative/);
  // El selector de período vive fuera de los .dashx-body.
  const vista = index.match(/id="dash-view-analitica"([\s\S]*?)<div id="dash-view-alertas"/)[1];
  const periodos = vista.indexOf('dashx-periodos');
  const primerBody = vista.indexOf('dashx-body');
  assert.ok(periodos < primerBody, 'los filtros de período quedaron dentro del área tapada');
});

test('todo el CSS del dashboard está scopeado', () => {
  const reglas = css.split('}')
    .map(b => b.split('{')[0].trim())
    .filter(s => s && !s.startsWith('@') && !s.startsWith('/*') && !/^\s*to\s*$/.test(s));
  reglas.forEach(sel => {
    assert.ok(sel.includes('#screen-dashboard'),
      `selector sin scopear, puede pisar otras pantallas: '${sel}'`);
  });
});

test('las tres secciones tienen contenedor y overlay propios', () => {
  ['facturacion', 'operaciones', 'flota'].forEach(id => {
    assert.ok(index.includes(`id="dashx-sec-${id}"`), `falta el contenedor de ${id}`);
    assert.ok(index.includes(`id="dashx-loading-${id}"`), `falta el overlay de ${id}`);
  });
});

test('los canvas y tablas que consumen las secciones existen en el markup', () => {
  ['dashx-fact-donut', 'dashx-fact-cajas', 'dashx-fact-bases',
   'dashx-ops-tendencia', 'dashx-flota-estado']
    .forEach(id => assert.ok(index.includes(`id="${id}"`), `falta el canvas ${id}`));
  // Operaciones pasó de cuatro gráficos de barras a dos tablas: son varias
  // medidas sobre pocas filas, y así se comparan sin cruzar dos gráficos.
  ['dashx-ops-tabla-camiones', 'dashx-ops-tabla-choferes']
    .forEach(id => assert.ok(index.includes(`id="${id}"`), `falta la tabla ${id}`));
});

test('el plugin de treemap y los módulos del dashboard están cargados', () => {
  assert.match(index, /chartjs-chart-treemap@[\d.]+/);
  assert.match(index, /<script src="dashboard-charts-v1\.js(\?v=[^"]*)?" defer><\/script>/);
  assert.match(index, /<script src="dashboard-shell-v1\.js(\?v=[^"]*)?" defer><\/script>/);
  assert.match(index, /<link rel="stylesheet" href="dashboard-v1\.css(\?v=[^"]*)?">/);
  // El motor debe cargarse antes del shell.
  assert.ok(index.indexOf('dashboard-charts-v1.js') < index.indexOf('dashboard-shell-v1.js'));
});

test('la vista se monta recién al abrirla', () => {
  // Montar un canvas oculto lo deja con tamaño cero.
  assert.match(sigma, /vista === 'analitica'/);
  assert.match(sigma, /function _cargarViewAnalitica/);
  assert.match(sigma, /_dashxIniciado/);
  assert.match(sigma, /function dashxPeriodo/);
});

test('la migración agrega la zona sin backfill y deja índices utilizables', () => {
  ['origin_province', 'origin_locality', 'destination_province', 'destination_locality']
    .forEach(col => assert.ok(migracion.includes(col), `falta la columna ${col}`));
  assert.match(migracion, /add column if not exists/);
  assert.match(migracion, /create index if not exists operator_services_origin_province_idx/);
  assert.match(migracion, /create index if not exists operator_services_origin_coords_idx/);
  // Convenciones del repo para funciones.
  assert.match(migracion, /set search_path=''/);
  assert.match(migracion, /revoke all on function .* from public, anon/);
  assert.match(migracion, /grant execute on function .* to authenticated, service_role/);
});

test('el fallback de provincia toma el último componente, no el penúltimo', () => {
  // Sacado ", Argentina", la provincia queda última. Tomar el penúltimo devolvía
  // la localidad (Luján de Cuyo en vez de Mendoza).
  assert.match(migracion, /partes\[array_length\(partes, 1\)\]/);
  assert.ok(!/array_length\(partes, 1\) - 1/.test(migracion),
    'volvió el índice penúltimo, que devuelve la localidad');
  // Google antepone el CPA en algunas direcciones.
  assert.match(migracion, /\[A-Za-z\]\?\\d\{4\}/);
});

test('Panel es una sola página con pestañas entre las tres secciones', () => {
  ['facturacion', 'operaciones', 'flota'].forEach(sec =>
    assert.ok(index.includes(`dashxSeccion('${sec}'`), `falta la pestaña de ${sec}`));
  assert.match(sigma, /function dashxSeccion/);
  assert.match(shell, /function mostrarSeccion/);
});

test('sólo se carga y se pinta la sección visible', () => {
  // Montar un gráfico en un contenedor oculto lo deja con tamaño cero, así que
  // la sección se carga recién cuando se muestra.
  assert.match(shell, /secciones\.filter\(esVisible\)/);
  assert.match(shell, /function esVisible/);
  assert.match(shell, /cont\.hidden = \(grupoDe\(s\) !== activa\)/);
});

test('el mapa se carga con la pestaña de Facturación, no como una propia', () => {
  // Vive dentro de ese recuadro: como pestaña separada quedaría huérfano.
  const mapa = fs.readFileSync('dashboard-mapa-v1.js', 'utf8');
  assert.match(mapa, /grupo: 'facturacion'/);
  assert.match(shell, /function grupoDe/);
  assert.ok(!index.includes("dashxSeccion('mapa'"), 'el mapa no debe tener pestaña propia');
});
