-- Tercerizados · paso 4: liquidación mensual · 18/10/2026 (autorizado por el dueño)
-- Tabla nueva; usa outsourced_service_costs.settlement_id (paso 3). Sólo Administración.
-- Flujo: Borrador → Aprobada → Pagada. Un borrador se puede anular (libera los servicios)
-- y una aprobada puede volver a borrador. Entran sólo servicios finalizados del mes, con costo
-- cargado y sin otra liquidación. Mientras un servicio está en una liquidación, su costo no
-- se puede cambiar (lo bloquea set_outsourced_service_cost_v1). Queda auditado.

create table if not exists public.outsourced_settlements (
  settlement_id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.outsourced_providers(provider_id),
  period_month date not null check (period_month = date_trunc('month', period_month)::date),
  status text not null default 'draft' check (status in ('draft', 'approved', 'paid', 'cancelled')),
  services_count int not null default 0,
  total_amount numeric(14, 2) not null default 0,
  invoice_number text,
  invoice_date date,
  notes text,
  approved_at timestamptz,
  approved_by uuid,
  paid_at date,
  payment_reference text,
  paid_registered_by uuid,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists outsourced_settlements_provider_idx on public.outsourced_settlements(provider_id, period_month desc);
-- Un solo borrador por tercerizado y mes.
create unique index if not exists outsourced_settlements_one_draft on public.outsourced_settlements(provider_id, period_month) where status = 'draft';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outsourced_service_costs_settlement_fk') then
    alter table public.outsourced_service_costs add constraint outsourced_service_costs_settlement_fk
      foreign key (settlement_id) references public.outsourced_settlements(settlement_id);
  end if;
end $$;
create index if not exists outsourced_service_costs_settlement_idx on public.outsourced_service_costs(settlement_id);
create index if not exists outsourced_service_costs_provider_date_idx on public.outsourced_service_costs(provider_id, service_date);

alter table public.outsourced_settlements enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outsourced_settlements' and policyname = 'outsourced_settlements_select_admin') then
    create policy outsourced_settlements_select_admin on public.outsourced_settlements for select to authenticated
      using ((select app_private.current_auxilios_role()) = 'administracion');
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'outsourced_settlements_audit' and tgrelid = 'public.outsourced_settlements'::regclass) then
    create trigger outsourced_settlements_audit after insert or delete or update on public.outsourced_settlements
      for each row execute function public.capture_audit_event('settlement_id');
  end if;
end $$;
revoke all on public.outsourced_settlements from anon;
grant select on public.outsourced_settlements to authenticated;

-- Fila de servicio para las pantallas de liquidación.
create or replace function app_private.outsourced_settlement_service_row(c public.outsourced_service_costs)
returns jsonb language sql stable set search_path to 'public', 'pg_temp' as $function$
  select jsonb_build_object('service_id', c.service_id, 'service_date', c.service_date, 'total_amount', c.total_amount,
    'base_amount', c.base_amount, 'extras_amount', c.extras_amount, 'tolls_payable', c.tolls_payable, 'adjustment_amount', c.adjustment_amount,
    'adjustment_reason', c.adjustment_reason, 'km_asphalt', c.km_asphalt, 'km_gravel', c.km_gravel, 'breakdown', c.breakdown,
    'settlement_id', c.settlement_id, 'service_order_number', s.service_order_number, 'status', s.status,
    'scheduled_for', s.scheduled_for, 'origin', s.origin, 'destination', s.destination, 'vehicle_plate', s.vehicle_plate,
    'company_name', co.trade_name, 'concept_name', sc.name)
  from public.operator_services s
  left join public.companies co on co.company_id = s.company_id
  left join public.service_concepts sc on sc.concept_id = c.concept_id
  where s.service_id = c.service_id
$function$;
revoke all on function app_private.outsourced_settlement_service_row(public.outsourced_service_costs) from public, anon;

-- Recalcula cantidad y total de una liquidación.
create or replace function app_private.outsourced_settlement_refresh(p_settlement_id uuid)
returns void language sql set search_path to 'public', 'pg_temp' as $function$
  update public.outsourced_settlements t set
    services_count = (select count(*) from public.outsourced_service_costs c where c.settlement_id = p_settlement_id),
    total_amount = coalesce((select sum(c.total_amount) from public.outsourced_service_costs c where c.settlement_id = p_settlement_id), 0),
    updated_at = now(), updated_by = auth.uid()
  where t.settlement_id = p_settlement_id
$function$;
revoke all on function app_private.outsourced_settlement_refresh(uuid) from public, anon;

-- Lo del mes de un tercerizado: servicios para liquidar, los que todavía no se pueden y sus liquidaciones.
create or replace function public.get_outsourced_settlement_month_v1(p_provider_id uuid, p_month date)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_from date := date_trunc('month', coalesce(p_month, (now() at time zone 'America/Argentina/Buenos_Aires')::date))::date;
  v_to date := (date_trunc('month', coalesce(p_month, (now() at time zone 'America/Argentina/Buenos_Aires')::date)) + interval '1 month')::date;
begin
  if coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then raise exception 'Sólo Administración liquida tercerizados' using errcode = '42501'; end if;
  return jsonb_build_object(
    'period_month', v_from,
    'available', coalesce((select jsonb_agg(app_private.outsourced_settlement_service_row(c) order by c.service_date, c.service_id)
       from public.outsourced_service_costs c join public.operator_services s on s.service_id = c.service_id
       where c.provider_id = p_provider_id and c.service_date >= v_from and c.service_date < v_to and c.settlement_id is null
         and s.status = 'completed' and coalesce(s.logistics_type, 'own') = 'third_party'), '[]'::jsonb),
    'pending', coalesce((select jsonb_agg(app_private.outsourced_settlement_service_row(c) order by c.service_date, c.service_id)
       from public.outsourced_service_costs c join public.operator_services s on s.service_id = c.service_id
       where c.provider_id = p_provider_id and c.service_date >= v_from and c.service_date < v_to and c.settlement_id is null
         and s.status not in ('completed', 'cancelled') and coalesce(s.logistics_type, 'own') = 'third_party'), '[]'::jsonb),
    'settlements', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from public.outsourced_settlements t
       where t.provider_id = p_provider_id and t.period_month = v_from and t.status <> 'cancelled'), '[]'::jsonb));
end $function$;
revoke all on function public.get_outsourced_settlement_month_v1(uuid, date) from public, anon;
grant execute on function public.get_outsourced_settlement_month_v1(uuid, date) to authenticated;

-- Liquidaciones de un tercerizado (todas, con o sin servicios), más recientes primero.
create or replace function public.list_outsourced_settlements_v1(p_provider_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
begin
  if coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then raise exception 'Sólo Administración liquida tercerizados' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(t) order by t.period_month desc, t.created_at desc) from public.outsourced_settlements t
    where t.provider_id = p_provider_id and t.status <> 'cancelled'), '[]'::jsonb);
end $function$;
revoke all on function public.list_outsourced_settlements_v1(uuid) from public, anon;
grant execute on function public.list_outsourced_settlements_v1(uuid) to authenticated;

-- Detalle de una liquidación con sus servicios.
create or replace function public.get_outsourced_settlement_v1(p_settlement_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare t public.outsourced_settlements%rowtype;
begin
  if coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then raise exception 'Sólo Administración liquida tercerizados' using errcode = '42501'; end if;
  select * into t from public.outsourced_settlements where settlement_id = p_settlement_id;
  if not found then raise exception 'La liquidación no existe'; end if;
  return to_jsonb(t) || jsonb_build_object('provider_name', (select display_name from public.outsourced_providers where provider_id = t.provider_id),
    'services', coalesce((select jsonb_agg(app_private.outsourced_settlement_service_row(c) order by c.service_date, c.service_id)
      from public.outsourced_service_costs c where c.settlement_id = t.settlement_id), '[]'::jsonb));
end $function$;
revoke all on function public.get_outsourced_settlement_v1(uuid) from public, anon;
grant execute on function public.get_outsourced_settlement_v1(uuid) to authenticated;

-- Crear el borrador del mes, o sumarle servicios si ya existe. Devuelve la liquidación.
create or replace function public.create_outsourced_settlement_v1(p_provider_id uuid, p_month date, p_service_ids uuid[])
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_id uuid;
  v_ok int;
begin
  if coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then raise exception 'Sólo Administración liquida tercerizados' using errcode = '42501'; end if;
  if p_month is null then raise exception 'Elegí el mes'; end if;
  if not exists (select 1 from public.outsourced_providers where provider_id = p_provider_id) then raise exception 'El tercerizado no existe'; end if;
  if coalesce(cardinality(p_service_ids), 0) = 0 then raise exception 'Elegí al menos un servicio'; end if;
  perform 1 from public.outsourced_service_costs c where c.service_id = any(p_service_ids) for update;
  select count(*) into v_ok from public.outsourced_service_costs c join public.operator_services s on s.service_id = c.service_id
  where c.service_id = any(p_service_ids) and c.provider_id = p_provider_id and c.service_date >= v_from and c.service_date < v_to
    and c.settlement_id is null and s.status = 'completed' and coalesce(s.logistics_type, 'own') = 'third_party';
  if v_ok <> cardinality(array(select distinct unnest(p_service_ids))) then
    raise exception 'Algún servicio ya no se puede liquidar (cambió, no está finalizado o ya está en otra liquidación). Actualizá la lista.';
  end if;

  select settlement_id into v_id from public.outsourced_settlements where provider_id = p_provider_id and period_month = v_from and status = 'draft' for update;
  if v_id is null then
    insert into public.outsourced_settlements(provider_id, period_month, created_by, updated_by) values (p_provider_id, v_from, auth.uid(), auth.uid())
    returning settlement_id into v_id;
  end if;
  update public.outsourced_service_costs set settlement_id = v_id, updated_at = now(), updated_by = auth.uid() where service_id = any(p_service_ids);
  perform app_private.outsourced_settlement_refresh(v_id);
  return public.get_outsourced_settlement_v1(v_id);
end $function$;
revoke all on function public.create_outsourced_settlement_v1(uuid, date, uuid[]) from public, anon;
grant execute on function public.create_outsourced_settlement_v1(uuid, date, uuid[]) to authenticated;

-- Sacar servicios de un borrador (vuelven a quedar para liquidar).
create or replace function public.remove_outsourced_settlement_services_v1(p_settlement_id uuid, p_service_ids uuid[])
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare t public.outsourced_settlements%rowtype;
begin
  if coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then raise exception 'Sólo Administración liquida tercerizados' using errcode = '42501'; end if;
  select * into t from public.outsourced_settlements where settlement_id = p_settlement_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;
  if t.status <> 'draft' then raise exception 'Sólo se pueden sacar servicios de un borrador'; end if;
  update public.outsourced_service_costs set settlement_id = null, updated_at = now(), updated_by = auth.uid()
  where settlement_id = p_settlement_id and service_id = any(coalesce(p_service_ids, '{}'));
  perform app_private.outsourced_settlement_refresh(p_settlement_id);
  return public.get_outsourced_settlement_v1(p_settlement_id);
end $function$;
revoke all on function public.remove_outsourced_settlement_services_v1(uuid, uuid[]) from public, anon;
grant execute on function public.remove_outsourced_settlement_services_v1(uuid, uuid[]) to authenticated;

-- Cambiar de estado. p_action: approve | reopen | pay | cancel.
-- p_payload: invoice_number, invoice_date, notes (approve); paid_at, payment_reference (pay).
create or replace function public.set_outsourced_settlement_status_v1(p_settlement_id uuid, p_action text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'app_private', 'pg_temp' as $function$
declare
  t public.outsourced_settlements%rowtype;
  p jsonb := coalesce(p_payload, '{}'::jsonb);
  v_paid date;
  v_ref text := nullif(btrim(coalesce(p->>'payment_reference', '')), '');
begin
  if coalesce(app_private.current_auxilios_role(), '') <> 'administracion' then raise exception 'Sólo Administración liquida tercerizados' using errcode = '42501'; end if;
  select * into t from public.outsourced_settlements where settlement_id = p_settlement_id for update;
  if not found then raise exception 'La liquidación no existe'; end if;

  if p_action = 'approve' then
    if t.status <> 'draft' then raise exception 'Sólo se aprueba un borrador'; end if;
    if t.services_count = 0 then raise exception 'La liquidación no tiene servicios'; end if;
    update public.outsourced_settlements set status = 'approved', approved_at = now(), approved_by = auth.uid(),
      invoice_number = nullif(btrim(coalesce(p->>'invoice_number', '')), ''), invoice_date = nullif(p->>'invoice_date', '')::date,
      notes = nullif(btrim(coalesce(p->>'notes', '')), ''), updated_at = now(), updated_by = auth.uid()
    where settlement_id = p_settlement_id;
  elsif p_action = 'reopen' then
    if t.status <> 'approved' then raise exception 'Sólo una liquidación aprobada vuelve a borrador'; end if;
    if exists (select 1 from public.outsourced_settlements where provider_id = t.provider_id and period_month = t.period_month and status = 'draft') then
      raise exception 'Ya hay un borrador de ese mes: terminá ese primero';
    end if;
    update public.outsourced_settlements set status = 'draft', approved_at = null, approved_by = null, updated_at = now(), updated_by = auth.uid()
    where settlement_id = p_settlement_id;
  elsif p_action = 'pay' then
    if t.status <> 'approved' then raise exception 'Primero hay que aprobar la liquidación'; end if;
    v_paid := coalesce(nullif(p->>'paid_at', '')::date, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
    if v_paid > (now() at time zone 'America/Argentina/Buenos_Aires')::date then raise exception 'La fecha de pago no puede ser futura'; end if;
    update public.outsourced_settlements set status = 'paid', paid_at = v_paid, payment_reference = v_ref, paid_registered_by = auth.uid(),
      updated_at = now(), updated_by = auth.uid()
    where settlement_id = p_settlement_id;
  elsif p_action = 'cancel' then
    if t.status <> 'draft' then raise exception 'Sólo se anula un borrador'; end if;
    update public.outsourced_service_costs set settlement_id = null, updated_at = now(), updated_by = auth.uid() where settlement_id = p_settlement_id;
    update public.outsourced_settlements set status = 'cancelled', cancelled_at = now(), services_count = 0, total_amount = 0, updated_at = now(), updated_by = auth.uid()
    where settlement_id = p_settlement_id;
  else
    raise exception 'Acción inválida';
  end if;
  return public.get_outsourced_settlement_v1(p_settlement_id);
end $function$;
revoke all on function public.set_outsourced_settlement_status_v1(uuid, text, jsonb) from public, anon;
grant execute on function public.set_outsourced_settlement_status_v1(uuid, text, jsonb) to authenticated;
