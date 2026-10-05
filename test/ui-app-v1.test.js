const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = f => fs.readFileSync(f, 'utf8');
const index = read('Index.html'), sw = read('sw.js'), pkg = read('package.json');

test('la app carga el sistema visual: tokens, componentes, ax.js y su aplicación', () => {
  for (const f of ['/ui/tokens.css', '/ui/components.css', '/ui/app-v1.css', '/operaciones-ax-v1.css', '/chofer-servicios-ax-v1.css', '/servicio-form-ax-v1.css', '/estado-servicio-ax-v1.css', '/remito-chofer-ax-v1.css', '/jornadas-ax-v1.css', '/shell-ax-v1.css', '/facturacion-ax-v1.css', '/facturas-ax-v1.css']) {
    assert.match(index, new RegExp('href="' + f.replace(/\./g, '\\.') + '\\?v='), f);
    assert.match(sw, new RegExp("'" + f.replace(/\./g, '\\.') + "'"), f);
  }
  for (const f of ['/ui/ax.js', '/ui/app-v1.js', '/remito-chofer-ax-v1.js']) {
    assert.match(index, new RegExp('src="' + f.replace(/\./g, '\\.') + '\\?v='), f);
    assert.match(sw, new RegExp("'" + f.replace(/\./g, '\\.') + "'"), f);
  }
  assert.match(sw, /'\/ui\/icons\.svg'/);
  // ax.js y el puente se ejecutan después de sigma.js (que define toast()).
  assert.ok(index.indexOf('src="sigma.js') < index.indexOf('src="/ui/ax.js'));
  assert.ok(index.indexOf('src="/ui/ax.js') < index.indexOf('src="/ui/app-v1.js'));
  assert.match(pkg, /node --check ui\/ax\.js && node --check ui\/app-v1\.js/);
});

test('toast() de la app pasa a ser el aviso del sistema visual con el tono correcto', () => {
  const calls = [];
  const win = { AxUI: { toast: o => { calls.push(o); return {}; } }, toast: () => 'viejo' };
  vm.runInNewContext(read('ui/app-v1.js'), { window: win });
  win.toast('Servicio guardado', 'success');
  win.toast('No se pudo guardar', 'error');
  win.toast('Revisá la patente', 'warning');
  win.toast('Actualizando', 'info');
  win.toast('   ', 'error');
  assert.deepEqual(calls.map(c => [c.title, c.tone]), [['Servicio guardado', 'ok'], ['No se pudo guardar', 'danger'], ['Revisá la patente', 'warn'], ['Actualizando', 'info']]);
});

test('las herramientas de Jornadas (modales de corregir, anular e historial) usan sólo tokens', () => {
  const css = read('jornadas-admin-tools-v1.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual([...css.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)].map(m => m[0]), []);
  assert.match(css, /var\(--ax-surface-2\)/);
});

test('Servicios y la lista del chofer usan sólo tokens e íconos del sprite', () => {
  for (const f of ['operaciones-ax-v1.css', 'chofer-servicios-ax-v1.css', 'servicio-form-ax-v1.css', 'estado-servicio-ax-v1.css', 'remito-chofer-ax-v1.css', 'jornadas-ax-v1.css', 'facturacion-ax-v1.css', 'facturas-ax-v1.css', 'ui/app-v1.css']) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.deepEqual([...css.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)].map(m => m[0]).filter(h => !/^#(screen|os|p3|phase3|toast|psv|modal|ax)/.test(h) && h.toLowerCase() !== '#fff'), [], f);   // blanco sólo en el botón de peligro
    // Cuelga de un id para ganarle a los estilos viejos sin importar el orden de carga.
    const sueltas = css.split('}').map(r => r.split('{')[0].trim()).filter(sel => sel && !sel.startsWith('@') && !/^(from|to|\d+%)/.test(sel) && !/#|\.ax-toasts|^:root/.test(sel));
    assert.deepEqual(sueltas, [], f);
  }
  const os = read('operator-services.js'), bridge = read('operator-service-bridge.js'), filters = read('auxilios-filters-v1.js');
  assert.match(os, /data-label="\$\{esc\(COLUMN_LABELS\[k\]\|\|k\)\}"/);   // tarjetas en el celular
  assert.match(os, /\$\{ico\('ellipsis'\)\}/);
  assert.match(os, /aria-label="Más acciones"/);
  assert.match(os, /MENU_ICON=\{view:'eye',edit:'pencil',finalize:'circle-check',annul:'circle-x'\}/);
  assert.doesNotMatch(os, /icon:'🏢'|icon:'👤'|icon:'🚚'|>⋯<|>⚙<|>↻</);
  assert.doesNotMatch(filters, />🗓<|>▾<|>⌕</);
  assert.doesNotMatch(bridge, /＋ Sin asignación|aria-label="Actualizar">↻/);
  // Los íconos usados existen en el sprite.
  const sprite = new Set([...read('ui/icons.svg').matchAll(/<symbol id="([a-z0-9-]+)"/g)].map(m => m[1]));
  const usados = new Set([...(os + bridge + filters).matchAll(/\b(?:ico|ICO)\('([a-z0-9-]+)'/g)].map(m => m[1]));
  Object.values({ view: 'eye', edit: 'pencil', finalize: 'circle-check', annul: 'circle-x' }).forEach(n => usados.add(n));
  assert.deepEqual([...usados].filter(n => !sprite.has(n)), []);
});

test('en el celular nada de Servicios ensancha la página', () => {
  const css = read('operaciones-ax-v1.css');
  assert.match(css, /#screen-operaciones \.os-status-tabs, #screen-operaciones \.os-table-wrap, #screen-operaciones \.os-intake-list \{ contain: inline-size; \}/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*#screen-operaciones \.os-table thead \{ display: none; \}/);
});

test('el menú lateral y la cabecera usan sólo tokens, sin emojis ni colores sueltos', () => {
  const css = read('shell-ax-v1.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual([...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]), []);
  assert.ok(index.indexOf('href="/sigma.css') < index.indexOf('id="auxilios-shell-ax-v1-css"') || index.indexOf('sigma.css') < index.indexOf('auxilios-shell-ax-v1-css'));
  const top = index.slice(index.indexOf('<div class="topbar"'), index.indexOf('<div class="content">'));
  assert.doesNotMatch(top, /👑|🔔|⚙/);
  assert.doesNotMatch(read('supabase.js'), /🔑 Admin|🧭 Operador|👁 Supervisor|🚛 Chofer/);
});
