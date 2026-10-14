const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('auxilios-emoji-mono-v1.css', 'utf8');
const index = fs.readFileSync('Index.html', 'utf8');
const remito = fs.readFileSync('remito.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

const fuentes = () => fs.readdirSync('.').filter(f => /\.(js|html|css)$/.test(f) && f !== 'auxilios-emoji-mono-v1.css');

test('la hoja de emojis monocromáticos se carga en la app y en el remito público', () => {
  assert.match(index, /<link rel="stylesheet" href="auxilios-emoji-mono-v1\.css\?v=/);
  assert.match(remito, /<link rel="stylesheet" href="\/auxilios-emoji-mono-v1\.css">/);
  assert.match(remito, /font:15px\/1\.45 'AuxEmoji',/);
  assert.match(sw, /'\/auxilios-emoji-mono-v1\.css'/);
});

test('cada familia de la app tiene su cara de emoji y los archivos existen', () => {
  ['AuxEmoji', 'Inter', 'DM Sans', 'DM Mono', 'Bebas Neue'].forEach(fam =>
    assert.match(css, new RegExp(`@font-face\\{font-family:'${fam}'`), `falta ${fam}`));
  for (const m of css.matchAll(/url\(\/(assets\/fonts\/noto-emoji\/[^)]+\.woff2)\)/g)) {
    assert.ok(fs.existsSync(m[1]), `falta ${m[1]}`);
  }
  assert.ok(fs.existsSync('assets/fonts/noto-emoji/LICENSE'), 'la licencia OFL viaja con la fuente');
});

test('los rangos no tocan letras ni números: sólo emojis', () => {
  for (const m of css.matchAll(/unicode-range:([^}]+)\}/g)) {
    m[1].split(',').forEach(r => {
      const desde = parseInt(r.trim().replace(/^U\+/i, '').split('-')[0], 16);
      assert.ok(desde >= 0x2000, `rango latino en la fuente de emojis: ${r}`);
    });
  }
});

test('ningún emoji fuerza la versión a color con U+FE0F', () => {
  fuentes().forEach(f => {
    assert.ok(!fs.readFileSync(f, 'utf8').includes('️'), `${f} tiene un U+FE0F`);
  });
});

test('los semáforos son un punto liso con color propio, no círculos emoji', () => {
  fuentes().forEach(f => {
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /[🔴🟢🟡🔵⚪]/u, `${f} tiene un círculo emoji`);
  });
});
