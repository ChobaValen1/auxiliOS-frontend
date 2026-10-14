'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const js = fs.readFileSync(path.join(__dirname, '..', 'sigma.js'), 'utf8');

function extract(name) {
  const start = js.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `no está ${name}`);
  const from = js.lastIndexOf('\n', start) + 1;
  let depth = 0;
  for (let i = js.indexOf('{', start); i < js.length; i++) {
    if (js[i] === '{') depth++;
    if (js[i] === '}' && --depth === 0) return js.slice(from, i + 1);
  }
  throw new Error(`no cierra ${name}`);
}

function sandbox({ role = 'chofer', online = true, rpc = [], cached = [] } = {}) {
  const els = { 'modal-validacion-titulo': { textContent: '' }, 'modal-validacion-msg': { innerHTML: '' } };
  const ctx = {
    PERFIL_USUARIO: { roles: { name: role } },
    navigator: { onLine: online },
    window: { AuxiliosPhase3: { queue: cached } },
    _db: { rpc: async name => { ctx.rpcCalls.push(name); return { data: rpc, error: null }; } },
    rpcCalls: [],
    opened: [],
    document: { getElementById: id => els[id] || null },
    openModal: id => ctx.opened.push(id),
    _escHtml: s => String(s).replace(/</g, '&lt;'),
    els,
  };
  vm.createContext(ctx);
  vm.runInContext(extract('_serviciosPendientesCierreJornada') + '\n' + extract('_mostrarServiciosPendientesCierre'), ctx);
  return ctx;
}

test('cerrar jornada: avisa los servicios sin terminar de un chofer con cola', async () => {
  const ctx = sandbox({ rpc: [
    { service_order_number: 'A1', status: 'at_origin', multi_service: true, driver_queue_position: 1, trip_started: true },
    { service_order_number: 'A2', status: 'assigned', multi_service: true, driver_queue_position: 2 },
  ] });
  const pend = await ctx._serviciosPendientesCierreJornada();
  assert.equal(pend.length, 2);
  assert.deepEqual(ctx.rpcCalls, ['get_driver_operator_queue_v4']);
  ctx._mostrarServiciosPendientesCierre(pend);
  assert.deepEqual(ctx.opened, ['modal-validacion']);
  assert.equal(ctx.els['modal-validacion-titulo'].textContent, '⚠ No podés cerrar la jornada');
  const msg = ctx.els['modal-validacion-msg'].innerHTML;
  assert.match(msg, /faltan terminar 2 servicios/);
  assert.match(msg, /Nº 1 · A1<\/b> · En curso/);
  assert.match(msg, /Nº 2 · A2<\/b> · Sin empezar/);
  assert.match(msg, /pedile al operador que los reasigne/);
});

test('cerrar jornada: los choferes sin el interruptor siguen igual', async () => {
  const ctx = sandbox({ rpc: [{ service_order_number: 'B1', status: 'assigned', multi_service: false }] });
  assert.equal((await ctx._serviciosPendientesCierreJornada()).length, 0);
});

test('cerrar jornada: administración no consulta la cola', async () => {
  const ctx = sandbox({ role: 'administracion', rpc: [{ status: 'assigned', multi_service: true }] });
  assert.equal((await ctx._serviciosPendientesCierreJornada()).length, 0);
  assert.equal(ctx.rpcCalls.length, 0);
});

test('cerrar jornada sin señal: usa la cola guardada en el teléfono', async () => {
  const ctx = sandbox({ online: false, cached: [{ service_number: 'C1', status: 'assigned', multi_service: true }] });
  const pend = await ctx._serviciosPendientesCierreJornada();
  assert.equal(pend.length, 1);
  assert.equal(ctx.rpcCalls.length, 0);
});

test('el control corre antes de guardar el cierre (con y sin señal)', () => {
  const fn = extract('confirmarCerrarJornada');
  const check = fn.indexOf('_serviciosPendientesCierreJornada()');
  assert.ok(check > 0);
  assert.ok(check < fn.indexOf('obAdd('));
  assert.ok(check < fn.indexOf('cerrarJornada(logIdCierre'));
});
