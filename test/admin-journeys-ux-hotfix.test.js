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
  // El promedio ahora se declara en el título de la card en vez de repetirse
  // en el subtexto, que pasó a mostrar el total del período.
  assert.match(html, /<div class="kpi-lbl">Horas prom\. \/ jornada<\/div>/);
  assert.match(ui, /jadmin-kpi-horas-sub'[\s\S]*?horasTotalPeriodo/);
  assert.match(ui, /k\.serviciosPeriodo/);
  assert.match(data, /if \(driverId\) abiertasQuery = abiertasQuery\.eq\('driver_id', driverId\)/);
  assert.match(data, /if \(truckId\)\s+abiertasQuery = abiertasQuery\.eq\('truck_id', truckId\)/);
  assert.match(data, /\.from\('remitos'\)[\s\S]*?serviciosPeriodo = serviciosRes\.count \|\| 0/);
});

test('journey filters support multiple drivers and trucks inside one filter panel', () => {
  const html = read('Index.html');
  const ui = read('sigma.js');
  const data = read('supabase.js');

  assert.match(html, /id="jadmin-f-chofer-options"/);
  assert.match(html, /id="jadmin-f-camion-options"/);
  assert.match(html, /id="jadmin-f-periodo"/);
  assert.match(html, /class="chips"[\s\S]*data-chip="todas"/);
  assert.match(ui, /driverIds:\s*\[\]/);
  assert.match(ui, /truckIds:\s*\[\]/);
  assert.match(data, /query = query\.in\('driver_id', selectedDrivers\)/);
  assert.match(data, /query = query\.in\('truck_id', selectedTrucks\)/);
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

test('journey table speaks one data language: es-AR hours, one rendition format, explicit gaps', () => {
  const html = read('Index.html');
  const ui = read('sigma.js');

  // Horas con coma decimal, no con punto.
  assert.match(ui, /function _jadminFmtHoras[\s\S]*?toLocaleString\('es-AR'/);
  assert.doesNotMatch(ui, /horas\.toFixed\(1\)/);

  // La columna Rendición se reemplazó por Efvo. esperado y Gastos: los montos
  // van neutros y el rojo queda solo para la jornada que cerró en faltante.
  assert.doesNotMatch(html, /<th[^>]*>Rendición<\/th>/);
  assert.match(html, /<th class="right">Efvo\. esp\.<\/th>/);
  assert.match(html, /<th class="right">Gastos<\/th>/);
  assert.match(ui, /const faltante = rend\?\.estado === 'faltante'/);
  assert.match(ui, /faltante \? 'money-cell faltante' : 'money-cell'/);

  // Sin dato es "—" y cero es "0", con el mismo tratamiento en INC. y TALLER.
  assert.match(ui, /const kmTxt = kmSinDato \? '—'/);
  assert.match(ui, /r\.hora_fin \? _jadminFmtHoras/);
  assert.match(ui, /'mono cell-empty'/);

  // El contador del chip se oculta si no hay un número que se pueda afirmar.
  assert.match(ui, /function _jadminRenderChipCounts/);
  assert.match(html, /\.chip \.cnt:empty \{ display: none; \}/);
});

test('la grilla cambia Rendición por caja, y Taller por una marca en Estado', () => {
  const html = read('Index.html');
  const ui = read('sigma.js');
  const data = read('supabase.js');

  // Taller dejó de ser columna: el 🔧 viaja con el pill de estado.
  assert.doesNotMatch(html, /<th class="center">Taller<\/th>/);
  assert.match(ui, /if \(r\.in_workshop\) \{[\s\S]*?taller-mark/);
  // El filtro por taller sigue existiendo y sigue leyendo el mismo campo.
  assert.match(html, /data-chip="taller"/);
  assert.match(ui, /clientFilter === 'taller'[\s\S]*?r\.in_workshop/);

  // Combustible: la query ya traía liters y total_cost; solo se exponen.
  assert.match(data, /\.select\('log_id, truck_id, fuel_date, total_cost, liters'\)/);
  assert.match(data, /litros:\s+c\.litros \|\| 0/);
  assert.match(data, /gasto_fuel:\s+c\.gastoFuel \|\| 0/);
  assert.match(html, /<th class="right">Comb\.<\/th>/);

  // 11 columnas: los estados vacíos tienen que cubrir la fila entera.
  const adminScreen = html.match(/<div class="screen" id="screen-jornadas-admin">([\s\S]*?)<\/div><!-- \/screen-jornadas-admin -->/)[1];
  const thead = adminScreen.match(/<thead>([\s\S]*?)<\/thead>/)[1];
  assert.equal((thead.match(/<th/g) || []).length, 11);
  assert.doesNotMatch(ui, /colspan="10"/);

  // Estado queda anclada a la derecha para que el scroll no la esconda.
  assert.match(html, /tbody td:last-child \{\s*\n?\s*position: sticky;/);

  // El legajo salió de la celda del chofer: no aportaba ancho ni alto. Sigue
  // siendo buscable y ahora se lee en el tooltip de la celda.
  assert.doesNotMatch(ui, /<div class="lg">/);
  assert.match(ui, /legajoTitle[\s\S]*?Legajo \$\{_escHtml\(r\.chofer_legajo\)\}/);
  assert.match(ui, /class="chofer-cell"\$\{legajoTitle\}/);
  assert.match(ui, /String\(r\.chofer_legajo \|\| ''\)\.toLowerCase\(\)\.includes\(q\)/);
});
