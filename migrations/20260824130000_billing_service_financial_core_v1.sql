-- AuxiliOS · Facturación · Fases 0+1
-- Consolida el flujo productivo existente (pending/reviewed/invoiced + revisions)
-- con un registro financiero canónico por servicio, sin duplicar la historia ya desplegada.

-- -----------------------------------------------------------------------------
-- 0. Compatibilidad con instalaciones cuyo esquema todavía no recibió Billing v1
-- -----------------------------------------------------------------------------
do $compat$
declare
  v_has_billing_status boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='operator_services' and column_name='billing_status'
  ) into v_has_billing_status;

  if not v_has_billing_status then
    alter table public.operator_services
      add column billing_status text not null default 'not_ready';

    update public.operator_services
    set billing_status='pending'
    where status='completed';
  end if;

  if not exists(
    select 1 from pg_constraint
    where conrelid='public.operator_services'::regclass
      and conname='operator_services_billing_status_check'
  ) then
    alter table public.operator_services
      add constraint operator_services_billing_status_check
      check (billing_status in ('not_ready','pending','reviewed','invoiced','excluded'));
  end if;
end;
$compat$;

-- Esta tabla ya existe en producción. Se conserva como bitácora histórica y
-- también se crea en una instalación limpia para que la migración sea autocontenida.
create table if not exists public.operator_service_billing_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.operator_services(service_id) on delete restrict,
  billing_status text not null check (billing_status in ('pending','reviewed','invoiced','excluded')),
  previous_company_amount numeric(14,2),
  company_amount numeric(14,2) not null check (company_amount >= 0),
  currency text not null default 'ARS' check (currency in ('ARS','USD')),
  quote_snapshot jsonb not null default '{}'::jsonb,
  rate_card_id uuid references public.company_rate_cards(rate_card_id) on delete restrict,
  rate_card_version integer,
  reason text,
  created_by uuid not null default auth.uid() references public.users(user_id),
  created_at timestamptz not null default now()
);

create index if not exists operator_service_billing_revisions_service_idx
  on public.operator_service_billing_revisions(service_id, created_at desc);

alter table public.operator_service_billing_revisions enable row level security;
revoke all on table public.operator_service_billing_revisions from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 1. Registro financiero canónico 1:1 por servicio
-- -----------------------------------------------------------------------------
create table if not exists public.operator_service_billing (
  billing_id uuid primary key default gen_random_uuid(),
  service_id uuid not null unique references public.operator_services(service_id) on delete restrict,
  closure_id uuid unique references public.operator_service_closures(closure_id) on delete restrict,
  source_revision_id uuid references public.operator_service_billing_revisions(revision_id) on delete restrict,
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

alter table public.operator_service_billing enable row level security;

drop policy if exists operator_service_billing_finance_read on public.operator_service_billing;
create policy operator_service_billing_finance_read
  on public.operator_service_billing
  for select
  to authenticated
  using ((select app_private.current_auxilios_role()) in ('administracion','facturacion','supervision'));

revoke all on table public.operator_service_billing from public, anon, authenticated;
grant select on table public.operator_service_billing to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Traducciones de compatibilidad
-- -----------------------------------------------------------------------------
create or replace function app_private.billing_contract_from_closure_status(p_status text)
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

revoke all on function app_private.billing_contract_from_closure_status(text)
  from public, anon, authenticated;

-- Usa Billing Quote V2 cuando está desplegado. En una instalación sin ese módulo,
-- congela los valores aplicados que ya viven en operator_services/pricing_snapshot.
create or replace function app_private.get_operator_service_billing_quote_compat(p_service_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_service public.operator_services%rowtype;
  v_quote jsonb;
begin
  select * into v_service
  from public.operator_services
  where service_id=p_service_id;

  if not found then raise exception 'Servicio inexistente'; end if;

  if to_regprocedure('app_private.calculate_operator_service_billing_quote_v2(uuid)') is not null then
    begin
      execute 'select app_private.calculate_operator_service_billing_quote_v2($1)'
      into v_quote
      using p_service_id;
    exception when others then
      v_quote:=null;
    end;
  end if;

  if v_quote is null then
    v_quote:=coalesce(v_service.pricing_snapshot,'{}'::jsonb)||jsonb_build_object(
      'service_id',v_service.service_id,
      'service_number',v_service.service_number,
      'contract_id',v_service.contract_id,
      'rate_card_id',v_service.rate_card_id,
      'currency',v_service.currency,
      'base_subtotal',v_service.base_subtotal,
      'surcharge_total',v_service.surcharge_total,
      'toll_total',v_service.toll_total,
      'copay_total',v_service.copay_total,
      'estimated_total',v_service.estimated_total,
      'company_estimated_total',v_service.company_estimated_total,
      'stored_company_amount',v_service.company_estimated_total,
      'current_company_amount',v_service.company_estimated_total,
      'billing_source','stored_applied_values_fallback'
    );
  end if;

  return v_quote;
end;
$function$;

revoke all on function app_private.get_operator_service_billing_quote_compat(uuid)
  from public, anon, authenticated;

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
  where service_id=p_service_id;

  if not found then raise exception 'Servicio inexistente'; end if;

  select to_jsonb(c) into v_closure
  from public.operator_service_closures c
  where c.service_id=p_service_id;

  select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order,i.created_at),'[]'::jsonb)
  into v_items
  from public.operator_service_items i
  where i.service_id=p_service_id;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.adjusted_at),'[]'::jsonb)
  into v_adjustments
  from public.operator_service_item_adjustments a
  where a.service_id=p_service_id;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at),'[]'::jsonb)
  into v_tolls
  from public.operator_service_tolls t
  where t.service_id=p_service_id;

  return jsonb_build_object(
    'snapshot_version',1,
    'captured_at',now(),
    'calculation_rule','freeze_applied_service_values_v1',
    'service',jsonb_build_object(
      'service_id',v_service.service_id,
      'service_number',v_service.service_number,
      'service_order_number',v_service.service_order_number,
      'purchase_order_number',v_service.purchase_order_number,
      'status',v_service.status,
      'billing_status',v_service.billing_status,
      'company_id',v_service.company_id,
      'contract_id',v_service.contract_id,
      'rate_card_id',v_service.rate_card_id,
      'billing_setting_id',v_service.billing_setting_id,
      'billing_base_id',v_service.billing_base_id,
      'category_id',v_service.category_id,
      'scheduled_for',v_service.scheduled_for,
      'completed_at',v_service.completed_at,
      'cancelled_at',v_service.cancelled_at,
      'vehicle_plate',v_service.vehicle_plate,
      'origin',v_service.origin,
      'destination',v_service.destination,
      'trip_id',v_service.trip_id,
      'remito_id',v_service.remito_id,
      'estimated_distance_km',v_service.estimated_distance_km,
      'estimated_asphalt_km',v_service.estimated_asphalt_km,
      'estimated_gravel_km',v_service.estimated_gravel_km,
      'toll_estimate',v_service.toll_estimate,
      'is_holiday',v_service.is_holiday,
      'currency',v_service.currency
    ),
    'applied_totals',jsonb_build_object(
      'base_subtotal',v_service.base_subtotal,
      'surcharge_total',v_service.surcharge_total,
      'toll_total',v_service.toll_total,
      'copay_total',v_service.copay_total,
      'estimated_total',v_service.estimated_total,
      'company_estimated_total',v_service.company_estimated_total
    ),
    'pricing_snapshot',coalesce(v_service.pricing_snapshot,'{}'::jsonb),
    'service_billing_snapshot',coalesce(v_service.billing_snapshot,'{}'::jsonb),
    'items',v_items,
    'adjustments',v_adjustments,
    'tolls',v_tolls,
    'closure',v_closure
  );
end;
$function$;

revoke all on function app_private.build_operator_service_billing_snapshot(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Sincronización del flujo productivo legado con el ledger canónico
-- -----------------------------------------------------------------------------
create or replace function app_private.sync_operator_service_billing_v1(p_service_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  s public.operator_services%rowtype;
  c public.operator_service_closures%rowtype;
  b public.operator_service_billing%rowtype;
  r public.operator_service_billing_revisions%rowtype;
  v_contract jsonb;
  v_quote jsonb;
  v_eligibility text := 'pending_review';
  v_basis text := 'full';
  v_process text := 'pending';
  v_calc text := 'requires_review';
  v_base numeric(14,2) := 0;
  v_surcharge numeric(14,2) := 0;
  v_toll numeric(14,2) := 0;
  v_copay numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_company numeric(14,2) := 0;
  v_snapshot jsonb := '{}'::jsonb;
  v_lock_at timestamptz;
  v_lock_by uuid;
begin
  select * into s from public.operator_services where service_id=p_service_id;
  if not found then return; end if;
  if s.status not in ('completed','cancelled') then return; end if;

  select * into c
  from public.operator_service_closures
  where service_id=p_service_id;

  select * into b
  from public.operator_service_billing
  where service_id=p_service_id;

  select * into r
  from public.operator_service_billing_revisions
  where service_id=p_service_id
    and billing_status=case
      when s.billing_status='invoiced' then 'invoiced'
      when s.billing_status='reviewed' then 'reviewed'
      when s.billing_status='excluded' then 'excluded'
      else billing_status
    end
  order by created_at desc
  limit 1;

  if c.closure_id is not null then
    v_contract:=app_private.billing_contract_from_closure_status(c.billing_status);
    v_eligibility:=v_contract->>'eligibility';
    v_basis:=v_contract->>'billing_basis';
  elsif b.billing_id is not null then
    v_eligibility:=b.eligibility;
    v_basis:=b.billing_basis;
  elsif s.billing_status in ('reviewed','invoiced') then
    v_eligibility:='billable';
    v_basis:='full';
  end if;

  if s.billing_status='invoiced' then
    v_process:='invoiced'; v_calc:='ready';
  elsif s.billing_status='reviewed' then
    v_process:='approved'; v_calc:='ready';
  elsif s.billing_status='excluded' then
    v_eligibility:='non_billable'; v_process:='approved'; v_calc:='ready';
  elsif s.status='cancelled' and c.closure_id is not null then
    if v_eligibility='non_billable' and c.billing_reviewed_at is not null then
      v_process:='approved'; v_calc:='ready';
    elsif b.billing_id is not null and b.process_status in ('approved','batched','invoiced') then
      v_process:=b.process_status; v_calc:=b.calculation_state;
    else
      v_process:='pending';
      v_calc:=case when v_eligibility='billable' and v_basis='full' then 'requires_review' else 'requires_review' end;
    end if;
  elsif s.billing_status='not_ready' then
    v_process:='voided'; v_calc:='requires_review';
  else
    v_process:='pending';
    if b.billing_id is not null and b.calculation_state='ready' then
      v_calc:='ready';
    else
      v_calc:='requires_review';
    end if;
  end if;

  if v_eligibility='non_billable' then
    v_base:=0;v_surcharge:=0;v_toll:=0;v_copay:=0;v_total:=0;v_company:=0;
  elsif b.billing_id is not null and b.billing_basis<>'full' and b.calculation_state='ready' then
    v_base:=b.final_base_subtotal;
    v_surcharge:=b.final_surcharge_total;
    v_toll:=b.final_toll_total;
    v_copay:=b.final_copay_total;
    v_total:=b.final_total;
    v_company:=b.company_final_total;
  elsif r.revision_id is not null and s.billing_status in ('reviewed','invoiced') then
    v_quote:=coalesce(r.quote_snapshot,'{}'::jsonb);
    v_base:=greatest(coalesce(nullif(v_quote->>'base_subtotal','')::numeric,s.base_subtotal,0),0);
    v_surcharge:=greatest(coalesce(nullif(v_quote->>'surcharge_total','')::numeric,s.surcharge_total,0),0);
    v_toll:=greatest(coalesce(nullif(v_quote->>'toll_total','')::numeric,s.toll_total,0),0);
    v_copay:=greatest(coalesce(nullif(v_quote->>'copay_total','')::numeric,s.copay_total,0),0);
    v_total:=greatest(coalesce(nullif(v_quote->>'estimated_total','')::numeric,s.estimated_total,0),0);
    v_company:=greatest(coalesce(r.company_amount,s.company_estimated_total,0),0);
  else
    v_base:=greatest(coalesce(s.base_subtotal,0),0);
    v_surcharge:=greatest(coalesce(s.surcharge_total,0),0);
    v_toll:=greatest(coalesce(s.toll_total,0),0);
    v_copay:=greatest(coalesce(s.copay_total,0),0);
    v_total:=greatest(coalesce(s.estimated_total,0),0);
    v_company:=greatest(coalesce(s.company_estimated_total,0),0);
  end if;

  if v_company>v_total then
    v_total:=v_company+v_copay;
  end if;

  v_snapshot:=case
    when b.billing_id is not null and b.billing_basis<>'full' and b.calculation_state='ready'
      then b.billing_snapshot
    else app_private.build_operator_service_billing_snapshot(p_service_id)
      || jsonb_build_object(
        'canonical_source','legacy_billing_sync_v1',
        'legacy_quote',coalesce(r.quote_snapshot,'{}'::jsonb),
        'legacy_revision_id',r.revision_id,
        'legacy_billing_status',s.billing_status,
        'eligibility',v_eligibility,
        'billing_basis',v_basis,
        'calculation_state',v_calc
      )
  end;

  if v_process in ('approved','batched','invoiced') then
    v_lock_at:=coalesce(r.created_at,b.locked_at,now());
    v_lock_by:=coalesce(r.created_by,b.locked_by);
  else
    v_lock_at:=null;
    v_lock_by:=null;
  end if;

  insert into public.operator_service_billing(
    service_id,closure_id,source_revision_id,company_id,contract_id,billing_base_id,service_date,
    eligibility,billing_basis,process_status,calculation_state,currency,
    final_base_subtotal,final_surcharge_total,final_toll_total,final_copay_total,final_total,company_final_total,
    billing_snapshot,review_notes,reviewed_by,reviewed_at,approved_by,approved_at,locked_by,locked_at,
    revision,last_reopen_reason,reopened_by,reopened_at,is_test,updated_at
  ) values (
    s.service_id,c.closure_id,r.revision_id,s.company_id,s.contract_id,s.billing_base_id,
    (coalesce(s.completed_at,s.cancelled_at,s.scheduled_for) at time zone 'America/Argentina/Buenos_Aires')::date,
    v_eligibility,v_basis,v_process,v_calc,coalesce(r.currency,s.currency,'ARS'),
    round(v_base,2),round(v_surcharge,2),round(v_toll,2),round(v_copay,2),round(v_total,2),round(v_company,2),
    v_snapshot,c.billing_notes,
    coalesce(c.billing_reviewed_by,r.created_by,b.reviewed_by),coalesce(c.billing_reviewed_at,r.created_at,b.reviewed_at),
    case when v_process in ('approved','batched','invoiced') then coalesce(r.created_by,b.approved_by) else null end,
    case when v_process in ('approved','batched','invoiced') then coalesce(r.created_at,b.approved_at,now()) else null end,
    v_lock_by,v_lock_at,coalesce(b.revision,1),b.last_reopen_reason,b.reopened_by,b.reopened_at,coalesce(s.is_test,false),now()
  )
  on conflict (service_id) do update set
    closure_id=excluded.closure_id,
    source_revision_id=coalesce(excluded.source_revision_id,operator_service_billing.source_revision_id),
    company_id=excluded.company_id,
    contract_id=excluded.contract_id,
    billing_base_id=excluded.billing_base_id,
    service_date=excluded.service_date,
    eligibility=excluded.eligibility,
    billing_basis=excluded.billing_basis,
    process_status=excluded.process_status,
    calculation_state=excluded.calculation_state,
    currency=excluded.currency,
    final_base_subtotal=excluded.final_base_subtotal,
    final_surcharge_total=excluded.final_surcharge_total,
    final_toll_total=excluded.final_toll_total,
    final_copay_total=excluded.final_copay_total,
    final_total=excluded.final_total,
    company_final_total=excluded.company_final_total,
    billing_snapshot=excluded.billing_snapshot,
    review_notes=coalesce(excluded.review_notes,operator_service_billing.review_notes),
    reviewed_by=coalesce(excluded.reviewed_by,operator_service_billing.reviewed_by),
    reviewed_at=coalesce(excluded.reviewed_at,operator_service_billing.reviewed_at),
    approved_by=excluded.approved_by,
    approved_at=excluded.approved_at,
    locked_by=excluded.locked_by,
    locked_at=excluded.locked_at,
    is_test=excluded.is_test,
    updated_at=now();
end;
$function$;

revoke all on function app_private.sync_operator_service_billing_v1(uuid)
  from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. API canónica para cálculo, confirmación, aprobación y reapertura
-- -----------------------------------------------------------------------------
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
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  s public.operator_services%rowtype;
  c public.operator_service_closures%rowtype;
  b public.operator_service_billing%rowtype;
  v_contract jsonb;
  q jsonb;
  v_eligibility text;
  v_basis text;
  v_calc text;
  v_base numeric(14,2);
  v_surcharge numeric(14,2);
  v_toll numeric(14,2);
  v_copay numeric(14,2);
  v_total numeric(14,2);
  v_company numeric(14,2);
  v_snapshot jsonb;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then
    raise exception 'Sin permiso para calcular la facturación del servicio';
  end if;

  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found then raise exception 'Servicio inexistente'; end if;
  if s.status not in ('completed','cancelled') then
    raise exception 'El servicio debe estar cerrado antes de calcular su facturación';
  end if;

  select * into c from public.operator_service_closures where service_id=p_service_id;
  select * into b from public.operator_service_billing where service_id=p_service_id for update;

  if b.billing_id is not null and b.process_status in ('approved','batched','invoiced') then
    raise exception 'FACTURACION_BLOQUEADA: reabrí el registro financiero antes de recalcular';
  end if;

  if c.closure_id is not null then
    v_contract:=app_private.billing_contract_from_closure_status(c.billing_status);
  else
    v_contract:=jsonb_build_object(
      'eligibility',case when s.billing_status in ('reviewed','invoiced') then 'billable' else 'pending_review' end,
      'billing_basis','full'
    );
  end if;

  v_eligibility:=lower(coalesce(nullif(btrim(p_eligibility),''),v_contract->>'eligibility','pending_review'));
  v_basis:=lower(coalesce(nullif(btrim(p_billing_basis),''),v_contract->>'billing_basis','full'));

  if v_eligibility not in ('pending_review','billable','non_billable') then raise exception 'Elegibilidad inválida'; end if;
  if v_basis not in ('full','km','origin','movement') then raise exception 'Modalidad de facturación inválida'; end if;

  q:=app_private.get_operator_service_billing_quote_compat(p_service_id);

  if v_eligibility='non_billable' then
    v_base:=0;v_surcharge:=0;v_toll:=0;v_copay:=0;v_total:=0;v_company:=0;v_calc:='ready';
  else
    v_base:=greatest(coalesce(nullif(q->>'base_subtotal','')::numeric,s.base_subtotal,0),0);
    v_surcharge:=greatest(coalesce(nullif(q->>'surcharge_total','')::numeric,s.surcharge_total,0),0);
    v_toll:=greatest(coalesce(nullif(q->>'toll_total','')::numeric,s.toll_total,0),0);
    v_copay:=greatest(coalesce(nullif(q->>'copay_total','')::numeric,s.copay_total,0),0);
    v_total:=greatest(coalesce(nullif(q->>'estimated_total','')::numeric,s.estimated_total,0),0);
    v_company:=greatest(coalesce(nullif(q->>'current_company_amount','')::numeric,nullif(q->>'company_estimated_total','')::numeric,s.company_estimated_total,0),0);
    if v_company>v_total then v_total:=v_company+v_copay; end if;
    v_calc:=case when v_eligibility='billable' and v_basis='full' then 'ready' else 'requires_review' end;
  end if;

  v_snapshot:=app_private.build_operator_service_billing_snapshot(p_service_id)||jsonb_build_object(
    'billing_quote',q,
    'eligibility',v_eligibility,
    'billing_basis',v_basis,
    'calculation_state',v_calc,
    'finalization_source',case when v_eligibility='non_billable' then 'non_billable_zero_v1' else 'billing_quote_compat_v1' end,
    'requires_manual_amount_confirmation',(v_eligibility='billable' and v_basis<>'full')
  );

  insert into public.operator_service_billing(
    service_id,closure_id,company_id,contract_id,billing_base_id,service_date,
    eligibility,billing_basis,process_status,calculation_state,currency,
    final_base_subtotal,final_surcharge_total,final_toll_total,final_copay_total,final_total,company_final_total,
    billing_snapshot,review_notes,reviewed_by,reviewed_at,is_test,updated_at
  ) values (
    s.service_id,c.closure_id,s.company_id,s.contract_id,s.billing_base_id,
    (coalesce(s.completed_at,s.cancelled_at,s.scheduled_for) at time zone 'America/Argentina/Buenos_Aires')::date,
    v_eligibility,v_basis,'pending',v_calc,coalesce(q->>'currency',s.currency,'ARS'),
    round(v_base,2),round(v_surcharge,2),round(v_toll,2),round(v_copay,2),round(v_total,2),round(v_company,2),
    v_snapshot,nullif(btrim(p_notes),''),v_uid,now(),coalesce(s.is_test,false),now()
  ) on conflict (service_id) do update set
    closure_id=excluded.closure_id,company_id=excluded.company_id,contract_id=excluded.contract_id,
    billing_base_id=excluded.billing_base_id,service_date=excluded.service_date,
    eligibility=excluded.eligibility,billing_basis=excluded.billing_basis,process_status='pending',
    calculation_state=excluded.calculation_state,currency=excluded.currency,
    final_base_subtotal=excluded.final_base_subtotal,final_surcharge_total=excluded.final_surcharge_total,
    final_toll_total=excluded.final_toll_total,final_copay_total=excluded.final_copay_total,
    final_total=excluded.final_total,company_final_total=excluded.company_final_total,
    billing_snapshot=excluded.billing_snapshot,review_notes=excluded.review_notes,
    reviewed_by=v_uid,reviewed_at=now(),approved_by=null,approved_at=null,locked_by=null,locked_at=null,
    is_test=excluded.is_test,updated_at=now()
  returning * into b;

  insert into public.operator_service_events(service_id,event_type,notes,created_by,details)
  values(p_service_id,'billing_calculated','Cálculo financiero canónico',v_uid,jsonb_build_object(
    'eligibility',b.eligibility,'billing_basis',b.billing_basis,'calculation_state',b.calculation_state,
    'company_final_total',b.company_final_total,'reason',nullif(btrim(p_notes),'')
  ));

  return to_jsonb(b);
end;
$function$;

revoke all on function public.calculate_operator_service_billing(uuid,text,text,text) from public,anon;
grant execute on function public.calculate_operator_service_billing(uuid,text,text,text) to authenticated;

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
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  b public.operator_service_billing%rowtype;
  s public.operator_services%rowtype;
  v_total numeric(14,2);
  v_company numeric(14,2);
  v_previous numeric(14,2);
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then raise exception 'Sin permiso para confirmar importes'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Ingresá el motivo de la confirmación'; end if;
  if p_base_subtotal is null or p_base_subtotal<0 or coalesce(p_surcharge_total,0)<0 or coalesce(p_toll_total,0)<0 or coalesce(p_copay_total,0)<0 then
    raise exception 'Los importes no pueden ser negativos';
  end if;

  select * into b from public.operator_service_billing where service_id=p_service_id for update;
  if not found then raise exception 'Calculá primero la facturación del servicio'; end if;
  if b.process_status<>'pending' then raise exception 'FACTURACION_BLOQUEADA: el registro no admite cambios'; end if;
  if b.eligibility<>'billable' then raise exception 'Solo un servicio facturable admite confirmación manual de importes'; end if;

  select * into s from public.operator_services where service_id=p_service_id;
  v_total:=round(p_base_subtotal+coalesce(p_surcharge_total,0)+coalesce(p_toll_total,0),2);
  if coalesce(p_copay_total,0)>v_total then raise exception 'El copago no puede superar el total'; end if;
  v_company:=round(v_total-coalesce(p_copay_total,0),2);
  v_previous:=coalesce((select company_amount from public.operator_service_billing_revisions where service_id=p_service_id order by created_at desc limit 1),b.company_final_total,0);

  update public.operator_service_billing set
    final_base_subtotal=round(p_base_subtotal,2),
    final_surcharge_total=round(coalesce(p_surcharge_total,0),2),
    final_toll_total=round(coalesce(p_toll_total,0),2),
    final_copay_total=round(coalesce(p_copay_total,0),2),
    final_total=v_total,company_final_total=v_company,calculation_state='ready',
    billing_snapshot=billing_snapshot||jsonb_build_object('manual_confirmation',jsonb_build_object(
      'reason',btrim(p_reason),'confirmed_by',v_uid,'confirmed_at',now(),
      'final_base_subtotal',round(p_base_subtotal,2),'final_surcharge_total',round(coalesce(p_surcharge_total,0),2),
      'final_toll_total',round(coalesce(p_toll_total,0),2),'final_copay_total',round(coalesce(p_copay_total,0),2),
      'final_total',v_total,'company_final_total',v_company
    ),'finalization_source','manual_billing_confirmation_v1','calculation_state','ready'),
    review_notes=concat_ws(E'\n',nullif(review_notes,''),'Importes confirmados: '||btrim(p_reason)),
    reviewed_by=v_uid,reviewed_at=now(),updated_at=now()
  where billing_id=b.billing_id returning * into b;

  insert into public.operator_service_billing_revisions(
    service_id,billing_status,previous_company_amount,company_amount,currency,quote_snapshot,rate_card_id,rate_card_version,reason
  ) values (
    p_service_id,'pending',round(v_previous,2),b.company_final_total,b.currency,b.billing_snapshot,s.rate_card_id,
    nullif(s.pricing_snapshot->>'rate_card_version','')::integer,'Confirmación de importes: '||btrim(p_reason)
  );

  insert into public.operator_service_events(service_id,event_type,notes,created_by,details)
  values(p_service_id,'billing_amounts_confirmed',btrim(p_reason),v_uid,jsonb_build_object('company_final_total',b.company_final_total));

  return to_jsonb(b);
end;
$function$;

revoke all on function public.confirm_operator_service_billing_amounts(uuid,numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.confirm_operator_service_billing_amounts(uuid,numeric,numeric,numeric,numeric,text) to authenticated;

create or replace function public.approve_operator_service_billing(p_service_id uuid,p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  s public.operator_services%rowtype;
  b public.operator_service_billing%rowtype;
  v_previous numeric(14,2);
  v_revision uuid;
  v_legacy_status text;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then raise exception 'Sin permiso para aprobar Facturación'; end if;

  select * into s from public.operator_services where service_id=p_service_id for update;
  if not found or s.status not in ('completed','cancelled') then raise exception 'El servicio debe estar cerrado'; end if;
  select * into b from public.operator_service_billing where service_id=p_service_id for update;
  if not found then raise exception 'Calculá primero la facturación'; end if;
  if b.process_status<>'pending' then raise exception 'El registro financiero no está pendiente'; end if;
  if b.eligibility='pending_review' then raise exception 'Definí primero si el servicio es facturable'; end if;
  if b.calculation_state<>'ready' then raise exception 'Confirmá el importe definitivo antes de aprobar'; end if;

  v_previous:=coalesce((select company_amount from public.operator_service_billing_revisions where service_id=p_service_id order by created_at desc limit 1),s.company_estimated_total,0);
  v_legacy_status:=case when b.eligibility='non_billable' then 'excluded' else 'reviewed' end;

  insert into public.operator_service_billing_revisions(
    service_id,billing_status,previous_company_amount,company_amount,currency,quote_snapshot,rate_card_id,rate_card_version,reason
  ) values (
    p_service_id,v_legacy_status,round(v_previous,2),b.company_final_total,b.currency,
    b.billing_snapshot||jsonb_build_object('canonical_approval',true,'approved_at',now()),
    s.rate_card_id,nullif(s.pricing_snapshot->>'rate_card_version','')::integer,
    nullif(concat_ws(' · ','Aprobación financiera canónica',nullif(btrim(p_notes),'')),'')
  ) returning revision_id into v_revision;

  if b.eligibility='billable' then
    update public.operator_services set
      billing_status='reviewed',
      base_subtotal=b.final_base_subtotal,
      surcharge_total=b.final_surcharge_total,
      toll_total=b.final_toll_total,
      copay_total=b.final_copay_total,
      estimated_total=b.final_total,
      company_estimated_total=b.company_final_total,
      updated_by=v_uid,updated_at=now()
    where service_id=p_service_id;
  else
    update public.operator_services set billing_status='excluded',updated_by=v_uid,updated_at=now()
    where service_id=p_service_id;
  end if;

  perform app_private.sync_operator_service_billing_v1(p_service_id);
  select * into b from public.operator_service_billing where service_id=p_service_id;

  update public.operator_service_billing set
    source_revision_id=v_revision,
    review_notes=concat_ws(E'\n',nullif(review_notes,''),nullif(btrim(p_notes),'')),
    reviewed_by=v_uid,reviewed_at=now(),approved_by=v_uid,approved_at=now(),locked_by=v_uid,locked_at=now(),updated_at=now()
  where billing_id=b.billing_id returning * into b;

  insert into public.operator_service_events(service_id,event_type,notes,created_by,details)
  values(p_service_id,'billing_approved','Facturación aprobada y bloqueada',v_uid,jsonb_build_object(
    'eligibility',b.eligibility,'billing_basis',b.billing_basis,'company_final_total',b.company_final_total,'revision_id',v_revision
  ));

  return to_jsonb(b);
end;
$function$;

revoke all on function public.approve_operator_service_billing(uuid,text) from public,anon;
grant execute on function public.approve_operator_service_billing(uuid,text) to authenticated;

create or replace function public.reopen_operator_service_billing(p_service_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_role text:=app_private.current_auxilios_role();
  v_uid uuid:=auth.uid();
  s public.operator_services%rowtype;
  b public.operator_service_billing%rowtype;
begin
  if v_uid is null or v_role not in ('administracion','facturacion') then raise exception 'Sin permiso para reabrir Facturación'; end if;
  if length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Ingresá el motivo de la reapertura'; end if;

  select * into b from public.operator_service_billing where service_id=p_service_id for update;
  if not found then raise exception 'Registro financiero inexistente'; end if;
  if b.process_status in ('batched','invoiced') then raise exception 'FACTURACION_BLOQUEADA: el servicio ya está loteado o facturado'; end if;
  if b.process_status<>'approved' then raise exception 'Solo una facturación aprobada puede reabrirse'; end if;
  select * into s from public.operator_services where service_id=p_service_id for update;

  insert into public.operator_service_billing_revisions(
    service_id,billing_status,previous_company_amount,company_amount,currency,quote_snapshot,rate_card_id,rate_card_version,reason
  ) values (
    p_service_id,'pending',b.company_final_total,b.company_final_total,b.currency,b.billing_snapshot,s.rate_card_id,
    nullif(s.pricing_snapshot->>'rate_card_version','')::integer,'Reapertura financiera: '||btrim(p_reason)
  );

  update public.operator_service_billing set
    process_status='pending',calculation_state='requires_review',approved_by=null,approved_at=null,locked_by=null,locked_at=null,
    revision=revision+1,last_reopen_reason=btrim(p_reason),reopened_by=v_uid,reopened_at=now(),
    billing_snapshot=billing_snapshot||jsonb_build_object('reopened_by',v_uid,'reopened_at',now(),'reopen_reason',btrim(p_reason),'locked',false),
    updated_at=now()
  where billing_id=b.billing_id;

  update public.operator_services set billing_status='pending',updated_by=v_uid,updated_at=now()
  where service_id=p_service_id;

  perform app_private.sync_operator_service_billing_v1(p_service_id);
  select * into b from public.operator_service_billing where service_id=p_service_id;

  insert into public.operator_service_events(service_id,event_type,notes,created_by,details)
  values(p_service_id,'billing_reopened',btrim(p_reason),v_uid,jsonb_build_object('revision',b.revision));

  return to_jsonb(b);
end;
$function$;

revoke all on function public.reopen_operator_service_billing(uuid,text) from public,anon;
grant execute on function public.reopen_operator_service_billing(uuid,text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Guards: revisión = lock real; factura sólo desde un servicio aprobado
-- -----------------------------------------------------------------------------
create or replace function app_private.operator_service_financial_lock_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  b public.operator_service_billing%rowtype;
begin
  if old.status='completed' and new.billing_status='invoiced' and old.billing_status<>'reviewed' then
    raise exception 'FACTURACION_NO_APROBADA: el servicio debe estar REVISADO antes de facturarse';
  end if;

  select * into b from public.operator_service_billing where service_id=old.service_id;
  if not found or b.process_status not in ('approved','batched','invoiced') then return new; end if;

  if new.status is distinct from old.status then
    raise exception 'FACTURACION_BLOQUEADA: reabrí la facturación antes de cambiar el estado operativo';
  end if;

  if new.billing_status is distinct from old.billing_status
     and not (old.billing_status='reviewed' and new.billing_status='invoiced' and b.process_status='approved') then
    raise exception 'FACTURACION_BLOQUEADA: reabrí la facturación antes de cambiar su estado';
  end if;

  if jsonb_build_object(
      'company_id',old.company_id,'branch_id',old.branch_id,'contract_id',old.contract_id,'rate_card_id',old.rate_card_id,
      'billing_setting_id',old.billing_setting_id,'billing_base_id',old.billing_base_id,
      'service_order_number',old.service_order_number,'purchase_order_number',old.purchase_order_number,'category_id',old.category_id,
      'vehicle_plate',old.vehicle_plate,'origin',old.origin,'destination',old.destination,
      'estimated_distance_km',old.estimated_distance_km,'estimated_asphalt_km',old.estimated_asphalt_km,'estimated_gravel_km',old.estimated_gravel_km,
      'toll_estimate',old.toll_estimate,'is_holiday',old.is_holiday,'currency',old.currency,
      'base_subtotal',old.base_subtotal,'surcharge_total',old.surcharge_total,'toll_total',old.toll_total,'copay_total',old.copay_total,
      'estimated_total',old.estimated_total,'company_estimated_total',old.company_estimated_total,'pricing_snapshot',old.pricing_snapshot
    ) is distinct from jsonb_build_object(
      'company_id',new.company_id,'branch_id',new.branch_id,'contract_id',new.contract_id,'rate_card_id',new.rate_card_id,
      'billing_setting_id',new.billing_setting_id,'billing_base_id',new.billing_base_id,
      'service_order_number',new.service_order_number,'purchase_order_number',new.purchase_order_number,'category_id',new.category_id,
      'vehicle_plate',new.vehicle_plate,'origin',new.origin,'destination',new.destination,
      'estimated_distance_km',new.estimated_distance_km,'estimated_asphalt_km',new.estimated_asphalt_km,'estimated_gravel_km',new.estimated_gravel_km,
      'toll_estimate',new.toll_estimate,'is_holiday',new.is_holiday,'currency',new.currency,
      'base_subtotal',new.base_subtotal,'surcharge_total',new.surcharge_total,'toll_total',new.toll_total,'copay_total',new.copay_total,
      'estimated_total',new.estimated_total,'company_estimated_total',new.company_estimated_total,'pricing_snapshot',new.pricing_snapshot
    ) then
    raise exception 'FACTURACION_BLOQUEADA: el importe aprobado es inmutable hasta una reapertura explícita';
  end if;

  return new;
end;
$function$;

revoke all on function app_private.operator_service_financial_lock_guard_v1() from public,anon,authenticated;

drop trigger if exists operator_services_financial_lock_guard_v1 on public.operator_services;
create trigger operator_services_financial_lock_guard_v1
before update on public.operator_services
for each row execute function app_private.operator_service_financial_lock_guard_v1();

create or replace function app_private.operator_service_child_financial_lock_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_service_id uuid;
  v_old_service_id uuid;
begin
  if tg_op='DELETE' then v_service_id:=old.service_id; else v_service_id:=new.service_id; end if;
  if tg_op='UPDATE' then v_old_service_id:=old.service_id; end if;

  if exists(select 1 from public.operator_service_billing where service_id=v_service_id and process_status in ('approved','batched','invoiced'))
     or (v_old_service_id is not null and v_old_service_id is distinct from v_service_id and exists(
       select 1 from public.operator_service_billing where service_id=v_old_service_id and process_status in ('approved','batched','invoiced')
     )) then
    raise exception 'FACTURACION_BLOQUEADA: reabrí la facturación antes de modificar conceptos o peajes';
  end if;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

revoke all on function app_private.operator_service_child_financial_lock_guard_v1() from public,anon,authenticated;

drop trigger if exists operator_service_items_financial_lock_guard_v1 on public.operator_service_items;
create trigger operator_service_items_financial_lock_guard_v1
before insert or update or delete on public.operator_service_items
for each row execute function app_private.operator_service_child_financial_lock_guard_v1();

drop trigger if exists operator_service_tolls_financial_lock_guard_v1 on public.operator_service_tolls;
create trigger operator_service_tolls_financial_lock_guard_v1
before insert or update or delete on public.operator_service_tolls
for each row execute function app_private.operator_service_child_financial_lock_guard_v1();

-- -----------------------------------------------------------------------------
-- 6. Sincronización automática de estados ya usados por la UI productiva
-- -----------------------------------------------------------------------------
create or replace function app_private.operator_service_billing_sync_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  if new.status in ('completed','cancelled') and (
    tg_op='INSERT' or new.status is distinct from old.status or new.billing_status is distinct from old.billing_status
  ) then
    perform app_private.sync_operator_service_billing_v1(new.service_id);
  end if;
  return new;
end;
$function$;

revoke all on function app_private.operator_service_billing_sync_trigger_v1() from public,anon,authenticated;

drop trigger if exists operator_services_billing_sync_v1 on public.operator_services;
create trigger operator_services_billing_sync_v1
after insert or update on public.operator_services
for each row execute function app_private.operator_service_billing_sync_trigger_v1();

create or replace function app_private.operator_service_closure_billing_sync_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  if tg_op='INSERT' or new.billing_status is distinct from old.billing_status then
    perform app_private.sync_operator_service_billing_v1(new.service_id);
  end if;
  return new;
end;
$function$;

revoke all on function app_private.operator_service_closure_billing_sync_trigger_v1() from public,anon,authenticated;

drop trigger if exists operator_service_closures_billing_sync_v1 on public.operator_service_closures;
create trigger operator_service_closures_billing_sync_v1
after insert or update on public.operator_service_closures
for each row execute function app_private.operator_service_closure_billing_sync_trigger_v1();

-- En una instalación donde billing_status fue agregado por esta migración, garantiza
-- que los próximos servicios que se finalicen entren como PENDIENTES aun si el trigger
-- operativo legado todavía no conoce el campo.
create or replace function app_private.operator_service_billing_entry_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
begin
  if old.status is distinct from 'completed' and new.status='completed' and new.billing_status='not_ready' then
    new.billing_status:='pending';
  end if;
  if old.status is distinct from 'cancelled' and new.status='cancelled' and new.billing_status<>'invoiced' then
    new.billing_status:='not_ready';
  end if;
  return new;
end;
$function$;

revoke all on function app_private.operator_service_billing_entry_guard_v1() from public,anon,authenticated;

drop trigger if exists operator_services_billing_entry_guard_v1 on public.operator_services;
create trigger operator_services_billing_entry_guard_v1
before update on public.operator_services
for each row execute function app_private.operator_service_billing_entry_guard_v1();

-- -----------------------------------------------------------------------------
-- 7. Backfill: refleja exactamente el estado productivo sin re-facturar nada
-- -----------------------------------------------------------------------------
do $backfill$
declare
  v_service_id uuid;
begin
  for v_service_id in
    select s.service_id
    from public.operator_services s
    where s.status in ('completed','cancelled')
      and (
        s.billing_status in ('pending','reviewed','invoiced','excluded')
        or exists(select 1 from public.operator_service_closures c where c.service_id=s.service_id)
      )
  loop
    perform app_private.sync_operator_service_billing_v1(v_service_id);
  end loop;
end;
$backfill$;
