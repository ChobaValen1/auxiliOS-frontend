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
