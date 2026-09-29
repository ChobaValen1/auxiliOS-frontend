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
