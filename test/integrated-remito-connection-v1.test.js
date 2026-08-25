const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('migrations/20260825183756_integrated_remito_connection_v1.sql');
const supabase=read('supabase.js');
const sigma=read('sigma.js');
const bridge=read('operator-service-bridge.js');

test('la migración modela origen, revisión y estado documental sin migrar históricos por inferencia',()=>{
  assert.match(migration,/add column if not exists service_origin/);
  assert.match(migration,/driver_ad_hoc/);
  assert.match(migration,/administrative_review_status/);
  assert.match(migration,/document_status/);
  assert.match(migration,/add column if not exists operator_service_id/);
  assert.match(migration,/client_operation_id/);
  assert.match(migration,/where s\.remito_id=r\.remito_id/);
  assert.match(migration,/no se infieren relaciones nuevas/i);
});

test('el guardado canónico es autenticado, idempotente y deriva identidad, jornada y viaje en servidor',()=>{
  assert.match(migration,/create or replace function public\.save_driver_operator_service_remito_v3/);
  assert.match(migration,/v_role<>'chofer'/);
  assert.match(migration,/p_client_operation_id is null/);
  assert.match(migration,/driver_id=v_uid and client_operation_id=p_client_operation_id/);
  assert.match(migration,/perform public\.ensure_operator_service_trip_v2/);
  assert.match(migration,/perform public\.complete_driver_operator_service_fields_v2/);
  assert.match(migration,/trip_id=s\.trip_id/);
  assert.match(migration,/log_id=t\.log_id/);
  assert.match(migration,/revoke all on function public\.save_driver_operator_service_remito_v3.*from public, anon/s);
  assert.match(migration,/grant execute on function public\.save_driver_operator_service_remito_v3.*to authenticated, service_role/s);
  assert.match(migration,/guard_operator_service_document_billing_v1/);
  assert.match(migration,/resolve_operator_service_document_v1/);
  assert.match(migration,/Sólo Administración puede resolver la recepción documental/);
});

test('la conexión automática ya no depende de estados operativos eliminados',()=>{
  const canonical=migration.split('create or replace function app_private.phase3_link_remito()')[1];
  assert.match(canonical,/s\.status in \('assigned','at_origin'\)/);
  assert.doesNotMatch(canonical,/en_route|loaded|at_destination/);
});

test('frontend conserva service_id y client_operation_id en pendiente, firma y outbox',()=>{
  assert.match(supabase,/save_driver_operator_service_remito_v3/);
  assert.match(supabase,/operator_service_id/);
  assert.match(supabase,/client_operation_id/);
  assert.match(sigma,/guardarRemitoPendiente/);
  assert.match(sigma,/guardarRemitoVinculado/);
  assert.match(sigma,/remito_pendiente/);
  assert.match(sigma,/remito_firmar/);
  assert.match(bridge,/Pendiente de sincronización/);
  assert.doesNotMatch(bridge,/link_operator_service_remito/);
  assert.match(read('operator-services.js'),/list_operator_service_document_connections_v1/);
  assert.match(read('operator-services.js'),/Aprobar excepción sin remito/);
});
