const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const lifecycleCss=fs.readFileSync('operator-service-lifecycle.css','utf8');
const services=fs.readFileSync('operator-services.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const commercial=fs.readFileSync('operator-service-commercial-addons-v1.js','utf8');
const config=fs.readFileSync('config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const migration=fs.readFileSync('migrations/20260815211500_operator_service_lifecycle_v2.sql','utf8');
const operatorOnly=fs.readFileSync('migrations/20260815224000_operator_only_service_transitions_v2.sql','utf8');
const quickAssignment=fs.readFileSync('migrations/20260816002000_operator_service_quick_assignment_v2.sql','utf8');

test('mesa operativa expone sólo los cinco estados acordados',()=>{
  for(const label of ['Sin asignar','Asignado','Arribado','Finalizado','Anulado'])assert.match(services,new RegExp(label));
  assert.match(services,/\['pending','Sin asignar'\]/);
  assert.match(services,/\['assigned','Asignados'\]/);
  assert.match(services,/\['at_origin','Arribados'\]/);
  assert.doesNotMatch(services,/\['en_route','En camino'\]|\['loaded','Cargados'\]|\['at_destination','En destino'\]/);
  assert.match(services,/Anular servicio/);
});

test('ARRIBADO manual tiene exactamente tres motivos y ANULADO cinco',()=>{
  assert.match(lifecycle,/client_cannot_or_will_not_sign','Cliente\/Socio no pudo o no quiso firmar/);
  assert.match(lifecycle,/signature_technical_issue','Problema técnico con la firma/);
  assert.match(lifecycle,/operator_provider_confirmed','Arribo confirmado por Operador\/Prestadora/);
  assert.match(lifecycle,/delay','Cancelado por demora/);
  assert.match(lifecycle,/within_authorized_window','Cancelado dentro del tiempo autorizado/);
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
  assert.match(lifecycle,/function openAssignment\(id\)/);
  assert.match(lifecycle,/Asignación actual/);
  assert.match(lifecycle,/Nueva asignación/);
  assert.match(lifecycle,/set_operator_service_assignment_v2/);
  assert.match(lifecycle,/Solo Operador/);
  assert.match(lifecycleCss,/\.osl-quick-status-menu/);
  assert.match(lifecycleCss,/\.osl-assignment-compare/);
});

test('asignación rápida backend es atómica, sólo del Operador y respeta ocupación',()=>{
  assert.match(quickAssignment,/create or replace function public\.set_operator_service_assignment_v2/);
  assert.match(quickAssignment,/v_role <> 'operador'/);
  assert.match(quickAssignment,/s\.status not in \('pending','assigned'\)/);
  assert.match(quickAssignment,/El Chofer ya está ocupado en otro servicio activo/);
  assert.match(quickAssignment,/El Móvil ya está ocupado en otro servicio activo/);
  assert.match(quickAssignment,/assigned_driver_id=p_driver_id/);
  assert.match(quickAssignment,/assigned_truck_id=p_truck_id/);
  assert.match(quickAssignment,/event_type,from_status,to_status,notes,details,created_by/);
});

test('historial y acciones quedan integrados al workspace canónico',()=>{
  assert.match(workspace,/osv4-lifecycle-slot/);
  assert.match(lifecycle,/get_operator_service_history_v2/);
  assert.match(lifecycle,/auxilios:service-workspace-opened/);
  assert.match(lifecycle,/osv4-lifecycle-slot/);
  assert.match(commercial,/data-ca="lifecycle-arrive"/);
  assert.match(commercial,/data-ca="lifecycle-finalize"/);
  assert.match(commercial,/data-ca="lifecycle-annul"/);
  assert.match(commercial,/Guardá los cambios antes de cambiar el estado/);
});

test('las transiciones operativas quedan reservadas al Operador',()=>{
  assert.match(services,/const canTransitionState=\(\)=>role\(\)==='operador'/);
  assert.match(commercial,/canTransitionState/);
  assert.match(commercial,/if\(canTransition&&!closed&&!legacy\)/);
  assert.match(operatorOnly,/v_role <> ''operador''/);
  assert.match(operatorOnly,/Solo el Operador puede cambiar el estado del servicio/);
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

test('runtime carga lifecycle antes de liberar UI y cache v195',()=>{
  const critical=config.split('async function loadCriticalAuxiliosModules()')[1].split('function loadGeographicBasesInBackground')[0];
  assert.match(critical,/operator-service-lifecycle\.js/);
  assert.match(sw,/operator-service-lifecycle\.css/);
  assert.match(sw,/auxilios-v195/);
  assert.doesNotMatch(config,/phase3-journey-start-guard|phase3b-modal-visibility-guard|operator-service-creation-redesign/);
});
