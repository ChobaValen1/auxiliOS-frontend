-- Dashboard rediseñado · sección FACTURACIÓN.
--
-- Una sola RPC que devuelve TODO agregado del lado del servidor: los totales del
-- período, los mismos totales del período anterior de igual duración (para el
-- comparativo en %) y los cortes por empresa, por concepto y por base. El
-- frontend no trae filas crudas ni suma en JS.
--
-- Decisiones que conviene saber al leer los números:
--
--   * Monto facturado = operator_services.company_estimated_total, que es lo que
--     se le cobra a la prestadora (la columna "Precio Total" de la exportación de
--     Facturación). La recotización administrativa escribe esa misma columna, así
--     que acá no hace falta llamar a calculate_operator_service_billing_quote_v2
--     servicio por servicio — que además haría inviable un agregado.
--
--   * KM facturados = la suma asfalto + ripio cuando el servicio tiene el
--     desglose por terreno cargado, y estimated_distance_km cuando no. Es el km
--     que se factura, no el que midió Google (route_distance_meters).
--
--   * Se excluyen siempre los servicios de prueba (is_test, que el trigger de
--     asignación hereda de la prestadora, del chofer y del camión) y los
--     cancelados.
--
--   * La fecha del servicio se lee en hora argentina, como el resto del módulo de
--     Facturación: un servicio de las 22:00 no se va al día siguiente.
--
-- operator_services está vacía (el módulo arranca el 1/10). Con la tabla vacía la
-- función NO falla ni devuelve null: devuelve hay_datos=false, los totales en 0 y
-- los tres arrays vacíos, para que la UI pueda distinguir "todavía no hay
-- servicios cargados" de "el período cerró en cero".

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
      s.currency
    from public.operator_services s
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
      min(currency)                  filter (where tramo = 'actual')   as moneda
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
      'servicios', t.n_ant
    ),
    'por_empresa', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        g.id,
               'nombre',    g.nombre,
               'monto',     round(g.monto, 2),
               'servicios', g.servicios,
               'km',        round(g.km, 2))
             order by g.monto desc, g.servicios desc, g.nombre)
      from (
        select b.company_id                                            as id,
               coalesce(c.trade_name, c.legal_name, 'Sin prestadora')  as nombre,
               sum(b.monto) as monto, count(*) as servicios, sum(b.km) as km
        from base b
        left join public.companies c on c.company_id = b.company_id
        where b.tramo = 'actual'
        group by b.company_id, coalesce(c.trade_name, c.legal_name, 'Sin prestadora')
      ) g
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
    'por_base', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        g.id,
               'nombre',    g.nombre,
               'monto',     round(g.monto, 2),
               'servicios', g.servicios,
               'km',        round(g.km, 2))
             order by g.monto desc, g.servicios desc, g.nombre)
      from (
        -- billing_base_id es nullable: los servicios sin base van a "Sin base"
        -- en vez de desaparecer del desglose.
        select b.billing_base_id            as id,
               coalesce(bb.name, 'Sin base') as nombre,
               sum(b.monto) as monto, count(*) as servicios, sum(b.km) as km
        from base b
        left join public.billing_bases bb on bb.base_id = b.billing_base_id
        where b.tramo = 'actual'
        group by b.billing_base_id, coalesce(bb.name, 'Sin base')
      ) g
    ), '[]'::jsonb)
  )
  into v_out
  from tot t;

  return v_out;
end;
$function$;

comment on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) is
  'Métricas agregadas de la sección FACTURACIÓN del dashboard: totales del período, del período anterior de igual duración, y cortes por empresa, concepto y base. Excluye servicios de prueba y cancelados.';

revoke all on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) from public, anon;
grant execute on function public.dashboard_facturacion_v1(date, date, uuid[], uuid[], uuid[]) to authenticated, service_role;

commit;
