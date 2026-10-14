'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '20261014150000_multi_service_driver_queue_v1.sql'), 'utf8');

test('varios servicios a la vez: todo detrás de un interruptor por chofer', () => {
  assert.match(sql, /feature_key = 'multi_service_v1' and f\.enabled/);
  for (const fn of ['validate_operator_service_resource_pair_v1', 'set_operator_service_assignment_v2', 'ensure_operator_service_trip_v2',
    'advance_operator_service', 'transition_operator_service_from_desk', 'save_driver_ad_hoc_remito_v1', 'get_driver_operator_queue_v2']) {
    assert.ok(sql.includes(fn), fn);
  }
  // Cada parche falla si no encuentra el texto original.
  assert.equal((sql.match(/raise exception '%: /g) || []).length, 7);
});

test('cola del chofer: lugar guardado, en orden y reordenable por el operador', () => {
  assert.match(sql, /add column if not exists driver_queue_position integer/);
  assert.match(sql, /before insert or update of assigned_driver_id on public\.operator_services/);
  assert.match(sql, /COLA_EN_ORDEN: primero empezá el servicio %/);
  assert.match(sql, /function public\.move_operator_service_queue_v1\(p_service_id uuid, p_direction integer\)/);
  assert.match(sql, /Solo se puede mover un servicio que el chofer todavía no empezó/);
  assert.match(sql, /grant execute on function public\.move_operator_service_queue_v1\(uuid, integer\) to authenticated/);
});
