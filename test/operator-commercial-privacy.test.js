const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('driver role cannot load or navigate to operator services', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
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
    }
    return elements.get(id);
  };

  for (const id of ['screen-operaciones', 'nav-operaciones', 'os-board', 'os-detail-shell']) element(id);

  const notices = [];
  const intervalCallbacks = [];
  const sandbox = {
    console, Intl, Date, Number, String, Set, Map, Promise, Object,
    PERFIL_USUARIO: { roles: { name: 'chofer' }, full_name: 'Chofer' },
    USUARIO_ACTUAL: { id: 'driver' },
    toast: (message, type) => notices.push({ message, type }),
    prompt: () => '',
    setInterval(callback) { intervalCallbacks.push(callback); return intervalCallbacks.length; },
    clearInterval() {},
    goTo() { throw new Error('Driver navigation must not reach the base router.'); },
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
      rpc() { throw new Error('Drivers must not call operator service RPCs.'); },
      from() { throw new Error('Drivers must not query operator service tables.'); },
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'operator-services.js'), 'utf8'), sandbox, { filename: 'operator-services.js' });

  for (const callback of intervalCallbacks.slice()) callback();

  assert.equal(sandbox.OperatorServices.canRead(), false);
  assert.equal(element('nav-operaciones').style.display, 'none');
  assert.deepEqual(element('screen-operaciones').classList.removed, ['active']);

  sandbox.OperatorServices.renderBoard();
  assert.equal(element('os-board').innerHTML, '');

  sandbox.goTo('operaciones');
  assert.equal(notices.at(-1)?.type, 'error');
  assert.match(notices.at(-1)?.message || '', /Sin permiso/);

  await sandbox.abrirDetalleServicio('service');
  assert.equal(element('os-detail-shell').innerHTML, '');
  assert.equal(notices.at(-1)?.type, 'error');
  assert.match(notices.at(-1)?.message || '', /Sin permiso/);
});
