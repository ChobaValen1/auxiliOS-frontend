const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
  const win = { addEventListener() {}, document: { addEventListener() {} } };
  win.window = win;
  vm.runInNewContext(fs.readFileSync('toll-route-detection-v1.js', 'utf8'), win);
  return win.AuxiliosTollDetection._test;
}
// Codifica una polilínea como Google (5 decimales) para probar decode().
function encode(points) {
  let plat = 0, plng = 0, out = '';
  const put = (v) => { v = v < 0 ? ~(v << 1) : v << 1; while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } out += String.fromCharCode(v + 63); };
  for (const [lat, lng] of points) { const a = Math.round(lat * 1e5), b = Math.round(lng * 1e5); put(a - plat); put(b - plng); plat = a; plng = b; }
  return out;
}

test('decode lee el ejemplo de la documentación de Google', () => {
  const t = load();
  const pts = t.decode('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(JSON.stringify(pts), JSON.stringify([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]));
});

test('decode y encode son inversos', () => {
  const t = load(), src = [[-34.6037, -58.3816], [-34.65, -58.4], [-34.9, -57.95]];
  const back = t.decode(encode(src));
  back.forEach((p, i) => { assert.ok(Math.abs(p[0] - src[i][0]) < 1e-5); assert.ok(Math.abs(p[1] - src[i][1]) < 1e-5); });
});

test('un peaje sobre el trazado se detecta; uno a 2 km, no', () => {
  const t = load();
  const ruta = [[-34.60, -58.40], [-34.70, -58.40]];                          // recta de ~11 km hacia el sur
  const hits = t.detectar(ruta, [
    { toll_id: 'a', name: 'Sobre la ruta', latitude: -34.65, longitude: -58.4003 },   // ~27 m
    { toll_id: 'b', name: 'Lejos', latitude: -34.65, longitude: -58.38 },              // ~1,8 km
    { toll_id: 'c', name: 'Sin ubicación', latitude: null, longitude: null }
  ]);
  assert.equal(JSON.stringify(hits.map(h => h.toll.toll_id)), '["a"]');
  assert.equal(hits[0].passes, 1);
});

test('ida y vuelta por el mismo peaje son dos pasadas; una sola cercanía larga es una', () => {
  const t = load();
  const peaje = { toll_id: 'a', name: 'P', latitude: -34.65, longitude: -58.4 };
  const idaYVuelta = [[-34.60, -58.40], [-34.70, -58.40], [-34.60, -58.40]];  // baja y sube por la misma ruta
  assert.equal(t.detectar(idaYVuelta, [peaje])[0].passes, 2);
  const vertices = [[-34.60, -58.40], [-34.649, -58.40], [-34.651, -58.40], [-34.70, -58.40]];   // vértices seguidos cerca
  assert.equal(t.detectar(vertices, [peaje])[0].passes, 1);
});

test('se ordenan en el orden en que se pasa por ellos', () => {
  const t = load();
  const ruta = [[-34.60, -58.40], [-34.80, -58.40]];
  const hits = t.detectar(ruta, [
    { toll_id: 'segundo', name: 'S', latitude: -34.75, longitude: -58.40 },
    { toll_id: 'primero', name: 'P', latitude: -34.65, longitude: -58.40 }
  ]);
  assert.equal(JSON.stringify(hits.map(h => h.toll.toll_id)), '["primero","segundo"]');
});

test('el mapa dibuja el trazado, los puntos una vez y un número por peaje', () => {
  const t = load();
  const ruta = [[-34.60, -58.40], [-34.70, -58.40], [-34.60, -58.40]];
  const svg = t.mapa(ruta, [
    { label: 'Base', lat: -34.60, lng: -58.40 }, { label: 'Origen', lat: -34.70, lng: -58.40 }, { label: 'Destino', lat: -34.68, lng: -58.40 }, { label: 'Base', lat: -34.60, lng: -58.40 }
  ], [{ toll: { toll_id: 'a', name: 'P', latitude: -34.65, longitude: -58.40 }, passes: 2 }]);
  assert.match(svg, /<path class="tdt-route"/);
  assert.equal((svg.match(/data-wp="Base"/g) || []).length, 1);     // la Base del inicio y del final es un solo punto
  assert.match(svg, /class="tdt-toll"/);
});

test('el botón, el panel y la carga de peajes detectados están conectados', () => {
  const read = f => fs.readFileSync(f, 'utf8');
  assert.match(read('operator-service-commercial-addons-v1.js'), /data-ca="detect-tolls"/);
  assert.match(read('operator-service-commercial-addons-v1.js'), /AuxiliosTollDetection\?\.panelHtml/);
  assert.match(read('operator-service-wizard.js'), /function addDetectedTolls\(items\)/);
  assert.match(read('operator-service-workspace-reactive-v1.js'), /window\.AuxiliosRouteGeometry=data\?\.polyline/);
  assert.match(read('supabase/functions/maps-proxy/index.ts'), /routes\.polyline\.encodedPolyline/);
  assert.match(read('config.js'), /toll-route-detection-v1\.js/);
  assert.match(read('sw.js'), /toll-route-detection-v1\.js/);
  assert.match(read('migrations/20260930180000_peajes_guardan_ubicacion_v1.sql'), /latitude=coalesce/);
  // Al editar no hay recorrido calculado: se pide en el momento; y la revisión administrativa también tiene el botón.
  assert.match(read('operator-service-workspace-reactive-v1.js'), /async function loadRouteGeometry\(\)/);
  assert.match(read('toll-route-detection-v1.js'), /R\.loadRouteGeometry/);
  assert.match(read('operator-service-commercial-addons-v1.js'), /function addDetectedTollsAdmin\(items\)/);
  assert.match(read('operator-service-commercial-addons-v1.js'), /tolls\?`<button type="button" class="osca-add-row" data-ca="detect-tolls">/);

  // Mapa: sentido, escala y norte; marcadores con letra/número. Los nombres van en la tabla de referencias (abajo a la izquierda).
  const t = load();
  const wps = [{ label: 'Base', lat: -34.60, lng: -58.40, name: 'Base Norte' }, { label: 'Origen', lat: -34.70, lng: -58.40, name: 'Av. Mitre 1200, Avellaneda, Provincia de Buenos Aires' }, { label: 'Destino', lat: -34.68, lng: -58.40, name: 'Alsina 500, Quilmes, Provincia de Buenos Aires' }, { label: 'Base', lat: -34.60, lng: -58.40, name: 'Base Norte' }];
  const hits = [{ toll: { toll_id: 'a', name: 'Peaje Dock Sud', latitude: -34.65, longitude: -58.40 }, passes: 2 }];
  const svg = t.mapa([[-34.60, -58.40], [-34.70, -58.40], [-34.60, -58.40]], wps, hits);
  assert.match(svg, /class="tdt-arrow"/);
  assert.match(svg, /class="tdt-scale"/);
  assert.match(svg, /class="tdt-north"/);
  assert.match(svg, />B</);
  assert.match(svg, />O</);
  assert.match(svg, />D</);
  assert.doesNotMatch(svg, /Mitre/);                               // el dibujo no lleva textos largos
  const tabla = t.leyenda({ waypoints: wps }, hits);
  assert.match(tabla, /<table class="tdt-legend">/);
  assert.match(tabla, /Base Norte/);
  assert.match(tabla, /Av\. Mitre 1200, Avellaneda, Provincia de Buenos Aires/);
  assert.match(tabla, /Alsina 500, Quilmes/);
  assert.match(tabla, /Peajes por los que pasa/);
  assert.match(tabla, /Peaje Dock Sud/);
  assert.equal((tabla.match(/<b>Base<\/b>/g) || []).length, 1);        // la Base de la vuelta no se repite
  assert.match(t.leyenda({ waypoints: wps }, []), />Ninguno</);
  // Origen igual a Destino: un solo marcador "O/D".
  assert.match(t.mapa([[-34.60, -58.40], [-34.70, -58.40]], [{ label: 'Origen', lat: -34.7, lng: -58.4 }, { label: 'Destino', lat: -34.7, lng: -58.4 }], []), />O\/D</);
  // Detectar y Duplicar comparten línea; si falta uno, el otro ocupa toda la línea.
  const css = read('servicio-form-ax-v1.css');
  assert.match(css, /\.osca-add-actions \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.osca-add-actions > :first-child \{ grid-column: 1 \/ -1; \}/);
  assert.match(css, /\.osca-add-actions > \[data-ca="detect-tolls"\]:last-child \{ grid-column: 1 \/ -1; \}/);
  // Peajes compactos: la tabla del mapa lleva la selección y el botón de agregar (sin lista aparte) y las filas ocupan dos renglones.
  const conSel = t.leyenda({ waypoints: wps }, hits, { elegidos: ['a'], ya: [] });
  assert.match(conSel, /data-td-pick="a"[^>]*checked/);
  assert.match(conSel, /data-td="apply"/);
  assert.match(conSel, /Agregar 1 peaje/);
  assert.match(t.leyenda({ waypoints: wps }, hits, { elegidos: ['a'], ya: ['a'] }), /ya está cargado/);
  assert.doesNotMatch(read('toll-route-detection-v1.js'), /tdt-list/);
  assert.match(css, /\.osca-matrix\.tolls \.osca-matrix-row:not\(\.osaa-canonical-row\) \{ grid-template-columns: minmax\(0, 1fr\) 64px auto 28px/);
  assert.match(css, /\.osca-format-list \{ display: grid; grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(read('operator-service-commercial-addons-v1.js'), /function labelFields\(\)/);     // cada campo conserva su rótulo para lectores de pantalla
});

test('el mapa dibuja mosaicos de OpenStreetMap alineados con el trazado y con atribución', () => {
  const t = load();
  const svg = t.mapa([[-34.60, -58.40], [-34.70, -58.30]], [{ label: 'Origen', lat: -34.6, lng: -58.4 }, { label: 'Destino', lat: -34.7, lng: -58.3 }], []);
  const tiles = [...svg.matchAll(/href="https:\/\/tile\.openstreetmap\.org\/(\d+)\/(\d+)\/(\d+)\.png" x="(-?[\d.]+)" y="(-?[\d.]+)"/g)];
  assert.ok(tiles.length >= 1 && tiles.length <= 30);
  assert.match(svg, /© OpenStreetMap/);
  // El mosaico que contiene el Origen debe cubrir su posición (marcador O) en el mapa.
  const z = Number(tiles[0][1]), n = 2 ** z;
  const wx = (-58.4 + 180) / 360, wy = 0.5 - Math.log(Math.tan(Math.PI / 4 + (-34.6 * Math.PI) / 360)) / (2 * Math.PI);
  assert.ok(tiles.some(m => Number(m[2]) === Math.floor(wx * n) && Number(m[3]) === Math.floor(wy * n)));
});

test('con zoom el mapa pide mosaicos más detallados de la zona visible y deja los marcadores del mismo tamaño en pantalla', () => {
  const t = load();
  const ruta = [[-34.60, -58.40], [-34.70, -58.30]], wps = [{ label: 'Origen', lat: -34.6, lng: -58.4 }, { label: 'Destino', lat: -34.7, lng: -58.3 }];
  const nivel = svg => Number(svg.match(/tile\.openstreetmap\.org\/(\d+)\//)[1]);
  const base = t.mapa(ruta, wps, []);
  const zoom = t.mapa(ruta, wps, [], { x: 100, y: 50, w: 40, h: 22.5 });
  assert.ok(nivel(zoom) > nivel(base));
  assert.match(zoom, /viewBox="100 50 40 22.5"/);
  assert.match(zoom, /class="tdt-wp"[^>]*scale\(0\.1250\)/);
  assert.match(zoom, /class="tdt-map is-zoomed"/);
});
