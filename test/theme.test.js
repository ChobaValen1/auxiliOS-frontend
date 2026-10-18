'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('ui/theme-v1.js'), css = read('ui/theme-light-v1.css'), index = read('Index.html'), sigma = read('sigma.js');

function boot({ saved, systemLight = false, user } = {}) {
  const store = new Map(Object.entries(saved || {})), attrs = {};
  const root = { setAttribute: (k, v) => { attrs[k] = v; }, style: {} };
  const window = { localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) }, matchMedia: () => ({ matches: systemLight, addEventListener() {} }), dispatchEvent() {}, PERFIL_USUARIO: user };
  vm.runInNewContext(src, { window, document: { documentElement: root }, setInterval: () => 0, clearInterval() {}, setTimeout: f => f(), CustomEvent: function () {} });
  return { T: window.AuxTheme, attrs, store };
}

test('tema: oscuro por defecto; Claro y Sistema se aplican al instante', () => {
  let b = boot();
  assert.equal(b.attrs['data-theme'], 'dark');
  b.T.set('light');
  assert.equal(b.attrs['data-theme'], 'light');
  assert.equal(b.store.get('auxilios.theme'), 'light');
  b = boot({ saved: { 'auxilios.theme': 'system' }, systemLight: true });
  assert.equal(b.attrs['data-theme'], 'light');
  assert.equal(b.attrs['data-theme-pref'], 'system');
});

test('tema: cada usuario guarda su elección en el navegador', () => {
  const b = boot({ saved: { 'auxilios.theme': 'dark', 'auxilios.theme.u1': 'light' }, user: { user_id: 'u1' } });
  assert.equal(b.T.get(), 'light');
  b.T.set('system');
  assert.equal(b.store.get('auxilios.theme.u1'), 'system');
});

test('tema claro: tokens y nombres viejos, cargado antes que todo y elegible desde el avatar y Mi cuenta', () => {
  assert.match(css, /:root\[data-theme="light"\] \{[\s\S]*--ax-bg: #f3f4f7;[\s\S]*--ax-text: #161a23;[\s\S]*--bg-app: #f3f4f7;/);
  assert.ok(index.indexOf('/ui/theme-v1.js') < index.indexOf('rel="stylesheet"'), 'el tema se aplica antes de los estilos');
  assert.match(index, /\/ui\/theme-light-v1\.css\?v=[^"]+">\n<\/head>/);
  assert.match(index, /id="nav-avatar-theme"/);
  assert.match(sigma, /themeEl\.innerHTML = window\.AuxTheme\.pickerHtml\(\)/);
  assert.equal((sigma.match(/cfg-ch-theme/g) || []).length, 2);
});
