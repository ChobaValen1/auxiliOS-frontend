'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs');
const src = fs.readFileSync('supabase.js', 'utf8');

test('sesión: si se cierra sola, se avisa y se ofrece volver a ingresar', () => {
  assert.match(src, /createClient\(SUPABASE_URL, SUPABASE_KEY, \{ global: \{ fetch: _fetchConAviso \} \}\)/);
  // Pedido rechazado (401) que salió sin usuario: sólo la clave pública en Authorization.
  assert.match(src, /res\.status === 401 && USUARIO_ACTUAL && !_salidaVoluntaria/);
  assert.match(src, /auth === 'Bearer ' \+ SUPABASE_KEY\) _avisarSesionCerrada\(\)/);
  assert.match(src, /event === 'SIGNED_OUT' && USUARIO_ACTUAL && !_salidaVoluntaria/);
  assert.match(src, /Se cerró tu sesión/);
  assert.match(src, /Ingresar de nuevo/);
});

test('sesión: salir a propósito no muestra el aviso', () => {
  for (const fn of ['async function cerrarSesion() {', 'async function logoutUsuario() {', 'async function _cerrarCuentaSuspendida() {']) {
    const i = src.indexOf(fn);
    assert.ok(i >= 0, fn);
    assert.match(src.slice(i, i + 120), /_salidaVoluntaria = true;/);
  }
});
