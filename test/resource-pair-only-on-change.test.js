'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('guardar la revisión no vuelve a controlar Chofer/Móvil si no cambiaron', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261014130000_resource_pair_only_on_change_v1.sql'), 'utf8');
  assert.match(sql, /validate_operator_service_resource_pair_v1/);
  assert.match(sql, /tg_op = ''UPDATE'' and new\.assigned_driver_id is not distinct from old\.assigned_driver_id/);
  assert.match(sql, /new\.assigned_truck_id is not distinct from old\.assigned_truck_id/);
  assert.match(sql, /if n=d then raise exception/);
});

test('el código de prestadora se guarda sin espacios ni tabulaciones al final', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261014140000_trim_operator_service_order_number_v1.sql'), 'utf8');
  assert.ok(sql.includes("btrim(new.service_order_number, E' \\t\\r\\n\\u00a0')"));
  assert.match(sql, /before insert or update of service_order_number on public\.operator_services/);
});
