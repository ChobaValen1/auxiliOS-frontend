-- Control del camión v2: documentación obligatoria que el móvil no tiene cargada.
--
-- get_fleet_control_v1 suma 'docs_sin_cargar': los documentos obligatorios
-- (VTV, póliza de seguro, habilitación RUTA, cédula verde y matafuegos, la misma
-- lista que marca is_obligatorio al subir un documento) que el móvil nunca cargó.

create or replace function public.get_fleet_control_v1()
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare v_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  if auth.uid() is null or coalesce(app_private.current_auxilios_role(), '') not in ('administracion', 'supervision') then
    raise exception 'Sin permiso para ver la flota';
  end if;
  return jsonb_build_object('today', v_today, 'trucks', coalesce((
    select jsonb_agg(jsonb_build_object(
      'truck_id', t.truck_id, 'numero_interno', t.numero_interno, 'plate', t.plate,
      'brand', t.brand, 'model', t.model, 'year', t.year, 'status', t.status,
      'current_km', t.current_km, 'tipo_equipo', t.tipo_equipo,
      'log_id', l.log_id, 'log_date', l.log_date, 'driver_name', u.full_name,
      'in_workshop', coalesce(l.in_workshop, false), 'workshop_detail', l.workshop_detail,
      'service_number', a.service_order_number, 'service_status', a.status,
      'tire_date', tc.check_date, 'tire_condition', tc.tire_condition, 'brake_condition', tc.brake_condition,
      'fuel_date', f.fuel_date, 'fuel_liters', f.liters, 'fuel_km', f.km_at_load,
      'fuel_today_liters', coalesce(ft.litros, 0),
      'docs_vencidos', coalesce(d.vencidos, 0), 'docs_proximos', coalesce(d.proximos, 0), 'docs_faltan', coalesce(d.faltan, 0),
      'docs_sin_cargar', coalesce(dr.sin_cargar, '[]'::jsonb)
    ) order by t.numero_interno nulls last, t.plate)
    from public.trucks t
    left join lateral (
      select dl.* from public.daily_logs dl
       where dl.truck_id = t.truck_id and coalesce(dl.status, 'open') = 'open' and dl.hora_fin is null and dl.closed_at is null
       order by dl.log_date desc, dl.hora_inicio desc, dl.log_id desc limit 1) l on true
    left join public.users u on u.user_id = l.driver_id
    left join lateral (
      select s.service_order_number, s.status from public.operator_services s
       where s.assigned_truck_id = t.truck_id and s.status in ('assigned', 'en_route', 'at_origin', 'loaded', 'at_destination')
         and not app_private.service_driver_done_v1(s.service_id)
       order by s.updated_at desc limit 1) a on true
    left join lateral (
      select c.check_date, c.tire_condition, c.brake_condition from public.tire_checks c
       where c.truck_id = t.truck_id order by c.check_date desc, c.created_at desc limit 1) tc on true
    left join lateral (
      select r.fuel_date, r.liters, r.km_at_load from public.fuel_records r
       where r.truck_id = t.truck_id and r.voided_at is null order by r.fuel_date desc, r.created_at desc limit 1) f on true
    left join lateral (
      select sum(r.liters) litros from public.fuel_records r
       where r.truck_id = t.truck_id and r.voided_at is null and r.fuel_date = v_today) ft on true
    left join lateral (
      select count(*) filter (where v.status = 'vencido') vencidos,
             count(*) filter (where v.status = 'proximo') proximos,
             count(*) filter (where v.status = 'falta_archivo') faltan
        from public.v_truck_docs_status v where v.truck_id = t.truck_id) d on true
    left join lateral (
      select jsonb_agg(c order by o) sin_cargar
        from unnest(array['VTV', 'SEGURO_POLIZA', 'HABILITACION_RUTA', 'CEDULA_VERDE', 'MATAFUEGOS']) with ordinality x(c, o)
       where not exists (select 1 from public.truck_docs td where td.truck_id = t.truck_id and td.internal_code = x.c)) dr on true
    where not coalesce(t.is_test, false)
  ), '[]'::jsonb));
end
$function$;
revoke all on function public.get_fleet_control_v1() from public, anon;
grant execute on function public.get_fleet_control_v1() to authenticated;
