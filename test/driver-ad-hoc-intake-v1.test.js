const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('migrations/20260825213200_driver_ad_hoc_intake_v1.sql');
const connection=read('migrations/20260825183756_integrated_remito_connection_v1.sql');
const supabase=read('supabase.js');
const sigma=read('sigma.js');
const bridge=read('operator-service-bridge.js');
const services=read('operator-services.js');
const orphanCleanup=read('migrations/20260826130000_driver_remito_orphan_cleanup_v1.sql');

test('el ingreso del Chofer es operacional y no fabrica clasificación comercial',()=>{
  assert.match(migration,/create table if not exists public\.driver_service_intakes/);
  assert.match(migration,/status text not null default 'pending_admin'/);
  assert.match(migration,/client_operation_id uuid not null/);
  assert.match(migration,/unique\(driver_id,client_operation_id\)/);
  const table=migration.split('create table if not exists public.driver_service_intakes')[1].split('create index')[0];
  assert.doesNotMatch(table,/company_id|contract_id|rate_card_id|primary_concept_id|estimated_total/);
  assert.doesNotMatch(migration,/alter column company_id drop not null/);
});

test('el guardado ad hoc deriva jornada móvil viaje e identidad en servidor',()=>{
  const rpc=migration.split('create or replace function public.save_driver_ad_hoc_remito_v1')[1].split('revoke all on function public.save_driver_ad_hoc_remito_v1')[0];
  assert.match(rpc,/v_role<>'chofer'/);
  assert.match(rpc,/driver_id=v_uid/);
  assert.match(rpc,/SERVICIO_ASIGNADO/);
  assert.match(rpc,/JORNADA_REQUERIDA/);
  assert.match(rpc,/VIAJE_EN_CURSO/);
  assert.match(rpc,/pg_advisory_xact_lock/);
  assert.match(rpc,/insert into public\.trips/);
  assert.match(rpc,/document_source='driver_ad_hoc'/);
  assert.match(connection,/driver_ad_hoc/);
  assert.match(migration,/revoke all on function public\.save_driver_ad_hoc_remito_v1.*from public,anon/s);
  assert.doesNotMatch(migration,/save_driver_ad_hoc_remito_v1.*to service_role/s);
  assert.match(migration,/alter table public\.driver_service_intakes enable row level security/);
  assert.match(migration,/remitos_driver_intake_id_idx/);
});

test('Administración recibe y vincula sólo con el mismo Chofer y Móvil',()=>{
  assert.match(migration,/list_driver_service_intakes_v1/);
  const link=migration.split('create or replace function public.link_driver_service_intake_v1')[1];
  assert.match(link,/v_role not in \('administracion','operador'\)/);
  assert.match(link,/s\.assigned_driver_id is distinct from i\.driver_id/);
  assert.match(link,/s\.assigned_truck_id is distinct from i\.truck_id/);
  assert.match(link,/service_origin='driver_ad_hoc'/);
  assert.match(link,/administrative_review_status='pending'/);
  assert.match(services,/Ingresos iniciados por Chofer/);
  assert.match(services,/link_driver_service_intake_v1/);
});

test('el mismo contrato viaja por pendiente firma completa y outbox',()=>{
  assert.match(bridge,/abrirRemitoSinAsignacion/);
  assert.match(bridge,/auxilios_driver_ad_hoc_mode/);
  assert.match(supabase,/save_driver_ad_hoc_remito_v1/);
  assert.match(supabase,/guardarRemitoAdHoc/);
  assert.match(sigma,/remito_pendiente/);
  assert.match(sigma,/remito_completo/);
  assert.match(sigma,/remito_firmar/);
  assert.match(sigma,/document_source === 'driver_ad_hoc'/);
});

test('el frontend valida compatibilidad antes de subir evidencia y bloquea envíos duplicados',()=>{
  assert.match(migration,/create or replace function public\.get_driver_remito_capabilities_v1/);
  assert.match(migration,/security invoker/);
  assert.match(migration,/revoke all on function public\.get_driver_remito_capabilities_v1\(\) from public,anon/);
  assert.match(migration,/grant execute on function public\.get_driver_remito_capabilities_v1\(\) to authenticated/);
  assert.match(supabase,/await verificarBackendRemitoDisponible\(operatorServiceId \? 'assigned' : 'ad_hoc'\)/);
  assert.match(supabase,/firma_\$\{nroFinal\}_\$\{storageOperationToken\}\.png/);
  assert.match(supabase,/\$\{storageOperationToken\}_foto_\$\{index\}/);
  assert.match(sigma,/_finalizacionRemitoEnCurso/);
  assert.match(sigma,/document\.getElementById\('rem-btn-next'\)/);
  assert.match(sigma,/btn\.disabled = true/);
  assert.doesNotMatch(sigma,/document\.getElementById\('btn-finalizar'\)/);
});

test('un rechazo posterior a la subida limpia sólo evidencia propia no referenciada',()=>{
  assert.match(supabase,/async function _limpiarEvidenciaRemitoFallido/);
  assert.match(supabase,/\.select\('remito_id,firma_imagen_url,foto_urls'\)/);
  assert.match(supabase,/await _db\.storage\.from\(bucket\)\.remove\(paths\)/);
  assert.match(supabase,/await _limpiarEvidenciaRemitoFallido\(contextoEvidencia\)/);
  assert.match(sigma,/limpiarEvidenciaRemitoFallido/);
  assert.match(sigma,/remito\.client_operation_id \|\| remito\.nro_remito/);
  assert.match(orphanCleanup,/for delete\s+to authenticated/i);
  assert.match(orphanCleanup,/owner_id = auth\.uid\(\)::text/);
  assert.match(orphanCleanup,/not exists \(\s*select 1\s*from public\.remitos/s);
  assert.match(orphanCleanup,/right\(coalesce\(r\.firma_imagen_url/);
  assert.doesNotMatch(orphanCleanup,/to anon|to public/i);
});
