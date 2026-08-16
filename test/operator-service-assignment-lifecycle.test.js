const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');
const lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const lifecycleCss=fs.readFileSync('operator-service-lifecycle.css','utf8');
const workspaceCss=fs.readFileSync('operator-service-workspace-v2.css','utf8');

test('quitar chofer o móvil limpia ambos recursos',()=>{
  assert.match(wizard,/if\(!value\)\{w\.data\.assigned_driver_id='';w\.data\.assigned_truck_id='';markDirty\(\);return render\(\);\}/);
});

test('guardar confirma cambios de asignación dentro de AuxiliOS',()=>{
  assert.match(wizard,/function confirmAssignmentChange/);
  assert.match(wizard,/El servicio pasará a ASIGNADO/);
  assert.match(wizard,/El servicio volverá a SIN ASIGNAR/);
  assert.match(wizard,/¿Confirmar reasignación del servicio\?/);
  assert.match(wizard,/OperatorServiceLifecycleV2\?\.confirmAssignmentChange/);
  assert.match(wizard,/if\(wasEdit&&!await confirmAssignmentChange\(w\)\)return/);
  assert.match(lifecycle,/function confirmAction/);
  assert.match(lifecycle,/Confirmar cambio de asignación/);
  assert.doesNotMatch(wizard,/window\.confirm|[^\.]confirm\('/);
  assert.doesNotMatch(lifecycle,/window\.confirm/);
});

test('confirmación de reasignación queda por encima del workspace',()=>{
  const lifecycleZ=Number(lifecycleCss.match(/\.osl-modal-backdrop\{[^}]*z-index:(\d+)/)?.[1]||0);
  const workspaceZ=Number(workspaceCss.match(/#modal-operador-wizard\.osv2-modal-backdrop\s*\{[^}]*z-index:\s*(\d+)/)?.[1]||0);
  assert.ok(workspaceZ>0,'No se encontró el z-index del workspace');
  assert.ok(lifecycleZ>workspaceZ,`La confirmación (${lifecycleZ}) debe quedar sobre el workspace (${workspaceZ})`);
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

test('después de ARRIBADO sólo Chofer y Móvil quedan bloqueados',()=>{
  assert.match(wizard,/const TRIP_LOCKED=new Set\(\['assigned_driver_id','assigned_truck_id'\]\)/);
  assert.doesNotMatch(wizard,/const TRIP_LOCKED=new Set\(\['company_id','billing_base_id','primary_concept_id'/);
});
