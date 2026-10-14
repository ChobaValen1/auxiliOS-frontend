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
