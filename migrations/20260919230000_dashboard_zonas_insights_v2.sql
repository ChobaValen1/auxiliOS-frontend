-- Zonas v2: dos lecturas de la geografía, además del heatmap.
--
-- El mapa ya mostraba DÓNDE pasan las cosas. Lo que faltaba es qué hacer con eso:
--
--   1. Kilómetros muertos. Cada servicio tiene origen geocodificado y cada base
--      tiene coordenadas, así que se puede comparar la distancia a la base que lo
--      tomó contra la distancia a la más cercana. La diferencia es recorrido que
--      no hacía falta hacer, y como Operaciones ya sabe el costo de combustible
--      por km, se convierte en pesos sin salir del tablero.
--
--   2. Cobertura. Cuántos servicios caen a más de 80 km de toda base y en qué
--      celdas. Es la pregunta de dónde conviene la próxima base —o dónde conviene
--      un tercero en vez de una base propia.
--
-- Las distancias son EN LÍNEA RECTA y de ida. Subestiman el recorrido real, así
-- que los dos números son un piso, nunca un techo. Se eligió así a propósito:
-- calcular rutas reales serían miles de llamadas a Google por período, y para
-- decidir cuál base está más cerca la línea recta alcanza.
--
-- Sin PostGIS ni earthdistance en el proyecto, la distancia se calcula con
-- haversine en SQL puro.

begin;

create or replace function app_private.km_entre(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
) returns numeric
language sql
immutable
parallel safe
set search_path=''
as $function$
  select case
    when p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then null
    -- least(1, ...) evita que un redondeo en coma flotante meta un valor > 1 en
    -- asin() y tire un error de dominio en dos puntos casi idénticos.
    else round((6371 * 2 * asin(least(1, sqrt(
        power(sin(radians(p_lat2::double precision - p_lat1::double precision) / 2), 2)
      + cos(radians(p_lat1::double precision)) * cos(radians(p_lat2::double precision))
        * power(sin(radians(p_lng2::double precision - p_lng1::double precision) / 2), 2)
    ))))::numeric, 2)
  end
$function$;

revoke all on function app_private.km_entre(numeric, numeric, numeric, numeric) from public, anon;
grant execute on function app_private.km_entre(numeric, numeric, numeric, numeric) to authenticated, service_role;

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
  -- Radio a partir del cual un servicio se considera fuera del alcance cómodo
  -- de toda base. Viaja en el payload para que el front no repita el número.
  v_umbral numeric := 80;
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
      s.billing_base_id,
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
  ),
  -- Las bases que pueden atender: activas y con coordenadas cargadas. Una base
  -- sin geocodificar no puede ser "la más cercana" de nada.
  sede as (
    select bb.base_id,
           coalesce(nullif(btrim(bb.name), ''), bb.base_code, 'Sin nombre') as nombre,
           bb.latitude  as lat,
           bb.longitude as lng
    from public.billing_bases bb
    where coalesce(bb.is_active, true)
      and bb.latitude is not null
      and bb.longitude is not null
      and not (bb.latitude = 0 and bb.longitude = 0)
  ),
  -- Un servicio ubicable por fila, con la distancia a la base que lo tomó y a la
  -- más cercana de todas. La diferencia entre las dos es el kilómetro muerto.
  ubicado as (
    select
      b.billing_base_id,
      b.origin_lat,
      b.origin_lng,
      sa.nombre                                                        as base_asignada,
      app_private.km_entre(b.origin_lat, b.origin_lng, sa.lat, sa.lng)  as km_asignada,
      cer.base_id                                                      as cercana_id,
      cer.nombre                                                       as cercana,
      cer.km                                                           as km_cercana
    from base b
    left join sede sa on sa.base_id = b.billing_base_id
    left join lateral (
      select s2.base_id, s2.nombre,
             app_private.km_entre(b.origin_lat, b.origin_lng, s2.lat, s2.lng) as km
      from sede s2
      order by app_private.km_entre(b.origin_lat, b.origin_lng, s2.lat, s2.lng)
      limit 1
    ) cer on true
    where b.origin_lat is not null
      and b.origin_lng is not null
      and b.origin_lat between -90 and 90
      and b.origin_lng between -180 and 180
      and not (b.origin_lat = 0 and b.origin_lng = 0)
  ),
  -- Sólo los que se pueden juzgar: con base asignada geocodificada y con alguna
  -- base candidata. Los demás no son un hallazgo, son un dato faltante.
  juzgable as (
    select * from ubicado
    where km_asignada is not null and km_cercana is not null
  ),
  muerto as (
    select * from juzgable
    where cercana_id is distinct from billing_base_id
      and km_asignada > km_cercana
  ),
  lejano as (
    select round(origin_lat::numeric, 3) as lat,
           round(origin_lng::numeric, 3) as lng,
           count(*)                      as servicios,
           round(min(km_cercana), 1)     as km_a_base
    from ubicado
    where km_cercana is not null and km_cercana > v_umbral
    group by 1, 2
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
    ), '[]'::jsonb),

    -- Insight 1: kilómetros muertos. En línea recta y de ida, así que el número
    -- real es mayor: es el piso del desperdicio, no el techo.
    'kilometros_muertos', jsonb_build_object(
      'evaluados',     (select count(*) from juzgable),
      'mal_asignados', (select count(*) from muerto),
      'km_extra',      (select coalesce(round(sum(km_asignada - km_cercana), 1), 0) from muerto),
      'por_base', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'base',      g.base_asignada,
                 'cercana',   g.cercana,
                 'servicios', g.servicios,
                 'km_extra',  g.km_extra)
               order by g.km_extra desc, g.servicios desc)
        from (
          select base_asignada, cercana, count(*) as servicios,
                 round(sum(km_asignada - km_cercana), 1) as km_extra
          from muerto
          group by base_asignada, cercana
        ) g
      ), '[]'::jsonb)
    ),

    -- Insight 2: cobertura. Qué demanda cae lejos de toda base, y dónde.
    'cobertura', jsonb_build_object(
      'umbral_km', v_umbral,
      'evaluados', (select count(*) from ubicado where km_cercana is not null),
      'dentro',    (select count(*) from ubicado where km_cercana is not null and km_cercana <= v_umbral),
      'fuera',     (select count(*) from ubicado where km_cercana is not null and km_cercana >  v_umbral),
      'km_promedio_a_base',
        (select round(avg(km_cercana), 1) from ubicado where km_cercana is not null),
      'lejanos', coalesce((
        select jsonb_agg(jsonb_build_array(lng, lat, servicios, km_a_base)
               order by servicios desc, km_a_base desc)
        from lejano
      ), '[]'::jsonb)
    )
  )
  into v_out;

  return v_out;
end;
$function$;

comment on function public.dashboard_zonas_v1(date, date, uuid[], uuid[]) is
  'Puntos agregados para el heatmap del dashboard, corte por provincia, y dos lecturas de la geografía: kilómetros muertos (servicios que tomó una base que no era la más cercana, con el excedente en km) y cobertura (servicios que caen a más del umbral de toda base, con sus celdas para pintarlos). Las distancias son en línea recta y de ida, así que subestiman el recorrido real. Coordenadas redondeadas a 3 decimales (~110 m). Excluye servicios de prueba, cancelados y coordenadas inválidas.';

revoke all on function public.dashboard_zonas_v1(date, date, uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_zonas_v1(date, date, uuid[], uuid[]) to authenticated, service_role;

commit;
