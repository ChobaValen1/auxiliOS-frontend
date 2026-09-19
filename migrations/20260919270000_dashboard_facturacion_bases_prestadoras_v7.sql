-- Facturación v7: por_base se da vuelta y muestra qué prestadoras atiende.
--
-- por_empresa (v6) y por_base son las dos direcciones del mismo cubo. Con
-- por_base como lista plana, la tabla de abajo se leía como una versión pobre
-- de la de arriba. Anidando al revés, cada una contesta algo que la otra no
-- puede:
--
--   por_empresa → cuánto me factura Addiuva, repartido en qué bases
--   por_base    → cuánto mueve Piñeyro en total, y para quiénes trabaja
--
-- El total por base es justo el dato que se pierde en la otra tabla: Piñeyro
-- mueve $593.920, que en por_empresa aparece partido en $364.680 bajo Addiuva
-- y $229.240 bajo Teleassitance, y habría que sumarlo a mano. Una base es un
-- lugar físico con camiones y gente: su carga total importa sin importar quién
-- la paga.

begin;




-- El dashboard barre por rango de fecha sobre el mismo subconjunto siempre.
-- El predicado del índice parcial está escrito igual que el WHERE de la función
-- (is_test = false, no = 'no es true') para que el planner lo pueda usar.
create index if not exists operator_services_facturacion_periodo_idx
  on public.operator_services (scheduled_for desc)
  where is_test = false and status <> 'cancelled';

create or replace function public.dashboard_facturacion_v1(
  p_desde date default null,
  p_hasta date default null,
  p_empresas uuid[] default null,
  p_bases uuid[] default null,
  p_conceptos uuid[] default null
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
  v_dias       integer;
  v_prev_desde date;
  v_prev_hasta date;
  v_out        jsonb;
begin
  -- Facturación la ven administración y facturación; supervisión lee todo.
  if v_role is null or v_role not in ('administracion', 'facturacion', 'supervision') then
    raise exception 'Sin permiso para ver las métricas de Facturación';
  end if;
  if v_desde > v_hasta then
    raise exception 'Período inválido: "desde" es posterior a "hasta"';
  end if;

  -- El período anterior tiene exactamente la misma cantidad de días y termina el
  -- día antes de que arranque el actual: si no, el comparativo compara peras con
  -- manzanas (un mes de 28 contra uno de 31).
  v_dias       := (v_hasta - v_desde) + 1;
  v_prev_hasta := v_desde - 1;
  v_prev_desde := v_desde - v_dias;

  with base as (
    select
      case
        when (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date >= v_desde
          then 'actual'
        else 'anterior'
      end as tramo,
      s.company_id,
      s.billing_base_id,
      s.primary_concept_id,
      coalesce(s.company_estimated_total, 0) as monto,
      coalesce(s.toll_total, 0)              as peajes,
      case
        when coalesce(s.estimated_asphalt_km, 0) + coalesce(s.estimated_gravel_km, 0) > 0
          then coalesce(s.estimated_asphalt_km, 0) + coalesce(s.estimated_gravel_km, 0)
        else coalesce(s.estimated_distance_km, 0)
      end as km,
      s.currency,
      -- Lo que informó el chofer en el remito. Null si no lo informó.
      case when coalesce(r.km_reales, 0) > 0 then r.km_reales end as km_chofer,
      -- El tramo Origen→Destino de la ruta que ya calculó Google al crear el
      -- servicio. Mide lo mismo que informa el chofer.
      case
        when jsonb_array_length(coalesce(s.route_legs, '[]'::jsonb)) = 3
          then round((s.route_legs -> 1 ->> 'distanceMeters')::numeric / 1000.0, 2)
        when jsonb_array_length(coalesce(s.route_legs, '[]'::jsonb)) = 1
             and s.destination_lat is not null and s.destination_lng is not null
          then round((s.route_legs -> 0 ->> 'distanceMeters')::numeric / 1000.0, 2)
      end as km_ruta,
      -- Lo medido manda sobre lo calculado.
      coalesce(
        case when coalesce(r.km_reales, 0) > 0 then r.km_reales end,
        case
          when jsonb_array_length(coalesce(s.route_legs, '[]'::jsonb)) = 3
            then round((s.route_legs -> 1 ->> 'distanceMeters')::numeric / 1000.0, 2)
          when jsonb_array_length(coalesce(s.route_legs, '[]'::jsonb)) = 1
               and s.destination_lat is not null and s.destination_lng is not null
            then round((s.route_legs -> 0 ->> 'distanceMeters')::numeric / 1000.0, 2)
        end
      ) as km_real
    from public.operator_services s
    left join public.remitos r on r.remito_id = s.remito_id
    where s.is_test = false
      and s.status <> 'cancelled'
      and (s.scheduled_for at time zone 'America/Argentina/Buenos_Aires')::date
            between v_prev_desde and v_hasta
      and (p_empresas  is null or cardinality(p_empresas)  = 0 or s.company_id         = any (p_empresas))
      and (p_bases     is null or cardinality(p_bases)     = 0 or s.billing_base_id    = any (p_bases))
      and (p_conceptos is null or cardinality(p_conceptos) = 0 or s.primary_concept_id = any (p_conceptos))
  ),
  tot as (
    select
      count(*)                       filter (where tramo = 'actual')   as n_act,
      coalesce(sum(monto)            filter (where tramo = 'actual'), 0)   as f_act,
      coalesce(sum(peajes)           filter (where tramo = 'actual'), 0)   as p_act,
      coalesce(sum(km)               filter (where tramo = 'actual'), 0)   as k_act,
      count(*)                       filter (where tramo = 'anterior') as n_ant,
      coalesce(sum(monto)            filter (where tramo = 'anterior'), 0) as f_ant,
      coalesce(sum(peajes)           filter (where tramo = 'anterior'), 0) as p_ant,
      coalesce(sum(km)               filter (where tramo = 'anterior'), 0) as k_ant,
      count(distinct currency)       filter (where tramo = 'actual')   as monedas,
      min(currency)                  filter (where tramo = 'actual')   as moneda,
      -- Km reales del período y del anterior, más sobre cuántos servicios están
      -- calculados. No se suman los facturados del mismo subconjunto porque ya
      -- no se dividen: ver el encabezado.
      coalesce(sum(km_real) filter (where tramo = 'actual' and km_real is not null), 0) as kr_act,
      count(*)              filter (where tramo = 'actual' and km_real is not null)     as n_comp_act,
      coalesce(sum(km_real) filter (where tramo = 'anterior' and km_real is not null), 0) as kr_ant,
      -- De dónde salió cada km real: medido por el chofer o calculado de la ruta.
      count(*) filter (where tramo = 'actual' and km_chofer is not null)                          as n_medido,
      count(*) filter (where tramo = 'actual' and km_chofer is null and km_ruta is not null)      as n_calculado
    from base
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'dias',  v_dias,
    'comparativo', jsonb_build_object('desde', v_prev_desde, 'hasta', v_prev_hasta),
    -- hay_datos separa "no hay servicios cargados" de "el período dio cero":
    -- sin esto la UI no puede saber si mostrar $0 o el estado vacío.
    'hay_datos',          t.n_act > 0,
    'hay_datos_anterior', t.n_ant > 0,
    -- null cuando el período mezcla monedas: sumar ARS con USD no daría un total.
    'moneda', case when t.monedas = 1 then t.moneda else null end,
    'totales', jsonb_build_object(
      'facturado', round(t.f_act, 2),
      'peajes',    round(t.p_act, 2),
      'km',        round(t.k_act, 2),
      'servicios', t.n_act
    ),
    'anterior', jsonb_build_object(
      'facturado', round(t.f_ant, 2),
      'peajes',    round(t.p_ant, 2),
      'km',        round(t.k_ant, 2),
      'km_reales', round(t.kr_ant, 2),
      'servicios', t.n_ant
    ),

    -- Bloque propio para que el front no tenga que saber sobre qué subconjunto
    -- están calculados los km reales: la cobertura viaja junto con el número.
    'reales', jsonb_build_object(
      'km_reales',           round(t.kr_act, 2),
      'servicios_con_dato',  t.n_comp_act,
      'servicios',           t.n_act,
      'medidos',             t.n_medido,
      'calculados',          t.n_calculado
    ),
    -- Prestadora con sus bases adentro. Se agrupa primero por (empresa, base) y
    -- después se pliega por empresa, así cada nivel suma exactamente lo mismo y
    -- la fila de la empresa no puede discrepar de sus hijas.
    'por_empresa', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        e.id,
               'nombre',    e.nombre,
               'monto',     round(e.monto, 2),
               'servicios', e.servicios,
               'km',        round(e.km, 2),
               'km_real',   round(e.km_real, 2),
               'km_comp',   round(e.km_comp, 2),
               'con_dato',  e.con_dato,
               'bases',     e.bases)
             order by e.monto desc, e.servicios desc, e.nombre)
      from (
        select g.company_id as id,
               g.nombre,
               sum(g.monto)     as monto,
               sum(g.servicios) as servicios,
               sum(g.km)        as km,
               sum(g.km_real)   as km_real,
               sum(g.km_comp)   as km_comp,
               sum(g.con_dato)  as con_dato,
               jsonb_agg(jsonb_build_object(
                 'id',        g.base_id,
                 'nombre',    g.base_nombre,
                 'monto',     round(g.monto, 2),
                 'servicios', g.servicios,
                 'km',        round(g.km, 2),
                 'km_real',   round(g.km_real, 2),
                 'km_comp',   round(g.km_comp, 2),
                 'con_dato',  g.con_dato)
                 order by g.monto desc, g.servicios desc, g.base_nombre) as bases
        from (
          select b.company_id,
                 coalesce(c.trade_name, c.legal_name, 'Sin prestadora') as nombre,
                 b.billing_base_id                                      as base_id,
                 coalesce(bb.name, 'Sin base')                          as base_nombre,
                 sum(b.monto)  as monto,
                 count(*)      as servicios,
                 sum(b.km)     as km,
                 -- Los reales, y los facturados DE ESOS MISMOS servicios.
                 coalesce(sum(b.km_real) filter (where b.km_real is not null), 0) as km_real,
                 coalesce(sum(b.km)      filter (where b.km_real is not null), 0) as km_comp,
                 count(*)                filter (where b.km_real is not null)     as con_dato
          from base b
          left join public.companies c     on c.company_id = b.company_id
          left join public.billing_bases bb on bb.base_id  = b.billing_base_id
          where b.tramo = 'actual'
          group by b.company_id,
                   coalesce(c.trade_name, c.legal_name, 'Sin prestadora'),
                   b.billing_base_id,
                   coalesce(bb.name, 'Sin base')
        ) g
        group by g.company_id, g.nombre
      ) e
    ), '[]'::jsonb),
    'por_concepto', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        g.id,
               'nombre',    g.nombre,
               'monto',     round(g.monto, 2),
               'servicios', g.servicios,
               'km',        round(g.km, 2))
             order by g.servicios desc, g.monto desc, g.nombre)
      from (
        select b.primary_concept_id           as id,
               coalesce(sc.name, 'Sin concepto') as nombre,
               sum(b.monto) as monto, count(*) as servicios, sum(b.km) as km
        from base b
        left join public.service_concepts sc on sc.concept_id = b.primary_concept_id
        where b.tramo = 'actual'
        group by b.primary_concept_id, coalesce(sc.name, 'Sin concepto')
      ) g
    ), '[]'::jsonb),
    -- La base con sus prestadoras adentro: el corte inverso a por_empresa.
    'por_base', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        b2.id,
               'nombre',    b2.nombre,
               'monto',     round(b2.monto, 2),
               'servicios', b2.servicios,
               'km',        round(b2.km, 2),
               'empresas',  b2.empresas)
             order by b2.monto desc, b2.servicios desc, b2.nombre)
      from (
        select g.base_id as id,
               g.base_nombre as nombre,
               sum(g.monto)     as monto,
               sum(g.servicios) as servicios,
               sum(g.km)        as km,
               jsonb_agg(jsonb_build_object(
                 'id',        g.company_id,
                 'nombre',    g.nombre,
                 'monto',     round(g.monto, 2),
                 'servicios', g.servicios,
                 'km',        round(g.km, 2))
                 order by g.monto desc, g.servicios desc, g.nombre) as empresas
        from (
          -- billing_base_id es nullable: los servicios sin base van a "Sin base"
          -- en vez de desaparecer del desglose.
          select b.company_id,
                 coalesce(c.trade_name, c.legal_name, 'Sin prestadora') as nombre,
                 b.billing_base_id                                      as base_id,
                 coalesce(bb.name, 'Sin base')                          as base_nombre,
                 sum(b.monto)  as monto,
                 count(*)      as servicios,
                 sum(b.km)     as km
          from base b
          left join public.companies c      on c.company_id = b.company_id
          left join public.billing_bases bb on bb.base_id   = b.billing_base_id
          where b.tramo = 'actual'
          group by b.company_id,
                   coalesce(c.trade_name, c.legal_name, 'Sin prestadora'),
                   b.billing_base_id,
                   coalesce(bb.name, 'Sin base')
        ) g
        group by g.base_id, g.base_nombre
      ) b2
    ), '[]'::jsonb),

    -- Con qué llenar los combos de prestadora y base. Se incluyen las inactivas
    -- que tengan servicios en el período: si no, un servicio quedaría filtrado
    -- por una opción que no existe en la lista.
    'catalogo', jsonb_build_object(
      'empresas', coalesce((
        select jsonb_agg(jsonb_build_object('id', c.company_id, 'nombre', c.nombre)
                         order by c.nombre)
        from (
          select co.company_id,
                 coalesce(nullif(btrim(co.trade_name), ''), co.legal_name, 'Sin nombre') as nombre
          from public.companies co
          where coalesce(co.is_test, false) = false
            and (coalesce(co.status, 'active') = 'active'
              or exists (select 1 from base b
                         where b.tramo = 'actual' and b.company_id = co.company_id))
        ) c
      ), '[]'::jsonb),
      'bases', coalesce((
        select jsonb_agg(jsonb_build_object('id', b2.base_id, 'nombre', b2.nombre)
                         order by b2.nombre)
        from (
          select bb.base_id,
                 coalesce(nullif(btrim(bb.name), ''), bb.base_code, 'Sin nombre') as nombre
          from public.billing_bases bb
          where coalesce(bb.is_active, true)
             or exists (select 1 from base b
                        where b.tramo = 'actual' and b.billing_base_id = bb.base_id)
        ) b2
      ), '[]'::jsonb)
    )
  )
  into v_out
  from tot t;

  return v_out;
end;
$function$;

comment on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) is
  'Métricas agregadas de la sección FACTURACIÓN del dashboard: totales del período, del período anterior de igual duración, cortes por empresa (con sus bases anidadas y los km reales de cada una), por base (con sus prestadoras anidadas: el corte inverso, que conserva el total de cada base, el dato que en por_empresa queda partido entre prestadoras) y por concepto, el catálogo de prestadoras y bases para los combos de filtro, y los KM reales —los que informó el chofer en el remito y, cuando no los informó, el tramo Origen→Destino de la ruta que Google ya calculó al crear el servicio— informando cuántos son medidos y cuántos calculados, y sobre cuántos servicios del período está el dato. NO publica una razón entre km facturados y km reales: los facturados salen del método de cobro (que puede incluir Base→Origen y Destino→Base) y la flota no sale de la base, así que esa razón mide la fórmula de facturación, no el rendimiento. El catálogo no se filtra por los filtros activos y sale de companies/billing_bases, así que funciona con operator_services vacía. Excluye servicios de prueba y cancelados.';

revoke all on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) to authenticated, service_role;

commit;
