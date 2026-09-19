const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const MODULOS = [
  'dashboard-facturacion-v1.js',
  'dashboard-operaciones-v1.js',
  'dashboard-flota-v1.js',
  'dashboard-mapa-v1.js',
];

// Quita comentarios para no confundir una explicación con una llamada real.
function soloCodigo(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

test('ningún módulo busca el cliente de Supabase en window', () => {
  // supabase.js hace `const _db = createClient(...)` en el nivel superior de un
  // script clásico: ese binding vive en el scope del script y NO se cuelga de
  // window, así que global._db / window._db son undefined. Tres de los cuatro
  // módulos caían ahí y la sección quedaba en blanco sin un error visible,
  // porque la guarda de "sin conexión" se disparaba sola.
  MODULOS.forEach(ruta => {
    const codigo = soloCodigo(fs.readFileSync(ruta, 'utf8'));
    assert.doesNotMatch(codigo, /\bglobal\._db\b/,
      `${ruta} usa global._db, que siempre es undefined`);
    assert.doesNotMatch(codigo, /\bwindow\._db\b/,
      `${ruta} usa window._db, que siempre es undefined`);
  });
});

test('cada módulo resuelve _db por el scope del script', () => {
  MODULOS.forEach(ruta => {
    const codigo = soloCodigo(fs.readFileSync(ruta, 'utf8'));
    assert.match(codigo, /typeof _db\s*[!=]==\s*'undefined'/,
      `${ruta} debe comprobar _db con typeof antes de usarlo`);
  });
});

test('las RPC que invoca el front son las que existen en las migraciones', () => {
  const llamadas = new Set();
  MODULOS.forEach(ruta => {
    const codigo = soloCodigo(fs.readFileSync(ruta, 'utf8'));
    for (const m of codigo.matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) llamadas.add(m[1]);
    // Facturación guarda el nombre en una constante.
    for (const m of codigo.matchAll(/RPC\s*=\s*'([a-z0-9_]+)'/g)) llamadas.add(m[1]);
  });

  const sql = fs.readdirSync('migrations')
    .filter(f => f.includes('dashboard'))
    .map(f => fs.readFileSync('migrations/' + f, 'utf8'))
    .join('\n');

  assert.ok(llamadas.size >= 4, `se esperaban al menos 4 RPC, hay ${llamadas.size}`);
  llamadas.forEach(nombre => {
    assert.match(sql, new RegExp('create or replace function public\\.' + nombre + '\\b'),
      `el front llama a ${nombre} pero ninguna migración la crea`);
  });
});
