-- Varios servicios a la vez: la base no aceptaba dos viajes abiertos del mismo
-- chofer (constraint sin_solapamiento_viajes). Se reemplaza por un control que
-- hace lo mismo para todos los choferes, salvo los que tienen el interruptor
-- multi_service_v1 encendido.
create or replace function app_private.trips_no_overlap_v1() returns trigger
language plpgsql security definer set search_path to '' as $f$
begin
  if new.fecha_hora_inicio is null or new.driver_id is null or app_private.multi_service_enabled_v1(new.driver_id) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('trips-overlap:'||new.driver_id::text, 0));
  if exists (
    select 1 from public.trips t
    where t.driver_id = new.driver_id and t.trip_id is distinct from new.trip_id and t.fecha_hora_inicio is not null
      and tstzrange(t.fecha_hora_inicio, coalesce(t.fecha_hora_fin, 'infinity'::timestamptz))
       && tstzrange(new.fecha_hora_inicio, coalesce(new.fecha_hora_fin, 'infinity'::timestamptz))
  ) then
    raise exception using errcode = '23P01', message = 'El chofer ya tiene otro viaje en ese horario';
  end if;
  return new;
end $f$;
create trigger trips_no_overlap_v1 before insert or update of driver_id, fecha_hora_inicio, fecha_hora_fin on public.trips
  for each row execute function app_private.trips_no_overlap_v1();
alter table public.trips drop constraint sin_solapamiento_viajes;
