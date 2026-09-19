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
  const vista = index.match(/id="dash-view-analitica"([\s\S]*?)id="screen-registro"/)[1];
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
  ['dashx-fact-cajas', 'dashx-fact-bases',
   'dashx-ops-tendencia', 'dashx-ops-anillo', 'dashx-ops-combustible',
   'dashx-flota-estado']
    .forEach(id => assert.ok(index.includes(`id="${id}"`), `falta el canvas ${id}`));
  /* Facturación pasó de un anillo de prestadoras a una tabla que se abre: para
     dos o tres prestadoras el anillo gastaba media pantalla en un reparto que
     se lee en dos renglones, y no dejaba lugar para las otras cuatro medidas
     que hay que saber de cada una. */
  ['dashx-fact-empresas']
    .forEach(id => assert.ok(index.includes(`id="${id}"`), `falta la tabla ${id}`));
  // Operaciones pasó de cuatro gráficos de barras a dos tablas: son varias
  // medidas sobre pocas filas, y así se comparan sin cruzar dos gráficos.
  ['dashx-ops-tabla-camiones', 'dashx-ops-tabla-choferes']
    .forEach(id => assert.ok(index.includes(`id="${id}"`), `falta la tabla ${id}`));
});

test('el plugin de treemap y los módulos del dashboard están cargados', () => {
  assert.match(index, /chartjs-chart-treemap@[\d.]+/);
  /* El paquete publica `chartjs-chart-treemap.min.js`. Pedirlo como
     `.umd.min.js` devuelve 404, el plugin no se registra y el treemap se
     dibuja como barras sin que nada falle a la vista: sólo desaparecen los
     cuadrados. Pasó, y por eso el nombre del archivo está clavado acá. */
  assert.match(index, /chartjs-chart-treemap@[\d.]+\/dist\/chartjs-chart-treemap\.min\.js/);
  assert.doesNotMatch(index, /chartjs-chart-treemap[^"]*\.umd\./,
    'ese archivo no existe en el paquete: da 404 y el treemap cae a barras');
  // Y si alguna vez vuelve a no registrarse, que se vea en la consola.
  assert.match(charts, /chartjs-chart-treemap no está registrado/);
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
  assert.match(shell, /function aplicarVisibilidad/);
  assert.match(shell, /cont\.hidden = !visible/);
  // Un solo lugar decide qué se ve: init y mostrarSeccion llaman al mismo.
  assert.equal((shell.match(/aplicarVisibilidad\(\)/g) || []).length, 3);
});

test('los filtros propios de una sección se esconden con ella', () => {
  // Viven en la barra de arriba (fuera del cuerpo, para que el overlay de carga
  // no los tape), así que esconder el cuerpo no alcanza para esconderlos.
  assert.match(shell, /if \(s\.filtros\)/);
  assert.match(shell, /fil\.hidden = !visible/);
  const ops = fs.readFileSync('dashboard-operaciones-v1.js', 'utf8');
  assert.match(ops, /filtros: 'dashx-ops-filtros'/);
  // Arranca oculto: la pestaña inicial es Facturación, que no los usa.
  assert.match(index, /id="dashx-ops-filtros" hidden/);
  // Montar es lo que los crea, así que la visibilidad se aplica después.
  assert.ok(shell.indexOf('montarTodas();') < shell.indexOf('aplicarVisibilidad();\n    return recargar'));
});

test('período, camión y chofer van en la misma fila', () => {
  const vista = index.match(/id="dash-view-analitica"([\s\S]*?)id="screen-registro"/)[1];
  const barra = vista.match(/<div class="dashx-toolbar">([\s\S]*?)\n        <\/div>/);
  assert.ok(barra, 'falta la barra de herramientas');
  assert.ok(barra[1].includes('dashx-periodos'), 'el período quedó fuera de la fila');
  assert.ok(barra[1].includes('dashx-ops-filtros'), 'los selects quedaron fuera de la fila');
  assert.match(css, /#screen-dashboard \.dashx-toolbar \{[^}]*display:\s*flex/);
  // Ya no hay una fila de filtros dentro del cuerpo comiéndose una franja.
  assert.ok(!index.includes('dashx-ops-filtros-fila'));
  assert.ok(!css.includes('dashx-ops-filtros-fila'));
});

test('las barras de pestañas miden lo que ocupan, no el ancho de la pantalla', () => {
  // .filter-tabs trae fondo oscuro: a ancho completo dibujaba una línea negra
  // de lado a lado arriba del tablero.
  const regla = css.match(/#screen-dashboard \.dashx-tabs,\s*\n#screen-dashboard \.dashx-periodos \{([^}]*)\}/);
  assert.ok(regla, 'falta la regla que acota el ancho de las barras');
  assert.match(regla[1], /width:\s*fit-content/);
});

test('la barra de la tabla no se superpone con el número', () => {
  // Iba de fondo y el valor encima: con el máximo la barra llegaba justo hasta
  // las cifras y parecía tocarlas.
  assert.match(charts, /auxtb-track/);
  assert.ok(!/auxtb-fill[^]*?position: absolute/.test(css),
    'la barra volvió a posicionarse encima del número');
  assert.match(css, /#screen-dashboard \.auxtb \.auxtb-cel \{[^}]*display:\s*flex/);
  assert.match(css, /#screen-dashboard \.auxtb \.auxtb-val \{[^}]*flex:\s*0 0 auto/);
});

test('el anillo lleva la leyenda al costado', () => {
  assert.match(charts, /function leyendaBase\(posicion\)/);
  assert.match(charts, /position: posicion \|\| 'bottom'/);
  assert.match(charts, /datos\.leyenda\) === 'derecha' \? 'right' : 'bottom'/);
  const ops = fs.readFileSync('dashboard-operaciones-v1.js', 'utf8');
  assert.equal((ops.match(/leyenda: 'derecha'/g) || []).length, 2);
});

test('Operaciones tiene el bloque de combustible con sus explicaciones', () => {
  assert.ok(index.includes('id="dashx-ops-combustible"'), 'falta el gráfico de medios de pago');
  assert.ok(index.includes('id="dashx-ops-comb-metrics"'), 'faltan las razones de combustible');
  const ops = fs.readFileSync('dashboard-operaciones-v1.js', 'utf8');
  assert.match(ops, /function pintarCombustible/);
  // Cada razón trae su explicación: "12,81" solo no dice si está bien o mal.
  ['Litros cargados', 'Ticket promedio', 'Precio por litro',
   'Km por litro', 'Litros cada 100 km', 'Costo por km']
    .forEach(m => assert.ok(ops.includes(m), `falta la métrica ${m}`));
  assert.match(css, /#screen-dashboard \.dashx-metric-hint/);
  // Los importes por unidad no se redondean a pesos enteros.
  assert.match(ops, /function pesosFinos/);
  assert.match(ops, /pesosFinos\(c\.costo_por_km\)/);
  // No se repiten arriba y abajo: km/litro y costo/km viven en esta tarjeta.
  const razones = ops.match(/razones\.innerHTML =([\s\S]*?);\n/)[1];
  assert.ok(!razones.includes('Km por litro'));
  assert.ok(!razones.includes('Costo por km'));
});

test('la RPC de operaciones devuelve el bloque de combustible', () => {
  const sql = fs.readFileSync(
    'migrations/20260919160000_dashboard_operaciones_combustible_v3.sql', 'utf8');
  ['ticket_promedio', 'precio_litro', 'litros_por_100km', 'costo_por_km', 'por_medio']
    .forEach(k => assert.ok(sql.includes(k), `falta ${k} en el payload`));
  // 'app' no es un medio de pago: el medio es la app (Shell Flota, YPF Ruta…).
  assert.match(sql, /nullif\(btrim\(fr\.payment_app\), ''\)/);
  // El precio por litro se saca del total, no promediando price_per_liter.
  assert.match(sql, /'precio_litro',\s*\n\s*case when totf\.litros > 0 then round\(totf\.costo \/ totf\.litros/);
  assert.match(sql, /set search_path=''/);
  assert.match(sql, /revoke all on function .* from public, anon/);
});

test('el mapa se carga con la pestaña de Facturación, no como una propia', () => {
  // Vive dentro de ese recuadro: como pestaña separada quedaría huérfano.
  const mapa = fs.readFileSync('dashboard-mapa-v1.js', 'utf8');
  assert.match(mapa, /grupo: 'facturacion'/);
  assert.match(shell, /function grupoDe/);
  assert.ok(!index.includes("dashxSeccion('mapa'"), 'el mapa no debe tener pestaña propia');
});

test('el treemap no escribe fuera de su caja', () => {
  // Con el nombre completo siempre, una caja chica mostraba "lque pe" en vez
  // de "Remolque pesado", con el texto saliéndose por los bordes.
  const fmt = charts.slice(charts.indexOf('formatter: function (ctx)'),
                           charts.indexOf('backgroundColor: function (ctx)'));
  assert.match(fmt, /ctx\.raw\.w/);
  assert.match(fmt, /ctx\.raw\.h/);
  assert.match(fmt, /txt\.slice\(0, caben - 1\) \+ '…'/);
  // Y si no entra ni recortado, queda el porcentaje solo: el nombre está en
  // el tooltip.
  assert.match(fmt, /if \(caben < 7\) return pct \+ '%'/);
});

test('las barras de la tabla no empujan una columna fuera del recuadro', () => {
  // Las tarjetas de Facturación son la mitad de anchas que las de Operaciones:
  // el carril cede antes que perderse una columna detrás del scroll.
  assert.match(css, /#screen-dashboard \.auxtb \.auxtb-barra \{[^}]*min-width: 118px/);
  assert.match(css, /@media \(max-width: 1400px\)[\s\S]*?\.dashx-cajas \.auxtb-track/);
  // Y por debajo de 1340 las tarjetas con tabla pasan a ancho completo.
  assert.match(css, /@media \(max-width: 1340px\)[\s\S]*?\.dashx-card-tabla \{\s*\n?\s*grid-column: 1 \/ -1/);
});


/* ── una sola fila de pestañas ──────────────────────────────────────────── */

test('las secciones van en una sola fila, y son tres', () => {
  /* Había dos filas: Análisis/Alertas arriba y las secciones abajo. La de
     arriba tenía una sola opción real, porque Alertas no es una sección del
     panel: no tiene período ni filtros y no se compara con las otras. */
  assert.doesNotMatch(index, /id="dash-ctx-bar"/);
  assert.doesNotMatch(index, /dashCambiarVista\('alertas'/);
  assert.match(index, /<div class="dashx-barra-secciones">/);
  const barra = index.match(/<div class="dashx-barra-secciones">([\s\S]*?)<\/div>\s*<div class="dashx-toolbar">/)[1];
  ['facturacion', 'operaciones', 'flota'].forEach(sec =>
    assert.ok(barra.includes(`data-sec="${sec}"`), `falta la sección ${sec}`));
  assert.equal((barra.match(/data-sec=/g) || []).length, 3, 'tienen que ser tres secciones');
  // Y Alertas en la misma fila, como botón.
  assert.match(barra, /id="dashx-alertas-btn"[\s\S]*?onclick="alxAbrirPanel\(\)"/);
});

test('alertas abre un panel lateral, no una vista', () => {
  assert.doesNotMatch(index, /id="dash-view-alertas"/);
  // Se monta sobre el modal de siempre: hereda fondo, z-index y click afuera.
  assert.match(index, /class="modal-backdrop alx-panel-backdrop" id="alx-panel"/);
  assert.match(index, /role="dialog" aria-modal="true"/);
  assert.match(index, /onclick="if\(event\.target===this\)alxCerrarPanel\(\)"/);
  // El cuerpo de las alertas se mudó entero adentro.
  ['alx-pendientes', 'alx-chips', 'alx-body'].forEach(id =>
    assert.ok(index.includes(`id="${id}"`), `falta ${id} en el panel`));
  const sigma = fs.readFileSync('sigma.js', 'utf8');
  assert.match(sigma, /function alxAbrirPanel/);
  assert.match(sigma, /function alxCerrarPanel/);
  // Escape cierra, como cualquier modal.
  assert.match(sigma, /ev\.key === 'Escape' && alxPanelAbierto\(\)/);
  // Y la campanita abre el panel en vez de navegar al dashboard.
  assert.doesNotMatch(sigma, /_dashVistaActual = 'alertas'/);
});

test('el refresco de alertas mira el panel, no la vista que ya no existe', () => {
  const sigma = fs.readFileSync('sigma.js', 'utf8');
  assert.match(sigma, /if \(alxPanelAbierto\(\)\) _alxRender\(\);/);
  assert.doesNotMatch(sigma, /dash-view-alertas/);
  assert.doesNotMatch(sigma, /dash-ctx-bar/);
});
