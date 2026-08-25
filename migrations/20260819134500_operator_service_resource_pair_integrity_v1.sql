create or replace function app_private.validate_operator_service_resource_pair_v1()
returns trigger
language plpgsql
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_driver_truck integer;
  v_truck_driver uuid;
begin
  if (new.assigned_driver_id is null) <> (new.assigned_truck_id is null) then
    raise exception 'Chofer y Móvil deben asignarse juntos';
  end if;

  if new.assigned_driver_id is null then
    return new;
  end if;

  select dl.truck_id
    into v_driver_truck
  from public.daily_logs dl
  where dl.driver_id = new.assigned_driver_id
    and coalesce(dl.status,'open') = 'open'
    and dl.hora_fin is null
    and dl.closed_at is null
  order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc
  limit 1;

  if v_driver_truck is not null and v_driver_truck is distinct from new.assigned_truck_id then
    raise exception 'El Chofer tiene una jornada activa con otro Móvil';
  end if;

  select dl.driver_id
    into v_truck_driver
  from public.daily_logs dl
  where dl.truck_id = new.assigned_truck_id
    and coalesce(dl.status,'open') = 'open'
    and dl.hora_fin is null
    and dl.closed_at is null
  order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc
  limit 1;

  if v_truck_driver is not null and v_truck_driver is distinct from new.assigned_driver_id then
    raise exception 'El Móvil tiene una jornada activa con otro Chofer';
  end if;

  return new;
end;
$function$;

drop trigger if exists operator_services_validate_resource_pair_v1 on public.operator_services;
create trigger operator_services_validate_resource_pair_v1
before insert or update of assigned_driver_id, assigned_truck_id
on public.operator_services
for each row
execute function app_private.validate_operator_service_resource_pair_v1();
