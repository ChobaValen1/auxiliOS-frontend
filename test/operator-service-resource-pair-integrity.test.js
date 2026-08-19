const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('migrations/20260819134500_operator_service_resource_pair_integrity_v1.sql','utf8');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');

test('base de datos exige Chofer y Móvil como pareja atómica',()=>{
  assert.match(migration,/\(new\.assigned_driver_id is null\) <> \(new\.assigned_truck_id is null\)/);
  assert.match(migration,/Chofer y Móvil deben asignarse juntos/);
});

test('base de datos respeta la jornada abierta del Chofer',()=>{
  assert.match(migration,/where dl\.driver_id = new\.assigned_driver_id/);
  assert.match(migration,/dl\.closed_at is null/);
  assert.match(migration,/v_driver_truck is distinct from new\.assigned_truck_id/);
  assert.match(migration,/El Chofer tiene una jornada activa con otro Móvil/);
});

test('base de datos respeta la jornada abierta del Móvil',()=>{
  assert.match(migration,/where dl\.truck_id = new\.assigned_truck_id/);
  assert.match(migration,/v_truck_driver is distinct from new\.assigned_driver_id/);
  assert.match(migration,/El Móvil tiene una jornada activa con otro Chofer/);
});

test('integridad se aplica tanto al alta como a cambios posteriores',()=>{
  assert.match(migration,/before insert or update of assigned_driver_id, assigned_truck_id/);
  assert.match(migration,/operator_services_validate_resource_pair_v1/);
});

test('frontend continúa resolviendo la pareja en ambos sentidos desde disponibilidad operativa',()=>{
  assert.match(wizard,/get_operator_resource_availability/);
  assert.match(wizard,/current\?\.active_truck_id/);
  assert.match(wizard,/current\?\.active_driver_id/);
});
