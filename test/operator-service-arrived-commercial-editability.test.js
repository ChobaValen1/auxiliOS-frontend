const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const arrived=fs.readFileSync('migrations/20260815214500_arrived_service_editability_v2.sql','utf8');
const commercial=fs.readFileSync('migrations/20260819143000_arrived_commercial_edit_reason_v1.sql','utf8');

test('ARRIBADO permanece editable desde el workspace sin exigir motivo',()=>{
  assert.match(arrived,/v_service\.status <> ''at_origin''/);
  assert.match(arrived,/''requires_reason'',v_service\.status not in \(''pending'',''assigned'',''at_origin''\)/);
  assert.match(commercial,/update_operator_service_base_v2/);
  assert.match(commercial,/v_service\.status <> ''at_origin'' and \(v_service\.trip_id is not null or v_service\.status not in \(''pending'',''assigned''\)\) and v_reason is null/);
});

test('la excepción de ARRIBADO no elimina el gate de motivo en otros estados iniciados',()=>{
  assert.match(commercial,/Indicá el motivo de la corrección porque el viaje ya fue iniciado/);
  assert.match(commercial,/if v_sql=v_before then/);
  assert.match(commercial,/No se encontró el gate de motivo esperado en update_operator_service_base_v2/);
});
