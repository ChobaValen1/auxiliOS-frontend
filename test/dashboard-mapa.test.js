const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const mapa = fs.readFileSync('dashboard-mapa-v1.js', 'utf8');
const css = fs.readFileSync('dashboard-v1.css', 'utf8');
const index = fs.readFileSync('Index.html', 'utf8');
const sql = fs.readFileSync(
  'migrations/20260919120000_dashboard_zonas_rpc_v1.sql', 'utf8');
const proxy = fs.readFileSync('supabase/functions/maps-proxy/index.ts', 'utf8');

test('el mapa no mete una API key de Google en el browser', () => {
  // La key vive en maps-proxy, server-side, y hay un test aparte que lo exige.
  // Dibujar el mapa con MapLibre mantiene esa propiedad.
  assert.doesNotMatch(mapa, /AIza[0-9A-Za-z_-]+/);
  assert.doesNotMatch(mapa, /maps\.googleapis\.com/);
  assert.doesNotMatch(index, /maps\.googleapis\.com/);
  // El proxy sigue siendo el único que toca la key.
  assert.match(proxy, /GOOGLE_MAPS_API_KEY/);
});

test('MapLibre se carga perezosamente, no en el arranque de la app', () => {
  // Son ~250 KB: cargarlos siempre penalizaría a quien nunca abre el mapa.
  assert.doesNotMatch(index, /maplibre-gl@\d[^"]*\.js"/);
  assert.match(mapa, /function cargarLibreria/);
  assert.match(mapa, /document\.createElement\('script'\)/);
  // Un fallo de red no puede dejar la promesa cacheada en rechazo para siempre.
  assert.match(mapa, /cargandoLib = null;\s*\n\s*throw e;/);
});

test('la rampa del heatmap es de un solo hue y monótona', () => {
  // Un arcoíris sugeriría categorías distintas en vez de más o menos densidad.
  // Hasta la siguiente propiedad: un [\s\S]*? cortaría en el ] de
  // ['heatmap-density'] en vez de abarcar la rampa entera.
  const rampa = mapa.match(/'heatmap-color':([\s\S]*?)'heatmap-radius'/)[1];
  const colores = rampa.match(/rgba?\([^)]*\)/g) || [];
  assert.ok(colores.length >= 4, 'la rampa debería tener varios pasos');
  // Ningún azul ni verde: todos los pasos con color son del ámbar de la app.
  colores.forEach(c => {
    const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!m) return;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (r === 0 && g === 0 && b === 0) return; // el transparente inicial
    assert.ok(r >= g && g >= b, `paso fuera del hue ámbar: ${c}`);
  });
});

test('el heatmap deja lugar a los puntos al acercar el zoom', () => {
  // A zoom alto interesa el servicio concreto, no la densidad.
  assert.match(mapa, /'heatmap-opacity'/);
  assert.match(mapa, /minzoom:\s*10/);
  assert.match(mapa, /id:\s*'zonas-puntos'/);
});

test('encuadrar tolera un solo punto', () => {
  // fitBounds sobre un bbox degenerado deja el zoom al máximo.
  assert.match(mapa, /min\[0\] === max\[0\] && min\[1\] === max\[1\]/);
  assert.match(mapa, /jumpTo/);
});

test('distingue sin datos de sin ubicación de error', () => {
  assert.match(mapa, /hay_datos/);
  assert.match(mapa, /no tienen ubicación cargada/);
  assert.match(mapa, /Todavía no hay servicios cargados/);
  assert.match(mapa, /mensaje\([^)]*, true\)/);
});

test('se registra en el shell y recibe los filtros', () => {
  assert.match(mapa, /registrarSeccion/);
  assert.match(mapa, /id: 'mapa'/);
  assert.match(mapa, /dashboard_zonas_v1/);
  assert.match(mapa, /p_empresas/);
  assert.match(index, /<script src="dashboard-mapa-v1\.js(\?v=[^"]*)?" defer><\/script>/);
});

test('la RPC agrega del lado del servidor y descarta coordenadas inválidas', () => {
  // Un 0,0 mal cargado pondría un foco de calor en el Atlántico.
  assert.match(sql, /not \(origin_lat = 0 and origin_lng = 0\)/);
  assert.match(sql, /origin_lat between -90 and 90/);
  assert.match(sql, /origin_lng between -180 and 180/);
  // Se agrupa por celda redondeada en vez de mandar una fila por servicio.
  assert.match(sql, /round\(origin_lat::numeric, 3\)/);
  assert.match(sql, /group by 1, 2/);
  assert.match(sql, /is_test = false/);
  assert.match(sql, /status <> 'cancelled'/);
});

test('la RPC respeta las convenciones de permisos del repo', () => {
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path=''/);
  assert.match(sql, /current_auxilios_role\(\)/);
  assert.match(sql, /revoke all on function .* from public, anon/);
  assert.match(sql, /grant execute on function .* to authenticated, service_role/);
});

test('los estilos del mapa están scopeados como el resto del dashboard', () => {
  const reglas = css.split('}')
    .map(b => b.split('{')[0].trim())
    .filter(s => s && !s.startsWith('@') && !s.startsWith('/*') && !/^\s*to\s*$/.test(s));
  reglas.forEach(sel => {
    assert.ok(sel.includes('#screen-dashboard'),
      `selector sin scopear: '${sel}'`);
  });
  assert.match(css, /#dashx-fact-mapa/);
});


/* ── v2: los dos insights ───────────────────────────────────────────────── */

const sqlV2 = require('node:fs').readFileSync(
  'migrations/20260919230000_dashboard_zonas_insights_v2.sql', 'utf8');
const mapaJs = require('node:fs').readFileSync('dashboard-mapa-v1.js', 'utf8');

test('los kilómetros muertos comparan contra la base más cercana, no contra cualquiera', () => {
  assert.match(sqlV2, /function app_private\.km_entre/);
  // Haversine: no hay PostGIS ni earthdistance en el proyecto.
  assert.match(sqlV2, /6371 \* 2 \* asin/);
  // least(1, ...) evita el error de dominio de asin() en dos puntos idénticos.
  assert.match(sqlV2, /asin\(least\(1, sqrt/);
  // La más cercana sale de un lateral ordenado por distancia, no de la asignada.
  assert.match(sqlV2, /order by app_private\.km_entre\(b\.origin_lat, b\.origin_lng, s2\.lat, s2\.lng\)/);
  assert.match(sqlV2, /cercana_id is distinct from billing_base_id/);
  // Sólo bases activas y geocodificadas pueden ser "la más cercana".
  assert.match(sqlV2, /bb\.latitude is not null/);
});

test('sólo se juzgan los servicios que se pueden juzgar', () => {
  // Un servicio sin base geocodificada no es un hallazgo, es un dato faltante.
  assert.match(sqlV2, /juzgable as \(\s*\n\s*select \* from ubicado\s*\n\s*where km_asignada is not null and km_cercana is not null/);
  assert.match(sqlV2, /'evaluados',     \(select count\(\*\) from juzgable\)/);
});

test('la cobertura trae su umbral, no lo repite el front', () => {
  assert.match(sqlV2, /v_umbral numeric := 80/);
  assert.match(sqlV2, /'umbral_km', v_umbral/);
  assert.match(mapaJs, /cob\.umbral_km/);
  assert.ok(!/\b80\b/.test(mapaJs.slice(mapaJs.indexOf('function pintarLectura'),
                                          mapaJs.indexOf('function destruirMapa'))),
    'el front repite el umbral en vez de leerlo del payload');
});

test('la lectura del mapa aclara que los km son en línea recta', () => {
  // Un ahorro prometido que después no cierra con la realidad quema la confianza
  // en todo el tablero.
  assert.match(mapaJs, /en línea recta/);
  assert.match(sqlV2, /EN LÍNEA RECTA/);
  assert.match(mapaJs, /function pintarLectura/);
  // Se pinta aunque el mapa no tenga puntos que dibujar.
  assert.ok(mapaJs.indexOf('pintarLectura(data)') < mapaJs.indexOf("if (!puntos.length)"));
});
