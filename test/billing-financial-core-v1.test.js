const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sql = read('migrations/20260824130000_billing_service_financial_core_v1.sql');
const compat = read('migrations/20260824130100_billing_service_financial_core_v1_compat.sql');
const domain = read('docs/billing-domain-v1.md');

test('facturacion separa elegibilidad, modalidad y estado de proceso', () => {
  assert.match(sql, /create table if not exists public\.operator_service_billing/i);
  assert.match(sql, /service_id uuid not null unique references public\.operator_services/i);
  assert.match(sql, /eligibility in \('pending_review','billable','non_billable'\)/i);
  assert.match(sql, /billing_basis in \('full','km','origin','movement'\)/i);
  assert.match(sql, /process_status in \('pending','approved','batched','invoiced','voided'\)/i);
  assert.match(sql, /calculation_state in \('requires_review','ready'\)/i);
});

test('la migracion conserva el historial productivo y su contrato legacy', () => {
  assert.match(sql, /create table if not exists public\.operator_service_billing_revisions/i);
  assert.match(sql, /revision_id uuid primary key/i);
  assert.match(sql, /billing_status text not null check \(billing_status in \('pending','reviewed','invoiced','excluded'\)\)/i);
  assert.match(sql, /company_amount numeric\(14,2\) not null/i);
  assert.match(sql, /quote_snapshot jsonb not null/i);
  assert.match(sql, /source_revision_id uuid references public\.operator_service_billing_revisions/i);
  assert.doesNotMatch(sql, /drop table .*operator_service_billing_revisions/i);
});

test('los estados productivos se sincronizan con el ledger canonico', () => {
  assert.match(sql, /sync_operator_service_billing_v1/i);
  assert.match(sql, /s\.billing_status='invoiced'.*v_process:='invoiced'/is);
  assert.match(sql, /s\.billing_status='reviewed'.*v_process:='approved'/is);
  assert.match(sql, /s\.billing_status='excluded'.*v_eligibility:='non_billable'.*v_process:='approved'/is);
  assert.match(sql, /s\.billing_status='not_ready'.*v_process:='voided'/is);
  assert.match(sql, /operator_services_billing_sync_v1/i);
});

test('los cierres excepcionales separan elegibilidad de modalidad', () => {
  assert.match(sql, /billing_contract_from_closure_status/i);
  assert.match(sql, /when 'billable_km' then jsonb_build_object\('eligibility','billable','billing_basis','km'\)/i);
  assert.match(sql, /when 'billable_origin' then jsonb_build_object\('eligibility','billable','billing_basis','origin'\)/i);
  assert.match(sql, /when 'billable_movement' then jsonb_build_object\('eligibility','billable','billing_basis','movement'\)/i);
  assert.match(sql, /operator_service_closures_billing_sync_v1/i);
});

test('el snapshot congela economia aplicada, conceptos, reajustes y peajes', () => {
  assert.match(sql, /build_operator_service_billing_snapshot/i);
  assert.match(sql, /freeze_applied_service_values_v1/i);
  assert.match(sql, /'pricing_snapshot'/i);
  assert.match(sql, /'service_billing_snapshot'/i);
  assert.match(sql, /'items',v_items/i);
  assert.match(sql, /'adjustments',v_adjustments/i);
  assert.match(sql, /'tolls',v_tolls/i);
  assert.match(sql, /legacy_revision_id/i);
});

test('modalidades parciales exigen confirmacion explicita antes de aprobar', () => {
  assert.match(sql, /requires_manual_amount_confirmation/i);
  assert.match(sql, /create or replace function public\.confirm_operator_service_billing_amounts/i);
  assert.match(sql, /manual_billing_confirmation_v1/i);
  assert.match(sql, /if b\.calculation_state<>'ready'/i);
  assert.match(sql, /Confirmá el importe definitivo antes de aprobar/i);
});

test('reviewed produce lock real y la reapertura es explicita', () => {
  assert.match(sql, /create or replace function public\.approve_operator_service_billing/i);
  assert.match(sql, /billing_status='reviewed'/i);
  assert.match(sql, /process_status in \('approved','batched','invoiced'\)/i);
  assert.match(sql, /create or replace function public\.reopen_operator_service_billing/i);
  assert.match(sql, /revision=revision\+1/i);
  assert.match(sql, /FACTURACION_BLOQUEADA/i);
  assert.match(sql, /operator_services_financial_lock_guard_v1/i);
  assert.match(sql, /operator_service_items_financial_lock_guard_v1/i);
  assert.match(sql, /operator_service_tolls_financial_lock_guard_v1/i);
});

test('no se puede facturar un servicio pendiente sin aprobacion previa', () => {
  assert.match(sql, /new\.billing_status='invoiced' and old\.billing_status<>'reviewed'/i);
  assert.match(sql, /FACTURACION_NO_APROBADA/i);
  assert.match(sql, /old\.billing_status='reviewed' and new\.billing_status='invoiced'/i);
});

test('el ledger financiero no admite escrituras directas del cliente', () => {
  assert.match(sql, /revoke all on table public\.operator_service_billing from public, anon, authenticated/i);
  assert.match(sql, /grant select on table public\.operator_service_billing to authenticated/i);
  assert.match(sql, /current_auxilios_role\(\).*'administracion','facturacion','supervision'/is);
  assert.doesNotMatch(sql, /grant (insert|update|delete).*operator_service_billing to authenticated/i);
});

test('compatibilidad cubre events.details y triggers seguros en INSERT', () => {
  assert.match(compat, /add column if not exists details jsonb/i);
  assert.match(compat, /if tg_op='INSERT' then/i);
  assert.match(compat, /operator_service_billing_sync_trigger_v1/i);
  assert.match(compat, /operator_service_closure_billing_sync_trigger_v1/i);
});

test('el documento fija el contrato sobre el flujo ya desplegado', () => {
  assert.match(domain, /reviewed.*approved/is);
  assert.match(domain, /invoiced.*factura/is);
  assert.match(domain, /operator_service_billing_revisions.*bitácora histórica/is);
  assert.match(domain, /no puede pasar de `pending` a `invoiced`/i);
  assert.match(domain, /cambia entre revisión y factura.*rechazado/is);
  assert.match(domain, /único registro financiero canónico/i);
});
