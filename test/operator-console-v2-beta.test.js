const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/20260804103000_operator_console_v2_beta.sql');
const flags = read('feature-flags.js');
const consoleV2 = read('operator-console-v2.js');
const consoleCss = read('operator-console-v2.css');
const config = read('config.js');
const pkg = read('package.json');
const sw = read('sw.js');

test('la beta se habilita por usuario y no por rol', () => {
  assert.match(migration, /create table if not exists public\.user_feature_flags/i);
  assert.match(migration, /primary key \(user_id, feature_key\)/i);
  assert.match(migration, /alter table public\.user_feature_flags enable row level security/i);
  assert.match(migration, /user_feature_flags_select_own/i);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/i);
  assert.match(migration, /revoke all on table public\.user_feature_flags from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.user_feature_flags to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[^;]*user_feature_flags/i);
  assert.match(migration, /lower\(u\.email\) = 'admin@sigmaremolques\.com'/i);
  assert.doesNotMatch(migration, /supervisor@sigmaremolques\.com/i);
  assert.doesNotMatch(migration, /where\s+[^;]*role/i);
});

test('las preferencias visuales son privadas y editables solo por su dueño', () => {
  assert.match(migration, /create table if not exists public\.user_view_preferences/i);
  assert.match(migration, /preferences jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /user_view_preferences_select_own/i);
  assert.match(migration, /user_view_preferences_insert_own/i);
  assert.match(migration, /user_view_preferences_update_own/i);
  assert.match(migration, /user_view_preferences_delete_own/i);
  assert.match(migration, /with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.user_view_preferences to authenticated/i);
});

test('el cargador solo descarga la consola cuando la bandera individual está activa', () => {
  assert.match(flags, /from\('user_feature_flags'\)/);
  assert.match(flags, /\.eq\('enabled',true\)/);
  assert.match(flags, /flags\.operator_console_v2/);
  assert.match(flags, /operator-console-v2\.css/);
  assert.match(flags, /operator-console-v2\.js/);
  assert.match(flags, /auth\.getSession\(\)/);
  assert.match(flags, /onAuthStateChange/);
  assert.doesNotMatch(flags, /admin@sigmaremolques\.com/);
  assert.doesNotMatch(flags, /PERFIL_USUARIO.*administracion/);
});

test('la tabla beta permite ordenar, filtrar y personalizar columnas sin cambiar el flujo operativo', () => {
  assert.match(consoleV2, /Tabla beta/);
  assert.match(consoleV2, /Vista clásica/);
  assert.match(consoleV2, /COLUMN_DEFS/);
  assert.match(consoleV2, /id:'service'.*required:true/);
  assert.match(consoleV2, /id:'status'.*required:true/);
  assert.match(consoleV2, /id:'action'.*required:true/);
  assert.match(consoleV2, /id:'priority'.*extra:true/);
  assert.match(consoleV2, /id:'vehicle'.*extra:true/);
  assert.match(consoleV2, /id:'amount'.*extra:true/);
  assert.match(consoleV2, /user_view_preferences/);
  assert.match(consoleV2, /\.upsert\(/);
  assert.match(consoleV2, /draggable="true"/);
  assert.match(consoleV2, /data-column-move/);
  assert.match(consoleV2, /density:'compact'/);
  assert.match(consoleV2, /O\.openDetail/);
  assert.match(consoleV2, /O\.loadServices/);
  assert.doesNotMatch(consoleV2, /\.rpc\(/);
  assert.doesNotMatch(consoleV2, /advance_operator_service/);
  assert.doesNotMatch(consoleV2, /create_operator_service/);
});

test('los estados actuales se traducen solamente en la presentación beta', () => {
  assert.match(consoleV2, /assigned:\{label:'Asignado'/);
  assert.match(consoleV2, /en_route:\{label:'Camino al origen'/);
  assert.match(consoleV2, /at_origin:\{label:'En origen'/);
  assert.match(consoleV2, /loaded:\{label:'Listo para traslado'/);
  assert.match(consoleV2, /completed:\{label:'Finalizado'/);
  assert.match(consoleV2, /cancelled:\{label:'Excepción'/);
  assert.match(consoleV2, /Esta vista solo cambia la presentación/);
});

test('la interfaz conserva encabezado fijo, densidad y panel de configuración accesible', () => {
  assert.match(consoleCss, /position:\s*sticky/i);
  assert.match(consoleCss, /density-compact/);
  assert.match(consoleCss, /density-normal/);
  assert.match(consoleCss, /ocv2-settings-panel/);
  assert.match(consoleCss, /#ocv2-settings\[hidden\]/);
  assert.match(consoleCss, /@media/);
  assert.doesNotMatch(consoleCss, /backdrop-filter/i);
});

test('la beta forma parte del arranque, la validación y la caché PWA', () => {
  assert.match(config, /auxilios-feature-flags/);
  assert.match(config, /feature-flags\.js/);
  assert.match(pkg, /node --check feature-flags\.js/);
  assert.match(pkg, /node --check operator-console-v2\.js/);
  assert.match(sw, /auxilios-v11[6-9]|auxilios-v1[2-9]\d/);
  assert.match(sw, /operator-console-v2\.css/);
  assert.match(sw, /feature-flags\.js/);
  assert.match(sw, /operator-console-v2\.js/);
});
