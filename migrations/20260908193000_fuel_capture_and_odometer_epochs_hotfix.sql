-- Hotfix productivo: carga de combustible segura y recambio de odometro.

begin;

alter table public.trucks
  add column if not exists odometer_epoch_started_at timestamptz,
  add column if not exists odometer_epoch_base_km integer;

alter table public.trucks
  drop constraint if exists trucks_odometer_epoch_base_km_check;
alter table public.trucks
  add constraint trucks_odometer_epoch_base_km_check
  check (odometer_epoch_base_km is null or odometer_epoch_base_km >= 0);

-- El valor visible al aplicar el hotfix pasa a ser el punto de partida autoritativo.
-- El historial permanece intacto, pero no puede volver a imponerse sobre un odometro nuevo.
update public.trucks
set odometer_epoch_started_at = coalesce(odometer_epoch_started_at, clock_timestamp()),
    odometer_epoch_base_km = coalesce(odometer_epoch_base_km, current_km, 0)
where odometer_epoch_started_at is null
   or odometer_epoch_base_km is null;

create or replace function app_private.recompute_truck_odometer_after_correction(
  p_truck_id integer,
  p_previous_candidate integer default null
)
returns integer
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_current integer;
  v_epoch_started_at timestamptz;
  v_epoch_base_km integer;
  v_candidate integer;
begin
  if p_truck_id is null then return null; end if;

  select current_km, odometer_epoch_started_at, odometer_epoch_base_km
    into v_current, v_epoch_started_at, v_epoch_base_km
  from public.trucks
  where truck_id = p_truck_id
  for update;
  if not found then return null; end if;

  if p_previous_candidate is not null and coalesce(v_current, 0) > p_previous_candidate then
    return v_current;
  end if;

  select greatest(
    coalesce(v_epoch_base_km, 0),
    coalesce((
      select max(greatest(coalesce(km_inicio, 0), coalesce(km_final, 0)))
      from public.daily_logs
      where truck_id = p_truck_id
        and status <> 'voided'
        and (v_epoch_started_at is null or coalesce(updated_at, closed_at, created_at) >= v_epoch_started_at)
    ), 0),
    coalesce((
      select max(km_at_load)
      from public.fuel_records
      where truck_id = p_truck_id
        and coalesce(status, 'active') = 'active'
        and (v_epoch_started_at is null or created_at >= v_epoch_started_at)
    ), 0),
    coalesce((
      select max(km_at_service)
      from public.maintenance_logs
      where truck_id = p_truck_id
        and (v_epoch_started_at is null or created_at >= v_epoch_started_at)
    ), 0)
  )::integer into v_candidate;

  update public.trucks set current_km = v_candidate where truck_id = p_truck_id;
  return v_candidate;
end;
$$;

create or replace function public.admin_update_truck_v2(
  p_truck_id integer,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_before public.trucks%rowtype;
  v_after public.trucks%rowtype;
  v_km integer;
begin
  if v_role <> 'administracion' then
    raise exception 'Solo Administracion puede editar la flota' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then
    raise exception 'La carga util debe ser un objeto JSON';
  end if;
  if p_payload - array['plate','brand','model','year','numero_interno','current_km','current_hours','tipo_equipo'] <> '{}'::jsonb then
    raise exception 'La carga util contiene campos no permitidos';
  end if;

  select * into v_before from public.trucks where truck_id = p_truck_id for update;
  if not found then raise exception 'Vehiculo inexistente'; end if;

  v_km := case when p_payload ? 'current_km'
    then (p_payload->>'current_km')::integer else v_before.current_km end;
  if v_km is null or v_km < 0 then raise exception 'El kilometraje debe ser mayor o igual a cero'; end if;

  update public.trucks
  set plate = case when p_payload ? 'plate' then nullif(btrim(p_payload->>'plate'), '') else plate end,
      brand = case when p_payload ? 'brand' then p_payload->>'brand' else brand end,
      model = case when p_payload ? 'model' then p_payload->>'model' else model end,
      year = case when p_payload ? 'year' then nullif(p_payload->>'year', '')::smallint else year end,
      numero_interno = case when p_payload ? 'numero_interno' then p_payload->>'numero_interno' else numero_interno end,
      current_hours = case when p_payload ? 'current_hours' then coalesce((p_payload->>'current_hours')::integer, 0) else current_hours end,
      tipo_equipo = case when p_payload ? 'tipo_equipo' then p_payload->>'tipo_equipo' else tipo_equipo end,
      current_km = v_km,
      odometer_epoch_started_at = case when v_km is distinct from v_before.current_km then clock_timestamp() else odometer_epoch_started_at end,
      odometer_epoch_base_km = case when v_km is distinct from v_before.current_km then v_km else odometer_epoch_base_km end
  where truck_id = p_truck_id
  returning * into v_after;

  return jsonb_build_object(
    'truck_id', v_after.truck_id,
    'current_km', v_after.current_km,
    'odometer_epoch_started_at', v_after.odometer_epoch_started_at
  );
end;
$$;

create or replace function public.create_driver_fuel_record_v1(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
  v_driver uuid := auth.uid();
  v_truck_id integer := nullif(p_payload->>'truck_id', '')::integer;
  v_log_id integer := nullif(p_payload->>'log_id', '')::integer;
  v_fuel_date date := coalesce(nullif(p_payload->>'fuel_date', '')::date, current_date);
  v_liters numeric := nullif(p_payload->>'liters', '')::numeric;
  v_price numeric := nullif(p_payload->>'price_per_liter', '')::numeric;
  v_km integer := nullif(p_payload->>'km_at_load', '')::integer;
  v_payment text := nullif(btrim(p_payload->>'payment_method'), '');
  v_payment_app text := nullif(btrim(p_payload->>'payment_app'), '');
  v_station text := nullif(btrim(p_payload->>'gas_station'), '');
  v_created_at_device timestamptz := coalesce(nullif(p_payload->>'created_at_device', '')::timestamptz, clock_timestamp());
  v_fuel_id integer;
begin
  if v_role <> 'chofer' then
    raise exception 'Solo un chofer puede registrar esta carga' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) <> 'object' then raise exception 'Carga util invalida'; end if;
  if v_truck_id is null then raise exception 'No hay un camion asociado'; end if;
  if v_liters is null or v_liters <= 0 then raise exception 'Los litros deben ser mayores a cero'; end if;
  if v_price is null or v_price <= 0 then raise exception 'El precio por litro debe ser mayor a cero'; end if;
  if v_km is not null and v_km < 0 then raise exception 'El kilometraje no puede ser negativo'; end if;
  if v_payment not in ('efectivo','transferencia','app','tarjeta') then raise exception 'Medio de pago invalido'; end if;
  if v_payment = 'app' and v_payment_app is null then raise exception 'La app de pago es obligatoria'; end if;

  if v_log_id is not null then
    perform 1 from public.daily_logs
    where log_id = v_log_id and truck_id = v_truck_id and driver_id = v_driver and status <> 'voided';
    if not found then raise exception 'La jornada no corresponde al camion y chofer actuales'; end if;
  else
    select log_id into v_log_id
    from public.daily_logs
    where truck_id = v_truck_id and driver_id = v_driver and status <> 'voided'
    order by (status = 'open') desc, abs(log_date - v_fuel_date), log_id desc
    limit 1;
    if v_log_id is null then raise exception 'No hay una jornada valida para registrar la carga'; end if;
  end if;

  select fuel_id into v_fuel_id
  from public.fuel_records
  where truck_id = v_truck_id and created_at_device = v_created_at_device
  limit 1;
  if v_fuel_id is not null then
    return jsonb_build_object('fuel_id', v_fuel_id, 'log_id', v_log_id, 'already_saved', true);
  end if;

  insert into public.fuel_records(
    truck_id, log_id, fuel_date, liters, price_per_liter, km_at_load,
    payment_method, payment_app, gas_station, created_at_device, created_by
  ) values (
    v_truck_id, v_log_id, v_fuel_date, v_liters, v_price, v_km,
    v_payment, case when v_payment = 'app' then v_payment_app else null end,
    v_station, v_created_at_device, v_driver
  ) returning fuel_id into v_fuel_id;

  return jsonb_build_object('fuel_id', v_fuel_id, 'log_id', v_log_id, 'already_saved', false);
end;
$$;

revoke all on function public.admin_update_truck_v2(integer, jsonb) from public, anon;
grant execute on function public.admin_update_truck_v2(integer, jsonb) to authenticated;
revoke all on function public.create_driver_fuel_record_v1(jsonb) from public, anon;
grant execute on function public.create_driver_fuel_record_v1(jsonb) to authenticated;

comment on column public.trucks.odometer_epoch_started_at is
  'Inicio del ciclo del odometro vigente. Las lecturas anteriores se conservan como historial.';
comment on column public.trucks.odometer_epoch_base_km is
  'Lectura administrativa autoritativa al iniciar el ciclo vigente del odometro.';

commit;
