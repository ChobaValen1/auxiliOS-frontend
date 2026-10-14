'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Servicios muestra la cola solo para choferes con el interruptor', () => {
  const js = read('operator-services.js');
  assert.match(js, /function queueInfo\(s\)\{if\(!s\?\.driver_multi_service/);
  assert.match(js, /if\(key==='status'\)return statusCell\(s\)\+queueMarkup\(s\);/);
  assert.match(js, /\+driverQueueCount\(s\);/);
  assert.match(js, /En curso · \$\{q\.pos\}º de \$\{q\.total\}/);
  assert.match(js, /En cola · \$\{q\.pos\}º\$\{q\.next\?' · siguiente':''\}/);
  assert.match(js, /_db\.rpc\('move_operator_service_queue_v1',\{p_service_id:serviceId,p_direction:direction\}\)/);
  assert.match(js, /moverColaServicio:moveQueue/);
});

test('asignar a un chofer con cola no lo frena y avisa el lugar', () => {
  const wizard = read('operator-service-wizard.js');
  assert.match(wizard, /!\(kind==='driver'\?row\.multi_service:row\.active_service_multi\)\)return`\$\{who\} está ocupado/);
  assert.match(wizard, /'Ocupado · queda en cola'/);
  const lifecycle = read('operator-service-lifecycle.js');
  assert.match(lifecycle, /const \{data:assigned,error\}=await db\(\)\.rpc\('set_operator_service_assignment_v2'/);
  assert.match(lifecycle, /quedó \$\{assigned\.driver_queue_position\}º en la cola de/);
  const sql = read('migrations/20261014160000_multi_service_operator_desk_v1.sql');
  for (const key of ['driver_multi_service', 'trip_started', 'active_service_multi', "''multi_service'', app_private"]) assert.ok(sql.includes(key), key);
});
