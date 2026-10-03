const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const sql = fs.readFileSync('migrations/20260928230000_chofer_liberado_al_firmar_v1.sql', 'utf8');

test('con el remito firmado el chofer queda libre y el servicio sale de su cola', () => {
  assert.match(sql, /function app_private\.service_driver_done_v1\(p_service_id uuid\)/);
  assert.match(sql, /r\.status = 'firmado' or r\.firmado_at is not null/);
  // Asignación, disponibilidad y remito sin asignación ya no lo cuentan como ocupado.
  assert.match(sql, /validate_operator_service_resource_pair_v1/);
  assert.match(sql, /get_operator_resource_availability/);
  assert.match(sql, /save_driver_ad_hoc_remito_v1/);
  assert.match(sql, /and not app_private\.service_driver_done_v1\(s\.service_id\);\s*return v_result;/);
});

test('el chofer ya no edita el remito firmado', () => {
  assert.match(sql, /get_driver_signed_remito_edit_v1\(uuid\)/);
  assert.match(sql, /update_driver_signed_remito_v1\(uuid,jsonb,uuid\)/);
  assert.match(sql, /El remito ya está firmado\. Las correcciones las hace Operaciones\./);
  // Cada parche falla si no encuentra lo que tiene que cambiar.
  assert.equal((sql.match(/if n = d then raise exception/g) || []).length, 5);
});
