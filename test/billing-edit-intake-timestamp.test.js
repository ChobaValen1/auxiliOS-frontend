const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const migration=fs.readFileSync('supabase/migrations/20260911124327_billing_edit_intake_timestamp_and_rpc_grants_v1.sql','utf8');
const wizard=fs.readFileSync('operator-service-wizard.js','utf8');
const billing=fs.readFileSync('operator-billing.js','utf8');
const workspace=fs.readFileSync('operator-service-workspace-reactive-v1.js','utf8');
const services=fs.readFileSync('operator-services.js','utf8');

test('el alta desde remito conserva la fecha y hora original del documento',()=>{
  assert.match(migration,/'scheduled_for',coalesce\(/);
  assert.match(migration,/p_remito->>'created_at_device'/);
  assert.match(migration,/p_remito->>'created_at'/);
  assert.match(migration,/p_intake->>'created_at_device'/);
  assert.match(migration,/p_intake->>'created_at'/);
  assert.match(migration,/'created_at_device',r\.created_at_device/);
  assert.match(wizard,/Object\.assign\(w\.data,service,\{scheduled_for:localDateTime\(service\.scheduled_for\)/);
  assert.match(wizard,/typeof intake==='string'\?intake:intake\?\.intake_id/);
  assert.match(wizard,/OperatorServiceWorkspaceV2\?\.hydrate\?\.\(\)/);
  assert.match(workspace,/const hydrate=\(\)=>sync\(true\)/);
  assert.match(workspace,/if\(force&&\('defaultValue'in el\)\)el\.defaultValue=next/);
  assert.match(services,/openWizard\?\.\(intakeId\)/);
});

test('el contexto del ingreso es authenticated-only y fuerza recarga de PostgREST',()=>{
  assert.match(migration,/revoke all on function public\.get_driver_service_intake_context_v1\(uuid\) from public,anon/);
  assert.match(migration,/grant execute on function public\.get_driver_service_intake_context_v1\(uuid\) to authenticated/);
  assert.match(migration,/notify pgrst,'reload schema'/);
  assert.doesNotMatch(migration,/grant execute on function public\.get_driver_service_intake_context_v1\(uuid\) to anon/);
});

test('Facturación abre el editor administrativo específico y vuelve a revisión',()=>{
  assert.match(billing,/window\.editarServicioFacturacion\(id\)/);
  assert.match(wizard,/get_operator_billing_service_edit_context_v1/);
  assert.match(wizard,/update_operator_billing_service_v1/);
  assert.match(wizard,/Volvió a revisión antes de Facturación/);
  assert.match(migration,/v_role<>'administracion'/);
  assert.match(migration,/s\.billing_status='invoiced'/);
  assert.match(migration,/s\.status='cancelled'/);
  assert.match(migration,/completed_at=s\.completed_at/);
  assert.match(migration,/administrative_review_status='pending'/);
  assert.match(migration,/billing_status='not_ready'/);
  assert.match(migration,/transaction_timestamp\(\)/);
});
