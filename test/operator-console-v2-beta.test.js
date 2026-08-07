const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/20260804103000_operator_console_v2_beta.sql');
const flags = read('feature-flags.js');
const legacyConsole = read('operator-console-v2.js');
const config = read('config.js');
const pkg = read('package.json');
const sw = read('sw.js');
const canonical = read('operator-services-canonical-view-v1.js');

test('la infraestructura de feature flags sigue siendo privada por usuario', () => {
  assert.match(migration, /create table if not exists public\.user_feature_flags/i);
  assert.match(migration, /primary key \(user_id, feature_key\)/i);
  assert.match(migration, /alter table public\.user_feature_flags enable row level security/i);
  assert.match(migration, /user_feature_flags_select_own/i);
  assert.match(migration, /\(select auth\.uid\(\)\) = user_id/i);
  assert.match(migration, /revoke all on table public\.user_feature_flags from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.user_feature_flags to authenticated/i);
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[^;]*user_feature_flags/i);
});

test('las preferencias visuales siguen siendo privadas y editables solo por su dueño', () => {
  assert.match(migration, /create table if not exists public\.user_view_preferences/i);
  assert.match(migration, /preferences jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /user_view_preferences_select_own/i);
  assert.match(migration, /user_view_preferences_insert_own/i);
  assert.match(migration, /user_view_preferences_update_own/i);
  assert.match(migration, /user_view_preferences_delete_own/i);
  assert.match(migration, /grant select, insert, update, delete on table public\.user_view_preferences to authenticated/i);
});

test('la consola V2 alternativa queda retirada del runtime', () => {
  assert.match(flags, /from\('user_feature_flags'\)/);
  assert.match(flags, /flags\.operator_console_v2/);
  assert.match(flags, /operator-active-desk-clean-v1\.css/);
  assert.match(flags, /operator-active-desk-clean-v1\.js/);
  assert.match(flags, /operator-services-canonical-view-v1\.js/);
  assert.doesNotMatch(flags, /operator-console-v2\.css/);
  assert.doesNotMatch(flags, /operator-console-v2\.js/);
  assert.match(canonical, /removeAlternativeConsole/);
  assert.match(canonical, /ocv2-switch/);
  assert.match(canonical, /ocv2-root/);
  assert.match(canonical, /ocv2-settings/);
});

test('el código histórico de la consola no puede entrar por CI o PWA', () => {
  assert.match(legacyConsole, /Consola operativa V2/);
  assert.match(config, /auxilios-feature-flags/);
  assert.match(config, /feature-flags\.js/);
  assert.match(pkg, /node --check feature-flags\.js/);
  assert.doesNotMatch(pkg, /node --check operator-console-v2\.js/);
  assert.match(pkg, /node --check operator-services-canonical-view-v1\.js/);
  assert.doesNotMatch(sw, /'\/operator-console-v2\.css'/);
  assert.doesNotMatch(sw, /'\/operator-console-v2\.js'/);
  assert.match(sw, /'\/operator-services-canonical-view-v1\.js'/);
  const match = sw.match(/auxilios-v(\d+)/);
  assert.ok(match);
  assert.ok(Number(match[1]) >= 135);
});
