const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const supa = read('supabase.js');
const sigma = read('sigma.js');
const sql = read('migrations/20261012230000_user_presence_v1.sql');

test('la app avisa que está en uso cada 2 minutos, sólo a la vista y con conexión', () => {
  assert.match(supa, /const _PRESENCIA_MS = 2 \* 60 \* 1000;/);
  assert.match(supa, /if \(document\.visibilityState === 'hidden' \|\| navigator\.onLine === false/);
  assert.match(supa, /_db\.rpc\('touch_user_presence_v1', \{/);
  assert.match(supa, /async function inicializarApp\(\) \{\n  ocultarPantallaLogin\(\);\n  iniciarPresencia\(\);/);
});

test('Usuarios muestra la última actividad real y quién está en línea', () => {
  assert.match(sigma, /let la = await _db\.rpc\('get_users_last_access_v2'\);/);
  assert.match(sigma, /<th>Última actividad<\/th>/);
  assert.doesNotMatch(sigma, /<th>Último acceso<\/th>/);
  assert.match(sigma, /En línea\$\{donde/);
  assert.match(sigma, /Último ingreso con contraseña: /);
  assert.match(sigma, /en línea ahora/);
});

test('la base: sólo Administración y Supervisión ven la actividad; nadie lee la tabla directo', () => {
  assert.match(sql, /alter table public\.user_presence enable row level security;\nrevoke all on public\.user_presence from public, anon, authenticated;/);
  assert.match(sql, /not in \('administracion','supervision'\) then\n    raise exception 'Sin permiso';/);
  assert.match(sql, /coalesce\(p\.last_seen_at > now\(\) - interval '3 minutes', false\)/);
  assert.doesNotMatch(sql, /drop (table|function)/i);
});
