const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const data = fs.readFileSync('supabase.js', 'utf8');
const sigma = fs.readFileSync('sigma.js', 'utf8');
const helper = data.slice(data.indexOf('async function adminApiFetch('), data.indexOf('async function cerrarSesion('));
const reset = sigma.slice(sigma.indexOf('async function confirmarResetPassword('), sigma.indexOf('// ── CONTROL DE VISIBILIDAD'));
function harness(responses, refresh = { data: { session: { access_token: 'fresh' } } }) {
  const calls = [], notices = [];
  let refreshes = 0, removed = false;
  const elements = {
    'rp-error': { style: {} }, 'rp-btn-confirmar': {},
    'modal-reset-pass': { remove: () => { removed = true; } },
  };
  const context = vm.createContext({
    ENV: { ADMIN_API_BASE_URL: 'https://admin.example' },
    SUPABASE_KEY: 'public-key',
    obtenerAccessToken: async () => 'old',
    _db: { auth: { refreshSession: async () => { refreshes++; return refresh; } } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const response = responses.shift();
      if (response instanceof Error) throw response;
      return response;
    },
    TypeError,
    document: { getElementById: id => elements[id] },
    toast: message => notices.push(message),
  });
  vm.runInContext(helper + reset, context);
  return { context, calls, notices, elements, get refreshes() { return refreshes; }, get removed() { return removed; } };
}
const response = (status, body = {}) => ({ status, ok: status < 400, json: async () => body });

test('recovery renews rejected session once, preserving target and using new JWT', async () => {
  const h = harness([response(401, { message: 'Invalid JWT' }), response(200, { ok: true })]);
  await h.context.confirmarResetPassword('target-user');
  assert.equal(h.refreshes, 1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer old');
  assert.equal(h.calls[1].options.headers.Authorization, 'Bearer fresh');
  assert.equal(h.calls[1].options.headers.apikey, 'public-key');
  assert.equal(h.calls[1].options.body, h.calls[0].options.body);
  assert.equal(h.removed, true);
  assert.equal(h.notices.length, 1);
});

test('valid session sends only one request', async () => {
  const h = harness([response(200)]);
  await h.context.confirmarResetPassword('target-user');
  assert.equal(h.refreshes, 0);
  assert.equal(h.calls.length, 1);
  assert.equal(h.removed, true);
});

test('expired refresh and repeated 401 retain the modal and explain signing in again', async () => {
  for (const h of [
    harness([response(401)], { data: { session: null }, error: new Error('expired') }),
    harness([response(401), response(401)]),
  ]) {
    await h.context.confirmarResetPassword('target-user');
    assert.equal(h.refreshes, 1);
    assert.ok(h.calls.length <= 2);
    assert.match(h.elements['rp-error'].textContent, /Volvé a ingresar/);
    assert.equal(h.elements['rp-btn-confirmar'].disabled, false);
    assert.equal(h.removed, false);
    assert.equal(h.notices.length, 0);
  }
});

test('forbidden, mail errors and ambiguous network failures are never retried', async () => {
  for (const result of [
    response(403, { error: 'No autorizado' }),
    response(502, { message: 'Correo no disponible' }),
    new TypeError('Failed to fetch'),
    { status: 502, ok: false, json: async () => { throw new SyntaxError(); } },
  ]) {
    const h = harness([result]);
    await h.context.confirmarResetPassword('target-user');
    assert.equal(h.calls.length, 1);
    assert.equal(h.refreshes, 0);
    assert.ok(h.elements['rp-error'].textContent);
    assert.equal(h.elements['rp-btn-confirmar'].disabled, false);
    assert.equal(h.removed, false);
  }
});
