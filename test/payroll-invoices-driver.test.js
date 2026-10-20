const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const migration=fs.readFileSync('migrations/20261020100000_payroll_invoices_driver_from_assignment.sql','utf8');

test('Sueldos: la fuente de facturas encuentra al chofer de un servicio finalizado (remito firmado, asignado o última asignación)',()=>{
  // Al finalizar, assigned_driver_id queda vacío: comparar sólo contra él no encontraba ningún servicio facturado.
  assert.match(migration,/payroll_matrix_sources_core\(uuid,date,date\)/);
  assert.match(migration,/\(s\.assigned_driver_id=p_driver or \(s\.driver_activated/);
  assert.match(migration,/coalesce\(\(select x\.driver_id from public\.remitos x where x\.operator_service_id=s\.service_id and x\.status='firmado'/);
  assert.match(migration,/s\.assigned_driver_id,\(select oa\.driver_id from public\.operator_service_assignments oa/);
  assert.match(migration,/raise exception 'payroll_matrix_sources_core: texto no encontrado'/);
  assert.match(migration,/position\('operator_service_assignments' in d\) = 0/);
});
