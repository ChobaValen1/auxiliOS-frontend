-- AuxiliOS daily_logs hardening
-- Applied to Supabase production on 2026-07-31.
-- Protects journey records while preserving the operational requirement that
-- drivers can see which trucks currently have an open journey.

alter table public.daily_logs
  add column if not exists closed_at timestamptz;

update public.daily_logs
set closed_at = coalesce(received_at, created_at, created_at_device, now())
where status = 'closed' and closed_at is null;

create unique index if not exists uq_daily_logs_one_open_per_driver
  on public.daily_logs(driver_id)
  where status = 'open';

create unique index if not exists uq_daily_logs_one_open_per_truck
  on public.daily_logs(truck_id)
  where status = 'open' and truck_id is not null;

create or replace function public.enforce_daily_logs_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := public.current_auxilios_role();
begin
  if tg_op = 'INSERT' then
    if v_role = 'chofer' then
      if new.driver_id is distinct from auth.uid() then
        raise exception 'JORNADA_NO_AUTORIZADA: solo podés crear tu propia jornada' using errcode = '42501';
      end if;
      if new.status is distinct from 'open' then
        raise exception 'JORNADA_ESTADO_INVALIDO: una jornada nueva debe iniciar abierta' using errcode = '23514';
      end if;
      if new.km_final is not null or new.hora_fin is not null then
        raise exception 'JORNADA_CIERRE_INVALIDO: una jornada nueva no puede incluir datos de cierre' using errcode = '23514';
      end if;
      new.closed_at := null;
      new.received_at := now();
      new.sync_status := 'synced';
    elsif v_role = 'supervision' then
      raise exception 'JORNADA_NO_AUTORIZADA: supervisión no puede crear jornadas' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if v_role = 'chofer' then
      if old.driver_id is distinct from auth.uid() or new.driver_id is distinct from old.driver_id then
        raise exception 'JORNADA_NO_AUTORIZADA: solo podés modificar tu propia jornada' using errcode = '42501';
      end if;

      if new.truck_id is distinct from old.truck_id
         or new.log_date is distinct from old.log_date
         or new.km_inicio is distinct from old.km_inicio
         or new.hora_inicio is distinct from old.hora_inicio
         or new.created_at_device is distinct from old.created_at_device
         or new.received_at is distinct from old.received_at
         or new.created_at is distinct from old.created_at
         or new.foto_km_inicio is distinct from old.foto_km_inicio
         or new.patente_camion is distinct from old.patente_camion
         or new.grilla_motivo is distinct from old.grilla_motivo
         or new.km_inicio_ia is distinct from old.km_inicio_ia
         or new.km_inicio_origen is distinct from old.km_inicio_origen then
        raise exception 'JORNADA_INMUTABLE: no se pueden alterar los datos de apertura' using errcode = '42501';
      end if;

      if old.status = 'open' and new.status = 'closed' then
        if new.km_final is null or new.hora_fin is null then
          raise exception 'JORNADA_CIERRE_INCOMPLETO: faltan KM u hora final' using errcode = '23514';
        end if;
        if new.km_final < old.km_inicio and coalesce(new.km_excepcion, false) = false then
          raise exception 'JORNADA_KM_INVALIDO: el KM final no puede ser menor al inicial sin excepción' using errcode = '23514';
        end if;
        new.closed_at := now();
        new.sync_status := 'synced';
        return new;
      end if;

      if old.status = 'closed' and new.status = 'open' then
        if old.closed_at is null or old.closed_at < now() - interval '5 minutes' then
          raise exception 'JORNADA_CERRADA: ya no puede reabrirse' using errcode = '42501';
        end if;
        new.km_final := null;
        new.km_final_ia := null;
        new.km_final_origen := null;
        new.foto_km_final := null;
        new.hora_fin := null;
        new.in_workshop := false;
        new.workshop_detail := null;
        new.notas := null;
        new.km_excepcion := false;
        new.closed_at := null;
        return new;
      end if;

      raise exception 'JORNADA_TRANSICION_INVALIDA: la jornada solo puede cerrarse o revertirse inmediatamente' using errcode = '42501';
    elsif v_role = 'supervision' then
      raise exception 'JORNADA_NO_AUTORIZADA: supervisión no puede modificar jornadas' using errcode = '42501';
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function public.enforce_daily_logs_mutation() from public, anon, authenticated;
grant execute on function public.enforce_daily_logs_mutation() to service_role;

drop trigger if exists trg_daily_logs_guard on public.daily_logs;
create trigger trg_daily_logs_guard
before insert or update on public.daily_logs
for each row execute function public.enforce_daily_logs_mutation();

create or replace function public.fn_bloquear_periodo_cerrado()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_fecha date;
  v_estado varchar(10);
  v_rol text := public.current_auxilios_role();
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
begin
  if v_rol = 'administracion' or v_jwt_role = 'service_role' then
    return new;
  end if;

  if tg_table_name = 'daily_logs' then
    v_fecha := new.log_date;
  else
    v_fecha := new.created_at_device::date;
  end if;

  select estado into v_estado
  from public.periodos_operativos
  where v_fecha between fecha_inicio and fecha_fin
  limit 1;

  if found and v_estado = 'cerrado' then
    raise exception 'PERIODO_CERRADO: La fecha % pertenece a un período cerrado. Contactá a administración.', v_fecha
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.fn_actualizar_km_camion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.km_final is not null
     and (old.km_final is null or old.km_final <> new.km_final)
     and new.truck_id is not null then
    update public.trucks
    set current_km = greatest(current_km, new.km_final)
    where truck_id = new.truck_id;
  end if;
  return new;
end;
$$;

revoke all on table public.daily_logs from anon;
revoke all on sequence public.daily_logs_log_id_seq from anon;
revoke delete, truncate, references, trigger on table public.daily_logs from authenticated;
grant select, insert, update on table public.daily_logs to authenticated;
grant usage, select on sequence public.daily_logs_log_id_seq to authenticated;

alter table public.daily_logs enable row level security;

drop policy if exists pol_daily_logs on public.daily_logs;
drop policy if exists daily_logs_select_management on public.daily_logs;
drop policy if exists daily_logs_select_driver_operational on public.daily_logs;
drop policy if exists daily_logs_insert_admin on public.daily_logs;
drop policy if exists daily_logs_insert_driver on public.daily_logs;
drop policy if exists daily_logs_update_admin on public.daily_logs;
drop policy if exists daily_logs_update_driver on public.daily_logs;

create policy daily_logs_select_management
on public.daily_logs for select to authenticated
using ((select public.current_auxilios_role()) in ('administracion','supervision'));

create policy daily_logs_select_driver_operational
on public.daily_logs for select to authenticated
using (
  (select public.current_auxilios_role()) = 'chofer'
  and (driver_id = (select auth.uid()) or status = 'open')
);

create policy daily_logs_insert_admin
on public.daily_logs for insert to authenticated
with check ((select public.current_auxilios_role()) = 'administracion');

create policy daily_logs_insert_driver
on public.daily_logs for insert to authenticated
with check (
  (select public.current_auxilios_role()) = 'chofer'
  and driver_id = (select auth.uid())
  and status = 'open'
);

create policy daily_logs_update_admin
on public.daily_logs for update to authenticated
using ((select public.current_auxilios_role()) = 'administracion')
with check ((select public.current_auxilios_role()) = 'administracion');

create policy daily_logs_update_driver
on public.daily_logs for update to authenticated
using (
  (select public.current_auxilios_role()) = 'chofer'
  and driver_id = (select auth.uid())
)
with check (
  (select public.current_auxilios_role()) = 'chofer'
  and driver_id = (select auth.uid())
);
