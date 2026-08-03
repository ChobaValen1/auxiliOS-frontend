const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('drivers cannot access the operator services module', () => {
  const elements = new Map();
  const makeElement = id => ({
    id,
    innerHTML: '',
    value: '',
    style: {},
    classList: {
      removed: [],
      add() {},
      remove(name) { this.removed.push(name); },
      contains() { return false; },
    },
    insertAdjacentHTML() {},
  });

  for (const id of ['screen-operaciones', 'nav-operaciones']) {
    elements.set(id, makeElement(id));
  }

  const notices = [];
  const intervals = [];
  const sandbox = {
    console,
    Intl,
    Date,
    Number,
    String,
    Set,
    Map,
    Promise,
    Object,
    PERFIL_USUARIO: { roles: { name: 'chofer' }, full_name: 'Chofer Prueba' },
    USUARIO_ACTUAL: { id: 'driver' },
    toast: (message, type) => notices.push({ message, type }),
    setInterval(callback) { intervals.push(callback); return intervals.length; },
    clearInterval() {},
    document: {
      readyState: 'complete',
      addEventListener() {},
      getElementById: id => elements.get(id) || null,
      createElement() { return { id: '', rel: '', href: '' }; },
      head: { appendChild() {} },
      body: { insertAdjacentHTML() {} },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
    _db: {
      from() { throw new Error('Drivers must not query operator service tables.'); },
      rpc() { throw new Error('Drivers must not call operator service RPCs.'); },
    },
    goTo() { throw new Error('Blocked navigation must not reach the base router.'); },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);

  const source = fs.readFileSync(path.join(__dirname, '..', 'operator-services.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'operator-services.js' });

  for (const callback of intervals.slice()) callback();

  assert.equal(sandbox.OperatorServices.canRead(), false);
  assert.equal(elements.get('nav-operaciones').style.display, 'none');
  assert.deepEqual(elements.get('screen-operaciones').classList.removed, ['active']);

  sandbox.goTo('operaciones');
  assert.equal(notices.at(-1)?.type, 'error');
  assert.match(notices.at(-1)?.message || '', /Sin permiso/);

  sandbox.abrirDetalleServicio('service');
  assert.equal(notices.at(-1)?.type, 'error');
  assert.match(notices.at(-1)?.message || '', /Sin permiso/);
});
