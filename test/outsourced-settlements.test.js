'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const read = f => fs.readFileSync(f, 'utf8');
const src = read('outsourced-settlements-v1.js'), sql = read('migrations/20261019000000_outsourced_settlements_v1.sql');
function load() { const window = {}; vm.runInNewContext(src, { window, document: {}, console, Intl, Date, Promise }); return window.AuxTercerizadosLiquidaciones; }

test('liquidaciones: suma lo elegido y encuentra el borrador del mes', () => {
  const L = load();
  const rows = [{ service_id: 'a', total_amount: 88900 }, { service_id: 'b', total_amount: '72400.5' }, { service_id: 'c', total_amount: 1 }];
  assert.equal(JSON.stringify(L._selection(rows, { a: true, b: true, c: false })), JSON.stringify({ n: 2, total: 161300.5 }));
  assert.equal(L._draftOf({ settlements: [{ status: 'paid' }, { status: 'draft', settlement_id: 'd' }] }).settlement_id, 'd');
  assert.equal(L._draftOf({ settlements: [{ status: 'approved' }] }), null);
});

test('liquidaciones: meses y fecha de pago', () => {
  const L = load();
  assert.equal(L._shiftMonth('2026-01-01', -1), '2025-12-01');
  assert.equal(L._shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(L._monthName('2026-10-01'), 'Octubre 2026');
  assert.match(L._canPay({ paid_at: '' }), /Elegí la fecha/);
  assert.match(L._canPay({ paid_at: '2999-01-01' }), /futura/);
  assert.equal(L._canPay({ paid_at: '2026-10-10' }), '');
});

test('liquidaciones: pestaña en la ficha y cargado en la app', () => {
  const prov = read('outsourced-providers-v1.js');
  assert.match(prov, /data-osp-tab="liquidaciones"/);
  assert.match(prov, /AuxTercerizadosLiquidaciones\.mount\(liq, prov2\)/);
  for (const f of ['Index.html', 'sw.js']) assert.match(read(f), /outsourced-settlements-v1\.js/);
  assert.match(read('package.json'), /node --check outsourced-settlements-v1\.js/);
  for (const r of ['get_outsourced_settlement_month_v1', 'list_outsourced_settlements_v1', 'get_outsourced_settlement_v1', 'create_outsourced_settlement_v1', 'remove_outsourced_settlement_services_v1', 'set_outsourced_settlement_status_v1']) assert.match(src, new RegExp(r));
});

test('liquidaciones: la base sólo deja a Administración y respeta Borrador → Aprobada → Pagada', () => {
  assert.equal((sql.match(/<> 'administracion' then raise exception 'Sólo Administración liquida tercerizados'/g) || []).length, 6);
  assert.match(sql, /status in \('draft', 'approved', 'paid', 'cancelled'\)/);
  assert.match(sql, /where status = 'draft';/); // un borrador por tercerizado y mes
  assert.match(sql, /s\.status = 'completed' and coalesce\(s\.logistics_type, 'own'\) = 'third_party'/);
  assert.match(sql, /Primero hay que aprobar la liquidación/);
  assert.match(sql, /Sólo se anula un borrador/);
  assert.match(sql, /La fecha de pago no puede ser futura/);
  assert.match(sql, /capture_audit_event\('settlement_id'\)/);
});
