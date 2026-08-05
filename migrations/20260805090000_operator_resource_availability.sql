-- AuxiliOS · Disponibilidad operativa de choferes y móviles

create or replace function public.get_operator_resource_availability()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role text := app_private.current_auxilios_role();
  v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if v_role not in ('administracion', 'operador', 'supervision') then
    raise exception 'Sin permiso para consultar disponibilidad operativa';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'drivers', (
      with latest_open as (
        select distinct on (dl.driver_id)
          dl.log_id,
          dl.driver_id,
          dl.truck_id,
          dl.log_date,
          dl.hora_inicio,
          dl.in_workshop,
          dl.workshop_detail
        from public.daily_logs dl
        where coalesce(dl.status, 'open') = 'open'
          and dl.hora_fin is null
          and dl.closed_at is null
        order by dl.driver_id, dl.log_date desc, dl.hora_inicio desc, dl.log_id desc
      ),
      active_service as (
        select distinct on (s.assigned_driver_id)
          s.assigned_driver_id,
          s.service_number,
          s.status
        from public.operator_services s
        where s.assigned_driver_id is not null
          and s.status in ('assigned', 'en_route', 'at_origin', 'loaded', 'at_destination')
        order by s.assigned_driver_id, s.updated_at desc
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', u.user_id,
        'full_name', u.full_name,
        'legajo', u.legajo,
        'is_active', coalesce(u.is_active, true),
        'active_log_id', l.log_id,
        'active_truck_id', l.truck_id,
        'active_log_date', l.log_date,
        'active_start_time', l.hora_inicio,
        'truck_label', coalesce(t.numero_interno, t.plate),
        'truck_plate', t.plate,
        'truck_status', t.status,
        'in_workshop', coalesce(l.in_workshop, false),
        'workshop_detail', l.workshop_detail,
        'active_service_number', a.service_number,
        'active_service_status', a.status,
        'resource_state', case
          when not coalesce(u.is_active, true) then 'inactive'
          when l.log_id is null then 'no_open_shift'
          when l.log_date < v_today then 'stale_shift'
          when coalesce(l.in_workshop, false) then 'workshop'
          when coalesce(t.status, 'inactive') <> 'active' then 'truck_unavailable'
          when a.service_number is not null then 'busy'
          else 'available'
        end
      ) order by u.full_name), '[]'::jsonb)
      from public.users u
      join public.roles r on r.role_id = u.role_id
      left join latest_open l on l.driver_id = u.user_id
      left join public.trucks t on t.truck_id = l.truck_id
      left join active_service a on a.assigned_driver_id = u.user_id
      where r.name = 'chofer'
    ),
    'trucks', (
      with latest_open as (
        select distinct on (dl.truck_id)
          dl.log_id,
          dl.driver_id,
          dl.truck_id,
          dl.log_date,
          dl.hora_inicio,
          dl.in_workshop,
          dl.workshop_detail
        from public.daily_logs dl
        where dl.truck_id is not null
          and coalesce(dl.status, 'open') = 'open'
          and dl.hora_fin is null
          and dl.closed_at is null
        order by dl.truck_id, dl.log_date desc, dl.hora_inicio desc, dl.log_id desc
      ),
      active_service as (
        select distinct on (s.assigned_truck_id)
          s.assigned_truck_id,
          s.service_number,
          s.status
        from public.operator_services s
        where s.assigned_truck_id is not null
          and s.status in ('assigned', 'en_route', 'at_origin', 'loaded', 'at_destination')
        order by s.assigned_truck_id, s.updated_at desc
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'truck_id', t.truck_id,
        'numero_interno', t.numero_interno,
        'plate', t.plate,
        'brand', t.brand,
        'model', t.model,
        'status', t.status,
        'notes', t.notes,
        'active_log_id', l.log_id,
        'active_driver_id', l.driver_id,
        'active_log_date', l.log_date,
        'active_start_time', l.hora_inicio,
        'driver_name', u.full_name,
        'driver_active', coalesce(u.is_active, true),
        'in_workshop', coalesce(l.in_workshop, false),
        'workshop_detail', l.workshop_detail,
        'active_service_number', a.service_number,
        'active_service_status', a.status,
        'resource_state', case
          when coalesce(t.status, 'inactive') <> 'active' then 'inactive'
          when l.log_id is null then 'no_open_shift'
          when l.log_date < v_today then 'stale_shift'
          when coalesce(l.in_workshop, false) then 'workshop'
          when not coalesce(u.is_active, true) then 'driver_unavailable'
          when a.service_number is not null then 'busy'
          else 'available'
        end
      ) order by t.numero_interno nulls last, t.plate), '[]'::jsonb)
      from public.trucks t
      left join latest_open l on l.truck_id = t.truck_id
      left join public.users u on u.user_id = l.driver_id
      left join active_service a on a.assigned_truck_id = t.truck_id
    )
  );
end
$function$;

revoke all on function public.get_operator_resource_availability() from public, anon;
grant execute on function public.get_operator_resource_availability() to authenticated;
