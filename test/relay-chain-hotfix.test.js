const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// DOM mínimo: alcanza para que los módulos armen sus interruptores y escuchen el clic.
function fakeEl(id) {
  const kids = {}, handlers = {};
  const el = {
    id, hidden: false, dataset: {}, disabled: false, checked: false, value: '', title: '', className: '',
    classList: { toggle() {} }, attrs: {}, _html: '',
    get firstElementChild() { return this._html ? {} : null; },
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; for (const m of v.matchAll(/id="([^"]+)"/g)) kids[m[1]] = kids[m[1]] || fakeEl(m[1]); },
    querySelector(sel) { return kids[sel.replace('#', '')] || null; },
    addEventListener(type, fn) { (handlers[type] = handlers[type] || []).push(fn); },
    fire(type, target = el) { for (const fn of handlers[type] || []) fn({ target }); },
    closest() { return el; }, setAttribute(k, v) { el.attrs[k] = v; }, hasAttribute(k) { return k in el.attrs; }
  };
  return el;
}
function dom(ids) {
  const els = Object.fromEntries(ids.map(i => [i, fakeEl(i)]));
  const find = id => els[id] || Object.values(els).map(e => e.querySelector('#' + id)).find(Boolean) || null;
  return { els, document: { getElementById: find, activeElement: null } };
}

test('Servicio con relevo (prestadoras): al prenderlo se despliega el formulario', () => {
  const { els, document } = dom(['osv4-relay-switch', 'osv4-relay', 'osv4-toggles']);
  const wizard = { serviceId: null, mode: 'create', serviceStatus: 'pending', data: { company_id: 'c1' } };
  const window = { OperatorServices: { S: { wizard, drivers: [{ user_id: 'd2', full_name: 'Lucas P.' }] } } };
  vm.runInNewContext(fs.readFileSync('operator-service-relay-v1.js', 'utf8'), { window, document, _db: { rpc: async () => ({ data: null }) }, console, setTimeout, clearTimeout, globalThis: {} });
  window.AuxRelevoServicio.sync(wizard);
  const on = els['osv4-relay-switch'].querySelector('#osv4-relay-on');
  assert.ok(on, 'pinta el interruptor');
  assert.equal(els['osv4-relay'].hidden, true);
  on.checked = true;
  assert.doesNotThrow(() => on.fire('change'), 'el clic no se cuelga (antes: Maximum call stack size exceeded)');
  assert.equal(wizard.relay.on, true);
  assert.equal(els['osv4-relay'].hidden, false, 'se ve el punto B y el chofer que recibe');
});

test('Servicio enganchado: los del día que ya tienen otro enganchado se ven deshabilitados', () => {
  const { els, document } = dom(['osv4-chain', 'osv4-chain-switch', 'osv4-toggles']);
  const window = {};
  vm.runInNewContext(fs.readFileSync('operator-service-chain-v1.js', 'utf8'), { window, document, _db: null, console, Date, Number, String, JSON });
  const cand = (id, extra) => ({ service_id: id, label: 'ORD-' + id, scheduled_for: '2026-11-12T13:00:00Z', origin: 'La Plata', destination: 'Gonnet', gap_km: 0, ...extra });
  const w = { serviceId: 'b', mode: 'edit', data: { company_id: 'sos' }, context: { billing: { route_mode: 'base_origin_destination_base' } },
    chain: { key: 'b', loaded: true, on: true, selectedId: 'mine', originalId: 'mine', previous: null, next: null, candLoading: false, error: '',
      candidates: [cand('libre'), cand('ocupado', { taken: true }), cand('mine', { taken: true })] } };
  window.AuxEngancheServicio.render(w);
  const html = els['osv4-chain'].innerHTML;
  assert.match(html, /value="libre" >ORD-libre/);
  assert.match(html, /value="ocupado"  disabled>ORD-ocupado · \d\d:\d\d · La Plata → Gonnet · ya tiene otro enganchado/);
  assert.match(html, /value="mine" selected>ORD-mine/, 'el anterior actual de este servicio se sigue pudiendo elegir');
  w.chain.candidates = [];
  window.AuxEngancheServicio.render(w);
  assert.match(els['osv4-chain'].innerHTML, /No hay otros servicios de esta prestadora ese día para enganchar\./);
});
