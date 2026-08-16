const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');

test('quitar chofer o móvil limpia ambos recursos',()=>{
  assert.match(wizard,/if\(!value\)\{w\.data\.assigned_driver_id='';w\.data\.assigned_truck_id='';markDirty\(\);return render\(\);\}/);
});

test('guardar confirma todos los cambios de asignación que cambian estado o recursos',()=>{
  assert.match(wizard,/function confirmAssignmentChange/);
  assert.match(wizard,/El servicio pasará a ASIGNADO/);
  assert.match(wizard,/El servicio volverá a SIN ASIGNAR/);
  assert.match(wizard,/¿Confirmar reasignación del servicio\?/);
  assert.match(wizard,/if\(wasEdit&&!await confirmAssignmentChange\(w\)\)return/);
});
