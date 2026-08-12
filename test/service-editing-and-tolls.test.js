const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/20260804161000_service_editing_and_tolls.sql');
const historyMigration = read('migrations/20260804162000_preserve_toll_rate_history.sql');
const betaMigration = read('migrations/20260804163000_service_editing_tolls_private_beta.sql');
const simpleTollsMigration = read('migrations/20260805100000_simple_tolls_workspace.sql');
const services = read('operator-services.js');
const references = read('operator-reference-loader.js');
const editor = read('operator-service-edit.js');
const editorCss = read('operator-service-edit.css');
const tolls = read('toll-management.js');
const tollsCss = read('toll-management.css');
const featureFlags = read('feature-flags.js');
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

test('el catálogo conserva ubicaciones e historial aunque la interfaz use un importe simple', () => {
  assert.match(migration, /create table if not exists public\.toll_locations/i);
  assert.match(migration, /create table if not exists public\.toll_rates/i);
  assert.match(migration, /valid_from date not null/i);
  assert.match(migration, /valid_until date/i);
  assert.match(historyMigration, /update public\.toll_rates[\s\S]*valid_until = v_from - 1/i);
  assert.match(simpleTollsMigration, /create or replace function public\.save_simple_toll/i);
  assert.match(simpleTollsMigration, /v_name text/i);
  assert.match(simpleTollsMigration, /v_address text/i);
  assert.match(simpleTollsMigration, /v_amount numeric/i);
  assert.match(simpleTollsMigration, /vehicle_category = 'light_2_axles'/i);
  assert.match(simpleTollsMigration, /payment_method = 'any'/i);
  assert.match(simpleTollsMigration, /set valid_until = current_date - 1/i);
  assert.match(simpleTollsMigration, /Actualización desde Peajes y Adicionales/i);
  assert.doesNotMatch(tolls, /\.from\('toll_rates'\)\.update/);
});

test('el alta simple y el archivado están protegidos por RPC administrativo', () => {
  assert.match(simpleTollsMigration, /v_role <> 'administracion'/i);
  assert.match(simpleTollsMigration, /El nombre del peaje es obligatorio/i);
  assert.match(simpleTollsMigration, /El importe debe ser igual o mayor a cero/i);
  assert.match(simpleTollsMigration, /create or replace function public\.set_simple_toll_active/i);
  assert.match(simpleTollsMigration, /is_active = coalesce\(p_active, false\)/i);
  assert.match(simpleTollsMigration, /revoke all on function public\.save_simple_toll\(jsonb\) from public, anon/i);
  assert.match(simpleTollsMigration, /grant execute on function public\.save_simple_toll\(jsonb\) to authenticated/i);
  assert.match(simpleTollsMigration, /revoke all on function public\.set_simple_toll_active\(uuid, boolean\) from public, anon/i);
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

test('la mesa conserva los controles actuales de administración y supervisión', () => {
  assert.match(services, /betaEnabled=\(\)=>Boolean\(window\.AuxiliosFeatures\?\.flags\?\.service_editing_tolls_v1\)/);
  assert.match(services, /canRead=\(\)=>\['administracion','supervision'\]\.includes\(role\(\)\)\|\|\(role\(\)==='operador'&&betaEnabled\(\)\)/);
  assert.match(services, /canManage=\(\)=>\['administracion','supervision'\]\.includes\(role\(\)\)\|\|\(role\(\)==='operador'&&betaEnabled\(\)\)/);
  assert.match(services, /rpc\('update_operator_service_assignment'/);
  assert.match(services, /rpc\('cancel_operator_service'/);
  assert.doesNotMatch(services, /from\('operator_services'\)\.update/);
  assert.match(editor, /\['administracion','operador'\]\.includes\(role\(\)\)/);
  assert.match(tolls, /canManage=\(\)=>role\(\)==='administracion'/);
});

test('el operador obtiene referencias acotadas sin Sucursal ni accesos amplios', () => {
  assert.match(references, /get_operator_service_reference_data/);
  assert.match(references, /services\.S\.companies/);
  assert.match(references, /services\.S\.drivers/);
  assert.match(references, /services\.S\.trucks/);
  assert.match(references, /services\.S\.concepts/);
  assert.doesNotMatch(references, /services\.S\.branches|company_branches/);
  assert.match(references, /\['administracion','operador','supervision'\]\.includes\(role\(\)\)/);
  assert.doesNotMatch(references, /\.from\('users'\)/);
  assert.doesNotMatch(references, /\.from\('companies'\)/);
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

test('Peajes y Adicionales muestra el alta junto al registro histórico', () => {
  assert.match(tolls, /Peajes y Adicionales/);
  assert.match(tolls, /id="tm-simple-form"/);
  assert.match(tolls, /Nombre del peaje \*/);
  assert.match(tolls, /Dirección/);
  assert.match(tolls, /Importe \*/);
  assert.match(tolls, /Todos los peajes cargados/);
  assert.match(tolls, /p_include_inactive:true/);
  assert.match(tolls, /save_simple_toll/);
  assert.match(tolls, /set_simple_toll_active/);
  assert.match(tolls, /Permanecerá visible en el historial/);
  assert.match(tolls, /data-tm-section="additionals"/);
  assert.match(tolls, /Próxima configuración/);
  assert.match(tolls, /\['administracion','operador','supervision','facturacion'\]\.includes\(role\(\)\)/);
  assert.doesNotMatch(tolls, /data-tm-new/);
  assert.doesNotMatch(tolls, /Nueva vigencia tarifaria/);
  assert.match(tollsCss, /\.tm-workspace/);
  assert.match(tollsCss, /position:\s*sticky/i);
  assert.match(tollsCss, /@media/i);
});

test('la edición de servicio queda bajo bandera individual y Peajes es configuración canónica', () => {
  assert.match(betaMigration, /'service_editing_tolls_v1'/);
  assert.match(betaMigration, /lower\(u\.email\) = 'admin@sigmaremolques\.com'/i);
  assert.doesNotMatch(betaMigration, /supervisor@sigmaremolques\.com/i);
  assert.doesNotMatch(betaMigration, /where[\s\S]{0,160}role/i);
  assert.match(featureFlags, /flags\.service_editing_tolls_v1/);
  assert.match(featureFlags, /operator-reference-loader\.js/);
  assert.match(featureFlags, /operator-service-edit\.css/);
  assert.match(featureFlags, /operator-service-edit\.js/);
  assert.doesNotMatch(featureFlags, /toll-management/);
  assert.doesNotMatch(featureFlags, /admin@sigmaremolques\.com/);
  assert.doesNotMatch(config, /auxilios-operator-reference-loader/);
  assert.doesNotMatch(config, /auxilios-operator-service-edit/);
  assert.match(config, /auxilios-toll-management/);
  assert.match(config, /auxilios-feature-flags/);
});

test('los módulos forman parte de CI y PWA sin duplicar la carga de Peajes', () => {
  assert.match(pkg, /node --check operator-reference-loader\.js/);
  assert.match(pkg, /node --check operator-service-edit\.js/);
  assert.match(pkg, /node --check toll-management\.js/);
  assert.match(sw, /auxilios-v1[2-9]\d/);
  for (const asset of ['operator-reference-loader.js', 'operator-service-edit.js', 'operator-service-edit.css', 'toll-management.js', 'toll-management.css']) {
    assert.match(sw, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(config, /loadAuxiliosModule\('auxilios-toll-management', '\/toll-management\.js'\)/);
  assert.doesNotMatch(featureFlags, /toll-management/);
  assert.match(editorCss, /#ose-modal\[hidden\]/);
  assert.match(editorCss, /@media/i);
});
