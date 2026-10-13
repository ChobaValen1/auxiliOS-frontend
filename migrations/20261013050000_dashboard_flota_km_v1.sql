-- Km recorridos por la flota según el odómetro (km final − km inicial de cada
-- jornada cerrada), para comparar en Panel › Resumen › Eficiencia operativa
-- contra los km facturados y los km reales de los servicios.
-- Mismo período y mismo período anterior que dashboard_facturacion_v1.
create or replace function public.dashboard_flota_km_v1(p_desde date default null, p_hasta date default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role  text := app_private.current_auxilios_role();
  v_hasta date := coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_desde date := coalesce(p_desde, coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date) - 29);
  v_prev_desde date;
  v_prev_hasta date;
begin
  if v_role is null or v_role not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para ver las métricas de la flota';
  end if;
  if v_desde > v_hasta then
    raise exception 'Período inválido: "desde" es posterior a "hasta"';
  end if;
  v_prev_hasta := v_desde - 1;
  v_prev_desde := v_desde - ((v_hasta - v_desde) + 1);

  return (
    with j as (
      select l.log_date, l.truck_id, l.km_recorridos
        from public.daily_logs l
        join public.trucks t on t.truck_id = l.truck_id
       where l.status = 'closed'
         and not coalesce(t.is_test, false)
         and l.log_date between v_prev_desde and v_hasta
    )
    select jsonb_build_object(
      'desde', v_desde, 'hasta', v_hasta,
      'actual', jsonb_build_object(
        'km', coalesce(sum(km_recorridos) filter (where log_date >= v_desde and km_recorridos >= 0), 0),
        'jornadas', count(*) filter (where log_date >= v_desde),
        'sin_dato', count(*) filter (where log_date >= v_desde and (km_recorridos is null or km_recorridos < 0)),
        'moviles', count(distinct truck_id) filter (where log_date >= v_desde)),
      'anterior', jsonb_build_object(
        'km', coalesce(sum(km_recorridos) filter (where log_date <= v_prev_hasta and km_recorridos >= 0), 0),
        'jornadas', count(*) filter (where log_date <= v_prev_hasta)))
    from j
  );
end;
$function$;

revoke all on function public.dashboard_flota_km_v1(date, date) from public, anon;
grant execute on function public.dashboard_flota_km_v1(date, date) to authenticated;

-- v2 (misma función): suma cuántos remitos firmados hay en el período y cuántos
-- están cargados como servicio. Mientras el trabajo no pase entero por Servicios,
-- las comparaciones contra el odómetro no son reales y la pantalla lo avisa.
create or replace function public.dashboard_flota_km_v1(p_desde date default null, p_hasta date default null)
 returns jsonb language plpgsql stable security definer set search_path to 'public', 'app_private', 'pg_temp'
as $function$
declare
  v_role  text := app_private.current_auxilios_role();
  v_hasta date := coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_desde date := coalesce(p_desde, coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date) - 29);
  v_prev_desde date; v_prev_hasta date; v_out jsonb; v_rem jsonb;
begin
  if v_role is null or v_role not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para ver las métricas de la flota';
  end if;
  if v_desde > v_hasta then raise exception 'Período inválido: "desde" es posterior a "hasta"'; end if;
  v_prev_hasta := v_desde - 1;
  v_prev_desde := v_desde - ((v_hasta - v_desde) + 1);
  with j as (
    select l.log_date, l.truck_id, l.km_recorridos from public.daily_logs l join public.trucks t on t.truck_id = l.truck_id
     where l.status = 'closed' and not coalesce(t.is_test, false) and l.log_date between v_prev_desde and v_hasta)
  select jsonb_build_object('desde', v_desde, 'hasta', v_hasta,
    'actual', jsonb_build_object(
      'km', coalesce(sum(km_recorridos) filter (where log_date >= v_desde and km_recorridos >= 0), 0),
      'jornadas', count(*) filter (where log_date >= v_desde),
      'sin_dato', count(*) filter (where log_date >= v_desde and (km_recorridos is null or km_recorridos < 0)),
      'moviles', count(distinct truck_id) filter (where log_date >= v_desde)),
    'anterior', jsonb_build_object(
      'km', coalesce(sum(km_recorridos) filter (where log_date <= v_prev_hasta and km_recorridos >= 0), 0),
      'jornadas', count(*) filter (where log_date <= v_prev_hasta)))
  into v_out from j;

  /* Choferes de prueba: los que sólo manejaron móviles de prueba. */
  with prueba as (
    select l.driver_id from public.daily_logs l join public.trucks t on t.truck_id = l.truck_id
     group by l.driver_id having bool_and(coalesce(t.is_test, false))
  ), r as (
    select r.remito_id,
           exists (select 1 from public.operator_services s where s.remito_id = r.remito_id and not s.is_test) as con_servicio,
           exists (select 1 from public.operator_services s where s.remito_id = r.remito_id and s.is_test) as de_prueba
      from public.remitos r
     where r.status = 'firmado'
       and (r.created_at_device at time zone 'America/Argentina/Buenos_Aires')::date between v_desde and v_hasta
       and r.driver_id not in (select driver_id from prueba where driver_id is not null)
  )
  select jsonb_build_object('firmados', count(*) filter (where not de_prueba),
                            'con_servicio', count(*) filter (where con_servicio))
    into v_rem from r;

  return v_out || jsonb_build_object('remitos', v_rem);
end;
$function$;
