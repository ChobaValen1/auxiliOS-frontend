const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sigma = read('sigma.js');
const data = read('supabase.js');
const pending = () => new Promise(() => {});

function dataContext({ reload = async () => {}, uploadError = null, upload = null, online = true, saveError = null } = {}) {
  const calls = { uploads: [], writes: [], views: [], messages: [], outbox: [] };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, AbortController,
    USUARIO_ACTUAL: { id: 'driver-test' }, navigator: { onLine: online },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    fetch: async () => ({ blob: async () => ({}) }),
    _toast: (...args) => calls.messages.push(args), cargarRemitos: reload,
    showRemitosView: view => calls.views.push(view), obAdd: async value => calls.outbox.push(value),
    _db: {
      storage: { from: bucket => ({
        upload: async (...args) => { calls.uploads.push([bucket, ...args]); return upload ? upload() : { error: uploadError }; },
        getPublicUrl: name => ({ data: { publicUrl: `https://example.test/${bucket}/${name}` } }),
      }) },
      from: () => ({ upsert: (payload) => { calls.writes.push(payload); return { abortSignal: async () => ({ error: saveError }) }; } }),
    },
  });
  vm.runInContext(data.slice(data.indexOf('function _remitoDbDesdeDatos'), data.indexOf('// Nota: esta función maneja')), context);
  const payload = { nro: 'REM-TEST', firmaDataURL: 'data:image/png;base64,AA==', confirmaciones: [], peaje: '1234.50', pago: 'efectivo + transferencia', pago1Monto: '200.50', pago2Monto: '1034.00' };
  return { context, calls, payload };
}

test('un listado trabado no bloquea la confirmación de un remito ya guardado', async () => {
  const { context, calls, payload } = dataContext({ reload: pending });
  const result = await Promise.race([context.guardarRemitoCompleto(payload), new Promise(resolve => setTimeout(() => resolve('blocked'), 150))]);
  assert.equal(result, true);
  assert.equal(calls.writes.length, 1);
  assert.equal(calls.writes[0].status, 'firmado');
  assert.equal(calls.writes[0].imp_peaje, 1234.5);
  assert.equal(calls.writes[0].pago_1_monto, 200.5);
  assert.equal(calls.writes[0].pago_2_monto, 1034);
  assert.deepEqual(calls.views, ['lista']);
});

test('una firma que no se subió no produce un remito firmado sin firma', async () => {
  const { context, calls, payload } = dataContext({ uploadError: { message: 'Sin conexión' } });
  assert.equal(await context.guardarRemitoCompleto(payload), false);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.views.length, 0);
  assert.match(calls.messages.at(-1)[0], /Sin conexión/);
});

test('timeout cancela la petición y expone un error recuperable', async () => {
  const { context } = dataContext();
  let signal;
  await assert.rejects(context._esperarPasoRemito(s => { signal = s; return pending(); }, 'Guardado', 10), /tiempo de espera/);
  assert.equal(signal.aborted, true);
});

test('una subida tardía después del timeout no continúa con la escritura del remito', async () => {
  let finish;
  const { context, calls, payload } = dataContext({ upload: () => new Promise(resolve => { finish = resolve; }) });
  vm.runInContext('const waitStep = _esperarPasoRemito; _esperarPasoRemito = (op, label) => waitStep(op, label, 10);', context);
  assert.equal(await context.guardarRemitoCompleto(payload), false);
  finish({ error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.views.length, 0);
});

test('sin conexión se conserva firma y pago mixto en el outbox', async () => {
  const { context, calls, payload } = dataContext({ online: false });
  assert.equal(await context.guardarRemitoCompleto(payload), true);
  assert.equal(calls.uploads.length, 0);
  assert.equal(calls.writes.length, 0);
  assert.equal(calls.outbox[0].blobs.firma, payload.firmaDataURL);
  assert.equal(calls.outbox[0].payload.pago_1_monto, 200.5);
});

function formContext(save) {
  const values = { 'rem-nro': '', 'rem-patente': 'TEST123', 'rem-origen': 'Origen', 'rem-destino': 'Destino', 'imp-peaje': '1.234,50', 'imp-total': '$1.234,50', 'pago1-monto': '200.50', 'pago2-monto': '1034.00', 'rem-pago-selected': 'efectivo + transferencia' };
  const elements = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, textContent: value }]));
  elements['rem-btn-next'] = { disabled: false, textContent: 'Finalizar' };
  elements['sig-canvas'] = { toDataURL: () => 'data:signature' };
  let resets = 0;
  const context = vm.createContext({
    document: { getElementById: id => elements[id] || null, querySelectorAll: () => [] },
    hasSig: true, remPago1: '', USUARIO_ACTUAL: { id: 'driver-test' },
    _jornadasAbiertasCache: [], _jornadaActivaLocal: null, _resolverLogIdLocal: async id => id,
    _logIdEsTemporal: () => false, navigator: { onLine: true },
    _saveSig() {}, toast() {}, console, guardarRemitoCompleto: save,
    resetPagoForm: () => { resets++; elements['pago1-monto'].value = ''; elements['pago2-monto'].value = ''; },
  });
  vm.runInContext(sigma.slice(sigma.indexOf('let _finalizacionRemitoEnCurso'), sigma.indexOf('// ── CÁLCULO DE TOTAL')), context);
  return { context, elements, resets: () => resets };
}

test('un fallo conserva importes, firma y número para reintentar; el éxito limpia después', async () => {
  const saved = [];
  const { context, elements, resets } = formContext(async payload => { saved.push(payload); return saved.length > 1; });
  assert.equal(await context.finalizarRemito(), false);
  assert.equal(resets(), 0);
  assert.equal(elements['pago1-monto'].value, '200.50');
  assert.equal(elements['rem-btn-next'].disabled, false);
  assert.equal(await context.finalizarRemito(), true);
  assert.equal(saved[0].nro, saved[1].nro);
  assert.equal(saved[1].pago1Monto, 200.5);
  assert.equal(saved[1].pago2Monto, 1034);
  assert.equal(saved[1].firmaDataURL, 'data:signature');
  assert.equal(resets(), 1);
});

test('doble toque en Finalizar no envía dos remitos', async () => {
  let finish, count = 0;
  const { context, elements } = formContext(() => { count++; return new Promise(resolve => { finish = resolve; }); });
  const first = context.finalizarRemito();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements['rem-btn-next'].disabled, true);
  assert.equal(await context.finalizarRemito(), false);
  assert.equal(count, 1);
  finish(true);
  assert.equal(await first, true);
  assert.equal(elements['rem-btn-next'].disabled, false);
});
