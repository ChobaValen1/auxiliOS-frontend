-- Dashboard rediseñado · mapa de zonas con heatmap.
--
-- Devuelve los puntos para la capa de calor, ya agregados del lado del servidor.
--
-- Por qué agregados y no las filas crudas: un heatmap sobre miles de servicios
-- mandaría miles de coordenadas al browser en cada cambio de filtro. Se redondean
-- las coordenadas a 3 decimales (~110 m) y se agrupa por esa celda: el mapa se ve
-- igual —a ese zoom los puntos de una misma cuadra ya se superponen— con un
-- payload acotado. De paso, no se transmite la ubicación exacta de cada servicio.
--
-- El peso de cada celda es la cantidad de servicios, no el monto: un heatmap
-- responde "dónde trabajamos más", y un solo servicio caro no es una zona
-- caliente. El monto viaja igual para el tooltip.
--
-- Se devuelve también el corte por provincia, que alimenta el ranking lateral y
-- sirve de respaldo legible cuando un servicio tiene provincia pero no
-- coordenadas.
--
-- operator_services está vacía (el módulo arranca el 1/10), así que hoy esto
-- devuelve hay_datos=false y arrays vacíos. La UI distingue ese caso de un error.

begin;

create or replace function public.dashboard_zonas_v1(
  p_desde    date   default null,
  p_hasta    date   default null,
  p_empresas uuid[] default null,
  p_bases    uuid[] default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_role  text := app_private.current_auxilios_role();
  v_hasta date := coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date);
  v_desde date := coalesce(p_desde, coalesce(p_hasta, (now() at time zone 'America/Argentina/Buenos_Aires')::date) - 29);
  v_out   jsonb;
begin
  if v_role is null or v_role not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para ver el mapa de zonas';
  end if;
  if v_desde > v_hasta then
    raise exception 'Período inválido: "desde" es posterior a "hasta"';
  end if;

  with base as (
    select
      s.origin_lat,
      s.origin_lng,
      -- La provincia persistida es el camino normal; el parseo de la dirección
      -- es el respaldo para servicios viejos que no la tengan resuelta.
      coalesce(
        nullif(btrim(s.origin_province), ''),
        app_private.provincia_desde_direccion(s.origin_formatted_address)
      ) as provincia,
      coalesce(s.company_estimated_total, 0) as monto
    from public.operator_services s
    where s.is_test = false
      and s.status <> 'cancelled'
      and (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
            between v_desde and v_hasta
      and (p_empresas is null or cardinality(p_empresas) = 0 or s.company_id      = any (p_empresas))
      and (p_bases    is null or cardinality(p_bases)    = 0 or s.billing_base_id = any (p_bases))
  ),
  -- Sólo las filas que el heatmap puede dibujar. Se descartan las coordenadas
  -- fuera de rango: un 0,0 mal cargado pondría un foco de calor en el Atlántico.
  puntos as (
    select
      round(origin_lat::numeric, 3) as lat,
      round(origin_lng::numeric, 3) as lng,
      count(*)                      as servicios,
      sum(monto)                    as monto
    from base
    where origin_lat is not null
      and origin_lng is not null
      and origin_lat between -90 and 90
      and origin_lng between -180 and 180
      and not (origin_lat = 0 and origin_lng = 0)
    group by 1, 2
  ),
  prov as (
    select coalesce(provincia, 'Sin zona') as nombre,
           count(*)  as servicios,
           sum(monto) as monto
    from base
    group by 1
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'hay_datos',        (select count(*) from base)   > 0,
    'hay_coordenadas',  (select count(*) from puntos) > 0,
    'servicios_totales',     (select count(*) from base),
    'servicios_sin_ubicar',  (select count(*) from base
                               where origin_lat is null or origin_lng is null),
    -- Para encuadrar el mapa sobre los datos en vez de sobre todo el país.
    'bbox', (
      select case when count(*) = 0 then null else jsonb_build_object(
        'min_lat', min(lat), 'max_lat', max(lat),
        'min_lng', min(lng), 'max_lng', max(lng)) end
      from puntos
    ),
    'max_servicios', coalesce((select max(servicios) from puntos), 0),
    'puntos', coalesce((
      select jsonb_agg(jsonb_build_array(lng, lat, servicios, round(monto, 2))
             order by servicios desc)
      from puntos
    ), '[]'::jsonb),
    'por_provincia', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre',    nombre,
               'servicios', servicios,
               'monto',     round(monto, 2))
             order by servicios desc, monto desc, nombre)
      from prov
    ), '[]'::jsonb)
  )
  into v_out;

  return v_out;
end;
$function$;

comment on function public.dashboard_zonas_v1(date, date, uuid[], uuid[]) is
  'Puntos agregados para el heatmap del dashboard y el corte por provincia. Las coordenadas se redondean a 3 decimales (~110 m) y se agrupan por celda. Excluye servicios de prueba, cancelados y coordenadas inválidas.';

revoke all on function public.dashboard_zonas_v1(date, date, uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_zonas_v1(date, date, uuid[], uuid[]) to authenticated, service_role;

commit;
