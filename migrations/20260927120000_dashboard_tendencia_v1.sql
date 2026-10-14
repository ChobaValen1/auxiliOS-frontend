-- Panel · Tendencia: series diarias del período y del anterior.
--
-- Por cada día del período (y el mismo día del período anterior, alineado por
-- posición): facturado, servicios y km reales. Además, las mismas tres
-- series por prestadora, para las barras apiladas.
--
-- Mismo universo y mismas definiciones que dashboard_facturacion_v1:
-- servicios completados, sin test; km real = el informado por el chofer en el
-- remito o, si no hay, el tramo Origen→Destino de la ruta calculada.
-- No reemplaza ninguna RPC existente.

create or replace function public.dashboard_tendencia_v1(
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
    raise exception 'Sin permiso para ver la tendencia';
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
            between v_prev_desde and v_hasta
      and (p_empresas is null or cardinality(p_empresas) = 0 or s.company_id = any (p_empresas))
      and (p_bases    is null or cardinality(p_bases)    = 0 or s.billing_base_id = any (p_bases))
  ),
  dias as (select i from generate_series(0, v_dias - 1) i),
  emp as (
    select b.company_id as id,
           coalesce(nullif(btrim(c.trade_name), ''), c.legal_name, 'Sin prestadora') as nombre,
           sum(b.monto) as monto, count(*) as servicios
    from base b
    left join public.companies c on c.company_id = b.company_id
    where b.dia >= v_desde
    group by 1, 2
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'dias', v_dias,
    'actual', jsonb_build_object(
      'facturado', (select jsonb_agg(round(coalesce((select sum(monto) from base b where b.dia = v_desde + i), 0), 2) order by i) from dias),
      'servicios', (select jsonb_agg((select count(*) from base b where b.dia = v_desde + i) order by i) from dias),
      'km_reales', (select jsonb_agg(round(coalesce((select sum(km_real) from base b where b.dia = v_desde + i), 0), 1) order by i) from dias)
    ),
    'anterior', jsonb_build_object(
      'facturado', (select jsonb_agg(round(coalesce((select sum(monto) from base b where b.dia = v_prev_desde + i), 0), 2) order by i) from dias),
      'servicios', (select jsonb_agg((select count(*) from base b where b.dia = v_prev_desde + i) order by i) from dias),
      'km_reales', (select jsonb_agg(round(coalesce((select sum(km_real) from base b where b.dia = v_prev_desde + i), 0), 1) order by i) from dias)
    ),
    'por_empresa', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'nombre', e.nombre,
               'facturado', (select jsonb_agg(round(coalesce((select sum(monto) from base b where b.dia = v_desde + i and b.company_id is not distinct from e.id), 0), 2) order by i) from dias),
               'servicios', (select jsonb_agg((select count(*) from base b where b.dia = v_desde + i and b.company_id is not distinct from e.id) order by i) from dias),
               'km_reales', (select jsonb_agg(round(coalesce((select sum(km_real) from base b where b.dia = v_desde + i and b.company_id is not distinct from e.id), 0), 1) order by i) from dias))
             order by e.monto desc, e.servicios desc, e.nombre)
      from emp e
    ), '[]'::jsonb)
  )
  into v_out;

  return v_out;
end
$function$;

revoke all on function public.dashboard_tendencia_v1(date, date, uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_tendencia_v1(date, date, uuid[], uuid[]) to authenticated;
