const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const lifecycle=fs.readFileSync('operator-service-lifecycle.js','utf8');
const services=fs.readFileSync('operator-services.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const commercial=fs.readFileSync('operator-service-commercial-addons-v1.js','utf8');
const config=fs.readFileSync('config.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const migration=fs.readFileSync('migrations/20260815211500_operator_service_lifecycle_v2.sql','utf8');

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

test('runtime carga sólo lifecycle canónico y cache v187',()=>{
  assert.match(config,/operator-service-lifecycle\.js/);
  assert.match(sw,/operator-service-lifecycle\.css/);
  assert.match(sw,/auxilios-v187/);
  assert.doesNotMatch(config,/phase3-journey-start-guard|phase3b-modal-visibility-guard|operator-service-creation-redesign/);
});
