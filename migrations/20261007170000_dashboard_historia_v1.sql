-- Panel · historia diaria para el zoom de los gráficos de evolución.
-- Mismas reglas que dashboard_tendencia_v1 (servicios completados, sin
-- pruebas, por día de Buenos Aires, filtros de prestadora y base), pero
-- agrupado con GROUP BY para que un rango largo (hasta 5 años) no cueste
-- una subconsulta por día. Solo lectura.

create or replace function public.dashboard_historia_v1(
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
  v_desde date := coalesce(p_desde, coalesce(p_hasta, v_hoy) - 729);
  v_out   jsonb;
begin
  if v_role is null or v_role not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para ver la tendencia';
  end if;
  if v_desde > v_hasta then
    raise exception 'Período inválido: "desde" es posterior a "hasta"';
  end if;
  if v_hasta - v_desde > 1830 then
    v_desde := v_hasta - 1830;
  end if;

  with base as (
    select
      (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date as dia,
      coalesce(s.company_estimated_total, 0) as monto,
      coalesce(
        case when coalesce(r.km_reales, 0) > 0 then r.km_reales end,
        case
          when jsonb_array_length(coalesce(s.route_legs, '[]'::jsonb)) = 3
            then round((s.route_legs -> 1 ->> 'distanceMeters')::numeric / 1000.0, 2)
          when jsonb_array_length(coalesce(s.route_legs, '[]'::jsonb)) = 1
               and s.destination_lat is not null and s.destination_lng is not null
            then round((s.route_legs -> 0 ->> 'distanceMeters')::numeric / 1000.0, 2)
        end,
        0
      ) as km_real
    from public.operator_services s
    left join public.remitos r on r.remito_id = s.remito_id
    where s.is_test = false
      and s.status = 'completed'
      and (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
            between v_desde and v_hasta
      and (p_empresas is null or cardinality(p_empresas) = 0 or s.company_id = any (p_empresas))
      and (p_bases    is null or cardinality(p_bases)    = 0 or s.billing_base_id = any (p_bases))
  ),
  por_dia as (
    select dia, sum(monto) as monto, count(*) as servicios, sum(km_real) as km
    from base
    group by dia
  ),
  dias as (
    select g::date as dia
    from generate_series(v_desde::timestamp, v_hasta::timestamp, interval '1 day') g
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'dias', (v_hasta - v_desde) + 1,
    'primer_dato', (select min(dia) from por_dia),
    'facturado', jsonb_agg(round(coalesce(p.monto, 0), 2) order by d.dia),
    'servicios', jsonb_agg(coalesce(p.servicios, 0) order by d.dia),
    'km_reales', jsonb_agg(round(coalesce(p.km, 0), 1) order by d.dia)
  )
  into v_out
  from dias d
  left join por_dia p on p.dia = d.dia;

  return v_out;
end
$function$;

revoke all on function public.dashboard_historia_v1(date, date, uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_historia_v1(date, date, uuid[], uuid[]) to authenticated, service_role;
