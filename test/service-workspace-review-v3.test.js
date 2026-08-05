const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const migration = read('migrations/20260805090000_operator_resource_availability.sql');
const review = read('operator-service-workspace-review-v3.js');
const css = read('operator-service-workspace-review-v3.css');
const flags = read('feature-flags.js');
const pkg = read('package.json');
const sw = read('sw.js');

test('cada alta beta comienza vacía y con timestamp actual de Buenos Aires', () => {
  assert.match(review, /function nowInBuenosAires\(\)/);
  assert.match(review, /timeZone:'America\/Argentina\/Buenos_Aires'/);
  assert.match(review, /function emptyData\(\)/);
  assert.match(review, /company_id:'',branch_id:'',billing_base_id:''/);
  assert.match(review, /customer_name:'',customer_phone:'',customer_email:''/);
  assert.match(review, /origin:'',destination:''/);
  assert.match(review, /scheduled_for:nowInBuenosAires\(\)/);
  assert.match(review, /localStorage\.removeItem\(DRAFT_KEY\)/);
  assert.match(review, /resetWizard\(\)/);
});

test('el código de prestadora reemplaza el código interno y orden de compra es condicional', () => {
  assert.match(review, /Código prestadora/);
  assert.match(review, /service_order_number/);
  assert.match(review, /top\.children\[0\]/);
  assert.match(review, /admin\?\.querySelectorAll\('\[data-field="service_order"\]'\)/);
  assert.match(review, /requires_purchase_order\)purchase\.remove\(\)/);
  assert.doesNotMatch(review, /Se genera automáticamente/);
});

test('la demora usa solamente las opciones operativas acordadas', () => {
  assert.match(review, /<option value="0">Sin demora<\/option>/);
  assert.match(review, /\[30,60,90,120,180,240\]/);
  assert.match(review, /granted_delay_minutes/);
  assert.doesNotMatch(review, />30 minutos</);
  assert.doesNotMatch(review, />60 minutos</);
});

test('km totales es solo lectura y suma asfalto más ripio', () => {
  assert.match(review, /KM Totales/);
  assert.match(review, /id="osv3-total-km" disabled/);
  assert.match(review, /num\(d\.estimated_asphalt_km\)\+num\(d\.estimated_gravel_km\)/);
  assert.match(css, /\.osv3-total-km input/);
});

test('la disponibilidad se obtiene desde jornadas, móviles y servicios activos', () => {
  assert.match(migration, /create or replace function public\.get_operator_resource_availability/i);
  assert.match(migration, /from public\.daily_logs/i);
  assert.match(migration, /coalesce\(dl\.status, 'open'\) = 'open'/i);
  assert.match(migration, /dl\.hora_fin is null/i);
  assert.match(migration, /dl\.closed_at is null/i);
  assert.match(migration, /from public\.operator_services/i);
  assert.match(migration, /'no_open_shift'/);
  assert.match(migration, /'stale_shift'/);
  assert.match(migration, /'workshop'/);
  assert.match(migration, /'busy'/);
  assert.match(migration, /revoke all on function public\.get_operator_resource_availability\(\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_operator_resource_availability\(\) to authenticated/i);
});

test('seleccionar chofer o móvil completa la contraparte de una jornada abierta', () => {
  assert.match(review, /rpc\('get_operator_resource_availability'\)/);
  assert.match(review, /function selectDriver\(value\)/);
  assert.match(review, /driver\.active_truck_id/);
  assert.match(review, /setAssignment\(value,pairedTruck\)/);
  assert.match(review, /function selectTruck\(value\)/);
  assert.match(review, /truck\.active_driver_id/);
  assert.match(review, /setAssignment\(pairedDriver,value\)/);
  assert.match(review, /Sin jornada/);
  assert.match(review, /En taller/);
  assert.match(review, /Fuera de servicio/);
  assert.match(review, /Jornada anterior/);
  assert.match(review, /confirm\(/);
});

test('las direcciones consultan Maps luego de dos segundos sin escribir', () => {
  assert.match(review, /const ADDRESS_DELAY_MS=2000/);
  assert.match(review, /query\.length<3/);
  assert.match(review, /setTimeout\(\(\)=>searchAddress\(kind,query,sequence\),ADDRESS_DELAY_MS\)/);
  assert.match(review, /functions\.invoke\('maps-proxy'/);
  assert.match(review, /action:'autocomplete'/);
  assert.match(review, /action:'place'/);
  assert.match(review, /suggestions\.slice\(0,5\)/);
  assert.match(review, /origin_place_id/);
  assert.match(review, /destination_place_id/);
  assert.match(review, /formatted_address/);
  assert.match(review, /Dirección manual sin validar/);
  assert.match(css, /\.osv3-suggestions/);
});

test('la revisión continúa detrás de la beta privada y entra en CI y PWA', () => {
  assert.match(flags, /flags\.service_workspace_v2/);
  assert.match(flags, /operator-service-workspace-review-v3\.css/);
  assert.match(flags, /operator-service-workspace-review-v3\.js/);
  assert.match(pkg, /node --check operator-service-workspace-review-v3\.js/);
  assert.match(sw, /auxilios-v122/);
  assert.match(sw, /operator-service-workspace-review-v3\.css/);
  assert.match(sw, /operator-service-workspace-review-v3\.js/);
});
