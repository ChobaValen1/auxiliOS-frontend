const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const js = read('jornadas-admin-tools-v1.js');
const css = read('jornadas-admin-tools-v1.css');
const config = read('config.js');
const sw = read('sw.js');
const migration = read('migrations/20260808115500_admin_journey_corrections_v1.sql');
const impactMigration = read('migrations/20260808194000_journey_correction_impact_propagation_v1.sql');
const fuelResolutionMigration = read('migrations/20260808194500_fuel_correction_journey_resolution_v1.sql');
const securityMigration = read('migrations/20260808195200_journey_admin_rpc_anon_revoke_v1.sql');
const lifecycleMigration = read('migrations/20260808231500_admin_open_journey_close_v1.sql');
const pkg = read('package.json');

test('Administración corrige kilometraje con motivo e impacto anticipado', () => {
  assert.match(js, /update_daily_log_admin/);
  assert.match(js, /get_daily_log_admin_impact/);
  assert.match(js, /km_inicio/);
  assert.match(js, /km_final/);
  assert.match(js, /Motivo de la corrección/);
  assert.match(js, /Requiere revisión/);
  assert.match(migration, /manual_editado/);
});

test('una jornada abierta se edita sin datos de cierre y se cierra por una acción separada', () => {
  assert.match(js, /close_daily_log_admin/);
  assert.match(js, /data-jat-close-journey/);
  assert.match(js, /Jornada abierta/);
  assert.match(js, /se completan únicamente desde <b>Cerrar jornada<\/b>/);
  assert.match(js, /if\(!isOpen\)\{patch\.km_final=/);
  assert.match(lifecycleMigration, /JORNADA_ABIERTA_REQUIERE_CIERRE/);
  assert.match(lifecycleMigration, /daily_logs_lifecycle_consistency/);
  assert.match(lifecycleMigration, /status='open' and km_final is null and hora_fin is null and closed_at is null/);
  assert.match(lifecycleMigration, /status='closed' and km_final is not null and hora_fin is not null and closed_at is not null/);
});

test('el cierre administrativo no fabrica una rendición', () => {
  assert.match(js, /Rendición pendiente de presentación\/revisión/);
  assert.match(js, /no inventará una declaración de efectivo/);
  assert.match(lifecycleMigration, /rendicion_exists/);
  assert.doesNotMatch(lifecycleMigration, /insert\s+into\s+public\.rendicion_cierre/i);
});

test('Anular jornada conserva relaciones y puede restaurarse', () => {
  assert.match(js, /void_daily_log_admin/);
  assert.match(js, /restore_daily_log_admin/);
  assert.match(js, /Anular jornada/);
  assert.match(js, /Jornadas anuladas/);
  assert.match(impactMigration, /void_previous_status/);
  assert.match(impactMigration, /list_voided_daily_logs_admin/);
  assert.doesNotMatch(impactMigration, /delete\s+from\s+public\.daily_logs/i);
});

test('el historial administrativo queda visible', () => {
  assert.match(js, /get_daily_log_admin_history/);
  assert.match(js, /Historial de cambios/);
  assert.match(js, /changedFields/);
  assert.match(impactMigration, /audit_events/);
});

test('Jornada abre el remito con la vista administrativa canónica', () => {
  assert.match(js, /abrirDetalleRemitoAdmin/);
  assert.match(js, /Abrir Remito admin/);
  assert.doesNotMatch(js, /verRemitoModal/);
  assert.doesNotMatch(js, /else if\(typeof verRemito/);
});

test('Jornada usa vistas canónicas y no viewers duplicados para otros registros vinculados', () => {
  assert.match(js, /FleetAdminDetailV2\.openTab/);
  assert.match(js, /openFleetCanonical\('combustible'/);
  assert.match(js, /openFleetCanonical\('neumaticos'/);
  assert.match(js, /openRenditionCanonical/);
  assert.doesNotMatch(js, /function fuelViewer/);
  assert.doesNotMatch(js, /function checklistViewer/);
  assert.doesNotMatch(js, /function renditionViewer/);
});

test('correcciones propagan a odómetro rendición y liquidación según estado', () => {
  assert.match(impactMigration, /recalculate_payroll_impact/);
  assert.match(impactMigration, /estado='pendiente'/);
  assert.match(impactMigration, /review_required=true/);
  assert.match(impactMigration, /adjustment_pending=v_delta/);
  assert.match(impactMigration, /recompute_truck_odometer_after_correction/);
  assert.match(impactMigration, /max\(km_at_load\)/);
  assert.match(impactMigration, /max\(km_at_service\)/);
  assert.match(impactMigration, /trg_daily_logs_impact_sync/);
});

test('Sueldos hace visible una liquidación afectada sin reescribir el snapshot aprobado/pagado', () => {
  assert.match(js, /surfacePayrollReviews/);
  assert.match(js, /review_required/);
  assert.match(js, /Ajuste pendiente/);
  assert.match(js, /Requiere revisión/);
  assert.match(js, /proposed_total/);
  assert.match(js, /adjustment_pending/);
  assert.match(css, /\.jat-payroll-review/);
  assert.match(css, /\.jat-payroll-receipt-review/);
});

test('remitos disparan sincronización también al cambiar importes económicos', () => {
  assert.match(impactMigration, /update of log_id,driver_id,created_at_device,status,imp_peaje,imp_excedente,imp_otros,pago_1_metodo,pago_1_monto,pago_2_metodo,pago_2_monto/);
  assert.match(impactMigration, /sync_rendicion_jornada/);
});

test('combustible resuelve jornada por móvil y fecha cuando falta log_id', () => {
  assert.match(fuelResolutionMigration, /resolve_fuel_journey/);
  assert.match(fuelResolutionMigration, /count\(\*\)=1/);
  assert.match(fuelResolutionMigration, /truck_id=p_truck_id/);
  assert.match(fuelResolutionMigration, /log_date=p_fuel_date/);
});

test('las acciones de mutación quedan limitadas a Administración', () => {
  assert.match(js, /const isAdmin = \(\) => role\(\) === 'administracion'/);
  assert.match(impactMigration, /v_role<>'administracion'/);
  assert.match(lifecycleMigration, /solo Administración puede cerrar jornadas/);
});

test('las RPC administrativas nuevas no son ejecutables por anon', () => {
  assert.match(securityMigration, /get_daily_log_admin_impact\(integer\) from anon/);
  assert.match(securityMigration, /get_daily_log_admin_history\(integer\) from anon/);
  assert.match(securityMigration, /list_voided_daily_logs_admin\(integer\) from anon/);
  assert.match(securityMigration, /restore_daily_log_admin\(integer,text\) from anon/);
  assert.match(securityMigration, /tg_fuel_sync_rendicion\(\) from anon, authenticated/);
  assert.match(lifecycleMigration, /close_daily_log_admin\(integer,jsonb,text\) from anon/);
});

test('el módulo se carga, se precachea y entra en CI', () => {
  assert.match(config, /jornadas-admin-tools-v1\.css/);
  assert.match(config, /jornadas-admin-tools-v1\.js/);
  assert.match(sw, /jornadas-admin-tools-v1\.css/);
  assert.match(sw, /jornadas-admin-tools-v1\.js/);
  assert.match(pkg, /node --check jornadas-admin-tools-v1\.js/);
  const version = sw.match(/auxilios(?:-billing-phase2)?-v(\d+)/);
  assert.ok(version && Number(version[1]) >= 146);
  assert.match(css, /\.jat-history-item/);
  assert.match(css, /\.jat-voided-row/);
});
