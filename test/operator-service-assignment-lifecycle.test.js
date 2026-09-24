const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');
const lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const vm=require('node:vm');
function runtime(){const O={S:{drivers:[{user_id:'d1',active_truck_id:1,active_log_id:1},{user_id:'d2',active_truck_id:2,active_log_id:2},{user_id:'manual'}],trucks:[{truck_id:1,active_driver_id:'d1',active_log_id:1},{truck_id:2,active_driver_id:'d2',active_log_id:2},{truck_id:3}],wizard:{mode:'create',data:{},dirty:false}},num:Number};const notices=[];const window={OperatorServices:O,addEventListener:()=>{},OperatorServiceWorkspaceV2:{render:()=>{}}};vm.runInNewContext(wizard,{window,document:{getElementById:()=>null},toast:m=>notices.push(m),setTimeout:()=>0,clearTimeout:()=>{},console,crypto:require('node:crypto').webcrypto});return{O,window,notices};}
const lifecycleCss=fs.readFileSync('operator-service-lifecycle.css','utf8');

test('quitar chofer o móvil limpia ambos recursos',()=>{const {O}=runtime();for(const kind of ['driver','truck']){const pair=O.pairedResources(kind,'',{assigned_driver_id:'d1',assigned_truck_id:'1'});assert.equal(pair.assigned_driver_id,'');assert.equal(pair.assigned_truck_id,'');}});

test('la jornada activa vuelve a enlazar chofer y móvil antes de asignar',()=>{
  assert.match(wizard,/async function loadResourceAvailability\(\)/);
  assert.match(wizard,/get_operator_resource_availability/);
  assert.match(wizard,/active_truck_id/);
  assert.match(wizard,/active_driver_id/);
  assert.match(wizard,/if\(mode==='edit'\)await loadResourceAvailability\(\)/);
  assert.match(wizard,/await loadResourceAvailability\(\);if\(S\.wizard!==w\)return;w\.busy=false;render\(\);if\(intakeId\)window\.OperatorServiceWorkspaceV2\?\.hydrate\?\.\(\);window\.dispatchEvent/);
});

test('chofer y móvil autocompletan la pareja de jornada y permiten la asignación manual',()=>{const {O}=runtime();let pair=O.pairedResources('driver','d1',{});assert.equal(pair.assigned_truck_id,'1');pair=O.pairedResources('truck','2',pair);assert.equal(pair.assigned_driver_id,'d2');pair=O.pairedResources('driver','manual',pair);assert.equal(pair.assigned_truck_id,'');pair=O.pairedResources('truck','3',pair);assert.equal(pair.assigned_driver_id,'manual');assert.equal(pair.assigned_truck_id,'3');assert.equal(O.resourceHint('driver','manual'),'Disponible · Sin jornada abierta');});
test('crear sin prestadora muestra un aviso y conserva el formulario',async()=>{const {O,window,notices}=runtime();await window.guardarServicioWorkspace();assert.match(notices[0],/Completá prestadora/);assert.ok(O.S.wizard);});

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
  assert.match(wizard,/performCloseWorkspace\(\);if\(returnToBilling\).*window\.goTo\('facturacion'\).*return;}S\.view='active';S\.status='all';S\.selectedIntakeId=null;if\(typeof window\.goTo==='function'\)window\.goTo\('operaciones'\);await loadServices\(\)/s);
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
