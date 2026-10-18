'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const proxy = fs.readFileSync('supabase/functions/maps-proxy/index.ts', 'utf8');
const load = () => import('../supabase/functions/maps-proxy/coordinates.mjs');

test('coordenadas: decimales con punto, con coma y entre paréntesis', async () => {
  const { parseCoordinates: p } = await load();
  assert.deepEqual(p('-34.6037, -58.3816'), { latitude: -34.6037, longitude: -58.3816 });
  assert.deepEqual(p('-34.6037,-58.3816'), { latitude: -34.6037, longitude: -58.3816 });
  assert.deepEqual(p('(-34.6037 -58.3816)'), { latitude: -34.6037, longitude: -58.3816 });
  assert.deepEqual(p('-34,6037; -58,3816'), { latitude: -34.6037, longitude: -58.3816 });
  assert.deepEqual(p('-34,6037, -58,3816'), { latitude: -34.6037, longitude: -58.3816 });
  assert.deepEqual(p('coord:-34.6037,-58.3816'), { latitude: -34.6037, longitude: -58.3816 });
  assert.deepEqual(p('34.6037 S, 58.3816 O'), { latitude: -34.6037, longitude: -58.3816 });
});

test('coordenadas: grados, minutos y segundos', async () => {
  const { parseCoordinates: p } = await load();
  const r = p(`34°36'13.3"S 58°22'53.8"W`);
  assert.ok(Math.abs(r.latitude + 34.603694) < 1e-5 && Math.abs(r.longitude + 58.381611) < 1e-5);
  assert.ok(p(`34°36'13"S, 58°22'53"O`).longitude < 0, 'O de Oeste');
});

test('coordenadas: enlaces de Google Maps', async () => {
  const { parseCoordinates: p } = await load();
  assert.deepEqual(p('https://www.google.com/maps/place/Obelisco/@-34.6037,-58.3816,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d-34.6036844!4d-58.3815591'), { latitude: -34.6036844, longitude: -58.3815591 });
  assert.deepEqual(p('https://maps.google.com/?q=-34.6037,-58.3816'), { latitude: -34.6037, longitude: -58.3816 });
  assert.deepEqual(p('https://www.google.com/maps/@-31.4201,-64.1888,15z'), { latitude: -31.4201, longitude: -64.1888 });
});

test('coordenadas: no confunde direcciones ni acepta valores fuera de rango', async () => {
  const { parseCoordinates: p } = await load();
  for (const t of ['Av. Corrientes 1234', 'Ruta 2 km 45', 'Calle 12 34', '12, 34', '-95.1234, -58.3816', '0.00, 0.00', '', 'https://maps.app.goo.gl/abc123'])
    assert.equal(p(t), null, t);
});

test('coordenadas: el proxy devuelve una sugerencia y el punto exacto con la dirección más cercana', () => {
  assert.match(proxy, /const coords = parseCoordinates\(input\);\n  if \(coords\) return \{ suggestions: \[await coordinateSuggestion\(coords, apiKey\)\] \};/);
  assert.match(proxy, /if \(placeId\.startsWith\(COORD_PREFIX\)\)/);
  assert.match(proxy, /maps\.googleapis\.com\/maps\/api\/geocode\/json/);
  assert.match(proxy, /location: c,/);
  assert.match(proxy, /const formatted = geo\?\.formatted_address \|\| label;/, 'si Google no responde, quedan las coordenadas');
});
