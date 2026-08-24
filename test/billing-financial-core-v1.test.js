const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sql = read('migrations/20260824130000_billing_service_financial_core_v1.sql');
const domain = read('docs/billing-domain-v1.md');

test('facturacion separa elegibilidad, modalidad y estado de proceso', () => {
  assert.match(sql, /create table if not exists public\.operator_service_billing/i);
  assert.match(sql, /service_id uuid not null unique references public\.operator_services/i);
  assert.match(sql, /eligibility in \('pending_review','billable','non_billable'\)/i);
  assert.match(sql, /billing_basis in \('full','km','origin','movement'\)/i);
  assert.match(sql, /process_status in \('pending','approved','batched','invoiced','voided'\)/i);
  assert.match(sql, /calculation_state in \('requires_review','ready'\)/i);
});

test('el contrato legado de Fase 3B se traduce sin romper la interfaz actual', () => {
  assert.match(sql, /billing_contract_from_legacy_status/i);
  assert.match(sql, /when 'billable_km' then jsonb_build_object\('eligibility','billable','billing_basis','km'\)/i);
  assert.match(sql, /when 'billable_origin' then jsonb_build_object\('eligibility','billable','billing_basis','origin'\)/i);
  assert.match(sql, /when 'billable_movement' then jsonb_build_object\('eligibility','billable','billing_basis','movement'\)/i);
  assert.match(sql, /create or replace function public\.review_operator_service_closure/i);
  assert.match(sql, /public\.calculate_operator_service_billing/i);
});

test('el snapshot financiero congela la economia aplicada y su trazabilidad', () => {
  assert.match(sql, /build_operator_service_billing_snapshot/i);
  assert.match(sql, /freeze_applied_service_values_v1/i);
  assert.match(sql, /'pricing_snapshot'/i);
  assert.match(sql, /'service_billing_snapshot'/i);
  assert.match(sql, /'items', v_items/i);
  assert.match(sql, /'adjustments', v_adjustments/i);
  assert.match(sql, /'tolls', v_tolls/i);
  assert.match(sql, /create table if not exists public\.operator_service_billing_revisions/i);
  assert.match(sql, /'backfilled','calculated','amounts_confirmed','approved','reopened'/i);
});

test('modalidades parciales exigen confirmacion explicita antes de aprobar', () => {
  assert.match(sql, /requires_manual_amount_confirmation/i);
  assert.match(sql, /create or replace function public\.confirm_operator_service_billing_amounts/i);
  assert.match(sql, /manual_billing_confirmation_v1/i);
  assert.match(sql, /if v_billing\.calculation_state <> 'ready'/i);
  assert.match(sql, /Confirmá el importe definitivo antes de aprobar/i);
});

test('aprobar bloquea cambios economicos y reabrir conserva historial', () => {
  assert.match(sql, /create or replace function public\.approve_operator_service_billing/i);
  assert.match(sql, /process_status = 'approved'/i);
  assert.match(sql, /locked_at = now\(\)/i);
  assert.match(sql, /create or replace function public\.reopen_operator_service_billing/i);
  assert.match(sql, /revision = revision \+ 1/i);
  assert.match(sql, /FACTURACION_BLOQUEADA/i);
  assert.match(sql, /operator_services_billing_lock_guard/i);
  assert.match(sql, /operator_service_items_billing_lock_guard/i);
  assert.match(sql, /operator_service_tolls_billing_lock_guard/i);
});

test('el registro financiero no admite escrituras directas del cliente', () => {
  assert.match(sql, /revoke all on table public\.operator_service_billing from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.operator_service_billing to authenticated/i);
  assert.match(sql, /current_auxilios_role\(\).*'administracion','facturacion','supervision'/is);
  assert.doesNotMatch(sql, /grant (insert|update|delete).*operator_service_billing to authenticated/i);
});

test('el documento de dominio fija las invariantes antes de lotes y factura', () => {
  assert.match(domain, /servicio cerrado.*revisión económica.*aprobación y lock.*lote.*factura/is);
  assert.match(domain, /estimated_total.*no cambian de significado/is);
  assert.match(domain, /Cambiar un tarifario vigente no recalcula un servicio ya aprobado/i);
  assert.match(domain, /no puede tener más de un registro financiero canónico/i);
  assert.match(domain, /batched.*invoiced/is);
});
