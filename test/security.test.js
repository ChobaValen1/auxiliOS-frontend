'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('el frontend no contiene secretos de servidor', () => {
  const trackedSources = ['Index.html', 'sigma.js', 'supabase.js', 'config.js'];
  for (const file of trackedSources) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(content, /OPENAI_API_KEY/);
  }
});

test('el alta y recuperación de usuarios dependen del backend autenticado', () => {
  const sigma = fs.readFileSync(path.join(root, 'sigma.js'), 'utf8');
  assert.match(sigma, /\/api\/create-user/);
  assert.match(sigma, /\/api\/send-password-reset/);
  assert.match(sigma, /apiAuthHeaders/);
  assert.doesNotMatch(sigma, /\/api\/reset-password/);
});

test('los enlaces de invitación y recuperación permiten definir contraseña', () => {
  const supabase = fs.readFileSync(path.join(root, 'supabase.js'), 'utf8');
  assert.match(supabase, /PASSWORD_RECOVERY/);
  assert.match(supabase, /type=\(\?:invite\|recovery\)/);
  assert.match(supabase, /auth\.updateUser\(\{ password \}\)/);
});
