const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const config = fs.readFileSync('config.js', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');
const data = fs.readFileSync('supabase.js', 'utf8');
const envSource = config.slice(0, config.indexOf('// Build visible'));
const createSource = sigma.slice(sigma.indexOf('async function guardarNuevoUsuario()'), sigma.indexOf('// Esta es la consulta que pedías'));
const headerSource = data.slice(data.indexOf('async function apiAuthHeaders('), data.indexOf('\n}', data.indexOf('async function apiAuthHeaders(')) + 2);

function formHarness(response, token = 'session-token') {
  const fields = Object.fromEntries(Object.entries({
    'nu-nombre': 'Persona de prueba', 'nu-legajo': 'test-01', 'nu-email': 'test@example.com',
    'nu-telefono': '', 'nu-dni': '12345678', 'nu-rol': 'chofer',
  }).map(([id, value]) => [id, { value }]));
  fields['btn-guardar-usuario'] = { style: {} };
  const calls = [], notices = [], closed = [];
  const context = vm.createContext({
    document: { getElementById: id => fields[id] },
    usuarioEditandoId: null,
    SUPABASE_KEY: 'public-test-key',
    obtenerAccessToken: async () => { if (!token) throw new Error('Sesión expirada. Volvé a ingresar.'); return token; },
    fetch: async (url, options) => { calls.push({ url, options }); if (response instanceof Error) throw response; return response; },
    showModalError: (id, message) => notices.push(message),
    toast: message => notices.push(message),
    closeModal: id => closed.push(id),
    cargarTablaAdminUsuarios: () => {},
  });
  vm.runInContext(envSource + headerSource + '\n' + createSource, context);
  return { context, fields, calls, notices, closed };
}

test('individual creation uses the active admin function with session JWT and public API key', async () => {
  const h = formHarness({ ok: true, json: async () => ({ ok: true, invitation_sent: true }) });
  await h.context.guardarNuevoUsuario();
  assert.equal(h.calls[0].url, 'https://bcjcrlrrqfbipleiwkqi.supabase.co/functions/v1/auxilios-admin/api/create-user');
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer session-token');
  assert.equal(h.calls[0].options.headers.apikey, 'public-test-key');
  assert.equal(JSON.parse(h.calls[0].options.body).legajo, 'TEST-01');
  assert.equal(h.closed.length, 1);
});

test('server and network failures preserve the form and restore the save button', async () => {
  for (const response of [
    { ok: false, json: async () => ({ error: 'Datos de usuario inválidos' }) },
    new TypeError('Failed to fetch'),
    { ok: false, json: async () => { throw new SyntaxError('not JSON'); } },
  ]) {
    const h = formHarness(response);
    await h.context.guardarNuevoUsuario();
    assert.equal(h.closed.length, 0);
    assert.equal(h.fields['nu-nombre'].value, 'Persona de prueba');
    assert.equal(h.fields['btn-guardar-usuario'].style.pointerEvents, 'auto');
    assert.equal(h.notices.length, 1);
  }
});

test('expired sessions never send the user payload', async () => {
  const h = formHarness(null, null);
  await h.context.guardarNuevoUsuario();
  assert.equal(h.calls.length, 0);
  assert.match(h.notices[0], /Sesión expirada/);
});

test('bulk creation and password recovery share the supported admin endpoint', () => {
  assert.equal((sigma.match(/ENV\.ADMIN_API_BASE_URL\}\/api\/create-user/g) || []).length, 2);
  assert.match(sigma, /ENV\.ADMIN_API_BASE_URL\}\/api\/send-password-reset/);
  assert.doesNotMatch(sigma, /ENV\.API_BASE_URL\}\/api\/(?:create-user|send-password-reset)/);
});
