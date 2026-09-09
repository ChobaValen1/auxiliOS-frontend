const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('login uses a full-viewport responsive shell', () => {
  const css = read('sigma.css');
  const supabase = read('supabase.js');

  assert.match(supabase, /class="login-shell"/);
  assert.match(supabase, /class="login-card"/);
  assert.match(css, /#pantalla-login\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/);
  assert.match(css, /#pantalla-login \.login-card\s*\{[\s\S]*?width:\s*min\(100%, 420px\)/);
  assert.match(css, /@media \(max-width:\s*520px\)/);
  assert.match(css, /@media \(max-height:\s*560px\)/);
});

test('journey KPIs are filter-aware and show averages and services', () => {
  const html = read('Index.html');
  const ui = read('sigma.js');
  const data = read('supabase.js');

  assert.doesNotMatch(html, /id="jadmin-kpi-taller"/);
  assert.match(html, /id="jadmin-kpi-servicios"/);
  assert.match(ui, /jadmin-kpi-horas'[\s\S]*?k\.promHorasJornada/);
  assert.match(ui, /promedio por jornada/);
  assert.match(ui, /k\.serviciosPeriodo/);
  assert.match(data, /if \(driverId\) abiertasQuery = abiertasQuery\.eq\('driver_id', driverId\)/);
  assert.match(data, /if \(truckId\)\s+abiertasQuery = abiertasQuery\.eq\('truck_id', truckId\)/);
  assert.match(data, /\.from\('remitos'\)[\s\S]*?serviciosPeriodo = serviciosRes\.count \|\| 0/);
});

test('journey screen removes the visual legend and numbers services chronologically', () => {
  const html = read('Index.html');
  const ui = read('sigma.js');
  const data = read('supabase.js');

  const adminScreen = html.match(/<div class="screen" id="screen-jornadas-admin">([\s\S]*?)<\/div><!-- \/screen-jornadas-admin -->/)?.[1] || '';
  assert.doesNotMatch(adminScreen, /class="leyenda"/);
  assert.match(data, /\.order\('created_at_device', \{ ascending: true \}\)/);
  assert.match(ui, /trips\.map\(\(t, index\) =>/);
  assert.match(ui, /class="jd-service-seq"[^>]*>\$\{index \+ 1\}<\/span>/);
});
