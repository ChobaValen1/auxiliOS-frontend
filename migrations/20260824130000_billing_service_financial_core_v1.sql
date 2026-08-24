-- AuxiliOS · Facturación · Fases 0+1
-- Contrato financiero canónico por servicio, snapshot, aprobación y reapertura.

create table if not exists public.operator_service_billing (
  billing_id uuid primary key default gen_random_uuid(),
  service_id uuid not null unique references public.operator_services(service_id) on delete restrict,
  closure_id uuid unique references public.operator_service_closures(closure_id) on delete restrict,
  company_id uuid not null references public.companies(company_id) on delete restrict,
  contract_id uuid not null references public.company_contracts(contract_id) on delete restrict,
  billing_base_id uuid references public.billing_bases(base_id) on delete restrict,
  service_date date not null,

  eligibility text not null default 'pending_review'
    check (eligibility in ('pending_review','billable','non_billable')),
  billing_basis text not null default 'full'
    check (billing_basis in ('full','km','origin','movement')),
  process_status text not null default 'pending'
    check (process_status in ('pending','approved','batched','invoiced','voided')),
  calculation_state text not null default 'requires_review'
    check (calculation_state in ('requires_review','ready')),

  currency text not null check (currency ~ '^[A-Z]{3}$'),
  final_base_subtotal numeric(14,2) not null default 0 check (final_base_subtotal >= 0),
  final_surcharge_total numeric(14,2) not null default 0 check (final_surcharge_total >= 0),
  final_toll_total numeric(14,2) not null default 0 check (final_toll_total >= 0),
  final_copay_total numeric(14,2) not null default 0 check (final_copay_total >= 0),
  final_total numeric(14,2) not null default 0 check (final_total >= 0),
  company_final_total numeric(14,2) not null default 0 check (company_final_total >= 0),

  billing_snapshot jsonb not null default '{}'::jsonb,
  review_notes text,
  reviewed_by uuid references public.users(user_id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references public.users(user_id) on delete restrict,
  approved_at timestamptz,
  locked_by uuid references public.users(user_id) on delete restrict,
  locked_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  last_reopen_reason text,
  reopened_by uuid references public.users(user_id) on delete restrict,
  reopened_at timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operator_service_billing_company_total_check
    check (company_final_total <= final_total),
  constraint operator_service_billing_copay_check
    check (final_copay_total <= final_total),
  constraint operator_service_billing_lock_state_check
    check (
      (process_status in ('approved','batched','invoiced') and locked_at is not null)
      or process_status in ('pending','voided')
    )
);

create index if not exists operator_service_billing_queue_idx
  on public.operator_service_billing(process_status, eligibility, service_date desc);
create index if not exists operator_service_billing_company_queue_idx
  on public.operator_service_billing(company_id, process_status, service_date desc);
create index if not exists operator_service_billing_contract_idx
  on public.operator_service_billing(contract_id, service_date desc);

create table if not exists public.operator_service_billing_revisions (
  billing_revision_id uuid primary key default gen_random_uuid(),
  billing_id uuid not null references public.operator_service_billing(billing_id) on delete restrict,
  service_id uuid not null references public.operator_services(service_id) on delete restrict,
  revision integer not null check (revision > 0),
  event_type text not null
    check (event_type in ('backfilled','calculated','amounts_confirmed','approved','reopened')),
  eligibility text not null,
  billing_basis text not null,
  process_status text not null,
  calculation_state text not null,
  currency text not null,
  final_base_subtotal numeric(14,2) not null,
  final_surcharge_total numeric(14,2) not null,
  final_toll_total numeric(14,2) not null,
  final_copay_total numeric(14,2) not null,
  final_total numeric(14,2) not null,
  company_final_total numeric(14,2) not null,
  billing_snapshot jsonb not null,
  reason text,
  created_by uuid references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists operator_service_billing_revisions_service_idx
  on public.operator_service_billing_revisions(service_id, created_at desc);
create index if not exists operator_service_billing_revisions_billing_idx
  on public.operator_service_billing_revisions(billing_id, revision, created_at desc);

alter table public.operator_service_billing enable row level security;
alter table public.operator_service_billing_revisions enable row level security;

drop policy if exists operator_service_billing_finance_read on public.operator_service_billing;
create policy operator_service_billing_finance_read
  on public.operator_service_billing
  for select
  to authenticated
  using ((select app_private.current_auxilios_role()) in ('administracion','facturacion','supervision'));

drop policy if exists operator_service_billing_revisions_finance_read on public.operator_service_billing_revisions;
create policy operator_service_billing_revisions_finance_read
  on public.operator_service_billing_revisions
  for select
  to authenticated
  using ((select app_private.current_auxilios_role()) in ('administracion','facturacion','supervision'));

revoke all on table public.operator_service_billing from public, anon, authenticated;
revoke all on table public.operator_service_billing_revisions from public, anon, authenticated;
grant select on table public.operator_service_billing to authenticated;
grant select on table public.operator_service_billing_revisions to authenticated;

-- Compatibilidad Fase 3B: separa elegibilidad de modalidad sin romper el RPC/UI legado.
create or replace function app_private.billing_contract_from_legacy_status(p_status text)
returns jsonb
language sql
immutable
set search_path = public, app_private, pg_temp
as $function$
  select case lower(coalesce(nullif(btrim(p_status), ''), 'pending_review'))
    when 'billable' then jsonb_build_object('eligibility','billable','billing_basis','full')
    when 'non_billable' then jsonb_build_object('eligibility','non_billable','billing_basis','full')
    when 'billable_km' then jsonb_build_object('eligibility','billable','billing_basis','km')
    when 'billable_origin' then jsonb_build_object('eligibility','billable','billing_basis','origin')
    when 'billable_movement' then jsonb_build_object('eligibility','billable','billing_basis','movement')
    else jsonb_build_object('eligibility','pending_review','billing_basis','full')
  end;
$function$;

revoke all on function app_private.billing_contract_from_legacy_status(text)
  from public, anon, authenticated;

-- Captura la verdad aplicada al servicio. No recalcula contra el tarifario vigente.
create or replace function app_private.build_operator_service_billing_snapshot(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_service public.operator_services%rowtype;
  v_closure jsonb;
  v_items jsonb := '[]'::jsonb;
  v_adjustments jsonb := '[]'::jsonb;
  v_tolls jsonb := '[]'::jsonb;
begin
  select * into v_service
  from public.operator_services
  where service_id = p_service_id;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  select to_jsonb(c) into v_closure
  from public.operator_service_closures c
  where c.service_id = p_service_id;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order, i.created_at), '[]'::jsonb)
  into v_items
  from public.operator_service_items i
  where i.service_id = p_service_id;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.adjusted_at), '[]'::jsonb)
  into v_adjustments
  from public.operator_service_item_adjustments a
  where a.service_id = p_service_id;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at), '[]'::jsonb)
  into v_tolls
  from public.operator_service_tolls t
  where t.service_id = p_service_id;

  return jsonb_build_object(
    'snapshot_version', 1,
    'captured_at', now(),
    'calculation_rule', 'freeze_applied_service_values_v1',
    'service', jsonb_build_object(
      'service_id', v_service.service_id,
      'service_number', v_service.service_number,
      'service_order_number', v_service.service_order_number,
      'purchase_order_number', v_service.purchase_order_number,
      'status', v_service.status,
      'company_id', v_service.company_id,
      'contract_id', v_service.contract_id,
      'rate_card_id', v_service.rate_card_id,
      'billing_setting_id', v_service.billing_setting_id,
      'billing_base_id', v_service.billing_base_id,
      'category_id', v_service.category_id,
      'scheduled_for', v_service.scheduled_for,
      'completed_at', v_service.completed_at,
      'cancelled_at', v_service.cancelled_at,
      'vehicle_plate', v_service.vehicle_plate,
      'origin', v_service.origin,
      'destination', v_service.destination,
      'trip_id', v_service.trip_id,
      'remito_id', v_service.remito_id,
      'estimated_distance_km', v_service.estimated_distance_km,
      'estimated_asphalt_km', v_service.estimated_asphalt_km,
      'estimated_gravel_km', v_service.estimated_gravel_km,
      'toll_estimate', v_service.toll_estimate,
      'is_holiday', v_service.is_holiday,
      'currency', v_service.currency
    ),
    'applied_totals', jsonb_build_object(
      'base_subtotal', v_service.base_subtotal,
      'surcharge_total', v_service.surcharge_total,
      'toll_total', v_service.toll_total,
      'copay_total', v_service.copay_total,
      'estimated_total', v_service.estimated_total,
      'company_estimated_total', v_service.company_estimated_total
    ),
    'pricing_snapshot', coalesce(v_service.pricing_snapshot, '{}'::jsonb),
    'service_billing_snapshot', coalesce(v_service.billing_snapshot, '{}'::jsonb),
    'items', v_items,
    'adjustments', v_adjustments,
    'tolls', v_tolls,
    'closure', v_closure
  );
end;
$function$;

revoke all on function app_private.build_operator_service_billing_snapshot(uuid)
  from public, anon, authenticated;

create or replace function app_private.record_operator_service_billing_revision(
  p_billing_id uuid,
  p_event_type text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_row public.operator_service_billing%rowtype;
  v_event text := lower(coalesce(nullif(btrim(p_event_type), ''), ''));
begin
  if v_event not in ('backfilled','calculated','amounts_confirmed','approved','reopened') then
    raise exception 'Evento financiero inválido';
  end if;

  select * into v_row
  from public.operator_service_billing
  where billing_id = p_billing_id;

  if not found then
    raise exception 'Registro financiero inexistente';
  end if;

  insert into public.operator_service_billing_revisions(
    billing_id, service_id, revision, event_type,
    eligibility, billing_basis, process_status, calculation_state,
    currency, final_base_subtotal, final_surcharge_total, final_toll_total,
    final_copay_total, final_total, company_final_total,
    billing_snapshot, reason, created_by
  ) values (
    v_row.billing_id, v_row.service_id, v_row.revision, v_event,
    v_row.eligibility, v_row.billing_basis, v_row.process_status, v_row.calculation_state,
    v_row.currency, v_row.final_base_subtotal, v_row.final_surcharge_total, v_row.final_toll_total,
    v_row.final_copay_total, v_row.final_total, v_row.company_final_total,
    v_row.billing_snapshot, nullif(btrim(p_reason), ''), auth.uid()
  );
end;
$function$;

revoke all on function app_private.record_operator_service_billing_revision(uuid,text,text)
  from public, anon, authenticated;

create or replace function public.calculate_operator_service_billing(
  p_service_id uuid,
  p_eligibility text default null,
  p_billing_basis text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_closure public.operator_service_closures%rowtype;
  v_existing public.operator_service_billing%rowtype;
  v_billing public.operator_service_billing%rowtype;
  v_legacy jsonb;
  v_eligibility text;
  v_basis text;
  v_calc_state text;
  v_snapshot jsonb;
  v_base numeric(14,2);
  v_surcharge numeric(14,2);
  v_toll numeric(14,2);
  v_copay numeric(14,2);
  v_total numeric(14,2);
  v_company_total numeric(14,2);
  v_reviewed boolean := p_eligibility is not null or p_billing_basis is not null;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para calcular la facturación del servicio';
  end if;

  select * into v_service
  from public.operator_services
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Servicio inexistente';
  end if;

  select * into v_closure
  from public.operator_service_closures
  where service_id = p_service_id;

  v_legacy := app_private.billing_contract_from_legacy_status(v_closure.billing_status);
  v_eligibility := lower(coalesce(nullif(btrim(p_eligibility), ''), v_legacy->>'eligibility', 'pending_review'));
  v_basis := lower(coalesce(nullif(btrim(p_billing_basis), ''), v_legacy->>'billing_basis', 'full'));

  if v_eligibility not in ('pending_review','billable','non_billable') then
    raise exception 'Elegibilidad de facturación inválida';
  end if;
  if v_basis not in ('full','km','origin','movement') then
    raise exception 'Modalidad de facturación inválida';
  end if;
  if v_eligibility <> 'pending_review' and v_service.status not in ('completed','cancelled') then
    raise exception 'El servicio debe estar cerrado antes de resolver su facturación';
  end if;

  select * into v_existing
  from public.operator_service_billing
  where service_id = p_service_id
  for update;

  if found and v_existing.process_status in ('approved','batched','invoiced') then
    raise exception 'FACTURACION_BLOQUEADA: reabrí el registro financiero antes de recalcular';
  end if;

  if v_eligibility = 'non_billable' then
    v_base := 0; v_surcharge := 0; v_toll := 0; v_copay := 0; v_total := 0; v_company_total := 0;
    v_calc_state := 'ready';
  else
    v_base := greatest(coalesce(v_service.base_subtotal, 0), 0);
    v_surcharge := greatest(coalesce(v_service.surcharge_total, 0), 0);
    v_toll := greatest(coalesce(v_service.toll_total, 0), 0);
    v_copay := greatest(coalesce(v_service.copay_total, 0), 0);
    v_total := greatest(coalesce(v_service.estimated_total, 0), 0);
    v_company_total := greatest(coalesce(v_service.company_estimated_total, 0), 0);
    v_calc_state := case
      when v_eligibility = 'billable' and v_basis = 'full' then 'ready'
      else 'requires_review'
    end;
  end if;

  v_snapshot := app_private.build_operator_service_billing_snapshot(p_service_id)
    || jsonb_build_object(
      'eligibility', v_eligibility,
      'billing_basis', v_basis,
      'calculation_state', v_calc_state,
      'finalization_source', case
        when v_eligibility = 'non_billable' then 'non_billable_zero_v1'
        else 'current_applied_service_values_v1'
      end,
      'requires_manual_amount_confirmation',
        (v_eligibility = 'billable' and v_basis <> 'full')
    );

  insert into public.operator_service_billing(
    service_id, closure_id, company_id, contract_id, billing_base_id, service_date,
    eligibility, billing_basis, process_status, calculation_state,
    currency, final_base_subtotal, final_surcharge_total, final_toll_total,
    final_copay_total, final_total, company_final_total,
    billing_snapshot, review_notes, reviewed_by, reviewed_at,
    is_test, updated_at
  ) values (
    v_service.service_id, v_closure.closure_id, v_service.company_id, v_service.contract_id,
    v_service.billing_base_id,
    (coalesce(v_service.completed_at, v_service.cancelled_at, v_service.scheduled_for) at time zone 'America/Argentina/Buenos_Aires')::date,
    v_eligibility, v_basis, 'pending', v_calc_state,
    v_service.currency, v_base, v_surcharge, v_toll,
    v_copay, v_total, v_company_total,
    v_snapshot, nullif(btrim(p_notes), ''),
    case when v_reviewed then v_uid else null end,
    case when v_reviewed then now() else null end,
    coalesce(v_service.is_test, false), now()
  )
  on conflict (service_id) do update set
    closure_id = excluded.closure_id,
    company_id = excluded.company_id,
    contract_id = excluded.contract_id,
    billing_base_id = excluded.billing_base_id,
    service_date = excluded.service_date,
    eligibility = excluded.eligibility,
    billing_basis = excluded.billing_basis,
    process_status = 'pending',
    calculation_state = excluded.calculation_state,
    currency = excluded.currency,
    final_base_subtotal = excluded.final_base_subtotal,
    final_surcharge_total = excluded.final_surcharge_total,
    final_toll_total = excluded.final_toll_total,
    final_copay_total = excluded.final_copay_total,
    final_total = excluded.final_total,
    company_final_total = excluded.company_final_total,
    billing_snapshot = excluded.billing_snapshot,
    review_notes = excluded.review_notes,
    reviewed_by = excluded.reviewed_by,
    reviewed_at = excluded.reviewed_at,
    approved_by = null,
    approved_at = null,
    locked_by = null,
    locked_at = null,
    is_test = excluded.is_test,
    updated_at = now()
  returning * into v_billing;

  perform app_private.record_operator_service_billing_revision(
    v_billing.billing_id,
    'calculated',
    p_notes
  );

  insert into public.operator_service_events(service_id, event_type, notes, created_by)
  values (
    p_service_id,
    'billing_calculated',
    concat_ws(' · ',
      'Elegibilidad: ' || v_eligibility,
      'Modalidad: ' || v_basis,
      'Estado de cálculo: ' || v_calc_state,
      nullif(btrim(p_notes), '')
    ),
    v_uid
  );

  return to_jsonb(v_billing);
end;
$function$;

revoke all on function public.calculate_operator_service_billing(uuid,text,text,text)
  from public, anon;
grant execute on function public.calculate_operator_service_billing(uuid,text,text,text)
  to authenticated;

-- Para modalidades parciales (km/origen/movida), Facturación confirma explícitamente
-- el desglose definitivo en lugar de inferir reglas comerciales no modeladas.
create or replace function public.confirm_operator_service_billing_amounts(
  p_service_id uuid,
  p_base_subtotal numeric,
  p_surcharge_total numeric default 0,
  p_toll_total numeric default 0,
  p_copay_total numeric default 0,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_billing public.operator_service_billing%rowtype;
  v_total numeric(14,2);
  v_company_total numeric(14,2);
  v_snapshot jsonb;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para confirmar importes de facturación';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Ingresá el motivo de la confirmación de importes';
  end if;
  if p_base_subtotal is null or p_base_subtotal < 0
     or coalesce(p_surcharge_total, 0) < 0
     or coalesce(p_toll_total, 0) < 0
     or coalesce(p_copay_total, 0) < 0 then
    raise exception 'Los importes de facturación no pueden ser negativos';
  end if;

  select * into v_billing
  from public.operator_service_billing
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'El servicio todavía no tiene un registro financiero';
  end if;
  if v_billing.process_status <> 'pending' then
    raise exception 'FACTURACION_BLOQUEADA: el registro no admite cambios de importes';
  end if;
  if v_billing.eligibility <> 'billable' then
    raise exception 'Solo un servicio facturable admite confirmación manual de importes';
  end if;

  v_total := round(
    p_base_subtotal + coalesce(p_surcharge_total, 0) + coalesce(p_toll_total, 0),
    2
  );
  if coalesce(p_copay_total, 0) > v_total then
    raise exception 'El copago no puede superar el total facturable';
  end if;
  v_company_total := round(v_total - coalesce(p_copay_total, 0), 2);

  v_snapshot := app_private.build_operator_service_billing_snapshot(p_service_id)
    || jsonb_build_object(
      'eligibility', v_billing.eligibility,
      'billing_basis', v_billing.billing_basis,
      'calculation_state', 'ready',
      'finalization_source', 'manual_billing_confirmation_v1',
      'manual_confirmation', jsonb_build_object(
        'reason', btrim(p_reason),
        'confirmed_by', v_uid,
        'confirmed_at', now(),
        'final_base_subtotal', round(p_base_subtotal, 2),
        'final_surcharge_total', round(coalesce(p_surcharge_total, 0), 2),
        'final_toll_total', round(coalesce(p_toll_total, 0), 2),
        'final_copay_total', round(coalesce(p_copay_total, 0), 2),
        'final_total', v_total,
        'company_final_total', v_company_total
      )
    );

  update public.operator_service_billing
  set final_base_subtotal = round(p_base_subtotal, 2),
      final_surcharge_total = round(coalesce(p_surcharge_total, 0), 2),
      final_toll_total = round(coalesce(p_toll_total, 0), 2),
      final_copay_total = round(coalesce(p_copay_total, 0), 2),
      final_total = v_total,
      company_final_total = v_company_total,
      calculation_state = 'ready',
      billing_snapshot = v_snapshot,
      review_notes = concat_ws(E'\n', nullif(review_notes, ''), 'Importes confirmados: ' || btrim(p_reason)),
      reviewed_by = v_uid,
      reviewed_at = now(),
      updated_at = now()
  where billing_id = v_billing.billing_id
  returning * into v_billing;

  perform app_private.record_operator_service_billing_revision(
    v_billing.billing_id,
    'amounts_confirmed',
    p_reason
  );

  insert into public.operator_service_events(service_id, event_type, notes, created_by)
  values (p_service_id, 'billing_amounts_confirmed', btrim(p_reason), v_uid);

  return to_jsonb(v_billing);
end;
$function$;

revoke all on function public.confirm_operator_service_billing_amounts(uuid,numeric,numeric,numeric,numeric,text)
  from public, anon;
grant execute on function public.confirm_operator_service_billing_amounts(uuid,numeric,numeric,numeric,numeric,text)
  to authenticated;

create or replace function public.approve_operator_service_billing(
  p_service_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_service public.operator_services%rowtype;
  v_billing public.operator_service_billing%rowtype;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para aprobar la facturación del servicio';
  end if;

  select * into v_service
  from public.operator_services
  where service_id = p_service_id
  for share;

  if not found then
    raise exception 'Servicio inexistente';
  end if;
  if v_service.status not in ('completed','cancelled') then
    raise exception 'El servicio debe estar cerrado antes de aprobar su facturación';
  end if;

  select * into v_billing
  from public.operator_service_billing
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Calculá primero la facturación del servicio';
  end if;
  if v_billing.process_status <> 'pending' then
    raise exception 'El registro financiero no está pendiente de aprobación';
  end if;
  if v_billing.eligibility = 'pending_review' then
    raise exception 'Definí primero si el servicio es facturable';
  end if;
  if v_billing.calculation_state <> 'ready' then
    raise exception 'Confirmá el importe definitivo antes de aprobar esta modalidad de facturación';
  end if;

  update public.operator_service_billing
  set process_status = 'approved',
      approved_by = v_uid,
      approved_at = now(),
      locked_by = v_uid,
      locked_at = now(),
      review_notes = concat_ws(E'\n', nullif(review_notes, ''), nullif(btrim(p_notes), '')),
      billing_snapshot = billing_snapshot || jsonb_build_object(
        'approved_by', v_uid,
        'approved_at', now(),
        'locked', true
      ),
      updated_at = now()
  where billing_id = v_billing.billing_id
  returning * into v_billing;

  perform app_private.record_operator_service_billing_revision(
    v_billing.billing_id,
    'approved',
    p_notes
  );

  insert into public.operator_service_events(service_id, event_type, notes, created_by)
  values (
    p_service_id,
    'billing_approved',
    concat_ws(' · ',
      'Modalidad: ' || v_billing.billing_basis,
      'Total prestadora: ' || v_billing.company_final_total::text,
      nullif(btrim(p_notes), '')
    ),
    v_uid
  );

  return to_jsonb(v_billing);
end;
$function$;

revoke all on function public.approve_operator_service_billing(uuid,text)
  from public, anon;
grant execute on function public.approve_operator_service_billing(uuid,text)
  to authenticated;

create or replace function public.reopen_operator_service_billing(
  p_service_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_billing public.operator_service_billing%rowtype;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para reabrir la facturación del servicio';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Ingresá el motivo de la reapertura';
  end if;

  select * into v_billing
  from public.operator_service_billing
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'Registro financiero inexistente';
  end if;
  if v_billing.process_status in ('batched','invoiced') then
    raise exception 'FACTURACION_BLOQUEADA: el servicio pertenece a un lote cerrado o facturado';
  end if;
  if v_billing.process_status <> 'approved' then
    raise exception 'Solo una facturación aprobada puede reabrirse';
  end if;

  -- Preserva exactamente la versión aprobada antes de liberar los datos económicos.
  perform app_private.record_operator_service_billing_revision(
    v_billing.billing_id,
    'reopened',
    p_reason
  );

  update public.operator_service_billing
  set process_status = 'pending',
      calculation_state = 'requires_review',
      approved_by = null,
      approved_at = null,
      locked_by = null,
      locked_at = null,
      revision = revision + 1,
      last_reopen_reason = btrim(p_reason),
      reopened_by = v_uid,
      reopened_at = now(),
      billing_snapshot = billing_snapshot || jsonb_build_object(
        'reopened_by', v_uid,
        'reopened_at', now(),
        'reopen_reason', btrim(p_reason),
        'locked', false
      ),
      updated_at = now()
  where billing_id = v_billing.billing_id
  returning * into v_billing;

  insert into public.operator_service_events(service_id, event_type, notes, created_by)
  values (p_service_id, 'billing_reopened', btrim(p_reason), v_uid);

  return to_jsonb(v_billing);
end;
$function$;

revoke all on function public.reopen_operator_service_billing(uuid,text)
  from public, anon;
grant execute on function public.reopen_operator_service_billing(uuid,text)
  to authenticated;

-- Integra el flujo legado de revisión de cierres con el contrato financiero nuevo.
create or replace function public.review_operator_service_closure(
  p_service_id uuid,
  p_billing_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_uid uuid := auth.uid();
  v_status text := lower(coalesce(nullif(btrim(p_billing_status), ''), ''));
  v_closure public.operator_service_closures%rowtype;
  v_contract jsonb;
  v_billing jsonb;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para revisar la condición económica';
  end if;
  if v_status not in (
    'pending_review','billable','non_billable',
    'billable_km','billable_origin','billable_movement'
  ) then
    raise exception 'Condición económica inválida';
  end if;

  select * into v_closure
  from public.operator_service_closures
  where service_id = p_service_id
  for update;

  if not found then
    raise exception 'El servicio no tiene un cierre operativo para revisar';
  end if;

  v_contract := app_private.billing_contract_from_legacy_status(v_status);

  update public.operator_service_closures
  set billing_status = v_status,
      billing_notes = nullif(btrim(p_notes), ''),
      billing_reviewed_by = v_uid,
      billing_reviewed_at = now(),
      updated_at = now()
  where closure_id = v_closure.closure_id
  returning * into v_closure;

  v_billing := public.calculate_operator_service_billing(
    p_service_id,
    v_contract->>'eligibility',
    v_contract->>'billing_basis',
    p_notes
  );

  insert into public.operator_service_events(service_id, event_type, notes, created_by)
  values (
    p_service_id,
    'billing_review',
    concat_ws(' · ', 'Condición legacy: ' || v_status, nullif(btrim(p_notes), '')),
    v_uid
  );

  return jsonb_build_object(
    'service_id', p_service_id,
    'closure_id', v_closure.closure_id,
    'billing_status', v_closure.billing_status,
    'billing_reviewed_at', v_closure.billing_reviewed_at,
    'eligibility', v_billing->>'eligibility',
    'billing_basis', v_billing->>'billing_basis',
    'process_status', v_billing->>'process_status',
    'calculation_state', v_billing->>'calculation_state',
    'company_final_total', v_billing->'company_final_total'
  );
end;
$function$;

revoke all on function public.review_operator_service_closure(uuid,text,text)
  from public, anon;
grant execute on function public.review_operator_service_closure(uuid,text,text)
  to authenticated;

-- Un servicio aprobado no puede cambiar silenciosamente sus datos económicos.
create or replace function app_private.operator_service_financial_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_locked boolean;
begin
  select exists(
    select 1
    from public.operator_service_billing b
    where b.service_id = old.service_id
      and b.process_status in ('approved','batched','invoiced')
  ) into v_locked;

  if not v_locked then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'FACTURACION_BLOQUEADA: no se puede eliminar un servicio aprobado o facturado';
  end if;

  if jsonb_build_object(
      'company_id', old.company_id,
      'branch_id', old.branch_id,
      'contract_id', old.contract_id,
      'rate_card_id', old.rate_card_id,
      'billing_setting_id', old.billing_setting_id,
      'billing_base_id', old.billing_base_id,
      'billing_snapshot', old.billing_snapshot,
      'service_order_number', old.service_order_number,
      'purchase_order_number', old.purchase_order_number,
      'category_id', old.category_id,
      'vehicle_plate', old.vehicle_plate,
      'origin', old.origin,
      'destination', old.destination,
      'estimated_distance_km', old.estimated_distance_km,
      'estimated_asphalt_km', old.estimated_asphalt_km,
      'estimated_gravel_km', old.estimated_gravel_km,
      'toll_estimate', old.toll_estimate,
      'is_holiday', old.is_holiday,
      'currency', old.currency,
      'base_subtotal', old.base_subtotal,
      'surcharge_total', old.surcharge_total,
      'toll_total', old.toll_total,
      'copay_total', old.copay_total,
      'estimated_total', old.estimated_total,
      'company_estimated_total', old.company_estimated_total,
      'pricing_snapshot', old.pricing_snapshot
    ) is distinct from jsonb_build_object(
      'company_id', new.company_id,
      'branch_id', new.branch_id,
      'contract_id', new.contract_id,
      'rate_card_id', new.rate_card_id,
      'billing_setting_id', new.billing_setting_id,
      'billing_base_id', new.billing_base_id,
      'billing_snapshot', new.billing_snapshot,
      'service_order_number', new.service_order_number,
      'purchase_order_number', new.purchase_order_number,
      'category_id', new.category_id,
      'vehicle_plate', new.vehicle_plate,
      'origin', new.origin,
      'destination', new.destination,
      'estimated_distance_km', new.estimated_distance_km,
      'estimated_asphalt_km', new.estimated_asphalt_km,
      'estimated_gravel_km', new.estimated_gravel_km,
      'toll_estimate', new.toll_estimate,
      'is_holiday', new.is_holiday,
      'currency', new.currency,
      'base_subtotal', new.base_subtotal,
      'surcharge_total', new.surcharge_total,
      'toll_total', new.toll_total,
      'copay_total', new.copay_total,
      'estimated_total', new.estimated_total,
      'company_estimated_total', new.company_estimated_total,
      'pricing_snapshot', new.pricing_snapshot
    ) then
    raise exception 'FACTURACION_BLOQUEADA: reabrí la facturación antes de modificar datos económicos';
  end if;

  return new;
end;
$function$;

revoke all on function app_private.operator_service_financial_lock_guard()
  from public, anon, authenticated;

drop trigger if exists operator_services_billing_lock_guard on public.operator_services;
create trigger operator_services_billing_lock_guard
before update or delete on public.operator_services
for each row execute function app_private.operator_service_financial_lock_guard();

create or replace function app_private.operator_service_child_financial_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_service_id uuid;
  v_old_service_id uuid;
begin
  if tg_op = 'DELETE' then
    v_service_id := old.service_id;
  else
    v_service_id := new.service_id;
  end if;

  if tg_op = 'UPDATE' then
    v_old_service_id := old.service_id;
  end if;

  if exists(
    select 1 from public.operator_service_billing b
    where b.service_id = v_service_id
      and b.process_status in ('approved','batched','invoiced')
  ) or (
    v_old_service_id is not null
    and v_old_service_id is distinct from v_service_id
    and exists(
      select 1 from public.operator_service_billing b
      where b.service_id = v_old_service_id
        and b.process_status in ('approved','batched','invoiced')
    )
  ) then
    raise exception 'FACTURACION_BLOQUEADA: reabrí la facturación antes de modificar conceptos o peajes';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function app_private.operator_service_child_financial_lock_guard()
  from public, anon, authenticated;

drop trigger if exists operator_service_items_billing_lock_guard on public.operator_service_items;
create trigger operator_service_items_billing_lock_guard
before insert or update or delete on public.operator_service_items
for each row execute function app_private.operator_service_child_financial_lock_guard();

drop trigger if exists operator_service_tolls_billing_lock_guard on public.operator_service_tolls;
create trigger operator_service_tolls_billing_lock_guard
before insert or update or delete on public.operator_service_tolls
for each row execute function app_private.operator_service_child_financial_lock_guard();

-- Backfill: todo servicio ya cerrado entra al nuevo pipeline, sin declarar como
-- facturable automáticamente aquello que todavía no fue revisado.
insert into public.operator_service_billing(
  service_id, closure_id, company_id, contract_id, billing_base_id, service_date,
  eligibility, billing_basis, process_status, calculation_state,
  currency, final_base_subtotal, final_surcharge_total, final_toll_total,
  final_copay_total, final_total, company_final_total,
  billing_snapshot, review_notes, reviewed_by, reviewed_at,
  is_test, created_at, updated_at
)
select
  s.service_id,
  c.closure_id,
  s.company_id,
  s.contract_id,
  s.billing_base_id,
  (coalesce(s.completed_at, s.cancelled_at, s.scheduled_for) at time zone 'America/Argentina/Buenos_Aires')::date,
  contract_data.contract->>'eligibility',
  contract_data.contract->>'billing_basis',
  'pending',
  case
    when contract_data.contract->>'eligibility' = 'non_billable' then 'ready'
    when contract_data.contract->>'eligibility' = 'billable'
      and contract_data.contract->>'billing_basis' = 'full' then 'ready'
    else 'requires_review'
  end,
  s.currency,
  case when contract_data.contract->>'eligibility' = 'non_billable' then 0 else greatest(coalesce(s.base_subtotal,0),0) end,
  case when contract_data.contract->>'eligibility' = 'non_billable' then 0 else greatest(coalesce(s.surcharge_total,0),0) end,
  case when contract_data.contract->>'eligibility' = 'non_billable' then 0 else greatest(coalesce(s.toll_total,0),0) end,
  case when contract_data.contract->>'eligibility' = 'non_billable' then 0 else greatest(coalesce(s.copay_total,0),0) end,
  case when contract_data.contract->>'eligibility' = 'non_billable' then 0 else greatest(coalesce(s.estimated_total,0),0) end,
  case when contract_data.contract->>'eligibility' = 'non_billable' then 0 else greatest(coalesce(s.company_estimated_total,0),0) end,
  app_private.build_operator_service_billing_snapshot(s.service_id)
    || jsonb_build_object(
      'eligibility', contract_data.contract->>'eligibility',
      'billing_basis', contract_data.contract->>'billing_basis',
      'backfilled_at', now(),
      'finalization_source', case
        when contract_data.contract->>'eligibility' = 'non_billable' then 'non_billable_zero_v1'
        else 'current_applied_service_values_v1'
      end,
      'requires_manual_amount_confirmation',
        (contract_data.contract->>'eligibility' = 'billable'
         and contract_data.contract->>'billing_basis' <> 'full')
    ),
  c.billing_notes,
  c.billing_reviewed_by,
  c.billing_reviewed_at,
  coalesce(s.is_test,false),
  now(),
  now()
from public.operator_services s
left join public.operator_service_closures c on c.service_id = s.service_id
cross join lateral (
  select app_private.billing_contract_from_legacy_status(
    coalesce(c.billing_status, 'pending_review')
  ) as contract
) contract_data
where s.status in ('completed','cancelled')
on conflict (service_id) do nothing;

insert into public.operator_service_billing_revisions(
  billing_id, service_id, revision, event_type,
  eligibility, billing_basis, process_status, calculation_state,
  currency, final_base_subtotal, final_surcharge_total, final_toll_total,
  final_copay_total, final_total, company_final_total,
  billing_snapshot, reason, created_by, created_at
)
select
  b.billing_id, b.service_id, b.revision, 'backfilled',
  b.eligibility, b.billing_basis, b.process_status, b.calculation_state,
  b.currency, b.final_base_subtotal, b.final_surcharge_total, b.final_toll_total,
  b.final_copay_total, b.final_total, b.company_final_total,
  b.billing_snapshot, 'Migración inicial del contrato financiero canónico', null, now()
from public.operator_service_billing b
where not exists (
  select 1 from public.operator_service_billing_revisions r
  where r.billing_id = b.billing_id
);
