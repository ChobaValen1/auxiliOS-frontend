create or replace function public.guard_truck_driver_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_role text := app_private.current_auxilios_role();
begin
  if auth.role() = 'service_role' or current_user = 'postgres' or v_role = 'administracion' then
    return new;
  end if;

  if v_role <> 'chofer' then
    raise exception 'TRUCK_WRITE_NOT_ALLOWED' using errcode = '42501';
  end if;

  if new.plate is distinct from old.plate
     or new.brand is distinct from old.brand
     or new.model is distinct from old.model
     or new.year is distinct from old.year
     or new.vin is distinct from old.vin
     or new.current_hours is distinct from old.current_hours
     or new.status is distinct from old.status
     or new.assigned_to is distinct from old.assigned_to
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at
     or new.numero_interno is distinct from old.numero_interno
     or new.foto_url is distinct from old.foto_url
     or new.tipo_equipo is distinct from old.tipo_equipo
     or new.odometer_epoch_started_at is distinct from old.odometer_epoch_started_at
     or new.odometer_epoch_base_km is distinct from old.odometer_epoch_base_km then
    raise exception 'TRUCK_FIELDS_IMMUTABLE' using errcode = '42501';
  end if;

  if new.current_km is distinct from old.current_km and not exists (
    select 1
    from public.daily_logs d
    where d.driver_id = auth.uid()
      and d.truck_id = old.truck_id
      and d.status = 'closed'
      and d.log_date >= current_date - 2
      and d.km_final = new.current_km
      and (
        new.current_km >= old.current_km
        or coalesce(d.km_excepcion, false)
        or (
          old.odometer_epoch_started_at is not null
          and coalesce(d.closed_at, d.updated_at, d.created_at) >= old.odometer_epoch_started_at
          and new.current_km >= coalesce(old.odometer_epoch_base_km, 0)
        )
      )
  ) then
    raise exception 'TRUCK_KM_NOT_LINKED_TO_JOURNEY' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_truck_driver_update() is
  'Restricts driver truck updates to odometers linked to a recently closed journey, including valid readings in the current odometer epoch.';
