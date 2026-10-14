const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const tokens = fs.readFileSync('ui/tokens.css', 'utf8');
const comp = fs.readFileSync('ui/components.css', 'utf8');
const sprite = fs.readFileSync('ui/icons.svg', 'utf8');
const page = fs.readFileSync('design-system.html', 'utf8');

const ids = new Set([...sprite.matchAll(/<symbol id="([a-z0-9-]+)"/g)].map(m => m[1]));

test('cada ícono usado en la hoja de muestra existe en el sprite de Lucide', () => {
  const usados = new Set([...page.matchAll(/icons\.svg#([a-z0-9-]+)/g)].map(m => m[1]));
  [...page.matchAll(/\['([a-z0-9-]+)', '[^']+'\]/g)].forEach(m => { if (!m[1].startsWith('--')) usados.add(m[1]); });
  const faltan = [...usados].filter(n => !ids.has(n));
  assert.deepEqual(faltan, []);
  assert.ok(ids.size >= 60);
  assert.ok(fs.existsSync('ui/LUCIDE-LICENSE.txt'));
});

test('los componentes usan tokens: sin colores sueltos salvo blanco en el botón de peligro', () => {
  const sinComentarios = comp.replace(/\/\*[\s\S]*?\*\//g, '');
  const hex = [...sinComentarios.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(m => m[0]).filter(h => h.toLowerCase() !== '#fff');
  assert.deepEqual(hex, []);
});

test('tokens: cuatro colores con significado y texto con contraste AA', () => {
  for (const t of ['--ax-accent', '--ax-danger', '--ax-ok', '--ax-info', '--ax-text-3', '--ax-radius', '--ax-sp-4', '--ax-h-lg']) assert.match(tokens, new RegExp(t + ':'));
  assert.doesNotMatch(tokens, /cyan|purple/);
  // El gris de etiquetas pasa AA sobre las tarjetas (el --muted viejo, #5a6278, no).
  const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const val = n => tokens.match(new RegExp(n + ':\\s*(#[0-9a-f]{6})'))[1];
  for (const n of ['--ax-text', '--ax-text-2', '--ax-text-3', '--ax-danger', '--ax-info', '--ax-ok', '--ax-accent']) {
    assert.ok(cr(val(n), val('--ax-surface-2')) >= 4.5, n);
  }
});

test('movimiento: tres duraciones, curvas y todo a 0 con "reducir movimiento"', () => {
  assert.match(tokens, /--ax-dur-fast: 120ms;/);
  assert.match(tokens, /--ax-dur: 180ms;/);
  assert.match(tokens, /--ax-dur-slow: 260ms;/);
  assert.match(tokens, /@media \(prefers-reduced-motion: reduce\) \{\s*:root \{ --ax-dur-fast: 0ms; --ax-dur: 0ms; --ax-dur-slow: 0ms; \}/);
  // Ninguna animación usa una duración fija: todas salen de los tokens.
  const sinComentarios = comp.replace(/\/\*[\s\S]*?\*\//g, '');
  const fijas = [...sinComentarios.matchAll(/(?:animation|transition)[^;{]*?\b(\d+(?:\.\d+)?)(ms|s)\b/g)].map(m => m[0])
    .filter(x => !/ax-spin 1s|ax-shimmer 1\.2s|ax-flash 1\.6s|delay/.test(x));
  assert.deepEqual(fijas, []);
  // Lo oculto con [hidden] no puede tapar la pantalla.
  assert.match(comp, /\.ax-backdrop\[hidden\], \.ax-drawer\[hidden\], \.ax-menu\[hidden\][^{]*\{ display: none !important; \}/);
});

test('comportamiento en JS: avisos, modal, menú, botón que guarda, carga, pestañas y cambios', () => {
  const vm = require('node:vm');
  const js = fs.readFileSync('ui/ax.js', 'utf8');
  const win = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const doc = { addEventListener() {}, documentElement: {}, querySelector: () => null };
  win.document = doc;
  vm.runInNewContext(js, { window: win, document: doc, setTimeout, clearTimeout, Promise });
  for (const f of ['toast', 'openModal', 'closeModal', 'menu', 'busy', 'loading', 'tabs', 'flash']) assert.equal(typeof win.AxUI[f], 'function', f);
  assert.match(js, /tone === 'danger' \? 0 : ms\('--ax-toast-ms', 4000\)/);   // errores no se van solos
  assert.match(js, /Math\.max\(0, 400 - \(Date\.now\(\) - inicio\)\)/);        // "Guardando…" no parpadea
  assert.match(js, /, 300\);/);                                                // esqueleto sólo si tarda más de 300 ms
  assert.match(js, /ctx\.volver\.focus\(\)/);                                  // el foco vuelve a quien abrió el modal
  assert.match(page, /id="reglas-uso"/);
});

test('interacción: interruptor que se arrastra, selector múltiple, marca, tareas y fila que se desliza', () => {
  const vm = require('node:vm');
  const js = fs.readFileSync('ui/ax.js', 'utf8');
  const win = { addEventListener() {}, matchMedia: () => ({ matches: false }) };
  const doc = { addEventListener() {}, documentElement: {}, querySelector: () => null };
  win.document = doc;
  vm.runInNewContext(js, { window: win, document: doc, setTimeout, clearTimeout, Promise });
  for (const f of ['multi', 'mark', 'task', 'swipe']) assert.equal(typeof win.AxUI[f], 'function', f);
  // Las opciones con tilde no cierran el menú (se eligen varias).
  assert.match(js, /!mb\.hasAttribute\('aria-checked'\)/);
  // La fila deslizada tiene la acción también fuera del gesto: sus botones no entran al orden del teclado.
  assert.match(js, /b\.tabIndex = -1/);
  // El rebote es un token y sólo lo usan el interruptor, los tildes y el ícono de la fila.
  assert.match(tokens, /--ax-ease-spring: cubic-bezier\(/);
  const usos = (comp.match(/var\(--ax-ease-spring\)/g) || []).length;
  assert.ok(usos >= 1 && usos <= 4, String(usos));
  for (const id of ['i-multi', 'i-tasks', 'i-swipes', 'i-sw1']) assert.match(page, new RegExp('id="' + id + '"'));
});
