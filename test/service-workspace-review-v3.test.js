const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/20260805090000_operator_resource_availability.sql');
const workspace = read('operator-service-workspace-reactive-v1.js');
const css = read('operator-service-workspace-reactive-v1.css');
const config = read('config.js');
const flags = read('feature-flags.js');
const pkg = read('package.json');
const sw = read('sw.js');

test('Nuevo Servicio mantiene código prestadora demora horarios KM y contexto de base', () => {
  assert.match(workspace, /Código prestadora/);
  assert.match(workspace, /service_order_number/);
  assert.match(workspace, /Arribo/);
  assert.match(workspace, /estimated_arrival_at/);
  assert.match(workspace, /Fin/);
  assert.match(workspace, /estimated_finish_at/);
  assert.match(workspace, /\[30,60,90,120,180,240\]/);
  assert.match(workspace, /KM Totales/i);
  assert.match(workspace, /estimated_asphalt_km/);
  assert.match(workspace, /estimated_gravel_km/);
  assert.match(workspace, /estimated_distance_km/);
  assert.match(workspace, /osv4-base/);
  assert.match(workspace, /osv4-context-status/);
});

test('la disponibilidad se obtiene desde jornadas, móviles y servicios activos', () => {
  assert.match(migration, /create or replace function public\.get_operator_resource_availability/i);
  assert.match(migration, /from public\.daily_logs/i);
  assert.match(migration, /coalesce\(dl\.status, 'open'\) = 'open'/i);
  assert.match(migration, /dl\.hora_fin is null/i);
  assert.match(migration, /from public\.operator_services/i);
  assert.match(workspace, /rpc\('get_operator_resource_availability'\)/);
  assert.match(workspace, /Disponible/);
  assert.match(workspace, /Sin jornada/);
  assert.match(workspace, /En taller/);
});

test('Maps consulta luego de 550 ms, valida place y cierra resultados fuera del campo', () => {
  assert.match(workspace, /setTimeout\(\(\)=>searchAddress\(kind,q,seq\),550\)/);
  assert.match(workspace, /functions\.invoke\('maps-proxy'/);
  assert.match(workspace, /action:'autocomplete'/);
  assert.match(workspace, /action:'place'/);
  assert.match(workspace, /action:'route'/);
  assert.match(workspace, /function closeSuggestions\(kind,cancel=false\)/);
  assert.match(workspace, /if\(cancel\)a\.seq\+\+/);
  assert.match(workspace, /`\$\{kind\}_place_id`/);
  assert.match(workspace, /`\$\{kind\}_formatted_address`/);
  assert.match(workspace, /Dirección manual sin validar/);
  assert.match(css, /\.osv4-suggestions\{position:absolute/);
});

test('Review V3 no carga y el renderer reactivo entra una sola vez por bootstrap, CI y PWA', () => {
  assert.match(flags, /flags\.service_workspace_v2/);
  assert.doesNotMatch(flags, /operator-service-workspace-reactive-v1\.css|operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(flags, /operator-service-workspace-review-v3/);
  assert.match(config, /operator-service-workspace-reactive-v1\.css/);
  assert.match(config, /operator-service-workspace-reactive-v1\.js/);
  assert.match(pkg, /node --check operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(pkg, /node --check operator-service-workspace-review-v3\.js/);
  const version = sw.match(/auxilios-v(\d+)/);
  assert.ok(version);
  assert.ok(Number(version[1]) >= 165);
  assert.match(sw, /operator-service-workspace-reactive-v1\.css/);
  assert.match(sw, /operator-service-workspace-reactive-v1\.js/);
  assert.doesNotMatch(sw, /operator-service-workspace-review-v3/);
});
