const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');
const lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const lifecycleCss=fs.readFileSync('operator-service-lifecycle.css','utf8');

test('quitar chofer o móvil limpia ambos recursos',()=>{
  assert.match(wizard,/if\(!value\)\{w\.data\.assigned_driver_id='';w\.data\.assigned_truck_id='';markDirty\(\);return render\(\);\}/);
});

test('la jornada activa vuelve a enlazar chofer y móvil antes de asignar',()=>{
  assert.match(wizard,/async function loadResourceAvailability\(\)/);
  assert.match(wizard,/get_operator_resource_availability/);
  assert.match(wizard,/active_truck_id/);
  assert.match(wizard,/active_driver_id/);
  assert.match(wizard,/if\(mode==='edit'\)await loadResourceAvailability\(\)/);
  assert.match(wizard,/await loadResourceAvailability\(\);render\(\);window\.dispatchEvent/);
});

test('seleccionar chofer o móvil resuelve su pareja en memoria sin una consulta de red por click',()=>{
  const assignment=wizard.split('function setAssignment(kind,value)')[1].split("window.addEventListener('beforeunload'")[0];
  assert.match(assignment,/current\?\.active_truck_id/);
  assert.match(assignment,/current\?\.active_driver_id/);
  assert.match(assignment,/w\.data\.assigned_truck_id=String\(current\.active_truck_id\)/);
  assert.match(assignment,/w\.data\.assigned_driver_id=String\(current\.active_driver_id\)/);
  assert.doesNotMatch(assignment,/_db\.rpc|get_operator_resource_availability|await/);
  assert.doesNotMatch(wizard,/async function setAssignment/);
});

test('guardar confirma cambios de asignación dentro de AuxiliOS',()=>{
  assert.match(wizard,/function confirmAssignmentChange/);
  assert.match(wizard,/El servicio pasará a ASIGNADO/);
  assert.match(wizard,/El servicio volverá a SIN ASIGNAR/);
  assert.match(wizard,/¿Confirmar reasignación del servicio\?/);
  assert.match(wizard,/OperatorServiceLifecycleV2\?\.confirmAssignmentChange/);
  assert.match(wizard,/if\(wasEdit&&!await confirmAssignmentChange\(w\)\)return/);
  assert.doesNotMatch(wizard,/window\.confirm|[^\.]confirm\('/);
  assert.doesNotMatch(lifecycle,/window\.confirm/);
});

test('confirmación de reasignación es una card inline y no un overlay bloqueante',()=>{
  assert.match(lifecycle,/function confirmAssignmentChange\(message\)/);
  assert.match(lifecycle,/\.assignment-grid/);
  assert.match(lifecycle,/osl-assignment-inline/);
  assert.match(lifecycle,/data-osl-assignment-confirm/);
  assert.match(lifecycle,/data-osl-assignment-cancel/);
  assert.match(lifecycleCss,/\.osv4-reactive \.osl-assignment-inline/);
  const assignmentFn=lifecycle.split('function confirmAssignmentChange(message)')[1].split('function onWorkspaceOpened')[0];
  assert.doesNotMatch(assignmentFn,/openModal\s*\(|confirmAction\s*\(/);
});

test('guardar servicio cierra el workspace y vuelve siempre a la tabla general',()=>{
  assert.match(wizard,/function performCloseWorkspace\(\)\{hideWorkspaceModal\(\);resetShell\(\);S\.wizard=null;S\.selected=null;return true;\}/);
  assert.match(wizard,/performCloseWorkspace\(\);S\.view='active';S\.status='all';if\(typeof window\.goTo==='function'\)window\.goTo\('operaciones'\);await loadServices\(\)/);
  assert.doesNotMatch(wizard,/if\(wasEdit&&id\)await openView\(id\)/);
  assert.match(wizard,/modal\.hidden=true;modal\.style\.display='none'/);
});

test('salir con cambios pendientes también usa confirmación interna',()=>{
  assert.match(wizard,/title:'Salir sin guardar'/);
  assert.match(wizard,/OperatorServiceLifecycleV2\?\.confirmAction/);
  assert.doesNotMatch(wizard,/confirm\('Hay cambios sin guardar/);
});

test('reasignación sigue permitida en ASIGNADO y se bloquea desde ARRIBADO',()=>{
  assert.match(wizard,/const TRIP_LOCKED=new Set\(\['assigned_driver_id','assigned_truck_id'\]\)/);
  assert.match(wizard,/TRIP_LOCKED\.has\(key\)&&w\.serviceStatus&&!\['pending','assigned'\]\.includes\(w\.serviceStatus\)/);
  assert.doesNotMatch(wizard,/w\.locks\?\.trip_started&&TRIP_LOCKED/);
});
