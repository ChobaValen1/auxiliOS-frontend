const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const lifecycleCss=fs.readFileSync('operator-service-lifecycle.css','utf8');
const services=fs.readFileSync('operator-services.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const commercial=fs.readFileSync('operator-service-commercial-addons-v1.js','utf8');
const commercialCss=fs.readFileSync('operator-service-commercial-addons-v1.css','utf8');
const config=fs.readFileSync('config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const migration=fs.readFileSync('migrations/20260815211500_operator_service_lifecycle_v2.sql','utf8');
const quickAssignment=fs.readFileSync('migrations/20260816002000_operator_service_quick_assignment_v2.sql','utf8');
const adminTransitions=fs.readFileSync('migrations/20260816015500_admin_operator_service_transitions_v2.sql','utf8');

test('mesa operativa expone sólo los cinco estados acordados',()=>{
  for(const label of ['Sin asignar','Asignado','Arribado','Finalizado','Anulado'])assert.match(services,new RegExp(label));
  assert.match(services,/\['pending','Sin asignar'\]/);
  assert.match(services,/\['assigned','Asignados'\]/);
  assert.match(services,/\['at_origin','Arribados'\]/);
  assert.doesNotMatch(services,/\['en_route','En camino'\]|\['loaded','Cargados'\]|\['at_destination','En destino'\]/);
  assert.match(services,/Anular servicio/);
});

test('ARRIBADO manual tiene exactamente tres motivos y ANULADO cuatro',()=>{
  assert.match(lifecycle,/client_cannot_or_will_not_sign','Cliente\/Socio no pudo o no quiso firmar/);
  assert.match(lifecycle,/signature_technical_issue','Problema técnico con la firma/);
  assert.match(lifecycle,/operator_provider_confirmed','Arribo confirmado por Operador\/Prestadora/);
  assert.match(lifecycle,/delay','Cancelado por demora/);
  assert.doesNotMatch(lifecycle,/within_authorized_window/);
  assert.match(lifecycle,/cancelled_by_us','Cancelado por nosotros/);
  assert.match(lifecycle,/client_or_provider','Cancelado por el cliente \/ prestadora/);
  assert.match(lifecycle,/\['other','Otro motivo'\]/);
  assert.match(lifecycle,/reason==='other'.*detail\.required=other/s);
});

test('lifecycle usa una sola RPC canónica y eliminó cierres por excepción viejos',()=>{
  assert.match(lifecycle,/transition_operator_service_v2/);
  assert.match(lifecycle,/arrive_manual/);
  assert.match(lifecycle,/finalize/);
  assert.match(lifecycle,/annul/);
  assert.doesNotMatch(lifecycle,/close_operator_service_exception|review_operator_service_closure|reassign_operator_service|MutationObserver|No se pudo completar/);
});

test('las confirmaciones quedan ligadas a la pantalla que las dispara',()=>{
  assert.match(lifecycle,/function captureModalContext\(\)/);
  assert.match(lifecycle,/function sameModalContext\(ctx=state\.modalContext\)/);
  assert.match(lifecycle,/function mountModalForContext\(m,ctx\)/);
  assert.match(lifecycle,/workspace\.appendChild\(m\)/);
  assert.match(lifecycle,/m\.classList\.add\('osl-workspace-context'\)/);
  assert.match(lifecycle,/function rejectStaleContext\(\)/);
  assert.match(lifecycle,/La pantalla cambió\. Volvé a ejecutar la acción desde donde corresponde\./);
  assert.match(lifecycle,/if\(rejectStaleContext\(\)\)return;close\(true\)/);
  assert.match(lifecycle,/if\(nav&&state\.modal&&!state\.modal\.hidden\)\{close\(false\);return\}/);
  assert.match(lifecycle,/function onWorkspaceOpened\(e\)\{if\(state\.modal&&!state\.modal\.hidden\)close\(false\)/);
  assert.match(lifecycleCss,/#modal-operador-wizard>\.osl-modal-backdrop\.osl-workspace-context/);
});

test('las confirmaciones viven dentro de AuxiliOS y la reasignación del editor no bloquea el workspace',()=>{
  assert.match(lifecycle,/function confirmAction/);
  assert.match(lifecycle,/osl-confirm-copy/);
  assert.match(lifecycle,/function confirmAssignmentChange\(message\)/);
  assert.match(lifecycle,/\.assignment-grid/);
  assert.match(lifecycle,/osl-assignment-inline/);
  assert.match(lifecycle,/data-osl-assignment-confirm/);
  assert.match(lifecycle,/data-osl-assignment-cancel/);
  assert.match(lifecycleCss,/\.osv4-reactive \.osl-assignment-inline/);
  const assignmentFn=lifecycle.split('function confirmAssignmentChange(message)')[1].split('function onWorkspaceOpened')[0];
  assert.doesNotMatch(assignmentFn,/confirmAction\s*\(/);
  assert.doesNotMatch(assignmentFn,/openModal\s*\(/);
  assert.doesNotMatch(lifecycle,/window\.confirm/);
});

test('Estado en la tabla funciona como acción rápida por lifecycle',()=>{
  assert.match(lifecycle,/function quickActions\(s\)/);
  assert.match(lifecycle,/status==='pending'.*\['assign','Asignar'/s);
  assert.match(lifecycle,/status==='assigned'.*\['reassign','Re-asignar'.*\['finalize','Finalizar'/s);
  assert.match(lifecycle,/status==='at_origin'.*\['finalize','Finalizar'/s);
  assert.match(lifecycle,/\.col-status \.os-status/);
  assert.match(lifecycle,/function openAssignment\(id,readOnly=false\)/);
  assert.match(lifecycle,/Asignación actual/);
  assert.match(lifecycle,/Nueva asignación/);
  assert.match(lifecycle,/set_operator_service_assignment_v2/);
  assert.match(lifecycle,/function markReadOnly\(m\)/);
  assert.match(lifecycle,/Modo consulta/);
  assert.match(lifecycle,/const readOnly=!canTransition\(\)/);
  assert.doesNotMatch(lifecycle,/data-osl-quick-action=.*disabled/s);
  assert.match(lifecycleCss,/\.osl-quick-status-menu/);
  assert.match(lifecycleCss,/\.osl-assignment-compare/);
});

test('asignación rápida backend es atómica para Administración y Operador y respeta ocupación',()=>{
  assert.match(quickAssignment,/create or replace function public\.set_operator_service_assignment_v2/);
  assert.match(adminTransitions,/set_operator_service_assignment_v2/);
  assert.match(adminTransitions,/v_role not in \(''operador'',''administracion''\)/);
  assert.match(quickAssignment,/s\.status not in \('pending','assigned'\)/);
  assert.match(quickAssignment,/El Chofer ya está ocupado en otro servicio activo/);
  assert.match(quickAssignment,/El Móvil ya está ocupado en otro servicio activo/);
  assert.match(quickAssignment,/assigned_driver_id=p_driver_id/);
  assert.match(quickAssignment,/assigned_truck_id=p_truck_id/);
  assert.match(quickAssignment,/event_type,from_status,to_status,notes,details,created_by/);
});

test('historial permanece en el workspace pero cambios de estado viven sólo en la mesa',()=>{
  assert.match(workspace,/osv4-lifecycle-slot/);
  assert.match(lifecycle,/get_operator_service_history_v2/);
  assert.match(lifecycle,/auxilios:service-workspace-opened/);
  assert.match(lifecycle,/osv4-lifecycle-slot/);
  assert.doesNotMatch(commercial,/lifecyclePanel|data-ca="lifecycle-arrive"|data-ca="lifecycle-finalize"|data-ca="lifecycle-annul"|Estado del servicio|Guardá los cambios antes de cambiar el estado/);
  assert.doesNotMatch(commercialCss,/osca-lifecycle/);
  assert.match(services,/accionMenuServicio\('arrive'/);
  assert.match(services,/accionMenuServicio\('finalize'/);
  assert.match(services,/accionMenuServicio\('annul'/);
  assert.match(services,/asignarServicioRapido/);
});

test('las transiciones operativas quedan habilitadas para Administración y Operador desde la mesa',()=>{
  assert.match(services,/const canTransitionState=\(\)=>\['administracion','operador'\]\.includes\(role\(\)\)/);
  assert.match(services,/if\(canTransitionState\(\)&&!closed&&!legacy\)/);
  assert.match(adminTransitions,/transition_operator_service_v2/);
  assert.match(adminTransitions,/v_role not in \(''operador'',''administracion''\)/);
  assert.match(adminTransitions,/Solo Operador o Administración puede cambiar el estado del servicio/);
});

test('backend impide transiciones no acordadas y libera recursos al cerrar',()=>{
  assert.match(migration,/old\.status='assigned' and new\.status='pending'/);
  assert.match(migration,/old\.status='assigned' and new\.status='at_origin'/);
  assert.match(migration,/old\.status in \('assigned','at_origin'\) and new\.status='completed'/);
  assert.match(migration,/old\.status in \('pending','assigned','at_origin'\) and new\.status='cancelled'/);
  assert.match(migration,/Solo un servicio ASIGNADO o ARRIBADO puede finalizarse/);
  assert.match(migration,/assigned_driver_id=null,assigned_truck_id=null/);
  assert.match(migration,/billing_status='pending'/);
  assert.match(migration,/billing_status='not_ready'/);
  assert.match(migration,/No se puede confirmar la firma\. Faltan completar/);
});

test('runtime carga lifecycle antes de liberar UI y cache de phase2',()=>{
  const critical=config.split('async function loadCriticalAuxiliosModules()')[1].split('function loadGeographicBasesInBackground')[0];
  assert.match(critical,/operator-service-lifecycle\.js/);
  assert.match(sw,/operator-service-lifecycle\.css/);
  assert.match(sw,/auxilios-billing-phase2-v208/);
  assert.doesNotMatch(config,/phase3-journey-start-guard|phase3b-modal-visibility-guard|operator-service-creation-redesign/);
});
