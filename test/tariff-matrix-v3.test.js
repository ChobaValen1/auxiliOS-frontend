const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const wizard = read('operator-service-wizard.js');
const ui = read('operator-service-tariff-v3-ui.js');
const reajusteUi = read('operator-service-reajuste-v3.js');
const configUi = read('tariff-matrix-v3.js');
const config = read('config.js');
const sw = read('sw.js');
const pkg = read('package.json');
const schema = read('migrations/20260810173604_tariff_matrix_v3_schema.sql');
const backfill = read('migrations/20260810173658_tariff_matrix_v3_backfill.sql');
const configRpc = read('migrations/20260810173757_tariff_matrix_v3_configuration_rpcs.sql');
const operatorRpc = read('migrations/20260810174148_operator_service_tariff_matrix_v3.sql');
const adjustRpc = read('migrations/20260810174428_operator_service_item_reajuste_v3.sql');

test('el catálogo separa categorías reutilizables de conceptos tarifarios', () => {
  assert.match(schema, /create table public\.service_categories/);
  assert.match(schema, /create table public\.company_tariff_matrix_rates/);
  assert.match(schema, /company_id uuid not null/);
  assert.match(schema, /category_id uuid not null/);
  assert.match(schema, /concept_id uuid not null/);
  assert.match(backfill, /'light','Liviano'/);
  assert.match(backfill, /'semi_heavy','Semipesado'/);
  assert.match(backfill, /'uml','UML'/);
  assert.match(configRpc, /save_service_category_v3/);
  assert.match(configRpc, /save_tariff_concept_v3/);
});

test('todos los ítems V3 usan cantidad por precio unitario y admiten fracciones', () => {
  assert.match(operatorRpc, /v_subtotal:=round\(v_qty\*v_rate\.unit_price,2\)/);
  assert.match(operatorRpc, /p_asphalt_km numeric/);
  assert.match(operatorRpc, /p_gravel_km numeric/);
  assert.match(backfill, /'wait_work','Hora de Trabajo \/ Espera'/);
  assert.match(backfill, /'hour'/);
  assert.match(wizard, /Math\.max\(num\(v\),\.01\)/);
});

test('Movida, KM Asfalto y KM Ripio pueden tomar cantidad automática', () => {
  assert.match(backfill, /'movement_charge'/);
  assert.match(backfill, /'asphalt_km'/);
  assert.match(backfill, /'gravel_km'/);
  assert.match(backfill, /'one',true,true/);
  assert.match(backfill, /'asphalt_km',true,true/);
  assert.match(backfill, /'gravel_km',true,true/);
  assert.match(operatorRpc, /where sc\.matrix_visible and sc\.is_active and sc\.auto_apply/);
});

test('el código propio se decide por prestadora y concepto, no por cada alta', () => {
  assert.match(schema, /requires_own_code boolean not null default false/);
  assert.match(configRpc, /save_company_concept_setting_v3/);
  assert.match(operatorRpc, /requires_own_code/);
  assert.match(operatorRpc, /requiere código propio de prestadora/);
  assert.match(wizard, /item\?\.requires_own_code/);
  assert.match(wizard, /item_codes/);
});

test('el código principal es obligatorio y el duplicado de 30 días solo advierte', () => {
  assert.match(operatorRpc, /El código de prestadora es obligatorio/);
  assert.match(operatorRpc, /interval '30 days'/);
  assert.match(operatorRpc, /operator_service_items i/);
  assert.match(wizard, /check_recent_provider_code_v3/);
  assert.match(ui, /Podés usarlo igualmente/);
  assert.doesNotMatch(operatorRpc, /unique.*service_order_number/i);
});

test('las tarifas tienen vigencia, historial y snapshot por servicio', () => {
  assert.match(schema, /valid_from date not null/);
  assert.match(schema, /valid_until date/);
  assert.match(schema, /revision integer not null default 1/);
  assert.match(configRpc, /save_company_tariff_rate_v3/);
  assert.match(configRpc, /valid_until=v_from-1/);
  assert.match(configRpc, /get_company_tariff_rate_history_v3/);
  assert.match(operatorRpc, /matrix_rate_id/);
  assert.match(operatorRpc, /pricing_snapshot/);
  assert.match(operatorRpc, /list_unit_price/);
});

test('el reajuste administrativo conserva tarifa de lista y deja auditoría', () => {
  assert.match(schema, /create table public\.operator_service_item_adjustments/);
  assert.match(adjustRpc, /Solo Administración puede realizar reajustes/);
  assert.match(adjustRpc, /list_unit_price=coalesce\(list_unit_price,unit_price\)/);
  assert.match(adjustRpc, /previous_unit_price/);
  assert.match(adjustRpc, /new_unit_price/);
  assert.match(adjustRpc, /reason/);
  assert.doesNotMatch(adjustRpc, /update public\.company_tariff_matrix_rates/);
});

test('Administración puede aplicar y revisar reajustes desde el detalle del servicio', () => {
  assert.match(reajusteUi, /role\(\)==='administracion'/);
  assert.match(reajusteUi, /matrix_rate_id&&i\.item_role!=='primary'/);
  assert.match(reajusteUi, /Tarifa de lista/);
  assert.match(reajusteUi, /Precio aplicado/);
  assert.match(reajusteUi, /Motivo del reajuste/);
  assert.match(reajusteUi, /adjust_operator_service_item_v3/);
  assert.match(reajusteUi, /get_operator_service_item_adjustments_v3/);
  assert.match(reajusteUi, /No modifican el tarifario de la prestadora/);
  assert.doesNotMatch(reajusteUi, /MutationObserver/);
});

test('Configuración presenta una matriz Categoría por Concepto reutilizable', () => {
  assert.match(configUi, /Categorías y conceptos/);
  assert.match(configUi, /Tarifarios por prestadora/);
  assert.match(configUi, /Categoría \+ Concepto/);
  assert.match(configUi, /Código propio/);
  assert.match(configUi, /get_company_tariff_matrix_v3/);
  assert.match(configUi, /save_company_category_setting_v3/);
  assert.match(configUi, /save_company_concept_setting_v3/);
  assert.match(configUi, /save_company_tariff_rate_v3/);
});

test('Nuevo Servicio consume la matriz V3 sin crear otro workspace', () => {
  assert.match(wizard, /get_operator_category_tariff_v3/);
  assert.match(wizard, /calculate_operator_service_quote_v3/);
  assert.match(wizard, /create_operator_service_v3/);
  assert.match(wizard, /category_id/);
  assert.match(ui, /Categoría \*/);
  assert.doesNotMatch(wizard, /MutationObserver/);
  assert.doesNotMatch(ui, /MutationObserver/);
  assert.doesNotMatch(configUi, /MutationObserver/);
});

test('las RPC V3 no quedan expuestas a anon', () => {
  assert.match(configRpc, /revoke all on function public\.save_company_tariff_rate_v3\(jsonb\) from public,anon/);
  assert.match(configRpc, /revoke all on function public\.check_recent_provider_code_v3\(uuid,text,uuid\) from public,anon/);
  assert.match(operatorRpc, /revoke all on function public\.create_operator_service_v3\(jsonb\) from public,anon/);
  assert.match(operatorRpc, /revoke all on function public\.calculate_operator_service_quote_v3/);
  assert.match(adjustRpc, /revoke all on function public\.adjust_operator_service_item_v3/);
});

test('los módulos V3 se cargan, precachean y entran en CI', () => {
  assert.match(config, /tariff-matrix-v3\.js/);
  assert.match(config, /operator-service-tariff-v3-ui\.js/);
  assert.match(config, /operator-service-reajuste-v3\.js/);
  assert.match(sw, /tariff-matrix-v3\.js/);
  assert.match(sw, /operator-service-tariff-v3-ui\.js/);
  assert.match(sw, /operator-service-reajuste-v3\.js/);
  assert.match(pkg, /node --check tariff-matrix-v3\.js/);
  assert.match(pkg, /node --check operator-service-tariff-v3-ui\.js/);
  assert.match(pkg, /node --check operator-service-reajuste-v3\.js/);
  const version = sw.match(/auxilios-v(\d+)/);
  assert.ok(version && Number(version[1]) >= 148);
});
