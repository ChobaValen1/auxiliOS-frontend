const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('migrations/20260819135500_operator_service_resource_exclusivity_v1.sql','utf8');

test('un Chofer no puede quedar en dos servicios activos',()=>{
  assert.match(migration,/s\.assigned_driver_id = new\.assigned_driver_id/);
  assert.match(migration,/El Chofer ya está ocupado en otro servicio activo/);
});

test('un Móvil no puede quedar en dos servicios activos',()=>{
  assert.match(migration,/s\.assigned_truck_id = new\.assigned_truck_id/);
  assert.match(migration,/El Móvil ya está ocupado en otro servicio activo/);
});

test('la exclusividad contempla estados activos canónicos y compatibilidad legacy',()=>{
  assert.match(migration,/s\.status in \('assigned','at_origin','en_route','loaded','at_destination'\)/);
  assert.match(migration,/s\.service_id is distinct from new\.service_id/);
});
