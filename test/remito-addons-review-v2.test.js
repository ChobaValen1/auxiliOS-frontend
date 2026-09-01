const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('migrations/20260826181259_remito_addons_review_v2.sql');
const definitiveFlow=read('migrations/20260829003000_driver_addons_modal_v3.sql');
const automaticAmounts=read('migrations/20260829090000_driver_addons_automatic_amounts_v4.sql');
const amountPreferences=read('migrations/20260829113000_driver_addon_amount_preferences_v5.sql');
const driverVisibility=read('migrations/20260829233000_driver_remito_admin_visibility_v1.sql');
const tollCoverageVisibility=read('supabase/migrations/20260830214300_driver_toll_coverage_visibility_v1.sql');
const generatedTotalFix=read('migrations/20260827133500_remito_addons_generated_total_fix_v1.sql');
const legacyScopeFix=read('migrations/20260827140500_remito_legacy_capture_scope_fix_v1.sql');
const driver=read('remito-addons-v2.js');
const review=read('operator-remito-review-v2.js');
const services=read('operator-services.js');
const supabase=read('supabase.js');
const sigma=read('sigma.js');
const mobile=read('remito-mobile-flow-v3.js');
const mobileCss=read('remito-mobile-flow-v3.css');
const moduleConfig=read('service-module-configuration.js');
const fieldModesMigration=read('supabase/migrations/20260828234519_driver_remito_field_modes_v1.sql');
const index=read('Index.html');
const legacyRemitoStep3=index.split('id="rem-step-3"')[1]?.split('id="rem-step-4"')[0]||'';

test('normaliza peajes, excedentes y evidencia sin exponer tablas al frontend',()=>{
  for(const table of ['remito_toll_reports','remito_excess_reports','remito_evidence','operator_service_document_addon_reviews']){
    assert.match(migration,new RegExp(`create table if not exists public\\.${table}`));
    assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration,new RegExp(`revoke all on table public\\.${table} from public,anon,authenticated`));
  }
  assert.match(migration,/client_line_id uuid not null/);
  assert.match(migration,/generated always as \(round\(quantity\*unit_amount,2\)\) stored/);
  assert.match(migration,/operator_service_document_addon_review_reason_chk/);
  assert.match(migration,/imp_total_extras=default/);
  assert.match(generatedTotalFix,/imp_total_extras=default/);
  assert.doesNotMatch(generatedTotalFix,/imp_total_extras=round/);
});

test('el Chofer completa peajes y excedentes dentro de un modal atómico de dos etapas',()=>{
  assert.match(driver,/DriverTollReport/);
  assert.match(driver,/DriverExcessReport/);
  assert.match(driver,/RemitoEvidence/);
  assert.doesNotMatch(driver,/id="rem-had-tolls"|id="rem-had-excesses"/);
  assert.doesNotMatch(driver,/Cobros realizados al cliente|rem-had-collections|customer_collections/);
  assert.doesNotMatch(driver,/Ticket|data-field="ticket"|Otro peaje|Otro excedente/);
  assert.match(driver,/Seleccionar peajes/);
  assert.match(driver,/type="checkbox" value=/);
  assert.match(driver,/Seleccionar excedentes/);
  assert.match(driver,/rem-addon-picker/);
  assert.match(driver,/phase:'select'/);
  assert.match(driver,/phase='details'/);
  assert.match(driver,/state\.lines\[state\.draft\.kind\]=clone\(state\.draft\.lines\)/);
  assert.match(driver,/Continuar/);
  assert.match(driver,/Confirmar/);
  assert.match(driver,/Medio de pago/);
  assert.match(driver,/Medio de pago para toda la selección/);
  assert.match(driver,/reference_amount/);
  assert.match(driver,/data-draft-field="unit_amount"/);
  assert.match(driver,/Importe real/);
  assert.match(driver,/Sugerido/);
  assert.match(driver,/No cobrado/);
  assert.match(driver,/customer_payment_method/);
  assert.match(driver,/\+\$\{lines\.length-1\} más/);
});

test('el backend conserva la referencia tarifaria y permite configurar el importe real',()=>{
  assert.match(automaticAmounts,/from public\.toll_rates tr/);
  assert.match(amountPreferences,/driver_amount_mode in \('fixed','manual'\)/);
  assert.match(amountPreferences,/update public\.company_service_settings css/);
  assert.match(amountPreferences,/'amount_mode',case when v_toll_setting='manual' then 'manual' else 'suggested' end/);
  assert.match(amountPreferences,/v_amount:=nullif\(v_row->>'unit_amount',''\)::numeric/);
  assert.match(amountPreferences,/if v_amount_mode='manual' then/);
  assert.match(amountPreferences,/select sum\(i\.subtotal\) into v_amount/);
  assert.match(amountPreferences,/from public\.company_tariff_matrix_rates x/);
  assert.doesNotMatch(amountPreferences,/amount_pending_admin_review/);
});

test('el HTML base no conserva el formulario anterior de peajes',()=>{
  assert.doesNotMatch(legacyRemitoStep3,/<label class="form-label">Peajes<\/label>/);
  assert.doesNotMatch(legacyRemitoStep3,/id="imp-peaje"[^>]*type="tel"/);
  assert.doesNotMatch(legacyRemitoStep3,/>Total extras<\/span>/);
  assert.doesNotMatch(legacyRemitoStep3,/Cobros realizados al cliente|rem-pago-selected|pago1-monto/);
  assert.match(index,/PASO 3: EVIDENCIA/);
  assert.match(index,/auxilios-remito-mobile-flow-v3/);
  assert.match(index,/auxilios-remito-addons-v2/);
  assert.match(index,/auxilios-phase3-service-bridge/);
});

test('el backend comparte catálogos habilitados y persiste el cobro por línea',()=>{
  assert.match(definitiveFlow,/create or replace function public\.get_driver_remito_reference_v2/);
  assert.match(definitiveFlow,/from public\.toll_locations l[\s\S]*where l\.is_active/);
  assert.match(definitiveFlow,/public\.company_service_settings css/);
  assert.match(definitiveFlow,/v_company_id is null[\s\S]*css\.is_enabled/);
  assert.match(definitiveFlow,/create or replace function app_private\.persist_driver_remito_addons_v3/);
  assert.match(definitiveFlow,/customer_payment_method/);
  assert.match(definitiveFlow,/'not_collected'/);
  assert.doesNotMatch(definitiveFlow,/Adjuntá el ticket o justificá/);
  assert.match(definitiveFlow,/persist_driver_remito_addons_v3\(\(v_result->>'remito_id'\)::integer,p_payload,v_uid\)/);
  assert.match(driver,/get_driver_remito_reference_v2/);
  assert.match(driver,/typeof _db==='undefined'/);
  assert.doesNotMatch(driver,/window\._db/);
  assert.doesNotMatch(driver,/\.from\('remito_toll_reports'|\.from\('remito_excess_reports'/);
});

test('DNI/CUIT y teléfono respetan field_modes y el paso de firma queda compacto',()=>{
  assert.match(moduleConfig,/customer_document:'optional'/);
  assert.match(moduleConfig,/customer_phone:'optional'/);
  assert.match(mobile,/data-remito-field="customer_document"/);
  assert.match(mobile,/data-remito-field="customer_phone"/);
  assert.match(mobile,/mode==='hidden'/);
  assert.match(mobile,/mode==='required'/);
  assert.match(mobile,/validateCustomerFields/);
  assert.match(mobile,/get_driver_remito_capabilities_v2/);
  assert.match(sigma,/telefono: telefono \|\| null/);
  assert.match(mobileCss,/#sig-canvas\{height:96px!important\}/);
  assert.match(mobileCss,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mobileCss,/\.toggle-desc\{display:none!important\}/);
  assert.match(fieldModesMigration,/'field_modes',coalesce\(v_modes/);
  assert.match(fieldModesMigration,/auth\.uid\(\) is null/);
  assert.match(fieldModesMigration,/revoke all on function public\.get_driver_remito_capabilities_v2\(\) from public,anon/);
});

test('los RPC v2/v4 son autenticados, idempotentes y preservan el original firmado',()=>{
  for(const fn of ['get_driver_remito_reference_v1','save_driver_operator_service_remito_v4','save_driver_ad_hoc_remito_v2','get_driver_remito_capabilities_v2','get_operator_service_remito_review_v1','resolve_operator_service_document_v2'])assert.match(migration,new RegExp(`create or replace function public\\.${fn}`));
  assert.match(migration,/select public\.save_driver_operator_service_remito_v3/);
  assert.match(migration,/select public\.save_driver_ad_hoc_remito_v1/);
  assert.match(migration,/original_snapshot jsonb not null/);
  assert.match(migration,/accepted_snapshot jsonb not null/);
  const resolve=migration.split('create or replace function public.resolve_operator_service_document_v2')[1];
  assert.doesNotMatch(resolve,/update public\.remito_toll_reports|update public\.remito_excess_reports/);
  assert.match(resolve,/operator_service_document_addon_reviews/);
  assert.match(resolve,/remito_addons_reviewed/);
});

test('la aprobación promueve reales atómicamente y Facturación nunca suma planificado con real',()=>{
  const resolve=migration.split('create or replace function public.resolve_operator_service_document_v2')[1];
  assert.match(resolve,/s\.is_test,'actual',x\.excess_report_id/);
  assert.match(resolve,/remito_toll_report_id/);
  assert.match(resolve,/remito_excess_report_id/);
  assert.match(resolve,/billing_status=case/);
  assert.match(migration,/operator_service_uses_actual_addons_v1/);
  assert.match(migration,/v_use_actual and t\.source='actual'/);
  assert.match(migration,/not v_use_actual and t\.source in \('planned','manual'\)/);
  assert.match(migration,/assert_operator_invoice_toll_precedence_v1/);
  assert.match(migration,/t\.source<>'actual'/);
});

test('evidencia nueva usa bucket privado de 10 MiB y enlaces temporales',()=>{
  assert.match(migration,/values\(\s*'remito-evidence-v2','remito-evidence-v2',false,10485760/s);
  assert.match(migration,/allowed_mime_types/);
  assert.match(migration,/storage\.foldername\(name\)/);
  assert.match(driver,/storage\.from\('remito-evidence-v2'\)\.upload/);
  assert.match(review,/createSignedUrl\(path,120\)/);
  assert.doesNotMatch(driver,/getPublicUrl/);
});

test('offline conserva líneas y archivos estables para reintentos',()=>{
  assert.match(supabase,/remito_addon_file_map/);
  assert.match(supabase,/addonBundle\.files\.forEach/);
  assert.match(sigma,/addonFileMap/);
  assert.match(sigma,/campo\.startsWith\('addon_'\)/);
  assert.match(sigma,/uploadEvidence/);
  assert.match(migration,/remito_toll_reports_line_unique unique\(remito_id,client_line_id\)/);
  assert.match(migration,/remito_excess_reports_line_unique unique\(remito_id,client_line_id\)/);
});

test('Servicios usa bandeja y revisión línea por línea, sin aprobación ciega en el menú',()=>{
  assert.match(review,/Remitos recibidos/);
  assert.match(review,/Planificado vs\. informado/);
  assert.match(review,/DNI\/CUIT/);
  assert.match(review,/remito_excess_total/);
  assert.match(review,/remito_toll_total/);
  assert.match(review,/Confirmar revisión y finalizar servicio/);
  assert.match(review,/reportedExcessPayment/);
  assert.match(review,/Método de pago/);
  assert.match(review,/resolve_operator_service_document_v3/);
  assert.match(review,/Elegí Rechazar, Modificar o Aprobar para Peajes/);
  assert.match(review,/Seleccioná el concepto de cada excedente/);
  const menu=services.split('function openRowMenu')[1].split('function closeRowMenu')[0];
  assert.match(menu,/Ver remito firmado/);
  assert.doesNotMatch(menu,/Aprobar remito/);
});

test('la aprobación simplificada separa Peajes y Excedentes y sólo despliega edición al modificar',()=>{
  for(const label of ['1. Peajes','2. Excedentes','Formato de cobro de peajes','Peajes adjuntados','Concepto','Cantidad','Monto','Método de pago'])assert.match(review,new RegExp(label));
  for(const empty of ['Sin peajes planificados','Sin peajes informados','Sin excedentes planificados','Sin excedentes informados'])assert.match(review,new RegExp(empty));
  for(const action of ['Rechazar','Modificar','Aprobar'])assert.match(review,new RegExp(`>${action}<`));
  assert.match(review,/hasDifference\('toll'/);
  assert.match(review,/hasDifference\('excess'/);
  assert.match(review,/data-review-action="adjusted"/);
  assert.match(review,/editor\.hidden=action!==\'adjusted\'/);
  assert.match(review,/button\.disabled=pending/);
  assert.doesNotMatch(review,/Responsable comercial|Cobrador<select|Decisión<select/);
});

test('la recepción documental expone el resumen completo para Operaciones y Administración',()=>{
  assert.match(driverVisibility,/create or replace function public\.list_operator_service_document_connections_v1\(\)/);
  for(const key of ['remito_customer_name','remito_customer_document','remito_customer_phone','remito_vehicle_plate','remito_vehicle_make_model','remito_origin','remito_destination','remito_km_reales']){
    assert.match(driverVisibility,new RegExp(`'${key}'`));
  }
  assert.match(driverVisibility,/remito_toll_reports tr/);
  assert.match(driverVisibility,/remito_excess_reports er/);
  assert.match(driverVisibility,/create or replace function public\.get_operator_service_remito_review_v1/);
  assert.match(driverVisibility,/'customer_document', r\.cuit/);
  assert.match(driverVisibility,/'customer_phone', r\.telefono/);
  assert.match(driverVisibility,/'vehicle_make_model', r\.marca_modelo/);
});

test('el formato contractual de peajes se ve en todo el remito y en la recepción administrativa',()=>{
  for(const label of ['Uno y Uno','A cargo de la prestadora','A cargo del cliente']){
    assert.match(driver,new RegExp(label));
    assert.match(review,new RegExp(label));
  }
  assert.match(driver,/Formato de cobro de peajes/);
  assert.match(driver,/A definir por Operaciones/);
  assert.match(driver,/Sin formato configurado/);
  assert.match(driver,/rem-toll-coverage/);
  assert.doesNotMatch(read('remito-mobile-flow-v3.js'),/rem-addon-signature-summary/);
  assert.match(driver,/data\.toll_coverage_mode/);
  assert.match(review,/Formato de cobro de peajes/);
  assert.match(review,/s\.toll_coverage_mode/);
  for(const rpc of ['get_driver_operator_queue_v2','get_driver_remito_reference_v2','get_driver_remito_addons_v2','list_operator_service_document_connections_v1']){
    assert.match(tollCoverageVisibility,new RegExp(rpc));
  }
  assert.match(tollCoverageVisibility,/revoke all on function public\.get_driver_remito_addons_v2\(integer\) from public,anon,authenticated/);
  assert.match(tollCoverageVisibility,/grant execute on function public\.get_driver_remito_addons_v2\(integer\) to authenticated/);
});

test('históricos no facturados se convierten a Total legado y los facturados quedan intactos',()=>{
  assert.match(migration,/capture_legacy_remito_addons_v2/);
  assert.match(migration,/Total de peajes legado/);
  assert.match(migration,/Total de excedentes legado/);
  assert.match(migration,/if not found or s\.billing_status='invoiced' then return/);
  assert.match(migration,/coalesce\(s\.billing_status,'not_ready'\)<>'invoiced'/);
  assert.match(migration,/if r\.operator_service_id is null then return/);
  assert.match(migration,/set addons_version=2/);
  assert.match(legacyScopeFix,/r\.operator_service_id is null/);
  assert.match(legacyScopeFix,/t\.notes='legacy_scalar_v1'/);
  assert.match(driver,/Ajustado por Administración/);
  assert.match(driver,/Última información registrada para este remito/);
});
