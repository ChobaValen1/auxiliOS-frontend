const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/20260804161000_service_editing_and_tolls.sql');
const services = read('operator-services.js');
const editor = read('operator-service-edit.js');
const editorCss = read('operator-service-edit.css');
const tolls = read('toll-management.js');
const tollsCss = read('toll-management.css');
const config = read('config.js');
const pkg = read('package.json');
const sw = read('sw.js');

test('la edición de servicios abiertos queda auditada y protegida por RPC', () => {
  assert.match(migration, /create table if not exists public\.operator_service_changes/i);
  assert.match(migration, /before_values jsonb not null/i);
  assert.match(migration, /after_values jsonb not null/i);
  assert.match(migration, /changed_fields text\[\]/i);
  assert.match(migration, /create or replace function public\.update_operator_service/i);
  assert.match(migration, /v_role not in \('administracion','operador'\)/i);
  assert.match(migration, /status in \('completed','cancelled'\)/i);
  assert.match(migration, /El servicio ya está cerrado y no puede editarse/i);
  assert.match(migration, /insert into public\.operator_service_changes/i);
  assert.match(migration, /'service_edit'/i);
  assert.match(migration, /change_reason/i);
});

test('la edición no permite alterar número interno, estado ni asignación', () => {
  const updateBody = migration.split(/create or replace function public\.update_operator_service/i)[1] || '';
  assert.doesNotMatch(updateBody, /service_number\s*=/i);
  assert.doesNotMatch(updateBody, /assigned_driver_id\s*=/i);
  assert.doesNotMatch(updateBody, /assigned_truck_id\s*=/i);
  assert.doesNotMatch(updateBody, /set\s+status\s*=/i);
  assert.match(editor, /El número interno, el estado y la asignación se mantienen fuera de esta edición/);
  assert.doesNotMatch(editor, /name="service_number"/);
  assert.doesNotMatch(editor, /name="status"/);
  assert.doesNotMatch(editor, /name="assigned_driver_id"/);
});

test('los cambios posteriores al inicio requieren motivo y respetan el remito bloqueado', () => {
  assert.match(migration, /v_trip_started boolean/i);
  assert.match(migration, /v_reason_fields text\[\]/i);
  assert.match(migration, /Indicá el motivo de la corrección porque el viaje ya fue iniciado/i);
  assert.match(migration, /v_remito_locked boolean/i);
  assert.match(migration, /v_protected_after_remito text\[\]/i);
  assert.match(migration, /El remito ya está firmado o cerrado/i);
  assert.match(migration, /update public\.trips/i);
  assert.match(migration, /update public\.remitos/i);
  assert.match(editor, /Viaje iniciado/);
  assert.match(editor, /Remito bloqueado/);
  assert.match(editor, /change_reason/);
});

test('el catálogo de peajes conserva ubicaciones, tarifas y vigencias históricas', () => {
  assert.match(migration, /create table if not exists public\.toll_locations/i);
  assert.match(migration, /create table if not exists public\.toll_rates/i);
  assert.match(migration, /vehicle_category text not null/i);
  assert.match(migration, /payment_method text not null/i);
  assert.match(migration, /valid_from date not null/i);
  assert.match(migration, /valid_until date/i);
  assert.match(migration, /unique \(toll_id, vehicle_category, payment_method, valid_from\)/i);
  assert.match(migration, /update public\.toll_rates[\s\S]*valid_until = v_from - 1/i);
  assert.match(migration, /insert into public\.toll_rates/i);
  assert.doesNotMatch(tolls, /\.from\('toll_rates'\)\.update/);
  assert.match(tolls, /save_toll_rate/);
  assert.match(tolls, /El importe anterior se conserva en el historial/);
});

test('los peajes aplicados al servicio quedan como snapshot y disparan recotización', () => {
  assert.match(migration, /create table if not exists public\.operator_service_tolls/i);
  assert.match(migration, /toll_name_snapshot text not null/i);
  assert.match(migration, /unit_amount numeric/i);
  assert.match(migration, /total_amount numeric.*generated always/i);
  assert.match(migration, /source in \('planned','actual','manual'\)/i);
  assert.match(migration, /app_private\.calculate_operator_service_quote_full/i);
  assert.match(migration, /perform app_private\.sync_operator_service_items_from_quote/i);
  assert.match(migration, /toll_estimate = coalesce/i);
  assert.match(migration, /company_estimated_total = coalesce/i);
  assert.match(editor, /Los valores seleccionados quedan congelados en el servicio/);
  assert.match(editor, /Carga manual/);
  assert.match(editor, /Peajes reales informados/);
});

test('las tablas nuevas no admiten escritura directa de usuarios autenticados', () => {
  for (const table of ['operator_service_changes', 'toll_locations', 'toll_rates', 'operator_service_tolls']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`, 'i'));
  }
  assert.doesNotMatch(migration, /grant\s+(insert|update|delete)[^;]*(operator_service_changes|toll_locations|toll_rates|operator_service_tolls)/i);
  assert.match(migration, /Solo administración puede gestionar el catálogo de peajes/i);
  assert.match(migration, /Solo administración puede gestionar los importes de peajes/i);
});

test('administración y operador gestionan servicios; supervisión queda en lectura', () => {
  assert.match(services, /canRead=\(\)=>\['administracion','supervision','operador'\]/);
  assert.match(services, /canManage=\(\)=>\['administracion','operador'\]/);
  assert.doesNotMatch(services, /canManage=\(\)=>\[[^\]]*supervision/);
  assert.match(services, /rpc\('update_operator_service_assignment'/);
  assert.match(services, /rpc\('cancel_operator_service'/);
  assert.doesNotMatch(services, /from\('operator_services'\)\.update/);
  assert.match(editor, /\['administracion','operador'\]\.includes\(role\(\)\)/);
  assert.match(tolls, /canManage=\(\)=>role\(\)==='administracion'/);
});

test('el editor usa el contexto y la actualización transaccional del backend', () => {
  assert.match(editor, /get_operator_service_edit_context/);
  assert.match(editor, /list_toll_catalog/);
  assert.match(editor, /update_operator_service/);
  assert.match(editor, /p_service_id:STATE\.serviceId/);
  assert.match(editor, /p_payload:payload/);
  assert.match(editor, /p_reason:reason/);
  assert.doesNotMatch(editor, /\.from\('operator_services'\)\.update/);
  assert.doesNotMatch(editor, /\.from\('operator_service_tolls'\)\.(insert|update|delete)/);
  assert.match(editor, /O\.loadServices/);
  assert.match(editor, /O\.openDetail/);
});

test('el módulo de peajes ofrece lectura amplia y gestión administrativa', () => {
  assert.match(tolls, /nav-peajes/);
  assert.match(tolls, /screen-peajes/);
  assert.match(tolls, /list_toll_catalog/);
  assert.match(tolls, /save_toll_location/);
  assert.match(tolls, /save_toll_rate/);
  assert.match(tolls, /Mostrar inactivos/);
  assert.match(tolls, /Historial/);
  assert.match(tolls, /Nueva vigencia tarifaria/);
  assert.match(tolls, /\['administracion','operador','supervision','facturacion'\]\.includes\(role\(\)\)/);
  assert.match(tollsCss, /position:\s*sticky/i);
  assert.match(tollsCss, /@media/i);
});

test('los módulos forman parte del arranque, CI y caché PWA', () => {
  assert.match(config, /auxilios-operator-service-edit/);
  assert.match(config, /operator-service-edit\.js/);
  assert.match(config, /auxilios-toll-management/);
  assert.match(config, /toll-management\.js/);
  assert.match(pkg, /node --check operator-service-edit\.js/);
  assert.match(pkg, /node --check toll-management\.js/);
  assert.match(sw, /auxilios-v117/);
  for (const asset of ['operator-service-edit.js', 'operator-service-edit.css', 'toll-management.js', 'toll-management.css']) {
    assert.match(sw, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(editorCss, /#ose-modal\[hidden\]/);
  assert.match(editorCss, /@media/i);
});
