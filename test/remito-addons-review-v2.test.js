const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const read=file=>fs.readFileSync(file,'utf8');
const migration=read('migrations/20260826181259_remito_addons_review_v2.sql');
const optionalTicket=read('migrations/20260828163000_remito_ticket_optional_v1.sql');
const generatedTotalFix=read('migrations/20260827133500_remito_addons_generated_total_fix_v1.sql');
const legacyScopeFix=read('migrations/20260827140500_remito_legacy_capture_scope_fix_v1.sql');
const driver=read('remito-addons-v2.js');
const review=read('operator-remito-review-v2.js');
const services=read('operator-services.js');
const supabase=read('supabase.js');
const sigma=read('sigma.js');

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

test('el Chofer informa peajes y excedentes minimalistas con evidencia opcional',()=>{
  assert.match(driver,/DriverTollReport/);
  assert.match(driver,/DriverExcessReport/);
  assert.match(driver,/RemitoEvidence/);
  assert.match(driver,/Hubo peajes/);
  assert.match(driver,/Hubo excedentes/);
  assert.match(driver,/Cobros realizados al cliente/);
  assert.match(driver,/Ticket <small>\(opcional\)<\/small>/);
  assert.match(driver,/Seleccionar peajes/);
  assert.match(driver,/rem-addon-picker/);
  assert.match(driver,/Confirmar selección/);
  assert.match(driver,/if\(!pickerRows\(kind\)\.length\)/);
  assert.match(driver,/missing_evidence_reason/);
  assert.doesNotMatch(driver,/justificá su ausencia/);
  assert.match(driver,/Medio de pago/);
  assert.match(driver,/customer_collections/);
  assert.match(optionalTicket,/position\('Adjuntá el ticket o justificá por qué no está disponible'/);
  assert.match(optionalTicket,/v_sql := replace\(v_sql, v_old, ''\)/);
  assert.match(optionalTicket,/execute v_sql/);
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
  assert.match(review,/Planificado por Operaciones/);
  assert.match(review,/Aprobar y aplicar al servicio/);
  assert.match(review,/reportedExcessPayment/);
  assert.match(review,/Medio informado/);
  assert.match(review,/resolve_operator_service_document_v2/);
  assert.match(review,/Explicá cada peaje ajustado o rechazado/);
  assert.match(review,/Clasificá el concepto comercial/);
  const menu=services.split('function openRowMenu')[1].split('function closeRowMenu')[0];
  assert.match(menu,/Revisar remito recibido/);
  assert.doesNotMatch(menu,/Aprobar remito/);
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
  assert.match(driver,/El original firmado se conserva sin cambios/);
});
