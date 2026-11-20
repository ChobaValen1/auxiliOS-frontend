// Saca una sola vez el fondo del mapa del traslado (MapLibre + OpenFreeMap «fiord») y proyecta
// el recorrido a px del video. Así la fase 2 de «Hagamos la cuenta» no dibuja el mapa en cada cuadro.
// Uso: node scripts/render_map_cuenta.js
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const legs = [1, 2, 3].map((i) => JSON.parse(fs.readFileSync(path.join(raiz, `data/osrm-cuenta/leg${i}.json`))).routes[0]);
// mismo encuadre que tenía el mapa en vivo
const PADDING = { top: 610, bottom: 960, left: 150, right: 170 };
const HUDSON = [-58.164, -34.79]; // peaje de la autopista a La Plata
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto('file://' + path.join(__dirname, 'map.html'));
  const res = await page.evaluate(async ({ legs, PADDING, HUDSON }) => {
    const todos = legs.flatMap((l) => l.geometry.coordinates);
    const lons = todos.map((c) => c[0]), lats = todos.map((c) => c[1]);
    const map = new maplibregl.Map({
      container: 'm', style: 'https://tiles.openfreemap.org/styles/fiord',
      bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      fitBoundsOptions: { padding: PADDING }, interactive: false, attributionControl: false, fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    await new Promise((r) => map.once('idle', r));
    const p = (c) => { const q = map.project(c); return [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]; };
    // el punto de la vuelta más cercano al peaje
    const v = legs[2].geometry.coordinates;
    let best = 0, bd = Infinity;
    v.forEach((c, i) => { const d = (c[0] - HUDSON[0]) ** 2 + (c[1] - HUDSON[1]) ** 2; if (d < bd) { bd = d; best = i; } });
    return { legs: legs.map((l) => ({ km: Math.round(l.distance / 1000), points: l.geometry.coordinates.map(p) })), peajeIndex: best };
  }, { legs, PADDING, HUDSON });
  await page.screenshot({ path: path.join(raiz, 'public/mapa-traslado.jpg'), type: 'jpeg', quality: 92 });
  fs.writeFileSync(path.join(raiz, 'src/cuenta/mapa-traslado.json'), JSON.stringify(res));
  console.log('km', res.legs.map((l) => l.km), 'puntos', res.legs.map((l) => l.points.length), 'peaje', res.peajeIndex);
  await browser.close();
})();
