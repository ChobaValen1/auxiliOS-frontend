-- Panel · Resumen: lo que el tablero nuevo necesita y las RPC de siempre no traen.
--
-- · por_dia: facturado de cada día del período y del período anterior, alineados
--   por posición (día 1 contra día 1) para la "Evolución de facturado".
-- · por_clase: servicios, km facturados y facturado por tipo de vehículo
--   (service_concepts.vehicle_class) para la "Composición por tipo".
-- · empresas + puntos + bases: el mapa por prestadora. Cada punto trae su base
--   más cercana y la distancia en línea recta; el radio de cobertura lo elige
--   quien mira el tablero, así que la cuenta de "dentro / fuera" se hace en el
--   navegador.
--
-- Mismo universo que dashboard_facturacion_v1: servicios completados, sin test.
-- No reemplaza ninguna RPC existente.

create or replace function public.dashboard_resumen_v1(
  p_desde date default null,
  p_hasta date default null,
  p_empresas uuid[] default null,
  p_bases uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_role  text := app_private.current_auxilios_role();
  v_hoy   date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_hasta date := coalesce(p_hasta, v_hoy);
  v_desde date := coalesce(p_desde, coalesce(p_hasta, v_hoy) - 29);
  v_dias  integer;
  v_prev_desde date;
  v_out   jsonb;
begin
  if v_role is null or v_role not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para ver el resumen';
  end if;
  if v_desde > v_hasta then
    raise exception 'Período inválido: "desde" es posterior a "hasta"';
  end if;
  v_dias := (v_hasta - v_desde) + 1;
  v_prev_desde := v_desde - v_dias;

  with base as (
    select
      (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date as dia,
      s.company_id,
      s.billing_base_id,
      s.origin_lat,
      s.origin_lng,
      sc.vehicle_class,
      coalesce(s.company_estimated_total, 0) as monto,
      case
        when coalesce(s.estimated_asphalt_km, 0) + coalesce(s.estimated_gravel_km, 0) > 0
          then coalesce(s.estimated_asphalt_km, 0) + coalesce(s.estimated_gravel_km, 0)
        else coalesce(s.estimated_distance_km, 0)
      end as km
    from public.operator_services s
    left join public.service_concepts sc on sc.concept_id = s.primary_concept_id
    where s.is_test = false
      and s.status = 'completed'
      and (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
            between v_prev_desde and v_hasta
      and (p_empresas is null or cardinality(p_empresas) = 0 or s.company_id      = any (p_empresas))
      and (p_bases    is null or cardinality(p_bases)    = 0 or s.billing_base_id = any (p_bases))
  ),
  actual as (select * from base where dia >= v_desde),
  sede as (
    select bb.base_id,
           coalesce(nullif(btrim(bb.name), ''), bb.base_code, 'Sin nombre') as nombre,
           bb.latitude as lat, bb.longitude as lng
    from public.billing_bases bb
    where coalesce(bb.is_active, true)
      and bb.latitude is not null and bb.longitude is not null
      and not (bb.latitude = 0 and bb.longitude = 0)
  ),
  ubicado as (
    select a.company_id, a.origin_lat, a.origin_lng, cer.base_id, cer.km
    from actual a
    left join lateral (
      select s2.base_id, app_private.km_entre(a.origin_lat, a.origin_lng, s2.lat, s2.lng) as km
      from sede s2
      order by 2
      limit 1
    ) cer on true
    where a.origin_lat is not null and a.origin_lng is not null
      and a.origin_lat between -90 and 90 and a.origin_lng between -180 and 180
      and not (a.origin_lat = 0 and a.origin_lng = 0)
  ),
  emp as (
    select a.company_id as id,
           coalesce(nullif(btrim(c.trade_name), ''), c.legal_name, 'Sin prestadora') as nombre,
           sum(a.monto) as monto, count(*) as servicios
    from actual a
    left join public.companies c on c.company_id = a.company_id
    group by 1, 2
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'dias', v_dias,
    'por_dia', jsonb_build_object(
      'actual', (
        select jsonb_agg(round(coalesce((select sum(monto) from base b where b.dia = v_desde + i), 0), 2) order by i)
        from generate_series(0, v_dias - 1) i
      ),
      'anterior', (
        select jsonb_agg(round(coalesce((select sum(monto) from base b where b.dia = v_prev_desde + i), 0), 2) order by i)
        from generate_series(0, v_dias - 1) i
      )
    ),
    'por_clase', coalesce((
      select jsonb_agg(jsonb_build_object(
               'clase', g.clase, 'servicios', g.servicios,
               'km', round(g.km, 2), 'monto', round(g.monto, 2))
             order by g.monto desc, g.servicios desc)
      from (
        select coalesce(vehicle_class, 'otros') as clase,
               count(*) as servicios, sum(km) as km, sum(monto) as monto
        from actual
        group by 1
      ) g
    ), '[]'::jsonb),
    'empresas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'nombre', e.nombre,
               'monto', round(e.monto, 2), 'servicios', e.servicios)
             order by e.monto desc, e.servicios desc, e.nombre)
      from emp e
    ), '[]'::jsonb),
    'servicios', (select count(*) from actual),
    'puntos', coalesce((
      select jsonb_agg(jsonb_build_array(
               round(u.origin_lng::numeric, 4), round(u.origin_lat::numeric, 4),
               u.company_id, u.base_id, round(u.km::numeric, 1)))
      from ubicado u
    ), '[]'::jsonb),
    'bases', coalesce((
      select jsonb_agg(jsonb_build_object('id', base_id, 'nombre', nombre, 'lat', lat, 'lng', lng) order by nombre)
      from sede
    ), '[]'::jsonb)
  )
  into v_out;

  return v_out;
end
$function$;

revoke all on function public.dashboard_resumen_v1(date, date, uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_resumen_v1(date, date, uuid[], uuid[]) to authenticated;
