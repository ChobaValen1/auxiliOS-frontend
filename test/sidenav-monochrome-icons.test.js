const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Los 8 ítems estáticos de Index.html llevan un SVG de línea (P6). Pero el
// sidenav no vive solo ahí: configuration-center.js, operator-services.js,
// operator-service-bridge.js y billing-bases.js reconfiguran esos mismos
// nodos (o agregan otros) en tiempo de ejecución según el rol. Si alguno de
// esos módulos vuelve a escribir un emoji de color en `.nav-icon`, el
// sidenav queda mixto otra vez sin que ningún test lo note — es justo lo
// que pasó: quedaron 12 llamadas con el emoji viejo hardcodeado, invisibles
// hasta que alguien lo vio en producción.

const html = read('Index.html');
const center = read('configuration-center.js');
const opServices = read('operator-services.js');
const opBridge = read('operator-service-bridge.js');
const billingBases = read('billing-bases.js');

// Emoji de color reales que este PR reemplazó. No incluye glifos simples
// como $, ▦, ▤, ☷, que ya son monocromáticos por sí mismos.
const COLOR_EMOJI = ['📊', '📋', '🚛', '📄', '🧾', '💵', '⚙️', '◷', '🧭', '📡', '📍', '🗓️'];

test('los 8 ítems estáticos del sidenav usan SVG, no emoji', () => {
  const nav = html.match(/<nav class="sidenav">[\s\S]*?<\/nav>/)[0];
  const items = [...nav.matchAll(/<div class="nav-item[^>]*>[\s\S]*?<\/div>/g)]
    .filter(m => /goTo\(/.test(m[0]));
  assert.ok(items.length >= 8, `se esperaban al menos 8 nav-item con goTo(), hubo ${items.length}`);
  items.forEach(([block]) => {
    assert.match(block, /<span class="nav-icon"><svg /, `sin SVG: ${block.slice(0, 80)}`);
  });
});

test('ensureNavNode actualiza el ícono con innerHTML, no con textContent', () => {
  // El bug real: textContent convierte cualquier SVG ya puesto en texto
  // plano. Si alguien lo revierte, esta prueba tiene que romperse.
  const fn = center.split('function ensureNavNode(')[1].split(/\n  function /)[0];
  assert.doesNotMatch(fn, /iconNode\.textContent\s*=\s*icon/);
  assert.match(fn, /iconNode\.innerHTML\s*=\s*icon/);
});

test('ningún módulo vuelve a escribir un emoji de color sobre los ítems del sidenav', () => {
  // Ojo con el alcance: configuration-center.js también dibuja la tarjeta
  // de herramientas del panel de Configuración (.aux-center-tool), que es
  // OTRO componente, con sus propios emoji, y no es parte del sidenav.
  // Por eso no se barre el archivo entero: solo las líneas que tocan
  // `.nav-icon` o pasan por ensureNavNode/ensureDriverNode/icon.innerHTML.
  const sidenavLines = (source) => source
    .split('\n')
    .filter(line => /nav-icon|ensureNavNode\(|ensureDriverNode\(|icon\.innerHTML/.test(line));

  for (const [label, source] of [
    ['configuration-center.js', center],
    ['operator-services.js', opServices],
    ['operator-service-bridge.js', opBridge],
    ['billing-bases.js', billingBases],
  ]) {
    const lines = sidenavLines(source).join('\n');
    assert.ok(lines.length > 0, `${label}: no se encontró ninguna línea de sidenav para revisar`);
    for (const emoji of COLOR_EMOJI) {
      assert.doesNotMatch(
        lines, new RegExp(emoji.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        `${label} todavía escribe el emoji de color ${emoji} en una línea del sidenav`
      );
    }
  }
});

test('los ítems dinámicos del sidenav (Servicios, Bases geográficas) también son SVG', () => {
  assert.match(opServices, /<span class="nav-icon"><svg /);
  assert.match(opBridge, /icon\.innerHTML\s*=\s*'<svg /);
  assert.match(billingBases, /<span class="nav-icon"><svg /);
});
