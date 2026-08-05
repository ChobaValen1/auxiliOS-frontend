-- AuxiliOS · Flota · CRUD seguro de combustible v1

alter table public.fuel_records
  add column if not exists status text not null default 'active',
  add column if not exists created_by uuid references public.users(user_id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.users(user_id),
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.users(user_id),
  add column if not exists void_reason text,
  add column if not exists correction_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.fuel_records'::regclass
      and conname = 'fuel_records_status_check'
  ) then
    alter table public.fuel_records
      add constraint fuel_records_status_check
      check (status in ('active', 'voided'));
  end if;
end
$$;

alter table public.fuel_records
  alter column created_by set default auth.uid();

update public.fuel_records fr
set created_by = dl.driver_id
from public.daily_logs dl
where fr.created_by is null
  and fr.log_id = dl.log_id;

create index if not exists fuel_records_truck_status_date_idx
  on public.fuel_records (truck_id, status, fuel_date desc, created_at desc);

create index if not exists fuel_records_log_id_idx
  on public.fuel_records (log_id)
  where log_id is not null;

drop policy if exists fuel_update_admin on public.fuel_records;
drop policy if exists fuel_delete_admin on public.fuel_records;
revoke update, delete on public.fuel_records from authenticated;

create or replace function public.list_fuel_records_for_truck(
  p_truck_id integer,
  p_include_voided boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion', 'supervision') then
    raise exception 'No autorizado para consultar combustible'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(row_data) order by row_data.fuel_date desc, row_data.created_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      fr.fuel_id,
      fr.truck_id,
      fr.log_id,
      fr.fuel_date,
      fr.liters,
      fr.price_per_liter,
      fr.total_cost,
      fr.km_at_load,
      fr.payment_method,
      fr.payment_app,
      fr.gas_station,
      fr.status,
      fr.created_at,
      fr.created_by,
      fr.updated_at,
      fr.updated_by,
      fr.voided_at,
      fr.voided_by,
      fr.void_reason,
      fr.correction_reason,
      dl.driver_id,
      u.full_name as driver_name,
      dl.status as journey_status,
      dl.log_date as journey_date,
      rc.admin_status as rendicion_admin_status
    from public.fuel_records fr
    left join public.daily_logs dl on dl.log_id = fr.log_id
    left join public.users u on u.user_id = dl.driver_id
    left join lateral (
      select r.admin_status
      from public.rendicion_cierre r
      where r.log_id = fr.log_id
      order by r.created_at desc
      limit 1
    ) rc on true
    where fr.truck_id = p_truck_id
      and (p_include_voided or fr.status = 'active')
  ) row_data;

  return v_result;
end
$$;

create or replace function public.update_fuel_record(
  p_fuel_id integer,
  p_payload jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_before public.fuel_records%rowtype;
  v_after public.fuel_records%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_liters numeric;
  v_price numeric;
  v_km integer;
  v_date date;
  v_payment text;
  v_payment_app text;
  v_station text;
  v_rendicion_observed boolean := false;
  v_journey_closed boolean := false;
begin
  if v_role <> 'administracion' then
    raise exception 'Solo Administración puede editar combustible'
      using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'La carga útil debe ser un objeto JSON';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'El motivo de corrección debe tener al menos 5 caracteres';
  end if;

  select *
    into v_before
  from public.fuel_records
  where fuel_id = p_fuel_id
  for update;

  if not found then
    raise exception 'Carga de combustible inexistente';
  end if;
  if v_before.status <> 'active' then
    raise exception 'La carga está anulada; restaurala antes de editarla';
  end if;

  v_date := case when p_payload ? 'fuel_date'
    then nullif(p_payload->>'fuel_date', '')::date else v_before.fuel_date end;
  v_liters := case when p_payload ? 'liters'
    then nullif(p_payload->>'liters', '')::numeric else v_before.liters end;
  v_price := case when p_payload ? 'price_per_liter'
    then nullif(p_payload->>'price_per_liter', '')::numeric else v_before.price_per_liter end;
  v_km := case when p_payload ? 'km_at_load'
    then nullif(p_payload->>'km_at_load', '')::integer else v_before.km_at_load end;
  v_payment := case when p_payload ? 'payment_method'
    then nullif(btrim(p_payload->>'payment_method'), '') else v_before.payment_method end;
  v_payment_app := case when p_payload ? 'payment_app'
    then nullif(btrim(p_payload->>'payment_app'), '') else v_before.payment_app end;
  v_station := case when p_payload ? 'gas_station'
    then nullif(btrim(p_payload->>'gas_station'), '') else v_before.gas_station end;

  if v_date is null then raise exception 'La fecha es obligatoria'; end if;
  if v_liters is null or v_liters <= 0 then raise exception 'Los litros deben ser mayores a cero'; end if;
  if v_price is null or v_price <= 0 then raise exception 'El precio por litro debe ser mayor a cero'; end if;
  if v_km is not null and v_km < 0 then raise exception 'El kilometraje no puede ser negativo'; end if;
  if v_payment not in ('efectivo', 'transferencia', 'app', 'tarjeta') then
    raise exception 'Medio de pago inválido';
  end if;

  update public.fuel_records
  set fuel_date = v_date,
      liters = v_liters,
      price_per_liter = v_price,
      km_at_load = v_km,
      payment_method = v_payment,
      payment_app = v_payment_app,
      gas_station = v_station,
      correction_reason = v_reason,
      updated_at = now(),
      updated_by = auth.uid()
  where fuel_id = p_fuel_id
  returning * into v_after;

  if v_before.log_id is not null then
    select coalesce(dl.status = 'closed', false)
      into v_journey_closed
    from public.daily_logs dl
    where dl.log_id = v_before.log_id;

    update public.rendicion_cierre
    set admin_status = 'observada',
        admin_by = auth.uid(),
        admin_at = now(),
        admin_nota = concat_ws(
          E'\n',
          nullif(admin_nota, ''),
          format('Combustible #%s corregido: %s', p_fuel_id, v_reason)
        )
    where log_id = v_before.log_id
      and admin_status = 'aprobada';

    v_rendicion_observed := found;
  end if;

  return jsonb_build_object(
    'record', to_jsonb(v_after),
    'journey_closed', v_journey_closed,
    'rendicion_observed', v_rendicion_observed
  );
end
$$;

create or replace function public.void_fuel_record(
  p_fuel_id integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_before public.fuel_records%rowtype;
  v_after public.fuel_records%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_rendicion_observed boolean := false;
  v_journey_closed boolean := false;
begin
  if v_role <> 'administracion' then
    raise exception 'Solo Administración puede anular combustible'
      using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'El motivo de anulación debe tener al menos 5 caracteres';
  end if;

  select *
    into v_before
  from public.fuel_records
  where fuel_id = p_fuel_id
  for update;

  if not found then raise exception 'Carga de combustible inexistente'; end if;
  if v_before.status = 'voided' then raise exception 'La carga ya está anulada'; end if;

  update public.fuel_records
  set status = 'voided',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = v_reason,
      correction_reason = v_reason,
      updated_at = now(),
      updated_by = auth.uid()
  where fuel_id = p_fuel_id
  returning * into v_after;

  if v_before.log_id is not null then
    select coalesce(dl.status = 'closed', false)
      into v_journey_closed
    from public.daily_logs dl
    where dl.log_id = v_before.log_id;

    update public.rendicion_cierre
    set admin_status = 'observada',
        admin_by = auth.uid(),
        admin_at = now(),
        admin_nota = concat_ws(
          E'\n',
          nullif(admin_nota, ''),
          format('Combustible #%s anulado: %s', p_fuel_id, v_reason)
        )
    where log_id = v_before.log_id
      and admin_status = 'aprobada';

    v_rendicion_observed := found;
  end if;

  return jsonb_build_object(
    'record', to_jsonb(v_after),
    'journey_closed', v_journey_closed,
    'rendicion_observed', v_rendicion_observed
  );
end
$$;

create or replace function public.restore_fuel_record(
  p_fuel_id integer,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_before public.fuel_records%rowtype;
  v_after public.fuel_records%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_rendicion_observed boolean := false;
  v_journey_closed boolean := false;
begin
  if v_role <> 'administracion' then
    raise exception 'Solo Administración puede restaurar combustible'
      using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'El motivo de restauración debe tener al menos 5 caracteres';
  end if;

  select *
    into v_before
  from public.fuel_records
  where fuel_id = p_fuel_id
  for update;

  if not found then raise exception 'Carga de combustible inexistente'; end if;
  if v_before.status <> 'voided' then raise exception 'La carga no está anulada'; end if;

  update public.fuel_records
  set status = 'active',
      voided_at = null,
      voided_by = null,
      void_reason = null,
      correction_reason = v_reason,
      updated_at = now(),
      updated_by = auth.uid()
  where fuel_id = p_fuel_id
  returning * into v_after;

  if v_before.log_id is not null then
    select coalesce(dl.status = 'closed', false)
      into v_journey_closed
    from public.daily_logs dl
    where dl.log_id = v_before.log_id;

    update public.rendicion_cierre
    set admin_status = 'observada',
        admin_by = auth.uid(),
        admin_at = now(),
        admin_nota = concat_ws(
          E'\n',
          nullif(admin_nota, ''),
          format('Combustible #%s restaurado: %s', p_fuel_id, v_reason)
        )
    where log_id = v_before.log_id
      and admin_status = 'aprobada';

    v_rendicion_observed := found;
  end if;

  return jsonb_build_object(
    'record', to_jsonb(v_after),
    'journey_closed', v_journey_closed,
    'rendicion_observed', v_rendicion_observed
  );
end
$$;

create or replace function public.get_fuel_record_history(
  p_fuel_id integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_result jsonb;
begin
  if v_role not in ('administracion', 'supervision') then
    raise exception 'No autorizado para consultar el historial de combustible'
      using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.occurred_at desc), '[]'::jsonb)
    into v_result
  from (
    select
      ae.event_id,
      ae.occurred_at,
      ae.actor_id,
      u.full_name as actor_name,
      ae.operation,
      ae.before_data,
      ae.after_data
    from public.audit_events ae
    left join public.users u on u.user_id = ae.actor_id
    where ae.entity_schema = 'public'
      and ae.entity_table = 'fuel_records'
      and ae.entity_id = p_fuel_id::text
  ) a;

  return v_result;
end
$$;

create or replace function public.calcular_gastos_dia(p_driver_id uuid, p_fecha date)
returns numeric
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(sum(fr.total_cost), 0)::numeric
  from public.fuel_records fr
  join public.daily_logs dl on dl.truck_id = fr.truck_id
                           and dl.log_date = fr.fuel_date
  where dl.driver_id = p_driver_id
    and fr.fuel_date = p_fecha
    and fr.payment_method = 'efectivo'
    and fr.status = 'active';
$$;

grant execute on function public.list_fuel_records_for_truck(integer, boolean) to authenticated;
grant execute on function public.update_fuel_record(integer, jsonb, text) to authenticated;
grant execute on function public.void_fuel_record(integer, text) to authenticated;
grant execute on function public.restore_fuel_record(integer, text) to authenticated;
grant execute on function public.get_fuel_record_history(integer) to authenticated;

comment on column public.fuel_records.status is 'Estado lógico de la carga. voided conserva trazabilidad y se excluye de totales.';
comment on column public.fuel_records.correction_reason is 'Último motivo administrativo; el historial completo permanece en audit_events.';
