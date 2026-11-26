const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

const src = fs.readFileSync('ui/table-sort-v1.js', 'utf8');

function load() {
  const store = new Map();
  const listeners = {};
  const ctx = {
    window: {},
    document: { addEventListener: (type, fn) => { listeners[type] = fn; }, body: null, querySelector: () => null },
    sessionStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    requestAnimationFrame: fn => fn(),
    setTimeout, Intl, JSON, Number, Date, String, Array, Map, Set, Object,
    CSS: { escape: s => s }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { T: ctx.window.AuxiliosTableSort, store };
}

const rows = [
  { id: 1, code: 'B-10', date: '2026-11-20T10:00:00Z', km: 12, name: 'Ávila' },
  { id: 2, code: 'B-2', date: '2026-11-22T10:00:00Z', km: null, name: 'avila' },
  { id: 3, code: 'A-1', date: '2026-11-21T10:00:00Z', km: 150, name: '' },
  { id: 4, code: '', date: '2026-11-19T10:00:00Z', km: 9, name: 'Zárate' }
];
const fields = {
  date: { label: 'Fecha', type: 'date', get: r => r.date },
  code: { label: 'Código', type: 'text', get: r => r.code },
  km: { label: 'Km', type: 'number', get: r => r.km },
  name: { label: 'Cliente', type: 'text', get: r => r.name }
};
const ids = list => list.map(r => r.id).join(',');

test('por defecto ordena por fecha, de la más reciente a la más vieja', () => {
  const { T } = load();
  const so = T.create({ id: 't1', fields, defaultKey: 'date', defaultDir: 'desc' });
  assert.equal(ids(so.apply(rows)), '2,3,1,4');
  assert.equal(so.state.isDefault, true);
});

test('ciclo del título: ascendente, descendente y vuelve a la fecha', () => {
  const { T } = load();
  let changes = 0;
  const so = T.create({ id: 't2', fields, defaultKey: 'date', defaultDir: 'desc', onChange: () => changes++ });
  so.toggle('km');
  assert.deepEqual([so.state.key, so.state.dir], ['km', 'asc']);
  so.toggle('km');
  assert.deepEqual([so.state.key, so.state.dir], ['km', 'desc']);
  so.toggle('km');
  assert.deepEqual([so.state.key, so.state.dir], ['date', 'desc']);
  so.toggle('date');
  assert.deepEqual([so.state.key, so.state.dir], ['date', 'asc']);
  so.toggle('date');
  assert.deepEqual([so.state.key, so.state.dir], ['date', 'desc']);
  assert.equal(changes, 5);
});

test('números por valor y vacíos siempre al final en los dos sentidos', () => {
  const { T } = load();
  const so = T.create({ id: 't3', fields, defaultKey: 'date', defaultDir: 'desc' });
  so.set({ key: 'km', dir: 'asc' });
  assert.equal(ids(so.apply(rows)), '4,1,3,2');
  so.set({ key: 'km', dir: 'desc' });
  assert.equal(ids(so.apply(rows)), '3,1,4,2');
});

test('texto en español: natural (B-2 antes que B-10), sin tildes ni mayúsculas, empate por fecha', () => {
  const { T } = load();
  const so = T.create({ id: 't4', fields, defaultKey: 'date', defaultDir: 'desc' });
  so.set({ key: 'code', dir: 'asc' });
  assert.equal(ids(so.apply(rows)), '3,2,1,4');
  so.set({ key: 'name', dir: 'asc' });
  // «Ávila» y «avila» empatan: va primero la más reciente (2) y después 1; el vacío (3) al final.
  assert.equal(ids(so.apply(rows)), '2,1,4,3');
});

test('el título lleva aria-sort, un botón y el control del celular lista sólo las columnas visibles', () => {
  const { T } = load();
  const so = T.create({ id: 't5', fields, defaultKey: 'date', defaultDir: 'desc' });
  assert.match(so.th('date', 'Fecha'), /aria-sort="descending"[^>]*><button type="button" class="ax-sort-btn" data-ax-sort="t5" data-ax-sort-key="date"/);
  assert.match(so.th('km', 'Km'), /aria-sort="none"/);
  assert.doesNotMatch(so.th('actions', 'Acciones'), /aria-sort|button/);
  const mobile = so.mobile({ keys: ['date', 'km', 'nope'] });
  assert.match(mobile, /Ordenar por/);
  assert.match(mobile, /<option value="km">Km<\/option>/);
  assert.doesNotMatch(mobile, /value="code"/);
});

test('recuerda el orden en la sesión y no guarda el de por defecto', () => {
  const { T, store } = load();
  const a = T.create({ id: 't6', fields, defaultKey: 'date', defaultDir: 'desc' });
  a.set({ key: 'code', dir: 'desc' });
  assert.equal(store.get('ax-sort:t6'), JSON.stringify({ key: 'code', dir: 'desc' }));
  const b = T.create({ id: 't6', fields, defaultKey: 'date', defaultDir: 'desc' });
  assert.equal(b.state.key, 'code');
  b.reset();
  assert.equal(store.has('ax-sort:t6'), false);
});

test('Servicios, Historial y Facturación usan el orden compartido', () => {
  const services = fs.readFileSync('operator-services.js', 'utf8');
  const billing = fs.readFileSync('operator-billing.js', 'utf8');
  const config = fs.readFileSync('config.js', 'utf8');
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.match(services, /servicios\.historial/);
  assert.match(services, /servicios\.activos/);
  assert.match(services, /const all=sortServices\(filtered\(\)\)/);
  assert.match(billing, /facturacion\.\$\{tab\}/);
  assert.match(billing, /S\.rows = sortTab\('services'/);
  assert.match(config, /\/ui\/table-sort-v1\.js/);
  assert.match(sw, /'\/ui\/table-sort-v1\.js'/);
  assert.match(sw, /'\/ui\/table-sort-v1\.css'/);
});
