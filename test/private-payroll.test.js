const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const v4 = fs.readFileSync('migrations/20260928140000_particulares_pago_sueldos_v4.sql', 'utf8');
const v5 = fs.readFileSync('migrations/20260928150000_particulares_cobros_por_remito_v5.sql', 'utf8');
const view = fs.readFileSync('payroll-view.js', 'utf8');

test('pagar el total al crear queda como saldo, una seña como seña', () => {
  assert.match(v4, /case when round\(v_deposit, 2\) >= round\(p_quoted_total, 2\) then 'saldo' else 'sena' end/);
});

test('el efectivo cobrado de un particular entra en la rendición del chofer', () => {
  assert.match(v4, /\+app_private\.private_collection_cash_v1\(r\.remito_id\)/);
  assert.match(v4, /c\.status <> 'rejected' and l->>'method' = 'cash'/);
});

test('los particulares con remito firmado cuentan en Sueldos y no se duplican si se facturan', () => {
  assert.match(v4, /where c\.client_kind<>'particular' and s\.assigned_driver_id=p_driver/);
  assert.match(v4, /'id','part:'\|\|s\.service_id/);
  assert.match(v4, /x\.status='firmado'/);
});

test('Sueldos lee los cobros particulares por remito', () => {
  assert.match(v5, /get_private_collections_by_remitos_v1\(p_remito_ids integer\[\]\)/);
  assert.match(view, /get_private_collections_by_remitos_v1/);
});
