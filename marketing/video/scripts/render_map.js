// Renderiza el mapa base con MapLibre + OpenFreeMap y proyecta el recorrido a px del video.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const [dataDir, outImg, outJson] = process.argv.slice(2);
const legs = [1, 2, 3].map((i) => JSON.parse(fs.readFileSync(path.join(dataDir, `leg${i}.json`))).routes[0]);
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && console.error('page:', m.text()));
  await page.goto('file://' + path.join(__dirname, 'map.html'));
  const coords = legs.flatMap((l) => l.geometry.coordinates);
  const result = await page.evaluate(async ({ coords, legs }) => {
    const lons = coords.map((c) => c[0]), lats = coords.map((c) => c[1]);
    const map = new maplibregl.Map({
      container: 'm',
      style: 'https://tiles.openfreemap.org/styles/dark',
      bounds: [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      fitBoundsOptions: { padding: { top: 430, bottom: 580, left: 120, right: 120 } },
      interactive: false, attributionControl: false, fadeDuration: 0, canvasContextAttributes: { preserveDrawingBuffer: true },
    });
    await new Promise((r) => map.once('idle', r));
    const p = (c) => { const q = map.project(c); return [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]; };
    return {
      zoom: map.getZoom(),
      legs: legs.map((l) => ({ km: Math.round(l.distance / 100) / 10, min: Math.round(l.duration / 60), points: l.geometry.coordinates.map(p) })),
    };
  }, { coords, legs });
  await page.screenshot({ path: outImg });
  result.base = result.legs[0].points[0];
  result.origen = result.legs[1].points[0];
  result.destino = result.legs[2].points[0];
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(outJson, JSON.stringify(result));
  console.log('zoom', result.zoom.toFixed(2), 'km', result.legs.map((l) => l.km), 'base', result.base, 'origen', result.origen, 'destino', result.destino);
  await browser.close();
})();
