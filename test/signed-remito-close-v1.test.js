const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const migration=read('migrations/20260830230000_signed_remito_close_v1.sql');
const bridge=read('operator-service-bridge.js');
const review=read('operator-remito-review-v2.js');
const services=read('operator-services.js');

test('la cola del Chofer no permite completar dos veces un remito firmado',()=>{
  assert.match(migration,/get_driver_operator_queue_v3/);
  assert.match(migration,/'can_complete_remito'[\s\S]*remito_status[\s\S]*<> 'firmado'/);
  assert.match(migration,/'can_edit_remito'[\s\S]*status[\s\S]*= 'at_origin'[\s\S]*remito_status[\s\S]*= 'firmado'/);
  assert.match(bridge,/Editar remito/);
  assert.match(bridge,/Este remito ya no se puede completar/);
});

test('la corrección firmada acepta sólo cargos evidencia y observaciones',()=>{
  assert.match(migration,/not in \('addons_version','observations','tolls','excesses','evidence'\)/);
  assert.match(migration,/La corrección contiene campos bloqueados del remito/);
  assert.match(migration,/driver_remito_corrected/);
  assert.match(migration,/addons_review_status = 'pending'/);
  assert.match(bridge,/update_driver_signed_remito_v1/);
  assert.doesNotMatch(bridge,/payload\.customer_name|payload\.vehicle_plate|payload\.signature_url/);
});

test('Servicios muestra el firmado y cierra documento servicio viaje y recursos atómicamente',()=>{
  assert.match(services,/Ver remito firmado/);
  assert.match(review,/Remito firmado/);
  assert.match(review,/Revisión y cierre/);
  assert.match(review,/resolve_operator_service_document_v4/);
  assert.match(review,/approve_and_finalize/);
  assert.match(migration,/remito_approved_and_service_finalized/);
  assert.match(migration,/document_status = 'approved'/);
  assert.match(migration,/status = case when status='at_origin' then 'completed'/);
  assert.match(migration,/billing_status = 'pending'/);
  assert.match(migration,/assigned_driver_id = case when status='at_origin' then null/);
  assert.match(migration,/fecha_hora_fin = coalesce/);
  assert.match(migration,/guard_signed_remito_atomic_finalize_v1/);
});

test('Operaciones y Administración pueden resolver y el doble clic es idempotente',()=>{
  assert.match(migration,/v_role not in \('administracion','operador'\)/);
  assert.match(migration,/s\.status = 'completed' and s\.document_status = 'approved'/);
  assert.match(migration,/'idempotent',true/);
  assert.match(review,/\['administracion','operador'\]\.includes\(role\(\)\)/);
});
